-- Assigning a subject is a single administrative action, including classroom membership.
do $$begin
 execute replace(pg_get_functiondef('public.configure_class_subject(uuid,text,uuid[],boolean)'::regprocedure),
 'FUNCTION public.configure_class_subject(', 'FUNCTION aulanexo_private.configure_subject_before_staff_assignment(');
end $$;
revoke all on function aulanexo_private.configure_subject_before_staff_assignment(uuid,text,uuid[],boolean) from public,anon,authenticated,service_role;
create or replace function public.configure_class_subject(p_classroom_id uuid,p_name text,p_teacher_ids uuid[],p_active boolean default true)
returns uuid language plpgsql security definer set search_path='' as $$
declare room public.classrooms;
begin
 select * into room from public.classrooms where id=p_classroom_id for update;
 if room.id is null or not public.academic_manager(room.school_id) then raise exception 'Solo Dirección o Secretaría configura las materias del aula.';end if;
 if exists(select 1 from unnest(p_teacher_ids) chosen where not exists(select 1 from public.teachers t where t.id=chosen and t.school_id=room.school_id and t.status='active')) then raise exception 'Selecciona docentes activos de esta institución.';end if;
 insert into public.teacher_classrooms(school_id,teacher_id,classroom_id)
 select room.school_id,chosen,room.id from (select distinct unnest(p_teacher_ids) chosen) teachers on conflict do nothing;
 return aulanexo_private.configure_subject_before_staff_assignment(room.id,p_name,p_teacher_ids,p_active);
end $$;
-- Parallel names are unique inside their grade. Existing records remain intact.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.assign_parallel_grade(uuid,uuid,text)'::regprocedure);
 needle:=' select * into r from public.classrooms where id=p_room for update;';
 if position(needle in definition)=0 then raise exception 'Missing parallel assignment lock.';end if;
 definition:=replace(definition,needle,E' perform pg_advisory_xact_lock(hashtext(''parallel-grade:''||p_grade::text));\n'||needle);
 needle:=' update public.classrooms set grade_id=g.id';
 definition:=replace(definition,needle,E' if exists(select 1 from public.classrooms other where other.grade_id=g.id and other.id<>r.id and lower(trim(other.parallel_name))=lower(trim(p_name))) then raise exception ''Ya existe un paralelo con este nombre en el grado.'';end if;\n'||needle);
 execute definition;
end $$;
