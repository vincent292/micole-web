-- Owner-only role testing over explicitly marked institutions. No fake Auth users,
-- email confirmations, memberships or guardian links are created or changed.
create table aulanexo_private.test_institutions (
 school_id uuid primary key references public.schools(id) on delete cascade,
 enabled boolean not null default true, updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
revoke all on aulanexo_private.test_institutions from public,anon,authenticated;
alter table aulanexo_private.support_sessions
 add column mode text not null default 'support' check(mode in ('support','test')),
 add column teacher_id uuid references public.teachers(id),
 add column student_id uuid references public.students(id),
 add column relationship text check(relationship in ('mother','father'));
alter table aulanexo_private.support_sessions add constraint test_session_target check(mode='support' or
 (role='director' and teacher_id is null and student_id is null and relationship is null) or
 (role='teacher' and teacher_id is not null and student_id is null and relationship is null) or
 (role='guardian' and teacher_id is null and student_id is not null and relationship is not null) or
 (role='student' and teacher_id is null and student_id is not null and relationship is null));

-- This helper deliberately avoids support_context/actor_uid, so identity checks
-- can call it without recursion. A forged header never grants another user access.
create function aulanexo_private.test_context() returns aulanexo_private.support_sessions
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions;begin
 select * into context from aulanexo_private.support_sessions where id=aulanexo_private.support_id() and mode='test';
 if context.id is null then return null;end if;
 if context.admin_id is distinct from auth.uid() or not aulanexo_private.is_support_owner() or context.ended_at is not null or context.expires_at<=now()
 or not exists(select 1 from aulanexo_private.test_institutions where school_id=context.school_id and enabled)
 or (context.role='teacher' and not exists(select 1 from public.teachers where id=context.teacher_id and school_id=context.school_id and status='active'))
 or (context.role in ('guardian','student') and not exists(select 1 from public.students where id=context.student_id and school_id=context.school_id))
 then raise exception 'support_expired: El acceso de pruebas terminó. Vuelve a tu panel.';end if;
 return context;
end $$;
revoke all on function aulanexo_private.test_context() from public,anon,authenticated;
do $$begin execute replace(pg_get_functiondef('aulanexo_private.support_context()'::regprocedure),'FUNCTION aulanexo_private.support_context(', 'FUNCTION aulanexo_private.support_context_verified(');end $$;
create or replace function aulanexo_private.support_context() returns aulanexo_private.support_sessions
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if context.id is not null then return context;end if;
 return aulanexo_private.support_context_verified();
end $$;
revoke all on function aulanexo_private.support_context(),aulanexo_private.support_context_verified() from public,anon,authenticated;

create function aulanexo_private.test_guardian(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((aulanexo_private.test_context()).role='guardian' and (aulanexo_private.test_context()).student_id=p_student,false);
$$;
create function aulanexo_private.teacher_actor_matches(p_id uuid,p_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if context.id is not null then return context.role='teacher' and context.teacher_id=p_id;end if;
 return p_user=aulanexo_private.actor_uid();
end $$;
revoke all on function aulanexo_private.test_guardian(uuid),aulanexo_private.teacher_actor_matches(uuid,uuid) from public,anon,authenticated;
grant execute on function aulanexo_private.test_guardian(uuid) to authenticated;
do $$declare name text;definition text;begin
 foreach name in array array['may_teacher_write','may_edit_classroom','may_use_classroom','learning_can_manage'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name;
  if definition is null or position('t.user_id=aulanexo_private.actor_uid()' in definition)=0 then raise exception 'Missing teacher identity check: %',name;end if;
  execute replace(definition,'t.user_id=aulanexo_private.actor_uid()','aulanexo_private.teacher_actor_matches(t.id,t.user_id)');
 end loop;
end $$;
do $$begin execute replace(pg_get_functiondef('public.is_verified_guardian(uuid)'::regprocedure),'FUNCTION public.is_verified_guardian(', 'FUNCTION aulanexo_private.is_verified_guardian_registered(');end $$;
revoke all on function aulanexo_private.is_verified_guardian_registered(uuid) from public,anon,authenticated;
create or replace function public.is_verified_guardian(p_student_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if context.id is not null then return aulanexo_private.test_guardian(p_student_id);end if;
 return aulanexo_private.is_verified_guardian_registered(p_student_id);
end $$;
revoke all on function public.is_verified_guardian(uuid) from public,anon;
grant execute on function public.is_verified_guardian(uuid) to authenticated;
do $$begin execute replace(pg_get_functiondef('aulanexo_private.student_id_for_user(uuid,uuid)'::regprocedure),'FUNCTION aulanexo_private.student_id_for_user(', 'FUNCTION aulanexo_private.student_id_for_registered_user(');end $$;
create or replace function aulanexo_private.student_id_for_user(p_user uuid,p_school uuid default null) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if context.id is not null then
  if context.role='student' and p_user=auth.uid() and (p_school is null or p_school=context.school_id) then return context.student_id;end if;
  return null;
 end if;
 return aulanexo_private.student_id_for_registered_user(p_user,p_school);
end $$;
revoke all on function aulanexo_private.student_id_for_user(uuid,uuid),aulanexo_private.student_id_for_registered_user(uuid,uuid) from public,anon,authenticated;
-- Pickup/absence and legacy charge access retain their existing checks for real families.
alter policy requests_insert on public.family_requests with check(public.family_access(student_id) and status='pending' and response='' and created_by=aulanexo_private.actor_uid() and request_date>=(now() at time zone 'America/La_Paz')::date and
 (aulanexo_private.test_guardian(student_id) or exists(select 1 from public.student_guardians g where g.student_id=family_requests.student_id and g.user_id=aulanexo_private.actor_uid() and (family_requests.type<>'pickup' or g.can_authorize_pickup))));
do $$begin execute replace(pg_get_functiondef('public.may_access_school_charge(uuid)'::regprocedure),'FUNCTION public.may_access_school_charge(', 'FUNCTION aulanexo_private.may_access_registered_charge(');end $$;
revoke all on function aulanexo_private.may_access_registered_charge(uuid) from public,anon,authenticated;
create or replace function public.may_access_school_charge(p_charge_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if context.id is not null and context.role='guardian' then return exists(select 1 from public.school_charges c where c.id=p_charge_id and c.school_id=context.school_id and aulanexo_private.test_guardian(c.student_id));end if;
 return aulanexo_private.may_access_registered_charge(p_charge_id);
end $$;
revoke all on function public.may_access_school_charge(uuid) from public,anon;
grant execute on function public.may_access_school_charge(uuid) to authenticated;

do $$begin execute replace(pg_get_functiondef('public.workspace_identity()'::regprocedure),'FUNCTION public.workspace_identity(', 'FUNCTION aulanexo_private.workspace_identity_registered(');end $$;
revoke all on function aulanexo_private.workspace_identity_registered() from public,anon,authenticated;
create or replace function public.workspace_identity() returns jsonb language plpgsql security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.test_context();label text;begin
 if context.id is null then return aulanexo_private.workspace_identity_registered();end if;
 label:=case context.role when 'director' then 'Dirección de pruebas' when 'teacher' then (select name from public.teachers where id=context.teacher_id)
 when 'guardian' then (select case context.relationship when 'mother' then mother_name else father_name end from public.students where id=context.student_id)
 else (select concat_ws(' ',first_name,last_name) from public.students where id=context.student_id) end;
 return jsonb_build_object('id',auth.uid(),'email','','name',coalesce(nullif(label,''),'Cuenta de pruebas'),'canSupport',true,'roles',jsonb_build_array(context.role),
 'memberships',jsonb_build_array(jsonb_build_object('schoolId',context.school_id,'role',context.role)),
 'teacherIds',case when context.role='teacher' then jsonb_build_array(context.teacher_id) else '[]'::jsonb end,
 'guardianStudentIds',case when context.role='guardian' then jsonb_build_array(context.student_id) else '[]'::jsonb end,
 'studentIds',case when context.role='student' then jsonb_build_array(context.student_id) else '[]'::jsonb end,
 'support',jsonb_build_object('id',context.id,'schoolId',context.school_id,'role',context.role,'reason',context.reason,'expiresAt',context.expires_at,'adminId',context.admin_id,'mode','test'));
end $$;
revoke all on function public.workspace_identity() from public,anon;
grant execute on function public.workspace_identity() to authenticated;

create function public.set_test_institution(p_school_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$begin
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede configurar sus instituciones de pruebas desde su panel.';end if;
 if p_enabled is null or not exists(select 1 from public.schools where id=p_school_id) then raise exception 'Selecciona una institución válida.';end if;
 insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values(p_school_id,p_enabled,auth.uid()) on conflict(school_id) do update set enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now();
 if not p_enabled then update aulanexo_private.support_sessions set ended_at=now() where school_id=p_school_id and mode='test' and ended_at is null;end if;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Propietario MiCole','test_institutions',p_school_id,'UPDATE',jsonb_build_object('name','Institución de pruebas','enabled',p_enabled));
end $$;
create function public.test_workspace_options(p_school_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare enabled boolean;begin
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Acceso de pruebas reservado al propietario.';end if;
 if not exists(select 1 from public.schools where id=p_school_id) then raise exception 'No se encontró la institución.';end if;
 select t.enabled into enabled from aulanexo_private.test_institutions t where t.school_id=p_school_id;
 if not coalesce(enabled,false) then return jsonb_build_object('enabled',false,'accounts','[]'::jsonb);end if;
 return jsonb_build_object('enabled',true,'accounts',jsonb_build_array(jsonb_build_object('id',auth.uid(),'name','Dirección','email','','role','director')) ||
 coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'role','teacher')) from public.teachers where school_id=p_school_id and status='active'),'[]'::jsonb) ||
 coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',concat_ws(' ',s.first_name,s.last_name),'email','','role',r.role,'relationship',r.relationship)) from public.students s cross join (values('guardian','mother'),('guardian','father'),('student',null)) as r(role,relationship) where s.school_id=p_school_id),'[]'::jsonb));
end $$;
create function public.start_test_session(p_school_id uuid,p_role text,p_target_id uuid default null,p_relationship text default null) returns jsonb
language plpgsql security definer set search_path='' as $$declare sid uuid;begin
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede abrir pruebas desde su panel.';end if;
 if not exists(select 1 from aulanexo_private.test_institutions where school_id=p_school_id and enabled) then raise exception 'Marca primero esta institución como de pruebas.';end if;
 if p_role is null or p_role not in ('director','teacher','guardian','student') then raise exception 'Selecciona un rol válido.';end if;
 if p_role='teacher' and not exists(select 1 from public.teachers where id=p_target_id and school_id=p_school_id and status='active') then raise exception 'Selecciona un docente activo de esta institución.';end if;
 if p_role in ('guardian','student') and not exists(select 1 from public.students where id=p_target_id and school_id=p_school_id) then raise exception 'Selecciona un estudiante de esta institución.';end if;
 if p_role='guardian' and (p_relationship is null or p_relationship not in ('mother','father')) then raise exception 'Selecciona madre o padre.';end if;
 update aulanexo_private.support_sessions set ended_at=now() where admin_id=auth.uid() and ended_at is null;
 insert into aulanexo_private.support_sessions(admin_id,school_id,target_user_id,role,reason,mode,teacher_id,student_id,relationship,expires_at)
 values(auth.uid(),p_school_id,auth.uid(),p_role,'Pruebas del propietario','test',case when p_role='teacher' then p_target_id end,case when p_role in ('guardian','student') then p_target_id end,case when p_role='guardian' then p_relationship end,now()+interval '2 hours') returning id into sid;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Propietario MiCole','support_sessions',sid,'START',jsonb_build_object('name','Pruebas del propietario','mode','test','role',p_role,'targetId',p_target_id,'relationship',p_relationship));
 return jsonb_build_object('id',sid);
end $$;
revoke all on function public.set_test_institution(uuid,boolean),public.test_workspace_options(uuid),public.start_test_session(uuid,text,uuid,text) from public,anon;
grant execute on function public.set_test_institution(uuid,boolean),public.test_workspace_options(uuid),public.start_test_session(uuid,text,uuid,text) to authenticated;

-- Audit and visible authorship distinguish testing from a support incident.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.end_support_session(uuid)'::regprocedure);
 definition:=replace(definition,'''name'',''Acceso de soporte''','''name'',case when context.mode=''test'' then ''Pruebas del propietario'' else ''Acceso de soporte'' end,''mode'',context.mode');
 execute definition;
 definition:=pg_get_functiondef('public.stamp_author()'::regprocedure);
 definition:=replace(definition,'new.author_name:=new.author_name||'' (soporte MiCole)''','new.author_name:=new.author_name||case when (aulanexo_private.test_context()).id is not null then '' (pruebas MiCole)'' else '' (soporte MiCole)'' end');
 execute definition;
end $$;
