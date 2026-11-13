-- Official identity belongs to the institution, not to a duplicated annual form.
alter table public.schools add column official_info jsonb not null default '{}'
  check (jsonb_typeof(official_info)='object' and octet_length(official_info::text)<=6000);

-- Preserve the latest existing information without changing historical profiles.
update public.schools s set official_info=jsonb_build_object(
  'unitCode',p.unit_code,'district',p.district,'department',p.department,
  'authorizationReference',p.authorization_reference,'educationReference',p.reference,'educationReferenceUrl',p.reference_url)
from (select distinct on (school_id) * from public.bolivia_school_profiles order by school_id,updated_at desc,id) p
where p.school_id=s.id;

alter function public.save_school(jsonb) rename to save_school_before_official_info;
alter function public.save_school_before_official_info(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_school_before_official_info(jsonb) from public,anon,authenticated,service_role;
create function public.save_school(p_school jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare info jsonb:=p_school->'official_info';item record;begin
  -- The existing role, support, identity and level checks remain authoritative.
  perform aulanexo_private.save_school_before_official_info(p_school);
  if p_school ? 'official_info' then
    if jsonb_typeof(info) is distinct from 'object' or octet_length(info::text)>6000 then raise exception 'Revisa los datos oficiales de la institución.';end if;
    for item in select key,value from jsonb_each(info) loop
      if item.key not in ('unitCode','district','department','authorizationReference','educationReference','educationReferenceUrl')
        or jsonb_typeof(item.value) is distinct from 'string'
        or length(item.value#>>'{}')>(case when item.key='educationReferenceUrl' then 2048 when item.key='educationReference' then 500 else 160 end) then
        raise exception 'Revisa los datos oficiales de la institución.';
      end if;
    end loop;
    if coalesce(info->>'educationReferenceUrl','')<>'' and (info->>'educationReferenceUrl' !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$') then raise exception 'La referencia normativa debe usar un enlace HTTPS válido.';end if;
    update public.schools set official_info=info where id=(p_school->>'id')::uuid;
  end if;
end $$;
revoke all on function public.save_school(jsonb) from public,anon;
grant execute on function public.save_school(jsonb) to authenticated;

-- One explicit, institutional period; keep previously configured dates intact.
create function public.add_school_calendar_period(p_school_id uuid,p_from date,p_to date,p_values jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare added integer;total integer;v_label text:=trim(p_values->>'label');v_kind text:=p_values->>'kind';url text:=coalesce(p_values->>'sourceUrl','');begin
  if not aulanexo_private.can_plan(p_school_id) then raise exception 'Solo Dirección o Secretaría autorizada puede actualizar el calendario.';end if;
  if p_from is null or p_to is null or p_to<p_from or p_to-p_from>119
    or extract(year from p_from) not between 2020 and 2100 or extract(year from p_to)<>extract(year from p_from)
    or v_label is null or length(v_label) not between 2 and 160 or v_kind is null or v_kind not in ('holiday','suspension','school_day')
    or length(url)>1000 or (url<>'' and url not like 'https://%') then raise exception 'Revisa el período, el motivo y el tipo de día. Usa hasta 120 días de la misma gestión.';end if;
  perform pg_advisory_xact_lock(hashtext('school-calendar-'||p_school_id::text));
  insert into public.school_calendar_days(school_id,day,label,kind,active,source_url,updated_by)
    select p_school_id,p_from+n,v_label,v_kind,coalesce((p_values->>'active')::boolean,true),url,auth.uid()
    from generate_series(0,p_to-p_from) n on conflict(school_id,day) do nothing;
  get diagnostics added = row_count;
  total:=p_to-p_from+1;
  return jsonb_build_object('added',added,'preserved',total-added,'institutionWide',true);
end $$;
revoke all on function public.add_school_calendar_period(uuid,date,date,jsonb) from public,anon;
grant execute on function public.add_school_calendar_period(uuid,date,date,jsonb) to authenticated;

-- One synchronization signal per calendar batch; keep individual audit entries.
drop trigger calendar_changed on public.school_calendar_days;
create function aulanexo_private.calendar_batch_signal() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.workspace_signals(school_id,changed_table)
  select distinct school_id,'school_calendar_days' from new_calendar_days
  on conflict(school_id) do update set revision=public.workspace_signals.revision+1,changed_table='school_calendar_days',changed_at=now();
  return null;
end $$;
revoke all on function aulanexo_private.calendar_batch_signal() from public,anon,authenticated,service_role;
create trigger calendar_insert_signal after insert on public.school_calendar_days referencing new table as new_calendar_days for each statement execute function aulanexo_private.calendar_batch_signal();
create trigger calendar_changed after update on public.school_calendar_days for each row execute function aulanexo_private.touch_workspace();
