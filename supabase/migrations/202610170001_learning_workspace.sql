-- Optional subjects and private assignment submissions. All writes pass through checked RPCs.
alter table public.classrooms add column subjects_enabled boolean not null default false;
create function aulanexo_private.subject_key(p_name text) returns text language sql immutable set search_path='' as $$
 select lower(regexp_replace(translate(trim(p_name),'ÁÉÍÓÚÜÑáéíóúüñ','AEIOUUNaeiouun'),'\s+',' ','g'));
$$;
create table public.subject_catalog(id uuid primary key default gen_random_uuid(),name text not null,normalized_name text not null unique);
insert into public.subject_catalog(name,normalized_name) select name,aulanexo_private.subject_key(name) from unnest(array['Lenguaje','Matemáticas','Cálculo','Comunicación y Lenguajes','Ciencias Naturales','Ciencias Sociales','Biología','Física','Química','Inglés','Educación Física','Educación Musical','Artes Plásticas','Tecnología e Informática','Valores','Psicomotricidad','Expresión y Creatividad','Desarrollo del Lenguaje']) name;
create table public.school_subjects(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),name text not null check(length(name) between 2 and 100),normalized_name text not null,unique(school_id,normalized_name));
create table public.class_subjects(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),classroom_id uuid not null references public.classrooms(id),subject_id uuid not null references public.school_subjects(id),active boolean not null default true,unique(classroom_id,subject_id));
create table public.subject_teachers(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),class_subject_id uuid not null references public.class_subjects(id) on delete cascade,teacher_id uuid not null references public.teachers(id),unique(class_subject_id,teacher_id));
create table public.assignments(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),classroom_id uuid not null references public.classrooms(id),class_subject_id uuid references public.class_subjects(id),
 title text not null check(length(title) between 3 and 180),instructions text not null check(length(instructions) between 1 and 20000),due_at timestamptz,allow_late boolean not null default true,max_score numeric(7,2) not null default 100 check(max_score>0 and max_score<=10000),status text not null default 'draft' check(status in ('draft','published','closed')),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index assignments_room on public.assignments(school_id,classroom_id,status,due_at);
create table public.assignment_submissions(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),assignment_id uuid not null references public.assignments(id),student_id uuid not null references public.students(id),body text not null default '' check(length(body)<=20000),status text not null default 'draft' check(status in ('draft','submitted','returned','reviewed')),score numeric(7,2),feedback text not null default '' check(length(feedback)<=4000),submitted_by uuid not null references auth.users(id),submitted_at timestamptz,reviewed_by uuid references auth.users(id),reviewed_at timestamptz,updated_at timestamptz not null default now(),revision integer not null default 0,unique(assignment_id,student_id)
);
create index submissions_assignment on public.assignment_submissions(assignment_id,status);
create table public.assignment_files(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),submission_id uuid not null references public.assignment_submissions(id),object_key text not null unique,file_name text not null check(length(file_name) between 1 and 180),mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),size_bytes integer not null check(size_bytes>0 and size_bytes<=5242880),status text not null default 'pending' check(status in ('pending','ready')),uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create index assignment_files_submission on public.assignment_files(submission_id);
create function public.learning_room_visible(p_school uuid,p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms r join public.schools sch on sch.id=r.school_id where r.id=p_room and r.school_id=p_school and sch.status='active' and
 (public.may_use_classroom(p_school,p_room) or exists(select 1 from public.students s where s.id=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),p_school) and s.classroom_id=r.id and aulanexo_private.student_learning_access(s.id))));
$$;
create function public.learning_can_manage(p_room uuid,p_subject uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.classrooms r join public.schools sch on sch.id=r.school_id where r.id=p_room and sch.status='active' and
 (public.has_school_role(r.school_id,array['director']) or (public.may_edit_classroom(r.school_id,r.id) and (p_subject is null or exists(select 1 from public.class_subjects cs join public.subject_teachers st on st.class_subject_id=cs.id join public.teachers t on t.id=st.teacher_id where cs.id=p_subject and cs.classroom_id=r.id and cs.school_id=r.school_id and cs.active and t.user_id=aulanexo_private.actor_uid() and t.status='active')))));
$$;
create function public.learning_submission_visible(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.assignment_submissions sub join public.assignments a on a.id=sub.assignment_id join public.students s on s.id=sub.student_id where sub.id=p_id and s.school_id=a.school_id and s.classroom_id=a.classroom_id and
 ((sub.status<>'draft' and public.learning_can_manage(a.classroom_id,a.class_subject_id)) or
 (a.status<>'draft' and public.learning_room_visible(a.school_id,a.classroom_id) and ((sub.status<>'draft' and public.family_access(s.id)) or (s.id=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),s.school_id) and aulanexo_private.student_learning_access(s.id))))));
$$;
create function aulanexo_private.assert_assignment_writer(p_assignment uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.assignments;child public.students;begin
 select * into a from public.assignments where id=p_assignment for update;
 select * into child from public.students where id=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),a.school_id);
 if auth.uid() is null or a.id is null or child.id is null or child.classroom_id<>a.classroom_id or child.school_id<>a.school_id or not aulanexo_private.student_learning_access(child.id) then raise exception 'Solo el estudiante habilitado puede entregar su propia tarea.';end if;
 if a.status<>'published' then raise exception 'Esta tarea no admite entregas.';end if;
 if not a.allow_late and a.due_at is not null and a.due_at<now() then raise exception 'El plazo de esta tarea terminó.';end if;
 return child.id;
end $$;
create function public.set_class_subjects_enabled(p_classroom_id uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare r public.classrooms;begin
 select * into r from public.classrooms where id=p_classroom_id for update;
 if r.id is null or not public.has_school_role(r.school_id,array['director']) then raise exception 'Solo Dirección configura las materias del aula.';end if;
 update public.classrooms set subjects_enabled=p_enabled where id=r.id;
end $$;
create function public.configure_class_subject(p_classroom_id uuid,p_name text,p_teacher_ids uuid[],p_active boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.classrooms;subject_value uuid;class_value uuid;clean text:=regexp_replace(trim(p_name),'\s+',' ','g');begin
 select * into r from public.classrooms where id=p_classroom_id for update;
 if r.id is null or not public.has_school_role(r.school_id,array['director']) then raise exception 'Solo Dirección configura las materias del aula.';end if;
 if length(coalesce(clean,'')) not between 2 and 100 then raise exception 'Indica el nombre de la materia (2 a 100 caracteres).';end if;
 if exists(select 1 from unnest(p_teacher_ids) t(id) where not exists(select 1 from public.teachers tt join public.teacher_classrooms tc on tc.teacher_id=tt.id and tc.school_id=tt.school_id where tt.id=t.id and tt.school_id=r.school_id and tc.classroom_id=r.id and tt.status in ('active','pending'))) then raise exception 'Asigna docentes de esta institución vinculados al aula.';end if;
 insert into public.school_subjects(school_id,name,normalized_name) values(r.school_id,clean,aulanexo_private.subject_key(clean)) on conflict(school_id,normalized_name) do update set normalized_name=excluded.normalized_name returning id into subject_value;
 insert into public.class_subjects(school_id,classroom_id,subject_id,active) values(r.school_id,r.id,subject_value,p_active) on conflict(classroom_id,subject_id) do update set active=excluded.active returning id into class_value;
 delete from public.subject_teachers where class_subject_id=class_value;
 insert into public.subject_teachers(school_id,class_subject_id,teacher_id) select r.school_id,class_value,id from (select distinct unnest(p_teacher_ids) id)t;
 if p_active then update public.classrooms set subjects_enabled=true where id=r.id;end if;
 return class_value;
end $$;
create function public.save_assignment(p_assignment jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.assignments;room public.classrooms;subject_value uuid:=nullif(p_assignment->>'class_subject_id','')::uuid;target_assignment uuid:=coalesce(nullif(p_assignment->>'id','')::uuid,gen_random_uuid());begin
 select * into room from public.classrooms where id=(p_assignment->>'classroom_id')::uuid for update;
 select * into a from public.assignments where id=target_assignment for update;
 if room.id is null or not public.learning_can_manage(room.id,subject_value) or (a.id is not null and not public.learning_can_manage(a.classroom_id,a.class_subject_id)) then raise exception 'No puedes publicar o modificar tareas de esta aula y materia.';end if;
 if a.id is not null and (a.classroom_id<>room.id or a.class_subject_id is distinct from subject_value) then raise exception 'Conserva el aula y materia de una tarea existente.';end if;
 if room.subjects_enabled and subject_value is null and a.id is null then raise exception 'Selecciona una materia del aula.';end if;
 if subject_value is not null and not exists(select 1 from public.class_subjects cs where cs.id=subject_value and cs.classroom_id=room.id and cs.school_id=room.school_id and cs.active) then raise exception 'La materia no pertenece al aula o está inactiva.';end if;
 if a.id is not null and a.status<>'draft' and p_assignment->>'status'='draft' then raise exception 'Una tarea publicada no puede volver a borrador.';end if;
 insert into public.assignments(id,school_id,classroom_id,class_subject_id,title,instructions,due_at,allow_late,max_score,status,created_by)
 values(target_assignment,room.school_id,room.id,subject_value,trim(p_assignment->>'title'),trim(p_assignment->>'instructions'),nullif(p_assignment->>'due_at','')::timestamptz,coalesce((p_assignment->>'allow_late')::boolean,true),coalesce((p_assignment->>'max_score')::numeric,100),coalesce(p_assignment->>'status','draft'),aulanexo_private.actor_uid())
 on conflict(id) do update set title=excluded.title,instructions=excluded.instructions,due_at=excluded.due_at,allow_late=excluded.allow_late,max_score=excluded.max_score,status=excluded.status,updated_at=now();
 if exists(select 1 from public.assignment_submissions where assignment_submissions.assignment_id=target_assignment and score>(p_assignment->>'max_score')::numeric) then raise exception 'La puntuación máxima no puede ser menor que una nota ya registrada.';end if;
 return target_assignment;
end $$;
create function public.save_assignment_submission(p_assignment_id uuid,p_body text,p_submit boolean default true) returns uuid language plpgsql security definer set search_path='' as $$
declare child uuid;sub public.assignment_submissions;sid uuid;begin
 child:=aulanexo_private.assert_assignment_writer(p_assignment_id);
 -- Serialize draft/file reservations and submissions for this student's task.
 perform pg_advisory_xact_lock(hashtext(p_assignment_id::text),hashtext(child::text));
 select * into sub from public.assignment_submissions where assignment_id=p_assignment_id and student_id=child for update;
 if sub.status='reviewed' then raise exception 'La entrega ya está revisada. Pide al docente que la devuelva para corregirla.';end if;
 if p_submit and length(trim(coalesce(p_body,'')))=0 and not exists(select 1 from public.assignment_files where submission_id=sub.id and status='ready') then raise exception 'Escribe una respuesta o adjunta un archivo antes de entregar.';end if;
 if length(coalesce(p_body,''))>20000 then raise exception 'La respuesta admite hasta 20000 caracteres.';end if;
 if not p_submit and sub.status in ('submitted','returned') then return sub.id;end if;
 sid:=coalesce(sub.id,gen_random_uuid());
 insert into public.assignment_submissions(id,school_id,assignment_id,student_id,body,status,submitted_by,submitted_at,revision)
 select sid,a.school_id,a.id,child,trim(coalesce(p_body,'')),case when p_submit then 'submitted' else 'draft' end,aulanexo_private.actor_uid(),case when p_submit then now() end,case when p_submit then 1 else 0 end from public.assignments a where a.id=p_assignment_id
 on conflict(assignment_id,student_id) do update set body=excluded.body,status=excluded.status,submitted_at=excluded.submitted_at,submitted_by=excluded.submitted_by,score=null,feedback='',reviewed_at=null,reviewed_by=null,revision=public.assignment_submissions.revision+case when p_submit then 1 else 0 end,updated_at=now();
 return sid;
end $$;
create function public.review_assignment_submission(p_id uuid,p_decision text,p_feedback text,p_score numeric default null) returns void language plpgsql security definer set search_path='' as $$
declare sub public.assignment_submissions;a public.assignments;begin
 select * into sub from public.assignment_submissions where id=p_id;select * into a from public.assignments where id=sub.assignment_id for update;select * into sub from public.assignment_submissions where id=p_id for update;
 if sub.id is null or sub.status='draft' or not public.learning_can_manage(a.classroom_id,a.class_subject_id) then raise exception 'Solo el docente asignado o Dirección puede revisar esta entrega.';end if;
 if not exists(select 1 from public.students where id=sub.student_id and classroom_id=a.classroom_id and school_id=a.school_id) then raise exception 'El estudiante ya no pertenece al aula.';end if;
 if p_decision not in ('reviewed','returned') or p_decision is null then raise exception 'Selecciona revisar o devolver.';end if;
 if p_score is not null and (p_score<0 or p_score>a.max_score or p_score::text in ('NaN','Infinity','-Infinity')) then raise exception 'La nota supera la puntuación permitida.';end if;
 if p_decision='returned' and length(trim(coalesce(p_feedback,'')))=0 then raise exception 'Explica qué debe corregir el estudiante.';end if;
 update public.assignment_submissions set status=p_decision,feedback=trim(coalesce(p_feedback,'')),score=case when p_decision='reviewed' then p_score end,reviewed_by=aulanexo_private.actor_uid(),reviewed_at=now(),updated_at=now() where id=p_id;
end $$;
create function public.reserve_assignment_file(p_submission_id uuid,p_file_name text,p_mime_type text,p_size integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare sub public.assignment_submissions;child uuid;file_id uuid:=gen_random_uuid();object_value text;begin
 select * into sub from public.assignment_submissions where id=p_submission_id;child:=aulanexo_private.assert_assignment_writer(sub.assignment_id);select * into sub from public.assignment_submissions where id=p_submission_id for update;
 if sub.student_id is distinct from child or sub.status='reviewed' then raise exception 'No puedes adjuntar archivos a esta entrega.';end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') or p_size is null or p_size<=0 or p_size>5242880 then raise exception 'Usa PDF, JPG, PNG o WebP de hasta 5 MB.';end if;
 if (select count(*) from public.assignment_files where submission_id=sub.id and (status='ready' or created_at>now()-interval '10 minutes'))>=5 then raise exception 'Puedes adjuntar hasta cinco archivos.';end if;
 object_value:=sub.school_id||'/assignments/'||sub.assignment_id||'/'||child||'/'||file_id||case p_mime_type when 'application/pdf' then '.pdf' when 'image/jpeg' then '.jpg' when 'image/png' then '.png' else '.webp' end;
 insert into public.assignment_files(id,school_id,submission_id,object_key,file_name,mime_type,size_bytes,uploaded_by) values(file_id,sub.school_id,sub.id,object_value,trim(p_file_name),p_mime_type,p_size,aulanexo_private.actor_uid());
 return jsonb_build_object('id',file_id,'objectKey',object_value);
end $$;
create function public.assignment_file_for_upload(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.assignment_files;sub public.assignment_submissions;child uuid;begin
 select * into f from public.assignment_files where id=p_id;select * into sub from public.assignment_submissions where id=f.submission_id;child:=aulanexo_private.assert_assignment_writer(sub.assignment_id);
 if f.id is null or sub.student_id is distinct from child or f.uploaded_by<>aulanexo_private.actor_uid() or sub.status='reviewed' or f.status<>'pending' or f.created_at<now()-interval '10 minutes' then raise exception 'La carga no está autorizada o caducó.';end if;
 return to_jsonb(f);
end $$;
create function public.finish_assignment_file(p_id uuid,p_size integer,p_mime_type text) returns void language plpgsql security definer set search_path='' as $$
declare f public.assignment_files;sub public.assignment_submissions;a public.assignments;begin
 select * into f from public.assignment_files where id=p_id;select * into sub from public.assignment_submissions where id=f.submission_id;select * into a from public.assignments where id=sub.assignment_id for update;select * into sub from public.assignment_submissions where id=f.submission_id for update;select * into f from public.assignment_files where id=p_id for update;
 if f.id is null or f.status<>'pending' or f.created_at<now()-interval '10 minutes' or f.size_bytes<>p_size or f.mime_type<>p_mime_type or sub.status='reviewed' or a.status<>'published' or (not a.allow_late and a.due_at<now()) or sub.student_id is distinct from aulanexo_private.student_id_for_user(f.uploaded_by,f.school_id) or not aulanexo_private.student_learning_access(sub.student_id) or not exists(select 1 from public.students where id=sub.student_id and classroom_id=a.classroom_id) then raise exception 'El archivo no cumple la autorización de la entrega.';end if;
 update public.assignment_files set status='ready' where id=p_id;
end $$;
-- Notification sources are checked again at delivery time, including subject changes.
create function aulanexo_private.assignment_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.assignments;recipient record;student_user uuid;begin
 if TG_TABLE_NAME='assignments' then
  if new.status='published' and (TG_OP='INSERT' or old.status='draft') then perform aulanexo_private.notify_class(new.school_id,new.classroom_id,'assignment_published',new.id,'Nueva tarea en MiCole','Consulta las instrucciones y la fecha de entrega.','assignments',new.created_by);end if;
 else
  select * into a from public.assignments where id=new.assignment_id;
  if new.status='submitted' and (TG_OP='INSERT' or old.status<>'submitted' or new.revision<>old.revision) then
   for recipient in select distinct u.id from auth.users u where u.email_confirmed_at is not null and (exists(select 1 from public.school_memberships m where m.user_id=u.id and m.school_id=new.school_id and m.role='director' and m.active) or exists(select 1 from public.teachers t join public.teacher_classrooms tc on tc.teacher_id=t.id and tc.classroom_id=a.classroom_id where t.user_id=u.id and t.school_id=new.school_id and t.status='active' and (a.class_subject_id is null or exists(select 1 from public.subject_teachers st where st.teacher_id=t.id and st.class_subject_id=a.class_subject_id)))) loop
    insert into public.notifications(user_id,school_id,classroom_id,student_id,kind,source_id,title,body,target) values(recipient.id,new.school_id,a.classroom_id,new.student_id,'assignment_submitted_'||new.revision::text,new.id,'Nueva entrega de tarea','Un estudiante envió su respuesta.','assignments') on conflict(user_id,kind,source_id) do update set read_at=null,created_at=now();
   end loop;
  elsif new.status in ('reviewed','returned') and (old.status is distinct from new.status or old.feedback is distinct from new.feedback or old.score is distinct from new.score) then
   perform aulanexo_private.notify_student(new.school_id,new.student_id,'assignment_reviewed_'||new.revision::text||'_'||new.status,new.id,'Tu tarea tiene una revisión','Consulta los comentarios del docente.','assignments',new.reviewed_by,false,true);
   select u.id into student_user from auth.users u where aulanexo_private.student_id_for_user(u.id,new.school_id)=new.student_id limit 1;
   if student_user is not null then insert into public.notifications(user_id,school_id,classroom_id,student_id,kind,source_id,title,body,target) values(student_user,new.school_id,a.classroom_id,new.student_id,'assignment_reviewed_'||new.revision::text||'_'||new.status,new.id,'Tu tarea tiene una revisión','Consulta los comentarios del docente.','assignments') on conflict(user_id,kind,source_id) do update set read_at=null,created_at=now();end if;
  end if;
 end if;
 return new;
end $$;
create trigger assignment_notices after insert or update on public.assignments for each row execute function aulanexo_private.assignment_notices();
create trigger submission_notices after insert or update on public.assignment_submissions for each row execute function aulanexo_private.assignment_notices();
-- Keep the existing visibility checks for all previous notice kinds.
alter function aulanexo_private.push_notice_visible(uuid) rename to push_notice_visible_v1;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;sub public.assignment_submissions;a public.assignments;child uuid;allowed boolean:=false;previous_uid text:=current_setting('request.jwt.claim.sub',true);previous_headers text:=current_setting('request.headers',true);begin
 select * into n from public.notifications where id=p_id;
 if n.kind not like 'assignment_%' then return aulanexo_private.push_notice_visible_v1(p_id);end if;
 if n.read_at is not null or n.created_at<now()-interval '48 hours' or not exists(select 1 from auth.users where id=n.user_id and email_confirmed_at is not null) then return false;end if;
 perform set_config('request.jwt.claim.sub',n.user_id::text,true),set_config('request.headers','{}',true);
 if n.kind='assignment_published' then select * into a from public.assignments where id=n.source_id;allowed:=a.id is not null and a.status<>'draft' and public.learning_room_visible(a.school_id,a.classroom_id);
 else select * into sub from public.assignment_submissions where id=n.source_id;allowed:=sub.id is not null and public.learning_submission_visible(sub.id);end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return allowed;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return false;
end $$;
create or replace function aulanexo_private.push_category(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind like 'birthday_%' then 'birthdays' when p_kind like 'payment_due_%' or p_kind in ('payment','payment_due','payment_receipt') then 'payments' when p_kind='message' then 'messages' when p_kind like 'assignment_%' or p_kind in ('daily','daily_task','grade','calendar','materials','activity') then 'academic' else 'alerts' end;
$$;
do $$ declare name text;begin
 foreach name in array array['subject_catalog','school_subjects','class_subjects','subject_teachers','assignments','assignment_submissions','assignment_files'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant select on public.%I to authenticated',name);
  if name<>'subject_catalog' then execute format('create trigger signal_learning after insert or update or delete on public.%I for each row execute function aulanexo_private.touch_workspace()',name);execute format('create trigger audit_learning after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',name);end if;
 end loop;
end $$;
create policy catalog_read on public.subject_catalog for select to authenticated using(auth.uid() is not null);
create policy school_subjects_read on public.school_subjects for select to authenticated using(exists(select 1 from public.class_subjects cs where cs.subject_id=school_subjects.id and public.learning_room_visible(cs.school_id,cs.classroom_id)));
create policy class_subjects_read on public.class_subjects for select to authenticated using(public.learning_room_visible(school_id,classroom_id));
create policy subject_teachers_read on public.subject_teachers for select to authenticated using(exists(select 1 from public.class_subjects cs where cs.id=class_subject_id and public.learning_room_visible(cs.school_id,cs.classroom_id)));
create policy assignments_read on public.assignments for select to authenticated using((status<>'draft' and public.learning_room_visible(school_id,classroom_id)) or public.learning_can_manage(classroom_id,class_subject_id));
create policy submissions_read on public.assignment_submissions for select to authenticated using(public.learning_submission_visible(id));
create policy assignment_files_read on public.assignment_files for select to authenticated using(public.learning_submission_visible(submission_id) and (status='ready' or uploaded_by=aulanexo_private.actor_uid()));
create policy learning_notifications_read on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and kind like 'assignment_%' and (case when kind='assignment_published' then exists(select 1 from public.assignments a where a.id=source_id and a.status<>'draft' and public.learning_room_visible(a.school_id,a.classroom_id)) else public.learning_submission_visible(source_id) end));
revoke all on function aulanexo_private.subject_key(text),aulanexo_private.assert_assignment_writer(uuid),aulanexo_private.assignment_notices(),aulanexo_private.push_notice_visible(uuid) from public,anon,authenticated;
revoke all on function public.learning_room_visible(uuid,uuid),public.learning_can_manage(uuid,uuid),public.learning_submission_visible(uuid),public.set_class_subjects_enabled(uuid,boolean),public.configure_class_subject(uuid,text,uuid[],boolean),public.save_assignment(jsonb),public.save_assignment_submission(uuid,text,boolean),public.review_assignment_submission(uuid,text,text,numeric),public.reserve_assignment_file(uuid,text,text,integer),public.assignment_file_for_upload(uuid),public.finish_assignment_file(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.learning_room_visible(uuid,uuid),public.learning_can_manage(uuid,uuid),public.learning_submission_visible(uuid),public.set_class_subjects_enabled(uuid,boolean),public.configure_class_subject(uuid,text,uuid[],boolean),public.save_assignment(jsonb),public.save_assignment_submission(uuid,text,boolean),public.review_assignment_submission(uuid,text,text,numeric),public.reserve_assignment_file(uuid,text,text,integer),public.assignment_file_for_upload(uuid) to authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.finish_assignment_file(uuid,integer,text) to service_role;end if;end$$;
