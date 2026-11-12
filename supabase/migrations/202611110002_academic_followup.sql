create function public.subject_observer(p_subject uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.class_subjects cs where cs.id=p_subject and cs.active
 and (public.school_director(cs.school_id) or public.learning_can_manage(cs.classroom_id,cs.id) or public.is_classroom_tutor(cs.classroom_id)));
$$;
revoke all on function public.subject_observer(uuid) from public,anon;
grant execute on function public.subject_observer(uuid) to authenticated;

create table public.student_observations(
 id uuid primary key,school_id uuid not null references public.schools(id),
 classroom_id uuid not null,student_id uuid not null,class_subject_id uuid references public.class_subjects(id),
 kind text not null check(kind in ('positive','incident')),body text not null check(length(trim(body)) between 3 and 4000),
 photo text check(photo is null or (length(photo)<400000 and photo ~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/=]+$')),
 author_id uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
create index observations_scope on public.student_observations(classroom_id,created_at desc);
alter table public.student_observations enable row level security;
revoke all on public.student_observations from public,anon,authenticated,service_role;
grant select on public.student_observations to authenticated;
create function public.observation_visible(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.student_observations o
 where o.id=p_id and aulanexo_private.in_support_school(o.school_id)
 and (o.author_id=aulanexo_private.actor_uid() or public.school_director(o.school_id)
 or public.is_classroom_tutor(o.classroom_id) or public.is_verified_guardian(o.student_id)));
$$;
create policy observations_read on public.student_observations for select to authenticated using(public.observation_visible(id));
create function public.save_student_observation(p_id uuid,p_student uuid,p_subject uuid,p_kind text,p_body text,p_photo text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare child public.students;existing public.student_observations;target text;recipient uuid;
begin
 select * into child from public.students where id=p_student;
 if child.id is null or not aulanexo_private.in_support_school(child.school_id) then raise exception 'Alumno no disponible.';end if;
 if p_subject is null then
  if not(public.school_director(child.school_id) or public.is_classroom_tutor(child.classroom_id)) then raise exception 'El seguimiento general corresponde a tutoría o Dirección. Selecciona tu materia.';end if;
 elsif not exists(select 1 from public.class_subjects cs where cs.id=p_subject and cs.classroom_id=child.classroom_id and cs.school_id=child.school_id and cs.active and public.learning_can_manage(cs.classroom_id,cs.id)) then
  raise exception 'Solo puedes registrar seguimiento de tu propia materia.';
 end if;
 perform pg_advisory_xact_lock(hashtext('observation:'||p_id::text));
 select * into existing from public.student_observations where id=p_id;
 if existing.id is not null then
  if existing.author_id<>aulanexo_private.actor_uid() or existing.student_id<>p_student or existing.class_subject_id is distinct from p_subject
   or existing.kind<>p_kind or existing.body<>trim(p_body) or existing.photo is distinct from nullif(p_photo,'') then raise exception 'La referencia ya pertenece a otra observación.';end if;
  return existing.id;
 end if;
 insert into public.student_observations(id,school_id,classroom_id,student_id,class_subject_id,kind,body,photo,author_id)
 values(p_id,child.school_id,child.classroom_id,child.id,p_subject,p_kind,trim(p_body),nullif(p_photo,''),aulanexo_private.actor_uid());
 target:='studentRecord?student='||child.id::text||'&tab=followup';
 perform aulanexo_private.notify_student(child.school_id,child.id,'student_observation',p_id,
 case when p_kind='positive' then 'Reconocimiento del alumno' else 'Incidencia de seguimiento' end,
 'Hay una nueva observación disponible en el expediente.',target,aulanexo_private.actor_uid(),false,true);
 for recipient in
  select m.user_id from public.school_memberships m where m.school_id=child.school_id and m.role='director' and m.active
  union select t.user_id from public.classrooms r join public.teachers t on t.id=r.tutor_teacher_id
   where r.id=child.classroom_id and t.status='active' and t.user_id is not null
 loop
  if recipient is distinct from aulanexo_private.actor_uid() then
   insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
   values(recipient,child.school_id,child.id,'student_observation',p_id,
    case when p_kind='positive' then 'Reconocimiento del alumno' else 'Incidencia de seguimiento' end,
    'Hay una nueva observación disponible en el expediente.','classrooms?classroom='||child.classroom_id::text||'&tab=followup&student='||child.id::text)
   on conflict(user_id,kind,source_id) do nothing;
  end if;
 end loop;
 return p_id;
end $$;
create function public.student_observation_workspace(p_room uuid default null,p_student uuid default null,p_subject uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_room is null and p_student is null then raise exception 'Selecciona un alumno o paralelo.';end if;
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object(
 'studentName',concat_ws(' ',s.first_name,s.last_name),'subjectName',coalesce(ss.name,'Seguimiento del paralelo'),
 'authorName',coalesce(u.raw_user_meta_data->>'full_name',u.raw_user_meta_data->>'name','Docente')) order by o.created_at desc)
 from public.student_observations o join public.students s on s.id=o.student_id join auth.users u on u.id=o.author_id
 left join public.class_subjects cs on cs.id=o.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id
 where (p_room is null or o.classroom_id=p_room) and (p_student is null or o.student_id=p_student)
 and (p_subject is null or o.class_subject_id=p_subject) and public.observation_visible(o.id)),'[]');
end $$;
revoke all on function public.observation_visible(uuid),public.save_student_observation(uuid,uuid,uuid,text,text,text),public.student_observation_workspace(uuid,uuid,uuid) from public,anon;
grant execute on function public.observation_visible(uuid),public.save_student_observation(uuid,uuid,uuid,text,text,text),public.student_observation_workspace(uuid,uuid,uuid) to authenticated;

-- Consolidated totals retain the exact method and missing-mark rules of the gradebook.
create function public.student_academic_summary(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare child public.students;r public.classrooms;staff boolean;result jsonb;
begin
 select * into child from public.students where id=p_student;
 select * into r from public.classrooms where id=child.classroom_id;
 staff:=public.school_director(child.school_id) or public.is_classroom_tutor(r.id);
 if child.id is null or not aulanexo_private.in_support_school(child.school_id) or not(staff or public.is_verified_guardian(child.id)) then raise exception 'Solo tutoría, Dirección o la familia consulta el consolidado del alumno.';end if;
 if not staff then
  return jsonb_build_object('studentName',concat_ws(' ',child.first_name,child.last_name),'classroomName',r.name,'year',r.academic_year,
   'publishedOnly',true,'passMark',coalesce((select pass_mark from public.institution_academic_settings where school_id=child.school_id),51),
   'cards',coalesce((select jsonb_agg(to_jsonb(c)) from public.report_cards c where c.student_id=child.id and c.published_at is not null and c.revoked_at is null),'[]'));
 end if;
 select jsonb_build_object('studentName',concat_ws(' ',child.first_name,child.last_name),'classroomName',r.name,'year',r.academic_year,'publishedOnly',false,
 'passMark',coalesce((select pass_mark from public.institution_academic_settings where school_id=child.school_id),51),
 'terms',coalesce((select jsonb_agg(to_jsonb(t) order by t.starts_on) from public.academic_terms t join public.academic_years y on y.id=t.year_id where y.school_id=child.school_id and y.year=r.academic_year),'[]'),
 'subjects',coalesce((select jsonb_agg(jsonb_build_object('id',cs.id,'name',ss.name,'periods',
  coalesce((select jsonb_agg(jsonb_build_object('termId',t.id,'termName',t.name,'method',coalesce((select scheme from public.academic_class_policies where classroom_id=r.id and scheme in ('bolivia2026','qualitative')),(select method from public.gradebook_rules m where m.term_id=t.id and m.classroom_id=r.id and m.class_subject_id=cs.id),'weighted'),
  'total',aulanexo_private.grade_total(t.id,child.id,r.id,cs.id),'assessments',coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'maxScore',a.max_score,'weight',a.weight,'score',score.score,'qualitative',score.qualitative_score,'exempt',score.exempt) order by a.assessment_date,a.id) from public.assessments a left join public.assessment_scores score on score.assessment_id=a.id and score.student_id=child.id where a.term_id=t.id and a.classroom_id=r.id and a.class_subject_id=cs.id),'[]')) order by t.starts_on)
  from public.academic_terms t join public.academic_years y on y.id=t.year_id where y.school_id=child.school_id and y.year=r.academic_year),'[]')) order by ss.name)
 from public.class_subjects cs join public.school_subjects ss on ss.id=cs.subject_id where cs.classroom_id=r.id and cs.active),'[]')) into result;
 return result;
end $$;
revoke all on function public.student_academic_summary(uuid) from public,anon;
grant execute on function public.student_academic_summary(uuid) to authenticated;
