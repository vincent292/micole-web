-- Evaluación configurable sobre 100. Pesos relativos, exenciones y libretas publicadas.
create table public.academic_terms (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),year_id uuid not null,
 name text not null check(length(trim(name)) between 2 and 100),starts_on date not null,ends_on date not null,
 weight numeric(8,2) not null default 1 check(weight>0 and weight<=1000),status text not null default 'open' check(status in ('open','closed')),
 closed_at timestamptz,closed_by uuid references auth.users(id),revision integer not null default 0,
 unique(year_id,name),unique(id,school_id),foreign key(year_id,school_id) references public.academic_years(id,school_id),check(ends_on>=starts_on)
);
create table public.assessments (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),term_id uuid not null,
 classroom_id uuid not null,class_subject_id uuid references public.class_subjects(id),assignment_id uuid references public.assignments(id),
 title text not null check(length(trim(title)) between 2 and 160),assessment_date date not null,
 max_score numeric(10,2) not null default 100 check(max_score>0 and max_score<=10000),
 weight numeric(8,2) not null default 1 check(weight>0 and weight<=1000),created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(id,school_id),foreign key(term_id,school_id) references public.academic_terms(id,school_id),foreign key(classroom_id,school_id) references public.classrooms(id,school_id)
);
create unique index assessment_assignment_once on public.assessments(term_id,assignment_id) where assignment_id is not null;
create table public.assessment_scores (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),assessment_id uuid not null,student_id uuid not null,
 score numeric(10,2),exempt boolean not null default false,comment text not null default '' check(length(comment)<=2000),
 updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(assessment_id,student_id),
 foreign key(assessment_id,school_id) references public.assessments(id,school_id),foreign key(student_id,school_id) references public.students(id,school_id),
 check(not exempt or (score is null and length(trim(comment))>=5)),check(score is null or score>=0)
);
create index scores_student on public.assessment_scores(student_id);
create table public.report_cards (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),term_id uuid not null,student_id uuid not null,classroom_id uuid not null,
 content jsonb not null,revision integer not null,published_at timestamptz not null default now(),revoked_at timestamptz,
 unique(term_id,student_id,classroom_id,revision),foreign key(term_id,school_id) references public.academic_terms(id,school_id),
 foreign key(student_id,school_id) references public.students(id,school_id),foreign key(classroom_id,school_id) references public.classrooms(id,school_id)
);
create index report_cards_child on public.report_cards(student_id,term_id);

create function public.save_academic_term(p_term jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare y public.academic_years;oldrow public.academic_terms;target uuid:=coalesce(nullif(p_term->>'id','')::uuid,gen_random_uuid());start_value date:=(p_term->>'starts_on')::date;end_value date:=(p_term->>'ends_on')::date;begin
 select * into y from public.academic_years where id=(p_term->>'year_id')::uuid for update;
 if y.id is null or y.status<>'open' or not public.school_director(y.school_id) then raise exception 'Solo Dirección configura periodos de una gestión abierta.';end if;
 select * into oldrow from public.academic_terms where id=target for update;
 if oldrow.id is not null and (oldrow.year_id<>y.id or oldrow.status='closed') then raise exception 'Conserva la gestión de un periodo abierto.';end if;
 if start_value<y.starts_on or end_value>y.ends_on then raise exception 'El periodo debe estar dentro de las fechas de la gestión.';end if;
 if exists(select 1 from public.academic_terms where year_id=y.id and id<>target and starts_on<=end_value and ends_on>=start_value) then raise exception 'Los periodos no pueden superponerse.';end if;
 if exists(select 1 from public.assessments where term_id=target and (assessment_date<start_value or assessment_date>end_value)) then raise exception 'Las nuevas fechas dejarían evaluaciones fuera del periodo.';end if;
 insert into public.academic_terms(id,school_id,year_id,name,starts_on,ends_on,weight) values(target,y.school_id,y.id,trim(p_term->>'name'),start_value,end_value,(p_term->>'weight')::numeric)
 on conflict(id) do update set name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on,weight=excluded.weight;
 return target;
end $$;
create function public.save_assessment(p_assessment jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;r public.classrooms;oldrow public.assessments;a public.assignments;target uuid:=coalesce(nullif(p_assessment->>'id','')::uuid,gen_random_uuid());subject_value uuid:=nullif(p_assessment->>'class_subject_id','')::uuid;assignment_value uuid:=nullif(p_assessment->>'assignment_id','')::uuid;max_value numeric:=(p_assessment->>'max_score')::numeric;begin
 select * into t from public.academic_terms where id=(p_assessment->>'term_id')::uuid for update;
 select * into r from public.classrooms where id=(p_assessment->>'classroom_id')::uuid;
 if t.id is null or t.status<>'open' or r.id is null or t.school_id<>r.school_id or not public.learning_can_manage(r.id,subject_value) or not exists(select 1 from public.academic_years where id=t.year_id and year=r.academic_year and status='open') then raise exception 'Selecciona un periodo abierto y un aula/materia que puedas evaluar.';end if;
 if (p_assessment->>'assessment_date')::date not between t.starts_on and t.ends_on then raise exception 'La evaluación debe estar dentro del periodo.';end if;
 if r.subjects_enabled and subject_value is null then raise exception 'Selecciona la materia de esta evaluación.';end if;
 if subject_value is not null and not exists(select 1 from public.class_subjects where id=subject_value and classroom_id=r.id and active) then raise exception 'La materia no corresponde al aula.';end if;
 select * into oldrow from public.assessments where id=target for update;
 if oldrow.id is not null and (oldrow.term_id<>t.id or oldrow.classroom_id<>r.id or oldrow.class_subject_id is distinct from subject_value or oldrow.assignment_id is distinct from assignment_value) then raise exception 'Conserva el periodo, aula, materia y tarea de la evaluación.';end if;
 if assignment_value is not null then
  select * into a from public.assignments where id=assignment_value;
  if a.id is null or a.classroom_id<>r.id or a.class_subject_id is distinct from subject_value or a.status='draft' then raise exception 'Selecciona una tarea publicada de esta aula y materia.';end if;
  max_value:=a.max_score;
 end if;
 if exists(select 1 from public.assessment_scores where assessment_id=target and score>max_value) then raise exception 'El máximo no puede ser menor a una nota registrada.';end if;
 insert into public.assessments(id,school_id,term_id,classroom_id,class_subject_id,assignment_id,title,assessment_date,max_score,weight,created_by)
 values(target,t.school_id,t.id,r.id,subject_value,assignment_value,trim(p_assessment->>'title'),(p_assessment->>'assessment_date')::date,max_value,(p_assessment->>'weight')::numeric,aulanexo_private.actor_uid())
 on conflict(id) do update set title=excluded.title,assessment_date=excluded.assessment_date,max_score=excluded.max_score,weight=excluded.weight;
 return target;
end $$;
create function public.save_assessment_scores(p_assessment_id uuid,p_scores jsonb) returns integer language plpgsql security definer set search_path='' as $$
declare a public.assessments;t public.academic_terms;row_value jsonb;student_value uuid;score_value numeric;exempt_value boolean;counted integer:=0;begin
 select * into a from public.assessments where id=p_assessment_id;
 select * into t from public.academic_terms where id=a.term_id for update;
 select * into a from public.assessments where id=p_assessment_id for update;
 if a.id is null or t.status<>'open' or not public.learning_can_manage(a.classroom_id,a.class_subject_id) then raise exception 'Solo el docente asignado o Dirección califica un periodo abierto.';end if;
 if jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)>500 then raise exception 'Envía hasta 500 notas por operación.';end if;
 for row_value in select value from jsonb_array_elements(p_scores) loop
  student_value:=(row_value->>'student_id')::uuid;score_value:=nullif(row_value->>'score','')::numeric;exempt_value:=coalesce((row_value->>'exempt')::boolean,false);
  if not exists(select 1 from public.enrollment_history h where h.student_id=student_value and h.classroom_id=a.classroom_id and h.year_id=t.year_id and h.started_on<=t.ends_on and coalesce(h.ended_on,t.ends_on)>=t.starts_on) then raise exception 'La nota corresponde a un estudiante fuera de esta aula y periodo.';end if;
  if score_value::text in ('NaN','Infinity','-Infinity') or score_value<0 or score_value>a.max_score then raise exception 'La nota debe estar entre cero y el máximo de la evaluación.';end if;
  insert into public.assessment_scores(school_id,assessment_id,student_id,score,exempt,comment,updated_by)
  values(a.school_id,a.id,student_value,score_value,exempt_value,trim(coalesce(row_value->>'comment','')),aulanexo_private.actor_uid())
  on conflict(assessment_id,student_id) do update set score=excluded.score,exempt=excluded.exempt,comment=excluded.comment,updated_by=excluded.updated_by,updated_at=now();counted:=counted+1;
 end loop;
 return counted;
end $$;
create function public.import_assignment_scores(p_assessment_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare a public.assessments;rows_value jsonb;begin
 select * into a from public.assessments where id=p_assessment_id;
 if a.id is null or a.assignment_id is null or not public.learning_can_manage(a.classroom_id,a.class_subject_id) then raise exception 'Selecciona una evaluación vinculada a una tarea de tu materia.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('student_id',s.student_id,'score',round(s.score/a2.max_score*a.max_score,2),'comment',s.feedback)),'[]'::jsonb) into rows_value
 from public.assignment_submissions s join public.assignments a2 on a2.id=s.assignment_id where s.assignment_id=a.assignment_id and s.status='reviewed' and s.score is not null
 and exists(select 1 from public.enrollment_history h join public.academic_terms t on t.year_id=h.year_id where h.student_id=s.student_id and h.classroom_id=a.classroom_id and t.id=a.term_id and h.started_on<=t.ends_on and coalesce(h.ended_on,t.ends_on)>=t.starts_on);
 return public.save_assessment_scores(a.id,rows_value);
end $$;
-- Snapshot calculado con todas las evaluaciones, sin convertir faltantes en ceros.
create function aulanexo_private.period_card(p_term uuid,p_student uuid,p_room uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with subject_list as (
 select class_subject_id from public.assessments where term_id=p_term and classroom_id=p_room
 union select id from public.class_subjects where classroom_id=p_room and active
 ), lines as (
 select sl.class_subject_id,coalesce(ss.name,'Desarrollo integral') as subject,
 round(sum(case when not coalesce(sc.exempt,false) then (sc.score/a.max_score)*100*a.weight end)/nullif(sum(case when not coalesce(sc.exempt,false) and sc.score is not null then a.weight end),0),2) as score,
 case when count(a.id)=0 then 1 else count(*) filter(where not coalesce(sc.exempt,false) and sc.score is null)::integer end as missing,
 count(a.id)::integer as assessments,count(*) filter(where sc.exempt)::integer as exemptions
 from subject_list sl left join public.assessments a on a.term_id=p_term and a.classroom_id=p_room and a.class_subject_id is not distinct from sl.class_subject_id
 left join public.assessment_scores sc on sc.assessment_id=a.id and sc.student_id=p_student
 left join public.class_subjects cs on cs.id=sl.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id
 group by sl.class_subject_id,ss.name
 )
 select jsonb_build_object('studentId',s.id,'studentName',concat_ws(' ',s.first_name,s.last_name),'schoolName',sch.name,'classroomId',r.id,'classroomName',r.name,'year',y.year,'yearId',y.id,'termId',t.id,'termName',t.name,'termWeight',t.weight,'startsOn',t.starts_on,'endsOn',t.ends_on,'scale',100,
 'complete',coalesce((select bool_and(missing=0) from lines),false),'subjects',coalesce((select jsonb_agg(jsonb_build_object('classSubjectId',class_subject_id,'subject',subject,'score',score,'missing',missing,'assessments',assessments,'exemptions',exemptions) order by subject) from lines),'[]'::jsonb))
 from public.students s join public.schools sch on sch.id=s.school_id join public.classrooms r on r.id=p_room and r.school_id=s.school_id join public.academic_terms t on t.id=p_term and t.school_id=s.school_id join public.academic_years y on y.id=t.year_id where s.id=p_student;
$$;
revoke all on function aulanexo_private.period_card(uuid,uuid,uuid) from public,anon,authenticated;
create function public.close_academic_term(p_term_id uuid) returns integer language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;y public.academic_years;h record;card jsonb;counted integer:=0;begin
 select * into t from public.academic_terms where id=p_term_id;
 select * into y from public.academic_years where id=t.year_id for update;
 select * into t from public.academic_terms where id=p_term_id for update;
 if t.id is null or not public.school_director(t.school_id) or y.status<>'open' then raise exception 'Solo Dirección cierra periodos de una gestión abierta.';end if;
 if t.status='closed' then return 0;end if;
 for h in select distinct student_id,classroom_id from public.enrollment_history where year_id=t.year_id and started_on<=t.ends_on and coalesce(ended_on,t.ends_on)>=t.starts_on and exists(select 1 from public.assessments a where a.classroom_id=enrollment_history.classroom_id and a.term_id=t.id) order by student_id,classroom_id loop
  card:=aulanexo_private.period_card(t.id,h.student_id,h.classroom_id);
  if not coalesce((card->>'complete')::boolean,false) then raise exception 'Faltan notas para %. Completa las evaluaciones o registra una exención con motivo.',card->>'studentName';end if;
  insert into public.report_cards(school_id,term_id,student_id,classroom_id,content,revision) values(t.school_id,t.id,h.student_id,h.classroom_id,card,t.revision+1);counted:=counted+1;
 end loop;
 if counted=0 then raise exception 'No hay estudiantes y evaluaciones para publicar en este periodo.';end if;
 update public.academic_terms set status='closed',closed_at=now(),closed_by=aulanexo_private.actor_uid(),revision=revision+1 where id=t.id;
 return counted;
end $$;
create function public.reopen_academic_term(p_term_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;y public.academic_years;begin
 select * into t from public.academic_terms where id=p_term_id;select * into y from public.academic_years where id=t.year_id for update;select * into t from public.academic_terms where id=p_term_id for update;
 if t.id is null or not public.school_director(t.school_id) or y.status<>'open' then raise exception 'Solo Dirección reabre periodos de una gestión abierta.';end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Explica el motivo de reapertura (5 a 500 caracteres).';end if;
 if t.status<>'closed' then raise exception 'El periodo ya está abierto.';end if;
 update public.report_cards set revoked_at=now() where term_id=t.id and revoked_at is null;
 update public.academic_terms set status='open',closed_at=null,closed_by=null where id=t.id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(t.school_id,auth.uid(),'Dirección','academic_terms',t.id,'REOPEN',jsonb_build_object('reason',trim(p_reason)));
end $$;
create function public.set_academic_year_status(p_year_id uuid,p_closed boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare y public.academic_years;begin
 select * into y from public.academic_years where id=p_year_id for update;
 if y.id is null or not public.school_director(y.school_id) then raise exception 'Solo Dirección cierra o reabre gestiones.';end if;
 if p_closed is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Indica un motivo de 5 a 500 caracteres.';end if;
 if p_closed and exists(select 1 from public.academic_terms where year_id=y.id and status='open') then raise exception 'Cierra los periodos antes de cerrar la gestión.';end if;
 update public.academic_years set status=case when p_closed then 'closed' else 'open' end,closed_at=case when p_closed then now() end where id=y.id;
 -- La gestión académica no da de baja alumnos ni altera los cobros recurrentes.
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(y.school_id,auth.uid(),'Dirección','academic_years',y.id,case when p_closed then 'CLOSE' else 'REOPEN' end,jsonb_build_object('reason',trim(p_reason)));
end $$;

-- Una gestión cerrada conserva fechas que ya contienen periodos.
create function aulanexo_private.validate_year_dates() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.academic_terms where year_id=new.id and (starts_on<new.starts_on or ends_on>new.ends_on)) then raise exception 'Las fechas de la gestión deben contener todos sus periodos.';end if;return new;
end $$;
create trigger year_dates before update of starts_on,ends_on on public.academic_years for each row execute function aulanexo_private.validate_year_dates();
revoke all on function aulanexo_private.validate_year_dates() from public,anon,authenticated;
do $$ declare name text;begin
 foreach name in array array['academic_terms','assessments','assessment_scores','report_cards'] loop
  execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant select on public.%I to authenticated',name);
  execute format('create policy operation_scope on public.%I as restrictive for all to authenticated using(not public.is_platform_admin() and aulanexo_private.in_support_school(school_id))',name);
  execute format('create trigger gradebook_signal after insert or update or delete on public.%I for each row execute function aulanexo_private.touch_workspace()',name);
  execute format('create trigger gradebook_audit after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',name);
 end loop;
end $$;
create policy terms_read on public.academic_terms for select to authenticated using(public.school_director(school_id) or exists(select 1 from public.classrooms r join public.academic_years y on y.school_id=r.school_id and y.year=r.academic_year where y.id=academic_terms.year_id and public.may_edit_classroom(r.school_id,r.id)) or (status='closed' and exists(select 1 from public.report_cards c where c.term_id=academic_terms.id and public.family_access(c.student_id) and c.revoked_at is null)));
create policy assessments_read on public.assessments for select to authenticated using(public.learning_can_manage(classroom_id,class_subject_id));
create policy scores_read on public.assessment_scores for select to authenticated using(exists(select 1 from public.assessments a where a.id=assessment_id and public.learning_can_manage(a.classroom_id,a.class_subject_id)));
create policy report_cards_read on public.report_cards for select to authenticated using(public.school_director(school_id) or public.may_edit_classroom(school_id,classroom_id) or (revoked_at is null and public.family_access(student_id)));
revoke all on function public.save_academic_term(jsonb),public.save_assessment(jsonb),public.save_assessment_scores(uuid,jsonb),public.import_assignment_scores(uuid),public.close_academic_term(uuid),public.reopen_academic_term(uuid,text),public.set_academic_year_status(uuid,boolean,text) from public,anon;
grant execute on function public.save_academic_term(jsonb),public.save_assessment(jsonb),public.save_assessment_scores(uuid,jsonb),public.import_assignment_scores(uuid),public.close_academic_term(uuid),public.reopen_academic_term(uuid,text),public.set_academic_year_status(uuid,boolean,text) to authenticated;
