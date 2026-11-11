-- Teachers own roll-call. Directors can inspect but cannot mark or correct it.
create function public.may_mark_student_attendance(p_school uuid,p_room uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.may_manage_student_attendance(p_school,p_room)
 and public.has_school_role(p_school,array['teacher']) and exists(
 select 1 from public.teachers t join public.teacher_classrooms tc on tc.teacher_id=t.id and tc.school_id=t.school_id
 where t.school_id=p_school and tc.classroom_id=p_room and t.status='active'
 and aulanexo_private.teacher_actor_matches(t.id,t.user_id));
$$;
revoke all on function public.may_mark_student_attendance(uuid,uuid) from public,anon;
grant execute on function public.may_mark_student_attendance(uuid,uuid) to authenticated;

create function aulanexo_private.attendance_permissions(p_room uuid,p_day date) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'studentId',f.student_id,'studentName',r.student_name,
 'date',f.request_date,'reason',f.reason,'status',f.status,'response',f.response) order by f.created_at,f.id),'[]'::jsonb)
 from public.family_requests f join aulanexo_private.attendance_roster(p_room,p_day) r on r.student_id=f.student_id
 where f.type='absence' and f.request_date=p_day;
$$;
revoke all on function aulanexo_private.attendance_permissions(uuid,date) from public,anon,authenticated;

-- The shared lock prevents a concurrent family request/decision from slipping past confirmation.
create function aulanexo_private.lock_attendance_permission() returns trigger
language plpgsql security definer set search_path='' as $$
declare room uuid;begin
 if new.type='absence' then
  select classroom_id into room from public.students where id=new.student_id;
  perform pg_advisory_xact_lock(hashtext('student-attendance-'||room::text||new.request_date::text));
 end if;
 return new;
end $$;
create trigger attendance_permission_lock before insert or update on public.family_requests
for each row execute function aulanexo_private.lock_attendance_permission();
revoke all on function aulanexo_private.lock_attendance_permission() from public,anon,authenticated;

alter function public.student_attendance_workspace(uuid,date,date,uuid) rename to attendance_workspace_before_teacher_permissions;
alter function public.attendance_workspace_before_teacher_permissions(uuid,date,date,uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.attendance_workspace_before_teacher_permissions(uuid,date,date,uuid) from public,anon,authenticated;
create function public.student_attendance_workspace(p_classroom_id uuid,p_day date,p_month date,p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;permissions jsonb;marker boolean;school uuid;begin
 result:=aulanexo_private.attendance_workspace_before_teacher_permissions(p_classroom_id,p_day,p_month,p_student_id);
 select school_id into school from public.classrooms where id=p_classroom_id;
 marker:=public.may_mark_student_attendance(school,p_classroom_id);
 permissions:=case when (result->>'canManage')::boolean then aulanexo_private.attendance_permissions(p_classroom_id,p_day) else '[]'::jsonb end;
 return result||jsonb_build_object('canMark',marker,'canCorrect',marker,'canReview',false,
 'permissions',permissions,'permissionRevision',md5(permissions::text));
end $$;
revoke all on function public.student_attendance_workspace(uuid,date,date,uuid) from public,anon;
grant execute on function public.student_attendance_workspace(uuid,date,date,uuid) to authenticated;

-- Preserve confirmed-row immutability and existing submission idempotency behind checked wrappers.
alter function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text) rename to attendance_save_original;
alter function public.attendance_save_original(uuid,date,jsonb,integer,boolean,text) set schema aulanexo_private;
alter function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid) rename to attendance_save_submission;
alter function public.attendance_save_submission(uuid,date,jsonb,integer,boolean,text,uuid) set schema aulanexo_private;
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.attendance_save_submission(uuid,date,jsonb,integer,boolean,text,uuid)'::regprocedure);
 if position('public.save_student_attendance(' in definition)=0 then raise exception 'No se encontró el guardado original de asistencia.';end if;
 execute replace(definition,'public.save_student_attendance(','aulanexo_private.attendance_save_original(');
end $$;
revoke all on function aulanexo_private.attendance_save_original(uuid,date,jsonb,integer,boolean,text),aulanexo_private.attendance_save_submission(uuid,date,jsonb,integer,boolean,text,uuid) from public,anon,authenticated;

create function aulanexo_private.attendance_save_checked(p_room uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean,p_reason text,p_request uuid,p_permissions text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare school uuid;permissions jsonb;begin
 select school_id into school from public.classrooms where id=p_room;
 if not public.may_mark_student_attendance(school,p_room) then raise exception 'Solo los docentes asignados pueden pasar lista en esta aula. Dirección tiene acceso de consulta.';end if;
 perform pg_advisory_xact_lock(hashtext('student-attendance-'||p_room::text||p_day::text));
 if p_confirm then
  permissions:=aulanexo_private.attendance_permissions(p_room,p_day);
  if jsonb_array_length(permissions)>0 and p_permissions is null or p_permissions is not null and p_permissions<>md5(permissions::text) then
   raise exception 'Los permisos de la familia cambiaron. Actualiza y revísalos antes de confirmar la lista.';
  end if;
  if exists(select 1 from jsonb_array_elements(permissions) f where f->>'status'='pending') then
   raise exception 'Hay pedidos de permiso pendientes. Acéptalos o recházalos con una respuesta antes de confirmar la lista.';
  end if;
  if exists(select 1 from jsonb_array_elements(permissions) f join jsonb_array_elements(p_records) r on r->>'studentId'=f->>'studentId'
   where f->>'status'='approved' and r->>'status'='absent') then
   raise exception 'Un estudiante tiene permiso aceptado. Usa Con permiso, o registra su presencia real; no lo marques como falta.';
  end if;
 end if;
 if p_request is null then return aulanexo_private.attendance_save_original(p_room,p_day,p_records,p_revision,p_confirm,p_reason);end if;
 return aulanexo_private.attendance_save_submission(p_room,p_day,p_records,p_revision,p_confirm,p_reason,p_request);
end $$;
revoke all on function aulanexo_private.attendance_save_checked(uuid,date,jsonb,integer,boolean,text,uuid,text) from public,anon,authenticated;
create function public.save_student_attendance(p_classroom_id uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean default false,p_reason text default '') returns jsonb
language sql security definer set search_path='' as $$select aulanexo_private.attendance_save_checked(p_classroom_id,p_day,p_records,p_revision,p_confirm,p_reason,null,null)$$;
create function public.save_student_attendance(p_classroom_id uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean,p_reason text,p_request_id uuid) returns jsonb
language sql security definer set search_path='' as $$select aulanexo_private.attendance_save_checked(p_classroom_id,p_day,p_records,p_revision,p_confirm,p_reason,p_request_id,null)$$;
create function public.save_student_attendance(p_classroom_id uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean,p_reason text,p_request_id uuid,p_permission_revision text) returns jsonb
language sql security definer set search_path='' as $$select aulanexo_private.attendance_save_checked(p_classroom_id,p_day,p_records,p_revision,p_confirm,p_reason,p_request_id,p_permission_revision)$$;
revoke all on function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid,text) from public,anon;
grant execute on function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid),public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid,text) to authenticated;

create function public.review_attendance_permission(p_id uuid,p_approve boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.family_requests;room uuid;begin
 select * into f from public.family_requests where id=p_id;
 select classroom_id into room from public.students where id=f.student_id;
 if f.id is null or f.type<>'absence' or not public.may_mark_student_attendance(f.school_id,room) then raise exception 'Solo el docente asignado puede revisar este pedido desde asistencia.';end if;
 if p_approve is null or length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Escribe una respuesta para la familia de 5 a 1000 caracteres.';end if;
 perform pg_advisory_xact_lock(hashtext('student-attendance-'||room::text||f.request_date::text));
 select * into f from public.family_requests where id=p_id for update;
 if f.status<>'pending' then
  if f.status=(case when p_approve then 'approved' else 'rejected' end) and f.response=trim(p_note) then return;end if;
  raise exception 'El pedido ya fue revisado. Actualiza la lista.';
 end if;
 update public.family_requests set status=case when p_approve then 'approved' else 'rejected' end,response=trim(p_note) where id=f.id;
end $$;
revoke all on function public.review_attendance_permission(uuid,boolean,text) from public,anon;
grant execute on function public.review_attendance_permission(uuid,boolean,text) to authenticated;

-- A justification appends a new effective result. It never rewrites the confirmed original.
create or replace function public.request_attendance_correction(p_id uuid,p_record_id uuid,p_status text,p_note text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.student_attendance_records;s public.student_attendance_sessions;effective jsonb;old public.student_attendance_corrections;recipient uuid;begin
 select * into r from public.student_attendance_records where id=p_record_id for update;
 select * into s from public.student_attendance_sessions where id=r.session_id;
 if r.id is null or not public.may_mark_student_attendance(s.school_id,s.classroom_id) then raise exception 'Solo el docente asignado puede corregir con justificativo. Dirección tiene acceso de consulta.';end if;
 select * into old from public.student_attendance_corrections where id=p_id;
 if old.id is not null then
  if old.requested_by=auth.uid() and old.record_id=p_record_id and old.proposed_status=p_status and old.proposed_note=trim(coalesce(p_note,'')) and old.reason=trim(p_reason) then return old.id;end if;
  raise exception 'La corrección ya existe con otros datos.';
 end if;
 if s.status<>'confirmed' then raise exception 'Solo puedes corregir una lista confirmada.';end if;
 if not exists(select 1 from public.classrooms c join public.academic_years y on y.school_id=c.school_id and y.year=c.academic_year where c.id=s.classroom_id and y.status='open') then raise exception 'La gestión está cerrada.';end if;
 if p_id is null or p_status is null or p_status not in ('present','absent','late','excused') or length(trim(coalesce(p_reason,''))) not between 5 and 1000 or length(coalesce(p_note,''))>1000 then raise exception 'Indica estado y justificativo de la corrección.';end if;
 effective:=aulanexo_private.attendance_effective(r.id);
 if effective->>'status'=p_status and effective->>'note'=trim(coalesce(p_note,'')) then raise exception 'La corrección no cambia el registro.';end if;
 insert into public.student_attendance_corrections(id,school_id,record_id,base_correction_id,previous_status,previous_note,proposed_status,proposed_note,reason,status,requested_by,reviewed_by,reviewed_at,review_note)
 values(p_id,s.school_id,r.id,(effective->>'correctionId')::uuid,effective->>'status',effective->>'note',p_status,trim(coalesce(p_note,'')),trim(p_reason),'approved',auth.uid(),auth.uid(),clock_timestamp(),'Corrección del docente con justificativo');
 for recipient in select distinct g.user_id from public.student_guardians g join auth.users u on u.id=g.user_id
 where g.student_id=r.student_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null loop
  insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
  values(recipient,s.school_id,r.student_id,s.classroom_id,'attendance_corrected',p_id,'Asistencia corregida','El docente registró una corrección con justificativo. Consulta el historial de asistencia.','studentAttendance') on conflict(user_id,kind,source_id) do nothing;
 end loop;
 return p_id;
end $$;
create or replace function public.review_attendance_correction(p_id uuid,p_approve boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$begin
 raise exception 'Dirección no puede cambiar la asistencia. La corrección corresponde al docente asignado con justificativo.';
end $$;

notify pgrst,'reload schema';
