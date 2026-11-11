-- Calendar changes are explicit, audited and independent from roll-call.
-- A missing list never creates an absence or a family notification.
create table public.school_calendar_days (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 day date not null,label text not null check(length(trim(label)) between 2 and 160),
 kind text not null check(kind in ('holiday','suspension','school_day')),
 country_code text not null default 'BO' check(country_code='BO'),
 source text not null default 'manual' check(source in ('manual','national')),
 source_url text not null default '' check(length(source_url)<=1000 and (source_url='' or source_url like 'https://%')),
 active boolean not null default true,revision integer not null default 1,
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(school_id,day)
);
create table public.school_calendar_announcements (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 calendar_id uuid not null references public.school_calendar_days(id),revision integer not null,
 announcement_id uuid not null unique references public.announcements(id) deferrable initially deferred,
 published_by uuid not null references auth.users(id),published_at timestamptz not null default now(),
 unique(calendar_id,revision)
);
create function aulanexo_private.calendar_reader(p_school uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and aulanexo_private.in_support_school(p_school) and (
  public.has_school_role(p_school,array['director','teacher','guardian']) or aulanexo_private.can_plan(p_school) or
  aulanexo_private.student_id_for_user(auth.uid(),p_school) is not null);
$$;
revoke all on function aulanexo_private.calendar_reader(uuid) from public,anon;
grant execute on function aulanexo_private.calendar_reader(uuid) to authenticated;
alter table public.school_calendar_days enable row level security;
alter table public.school_calendar_announcements enable row level security;
revoke all on public.school_calendar_days,public.school_calendar_announcements from public,anon,authenticated;
grant select on public.school_calendar_days,public.school_calendar_announcements to authenticated;
create policy calendar_read on public.school_calendar_days for select to authenticated using(aulanexo_private.calendar_reader(school_id));
create policy calendar_announcements_read on public.school_calendar_announcements for select to authenticated using(aulanexo_private.can_plan(school_id));
create policy support_school_scope on public.school_calendar_days as restrictive for all to authenticated using(aulanexo_private.in_support_school(school_id)) with check(aulanexo_private.in_support_school(school_id));
create policy support_school_scope on public.school_calendar_announcements as restrictive for all to authenticated using(aulanexo_private.in_support_school(school_id)) with check(aulanexo_private.in_support_school(school_id));
create function aulanexo_private.capture_calendar_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor text;context aulanexo_private.support_sessions:=aulanexo_private.support_context();
begin
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into actor from auth.users where id=auth.uid();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(new.school_id,auth.uid(),coalesce(actor,'Sistema'),'school_calendar_days',new.id,TG_OP,
 jsonb_strip_nulls(jsonb_build_object('name',new.label,'date',new.day,'revision',new.revision,'sourceUrl',new.source_url,
 'previous',case when TG_OP='UPDATE' then jsonb_build_object('label',old.label,'kind',old.kind,'active',old.active,'sourceUrl',old.source_url) end,
 'current',jsonb_build_object('label',new.label,'kind',new.kind,'active',new.active),'supportSessionId',context.id,'supportRole',context.role)));
 return new;
end $$;
revoke all on function aulanexo_private.capture_calendar_change() from public,anon,authenticated;
create trigger calendar_audit after insert or update on public.school_calendar_days for each row execute function aulanexo_private.capture_calendar_change();
create trigger calendar_changed after insert or update on public.school_calendar_days for each row execute function aulanexo_private.touch_workspace();
create trigger calendar_notice_audit after insert on public.school_calendar_announcements for each row execute function aulanexo_private.capture_audit();
create trigger calendar_notice_changed after insert on public.school_calendar_announcements for each row execute function aulanexo_private.touch_workspace();

create function public.school_calendar_workspace(p_school_id uuid,p_year integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not aulanexo_private.calendar_reader(p_school_id) then raise exception 'No tienes acceso al calendario de esta sede.';end if;
 if p_year is null or p_year not between 2020 and 2100 then raise exception 'Selecciona una gestión válida.';end if;
 return jsonb_build_object('canManage',aulanexo_private.can_plan(p_school_id),'canPublish',aulanexo_private.can_plan(p_school_id,true),
 'days',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'schoolId',c.school_id,'date',c.day,'label',c.label,'kind',c.kind,'source',c.source,'sourceUrl',c.source_url,'active',c.active,'revision',c.revision,
 'announcedRevision',coalesce((select max(n.revision) from public.school_calendar_announcements n where n.calendar_id=c.id),0)) order by c.day)
 from public.school_calendar_days c where c.school_id=p_school_id and extract(year from c.day)=p_year),'[]'));
end $$;

create function public.save_school_calendar_day(p_school_id uuid,p_values jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare old public.school_calendar_days;target date:=(p_values->>'date')::date;v_label text:=trim(p_values->>'label');v_kind text:=p_values->>'kind';v_active boolean:=coalesce((p_values->>'active')::boolean,true);url text:=coalesce(p_values->>'sourceUrl','');result uuid;
begin
 if not aulanexo_private.can_plan(p_school_id) then raise exception 'Solo Dirección o Secretaría autorizada puede actualizar el calendario.';end if;
 if target is null or extract(year from target) not between 2020 and 2100 or v_label is null or length(v_label) not between 2 and 160 or v_kind is null or v_kind not in ('holiday','suspension','school_day') or (url<>'' and url not like 'https://%') or length(url)>1000 then raise exception 'Revisa la fecha, el motivo y el tipo de día.';end if;
 perform pg_advisory_xact_lock(hashtext('school-calendar-'||p_school_id::text));
 select * into old from public.school_calendar_days where school_id=p_school_id and day=target for update;
 if old.id is not null then
  if (p_values->>'revision')::integer is distinct from old.revision then raise exception 'El calendario cambió. Actualiza antes de guardar.';end if;
  if (old.label,old.kind,old.active,old.source_url)=(v_label,v_kind,v_active,url) then return old.id;end if;
  update public.school_calendar_days set label=v_label,kind=v_kind,active=v_active,source='manual',source_url=url,revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=old.id;
  return old.id;
 end if;
 insert into public.school_calendar_days(school_id,day,label,kind,active,source_url,updated_by) values(p_school_id,target,v_label,v_kind,v_active,url,auth.uid()) returning id into result;
 return result;
end $$;

create function public.import_bolivia_holidays(p_school_id uuid,p_year integer,p_days jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;old public.school_calendar_days;target date;added integer:=0;skipped integer:=0;changed integer:=0;
begin
 if not aulanexo_private.can_plan(p_school_id) then raise exception 'Solo Dirección o Secretaría autorizada puede importar feriados.';end if;
 if p_year is null or p_year not between 2020 and 2100 or jsonb_typeof(p_days) is distinct from 'array' or jsonb_array_length(p_days) not between 1 and 40 then raise exception 'Selecciona los feriados nacionales que revisaste.';end if;
 if (select count(*)<>count(distinct value->>'date') from jsonb_array_elements(p_days)) then raise exception 'Hay fechas duplicadas en los feriados.';end if;
 perform pg_advisory_xact_lock(hashtext('school-calendar-'||p_school_id::text));
 for item in select value from jsonb_array_elements(p_days) loop
  target:=(item->>'date')::date;
  if item->>'countryCode' is distinct from 'BO' or target is null or extract(year from target)<>p_year or length(trim(coalesce(item->>'label',''))) not between 2 and 160
   or coalesce(item->>'sourceUrl','') not like 'https://%' or length(item->>'sourceUrl')>1000 then raise exception 'Solo se aceptan feriados nacionales de Bolivia de la gestión elegida.';end if;
  select * into old from public.school_calendar_days where school_id=p_school_id and day=target for update;
  if old.id is null then
   insert into public.school_calendar_days(school_id,day,label,kind,source,source_url,updated_by) values(p_school_id,target,trim(item->>'label'),'holiday','national',item->>'sourceUrl',auth.uid());added:=added+1;
  elsif old.source='manual' then skipped:=skipped+1;
  elsif old.label is distinct from trim(item->>'label') or old.source_url is distinct from item->>'sourceUrl' then
   update public.school_calendar_days set label=trim(item->>'label'),source_url=item->>'sourceUrl',revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=old.id;changed:=changed+1;
  end if;
 end loop;
 return jsonb_build_object('added',added,'updated',changed,'manualPreserved',skipped);
end $$;

-- Calendar notices are operational information for their verified recipients,
-- including families with debt. This does not unlock academic modules or force
-- acknowledgment. The link exists before notification triggers run.
alter function aulanexo_private.announcement_recipient_visible(uuid,uuid) rename to announcement_recipient_visible_before_calendar;
revoke all on function aulanexo_private.announcement_recipient_visible_before_calendar(uuid,uuid) from public,anon,authenticated;
create function aulanexo_private.announcement_recipient_visible(p_id uuid,p_user uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.school_calendar_announcements where announcement_id=p_id)
  and aulanexo_private.announcement_recipient(p_id,p_user) then return true;end if;
 return aulanexo_private.announcement_recipient_visible_before_calendar(p_id,p_user);
end $$;
revoke all on function aulanexo_private.announcement_recipient_visible(uuid,uuid) from public,anon,authenticated;

create function public.publish_school_calendar_notice(p_id uuid,p_revision integer,p_content text) returns uuid
language plpgsql security definer set search_path='' as $$
declare day public.school_calendar_days;existing uuid;notice uuid:=gen_random_uuid();
begin
 select * into day from public.school_calendar_days where id=p_id for update;
 if day.id is null or not aulanexo_private.can_plan(day.school_id,true) then raise exception 'Dirección debe autorizar la publicación de comunicados de Secretaría.';end if;
 if not day.active or p_revision is distinct from day.revision then raise exception 'Actualiza el calendario antes de publicar el comunicado.';end if;
 if length(trim(coalesce(p_content,''))) not between 10 and 10000 then raise exception 'Revisa el contenido del comunicado.';end if;
 select announcement_id into existing from public.school_calendar_announcements where calendar_id=p_id and revision=p_revision;
 if existing is not null then
  if exists(select 1 from public.announcements where id=existing and content=trim(p_content)) then return existing;end if;
  raise exception 'Esta versión ya tiene un comunicado publicado. Actualiza el día para publicar una nueva versión.';
 end if;
 insert into public.school_calendar_announcements(school_id,calendar_id,revision,announcement_id,published_by) values(day.school_id,day.id,day.revision,notice,auth.uid());
 insert into public.announcements(id,school_id,title,content,audience,created_by)
 values(notice,day.school_id,left(day.label||' · '||to_char(day.day,'DD/MM/YYYY'),200),trim(p_content),'all',aulanexo_private.actor_uid());
 return notice;
end $$;

create function aulanexo_private.calendar_class_day(p_room uuid,p_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare room public.classrooms;day public.school_calendar_days;scheduled boolean;
begin
 select * into room from public.classrooms where id=p_room;
 select * into day from public.school_calendar_days c where c.school_id=room.school_id and c.day=p_day and c.active;
 scheduled:=extract(isodow from p_day)::integer=any(coalesce(room.weekdays,array[1,2,3,4,5]));
 return jsonb_build_object('date',p_day,'isSchoolDay',case when day.id is not null then day.kind='school_day' else scheduled end,
 'kind',coalesce(day.kind,'schedule'),'label',coalesce(day.label,case when scheduled then 'Día de clases' else 'Sin clases según el horario del aula' end),'sourceUrl',coalesce(day.source_url,''));
end $$;
revoke all on function aulanexo_private.calendar_class_day(uuid,date) from public,anon,authenticated;

-- Reuse the existing, checked workspace; add calendar metadata without widening access.
alter function public.student_attendance_workspace(uuid,date,date,uuid) rename to attendance_workspace_before_calendar;
alter function public.attendance_workspace_before_calendar(uuid,date,date,uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.attendance_workspace_before_calendar(uuid,date,date,uuid) from public,anon,authenticated;
create function public.student_attendance_workspace(p_classroom_id uuid,p_day date,p_month date,p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;day jsonb;
begin
 result:=aulanexo_private.attendance_workspace_before_calendar(p_classroom_id,p_day,p_month,p_student_id);
 day:=aulanexo_private.calendar_class_day(p_classroom_id,p_day);
 return result||jsonb_build_object('roster',coalesce((select jsonb_agg(pupil.value||jsonb_build_object('first_name',s.first_name,'last_name',s.last_name)) from jsonb_array_elements(result->'roster') pupil(value) join public.students s on s.id=(pupil.value->>'student_id')::uuid),'[]'),'schoolDay',day,'canMark',coalesce((result->>'canMark')::boolean,false) and (day->>'isSchoolDay')::boolean and p_day<=(now() at time zone 'America/La_Paz')::date);
end $$;

create function public.student_attendance_week(p_classroom_id uuid,p_day date,p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare start_day date:=p_day-(extract(isodow from p_day)::integer-1);d date;base jsonb;pupil jsonb;entry jsonb;ids uuid[]:='{}';roster jsonb:='[]';days jsonb:='[]';records jsonb:='[]';first_name text;last_name text;
begin
 if p_day is null then raise exception 'Selecciona una semana válida.';end if;
 for i in 0..6 loop
  d:=start_day+i;
  base:=public.student_attendance_workspace(p_classroom_id,d,date_trunc('month',d)::date,p_student_id);
  if not coalesce((base->>'canManage')::boolean,false) then raise exception 'La hoja del curso está reservada al docente asignado y Dirección. La familia consulta únicamente su historial personal.';end if;
  for pupil in select value from jsonb_array_elements(base->'roster') loop
   if not ((pupil->>'student_id')::uuid=any(ids)) then
    roster:=roster||jsonb_build_array(pupil);
    ids:=array_append(ids,(pupil->>'student_id')::uuid);
   end if;
  end loop;
  for entry in select value from jsonb_array_elements(base->'records') where value->>'date'=d::text loop records:=records||jsonb_build_array(entry);end loop;
  days:=days||jsonb_build_array(base->'schoolDay'||jsonb_build_object('sessionStatus',base->'session'->>'status','studentIds',coalesce((select jsonb_agg(value->>'student_id') from jsonb_array_elements(base->'roster')),'[]')));
 end loop;
 return jsonb_build_object('start',start_day,'roster',roster,'days',days,'records',records);
end $$;

-- Serialize calendar edits with confirmation, and refuse marking a closed day.
do $$declare definition text;needle text:='perform pg_advisory_xact_lock(hashtext(''student-attendance-''||p_room::text||p_day::text));';begin
 definition:=pg_get_functiondef('aulanexo_private.attendance_save_checked(uuid,date,jsonb,integer,boolean,text,uuid,text)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Missing roll-call confirmation guard.';end if;
 execute replace(definition,needle,
 'perform pg_advisory_xact_lock_shared(hashtext(''school-calendar-''||school::text));
  if not (aulanexo_private.calendar_class_day(p_room,p_day)->>''isSchoolDay'')::boolean then
   raise exception ''Este día no tiene clases. No se registran faltas ni se envían avisos de ausencia.'';
  end if;
  '||needle);
end $$;

revoke all on function public.school_calendar_workspace(uuid,integer),public.save_school_calendar_day(uuid,jsonb),public.import_bolivia_holidays(uuid,integer,jsonb),public.publish_school_calendar_notice(uuid,integer,text),public.student_attendance_workspace(uuid,date,date,uuid),public.student_attendance_week(uuid,date,uuid) from public,anon;
grant execute on function public.school_calendar_workspace(uuid,integer),public.save_school_calendar_day(uuid,jsonb),public.import_bolivia_holidays(uuid,integer,jsonb),public.publish_school_calendar_notice(uuid,integer,text),public.student_attendance_workspace(uuid,date,date,uuid),public.student_attendance_week(uuid,date,uuid) to authenticated;
