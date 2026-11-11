-- The workspace mode changes presentation only; existing school permissions remain authoritative.
alter table public.schools add column workspace_mode text not null default 'auto'
  check (workspace_mode in ('auto','kinder','school'));

alter function public.save_school(jsonb) rename to save_school_before_kinder_mode;
alter function public.save_school_before_kinder_mode(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_school_before_kinder_mode(jsonb) from public,anon,authenticated,service_role;

create function public.save_school(p_school jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  -- The existing implementation authorizes the caller before validating identity fields.
  perform aulanexo_private.save_school_before_kinder_mode(p_school);
  if p_school ? 'workspace_mode' then
    if jsonb_typeof(p_school->'workspace_mode') is distinct from 'string'
      or p_school->>'workspace_mode' not in ('auto','kinder','school') then
      raise exception 'Elige Automático, Kínder o Colegio como modo de trabajo.';
    end if;
    update public.schools set workspace_mode=p_school->>'workspace_mode' where id=(p_school->>'id')::uuid;
  end if;
end $$;
revoke all on function public.save_school(jsonb) from public,anon;
grant execute on function public.save_school(jsonb) to authenticated;

-- Only the request fingerprint is retained, never another copy of children's care information.
create table aulanexo_private.care_batch_requests (
  id uuid primary key,
  school_id uuid not null references public.schools(id),
  classroom_id uuid not null references public.classrooms(id),
  actor_id uuid not null references auth.users(id),
  payload_hash bytea not null,
  saved integer not null check (saved between 1 and 200),
  created_at timestamptz not null default now()
);
revoke all on aulanexo_private.care_batch_requests from public,anon,authenticated,service_role;

create function public.save_care_batch(p_school_id uuid,p_classroom_id uuid,p_day date,p_request_id uuid,p_records jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  room public.classrooms;
  student public.students;
  receipt aulanexo_private.care_batch_requests;
  row_value jsonb;
  fingerprint bytea;
  saved_count integer;
begin
  if auth.uid() is null or public.is_platform_admin() or not aulanexo_private.in_support_school(p_school_id)
    or not public.platform_school_enabled(p_school_id) then
    raise exception 'Solo Dirección o el docente del aula puede registrar cuidados.';
  end if;
  select r.* into room from public.classrooms r join public.schools s on s.id=r.school_id
    where r.id=p_classroom_id and r.school_id=p_school_id and r.active and s.status='active';
  if room.id is null or not (public.school_director(p_school_id) or public.may_edit_classroom(p_school_id,room.id)) then
    raise exception 'Solo Dirección o el docente del aula puede registrar cuidados.';
  end if;
  if p_day is null or p_day>(now() at time zone 'America/La_Paz')::date then
    raise exception 'Selecciona un día actual o anterior.';
  end if;
  if p_request_id is null then raise exception 'No se pudo identificar este registro. Abre el formulario nuevamente.'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Selecciona los niños y revisa sus cuidados.'; end if;
  saved_count:=jsonb_array_length(p_records);
  if saved_count not between 1 and 200 then raise exception 'Selecciona entre 1 y 200 niños del aula.'; end if;
  fingerprint:=sha256(convert_to(jsonb_build_array(p_school_id,p_classroom_id,p_day,p_records,aulanexo_private.actor_uid(),(aulanexo_private.support_context()).id)::text,'UTF8'));
  perform pg_advisory_xact_lock(hashtext('micole-care-batch'),hashtext(p_request_id::text));
  select * into receipt from aulanexo_private.care_batch_requests where id=p_request_id;
  if receipt.id is not null then
    if receipt.actor_id is distinct from auth.uid() or receipt.payload_hash is distinct from fingerprint then
      raise exception 'Este registro ya fue procesado con otros datos. Revisa el resumen antes de crear otro.';
    end if;
    return jsonb_build_object('saved',receipt.saved);
  end if;

  -- Validate the envelope before casting identifiers or creating any individual record.
  for row_value in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(row_value) is distinct from 'object'
      or coalesce(row_value->>'student_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or coalesce(row_value->>'kind','') not in ('meal','rest','hygiene','mood')
      or exists(select 1 from jsonb_object_keys(row_value) k where k not in ('student_id','kind','occurred_at','ended_at','food','amount','hygiene','mood','note')) then
      raise exception 'Revisa los datos del cuidado; los incidentes se registran individualmente.';
    end if;
  end loop;
  if (select count(distinct value->>'student_id') from jsonb_array_elements(p_records))<>saved_count then
    raise exception 'Selecciona cada niño una sola vez en este registro.';
  end if;

  -- Sorted row locks prevent concurrent batches from locking the same children in opposite orders.
  for row_value in select value from jsonb_array_elements(p_records) order by value->>'student_id' loop
    select * into student from public.students where id=(row_value->>'student_id')::uuid for update;
    if student.id is null or student.school_id<>p_school_id or student.classroom_id<>room.id or student.status<>'active' then
      raise exception 'Selecciona únicamente niños activos que pertenezcan a esta aula.';
    end if;
    -- Reuse all existing care checks, credit gates, author attribution, audit and Realtime signals.
    perform public.save_care_record(row_value || jsonb_build_object('entry_date',p_day));
  end loop;
  insert into aulanexo_private.care_batch_requests(id,school_id,classroom_id,actor_id,payload_hash,saved)
    values(p_request_id,p_school_id,p_classroom_id,auth.uid(),fingerprint,saved_count);
  return jsonb_build_object('saved',saved_count);
end $$;
revoke all on function public.save_care_batch(uuid,uuid,date,uuid,jsonb) from public,anon;
grant execute on function public.save_care_batch(uuid,uuid,date,uuid,jsonb) to authenticated;
