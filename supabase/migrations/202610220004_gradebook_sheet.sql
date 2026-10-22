-- Column based gradebook. Qualitative labels are never silently converted to numbers.
create table public.gradebook_settings (
 school_id uuid primary key references public.schools(id),max_corrections integer not null default 3 check(max_corrections between 0 and 100),
 qualitative_labels text[] not null default array['Destacado','Logrado','En proceso','Necesita apoyo'],updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create table public.gradebook_rules (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),term_id uuid not null references public.academic_terms(id),
 classroom_id uuid not null references public.classrooms(id),class_subject_id uuid references public.class_subjects(id),
 method text not null check(method in ('weighted','average','sum')),updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now()
);
create unique index gradebook_rule_scope on public.gradebook_rules(term_id,classroom_id,coalesce(class_subject_id,'00000000-0000-0000-0000-000000000000'::uuid));
alter table public.assessments add grading_type text not null default 'numeric' check(grading_type in ('numeric','qualitative')),add qualitative_options text[] not null default '{}';
alter table public.assessment_scores add qualitative_score text,add revision integer not null default 1,add corrections integer not null default 0 check(corrections>=0);
create table public.assessment_score_changes (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),score_id uuid not null references public.assessment_scores(id),actor_id uuid not null references auth.users(id),previous jsonb not null,current_value jsonb not null,created_at timestamptz not null default now()
);
create function aulanexo_private.valid_grade_labels(labels text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(cardinality(labels) between 2 and 12 and not exists(select 1 from unnest(labels) l where l is null or length(btrim(l)) not between 1 and 60) and (select count(*)=count(distinct lower(btrim(l))) from unnest(labels) l),false);
$$;
create function public.save_gradebook_settings(p_school_id uuid,p_limit integer,p_labels text[]) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.school_director(p_school_id) then raise exception 'Solo Dirección configura los límites y las etiquetas.';end if;
 if p_limit is null or p_limit not between 0 and 100 or not aulanexo_private.valid_grade_labels(p_labels) then raise exception 'Indica de 0 a 100 correcciones y entre 2 y 12 etiquetas distintas.';end if;
 insert into public.gradebook_settings(school_id,max_corrections,qualitative_labels,updated_by) values(p_school_id,p_limit,p_labels,auth.uid())
 on conflict(school_id) do update set max_corrections=excluded.max_corrections,qualitative_labels=excluded.qualitative_labels,updated_by=auth.uid(),updated_at=now();
end $$;
create function public.save_gradebook_rule(p_term_id uuid,p_classroom_id uuid,p_subject_id uuid,p_method text) returns void language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;r public.classrooms;begin
 select * into t from public.academic_terms where id=p_term_id for update;select * into r from public.classrooms where id=p_classroom_id;
 if t.status is distinct from 'open' or t.school_id is distinct from r.school_id or not public.learning_can_manage(r.id,p_subject_id) or not exists(select 1 from public.academic_years where id=t.year_id and year=r.academic_year and status='open') then raise exception 'El cálculo corresponde a tu aula y materia en un periodo abierto.';end if;
 if p_subject_id is not null and not exists(select 1 from public.class_subjects where id=p_subject_id and classroom_id=r.id and active) then raise exception 'Selecciona una materia de esta aula.';end if;
 if p_method is null or p_method not in ('weighted','average','sum') then raise exception 'Elige promedio, promedio ponderado o suma.';end if;
 insert into public.gradebook_rules(school_id,term_id,classroom_id,class_subject_id,method,updated_by) values(t.school_id,t.id,r.id,p_subject_id,p_method,aulanexo_private.actor_uid())
 on conflict(term_id,classroom_id,(coalesce(class_subject_id,'00000000-0000-0000-0000-000000000000'::uuid))) do update set method=excluded.method,updated_by=excluded.updated_by,updated_at=now();
end $$;
-- Keep the existing assignment/course/term permission checks when adding column types.
do $$begin
 execute replace(pg_get_functiondef('public.save_assessment(jsonb)'::regprocedure),'FUNCTION public.save_assessment(', 'FUNCTION aulanexo_private.save_assessment_numeric(');
end $$;
revoke all on function aulanexo_private.save_assessment_numeric(jsonb) from public,anon,authenticated,service_role;
create function aulanexo_private.assessment_kind_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.grading_type='qualitative' and not aulanexo_private.valid_grade_labels(new.qualitative_options) then raise exception 'La columna cualitativa necesita etiquetas válidas.';end if;
 if TG_OP='UPDATE' and exists(select 1 from public.assessment_scores where assessment_id=old.id) and (new.grading_type<>old.grading_type or new.qualitative_options<>old.qualitative_options) then raise exception 'La columna con notas conserva su tipo y etiquetas. Crea una nueva columna para otra escala.';end if;
 return new;
end $$;
create trigger assessment_kind_guard before insert or update on public.assessments for each row execute function aulanexo_private.assessment_kind_guard();
create or replace function public.save_assessment(p_assessment jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;kind text;labels text[];oldrow public.assessments;begin
 select * into oldrow from public.assessments where id=nullif(p_assessment->>'id','')::uuid;
 kind:=coalesce(p_assessment->>'grading_type',oldrow.grading_type,'numeric');
 if kind not in ('numeric','qualitative') then raise exception 'Elige un tipo de calificación válido.';end if;
 if kind='qualitative' and nullif(p_assessment->>'assignment_id','') is not null then raise exception 'Las tareas puntuables se vinculan a columnas numéricas.';end if;
 target:=aulanexo_private.save_assessment_numeric(p_assessment);
 if kind='qualitative' then
  if p_assessment ? 'qualitative_options' then select array_agg(btrim(value) order by ordinal) into labels from jsonb_array_elements_text(p_assessment->'qualitative_options') with ordinality x(value,ordinal);
  else labels:=coalesce(nullif(oldrow.qualitative_options,'{}'),(select s.qualitative_labels from public.gradebook_settings s join public.assessments a on a.school_id=s.school_id where a.id=target),array['Destacado','Logrado','En proceso','Necesita apoyo']);end if;
 else labels:='{}';end if;
 update public.assessments set grading_type=kind,qualitative_options=labels where id=target;
 return target;
end $$;
-- Limits, history and closed-period protection are enforced for every write path.
create function aulanexo_private.guard_grade_score() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.assessments;t public.academic_terms;limit_value integer;begin
 select * into a from public.assessments where id=new.assessment_id;
 select * into t from public.academic_terms where id=a.term_id for update;
 if t.status is distinct from 'open' or not exists(select 1 from public.academic_years where id=t.year_id and status='open') then raise exception 'El periodo o la gestión está cerrado.';end if;
 if new.exempt then new.score:=null;new.qualitative_score:=null;
 elsif a.grading_type='qualitative' then
  if new.score is not null or (new.qualitative_score is not null and not new.qualitative_score=any(a.qualitative_options)) then raise exception 'Elige una de las etiquetas de esta evaluación.';end if;
 elsif new.qualitative_score is not null or new.score<0 or new.score>a.max_score or new.score::text in ('NaN','Infinity','-Infinity') then raise exception 'La nota debe estar entre cero y el máximo de la evaluación.';end if;
 if TG_OP='UPDATE' then
  if new.assessment_id<>old.assessment_id or new.student_id<>old.student_id or new.school_id<>old.school_id then raise exception 'La nota conserva su alumno y evaluación.';end if;
  if (new.score,new.qualitative_score,new.exempt,new.comment) is not distinct from (old.score,old.qualitative_score,old.exempt,old.comment) then return null;end if;
  select coalesce((select max_corrections from public.gradebook_settings where school_id=a.school_id),3) into limit_value;
  if old.corrections>=limit_value then raise exception 'Se alcanzó el límite de % correcciones permitido por Dirección.',limit_value;end if;
  new.corrections:=old.corrections+1;new.revision:=old.revision+1;
  insert into public.assessment_score_changes(school_id,score_id,actor_id,previous,current_value) values(a.school_id,old.id,aulanexo_private.actor_uid(),to_jsonb(old),jsonb_build_object('score',new.score,'qualitativeScore',new.qualitative_score,'exempt',new.exempt,'comment',new.comment,'revision',new.revision));
 else new.corrections:=0;new.revision:=1;end if;
 return new;
end $$;
create trigger guard_grade_score before insert or update on public.assessment_scores for each row execute function aulanexo_private.guard_grade_score();
create or replace function public.save_assessment_scores(p_assessment_id uuid,p_scores jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare a public.assessments;t public.academic_terms;row_value jsonb;student_value uuid;oldrow public.assessment_scores;counted integer:=0;changed integer;begin
 select * into a from public.assessments where id=p_assessment_id;
 select * into t from public.academic_terms where id=a.term_id for update;
 select * into a from public.assessments where id=p_assessment_id for update;
 if a.id is null or t.status<>'open' or not public.learning_can_manage(a.classroom_id,a.class_subject_id) then raise exception 'Solo el docente asignado o Dirección califica un periodo abierto.';end if;
 if jsonb_typeof(p_scores) is distinct from 'array' or jsonb_array_length(p_scores)>500 or (select count(*)<>count(distinct value->>'student_id') from jsonb_array_elements(p_scores)) then raise exception 'Envía hasta 500 notas distintas por operación.';end if;
 for row_value in select value from jsonb_array_elements(p_scores) loop
  student_value:=(row_value->>'student_id')::uuid;
  if not exists(select 1 from public.enrollment_history h where h.student_id=student_value and h.classroom_id=a.classroom_id and h.year_id=t.year_id and h.started_on<=t.ends_on and coalesce(h.ended_on,t.ends_on)>=t.starts_on) then raise exception 'La nota corresponde a un estudiante fuera de esta aula y periodo.';end if;
  select * into oldrow from public.assessment_scores where assessment_id=a.id and student_id=student_value for update;
  if row_value ? 'revision' and (row_value->>'revision')::integer is distinct from coalesce(oldrow.revision,0) then raise exception 'La nota cambió en otro dispositivo. Revisa la versión actual antes de guardar.';end if;
  insert into public.assessment_scores(school_id,assessment_id,student_id,score,qualitative_score,exempt,comment,updated_by)
  values(a.school_id,a.id,student_value,nullif(row_value->>'score','')::numeric,nullif(btrim(row_value->>'qualitative_score'),''),coalesce((row_value->>'exempt')::boolean,false),trim(coalesce(row_value->>'comment','')),aulanexo_private.actor_uid())
  on conflict(assessment_id,student_id) do update set score=excluded.score,qualitative_score=excluded.qualitative_score,exempt=excluded.exempt,comment=excluded.comment,updated_by=excluded.updated_by,updated_at=now();
  get diagnostics changed=row_count;counted:=counted+changed;
 end loop;return counted;
end $$;
create function aulanexo_private.grade_total(p_term uuid,p_student uuid,p_room uuid,p_subject uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with method as (select coalesce((select method from public.gradebook_rules where term_id=p_term and classroom_id=p_room and class_subject_id is not distinct from p_subject),'weighted') as value),
 marks as (select a.*,s.score,s.qualitative_score,coalesce(s.exempt,false) as exempt,s.comment from public.assessments a left join public.assessment_scores s on s.assessment_id=a.id and s.student_id=p_student where a.term_id=p_term and a.classroom_id=p_room and a.class_subject_id is not distinct from p_subject),
 totals as (select round(case (select value from method) when 'sum' then sum(score) filter(where grading_type='numeric' and not exempt) when 'average' then avg(score/max_score*100) filter(where grading_type='numeric' and not exempt) else sum(score/max_score*100*weight) filter(where grading_type='numeric' and not exempt)/nullif(sum(weight) filter(where grading_type='numeric' and not exempt and score is not null),0) end,2) as score,
 case when (select value from method)='sum' then sum(max_score) filter(where grading_type='numeric' and not exempt) else 100 end as max_score,
 count(*) filter(where not exempt and case when grading_type='qualitative' then qualitative_score is null else score is null end) as missing,count(*) as assessments,count(*) filter(where exempt) as exemptions,
 coalesce(jsonb_agg(jsonb_build_object('assessmentId',id,'title',title,'value',qualitative_score,'comment',comment)) filter(where grading_type='qualitative' and not exempt),'[]'::jsonb) as qualitative from marks)
 select to_jsonb(totals)||jsonb_build_object('method',(select value from method)) from totals;
$$;
-- Published snapshots use the same method and qualitative values as the live sheet.
create or replace function aulanexo_private.period_card(p_term uuid,p_student uuid,p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with subject_list as (select class_subject_id from public.assessments where term_id=p_term and classroom_id=p_room union select id from public.class_subjects where classroom_id=p_room and active),
 lines as (select sl.class_subject_id,coalesce(ss.name,'Desarrollo integral') as subject,aulanexo_private.grade_total(p_term,p_student,p_room,sl.class_subject_id) as total from subject_list sl left join public.class_subjects cs on cs.id=sl.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id)
 select jsonb_build_object('studentId',s.id,'studentName',concat_ws(' ',s.first_name,s.last_name),'schoolName',sch.name,'classroomId',r.id,'classroomName',r.name,'year',y.year,'yearId',y.id,'termId',t.id,'termName',t.name,'termWeight',t.weight,'startsOn',t.starts_on,'endsOn',t.ends_on,'scale',100,
 'complete',coalesce((select bool_and((total->>'missing')::int=0 and (total->>'assessments')::int>0) from lines),false),'subjects',coalesce((select jsonb_agg(total||jsonb_build_object('classSubjectId',class_subject_id,'subject',subject,'maxScore',total->'max_score') order by subject) from lines),'[]'::jsonb))
 from public.students s join public.schools sch on sch.id=s.school_id join public.classrooms r on r.id=p_room and r.school_id=s.school_id join public.academic_terms t on t.id=p_term and t.school_id=s.school_id join public.academic_years y on y.id=t.year_id where s.id=p_student;
$$;
create function public.gradebook_workspace(p_classroom_id uuid,p_subject_id uuid default null,p_term_id uuid default null,p_student_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r public.classrooms;t public.academic_terms;manager boolean;selected_year uuid;children uuid[];begin
 select * into r from public.classrooms where id=p_classroom_id;
 if r.id is null or not aulanexo_private.in_support_school(r.school_id) or not public.platform_school_enabled(r.school_id) then raise exception 'No tienes acceso a esta planilla.';end if;
 manager:=public.learning_can_manage(r.id,p_subject_id);
 if p_subject_id is not null and not exists(select 1 from public.class_subjects where id=p_subject_id and classroom_id=r.id and active) then raise exception 'La materia no corresponde al aula.';end if;
 if not manager and not exists(select 1 from public.students s where s.id=p_student_id and s.school_id=r.school_id and s.classroom_id=r.id and public.family_access(s.id) and aulanexo_private.financial_learning_access(s.id)) then raise exception 'Solo su familia con acceso habilitado puede consultar estas notas.';end if;
 select id into selected_year from public.academic_years where school_id=r.school_id and year=r.academic_year;
 if p_term_id is not null then select * into t from public.academic_terms where id=p_term_id and year_id=selected_year;
 else select * into t from public.academic_terms where year_id=selected_year order by ((now() at time zone 'America/La_Paz')::date between starts_on and ends_on) desc,starts_on desc limit 1;end if;
 if p_term_id is not null and t.id is null then raise exception 'El periodo no corresponde a la gestión del aula.';end if;
 select array_agg(distinct h.student_id) into children from public.enrollment_history h where h.classroom_id=r.id and h.year_id=selected_year and h.started_on<=t.ends_on and coalesce(h.ended_on,t.ends_on)>=t.starts_on and (manager or h.student_id=p_student_id);
 return jsonb_build_object('canManage',manager,'canConfigure',public.school_director(r.school_id),'schoolId',r.school_id,'termId',t.id,
 'terms',coalesce((select jsonb_agg(to_jsonb(a) order by starts_on) from public.academic_terms a where year_id=selected_year),'[]'::jsonb),
 'settings',jsonb_build_object('maxCorrections',coalesce((select max_corrections from public.gradebook_settings where school_id=r.school_id),3),'labels',coalesce((select qualitative_labels from public.gradebook_settings where school_id=r.school_id),array['Destacado','Logrado','En proceso','Necesita apoyo'])),
 'method',coalesce((select method from public.gradebook_rules where term_id=t.id and classroom_id=r.id and class_subject_id is not distinct from p_subject_id),'weighted'),
 'assessments',coalesce((select jsonb_agg(to_jsonb(a) order by assessment_date,created_at,id) from public.assessments a where term_id=t.id and classroom_id=r.id and class_subject_id is not distinct from p_subject_id),'[]'::jsonb),
 'roster',coalesce((select jsonb_agg(jsonb_build_object('studentId',s.id,'studentName',concat_ws(' ',s.first_name,s.last_name),'total',aulanexo_private.grade_total(t.id,s.id,r.id,p_subject_id)) order by s.last_name,s.first_name) from public.students s where s.id=any(children)),'[]'::jsonb),
 'scores',coalesce((select jsonb_agg(to_jsonb(s)) from public.assessment_scores s join public.assessments a on a.id=s.assessment_id where a.term_id=t.id and a.classroom_id=r.id and a.class_subject_id is not distinct from p_subject_id and s.student_id=any(children)),'[]'::jsonb));
end $$;
-- Optional scorable tasks create their column in the same transaction.
do $$begin
 execute replace(pg_get_functiondef('public.save_assignment(jsonb)'::regprocedure),'FUNCTION public.save_assignment(', 'FUNCTION aulanexo_private.save_assignment_without_gradebook(');
end $$;
revoke all on function aulanexo_private.save_assignment_without_gradebook(jsonb) from public,anon,authenticated,service_role;
create or replace function public.save_assignment(p_assignment jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;linked public.assessments;task public.assignments;column_id uuid;begin
 target:=aulanexo_private.save_assignment_without_gradebook(p_assignment);select * into task from public.assignments where id=target;
 if coalesce((p_assignment->>'gradeable')::boolean,false) then
  if task.status='draft' then raise exception 'Publica la tarea para crear su columna de notas.';end if;
  if nullif(p_assignment->>'term_id','') is null then raise exception 'Elige el periodo de la tarea puntuable.';end if;
  select * into linked from public.assessments where assignment_id=target and term_id=(p_assignment->>'term_id')::uuid;
  column_id:=public.save_assessment(jsonb_build_object('id',linked.id,'term_id',p_assignment->>'term_id','classroom_id',task.classroom_id,'class_subject_id',task.class_subject_id,'assignment_id',target,'title',task.title,'assessment_date',p_assignment->>'assessment_date','max_score',task.max_score,'weight',coalesce(nullif(p_assignment->>'grade_weight','')::numeric,1)));
  if linked.id is null then perform public.import_assignment_scores(column_id);end if;
 elsif exists(select 1 from public.assessments where assignment_id=target and max_score<>task.max_score) then raise exception 'La tarea vinculada conserva su máximo; edita su evaluación junto con la tarea.';end if;
 return target;
end $$;
create function aulanexo_private.sync_assignment_grade() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.assessments;oldscore public.assessment_scores;begin
 if new.status<>'reviewed' or new.score is null then return new;end if;
 for a in select * from public.assessments where assignment_id=new.assignment_id loop
  select * into oldscore from public.assessment_scores where assessment_id=a.id and student_id=new.student_id;
  perform public.save_assessment_scores(a.id,jsonb_build_array(jsonb_build_object('student_id',new.student_id,'score',new.score,'comment',new.feedback,'revision',coalesce(oldscore.revision,0))));
 end loop;return new;
end $$;
create trigger sync_assignment_grade after insert or update of score,status,feedback on public.assignment_submissions for each row execute function aulanexo_private.sync_assignment_grade();
-- New settings/rules/history use the same tenant signal and audit system.
do $$declare name text;begin
 foreach name in array array['gradebook_settings','gradebook_rules','assessment_score_changes'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated,service_role',name);execute format('grant select on public.%I to authenticated',name);
  execute format('create policy gradebook_staff on public.%I for select to authenticated using(public.has_school_role(school_id,array[''director'',''teacher'']) and aulanexo_private.in_support_school(school_id) and public.platform_school_enabled(school_id))',name);
  execute format('create trigger workspace_changed after insert or update on public.%I for each row execute function aulanexo_private.touch_workspace()',name);
 end loop;
end $$;
create trigger gradebook_settings_audit after insert or update on public.gradebook_settings for each row execute function aulanexo_private.capture_audit();
create trigger gradebook_rules_audit after insert or update on public.gradebook_rules for each row execute function aulanexo_private.capture_audit();
revoke all on function aulanexo_private.valid_grade_labels(text[]),aulanexo_private.assessment_kind_guard(),aulanexo_private.guard_grade_score(),aulanexo_private.grade_total(uuid,uuid,uuid,uuid),aulanexo_private.sync_assignment_grade() from public,anon,authenticated,service_role;
revoke all on function public.save_gradebook_settings(uuid,integer,text[]),public.save_gradebook_rule(uuid,uuid,uuid,text),public.gradebook_workspace(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.save_gradebook_settings(uuid,integer,text[]),public.save_gradebook_rule(uuid,uuid,uuid,text),public.gradebook_workspace(uuid,uuid,uuid,uuid) to authenticated;

drop policy gradebook_staff on public.assessment_score_changes;
create policy score_history_scope on public.assessment_score_changes for select to authenticated using(exists(select 1 from public.assessment_scores s join public.assessments a on a.id=s.assessment_id where s.id=score_id and public.learning_can_manage(a.classroom_id,a.class_subject_id)));
