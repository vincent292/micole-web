-- Read-only institution aggregates. No pupil identifiers, names, or raw marks leave this RPC.
create index if not exists audit_metrics_scope on public.audit_events(school_id,created_at,entity,action);
create index if not exists payments_metrics_date on public.school_payments(paid_at,charge_id) where verification_state='verified';
create function public.platform_school_metrics(p_from date,p_to date,p_group text default 'week',p_school_id uuid default null,p_classroom_id uuid default null,p_environment text default 'production')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;start_at timestamptz;end_at timestamptz;
begin
 if auth.uid() is null or not public.is_platform_admin() or aulanexo_private.support_id() is not null then raise exception 'Solo Superadministración puede consultar estas métricas.';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or not isfinite(p_from) or not isfinite(p_to) then raise exception 'Elige un rango válido de hasta 367 días.';end if;
 if p_group is null or p_group not in ('week','month') or p_environment is null or p_environment not in ('production','testing','all') then raise exception 'Agrupación o entorno inválido.';end if;
 if p_school_id is not null and not exists(select 1 from public.schools s where s.id=p_school_id and (p_environment='all' or (p_environment='testing')=exists(select 1 from aulanexo_private.test_institutions t where t.school_id=s.id))) then raise exception 'El colegio no corresponde al entorno seleccionado.';end if;
 if p_classroom_id is not null and (p_school_id is null or not exists(select 1 from public.classrooms where id=p_classroom_id and school_id=p_school_id)) then raise exception 'Selecciona un curso del colegio elegido.';end if;
 start_at:=p_from::timestamp at time zone 'America/La_Paz';end_at:=(p_to+1)::timestamp at time zone 'America/La_Paz';
 with catalog as materialized (
  select s.id,s.name,s.status,exists(select 1 from aulanexo_private.test_institutions t where t.school_id=s.id) testing from public.schools s
  where p_environment='all' or (p_environment='testing')=exists(select 1 from aulanexo_private.test_institutions t where t.school_id=s.id)
 ), schools as materialized (select * from catalog where p_school_id is null or id=p_school_id),
 pupils as materialized (select s.* from public.students s join schools c on c.id=s.school_id where p_classroom_id is null or s.classroom_id=p_classroom_id),
 additions as materialized (select e.school_id,e.entity_id, min(e.created_at) created_at from public.audit_events e join schools s on s.id=e.school_id join pupils p on p.id=e.entity_id where e.entity='students' and e.action='INSERT' group by e.school_id,e.entity_id),
 charges as materialized (select c.*,greatest(c.amount-c.paid_amount,0) balance from public.school_charges c join pupils p on p.id=c.student_id where c.status<>'cancelled' and c.due_date between p_from and p_to),
 payments as materialized (select c.school_id,c.student_id,p.amount,p.paid_at from public.school_payments p join public.school_charges c on c.id=p.charge_id join pupils s on s.id=c.student_id where p.verification_state='verified' and p.paid_at>=start_at and p.paid_at<end_at),
 attendance as materialized (select r.school_id,r.student_id,(aulanexo_private.attendance_effective(r.id)->>'status') status,s.attendance_date from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id join pupils p on p.id=r.student_id where s.status='confirmed' and s.attendance_date between p_from and p_to),
 -- Full current period totals reuse the very same grading and reinforcement rules as the gradebook.
 pairs as materialized (select distinct a.school_id,a.term_id,a.classroom_id,a.class_subject_id,h.student_id,t.name term_name,t.starts_on,t.ends_on from public.assessments a join public.academic_terms t on t.id=a.term_id join schools sc on sc.id=a.school_id join public.enrollment_history h on h.classroom_id=a.classroom_id and h.year_id=t.year_id and h.started_on<=t.ends_on and coalesce(h.ended_on,t.ends_on)>=t.starts_on where t.starts_on<=p_to and t.ends_on>=p_from and (p_classroom_id is null or a.classroom_id=p_classroom_id)),
 totals as materialized (select p.*,aulanexo_private.grade_total(term_id,student_id,classroom_id,class_subject_id) total from pairs p),
 grades as materialized (select t.*,case when (total->>'missing')::int=0 and (total->>'max_score')::numeric>0 then (total->>'score')::numeric/(total->>'max_score')::numeric*100 end value, exists(select 1 from public.academic_class_policies pol where pol.classroom_id=t.classroom_id and pol.scheme='bolivia2026') official from totals t),
 subjects as (select g.school_id,sc.name school,g.classroom_id,r.name classroom,g.term_id,g.term_name,g.starts_on,g.ends_on,coalesce(ss.name,'Desarrollo integral') subject,g.class_subject_id,
  round(avg(g.value),2) average,count(g.value) completed,count(*)-count(g.value) incomplete,count(distinct g.student_id) enrolled,
  count(*) filter(where g.official and g.value<51) below_minimum,count(g.value) filter(where g.official) risk_evaluated
  from grades g join schools sc on sc.id=g.school_id join public.classrooms r on r.id=g.classroom_id left join public.class_subjects cs on cs.id=g.class_subject_id left join public.school_subjects ss on ss.id=cs.subject_id
  group by g.school_id,sc.name,g.classroom_id,r.name,g.term_id,g.term_name,g.starts_on,g.ends_on,ss.name,g.class_subject_id),
 activity as materialized (select e.* from public.audit_events e join schools s on s.id=e.school_id where e.created_at>=start_at and e.created_at<end_at),
 views as materialized (select e.* from public.content_view_events e join schools s on s.id=e.school_id where e.viewed_at>=start_at and e.viewed_at<end_at),
 module_events as (select entity module, count(*) filter(where action='INSERT') registrations,count(*) filter(where action='UPDATE') updates,0::bigint consultations from activity group by entity union all select 'consulta:'||content_kind,0,0,count(*) from views group by content_kind),
 usage as (select module,sum(registrations) registrations,sum(updates) updates,sum(consultations) consultations from module_events group by module),
 buckets as (select d::date bucket,greatest(d::date,p_from) first_day,least((d+case when p_group='week' then interval '6 days' else interval '1 month - 1 day' end)::date,p_to) last_day from generate_series(date_trunc(p_group,p_from::timestamp),date_trunc(p_group,p_to::timestamp),case when p_group='week' then interval '1 week' else interval '1 month' end) d),
 trend as (select b.first_day "from",b.last_day "to",
  (select count(*) from additions a where (a.created_at at time zone 'America/La_Paz')::date between b.first_day and b.last_day) "newStudents",
  coalesce((select sum(p.amount) from payments p where (p.paid_at at time zone 'America/La_Paz')::date between b.first_day and b.last_day),0) collected,
  (select count(distinct p.student_id) from payments p where (p.paid_at at time zone 'America/La_Paz')::date between b.first_day and b.last_day) "studentsPaid",
  (select count(*) from activity a where a.action='INSERT' and (a.created_at at time zone 'America/La_Paz')::date between b.first_day and b.last_day) registrations,
  (select count(*) from views v where (v.viewed_at at time zone 'America/La_Paz')::date between b.first_day and b.last_day) consultations from buckets b),
 school_rows as (select s.id,s.name,s.testing,s.status,
  (select count(*) from pupils p where p.school_id=s.id and p.status='active') "activeStudents",
  (select count(*) from additions a where a.school_id=s.id and a.created_at>=start_at and a.created_at<end_at) "newStudents",
  (select count(distinct p.student_id) from payments p where p.school_id=s.id) "studentsPaid",
  coalesce((select sum(p.amount) from payments p where p.school_id=s.id),0) collected,
  coalesce((select sum(c.balance) from charges c where c.school_id=s.id),0) outstanding,
  (select count(distinct c.student_id) from charges c where c.school_id=s.id and c.balance>0) "studentsPending",
  (select round(avg(g.value),2) from grades g where g.school_id=s.id) average,
  (select count(distinct g.student_id) from grades g where g.school_id=s.id and g.official and g.value<51) "studentsAtRisk",
  (select count(*) from activity a where a.school_id=s.id and a.action='INSERT') registrations from schools s)
 select jsonb_build_object('scope','platform-school-metrics','generatedAt',now(),'from',p_from,'to',p_to,'group',p_group,'environment',p_environment,'schoolId',p_school_id,'classroomId',p_classroom_id,
 'schools',coalesce((select jsonb_agg(to_jsonb(s) order by name,id) from catalog s),'[]'),
 'classrooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'year',academic_year) order by academic_year desc,name,id) from public.classrooms where school_id=p_school_id),'[]'),
 'summary',jsonb_build_object('schoolCount',(select count(*) from schools),'activeStudents',(select count(*) from pupils where status='active'),'newStudents',(select count(*) from additions where created_at>=start_at and created_at<end_at),'studentsPaid',(select count(distinct student_id) from payments),'collected',coalesce((select sum(amount) from payments),0),'due',coalesce((select sum(amount) from charges),0),'outstanding',coalesce((select sum(balance) from charges),0),'overdue',coalesce((select sum(balance) from charges where due_date<(now() at time zone 'America/La_Paz')::date),0),'studentsPending',(select count(distinct student_id) from charges where balance>0),'average',(select round(avg(value),2) from grades),'completedGrades',(select count(value) from grades),'incompleteGrades',(select count(*)-count(value) from grades),'studentsAtRisk',(select count(distinct student_id) from grades where official and value<51),'riskEvaluated',(select count(distinct student_id) from grades where official and value is not null),'registrations',(select count(*) from activity where action='INSERT'),'updates',(select count(*) from activity where action='UPDATE'),'consultations',(select count(*) from views),'activeActors',(select count(distinct actor) from (select actor_id actor from activity union select viewer_id from views) u),'present',(select count(*) from attendance where status='present'),'late',(select count(*) from attendance where status='late'),'absent',(select count(*) from attendance where status='absent'),'excused',(select count(*) from attendance where status='excused')),
 'institutions',coalesce((select jsonb_agg(to_jsonb(r) order by name,id) from school_rows r),'[]'),
 'subjects',coalesce((select jsonb_agg(to_jsonb(s) order by below_minimum desc,average asc nulls last,school,classroom,term_name,subject) from subjects s),'[]'),
 'usage',coalesce((select jsonb_agg(to_jsonb(u) order by registrations+updates+consultations desc,module) from usage u),'[]'),
 'trend',coalesce((select jsonb_agg(to_jsonb(t) order by "from") from trend t),'[]')) into result;
 return result;
end $$;
revoke all on function public.platform_school_metrics(date,date,text,uuid,uuid,text) from public,anon,service_role;
grant execute on function public.platform_school_metrics(date,date,text,uuid,uuid,text) to authenticated;
