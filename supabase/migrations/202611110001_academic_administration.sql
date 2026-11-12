-- Secretary is a delegated institutional capability, independent from payment collection.
alter table public.timetable_delegates add column can_administer boolean not null default false,
 add column can_collect boolean not null default false;
create function public.school_secretary(p_school uuid,p_collect boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.is_platform_admin()
 and aulanexo_private.support_id() is null and aulanexo_private.in_support_school(p_school)
 and exists(select 1 from public.timetable_delegates d join auth.users u on u.id=auth.uid()
 join public.schools s on s.id=d.school_id and s.status='active'
 where d.school_id=p_school and d.email=lower(u.email) and u.email_confirmed_at is not null
 and d.active and d.can_administer and (not p_collect or d.can_collect));
$$;
create function public.academic_manager(p_school uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.school_director(p_school) or public.school_secretary(p_school);
$$;
revoke all on function public.school_secretary(uuid,boolean),public.academic_manager(uuid) from public,anon;
grant execute on function public.school_secretary(uuid,boolean),public.academic_manager(uuid) to authenticated;

create function public.save_secretary_access(p_school uuid,p_email text,p_active boolean,p_collect boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.school_director(p_school) then raise exception 'Solo Dirección administra el acceso de Secretaría.';end if;
 if p_active is null or p_collect is null then raise exception 'Indica los permisos de Secretaría.';end if;
 perform public.save_timetable_delegate(p_school,p_email,p_active,true);
 update public.timetable_delegates set can_administer=true,can_collect=p_active and p_collect
 where school_id=p_school and email=lower(trim(p_email));
end $$;
create function public.secretary_access_workspace(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.school_director(p_school) then raise exception 'Solo Dirección administra Secretaría.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('email',email,'active',active,'canCollect',can_collect))
 from public.timetable_delegates where school_id=p_school and can_administer),'[]');
end $$;
-- Preserve existing identity wrappers and legacy timetable-only access.
do $$begin
 execute replace(pg_get_functiondef('public.workspace_identity()'::regprocedure),
 'FUNCTION public.workspace_identity(', 'FUNCTION aulanexo_private.identity_before_academic_administration(');
end $$;
revoke all on function aulanexo_private.identity_before_academic_administration() from public,anon,authenticated,service_role;
create or replace function public.workspace_identity() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.identity_before_academic_administration();
begin
 return result||jsonb_build_object(
 'secretarySchoolIds',coalesce((select jsonb_agg(s.id) from public.schools s where public.school_secretary(s.id)),'[]'),
 'collectionSchoolIds',coalesce((select jsonb_agg(s.id) from public.schools s where public.school_secretary(s.id,true)),'[]'));
end $$;

-- Allow explicit academic administration, without granting school-director status.
do $$declare signature text;definition text;begin
 foreach signature in array array[
 'public.save_teacher(jsonb)','public.save_teacher_with_classrooms(jsonb,uuid[])',
 'aulanexo_private.save_classroom_legacy(jsonb,uuid[])','public.set_classroom_tutor(uuid,uuid)',
 'public.configure_class_subject(uuid,text,uuid[],boolean)','public.set_class_subjects_enabled(uuid,boolean)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=replace(definition,'public.school_director(','public.academic_manager(');
  definition:=regexp_replace(definition,'public.has_school_role\(([^,()]+),\s*[Aa][Rr][Rr][Aa][Yy]\[''director''(?:::text)?\]\)', 'public.academic_manager(\1)','g');
  definition:=replace(definition,'Solo Dirección','Solo Dirección o Secretaría');
  execute definition;
 end loop;
end $$;
-- Only approved administrative records gain secretary read access. Finance stays separate.
do $$declare relation text;begin
 foreach relation in array array['classrooms','teachers','teacher_classrooms','school_subjects','class_subjects','subject_teachers','academic_years','academic_terms','admission_templates','school_operation_settings','student_documents','family_intake_forms'] loop
  execute format('create policy secretary_read on public.%I for select to authenticated using(public.school_secretary(school_id))',relation);
 end loop;
end $$;
create or replace function public.student_directory() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when public.may_manage_student(s.id) or public.is_verified_guardian(s.id) or public.school_secretary(s.school_id)
 then to_jsonb(s) else to_jsonb(s)-array['rude','identity_number','primary_guardian_email','mother_email','father_email','insurance_number','admission_details'] end order by s.last_name,s.first_name,s.id),'[]'::jsonb)
 from public.students s where auth.uid() is not null and (public.may_access_student(s.id) or public.school_secretary(s.school_id))
 and aulanexo_private.in_support_school(s.school_id) and not public.is_platform_admin();
$$;
-- Registration permissions remain revocable at every request.
do $$declare signature text;definition text;begin
 foreach signature in array array['aulanexo_private.require_registration_director(uuid)','public.registration_workspace(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=regexp_replace(definition,'public.has_school_role\(([^,()]+),\s*[Aa][Rr][Rr][Aa][Yy]\[''director''(?:::text)?\]\)', 'public.academic_manager(\1)','g');
  execute definition;
 end loop;
 definition:=pg_get_functiondef('aulanexo_private.registration_staff(uuid,boolean)'::regprocedure);
 definition:=regexp_replace(definition,'public.has_school_role\(c.school_id,\s*[Aa][Rr][Rr][Aa][Yy]\[''director''(?:::text)?\]\)',
 '(public.has_school_role(c.school_id,array[''director'']) or public.school_secretary(c.school_id,p_collect))','g');
 execute definition;
 definition:=pg_get_functiondef('aulanexo_private.registration_room(uuid,uuid,boolean,uuid)'::regprocedure);
 definition:=replace(definition,'not public.has_school_role((select school_id from aulanexo_private.registration_campaigns where id=p_campaign),array[''director''])',
 'not public.academic_manager((select school_id from aulanexo_private.registration_campaigns where id=p_campaign))');
 execute definition;
end $$;

create table public.school_grades(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 academic_year integer not null check(academic_year between 2020 and 2100),
 name text not null check(length(trim(name)) between 1 and 100),level text not null check(length(trim(level)) between 1 and 100),
 grade_code text,unique(school_id,academic_year,level,name),unique(id,school_id)
);
alter table public.classrooms add column grade_id uuid,add column parallel_name text;
alter table public.classrooms add constraint classroom_grade_school foreign key(grade_id,school_id) references public.school_grades(id,school_id);
insert into public.school_grades(school_id,academic_year,name,level,grade_code)
 select distinct r.school_id,r.academic_year,
 case when p.grade_code ~ '^(primary|secondary)[1-6]$' then right(p.grade_code,1)||'.º de '||r.level else coalesce(nullif(trim(r.level),''),'Grado por organizar') end,
 coalesce(nullif(trim(r.level),''),'Otro'),p.grade_code
 from public.classrooms r left join public.academic_class_policies p on p.classroom_id=r.id on conflict do nothing;
update public.classrooms r set grade_id=g.id,parallel_name=r.name from public.school_grades g
 where g.school_id=r.school_id and g.academic_year=r.academic_year and g.level=coalesce(nullif(trim(r.level),''),'Otro')
 and g.grade_code is not distinct from (select grade_code from public.academic_class_policies where classroom_id=r.id);
alter table public.school_grades enable row level security;
revoke all on public.school_grades from public,anon,authenticated,service_role;
grant select on public.school_grades to authenticated;
create policy grades_read on public.school_grades for select to authenticated using(public.academic_manager(school_id)
 or exists(select 1 from public.classrooms r where r.grade_id=school_grades.id and public.may_use_classroom(r.school_id,r.id)));

create function public.save_school_grade(p_school uuid,p_id uuid,p_year integer,p_name text,p_level text,p_code text default null)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if not public.academic_manager(p_school) then raise exception 'Solo Dirección o Secretaría organiza grados.';end if;
 if exists(select 1 from public.school_grades where id=p_id and school_id<>p_school) then raise exception 'El grado pertenece a otra institución.';end if;
 if p_code is not null and p_code !~ '^(initial|(primary|secondary)[1-6])$' then raise exception 'Selecciona un grado válido.';end if;
 if p_code like 'primary%' and p_level<>'Primaria' or p_code like 'secondary%' and p_level<>'Secundaria' then raise exception 'El grado y el nivel deben coincidir.';end if;
 insert into public.school_grades(id,school_id,academic_year,name,level,grade_code)
 values(p_id,p_school,p_year,trim(p_name),trim(p_level),p_code)
 on conflict(id) do update set name=excluded.name,level=excluded.level,grade_code=excluded.grade_code;
 return p_id;
end $$;
create function public.assign_parallel_grade(p_room uuid,p_grade uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.classrooms;g public.school_grades;
begin
 select * into r from public.classrooms where id=p_room for update;
 select * into g from public.school_grades where id=p_grade;
 if r.id is null or not public.academic_manager(r.school_id) then raise exception 'No puedes organizar este paralelo.';end if;
 if g.id is null or g.school_id<>r.school_id or g.academic_year<>r.academic_year then raise exception 'Elige un grado de la misma sede y gestión.';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 100 then raise exception 'Escribe el nombre del paralelo.';end if;
 if exists(select 1 from public.academic_class_policies where classroom_id=r.id and g.grade_code is not null and grade_code<>g.grade_code) then raise exception 'El grado no coincide con la configuración académica del paralelo. Revisa su historial antes de reorganizar.';end if;
 update public.classrooms set grade_id=g.id,parallel_name=trim(p_name),level=g.level where id=r.id;
end $$;

create table public.institution_academic_settings(
 school_id uuid primary key references public.schools(id),pass_mark numeric not null default 51 check(pass_mark between 0 and 100),
 revision integer not null default 1
);
alter table public.institution_academic_settings enable row level security;
revoke all on public.institution_academic_settings from public,anon,authenticated,service_role;
grant select on public.institution_academic_settings to authenticated;
create policy academic_settings_read on public.institution_academic_settings for select to authenticated using(public.may_use_classroom(school_id,null) or public.school_secretary(school_id));
create function public.save_institution_pass_mark(p_school uuid,p_mark numeric,p_revision integer default 0) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.school_director(p_school) then raise exception 'Solo Dirección define la nota mínima.';end if;
 perform pg_advisory_xact_lock(hashtext('academic-settings:'||p_school::text));
 if coalesce((select revision from public.institution_academic_settings where school_id=p_school),0)<>p_revision then raise exception 'La configuración cambió. Actualiza antes de guardar.';end if;
 insert into public.institution_academic_settings(school_id,pass_mark) values(p_school,p_mark)
 on conflict(school_id) do update set pass_mark=excluded.pass_mark,revision=institution_academic_settings.revision+1;
end $$;
revoke all on function public.save_secretary_access(uuid,text,boolean,boolean),public.secretary_access_workspace(uuid),public.save_school_grade(uuid,uuid,integer,text,text,text),public.assign_parallel_grade(uuid,uuid,text),public.save_institution_pass_mark(uuid,numeric,integer) from public,anon;
grant execute on function public.save_secretary_access(uuid,text,boolean,boolean),public.secretary_access_workspace(uuid),public.save_school_grade(uuid,uuid,integer,text,text,text),public.assign_parallel_grade(uuid,uuid,text),public.save_institution_pass_mark(uuid,numeric,integer) to authenticated;

create function public.academic_structure(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not(public.academic_manager(p_school) or public.may_use_classroom(p_school,null)) then raise exception 'No tienes acceso a la organización académica.';end if;
 return jsonb_build_object('grades',coalesce((select jsonb_agg(to_jsonb(g) order by academic_year desc,level,name)
 from public.school_grades g where g.school_id=p_school and (public.academic_manager(p_school) or exists(select 1 from public.classrooms r where r.grade_id=g.id and public.may_use_classroom(p_school,r.id)))),'[]'),
 'settings',coalesce((select to_jsonb(s) from public.institution_academic_settings s where school_id=p_school),jsonb_build_object('pass_mark',51,'revision',0)));
end $$;
create function public.save_academic_parallel(p_grade uuid,p_id uuid,p_name text,p_tutor uuid,p_capacity integer,p_schedule text)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.school_grades;existing public.classrooms;teachers uuid[];
begin
 select * into g from public.school_grades where id=p_grade;
 if g.id is null or not public.academic_manager(g.school_id) then raise exception 'No puedes crear paralelos en este grado.';end if;
 select * into existing from public.classrooms where id=p_id for update;
 if existing.id is not null and (existing.school_id<>g.school_id or existing.academic_year<>g.academic_year) then raise exception 'Conserva la institución y gestión del paralelo.';end if;
 select coalesce(array_agg(teacher_id),'{}') into teachers from public.teacher_classrooms where classroom_id=p_id;
 if p_tutor is not null then teachers:=array_append(teachers,p_tutor);end if;
 perform public.save_classroom(jsonb_build_object('id',p_id,'school_id',g.school_id,'name',g.name||' · '||trim(p_name),
 'level',g.level,'academic_year',g.academic_year,'capacity',p_capacity,'schedule',trim(p_schedule),'tutor_teacher_id',p_tutor,'active',coalesce(existing.active,true)),teachers);
 perform public.assign_parallel_grade(p_id,p_grade,p_name);
 insert into public.academic_years(school_id,year,name,starts_on,ends_on) values(g.school_id,g.academic_year,'Gestión '||g.academic_year::text,make_date(g.academic_year,1,1),make_date(g.academic_year,12,31)) on conflict(school_id,year) do nothing;
 if existing.id is null and g.grade_code is not null then
  insert into public.academic_class_policies(classroom_id,school_id,grade_code,scheme,updated_by)
  select r.id,r.school_id,g.grade_code,case when g.grade_code='initial' then 'qualitative' when r.bolivia_regular then 'bolivia2026' else 'flexible' end,aulanexo_private.actor_uid() from public.classrooms r where r.id=p_id;
 end if;
 return p_id;
end $$;
revoke all on function public.academic_structure(uuid),public.save_academic_parallel(uuid,uuid,text,uuid,integer,text) from public,anon;
grant execute on function public.academic_structure(uuid),public.save_academic_parallel(uuid,uuid,text,uuid,integer,text) to authenticated;
