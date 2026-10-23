-- Explicit per-classroom policy. Existing flexible/qualitative gradebooks are untouched.
create table public.academic_class_policies (
 classroom_id uuid primary key references public.classrooms(id),school_id uuid not null references public.schools(id),grade_code text not null check(grade_code in ('initial','primary1','primary2','primary3','primary4','primary5','primary6','secondary1','secondary2','secondary3','secondary4','secondary5','secondary6')),
 scheme text not null check(scheme in ('flexible','qualitative','bolivia2026')),reinforcement_method text not null default 'best' check(reinforcement_method in ('best','replace')),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),check(grade_code<>'initial' or scheme<>'bolivia2026')
);
alter table public.assessments add dimension text check(dimension in ('ser','saber','hacer','self'));
create table public.academic_reinforcements (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),term_id uuid not null references public.academic_terms(id),classroom_id uuid not null references public.classrooms(id),class_subject_id uuid not null references public.class_subjects(id),student_id uuid not null references public.students(id),
 original_score numeric not null,score numeric check(score between 0 and 100 and score::text not in ('NaN','Infinity','-Infinity')),method text not null check(method in ('best','replace')),reason text not null check(length(trim(reason)) between 5 and 1000),status text not null default 'pending' check(status in ('pending','approved')),
 revision integer not null default 1,corrections integer not null default 0,authorized_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),approved_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(term_id,classroom_id,class_subject_id,student_id)
);
create table public.academic_reinforcement_changes (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),reinforcement_id uuid not null references public.academic_reinforcements(id),actor_id uuid not null references auth.users(id),previous jsonb not null,current_value jsonb not null,created_at timestamptz not null default now()
);
create function public.save_academic_policy(p_classroom_id uuid,p_grade_code text,p_scheme text,p_reinforcement_method text) returns void language plpgsql security definer set search_path='' as $$
declare r public.classrooms;oldrow public.academic_class_policies;begin
 select * into r from public.classrooms where id=p_classroom_id;
 if r.id is null or not public.school_director(r.school_id) then raise exception 'Solo Dirección configura la evaluación y sucesión de grados.';end if;
 perform 1 from public.academic_years where school_id=r.school_id and year=r.academic_year and status='open' for update;
 if not found then raise exception 'La gestión está cerrada.';end if;
 select * into oldrow from public.academic_class_policies where classroom_id=r.id for update;
 if exists(select 1 from public.report_cards where classroom_id=r.id and revoked_at is null) and (oldrow.scheme is distinct from p_scheme or oldrow.grade_code is distinct from p_grade_code) then raise exception 'Conserva la política y grado de un aula con libretas publicadas.';end if;
 if p_scheme='bolivia2026' and (not r.subjects_enabled or not exists(select 1 from public.class_subjects where classroom_id=r.id and active)) then raise exception 'Configura las materias del paralelo antes de activar la evaluación boliviana.';end if;
 if p_scheme='bolivia2026' and exists(select 1 from public.assessments where classroom_id=r.id and grading_type='numeric' and dimension is null) then raise exception 'Asigna primero una dimensión a las columnas numéricas existentes.';end if;
 insert into public.academic_class_policies(classroom_id,school_id,grade_code,scheme,reinforcement_method,updated_by) values(r.id,r.school_id,p_grade_code,p_scheme,p_reinforcement_method,aulanexo_private.actor_uid())
 on conflict(classroom_id) do update set grade_code=excluded.grade_code,scheme=excluded.scheme,reinforcement_method=excluded.reinforcement_method,updated_by=excluded.updated_by,updated_at=now();
end $$;
do $$begin execute replace(pg_get_functiondef('public.save_assessment(jsonb)'::regprocedure),'FUNCTION public.save_assessment(','FUNCTION aulanexo_private.assessment_without_dimension(');end $$;
revoke all on function aulanexo_private.assessment_without_dimension(jsonb) from public,anon,authenticated,service_role;
create or replace function public.save_assessment(p_assessment jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;dim text;oldrow public.assessments;begin
 select * into oldrow from public.assessments where id=nullif(p_assessment->>'id','')::uuid;
 dim:=coalesce(nullif(p_assessment->>'dimension',''),oldrow.dimension,case when nullif(p_assessment->>'assignment_id','') is not null then 'hacer' end);
 if coalesce(p_assessment->>'grading_type',oldrow.grading_type,'numeric')='numeric' and exists(select 1 from public.academic_class_policies where classroom_id=(p_assessment->>'classroom_id')::uuid and scheme='bolivia2026') and dim is null then raise exception 'Elige Ser, Saber, Hacer o Autoevaluación para esta columna.';end if;
 if oldrow.dimension is not null and oldrow.dimension is distinct from dim and exists(select 1 from public.assessment_scores where assessment_id=oldrow.id) then raise exception 'Una evaluación con notas conserva su dimensión.';end if;
 target:=aulanexo_private.assessment_without_dimension(p_assessment);
 update public.assessments set dimension=dim where id=target;
 return target;
end $$;
do $$begin execute replace(pg_get_functiondef('aulanexo_private.grade_total(uuid,uuid,uuid,uuid)'::regprocedure),'FUNCTION aulanexo_private.grade_total(','FUNCTION aulanexo_private.grade_total_flexible(');end $$;
revoke all on function aulanexo_private.grade_total_flexible(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create function aulanexo_private.dimension_total(p_term uuid,p_student uuid,p_room uuid,p_subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with dims(code,cap) as (values('ser',10),('saber',45),('hacer',40),('self',5)),
 marks as (select a.*,s.score,coalesce(s.exempt,false) exempt from public.assessments a left join public.assessment_scores s on s.assessment_id=a.id and s.student_id=p_student where a.term_id=p_term and a.classroom_id=p_room and a.class_subject_id=p_subject and a.grading_type='numeric'),
 groups as (select d.code,d.cap,count(m.id) filter(where not m.exempt) n,count(m.id) filter(where not m.exempt and m.score is null) missing,round(sum(m.score/m.max_score*m.weight*d.cap) filter(where not m.exempt)/nullif(sum(m.weight) filter(where not m.exempt and m.score is not null),0),4) points from dims d left join marks m on m.dimension=d.code group by d.code,d.cap)
 select jsonb_build_object('score',case when bool_and(points is not null) then round(sum(points),2) else null end,'max_score',100,'missing',sum(case when n=0 then 1 else missing end)+(select count(*) from public.assessments qa left join public.assessment_scores qs on qs.assessment_id=qa.id and qs.student_id=p_student where qa.term_id=p_term and qa.classroom_id=p_room and qa.class_subject_id=p_subject and qa.grading_type='qualitative' and not coalesce(qs.exempt,false) and qs.qualitative_score is null),'assessments',(select count(*) from marks),'exemptions',(select count(*) from marks where exempt),'qualitative',coalesce((select jsonb_agg(jsonb_build_object('title',a.title,'value',s.qualitative_score,'comment',s.comment)) from public.assessments a left join public.assessment_scores s on s.assessment_id=a.id and s.student_id=p_student where a.term_id=p_term and a.classroom_id=p_room and a.class_subject_id=p_subject and a.grading_type='qualitative' and not coalesce(s.exempt,false)),'[]'),'dimensions',jsonb_agg(jsonb_build_object('code',code,'max',cap,'score',points,'missing',case when n=0 then 1 else missing end)),'method','bolivia2026') from groups;
$$;
create or replace function aulanexo_private.grade_total(p_term uuid,p_student uuid,p_room uuid,p_subject uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;r public.academic_reinforcements;value numeric;begin
 if exists(select 1 from public.academic_class_policies where classroom_id=p_room and scheme='bolivia2026') then result:=aulanexo_private.dimension_total(p_term,p_student,p_room,p_subject);
 else result:=aulanexo_private.grade_total_flexible(p_term,p_student,p_room,p_subject);end if;
 select * into r from public.academic_reinforcements where term_id=p_term and student_id=p_student and classroom_id=p_room and class_subject_id=p_subject;
 if r.id is not null then
  if r.status='approved' then value:=case when r.method='best' then greatest((result->>'score')::numeric,r.score) else r.score end;result:=result||jsonb_build_object('originalScore',result->'score','score',value,'reinforcementScore',r.score);
  else result:=result||jsonb_build_object('missing',coalesce((result->>'missing')::int,0)+1,'reinforcementPending',true);end if;
 end if;
 value:=(result->>'score')::numeric;
 return result||jsonb_build_object('classification',case when value is null then null when value<51 then 'ED' when value<69 then 'DA' when value<85 then 'DO' else 'DP' end);
end $$;
create function public.authorize_reinforcement(p_term_id uuid,p_classroom_id uuid,p_subject_id uuid,p_student_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;r public.classrooms;total jsonb;target uuid;begin
 select * into r from public.classrooms where id=p_classroom_id;select * into t from public.academic_terms where id=p_term_id for update;
 if not public.school_director(r.school_id) or t.school_id is distinct from r.school_id or t.status is distinct from 'open' or not exists(select 1 from public.academic_years where id=t.year_id and year=r.academic_year and status='open') then raise exception 'Dirección habilita el reforzamiento antes del cierre del trimestre.';end if;
 if not exists(select 1 from public.academic_class_policies where classroom_id=r.id and scheme='bolivia2026') or not exists(select 1 from public.class_subjects where id=p_subject_id and classroom_id=r.id and active) or not exists(select 1 from public.enrollment_history where student_id=p_student_id and classroom_id=r.id and year_id=t.year_id and started_on<=t.ends_on and coalesce(ended_on,t.ends_on)>=t.starts_on) then raise exception 'Selecciona un alumno y materia del paralelo con evaluación por dimensiones.';end if;
 total:=aulanexo_private.dimension_total(t.id,p_student_id,r.id,p_subject_id);
 if coalesce((total->>'missing')::int,1)<>0 or (total->>'score') is null or (total->>'score')::numeric>=51 then raise exception 'Completa primero las cuatro dimensiones; el reforzamiento corresponde a una nota menor a 51.';end if;
 insert into public.academic_reinforcements(school_id,term_id,classroom_id,class_subject_id,student_id,original_score,method,reason,authorized_by,updated_by)
 select r.school_id,t.id,r.id,p_subject_id,p_student_id,(total->>'score')::numeric,reinforcement_method,trim(p_reason),aulanexo_private.actor_uid(),aulanexo_private.actor_uid() from public.academic_class_policies where classroom_id=r.id
 on conflict(term_id,classroom_id,class_subject_id,student_id) do nothing returning id into target;
 if target is null then select id into target from public.academic_reinforcements where term_id=t.id and classroom_id=r.id and class_subject_id=p_subject_id and student_id=p_student_id;end if;
 return target;
end $$;
create function public.save_reinforcement(p_id uuid,p_revision integer,p_score numeric,p_approve boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r public.academic_reinforcements;oldrow public.academic_reinforcements;lim integer;total jsonb;begin
 select * into r from public.academic_reinforcements where id=p_id;
 perform 1 from public.academic_terms where id=r.term_id and status='open' for update;
 if not found or not exists(select 1 from public.academic_terms t join public.academic_years y on y.id=t.year_id where t.id=r.term_id and y.status='open') then raise exception 'El periodo o la gestión está cerrado.';end if;
 select * into r from public.academic_reinforcements where id=p_id for update;oldrow:=r;
 if not public.learning_can_manage(r.classroom_id,r.class_subject_id) or (coalesce(p_approve,false) and not public.school_director(r.school_id)) then raise exception 'Solo el docente asignado registra la nota; Dirección aprueba el resultado.';end if;
 if r.revision is distinct from p_revision or r.status='approved' then raise exception 'El reforzamiento cambió o ya fue aprobado.';end if;
 if p_score is null or p_score<0 or p_score>100 or p_score::text in ('NaN','Infinity','-Infinity') then raise exception 'Registra una nota entre 0 y 100; 51 es el mínimo de aprobación.';end if;
 select coalesce((select max_corrections from public.gradebook_settings where school_id=r.school_id),3) into lim;
 if r.score is not null and r.score<>p_score and r.corrections>=lim then raise exception 'Se alcanzó el límite de correcciones de Dirección.';end if;
 total:=aulanexo_private.dimension_total(r.term_id,r.student_id,r.classroom_id,r.class_subject_id);
 if coalesce((total->>'missing')::int,1)<>0 then raise exception 'Completa las notas originales antes de aprobar el reforzamiento.';end if;
 update public.academic_reinforcements set score=p_score,status=case when p_approve then 'approved' else 'pending' end,revision=revision+1,corrections=corrections+case when r.score is not null and r.score<>p_score then 1 else 0 end,updated_by=aulanexo_private.actor_uid(),approved_by=case when p_approve then aulanexo_private.actor_uid() end,updated_at=now() where id=r.id returning * into r;
 insert into public.academic_reinforcement_changes(school_id,reinforcement_id,actor_id,previous,current_value) values(r.school_id,r.id,aulanexo_private.actor_uid(),to_jsonb(oldrow),to_jsonb(r));
end $$;
do $$begin execute replace(pg_get_functiondef('public.gradebook_workspace(uuid,uuid,uuid,uuid)'::regprocedure),'FUNCTION public.gradebook_workspace(','FUNCTION aulanexo_private.gradebook_without_dimensions(');end $$;
revoke all on function aulanexo_private.gradebook_without_dimensions(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.gradebook_workspace(p_classroom_id uuid,p_subject_id uuid default null,p_term_id uuid default null,p_student_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.gradebook_without_dimensions(p_classroom_id,p_subject_id,p_term_id,p_student_id);begin
 return result||jsonb_build_object('policy',(select to_jsonb(p) from public.academic_class_policies p where classroom_id=p_classroom_id),'reinforcements',coalesce((select jsonb_agg(to_jsonb(r)) from public.academic_reinforcements r where r.term_id=(result->>'termId')::uuid and r.classroom_id=p_classroom_id and r.class_subject_id=p_subject_id and exists(select 1 from jsonb_array_elements(result->'roster') x where (x->>'studentId')::uuid=r.student_id)),'[]'));
end $$;
-- Deterministic primary -> secondary succession, never derived from free-text names.
create function aulanexo_private.next_grade(code text) returns text language sql immutable set search_path='' as $$
 select case when code='primary6' then 'secondary1' when code='secondary6' then 'graduated' when code ~ '^(primary|secondary)[1-5]$' then left(code,length(code)-1)||((right(code,1)::int)+1)::text end;
$$;
create table public.promotion_batches (
 id uuid primary key,school_id uuid not null references public.schools(id),source_year_id uuid not null references public.academic_years(id),target_year_id uuid not null references public.academic_years(id),items jsonb not null,created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create function aulanexo_private.annual_outcome(p_student uuid,p_year uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.students;r public.classrooms;y public.academic_years;policy public.academic_class_policies;lines jsonb:='[]';cs record;t record;c public.report_cards;line jsonb;n integer;total numeric;complete boolean:=true;failed boolean:=false;cards_value jsonb:='[]';term_count integer;outcome text;begin
 select * into s from public.students where id=p_student;select * into y from public.academic_years where id=p_year;select * into r from public.classrooms where id=s.classroom_id;
 select * into policy from public.academic_class_policies where classroom_id=r.id;
 select count(*) into term_count from public.academic_terms where year_id=y.id;
 if policy.scheme is distinct from 'bolivia2026' or term_count<>3 or r.academic_year<>y.year then complete:=false;end if;
 for cs in select a.id,ss.name from public.class_subjects a join public.school_subjects ss on ss.id=a.subject_id where a.classroom_id=r.id and a.active order by ss.name loop
  total:=0;n:=0;
  for t in select * from public.academic_terms where year_id=y.id order by starts_on loop
   select * into c from public.report_cards where term_id=t.id and student_id=s.id and classroom_id=r.id and revoked_at is null order by revision desc limit 1;
   cards_value:=cards_value||jsonb_build_array(jsonb_build_object('term',t.id,'revision',c.revision,'content',c.content));
   select value into line from jsonb_array_elements(coalesce(c.content->'subjects','[]')) where value->>'classSubjectId'=cs.id::text;
   if t.status<>'closed' or c.id is null or coalesce((line->>'missing')::int,1)>0 or line->>'score' is null then complete:=false;
   else total:=total+(line->>'score')::numeric/coalesce(nullif((line->>'maxScore')::numeric,0),100)*100;n:=n+1;end if;
  end loop;
  if n=3 then total:=round(total/3,2);if total<51 then failed:=true;end if;else total:=null;end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('subject',cs.name,'score',total,'classification',case when total is null then null when total<51 then 'ED' when total<69 then 'DA' when total<85 then 'DO' else 'DP' end));
 end loop;
 if jsonb_array_length(lines)=0 then complete:=false;end if;
 outcome:=case when not complete then 'pending' when failed then 'retained' when policy.grade_code='secondary6' then 'graduated' else 'passed' end;
 return jsonb_build_object('studentId',s.id,'studentName',concat_ws(' ',s.first_name,s.last_name),'classroomId',r.id,'classroomName',r.name,'gradeCode',policy.grade_code,'outcome',outcome,'targetGrade',case when outcome='retained' then policy.grade_code when outcome='passed' then aulanexo_private.next_grade(policy.grade_code) end,'subjects',lines,'fingerprint',md5(cards_value::text||coalesce(to_jsonb(policy)::text,'')||s.classroom_id::text||s.status));
end $$;
create function public.promotion_workspace(p_school_id uuid,p_source_year uuid default null,p_target_year uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare src public.academic_years;begin
 if not public.school_director(p_school_id) then raise exception 'Solo Dirección revisa y confirma la promoción anual.';end if;
 if p_source_year is null then select * into src from public.academic_years where school_id=p_school_id order by year desc limit 1;
 else select * into src from public.academic_years where id=p_source_year and school_id=p_school_id;end if;
 return jsonb_build_object('sourceYear',to_jsonb(src),'years',coalesce((select jsonb_agg(to_jsonb(y) order by year desc) from public.academic_years y where school_id=p_school_id),'[]'),
 'rooms',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('policy',(select to_jsonb(p) from public.academic_class_policies p where p.classroom_id=r.id)) order by r.academic_year,r.name) from public.classrooms r where school_id=p_school_id and active),'[]'),
 'students',coalesce((select jsonb_agg(aulanexo_private.annual_outcome(s.id,src.id) order by s.last_name,s.first_name) from public.students s join public.classrooms r on r.id=s.classroom_id where s.school_id=p_school_id and s.status<>'inactive' and r.academic_year=src.year),'[]'),
 'batches',coalesce((select jsonb_agg(to_jsonb(b) order by created_at desc) from public.promotion_batches b where b.school_id=p_school_id and source_year_id=src.id),'[]'));
end $$;
create function public.apply_annual_promotion(p_batch_id uuid,p_source_year uuid,p_target_year uuid,p_items jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare src public.academic_years;dest public.academic_years;item jsonb;s public.students;r public.classrooms;result jsonb;oldbatch public.promotion_batches;counted integer:=0;oldh uuid;begin
 select * into src from public.academic_years where id=p_source_year for update;select * into dest from public.academic_years where id=p_target_year for update;
 if src.id is null or dest.id is null or src.school_id<>dest.school_id or not public.school_director(src.school_id) then raise exception 'Selecciona las gestiones de esta institución.';end if;
 perform pg_advisory_xact_lock(hashtext('annual-promotion'),hashtext(src.school_id::text));
 select * into oldbatch from public.promotion_batches where id=p_batch_id;
 if oldbatch.id is not null then
  if oldbatch.school_id=src.school_id and oldbatch.source_year_id=src.id and oldbatch.target_year_id=dest.id and oldbatch.items=p_items then return jsonb_array_length(p_items);end if;
  raise exception 'Este identificador corresponde a otra operación.';
 end if;
 if src.status<>'closed' or dest.status<>'open' or dest.year<>src.year+1 then raise exception 'Cierra la gestión de origen y selecciona la siguiente gestión abierta.';end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 500 or (select count(distinct value->>'studentId') from jsonb_array_elements(p_items))<>jsonb_array_length(p_items) then raise exception 'Selecciona de 1 a 500 estudiantes distintos.';end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'studentId' loop
  select * into s from public.students where id=(item->>'studentId')::uuid for update;
  if s.school_id is distinct from src.school_id or s.status='inactive' then raise exception 'El estudiante no está activo en esta institución.';end if;
  result:=aulanexo_private.annual_outcome(s.id,src.id);
  if result->>'outcome'='pending' or result->>'fingerprint' is distinct from item->>'fingerprint' then raise exception 'El resultado anual cambió o tiene notas pendientes. Actualiza la revisión.';end if;
  if result->>'outcome'='graduated' then
   update public.students set status='inactive',withdrawn_at=greatest(current_date,enrolled_at),withdrawal_reason='Egreso de 6.º de Secundaria · Gestión '||src.year where id=s.id;
   update public.enrollment_history set status='completed',reason='Egreso de 6.º de Secundaria' where student_id=s.id and year_id=src.id and status='withdrawn';
  else
   select * into r from public.classrooms where id=(item->>'targetClassroomId')::uuid for update;
   if r.school_id is distinct from src.school_id or r.academic_year<>dest.year or not r.active or not exists(select 1 from public.academic_class_policies where classroom_id=r.id and grade_code=result->>'targetGrade') then raise exception 'El aula de destino no corresponde al grado, institución y gestión calculados.';end if;
   perform aulanexo_private.validate_admission_room(s.id,r.id,s.school_id);
   select id into oldh from public.enrollment_history where student_id=s.id and status='enrolled';
   update public.students set classroom_id=r.id where id=s.id;
   update public.enrollment_history set reason='Promoción anual: '||case when result->>'outcome'='retained' then 'retenido en el mismo grado' else 'aprobado' end where id=oldh;
  end if;
  counted:=counted+1;
 end loop;
 insert into public.promotion_batches(id,school_id,source_year_id,target_year_id,items,created_by) values(p_batch_id,src.school_id,src.id,dest.id,p_items,aulanexo_private.actor_uid());
 return counted;
end $$;
-- Copying classrooms also copies the explicit grade policy; no financial records copied.
do $$begin execute replace(pg_get_functiondef('public.copy_year_classrooms(uuid,uuid)'::regprocedure),'FUNCTION public.copy_year_classrooms(','FUNCTION aulanexo_private.copy_classrooms_without_policy(');end $$;
revoke all on function aulanexo_private.copy_classrooms_without_policy(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.copy_year_classrooms(p_source_year uuid,p_target_year uuid) returns integer language plpgsql security definer set search_path='' as $$
declare n integer;begin
 n:=aulanexo_private.copy_classrooms_without_policy(p_source_year,p_target_year);
 insert into public.academic_class_policies(classroom_id,school_id,grade_code,scheme,reinforcement_method,updated_by)
 select dest.id,dest.school_id,p.grade_code,p.scheme,p.reinforcement_method,aulanexo_private.actor_uid() from public.academic_years sy join public.classrooms src on src.school_id=sy.school_id and src.academic_year=sy.year join public.academic_class_policies p on p.classroom_id=src.id join public.academic_years dy on dy.id=p_target_year and dy.school_id=sy.school_id join public.classrooms dest on dest.school_id=dy.school_id and dest.academic_year=dy.year and dest.name=src.name where sy.id=p_source_year
 on conflict(classroom_id) do nothing;
 return n;
end $$;
do $$declare tab text;begin foreach tab in array array['academic_class_policies','academic_reinforcements','academic_reinforcement_changes','promotion_batches'] loop
 execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy academic_director_read on public.%I for select to authenticated using(public.school_director(school_id))',tab);
 execute format('create trigger academic_signal after insert or update on public.%I for each row execute function aulanexo_private.touch_workspace()',tab);
 execute format('create trigger academic_audit after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',tab);
end loop;end $$;
revoke all on function aulanexo_private.dimension_total(uuid,uuid,uuid,uuid),aulanexo_private.next_grade(text),aulanexo_private.annual_outcome(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.save_academic_policy(uuid,text,text,text),public.authorize_reinforcement(uuid,uuid,uuid,uuid,text),public.save_reinforcement(uuid,integer,numeric,boolean),public.promotion_workspace(uuid,uuid,uuid),public.apply_annual_promotion(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_academic_policy(uuid,text,text,text),public.authorize_reinforcement(uuid,uuid,uuid,uuid,text),public.save_reinforcement(uuid,integer,numeric,boolean),public.promotion_workspace(uuid,uuid,uuid),public.apply_annual_promotion(uuid,uuid,uuid,jsonb) to authenticated;

-- A subsequent edit to original evidence invalidates the approval; history stays intact.
create function aulanexo_private.invalidate_reinforcement() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.assessments;r public.academic_reinforcements;updated public.academic_reinforcements;begin
 if TG_TABLE_NAME='assessment_scores' then
  if TG_OP='UPDATE' and (new.score,new.exempt) is not distinct from (old.score,old.exempt) then return new;end if;
  select * into a from public.assessments where id=new.assessment_id;
 else
  if (new.weight,new.max_score,new.dimension) is not distinct from (old.weight,old.max_score,old.dimension) then return new;end if;
  a:=new;
 end if;
 for r in select * from public.academic_reinforcements ar where ar.term_id=a.term_id and ar.classroom_id=a.classroom_id and ar.class_subject_id=a.class_subject_id and ar.status='approved' and (TG_TABLE_NAME='assessments' or ar.student_id=(to_jsonb(new)->>'student_id')::uuid) for update loop
  update public.academic_reinforcements set status='pending',approved_by=null,revision=revision+1,updated_by=aulanexo_private.actor_uid(),updated_at=now() where id=r.id returning * into updated;
  insert into public.academic_reinforcement_changes(school_id,reinforcement_id,actor_id,previous,current_value) values(r.school_id,r.id,aulanexo_private.actor_uid(),to_jsonb(r),to_jsonb(updated));
 end loop;
 return new;
end $$;
create trigger reinforcement_evidence_changed after insert or update on public.assessment_scores for each row execute function aulanexo_private.invalidate_reinforcement();
create trigger reinforcement_column_changed after update of weight,max_score,dimension on public.assessments for each row execute function aulanexo_private.invalidate_reinforcement();
revoke all on function aulanexo_private.invalidate_reinforcement() from public,anon,authenticated,service_role;

create function aulanexo_private.guard_promoted_results() returns trigger language plpgsql security definer set search_path='' as $$
declare source_id uuid:=case when TG_TABLE_NAME='academic_years' then new.id else (to_jsonb(new)->>'year_id')::uuid end;begin
 if old.status='closed' and new.status='open' and exists(select 1 from public.promotion_batches where source_year_id=source_id) then raise exception 'Esta gestión tiene reinscripciones anuales confirmadas. Sus resultados quedan conservados; solicita una revisión del lote antes de reabrir.';end if;
 return new;
end $$;
create trigger preserve_promoted_year before update of status on public.academic_years for each row execute function aulanexo_private.guard_promoted_results();
create trigger preserve_promoted_term before update of status on public.academic_terms for each row execute function aulanexo_private.guard_promoted_results();
revoke all on function aulanexo_private.guard_promoted_results() from public,anon,authenticated,service_role;
