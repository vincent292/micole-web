-- A tutor is an assignment inside a classroom, never a new platform-wide role.
alter table public.classrooms add column tutor_teacher_id uuid;
alter table public.classrooms add constraint classroom_tutor_school foreign key(tutor_teacher_id,school_id) references public.teachers(id,school_id);
create function public.is_classroom_tutor(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and exists(
 select 1 from public.classrooms r join public.teachers t on t.id=r.tutor_teacher_id and t.school_id=r.school_id
 join public.teacher_classrooms tc on tc.classroom_id=r.id and tc.teacher_id=t.id and tc.school_id=r.school_id
 where r.id=p_room and aulanexo_private.in_support_school(r.school_id) and public.has_school_role(r.school_id,array['teacher'])
 and t.status='active' and aulanexo_private.teacher_actor_matches(t.id,t.user_id) and public.platform_school_enabled(r.school_id));
$$;
revoke all on function public.is_classroom_tutor(uuid) from public,anon;
grant execute on function public.is_classroom_tutor(uuid) to authenticated;
create function public.set_classroom_tutor(p_classroom_id uuid,p_teacher_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare r public.classrooms;begin
 select * into r from public.classrooms where id=p_classroom_id for update;
 if r.id is null or not public.school_director(r.school_id) then raise exception 'Solo Dirección asigna a la tutora o jefe de aula.';end if;
 if p_teacher_id is not null and not exists(select 1 from public.teachers t join public.teacher_classrooms tc on tc.teacher_id=t.id and tc.school_id=t.school_id where t.id=p_teacher_id and t.school_id=r.school_id and tc.classroom_id=r.id and t.status in ('active','pending')) then raise exception 'Selecciona un docente activo asignado a esta aula.';end if;
 update public.classrooms set tutor_teacher_id=p_teacher_id where id=r.id;
end $$;
revoke all on function public.set_classroom_tutor(uuid,uuid) from public,anon;
grant execute on function public.set_classroom_tutor(uuid,uuid) to authenticated;
-- Replacing classroom assignments cannot leave a tutor or subject teacher detached from their classroom.
create function aulanexo_private.clear_detached_class_teacher() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.classrooms set tutor_teacher_id=null where id=old.classroom_id and tutor_teacher_id=old.teacher_id;
 delete from public.subject_teachers where teacher_id=old.teacher_id and class_subject_id in(select id from public.class_subjects where classroom_id=old.classroom_id);
 return old;
end $$;
-- save_classroom replaces teacher_classrooms rows, so restore the chosen tutor atomically in its wrapper.
create trigger classroom_teacher_detached after delete on public.teacher_classrooms for each row execute function aulanexo_private.clear_detached_class_teacher();
do $$begin execute replace(pg_get_functiondef('public.save_classroom(jsonb,uuid[])'::regprocedure),'FUNCTION public.save_classroom(', 'FUNCTION aulanexo_private.save_classroom_before_tutoring(');end $$;
revoke all on function aulanexo_private.save_classroom_before_tutoring(jsonb,uuid[]) from public,anon,authenticated,service_role;
create or replace function public.save_classroom(p_room jsonb,p_teacher_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare previous_tutor uuid;target uuid:=(p_room->>'id')::uuid;chosen uuid;assignments jsonb;begin
 select tutor_teacher_id into previous_tutor from public.classrooms where id=target;
 -- Keep subject assignments when the legacy classroom updater replaces an unchanged membership.
 select coalesce(jsonb_agg(to_jsonb(st)),'[]'::jsonb) into assignments from public.subject_teachers st join public.class_subjects cs on cs.id=st.class_subject_id where cs.classroom_id=target and st.teacher_id=any(p_teacher_ids);
 perform aulanexo_private.save_classroom_before_tutoring(p_room,p_teacher_ids);
 insert into public.subject_teachers(id,class_subject_id,teacher_id,school_id) select (x->>'id')::uuid,(x->>'class_subject_id')::uuid,(x->>'teacher_id')::uuid,(x->>'school_id')::uuid from jsonb_array_elements(assignments)x on conflict do nothing;
 chosen:=case when p_room ? 'tutor_teacher_id' then nullif(p_room->>'tutor_teacher_id','')::uuid when previous_tutor=any(p_teacher_ids) then previous_tutor else null end;
 perform public.set_classroom_tutor(target,chosen);
end $$;
-- Tutor read access is separate from learning_can_manage: it never grants a write to another subject.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.gradebook_workspace(uuid,uuid,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'manager boolean;','manager boolean;observer boolean;');
 definition:=replace(definition,'manager:=public.learning_can_manage(r.id,p_subject_id);','manager:=public.learning_can_manage(r.id,p_subject_id);observer:=public.is_classroom_tutor(r.id);');
 definition:=replace(definition,'if not manager and not exists','if not(manager or observer) and not exists');
 definition:=replace(definition,'(manager or h.student_id=p_student_id)','(manager or observer or h.student_id=p_student_id)');
 execute definition;
end $$;
drop policy assessments_read on public.assessments;
create policy assessments_read on public.assessments for select to authenticated using(public.learning_can_manage(classroom_id,class_subject_id) or public.is_classroom_tutor(classroom_id));
drop policy scores_read on public.assessment_scores;
create policy scores_read on public.assessment_scores for select to authenticated using(exists(select 1 from public.assessments a where a.id=assessment_id and (public.learning_can_manage(a.classroom_id,a.class_subject_id) or public.is_classroom_tutor(a.classroom_id))));
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.learning_submission_visible(uuid)'::regprocedure);
 definition:=replace(definition,'public.learning_can_manage(a.classroom_id,a.class_subject_id)','(public.learning_can_manage(a.classroom_id,a.class_subject_id) or public.is_classroom_tutor(a.classroom_id))');execute definition;
end $$;
create policy tutor_assignments_read on public.assignments for select to authenticated using(public.is_classroom_tutor(classroom_id));

create table public.classroom_interviews(
 id uuid primary key,school_id uuid not null references public.schools(id),classroom_id uuid not null,student_id uuid not null,
 class_subject_id uuid references public.class_subjects(id),teacher_id uuid not null,
 title text not null check(length(trim(title)) between 3 and 180),reason text not null check(length(trim(reason)) between 5 and 4000),
 starts_at timestamptz not null,ends_at timestamptz not null,location text not null check(length(trim(location)) between 2 and 500),
 status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),revision integer not null default 1,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),foreign key(student_id,school_id) references public.students(id,school_id),
 foreign key(teacher_id,school_id) references public.teachers(id,school_id),check(ends_at>starts_at and ends_at<=starts_at+interval '4 hours')
);
create index interview_school_date on public.classroom_interviews(school_id,starts_at desc);
create index interview_student_date on public.classroom_interviews(student_id,starts_at desc);
create table public.interview_responses(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),interview_id uuid not null references public.classroom_interviews(id),
 user_id uuid not null references auth.users(id),interview_revision integer not null,revision integer not null default 1,
 response text not null check(response in ('confirmed','request_change','declined')),note text not null default '' check(length(note)<=1000),
 responded_at timestamptz not null default now(),unique(interview_id,user_id,interview_revision)
);
create table public.classroom_staff_messages(
 id uuid primary key,school_id uuid not null references public.schools(id),classroom_id uuid not null,student_id uuid not null,
 class_subject_id uuid references public.class_subjects(id),sender_id uuid not null references auth.users(id),recipient_teacher_id uuid not null,
 body text not null check(length(trim(body)) between 1 and 4000),created_at timestamptz not null default now(),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),foreign key(student_id,school_id) references public.students(id,school_id),
 foreign key(recipient_teacher_id,school_id) references public.teachers(id,school_id)
);
create index staff_messages_scope on public.classroom_staff_messages(school_id,classroom_id,created_at desc);
create function public.interview_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and exists(select 1 from public.classroom_interviews i where i.id=p_id and aulanexo_private.in_support_school(i.school_id) and
 (public.school_director(i.school_id) or public.is_classroom_tutor(i.classroom_id) or public.is_verified_guardian(i.student_id) or
 (public.learning_can_manage(i.classroom_id,i.class_subject_id) and exists(select 1 from public.teachers t where t.id=i.teacher_id and t.status='active' and aulanexo_private.teacher_actor_matches(t.id,t.user_id)))));
$$;
create function public.staff_message_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and exists(select 1 from public.classroom_staff_messages m where m.id=p_id and aulanexo_private.in_support_school(m.school_id) and
 (public.school_director(m.school_id) or (public.has_school_role(m.school_id,array['teacher']) and public.may_edit_classroom(m.school_id,m.classroom_id) and
 (m.sender_id=aulanexo_private.actor_uid() or exists(select 1 from public.teachers t where t.id=m.recipient_teacher_id and t.status='active' and aulanexo_private.teacher_actor_matches(t.id,t.user_id))))));
$$;
create function aulanexo_private.coordination_manager(p_room uuid,p_subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_classroom_tutor(p_room) or exists(select 1 from public.classrooms r where r.id=p_room and (public.school_director(r.school_id) or (public.learning_can_manage(r.id,p_subject) and (p_subject is not null or not r.subjects_enabled))));
$$;
create function public.save_classroom_interview(p_interview jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.classrooms;s public.students;t public.teachers;previous public.classroom_interviews;target uuid:=(p_interview->>'id')::uuid;subject_value uuid:=nullif(p_interview->>'class_subject_id','')::uuid;begin
 select * into r from public.classrooms where id=(p_interview->>'classroom_id')::uuid;
 if target is null or r.id is null or not aulanexo_private.coordination_manager(r.id,subject_value) then raise exception 'Solo Dirección, la tutora o el docente de esta materia puede convocar.';end if;
 select * into s from public.students where id=(p_interview->>'student_id')::uuid and school_id=r.school_id and classroom_id=r.id and status<>'inactive';
 select * into t from public.teachers where id=(p_interview->>'teacher_id')::uuid and school_id=r.school_id and status='active';
 if s.id is null or t.id is null or not exists(select 1 from public.teacher_classrooms where classroom_id=r.id and teacher_id=t.id) then raise exception 'Selecciona un alumno y docente activos de esta aula.';end if;
 if subject_value is not null and not exists(select 1 from public.class_subjects cs join public.subject_teachers st on st.class_subject_id=cs.id where cs.id=subject_value and cs.classroom_id=r.id and cs.active and st.teacher_id=t.id) then raise exception 'El docente debe estar asignado a esta materia.';end if;
 if r.subjects_enabled and subject_value is null and not(public.is_classroom_tutor(r.id) or public.school_director(r.school_id)) then raise exception 'Selecciona tu materia para convocar la entrevista.';end if;
 select * into previous from public.classroom_interviews where id=target for update;
 if previous.id is not null then
  if previous.classroom_id<>r.id or previous.student_id<>s.id or previous.class_subject_id is distinct from subject_value or not aulanexo_private.coordination_manager(previous.classroom_id,previous.class_subject_id) then raise exception 'Conserva alumno, aula y materia de la entrevista.';end if;
  if previous.title=trim(p_interview->>'title') and previous.reason=trim(p_interview->>'reason') and previous.starts_at=(p_interview->>'starts_at')::timestamptz and previous.ends_at=(p_interview->>'ends_at')::timestamptz and previous.location=trim(p_interview->>'location') and previous.teacher_id=t.id then return previous.id;end if;
  if previous.revision<>coalesce((p_interview->>'revision')::integer,0) then raise exception 'La entrevista cambió. Actualiza antes de editar.';end if;
  if previous.status<>'scheduled' then raise exception 'La entrevista ya está cerrada.';end if;
 end if;
 if (p_interview->>'starts_at')::timestamptz<=now() or (p_interview->>'starts_at')::timestamptz>now()+interval '2 years' then raise exception 'Selecciona una fecha futura dentro de los próximos dos años.';end if;
 -- Reusing a client id is safe after a lost response; a retry must not send invitations twice.
 if previous.id is not null and previous.title=trim(p_interview->>'title') and previous.reason=trim(p_interview->>'reason') and previous.starts_at=(p_interview->>'starts_at')::timestamptz and previous.ends_at=(p_interview->>'ends_at')::timestamptz and previous.location=trim(p_interview->>'location') and previous.teacher_id=t.id then return previous.id;end if;
 insert into public.classroom_interviews(id,school_id,classroom_id,student_id,class_subject_id,teacher_id,title,reason,starts_at,ends_at,location,created_by)
 values(target,r.school_id,r.id,s.id,subject_value,t.id,trim(p_interview->>'title'),trim(p_interview->>'reason'),(p_interview->>'starts_at')::timestamptz,(p_interview->>'ends_at')::timestamptz,trim(p_interview->>'location'),aulanexo_private.actor_uid())
 on conflict(id) do update set teacher_id=excluded.teacher_id,title=excluded.title,reason=excluded.reason,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,revision=public.classroom_interviews.revision+1,updated_at=now();
 return target;
end $$;
create function public.respond_classroom_interview(p_id uuid,p_revision integer,p_response text,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare i public.classroom_interviews;begin
 select * into i from public.classroom_interviews where id=p_id for update;
 if i.id is null or not public.interview_visible(i.id) or i.status<>'scheduled' then raise exception 'No puedes responder esta entrevista.';end if;
 if i.revision<>p_revision then raise exception 'La convocatoria cambió. Lee la nueva fecha antes de confirmar.';end if;
 if p_response in ('request_change','declined') and length(trim(p_note))<5 then raise exception 'Indica el motivo para coordinar otra alternativa.';end if;
 insert into public.interview_responses(school_id,interview_id,user_id,interview_revision,response,note) values(i.school_id,i.id,aulanexo_private.actor_uid(),i.revision,p_response,trim(p_note))
 on conflict(interview_id,user_id,interview_revision) do update set response=excluded.response,note=excluded.note,responded_at=now(),revision=public.interview_responses.revision+1 where public.interview_responses.response is distinct from excluded.response or public.interview_responses.note is distinct from excluded.note;
end $$;
create function public.close_classroom_interview(p_id uuid,p_revision integer,p_status text) returns void language plpgsql security definer set search_path='' as $$
declare i public.classroom_interviews;begin
 select * into i from public.classroom_interviews where id=p_id for update;
 if i.id is null or not aulanexo_private.coordination_manager(i.classroom_id,i.class_subject_id) then raise exception 'No puedes cerrar esta entrevista.';end if;
 if i.status<>'scheduled' or i.revision<>p_revision or p_status not in ('completed','cancelled') then raise exception 'Actualiza la convocatoria antes de cerrarla.';end if;
 if p_status='completed' and i.starts_at>now() then raise exception 'La entrevista todavía no empezó.';end if;
 update public.classroom_interviews set status=p_status,revision=revision+1,updated_at=now() where id=i.id;
end $$;
create function public.send_classroom_staff_message(p_message jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.classrooms;recipient public.teachers;target uuid:=(p_message->>'id')::uuid;subject_value uuid:=nullif(p_message->>'class_subject_id','')::uuid;previous public.classroom_staff_messages;begin
 select * into r from public.classrooms where id=(p_message->>'classroom_id')::uuid;
 if r.id is null or target is null or not aulanexo_private.coordination_manager(r.id,subject_value) then raise exception 'No puedes coordinar esta materia.';end if;
 if not exists(select 1 from public.students where id=(p_message->>'student_id')::uuid and classroom_id=r.id and school_id=r.school_id) then raise exception 'El alumno no pertenece a esta aula.';end if;
 select * into recipient from public.teachers t where t.id=(p_message->>'recipient_teacher_id')::uuid and t.school_id=r.school_id and t.status='active' and t.user_id is not null and exists(select 1 from public.teacher_classrooms where classroom_id=r.id and teacher_id=t.id);
 if recipient.id is null or (recipient.id is distinct from r.tutor_teacher_id and subject_value is not null and not exists(select 1 from public.subject_teachers where class_subject_id=subject_value and teacher_id=recipient.id)) then raise exception 'El destinatario debe ser la tutora o docente de esta materia con cuenta activa.';end if;
 if subject_value is not null and not exists(select 1 from public.class_subjects where id=subject_value and classroom_id=r.id and active) then raise exception 'La materia no pertenece al aula.';end if;
 select * into previous from public.classroom_staff_messages where id=target;
 if previous.id is not null then
  if previous.sender_id=aulanexo_private.actor_uid() and previous.body=trim(p_message->>'body') and previous.student_id=(p_message->>'student_id')::uuid and previous.recipient_teacher_id=recipient.id and previous.class_subject_id is not distinct from subject_value then return target;end if;
  raise exception 'No reutilices el identificador de otro mensaje.';
 end if;
 insert into public.classroom_staff_messages(id,school_id,classroom_id,student_id,class_subject_id,sender_id,recipient_teacher_id,body)
 values(target,r.school_id,r.id,(p_message->>'student_id')::uuid,subject_value,aulanexo_private.actor_uid(),recipient.id,trim(p_message->>'body'));
 return target;
end $$;
-- Quiet hours and Firebase use the existing notification outbox. No external request occurs in a trigger.
create function aulanexo_private.notify_coordination() returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;i public.classroom_interviews;child_name text;kind_value text;begin
 if TG_TABLE_NAME='classroom_staff_messages' then
  select user_id into recipient from public.teachers where id=new.recipient_teacher_id;
  if recipient is not null and recipient<>new.sender_id then insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
  values(recipient,new.school_id,new.student_id,new.classroom_id,'classroom_message',new.id,'Coordinación del aula','Tienes un mensaje privado del equipo docente.','interviews') on conflict(user_id,kind,source_id) do nothing;end if;
 elsif TG_TABLE_NAME='interview_responses' then
  select * into i from public.classroom_interviews where id=new.interview_id;
  for recipient in select i.created_by union select user_id from public.teachers where id=i.teacher_id loop
   if recipient is not null and recipient<>new.user_id then insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
   values(recipient,i.school_id,i.student_id,i.classroom_id,'interview_response_'||new.interview_revision||'_'||new.revision,new.id,'Respuesta a entrevista','Una persona respondió a la convocatoria.','interviews') on conflict(user_id,kind,source_id) do update set read_at=null,created_at=now();end if;
  end loop;
 else
  i:=new;kind_value:='interview_'||i.revision;
  select first_name into child_name from public.students where id=i.student_id;
  for recipient in
   select g.user_id from public.student_guardians g where g.student_id=i.student_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father')
   union select t.user_id from public.teachers t where t.id=i.teacher_id and t.status='active' and t.user_id is not null
   union select t.user_id from public.classrooms r join public.teachers t on t.id=r.tutor_teacher_id where r.id=i.classroom_id and t.status='active' and t.user_id is not null
   union select i.created_by
  loop
   if recipient is not null then insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
   values(recipient,i.school_id,i.student_id,i.classroom_id,kind_value,i.id,case i.status when 'cancelled' then 'Entrevista cancelada' when 'completed' then 'Entrevista finalizada' else 'Convocatoria a entrevista' end,
   coalesce(child_name,'Estudiante')||' · '||to_char(i.starts_at at time zone 'America/La_Paz','DD/MM/YYYY HH24:MI')||'. Revisa los detalles en MiCole.','interviews') on conflict(user_id,kind,source_id) do nothing;end if;
  end loop;
 end if;
 return new;
end $$;
do $$declare relation text;begin
 foreach relation in array array['classroom_interviews','interview_responses','classroom_staff_messages'] loop
  execute format('alter table public.%I enable row level security',relation);
  execute format('revoke all on public.%I from public,anon,authenticated',relation);
  execute format('grant select on public.%I to authenticated',relation);
  execute format('create trigger coordination_signal after insert or update on public.%I for each row execute function aulanexo_private.touch_workspace()',relation);
  execute format('create trigger coordination_audit after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',relation);
  execute format('create trigger coordination_notice after insert or update on public.%I for each row execute function aulanexo_private.notify_coordination()',relation);
 end loop;
end $$;
create policy interviews_read on public.classroom_interviews for select to authenticated using(public.interview_visible(id));
create policy interview_responses_read on public.interview_responses for select to authenticated using(public.interview_visible(interview_id));
create policy classroom_staff_messages_read on public.classroom_staff_messages for select to authenticated using(public.staff_message_visible(id));
revoke all on function public.interview_visible(uuid),public.staff_message_visible(uuid),public.save_classroom_interview(jsonb),public.respond_classroom_interview(uuid,integer,text,text),public.close_classroom_interview(uuid,integer,text),public.send_classroom_staff_message(jsonb) from public,anon;
grant execute on function public.interview_visible(uuid),public.staff_message_visible(uuid),public.save_classroom_interview(jsonb),public.respond_classroom_interview(uuid,integer,text,text),public.close_classroom_interview(uuid,integer,text),public.send_classroom_staff_message(jsonb) to authenticated;
revoke all on function aulanexo_private.coordination_manager(uuid,uuid),aulanexo_private.notify_coordination(),aulanexo_private.clear_detached_class_teacher() from public,anon,authenticated,service_role;

create function public.classroom_coordination_workspace(p_school_id uuid,p_classroom_id uuid default null,p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_platform_admin() or not aulanexo_private.in_support_school(p_school_id) or not(public.has_school_role(p_school_id,array['director','teacher','guardian']) or exists(select 1 from public.students s where s.school_id=p_school_id and public.is_verified_guardian(s.id))) then raise exception 'No tienes acceso a estas entrevistas.';end if;
 if p_classroom_id is not null and not exists(select 1 from public.classrooms where id=p_classroom_id and school_id=p_school_id) then raise exception 'El aula no corresponde a la institución.';end if;
 if p_student_id is not null and not exists(select 1 from public.students where id=p_student_id and school_id=p_school_id and (p_classroom_id is null or classroom_id=p_classroom_id)) then raise exception 'El alumno no corresponde al aula.';end if;
 return jsonb_build_object(
 'interviews',coalesce((select jsonb_agg(row order by row->>'starts_at' desc) from (
 select to_jsonb(i)||jsonb_build_object('studentName',concat_ws(' ',s.first_name,s.last_name),'classroomName',r.name,'teacherName',t.name,'subjectName',coalesce(ss.name,'Seguimiento general'),
 'canManage',aulanexo_private.coordination_manager(i.classroom_id,i.class_subject_id),'participants',coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email))) from auth.users u where u.id in(select user_id from public.notifications where source_id=i.id and kind='interview_'||i.revision)),'[]'::jsonb),'responses',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'response',a.response,'note',a.note,'respondedAt',a.responded_at,'revision',a.interview_revision)) from public.interview_responses a join auth.users u on u.id=a.user_id where a.interview_id=i.id and a.interview_revision=i.revision),'[]'::jsonb)) as row
 from public.classroom_interviews i join public.students s on s.id=i.student_id join public.classrooms r on r.id=i.classroom_id join public.teachers t on t.id=i.teacher_id left join public.class_subjects cs on cs.id=i.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id
 where i.school_id=p_school_id and (p_classroom_id is null or i.classroom_id=p_classroom_id) and (p_student_id is null or i.student_id=p_student_id) and public.interview_visible(i.id) order by i.starts_at desc limit 200) scoped),'[]'::jsonb),
 'messages',coalesce((select jsonb_agg(row order by row->>'created_at' desc) from (
 select to_jsonb(m)||jsonb_build_object('senderName',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'recipientName',t.name,'studentName',concat_ws(' ',s.first_name,s.last_name),'subjectName',coalesce(ss.name,'Seguimiento general')) as row
 from public.classroom_staff_messages m join auth.users u on u.id=m.sender_id join public.teachers t on t.id=m.recipient_teacher_id join public.students s on s.id=m.student_id left join public.class_subjects cs on cs.id=m.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id
 where m.school_id=p_school_id and (p_classroom_id is null or m.classroom_id=p_classroom_id) and (p_student_id is null or m.student_id=p_student_id) and public.staff_message_visible(m.id) order by m.created_at desc limit 100) scoped),'[]'::jsonb));
end $$;
create function public.classroom_tutor_overview(p_classroom_id uuid,p_student_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.classrooms;child uuid;term public.academic_terms;begin
 select * into r from public.classrooms where id=p_classroom_id;
 if r.id is null or not(public.school_director(r.school_id) or public.is_classroom_tutor(r.id)) then raise exception 'Solo Dirección o la tutora de esta aula consulta el seguimiento completo.';end if;
 select id into child from public.students where classroom_id=r.id and status<>'inactive' and (p_student_id is null or id=p_student_id) order by last_name,first_name limit 1;
 if p_student_id is not null and child is null then raise exception 'El alumno no pertenece a esta aula.';end if;
 select a.* into term from public.academic_terms a join public.academic_years y on y.id=a.year_id where y.school_id=r.school_id and y.year=r.academic_year order by ((now() at time zone 'America/La_Paz')::date between a.starts_on and a.ends_on) desc,a.starts_on desc limit 1;
 return jsonb_build_object('studentId',child,'termName',term.name,
 'students',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',concat_ws(' ',s.first_name,s.last_name),'pendingTasks',(select count(*) from public.assignments a where a.classroom_id=r.id and a.status in ('published','closed') and not exists(select 1 from public.assignment_submissions sub where sub.assignment_id=a.id and sub.student_id=s.id and sub.status in ('submitted','reviewed'))),'overdueTasks',(select count(*) from public.assignments a where a.classroom_id=r.id and a.status in ('published','closed') and a.due_at<now() and not exists(select 1 from public.assignment_submissions sub where sub.assignment_id=a.id and sub.student_id=s.id and sub.status in ('submitted','reviewed')))) order by s.last_name,s.first_name) from public.students s where s.classroom_id=r.id and s.status<>'inactive'),'[]'::jsonb),
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',cs.id,'name',ss.name,'total',case when term.id is not null and child is not null then aulanexo_private.grade_total(term.id,child,r.id,cs.id) end,'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'hasAccount',t.user_id is not null)) from public.subject_teachers st join public.teachers t on t.id=st.teacher_id where st.class_subject_id=cs.id and t.status='active'),'[]'::jsonb),'pendingTasks',(select count(*) from public.assignments a where a.class_subject_id=cs.id and a.status in ('published','closed') and not exists(select 1 from public.assignment_submissions sub where sub.assignment_id=a.id and sub.student_id=child and sub.status in ('submitted','reviewed')))) order by ss.name) from public.class_subjects cs join public.school_subjects ss on ss.id=cs.subject_id where cs.classroom_id=r.id and cs.active),'[]'::jsonb),
 'care',coalesce((select jsonb_agg(to_jsonb(x) order by x.entry_date desc,x.occurred_at desc) from (select * from public.care_records where student_id=child and classroom_id=r.id order by entry_date desc,occurred_at desc limit 20)x),'[]'::jsonb),
 'recommendations',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from(select id,subject,score,period,recommendation,created_at from public.grades where student_id=child order by created_at desc limit 20)x),'[]'::jsonb),
 'feedback',coalesce((select jsonb_agg(to_jsonb(x) order by x.assessment_date desc) from(select a.title,a.assessment_date,s.comment,s.score,s.qualitative_score,coalesce(ss.name,'Desarrollo integral') as subject from public.assessment_scores s join public.assessments a on a.id=s.assessment_id left join public.class_subjects cs on cs.id=a.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id where s.student_id=child and a.classroom_id=r.id and length(trim(s.comment))>0 order by a.assessment_date desc limit 20)x),'[]'::jsonb),
 'pending',coalesce((select jsonb_agg(to_jsonb(x) order by x.due_at nulls last) from(select a.id,a.title,a.class_subject_id,a.due_at,coalesce(sub.status,'missing') as submission_status,coalesce(ss.name,'Trabajo general') as subject from public.assignments a left join public.assignment_submissions sub on sub.assignment_id=a.id and sub.student_id=child left join public.class_subjects cs on cs.id=a.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id where a.classroom_id=r.id and a.status in ('published','closed') and coalesce(sub.status,'missing') not in ('submitted','reviewed') order by a.due_at nulls last limit 50)x),'[]'::jsonb));
end $$;
revoke all on function public.classroom_coordination_workspace(uuid,uuid,uuid),public.classroom_tutor_overview(uuid,uuid) from public,anon;
grant execute on function public.classroom_coordination_workspace(uuid,uuid,uuid),public.classroom_tutor_overview(uuid,uuid) to authenticated;
-- Push checks the recipient's CURRENT permissions even when an invitation is queued overnight.
do $$begin
 execute replace(pg_get_functiondef('aulanexo_private.push_notice_visible(uuid)'::regprocedure),'FUNCTION aulanexo_private.push_notice_visible(', 'FUNCTION aulanexo_private.push_notice_visible_before_tutoring(');
 execute replace(pg_get_functiondef('aulanexo_private.push_category(text)'::regprocedure),'FUNCTION aulanexo_private.push_category(', 'FUNCTION aulanexo_private.push_category_before_tutoring(');
end $$;
create or replace function aulanexo_private.push_category(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind like 'interview_%' then 'academic' when p_kind='classroom_message' then 'messages' else aulanexo_private.push_category_before_tutoring(p_kind) end;
$$;
create or replace function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;allowed boolean;previous_uid text:=current_setting('request.jwt.claim.sub',true);previous_headers text:=current_setting('request.headers',true);begin
 select * into n from public.notifications where id=p_id;
 if n.kind not like 'interview_%' and n.kind<>'classroom_message' then return aulanexo_private.push_notice_visible_before_tutoring(p_id);end if;
 if n.id is null or n.read_at is not null or n.created_at<now()-interval '48 hours' or not exists(select 1 from auth.users where id=n.user_id and email_confirmed_at is not null) then return false;end if;
 perform set_config('request.jwt.claim.sub',n.user_id::text,true),set_config('request.headers','{}',true);
 if n.kind='classroom_message' then allowed:=public.staff_message_visible(n.source_id);
 elsif n.kind like 'interview_response_%' then select public.interview_visible(interview_id) into allowed from public.interview_responses where id=n.source_id;
 else allowed:=public.interview_visible(n.source_id);end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);
 return coalesce(allowed,false);
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return false;
end $$;
revoke all on function aulanexo_private.push_notice_visible_before_tutoring(uuid),aulanexo_private.push_category_before_tutoring(text),aulanexo_private.push_notice_visible(uuid),aulanexo_private.push_category(text) from public,anon,authenticated,service_role;
-- Subject activities keep their own owner; observing a course never authorizes changing another subject.
alter table public.calendar_events add column class_subject_id uuid references public.class_subjects(id);
create function aulanexo_private.guard_subject_content() returns trigger language plpgsql security definer set search_path='' as $$
declare row_value jsonb:=to_jsonb(new);previous jsonb;room_value uuid:=(row_value->>'classroom_id')::uuid;subject_value uuid:=(row_value->>'class_subject_id')::uuid;school_value uuid:=(row_value->>'school_id')::uuid;begin
 if auth.uid() is null or public.school_director(school_value) then return new;end if;
 if room_value is null and row_value ? 'student_id' then select classroom_id into room_value from public.students where id=(row_value->>'student_id')::uuid;end if;
 if TG_OP='UPDATE' then
  previous:=to_jsonb(old);
  if previous->>'class_subject_id' is not null then
   if not public.learning_can_manage((previous->>'classroom_id')::uuid,(previous->>'class_subject_id')::uuid) then raise exception 'Solo el docente de esta materia puede modificar su actividad.';end if;
  elsif (previous->>'created_by')::uuid is distinct from aulanexo_private.actor_uid() then raise exception 'Solo el autor o Dirección puede modificar este registro.';end if;
  if previous->>'school_id' is distinct from row_value->>'school_id' or previous->>'student_id' is distinct from row_value->>'student_id' or previous->>'classroom_id' is distinct from row_value->>'classroom_id' then raise exception 'Conserva el aula y alumno del registro.';end if;
 end if;
 if subject_value is not null and not exists(select 1 from public.class_subjects cs where cs.id=subject_value and cs.classroom_id=room_value and cs.school_id=school_value and cs.active and public.learning_can_manage(room_value,cs.id)) then raise exception 'Solo el docente asignado puede publicar en esta materia.';end if;
 return new;
end $$;
create trigger subject_content_guard before insert or update on public.calendar_events for each row execute function aulanexo_private.guard_subject_content();
create trigger subject_content_guard before update on public.daily_entries for each row execute function aulanexo_private.guard_subject_content();
create trigger subject_content_guard before update on public.care_records for each row execute function aulanexo_private.guard_subject_content();
create trigger subject_content_guard before update on public.academic_requests for each row execute function aulanexo_private.guard_subject_content();
revoke all on function aulanexo_private.guard_subject_content() from public,anon,authenticated,service_role;
