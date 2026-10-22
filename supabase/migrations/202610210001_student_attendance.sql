-- Explicit roll-call: no absence is inferred from an unfinished or missing register.
create table public.student_attendance_sessions (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),classroom_id uuid not null,
 attendance_date date not null,status text not null default 'draft' check(status in ('draft','confirmed')),
 revision integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),
 confirmed_at timestamptz,updated_at timestamptz not null default now(),
 unique(classroom_id,attendance_date),unique(id,school_id),foreign key(classroom_id,school_id) references public.classrooms(id,school_id)
);
create table public.student_attendance_records (
 id uuid primary key default gen_random_uuid(),school_id uuid not null,session_id uuid not null,student_id uuid not null,
 student_name text not null,status text check(status in ('present','absent','late','excused')),note text not null default '' check(length(note)<=1000),
 absent_notified_at timestamptz,corrected_notified_at timestamptz,updated_at timestamptz not null default now(),
 unique(session_id,student_id),foreign key(session_id,school_id) references public.student_attendance_sessions(id,school_id),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
create index student_attendance_history on public.student_attendance_records(student_id,session_id);
create table public.student_attendance_changes (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),session_id uuid not null references public.student_attendance_sessions(id),
 actor_id uuid not null references auth.users(id),reason text not null,previous jsonb not null,created_at timestamptz not null default now()
);
create function public.may_manage_student_attendance(p_school uuid,p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and aulanexo_private.in_support_school(p_school)
 and public.platform_school_enabled(p_school) and public.may_edit_classroom(p_school,p_room)
 and exists(select 1 from public.classrooms r join public.schools s on s.id=r.school_id where r.id=p_room and r.school_id=p_school and s.status='active');
$$;
create function aulanexo_private.attendance_roster(p_room uuid,p_day date) returns table(student_id uuid,student_name text) language sql stable security definer set search_path='' as $$
 select distinct on (student_id) student_id,student_name from (select h.student_id,h.student_name,1 as priority from public.enrollment_history h
 where h.classroom_id=p_room and h.started_on<=p_day and (h.ended_on is null or h.ended_on>=p_day)
 union all select r.student_id,r.student_name,0 as priority from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id where s.classroom_id=p_room and s.attendance_date=p_day) roster order by student_id,priority;
$$;
revoke all on function aulanexo_private.attendance_roster(uuid,date) from public,anon,authenticated;
revoke all on function public.may_manage_student_attendance(uuid,uuid) from public,anon;
grant execute on function public.may_manage_student_attendance(uuid,uuid) to authenticated;

alter table public.student_attendance_sessions enable row level security;
alter table public.student_attendance_records enable row level security;
alter table public.student_attendance_changes enable row level security;
revoke all on public.student_attendance_sessions,public.student_attendance_records,public.student_attendance_changes from public,anon,authenticated;
grant select on public.student_attendance_sessions,public.student_attendance_records,public.student_attendance_changes to authenticated;
create policy student_attendance_sessions_read on public.student_attendance_sessions for select to authenticated using(public.may_manage_student_attendance(school_id,classroom_id));
create policy student_attendance_records_read on public.student_attendance_records for select to authenticated using(exists(select 1 from public.student_attendance_sessions s where s.id=session_id and public.may_manage_student_attendance(s.school_id,s.classroom_id)));
create policy student_attendance_changes_read on public.student_attendance_changes for select to authenticated using(exists(select 1 from public.student_attendance_sessions s where s.id=session_id and public.may_manage_student_attendance(s.school_id,s.classroom_id)));
-- Family access goes through the RPC to exclude drafts, peers and internal correction reasons.
create function public.student_attendance_workspace(p_classroom_id uuid,p_day date,p_month date,p_student_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare room public.classrooms;manager boolean;begin
 select * into room from public.classrooms where id=p_classroom_id;
 manager:=public.may_manage_student_attendance(room.school_id,room.id);
 if room.id is null or p_day is null or p_month is null or extract(day from p_month)<>1 then raise exception 'Selecciona aula, fecha y mes.';end if;
 if not manager and (p_student_id is null or not public.is_verified_guardian(p_student_id) or not exists(select 1 from public.students where id=p_student_id and school_id=room.school_id) or not aulanexo_private.in_support_school(room.school_id)) then raise exception 'No tienes acceso a esta asistencia.';end if;
 return jsonb_build_object('canManage',manager,
 'session',case when manager then (select to_jsonb(s) from public.student_attendance_sessions s where s.classroom_id=room.id and attendance_date=p_day) else null end,
 'roster',case when manager then coalesce((select jsonb_agg(to_jsonb(r) order by student_name) from aulanexo_private.attendance_roster(room.id,p_day) r),'[]'::jsonb) else '[]'::jsonb end,
 'records',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'studentId',r.student_id,'studentName',r.student_name,'date',s.attendance_date,'status',r.status,'note',r.note,'sessionId',s.id,'confirmed',s.status='confirmed','revision',s.revision) order by s.attendance_date desc,r.student_name)
 from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id
 where s.school_id=room.school_id and s.attendance_date>=p_month and s.attendance_date<(p_month+interval '1 month')::date
 and (manager and s.classroom_id=room.id or not manager and r.student_id=p_student_id and s.status='confirmed')),'[]'::jsonb));
end $$;

create function public.save_student_attendance(p_classroom_id uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean default false,p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare room public.classrooms;session public.student_attendance_sessions;item jsonb;entry public.student_attendance_records;recipient uuid;notice_kind text;sent integer:=0;added integer;old jsonb;begin
 select * into room from public.classrooms where id=p_classroom_id;
 if not public.may_manage_student_attendance(room.school_id,room.id) then raise exception 'Solo Dirección o los docentes asignados pueden pasar lista en esta aula.';end if;
 if p_day is null or p_day>(now() at time zone 'America/La_Paz')::date or p_day<(now() at time zone 'America/La_Paz')::date-366 then raise exception 'La asistencia debe ser de hoy o de los últimos 366 días.';end if;
 if not exists(select 1 from public.academic_years y where y.school_id=room.school_id and y.year=room.academic_year and y.status='open') then raise exception 'La gestión está cerrada.';end if;
 if p_confirm is null or p_revision is null or p_revision<0 or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>400 or p_reason is null or length(p_reason)>1000 then raise exception 'Revisa los datos de la lista.';end if;
 perform pg_advisory_xact_lock(hashtext('student-attendance-'||room.id::text||p_day::text));
 select * into session from public.student_attendance_sessions where classroom_id=room.id and attendance_date=p_day for update;
 if coalesce(session.revision,0)<>p_revision then raise exception 'Otra persona actualizó la lista. Recarga antes de guardar; conserva tus cambios para compararlos.';end if;
 if session.status='confirmed' and (not p_confirm or length(trim(p_reason))<5) then raise exception 'Para corregir una lista confirmada indica un motivo de al menos 5 caracteres y vuelve a confirmar.';end if;
 if not exists(select 1 from aulanexo_private.attendance_roster(room.id,p_day)) then raise exception 'No hay estudiantes inscritos para esta fecha.';end if;
 if (select count(*)<>count(distinct value->>'studentId') from jsonb_array_elements(p_records)) or exists(select 1 from jsonb_array_elements(p_records) e where not exists(select 1 from aulanexo_private.attendance_roster(room.id,p_day) r where r.student_id::text=e->>'studentId') or coalesce(e->>'status','') not in ('','present','absent','late','excused') or length(coalesce(e->>'note',''))>1000) then raise exception 'La lista contiene estudiantes o estados inválidos.';end if;
 if (select count(*) from aulanexo_private.attendance_roster(room.id,p_day))<>jsonb_array_length(p_records) then raise exception 'La matrícula cambió. Recarga la lista antes de guardar.';end if;
 if p_confirm and exists(select 1 from jsonb_array_elements(p_records) e where coalesce(e->>'status','')='') then raise exception 'Marca a cada estudiante antes de confirmar. Sin marcar no significa falta.';end if;
 if session.id is null then
  insert into public.student_attendance_sessions(school_id,classroom_id,attendance_date,created_by,updated_by) values(room.school_id,room.id,p_day,auth.uid(),auth.uid()) returning * into session;
 else
  select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into old from public.student_attendance_records r where r.session_id=session.id;
  if session.status='confirmed' then insert into public.student_attendance_changes(school_id,session_id,actor_id,reason,previous) values(room.school_id,session.id,auth.uid(),trim(p_reason),jsonb_build_object('session',to_jsonb(session),'records',old));end if;
  update public.student_attendance_sessions set revision=revision+1,updated_by=auth.uid(),updated_at=now() where id=session.id returning * into session;
 end if;
 for item in select value from jsonb_array_elements(p_records) loop
  insert into public.student_attendance_records as r(school_id,session_id,student_id,student_name,status,note)
  select room.school_id,session.id,roster.student_id,roster.student_name,nullif(item->>'status',''),trim(coalesce(item->>'note','')) from aulanexo_private.attendance_roster(room.id,p_day) roster where roster.student_id=(item->>'studentId')::uuid
  on conflict(session_id,student_id) do update set status=excluded.status,note=excluded.note,updated_at=now();
 end loop;
 if p_confirm then
  update public.student_attendance_sessions set status='confirmed',confirmed_at=coalesce(confirmed_at,now()) where id=session.id;
  for entry in select * from public.student_attendance_records where session_id=session.id loop
   notice_kind:=case when entry.status='absent' then 'attendance_absent' when entry.status<>'absent' and entry.absent_notified_at is not null and entry.corrected_notified_at is null then 'attendance_corrected' end;
   if notice_kind is null then continue;end if;
   for recipient in select distinct g.user_id from public.student_guardians g join auth.users u on u.id=g.user_id where g.student_id=entry.student_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null loop
    insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
    values(recipient,room.school_id,entry.student_id,room.id,notice_kind,entry.id,case when notice_kind='attendance_absent' then 'Falta registrada' else 'Asistencia corregida' end,
    entry.student_name||case when notice_kind='attendance_absent' then ' tiene una falta registrada el ' else ' tiene una corrección de asistencia del ' end||to_char(p_day,'DD/MM/YYYY')||'. Revisa el detalle o comunícate con su docente.','studentAttendance') on conflict(user_id,kind,source_id) do nothing;
    get diagnostics added=row_count;sent:=sent+added;
   end loop;
   if exists(select 1 from public.notifications where source_id=entry.id and kind=notice_kind) then
    if notice_kind='attendance_absent' then update public.student_attendance_records set absent_notified_at=coalesce(absent_notified_at,now()) where id=entry.id;else update public.student_attendance_records set corrected_notified_at=coalesce(corrected_notified_at,now()) where id=entry.id;end if;
   end if;
  end loop;
 end if;
 return jsonb_build_object('id',session.id,'revision',session.revision,'confirmed',p_confirm,'notifications',sent);
end $$;
revoke all on function public.student_attendance_workspace(uuid,date,date,uuid),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text) from public,anon;
grant execute on function public.student_attendance_workspace(uuid,date,date,uuid),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text) to authenticated;

create policy notifications_attendance on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and kind in ('attendance_absent','attendance_corrected') and public.is_verified_guardian(student_id));
alter function aulanexo_private.push_notice_visible(uuid) rename to push_notice_visible_before_attendance;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;r public.student_attendance_records;s public.student_attendance_sessions;begin
 select * into n from public.notifications where id=p_id;
 if n.kind not in ('attendance_absent','attendance_corrected') then return aulanexo_private.push_notice_visible_before_attendance(p_id);end if;
 select * into r from public.student_attendance_records where id=n.source_id;select * into s from public.student_attendance_sessions where id=r.session_id;
 return n.read_at is null and n.created_at>now()-interval '48 hours' and s.status='confirmed' and r.student_id=n.student_id and s.school_id=n.school_id
 and (n.kind='attendance_absent' and r.status='absent' or n.kind='attendance_corrected' and r.status<>'absent')
 and exists(select 1 from public.student_guardians g join auth.users u on u.id=g.user_id where g.student_id=r.student_id and g.user_id=n.user_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null and exists(select 1 from public.school_memberships m where m.school_id=n.school_id and m.user_id=n.user_id and m.role='guardian' and m.active) and exists(select 1 from public.schools where id=n.school_id and status='active'));
end $$;
revoke all on function aulanexo_private.push_notice_visible(uuid),aulanexo_private.push_notice_visible_before_attendance(uuid) from public,anon,authenticated;
-- Retain existing push classification and quiet hours; use a recognizable attendance presentation.
create function aulanexo_private.classify_attendance_notification() returns trigger language plpgsql set search_path='' as $$begin
 if new.kind in ('attendance_absent','attendance_corrected') then new.alert_type:='attendance';end if;return new;end $$;
create trigger zz_attendance_presentation before insert on public.notifications for each row execute function aulanexo_private.classify_attendance_notification();
revoke all on function aulanexo_private.classify_attendance_notification() from public,anon,authenticated;
create trigger workspace_changed after insert or update or delete on public.student_attendance_sessions for each row execute function aulanexo_private.touch_workspace();
create trigger audit_student_attendance after insert or update on public.student_attendance_sessions for each row execute function aulanexo_private.capture_audit();
