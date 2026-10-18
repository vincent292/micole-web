-- MiCole: gestiones, expediente anual y cuidados estructurados. Sin modificar cuotas.
create table public.academic_years (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
 year integer not null check(year between 2020 and 2100), name text not null check(length(trim(name)) between 2 and 100),
 starts_on date not null, ends_on date not null, status text not null default 'open' check(status in ('open','closed')),
 created_at timestamptz not null default now(), closed_at timestamptz, unique(school_id,year), unique(id,school_id), check(ends_on>=starts_on)
);
create table public.enrollment_history (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
 classroom_id uuid not null, year_id uuid not null, student_name text not null, classroom_name text not null,
 level text not null default '', started_on date not null, ended_on date,
 status text not null check(status in ('enrolled','completed','transferred','withdrawn')),
 reason text not null default '', monthly_fee numeric(12,2) not null default 0,
 created_at timestamptz not null default now(),
 foreign key(student_id,school_id) references public.students(id,school_id),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
 foreign key(year_id,school_id) references public.academic_years(id,school_id), check(ended_on is null or ended_on>=started_on)
);
create unique index enrollment_current on public.enrollment_history(student_id) where status='enrolled';
create index enrollment_year_room on public.enrollment_history(year_id,classroom_id,student_id);
create table public.care_records (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
 classroom_id uuid not null, entry_date date not null, kind text not null check(kind in ('meal','rest','hygiene','incident','mood')),
 occurred_at time not null, ended_at time, food text not null default '', amount text not null default '' check(amount in ('','none','little','half','most','all')),
 hygiene text not null default '' check(hygiene in ('','diaper','toilet','clothes')),
 mood text not null default '' check(mood in ('','happy','calm','tired','upset')),
 note text not null default '' check(length(note)<=4000), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(student_id,school_id) references public.students(id,school_id),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
 check(ended_at is null or ended_at>occurred_at), check(length(food)<=300),
 check(kind<>'meal' or (length(trim(food))>=2 and amount<>'')), check(kind<>'rest' or ended_at is not null),
 check(kind<>'hygiene' or hygiene<>''), check(kind<>'incident' or length(trim(note))>=5), check(kind<>'mood' or mood<>'')
);
create index care_student_day on public.care_records(student_id,entry_date desc);
alter table public.school_operation_settings add column family_policy text not null default 'both' check(family_policy in ('both','mother','father')),
 add column child_ci_required boolean not null default true;

-- Solo datos de la institución operativa; el superadmin entra por soporte.
create function public.school_director(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin() and aulanexo_private.in_support_school(p_school) and public.has_school_role(p_school,array['director']) and exists(select 1 from public.schools where id=p_school and status='active');
$$;
create function public.school_record_visible(p_student uuid,p_room uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s join public.classrooms r on r.school_id=s.school_id and r.id=p_room join public.schools sc on sc.id=s.school_id where s.id=p_student and sc.status='active' and not public.is_platform_admin() and aulanexo_private.in_support_school(s.school_id)
 and (public.school_director(s.school_id) or public.may_edit_classroom(s.school_id,r.id) or public.family_access(s.id)));
$$;
revoke all on function public.school_director(uuid),public.school_record_visible(uuid,uuid) from public,anon;
grant execute on function public.school_director(uuid),public.school_record_visible(uuid,uuid) to authenticated;

insert into public.academic_years(school_id,year,name,starts_on,ends_on)
 select distinct school_id,academic_year,'Gestión '||academic_year,make_date(academic_year,1,1),make_date(academic_year,12,31) from public.classrooms;
insert into public.enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,level,started_on,ended_on,status,reason,monthly_fee)
 select s.school_id,s.id,r.id,y.id,concat_ws(' ',s.first_name,s.last_name),r.name,r.level,
 least(coalesce(s.enrolled_at,current_date),coalesce(s.withdrawn_at,current_date)),case when s.status='inactive' then coalesce(s.withdrawn_at,current_date) end,
 case when s.status='inactive' then 'withdrawn' else 'enrolled' end,s.withdrawal_reason,s.monthly_fee
 from public.students s join public.classrooms r on r.id=s.classroom_id join public.academic_years y on y.school_id=r.school_id and y.year=r.academic_year;

-- Crear en la gestión elegida desde el primer INSERT, también si el nombre ya existe el año anterior.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.save_classroom_legacy(jsonb,uuid[])'::regprocedure);
 definition:=replace(definition,'extract(year from current_date)::integer','coalesce((p_room->>''academic_year'')::integer,extract(year from current_date)::integer)');execute definition;
end $$;

create function aulanexo_private.ensure_room_year() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.academic_year<>old.academic_year and exists(select 1 from public.enrollment_history where classroom_id=old.id) then raise exception 'Crea un aula nueva para otra gestión; esta aula tiene historial.';end if;
 insert into public.academic_years(school_id,year,name,starts_on,ends_on) values(new.school_id,new.academic_year,'Gestión '||new.academic_year,make_date(new.academic_year,1,1),make_date(new.academic_year,12,31)) on conflict(school_id,year) do nothing;
 return new;
end $$;
create trigger classroom_year before insert or update of academic_year on public.classrooms for each row execute function aulanexo_private.ensure_room_year();
create function aulanexo_private.track_enrollment() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.classrooms;y public.academic_years;h public.enrollment_history;d date:=(now() at time zone 'America/La_Paz')::date;begin
 select * into r from public.classrooms where id=new.classroom_id;select * into y from public.academic_years where school_id=r.school_id and year=r.academic_year;
 select * into h from public.enrollment_history where student_id=new.id and status='enrolled' for update;
 if h.id is not null and (h.classroom_id<>new.classroom_id or new.status='inactive') then
  update public.enrollment_history set status=case when new.status='inactive' then 'withdrawn' when h.year_id<>y.id then 'completed' else 'transferred' end,
   ended_on=greatest(d,started_on),reason=case when new.status='inactive' then new.withdrawal_reason else 'Cambio de aula o gestión' end where id=h.id;
  h.id:=null;
 end if;
 if new.status<>'inactive' and h.id is null then
  if y.status<>'open' then raise exception 'La gestión está cerrada. Selecciona un aula de una gestión abierta.';end if;
  insert into public.enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,level,started_on,status,monthly_fee)
  values(new.school_id,new.id,r.id,y.id,concat_ws(' ',new.first_name,new.last_name),r.name,r.level,d,'enrolled',new.monthly_fee);
 end if;
 return new;
end $$;
create trigger student_enrollment_history after insert or update of classroom_id,status on public.students for each row execute function aulanexo_private.track_enrollment();
revoke all on function aulanexo_private.ensure_room_year(),aulanexo_private.track_enrollment() from public,anon,authenticated;

create function public.save_academic_year(p_year jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_year->>'school_id')::uuid;target uuid:=coalesce(nullif(p_year->>'id','')::uuid,gen_random_uuid());existing public.academic_years;begin
 if not public.school_director(sid) then raise exception 'Solo Dirección configura las gestiones.';end if;
 perform pg_advisory_xact_lock(hashtext('school-academic-years'),hashtext(sid::text));
 select * into existing from public.academic_years where id=target for update;
 if existing.id is not null and (existing.school_id<>sid or existing.year<>(p_year->>'year')::integer or existing.status='closed') then raise exception 'Conserva el año y la institución de una gestión abierta.';end if;
 insert into public.academic_years(id,school_id,year,name,starts_on,ends_on) values(target,sid,(p_year->>'year')::integer,trim(p_year->>'name'),(p_year->>'starts_on')::date,(p_year->>'ends_on')::date)
 on conflict(id) do update set name=excluded.name,starts_on=excluded.starts_on,ends_on=excluded.ends_on;
 return target;
end $$;
create function public.copy_year_classrooms(p_source_year uuid,p_target_year uuid) returns integer language plpgsql security definer set search_path='' as $$
declare src public.academic_years;dest public.academic_years;r public.classrooms;new_room uuid;new_subject uuid;cs record;counted integer:=0;begin
 select * into src from public.academic_years where id=p_source_year;select * into dest from public.academic_years where id=p_target_year for update;
 if src.id is null or dest.id is null or src.school_id<>dest.school_id or src.id=dest.id or dest.status<>'open' or not public.school_director(dest.school_id) then raise exception 'Selecciona dos gestiones de esta institución; el destino debe estar abierto.';end if;
 for r in select * from public.classrooms where school_id=src.school_id and academic_year=src.year order by id loop
  if exists(select 1 from public.classrooms where school_id=dest.school_id and academic_year=dest.year and name=r.name) then continue;end if;
  new_room:=gen_random_uuid();
  perform public.save_classroom(jsonb_build_object('id',new_room,'school_id',r.school_id,'name',r.name,'level',r.level,'schedule',r.schedule,'academic_year',dest.year,'capacity',r.capacity,'monthly_fee',r.monthly_fee,'active',true),array[]::uuid[]);
  update public.classrooms set start_time=r.start_time,end_time=r.end_time,weekdays=r.weekdays,subjects_enabled=r.subjects_enabled where id=new_room;
  insert into public.teacher_classrooms(school_id,teacher_id,classroom_id,subject_name) select school_id,teacher_id,new_room,subject_name from public.teacher_classrooms where classroom_id=r.id;
  for cs in select * from public.class_subjects where classroom_id=r.id and active loop
   insert into public.class_subjects(school_id,classroom_id,subject_id) values(r.school_id,new_room,cs.subject_id) returning id into new_subject;
   insert into public.subject_teachers(school_id,class_subject_id,teacher_id) select school_id,new_subject,teacher_id from public.subject_teachers where class_subject_id=cs.id;
  end loop;
  counted:=counted+1;
 end loop;
 return counted;
end $$;
create function public.move_student_year(p_student_id uuid,p_classroom_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;r public.classrooms;old_history uuid;begin
 select * into s from public.students where id=p_student_id for update;
 select id into old_history from public.enrollment_history where student_id=p_student_id and status='enrolled';select * into r from public.classrooms where id=p_classroom_id for update;
 if s.id is null or not public.school_director(s.school_id) or r.id is null or r.school_id<>s.school_id then raise exception 'Solo Dirección puede reinscribir o trasladar estudiantes de su institución.';end if;
 if length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Escribe un motivo de 5 a 500 caracteres.';end if;
 if s.classroom_id=r.id and s.status<>'inactive' then raise exception 'El estudiante ya pertenece a esta aula.';end if;
 perform aulanexo_private.validate_admission_room(s.id,r.id,s.school_id);
 update public.students set classroom_id=r.id,status=case when s.status='inactive' then 'pending' else s.status end,withdrawn_at=null,withdrawal_reason='' where id=s.id;
 update public.enrollment_history set reason=trim(p_reason) where id=old_history;
 -- No se cobran activaciones nuevas ni se reescriben planes/cuotas existentes.
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(s.school_id,auth.uid(),'Dirección','enrollment_history',s.id,'MOVE',jsonb_build_object('reason',trim(p_reason),'classroomId',r.id));
end $$;
create function public.save_care_record(p_record jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.students;oldrow public.care_records;target uuid:=coalesce(nullif(p_record->>'id','')::uuid,gen_random_uuid());day_value date:=(p_record->>'entry_date')::date;begin
 select * into s from public.students where id=(p_record->>'student_id')::uuid for update;
 if s.id is null or s.status='inactive' or not(public.school_director(s.school_id) or public.may_teacher_write(s.id)) then raise exception 'Solo Dirección o el docente del aula puede registrar cuidados.';end if;
 if day_value is null or day_value>(now() at time zone 'America/La_Paz')::date then raise exception 'Selecciona un día actual o anterior.';end if;
 select * into oldrow from public.care_records where id=target for update;
 if oldrow.id is not null and (oldrow.student_id<>s.id or oldrow.classroom_id<>s.classroom_id) then raise exception 'Conserva al estudiante y aula del registro.';end if;
 insert into public.care_records(id,school_id,student_id,classroom_id,entry_date,kind,occurred_at,ended_at,food,amount,hygiene,mood,note,created_by)
 values(target,s.school_id,s.id,s.classroom_id,day_value,p_record->>'kind',(p_record->>'occurred_at')::time,nullif(p_record->>'ended_at','')::time,trim(coalesce(p_record->>'food','')),coalesce(p_record->>'amount',''),coalesce(p_record->>'hygiene',''),coalesce(p_record->>'mood',''),trim(coalesce(p_record->>'note','')),aulanexo_private.actor_uid())
 on conflict(id) do update set entry_date=excluded.entry_date,kind=excluded.kind,occurred_at=excluded.occurred_at,ended_at=excluded.ended_at,food=excluded.food,amount=excluded.amount,hygiene=excluded.hygiene,mood=excluded.mood,note=excluded.note,updated_at=now();
 return target;
end $$;

create function public.save_admission_settings(p_school_id uuid,p_family_policy text,p_child_ci_required boolean,p_require_materials boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.school_director(p_school_id) then raise exception 'Solo Dirección configura los requisitos de inscripción.';end if;
 if p_family_policy is null or p_family_policy not in ('both','mother','father') or p_child_ci_required is null or p_require_materials is null then raise exception 'Completa los requisitos.';end if;
 insert into public.school_operation_settings(school_id,family_policy,child_ci_required,require_annual_materials) values(p_school_id,p_family_policy,p_child_ci_required,p_require_materials)
 on conflict(school_id) do update set family_policy=excluded.family_policy,child_ci_required=excluded.child_ci_required,require_annual_materials=excluded.require_annual_materials;
end $$;
-- Ambos progenitores siguen siendo el valor inicial; las excepciones las elige Dirección.
create or replace function aulanexo_private.save_admission_details(p_student jsonb,p_new boolean) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;mn text;me text;fn text;fe text;ci text;policy text;ci_needed boolean;email_pattern text:='^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';begin
 select * into s from public.students where id=(p_student->>'id')::uuid for update;
 if s.id is null then raise exception 'No se encontró al estudiante.';end if;
 select family_policy,child_ci_required into policy,ci_needed from public.school_operation_settings where school_id=s.school_id;
 policy:=coalesce(policy,'both');ci_needed:=coalesce(ci_needed,true);
 mn:=trim(coalesce(p_student->>'mother_name',s.mother_name));me:=lower(trim(coalesce(p_student->>'mother_email',s.mother_email)));
 fn:=trim(coalesce(p_student->>'father_name',s.father_name));fe:=lower(trim(coalesce(p_student->>'father_email',s.father_email)));ci:=upper(trim(coalesce(p_student->>'identity_number',s.identity_number)));
 if (policy in ('both','mother') or mn<>'' or me<>'') and (length(mn)<2 or me !~ email_pattern) then raise exception 'Completa el nombre y correo de la madre.';end if;
 if (policy in ('both','father') or fn<>'' or fe<>'') and (length(fn)<2 or fe !~ email_pattern) then raise exception 'Completa el nombre y correo del padre.';end if;
 if me<>'' and me=fe then raise exception 'Madre y padre deben tener correos diferentes.';end if;
 if p_new and ci_needed and ci='' then raise exception 'Completa el número de CI del niño.';end if;
 if length(ci)>40 or length(coalesce(p_student->>'rude',''))>40 or greatest(length(mn),length(fn))>160 or greatest(length(me),length(fe))>254 then raise exception 'Revisa la longitud de los datos de inscripción.';end if;
 update public.students set rude=upper(trim(coalesce(p_student->>'rude',s.rude))),identity_number=ci,mother_name=mn,mother_email=me,mother_phone=trim(coalesce(p_student->>'mother_phone',s.mother_phone)),father_name=fn,father_email=fe,father_phone=trim(coalesce(p_student->>'father_phone',s.father_phone)),primary_guardian_name=coalesce(nullif(mn,''),fn),primary_guardian_email=coalesce(nullif(me,''),fe) where id=s.id;
 perform aulanexo_private.sync_student_parents(s.id);
exception when unique_violation then raise exception 'El RUDE o CI ya está registrado en esta institución. Revisa la ficha existente.';
end $$;

do $$ declare name text;begin
 foreach name in array array['academic_years','enrollment_history','care_records'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant select on public.%I to authenticated',name);
  execute format('create policy operation_scope on public.%I as restrictive for all to authenticated using(not public.is_platform_admin() and aulanexo_private.in_support_school(school_id))',name);
  execute format('create trigger lifecycle_signal after insert or update or delete on public.%I for each row execute function aulanexo_private.touch_workspace()',name);
  execute format('create trigger lifecycle_audit after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',name);
 end loop;
end $$;
create policy academic_year_read on public.academic_years for select to authenticated using(public.school_director(school_id) or exists(select 1 from public.classrooms r where r.school_id=academic_years.school_id and r.academic_year=academic_years.year and public.may_use_classroom(r.school_id,r.id)) or exists(select 1 from public.enrollment_history h where h.year_id=academic_years.id and public.family_access(h.student_id)));
create policy enrollment_read on public.enrollment_history for select to authenticated using(public.school_record_visible(student_id,classroom_id));
create policy care_read on public.care_records for select to authenticated using(public.school_record_visible(student_id,classroom_id));
revoke all on function public.save_academic_year(jsonb),public.copy_year_classrooms(uuid,uuid),public.move_student_year(uuid,uuid,text),public.save_care_record(jsonb),public.save_admission_settings(uuid,text,boolean,boolean) from public,anon;
grant execute on function public.save_academic_year(jsonb),public.copy_year_classrooms(uuid,uuid),public.move_student_year(uuid,uuid,text),public.save_care_record(jsonb),public.save_admission_settings(uuid,text,boolean,boolean) to authenticated;
