create table aulanexo_private.subject_posts(
 id uuid primary key,school_id uuid not null references public.schools(id),classroom_id uuid not null references public.classrooms(id),
 class_subject_id uuid not null references public.class_subjects(id),student_id uuid references public.students(id),
 kind text not null check(kind in ('notice','message','event')),title text not null check(length(trim(title)) between 1 and 160),
 body text not null check(length(trim(body)) between 1 and 6000),event_date date,author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(kind<>'event' or event_date is not null),check(kind<>'message' or student_id is not null)
);
revoke all on aulanexo_private.subject_posts from public,anon,authenticated,service_role;
create function public.subject_feed_workspace(p_subject uuid,p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cs public.class_subjects;observer boolean;
begin
 select * into cs from public.class_subjects where id=p_subject and active;
 observer:=public.subject_observer(cs.id);
 if cs.id is null or not aulanexo_private.in_support_school(cs.school_id) or not(observer or exists(select 1 from public.students s where s.id=p_student and s.classroom_id=cs.classroom_id and public.is_verified_guardian(s.id))) then raise exception 'No tienes acceso a esta materia.';end if;
 if p_student is not null and not exists(select 1 from public.students where id=p_student and classroom_id=cs.classroom_id) then raise exception 'El alumno no pertenece al paralelo.';end if;
 return jsonb_build_object('canWrite',public.learning_can_manage(cs.classroom_id,cs.id),
 'posts',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('authorName',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','Comunidad educativa')) order by p.created_at desc)
 from aulanexo_private.subject_posts p join auth.users u on u.id=p.author_id where p.class_subject_id=cs.id
 and (p.student_id is null or p.student_id=p_student or observer and p_student is null)),'[]'));
end $$;
create function public.save_subject_post(p_id uuid,p_subject uuid,p_student uuid,p_kind text,p_title text,p_body text,p_date date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare cs public.class_subjects;child public.students;existing aulanexo_private.subject_posts;writer boolean;
begin
 select * into cs from public.class_subjects where id=p_subject and active;
 writer:=public.learning_can_manage(cs.classroom_id,cs.id);
 if cs.id is null or not aulanexo_private.in_support_school(cs.school_id) then raise exception 'Materia no disponible.';end if;
 if p_student is not null then select * into child from public.students where id=p_student and classroom_id=cs.classroom_id; if child.id is null then raise exception 'El alumno no pertenece al paralelo.';end if;end if;
 if not writer and not(p_kind='message' and child.id is not null and public.is_verified_guardian(child.id)) then raise exception 'Solo el docente de esta materia puede publicar. La familia puede enviar mensajes de su hijo.';end if;
 perform pg_advisory_xact_lock(hashtext('subject-post:'||p_id::text));
 select * into existing from aulanexo_private.subject_posts where id=p_id;
 if existing.id is not null then
  if existing.author_id<>aulanexo_private.actor_uid() or existing.class_subject_id<>p_subject or existing.student_id is distinct from p_student or existing.kind<>p_kind or existing.title<>trim(p_title) or existing.body<>trim(p_body) or existing.event_date is distinct from p_date then raise exception 'Esta referencia ya fue utilizada.';end if;
  return p_id;
 end if;
 insert into aulanexo_private.subject_posts(id,school_id,classroom_id,class_subject_id,student_id,kind,title,body,event_date,author_id)
 values(p_id,cs.school_id,cs.classroom_id,cs.id,p_student,p_kind,trim(p_title),trim(p_body),p_date,aulanexo_private.actor_uid());
 return p_id;
end $$;

create table aulanexo_private.subject_attendance(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),classroom_id uuid not null references public.classrooms(id),
 class_subject_id uuid not null references public.class_subjects(id),attendance_date date not null,lesson text not null check(lesson ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 records jsonb not null,status text not null check(status in ('draft','confirmed')),revision integer not null default 1,
 recorded_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(class_subject_id,attendance_date,lesson)
);
revoke all on aulanexo_private.subject_attendance from public,anon,authenticated,service_role;
create table aulanexo_private.subject_attendance_revisions(
 id bigint generated always as identity primary key,session_id uuid not null references aulanexo_private.subject_attendance(id),
 actor_id uuid not null references auth.users(id),previous_records jsonb not null,reason text not null,created_at timestamptz not null default now()
);
revoke all on aulanexo_private.subject_attendance_revisions from public,anon,authenticated,service_role;
create function public.subject_attendance_workspace(p_subject uuid,p_day date,p_lesson text,p_student uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare cs public.class_subjects;observer boolean;session aulanexo_private.subject_attendance;
begin
 select * into cs from public.class_subjects where id=p_subject and active;
 observer:=public.subject_observer(cs.id);
 if cs.id is null or not(observer or exists(select 1 from public.students where id=p_student and classroom_id=cs.classroom_id and public.is_verified_guardian(id))) then raise exception 'No tienes acceso a la asistencia de esta materia.';end if;
 select * into session from aulanexo_private.subject_attendance where class_subject_id=cs.id and attendance_date=p_day and lesson=p_lesson;
 return jsonb_build_object('canWrite',public.learning_can_manage(cs.classroom_id,cs.id),
 'revision',coalesce(session.revision,0),'status',session.status,
 'roster',case when observer then coalesce((select jsonb_agg(to_jsonb(r)) from aulanexo_private.attendance_roster(cs.classroom_id,p_day) r),'[]') else '[]'::jsonb end,
 'records',case when observer then coalesce(session.records,'[]') when session.status='confirmed' then coalesce((select jsonb_agg(r) from jsonb_array_elements(session.records) r where r->>'studentId'=p_student::text),'[]') else '[]'::jsonb end);
end $$;
create function public.save_subject_attendance(p_subject uuid,p_day date,p_lesson text,p_records jsonb,p_revision integer,p_confirm boolean,p_reason text default '')
returns void language plpgsql security definer set search_path='' as $$
declare cs public.class_subjects;session aulanexo_private.subject_attendance;item jsonb;roster uuid[];
begin
 select * into cs from public.class_subjects where id=p_subject and active;
 if cs.id is null or not public.learning_can_manage(cs.classroom_id,cs.id) then raise exception 'Solo el docente de esta materia puede registrar su asistencia.';end if;
 if p_day is null or p_day>(now() at time zone 'America/La_Paz')::date or p_confirm is null then raise exception 'Revisa la fecha y el estado de la asistencia.';end if;
 if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>1000 then raise exception 'Revisa la lista de alumnos.';end if;
 perform pg_advisory_xact_lock(hashtext('subject-attendance:'||p_subject::text||p_day::text||p_lesson));
 select * into session from aulanexo_private.subject_attendance where class_subject_id=cs.id and attendance_date=p_day and lesson=p_lesson for update;
 if coalesce(session.revision,0)<>p_revision then raise exception 'La asistencia cambió. Actualiza la lista.';end if;
 if session.status='confirmed' then
  if p_confirm is distinct from true or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'Explica el motivo de la corrección y conserva la asistencia confirmada.';end if;
  insert into aulanexo_private.subject_attendance_revisions(session_id,actor_id,previous_records,reason) values(session.id,aulanexo_private.actor_uid(),session.records,trim(p_reason));
 end if;
 select coalesce(array_agg(student_id),'{}') into roster from aulanexo_private.attendance_roster(cs.classroom_id,p_day);
 if (select count(distinct value->>'studentId') from jsonb_array_elements(p_records))<>jsonb_array_length(p_records) then raise exception 'No repitas alumnos.';end if;
 for item in select value from jsonb_array_elements(p_records) loop
  if not((item->>'studentId')::uuid=any(roster)) or coalesce(item->>'status','') not in ('present','late','absent','excused') or length(coalesce(item->>'note',''))>500 then raise exception 'Revisa el alumno y su asistencia.';end if;
 end loop;
 if p_confirm and jsonb_array_length(p_records)<>cardinality(roster) then raise exception 'Completa la asistencia de todos los alumnos antes de confirmar.';end if;
 insert into aulanexo_private.subject_attendance(school_id,classroom_id,class_subject_id,attendance_date,lesson,records,status,recorded_by)
 values(cs.school_id,cs.classroom_id,cs.id,p_day,p_lesson,p_records,case when p_confirm then 'confirmed' else 'draft' end,aulanexo_private.actor_uid())
 on conflict(class_subject_id,attendance_date,lesson) do update set records=excluded.records,status=excluded.status,revision=subject_attendance.revision+1,recorded_by=excluded.recorded_by,updated_at=now();
end $$;
revoke all on function public.subject_feed_workspace(uuid,uuid),public.save_subject_post(uuid,uuid,uuid,text,text,text,date),public.subject_attendance_workspace(uuid,date,text,uuid),public.save_subject_attendance(uuid,date,text,jsonb,integer,boolean,text) from public,anon;
grant execute on function public.subject_feed_workspace(uuid,uuid),public.save_subject_post(uuid,uuid,uuid,text,text,text,date),public.subject_attendance_workspace(uuid,date,text,uuid),public.save_subject_attendance(uuid,date,text,jsonb,integer,boolean,text) to authenticated;
