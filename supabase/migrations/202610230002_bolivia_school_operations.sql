-- Bolivia: primary/secondary only. Initial and childcare retain their current rules.
-- No SIE submission, legacy charge rewrite, grade conversion or automatic promotion.
create function aulanexo_private.bolivia_room(p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when p.grade_code='initial' then false
  when p.grade_code ~ '^(primary|secondary)[1-6]$' then true
  else s.education_levels && array['Primaria','Secundaria']::text[] and lower(trim(r.level)) in ('primaria','secundaria') end
 from public.classrooms r join public.schools s on s.id=r.school_id left join public.academic_class_policies p on p.classroom_id=r.id where r.id=p_room),false);
$$;
create function aulanexo_private.bolivia_student(p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select aulanexo_private.bolivia_room(classroom_id) from public.students where id=p_student),false);
$$;
alter table public.classrooms add column bolivia_regular boolean not null default false;
create function aulanexo_private.bolivia_room_cache() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.classrooms set bolivia_regular=aulanexo_private.bolivia_room(id)
 where school_id=coalesce((to_jsonb(new)->>'school_id')::uuid,(to_jsonb(new)->>'id')::uuid)
 and bolivia_regular is distinct from aulanexo_private.bolivia_room(id);
 return new;
end $$;
create function aulanexo_private.bolivia_room_flag() returns trigger language plpgsql security definer set search_path='' as $$
declare grade text;begin
 select grade_code into grade from public.academic_class_policies where classroom_id=new.id;
 new.bolivia_regular:=case when grade='initial' then false when grade ~ '^(primary|secondary)[1-6]$' then true else exists(select 1 from public.schools s where s.id=new.school_id and s.education_levels && array['Primaria','Secundaria']::text[]) and lower(trim(new.level)) in ('primaria','secundaria') end;
 return new;
end $$;
create trigger bolivia_room_flag before insert or update on public.classrooms for each row execute function aulanexo_private.bolivia_room_flag();
create trigger bolivia_policy_cache after insert or update on public.academic_class_policies for each row execute function aulanexo_private.bolivia_room_cache();
create trigger bolivia_school_cache after update of education_levels on public.schools for each row execute function aulanexo_private.bolivia_room_cache();
update public.classrooms set bolivia_regular=aulanexo_private.bolivia_room(id);
do $$begin execute replace(pg_get_functiondef('public.save_school(jsonb)'::regprocedure),'FUNCTION public.save_school(','FUNCTION aulanexo_private.save_school_before_bolivia(');end $$;
revoke all on function aulanexo_private.save_school_before_bolivia(jsonb) from public,anon,authenticated,service_role;
create or replace function public.save_school(p_school jsonb) returns void language plpgsql security definer set search_path='' as $$
declare levels text[];begin
 perform aulanexo_private.save_school_before_bolivia(p_school);
 if p_school ? 'education_levels' then
  if jsonb_typeof(p_school->'education_levels') is distinct from 'array' then raise exception 'Selecciona los niveles de esta sede.';end if;
  select coalesce(array_agg(distinct value),'{}') into levels from jsonb_array_elements_text(p_school->'education_levels');
  if not levels <@ array['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros']::text[] then raise exception 'Nivel educativo no reconocido.';end if;
  update public.schools set education_levels=levels where id=(p_school->>'id')::uuid;
 end if;
end $$;
-- A missing internal materials list must not block a school enrollment.
do $$declare body text;begin
 body:=pg_get_functiondef('aulanexo_private.validate_admission_room(uuid,uuid,uuid)'::regprocedure);
 body:=replace(body,'if coalesce((select require_annual_materials','if not aulanexo_private.bolivia_room(p_room) and coalesce((select require_annual_materials');
 execute body;
end $$;

-- An active, linked school pupil retains learning access despite family arrears.
-- Enrollment status, verified identity, institution activation and RLS remain enforced.
create or replace function aulanexo_private.financial_learning_access(p_student uuid) returns boolean language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from public.students s where s.id=p_student and aulanexo_private.support_payment_bypass(s.school_id)) then return true;end if;
 if aulanexo_private.bolivia_student(p_student) then
  return exists(select 1 from public.students s join public.schools h on h.id=s.school_id where s.id=p_student and s.status='active' and h.status='active' and s.profile_complete and public.platform_school_enabled(h.id));
 end if;
 return aulanexo_private.financial_learning_access_billing(p_student);
end $$;
-- The student portal has an explicit JSON projection, unlike normal table reads.
do $$begin execute replace(pg_get_functiondef('public.student_portal()'::regprocedure),'FUNCTION public.student_portal(','FUNCTION aulanexo_private.student_portal_before_bolivia(');end $$;
revoke all on function aulanexo_private.student_portal_before_bolivia() from public,anon,authenticated,service_role;
create or replace function public.student_portal() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.student_portal_before_bolivia();begin
 return result||jsonb_build_object('classrooms',coalesce((select jsonb_agg(r||jsonb_build_object('boliviaRegular',aulanexo_private.bolivia_room((r->>'id')::uuid))) from jsonb_array_elements(result->'classrooms') r),'[]'));
end $$;

-- Newly issued primary/secondary plans include no separate MiCole or enrollment fee.
alter table public.payment_plans drop constraint payment_plans_license_fee_check;
alter table public.payment_plans add constraint payment_plans_license_fee_check check(license_fee between 0 and 1000000);
create function aulanexo_private.bolivia_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare y public.academic_years;begin
 if not aulanexo_private.bolivia_student(new.student_id) then return new;end if;
 select y0.* into y from public.academic_years y0 join public.students s on s.id=new.student_id join public.classrooms r on r.id=s.classroom_id where y0.school_id=s.school_id and y0.year=r.academic_year;
 if y.id is null or y.status<>'open' then raise exception 'Configura una gestión abierta para el plan escolar.';end if;
 if new.enrollment_fee<>0 or new.snack_fee<>0 then raise exception 'Primaria/secundaria: usa la pensión pactada, sin matrícula ni cargos adicionales en el plan.';end if;
 if new.months>10 or new.start_date<y.starts_on or (date_trunc('month',new.start_date)+make_interval(months=>new.months-1))::date>y.ends_on then raise exception 'El plan escolar debe estar dentro de la gestión y tener como máximo diez pensiones.';end if;
 if new.months+(select count(*) from public.school_charges where student_id=new.student_id and plan_id is not null and period is not null and due_date between y.starts_on and y.ends_on and status<>'cancelled')>10 then raise exception 'El estudiante ya tiene pensiones emitidas: el total de la gestión no puede superar diez.';end if;
 new.license_fee:=0;
 return new;
end $$;
create trigger zz_bolivia_plan before insert on public.payment_plans for each row execute function aulanexo_private.bolivia_plan();
do $$begin execute replace(pg_get_functiondef('public.create_payment_plan(jsonb)'::regprocedure),'FUNCTION public.create_payment_plan(','FUNCTION aulanexo_private.create_plan_before_bolivia(');end $$;
revoke all on function aulanexo_private.create_plan_before_bolivia(jsonb) from public,anon,authenticated,service_role;
create or replace function public.create_payment_plan(p_plan jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 if aulanexo_private.bolivia_student((p_plan->>'student_id')::uuid) then perform aulanexo_private.create_plan_before_bolivia(p_plan-'license_fee');
 else perform aulanexo_private.create_plan_before_bolivia(p_plan);end if;
end $$;
create function aulanexo_private.bolivia_charge() returns trigger language plpgsql security definer set search_path='' as $$begin
 if aulanexo_private.bolivia_student(new.student_id) then
  if new.plan_id is null or new.period is null or new.academic_request_id is not null then raise exception 'Primaria/secundaria: registra las pensiones mediante un plan; no se emiten cobros académicos adicionales.';end if;
  new.license_amount:=0;new.snack_amount:=0;new.amount:=greatest(0,new.base_amount-new.discount_amount);
 end if;
 return new;
end $$;
create trigger zz_bolivia_charge before insert on public.school_charges for each row execute function aulanexo_private.bolivia_charge();
-- Apply official period length/jornada only when a timetable includes a school room.
do $$begin execute replace(pg_get_functiondef('aulanexo_private.validate_timetable(uuid,jsonb,jsonb,boolean)'::regprocedure),'FUNCTION aulanexo_private.validate_timetable(','FUNCTION aulanexo_private.validate_timetable_before_bolivia(');end $$;
revoke all on function aulanexo_private.validate_timetable_before_bolivia(uuid,jsonb,jsonb,boolean) from public,anon,authenticated,service_role;
create or replace function aulanexo_private.validate_timetable(p_year uuid,c jsonb,entries jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare room uuid;day_value integer;period integer;pos integer;finish integer;slot_count integer;b jsonb;begin
 perform aulanexo_private.validate_timetable_before_bolivia(p_year,c,entries,p_complete);
 if not exists(select 1 from jsonb_array_elements(c->'loads') l where aulanexo_private.bolivia_room((l->>'classroomId')::uuid)) then return;end if;
 period:=case when c->>'boliviaShift'='night' then 35 else 40 end;
 if (c->>'periodMinutes')::int<>period then raise exception 'Primaria/secundaria: usa periodos de 40 minutos en jornada diurna o 35 en nocturna; agrupa periodos para clases más largas.';end if;
 if c ? 'boliviaShift' and c->>'boliviaShift' not in ('day','night') then raise exception 'Selecciona jornada diurna o nocturna.';end if;
 pos:=(c->>'start')::int;finish:=(c->>'end')::int;slot_count:=0;
 while pos+period<=finish loop
  select value into b from jsonb_array_elements(c->'breaks') where pos<(value->>'end')::int and pos+period>(value->>'start')::int limit 1;
  if b is not null then pos:=(b->>'end')::int;else slot_count:=slot_count+1;pos:=pos+period;end if;
 end loop;
 if slot_count<>6 then raise exception 'Primaria/secundaria: configura seis periodos pedagógicos diarios y sus recreos.';end if;
 if p_complete then
  for room in select distinct (l->>'classroomId')::uuid from jsonb_array_elements(c->'loads') l where aulanexo_private.bolivia_room((l->>'classroomId')::uuid) loop
   for day_value in select value::int from jsonb_array_elements_text(c->'days') loop
    if (select coalesce(sum(((l->>'end')::int-(l->>'start')::int)/period),0) from jsonb_array_elements(entries) l where (l->>'classroomId')::uuid=room and (l->>'day')::int=day_value)<>6 then raise exception 'Completa seis periodos por día para cada paralelo de primaria/secundaria antes de publicar.';end if;
   end loop;
  end loop;
 end if;
end $$;
do $$begin execute replace(pg_get_functiondef('public.timetable_workspace(uuid,uuid)'::regprocedure),'FUNCTION public.timetable_workspace(','FUNCTION aulanexo_private.timetable_workspace_before_bolivia(');end $$;
revoke all on function aulanexo_private.timetable_workspace_before_bolivia(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.timetable_workspace(p_school_id uuid,p_year_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.timetable_workspace_before_bolivia(p_school_id,p_year_id);begin
 return result||jsonb_build_object('rooms',coalesce((select jsonb_agg(r||jsonb_build_object('boliviaRegular',aulanexo_private.bolivia_room((r->>'id')::uuid))) from jsonb_array_elements(result->'rooms') r),'[]'));
end $$;
-- Explicit plans already issue their installments. Do not extend them indefinitely.
do $$declare body text;begin
 body:=pg_get_functiondef('aulanexo_private.run_billing_cycle_charges()'::regprocedure);
 body:=replace(body,$old$where status='active' and enrolled_at<=d order by id for update$old$, $new$where status='active' and enrolled_at<=d and not aulanexo_private.bolivia_student(id) order by id for update$new$);
 execute body;
end $$;

create table public.bolivia_school_profiles (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),year_id uuid not null,unit_code text not null default '',district text not null default '',department text not null default '',authorization_reference text not null default '',
 reference text not null default 'RM 0001/2026 · Educación Regular; RM 0190/2024 · Evaluación',
 reference_url text not null default 'https://www.minedu.gob.bo/files/documentos-normativos/resoluciones-ministeriales/1_RM_0001_EDUCACIN_REGULAR.pdf',
 school_days date[] not null default '{}',calendar_note text not null default '',reviewed boolean not null default false,revision integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),
 unique(year_id),foreign key(year_id,school_id) references public.academic_years(id,school_id),check(cardinality(school_days)<=366)
);
-- POA/PDC/support plans/minutes are distinct documents, reviewed per site and year.
create table public.bolivia_pedagogical_documents (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),year_id uuid not null,classroom_id uuid,class_subject_id uuid references public.class_subjects(id),student_id uuid,
 kind text not null check(kind in ('poa','pdc','support','commission')),title text not null check(length(trim(title)) between 3 and 160),
 starts_on date not null,ends_on date not null,objective text not null check(length(trim(objective)) between 10 and 6000),activities text not null check(length(trim(activities)) between 10 and 12000),
 evidence text not null default '' check(length(evidence)<=12000),adaptations text not null default '' check(length(adaptations)<=6000),participants text not null default '' check(length(participants)<=3000),
 status text not null default 'draft' check(status in ('draft','submitted','approved','returned')),review_note text not null default '',revision integer not null default 1,created_by uuid not null references auth.users(id),updated_by uuid not null references auth.users(id),reviewed_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(year_id,school_id) references public.academic_years(id,school_id),foreign key(classroom_id,school_id) references public.classrooms(id,school_id),foreign key(student_id,school_id) references public.students(id,school_id),check(ends_on>=starts_on),check(kind<>'poa' or classroom_id is null),check(kind not in ('pdc','support') or classroom_id is not null),check(kind<>'support' or student_id is not null)
);
create function aulanexo_private.bolivia_document_access(d public.bolivia_pedagogical_documents) returns boolean language sql stable security definer set search_path='' as $$
 select public.school_director(d.school_id) or (d.classroom_id is not null and public.learning_can_manage(d.classroom_id,d.class_subject_id));
$$;
create function public.save_bolivia_profile(p_profile jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare y public.academic_years;oldrow public.bolivia_school_profiles;target uuid;days date[];begin
 select * into y from public.academic_years where id=(p_profile->>'year_id')::uuid for update;
 if y.id is null or y.status<>'open' or not public.school_director(y.school_id) or not exists(select 1 from public.classrooms r where r.school_id=y.school_id and r.academic_year=y.year and aulanexo_private.bolivia_room(r.id)) then raise exception 'Dirección configura este perfil para primaria/secundaria en una gestión abierta.';end if;
 select * into oldrow from public.bolivia_school_profiles where year_id=y.id for update;
 if oldrow.id is not null and oldrow.revision is distinct from (p_profile->>'revision')::int then raise exception 'El perfil cambió. Vuelve a abrirlo antes de guardar.';end if;
 if jsonb_typeof(p_profile->'school_days') is distinct from 'array' then raise exception 'Selecciona los días efectivos de clase.';end if;
 select coalesce(array_agg(distinct value::date order by value::date),'{}') into days from jsonb_array_elements_text(p_profile->'school_days');
 if exists(select 1 from unnest(days) d where d<y.starts_on or d>y.ends_on) then raise exception 'Los días de clase deben estar dentro de la gestión.';end if;
 if coalesce((p_profile->>'reviewed')::boolean,false) and (cardinality(days)<>200 or coalesce(length(trim(p_profile->>'unit_code')),0)<3 or coalesce(length(trim(p_profile->>'district')),0)<3 or coalesce(length(trim(p_profile->>'department')),0)<3 or coalesce(length(trim(p_profile->>'reference')),0)<5 or coalesce(length(trim(p_profile->>'authorization_reference')),0)<3) then raise exception 'Completa código, distrito, departamento, autorización, referencia normativa y 200 días efectivos antes de confirmar la revisión.';end if;
 if length(p_profile::text)>100000 or coalesce(p_profile->>'reference_url','') !~ '^https://(www\.)?minedu\.gob\.bo/' then raise exception 'Usa una referencia oficial HTTPS del Ministerio.';end if;
 insert into public.bolivia_school_profiles(school_id,year_id,unit_code,district,department,authorization_reference,reference,reference_url,school_days,calendar_note,reviewed,updated_by)
 values(y.school_id,y.id,trim(coalesce(p_profile->>'unit_code','')),trim(coalesce(p_profile->>'district','')),trim(coalesce(p_profile->>'department','')),trim(coalesce(p_profile->>'authorization_reference','')),trim(coalesce(p_profile->>'reference','')),p_profile->>'reference_url',days,coalesce(p_profile->>'calendar_note',''),coalesce((p_profile->>'reviewed')::boolean,false),aulanexo_private.actor_uid())
 on conflict(year_id) do update set unit_code=excluded.unit_code,district=excluded.district,department=excluded.department,authorization_reference=excluded.authorization_reference,reference=excluded.reference,reference_url=excluded.reference_url,school_days=excluded.school_days,calendar_note=excluded.calendar_note,reviewed=excluded.reviewed,revision=public.bolivia_school_profiles.revision+1,updated_by=excluded.updated_by,updated_at=now() returning id into target;
 return target;
end $$;
create function public.save_bolivia_document(p_document jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare y public.academic_years;d public.bolivia_pedagogical_documents;oldrow public.bolivia_pedagogical_documents;begin
 select * into y from public.academic_years where id=(p_document->>'year_id')::uuid for update;
 if y.id is null or y.status<>'open' then raise exception 'Selecciona una gestión abierta.';end if;
 d:=jsonb_populate_record(null::public.bolivia_pedagogical_documents,p_document);
 d.school_id:=y.school_id;d.id:=coalesce(d.id,gen_random_uuid());d.classroom_id:=nullif(p_document->>'classroom_id','')::uuid;d.class_subject_id:=nullif(p_document->>'class_subject_id','')::uuid;d.student_id:=nullif(p_document->>'student_id','')::uuid;
 if not aulanexo_private.bolivia_document_access(d) or not exists(select 1 from public.classrooms r where r.school_id=y.school_id and r.academic_year=y.year and aulanexo_private.bolivia_room(r.id)) then raise exception 'No puedes gestionar este documento.';end if;
 if d.kind in ('poa','commission') and not public.school_director(y.school_id) then raise exception 'Dirección registra el POA y las actas de la Comisión.';end if;
 if d.classroom_id is not null and not exists(select 1 from public.classrooms r where r.id=d.classroom_id and r.school_id=y.school_id and r.academic_year=y.year and aulanexo_private.bolivia_room(r.id)) then raise exception 'El aula debe ser de primaria/secundaria en esta sede y gestión.';end if;
 if d.class_subject_id is not null and not exists(select 1 from public.class_subjects cs where cs.id=d.class_subject_id and cs.classroom_id=d.classroom_id and cs.active) then raise exception 'La materia no pertenece al aula.';end if;
 if d.student_id is not null and not exists(select 1 from public.students s where s.id=d.student_id and s.school_id=y.school_id and s.classroom_id=d.classroom_id) then raise exception 'El estudiante no pertenece al aula.';end if;
 if d.starts_on<y.starts_on or d.ends_on>y.ends_on then raise exception 'El documento debe corresponder a las fechas de la gestión.';end if;
 select * into oldrow from public.bolivia_pedagogical_documents where id=d.id for update;
 if oldrow.id is not null and (oldrow.school_id<>y.school_id or oldrow.year_id<>y.id or oldrow.kind<>d.kind or oldrow.classroom_id is distinct from d.classroom_id or oldrow.class_subject_id is distinct from d.class_subject_id or oldrow.student_id is distinct from d.student_id or oldrow.revision is distinct from d.revision or oldrow.status in ('approved','submitted')) then raise exception 'El documento cambió, fue enviado o aprobado. Crea una nueva versión para modificar un aprobado.';end if;
 if d.status not in ('draft','submitted') then raise exception 'Guarda el borrador o envíalo a revisión.';end if;
 if d.kind='commission' and coalesce(length(trim(d.participants)),0)<10 then raise exception 'Identifica participantes y cargos de la Comisión.';end if;
 insert into public.bolivia_pedagogical_documents(id,school_id,year_id,classroom_id,class_subject_id,student_id,kind,title,starts_on,ends_on,objective,activities,evidence,adaptations,participants,status,created_by,updated_by)
 values(d.id,y.school_id,y.id,d.classroom_id,d.class_subject_id,d.student_id,d.kind,trim(d.title),d.starts_on,d.ends_on,trim(d.objective),trim(d.activities),coalesce(d.evidence,''),coalesce(d.adaptations,''),coalesce(d.participants,''),d.status,aulanexo_private.actor_uid(),aulanexo_private.actor_uid())
 on conflict(id) do update set title=excluded.title,starts_on=excluded.starts_on,ends_on=excluded.ends_on,objective=excluded.objective,activities=excluded.activities,evidence=excluded.evidence,adaptations=excluded.adaptations,participants=excluded.participants,status=excluded.status,review_note='',revision=public.bolivia_pedagogical_documents.revision+1,updated_by=excluded.updated_by,updated_at=now();
 return d.id;
end $$;
create function public.review_bolivia_document(p_id uuid,p_revision integer,p_approve boolean,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare d public.bolivia_pedagogical_documents;begin
 select * into d from public.bolivia_pedagogical_documents where id=p_id for update;
 if d.id is null or not public.school_director(d.school_id) or not exists(select 1 from public.academic_years where id=d.year_id and status='open') then raise exception 'Solo Dirección revisa documentos en una gestión abierta.';end if;
 if d.revision is distinct from p_revision or d.status<>'submitted' then raise exception 'El documento cambió o no está pendiente de revisión.';end if;
 if p_approve is null or coalesce(length(trim(p_note)),0) not between 5 and 2000 then raise exception 'Registra la observación o fundamento de la revisión.';end if;
 update public.bolivia_pedagogical_documents set status=case when p_approve then 'approved' else 'returned' end,review_note=trim(p_note),reviewed_by=aulanexo_private.actor_uid(),updated_by=aulanexo_private.actor_uid(),revision=revision+1,updated_at=now() where id=d.id;
end $$;
-- A reviewed school profile enables the documented pedagogical workflow.
-- Legacy/unreviewed profiles keep their existing reinforcement records intact.
do $$begin execute replace(pg_get_functiondef('public.authorize_reinforcement(uuid,uuid,uuid,uuid,text)'::regprocedure),'FUNCTION public.authorize_reinforcement(','FUNCTION aulanexo_private.authorize_reinforcement_before_bolivia(');end $$;
revoke all on function aulanexo_private.authorize_reinforcement_before_bolivia(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.authorize_reinforcement(p_term_id uuid,p_classroom_id uuid,p_subject_id uuid,p_student_id uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.academic_terms;begin
 if not public.school_director((select school_id from public.classrooms where id=p_classroom_id)) then raise exception 'Solo Dirección habilita el reforzamiento.';end if;
 select * into t from public.academic_terms where id=p_term_id;
 if aulanexo_private.bolivia_room(p_classroom_id) and exists(select 1 from public.bolivia_school_profiles where year_id=t.year_id and reviewed) then
  if not exists(select 1 from public.bolivia_pedagogical_documents d where d.year_id=t.year_id and d.kind='support' and d.student_id=p_student_id and d.classroom_id=p_classroom_id and (d.class_subject_id is null or d.class_subject_id=p_subject_id) and d.status='approved' and length(trim(d.evidence))>=10 and d.starts_on<=t.ends_on and d.ends_on>=t.starts_on) then raise exception 'Registra y aprueba primero el plan de apoyo del estudiante, con evidencias del seguimiento.';end if;
  if not exists(select 1 from public.bolivia_pedagogical_documents d where d.year_id=t.year_id and d.kind='commission' and d.status='approved' and (d.classroom_id is null or d.classroom_id=p_classroom_id) and d.starts_on<=t.ends_on and d.ends_on>=t.starts_on) then raise exception 'Registra el acta y las recomendaciones de la Comisión Técnico Pedagógica antes de habilitar la nueva nota.';end if;
 end if;
 return aulanexo_private.authorize_reinforcement_before_bolivia(p_term_id,p_classroom_id,p_subject_id,p_student_id,p_reason);
end $$;
create function public.bolivia_workspace(p_school_id uuid,p_year_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare y public.academic_years;manager boolean:=public.school_director(p_school_id);rids uuid[];begin
 if auth.uid() is null or public.is_platform_admin() or not aulanexo_private.in_support_school(p_school_id) then raise exception 'Selecciona una sede con acceso autorizado.';end if;
 select * into y from public.academic_years where school_id=p_school_id and (p_year_id is null or id=p_year_id) order by year desc limit 1;
 select array_agg(id) into rids from public.classrooms r where r.school_id=p_school_id and r.academic_year=y.year and aulanexo_private.bolivia_room(r.id) and (manager or public.may_edit_classroom(p_school_id,r.id));
 if not manager and coalesce(cardinality(rids),0)=0 then raise exception 'No tienes aulas de primaria/secundaria asignadas.';end if;
 return jsonb_build_object('canManage',manager,'year',to_jsonb(y),'years',coalesce((select jsonb_agg(to_jsonb(ay) order by year desc) from public.academic_years ay where school_id=p_school_id and (manager or exists(select 1 from public.classrooms r where r.school_id=p_school_id and r.academic_year=ay.year and aulanexo_private.bolivia_room(r.id) and public.may_edit_classroom(p_school_id,r.id)))),'[]'),
 'profile',(select to_jsonb(p)-'updated_by' from public.bolivia_school_profiles p where year_id=y.id),
 'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'gradeCode',(select grade_code from public.academic_class_policies where classroom_id=r.id)) order by name) from public.classrooms r where id=any(rids)),'[]'),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by updated_at desc) from public.bolivia_pedagogical_documents d where d.year_id=y.id and (manager or d.kind='poa' and d.status='approved' or aulanexo_private.bolivia_document_access(d))),'[]'),
 'cards',case when manager then coalesce((select jsonb_agg(to_jsonb(c)) from public.report_cards c where c.classroom_id=any(rids) and c.revoked_at is null and exists(select 1 from public.academic_terms t where t.id=c.term_id and t.year_id=y.id)),'[]') else '[]'::jsonb end);
end $$;
do $$declare tab text;begin foreach tab in array array['bolivia_school_profiles','bolivia_pedagogical_documents'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create trigger bolivia_signal after insert or update on public.%I for each row execute function aulanexo_private.touch_workspace()',tab);
 execute format('create trigger bolivia_audit after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',tab);
end loop;end $$;
create policy bolivia_profiles_read on public.bolivia_school_profiles for select to authenticated using(public.school_director(school_id) or exists(select 1 from public.classrooms r where r.school_id=bolivia_school_profiles.school_id and public.may_edit_classroom(r.school_id,r.id) and aulanexo_private.bolivia_room(r.id)));
create policy bolivia_documents_read on public.bolivia_pedagogical_documents for select to authenticated using(aulanexo_private.bolivia_document_access(bolivia_pedagogical_documents) or kind='poa' and status='approved' and exists(select 1 from public.classrooms r where r.school_id=bolivia_pedagogical_documents.school_id and aulanexo_private.bolivia_room(r.id) and public.may_edit_classroom(r.school_id,r.id)));
revoke all on function aulanexo_private.bolivia_room(uuid),aulanexo_private.bolivia_student(uuid),aulanexo_private.bolivia_room_cache(),aulanexo_private.bolivia_room_flag(),aulanexo_private.bolivia_plan(),aulanexo_private.bolivia_charge(),aulanexo_private.bolivia_document_access(public.bolivia_pedagogical_documents) from public,anon,authenticated,service_role;
grant execute on function aulanexo_private.bolivia_room(uuid),aulanexo_private.bolivia_document_access(public.bolivia_pedagogical_documents) to authenticated;
revoke all on function public.save_bolivia_profile(jsonb),public.save_bolivia_document(jsonb),public.review_bolivia_document(uuid,integer,boolean,text),public.bolivia_workspace(uuid,uuid) from public,anon;
grant execute on function public.save_bolivia_profile(jsonb),public.save_bolivia_document(jsonb),public.review_bolivia_document(uuid,integer,boolean,text),public.bolivia_workspace(uuid,uuid) to authenticated;
