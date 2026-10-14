-- MiCole: plataforma separada de la operación, soporte exclusivo y acotado.
create table aulanexo_private.support_sessions (
 id uuid primary key default gen_random_uuid(), admin_id uuid not null references auth.users(id),
 school_id uuid not null references public.schools(id), target_user_id uuid not null references auth.users(id),
 role text not null check(role in ('director','teacher','guardian')), reason text not null check(length(trim(reason)) between 10 and 500),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '30 minutes', ended_at timestamptz
);
revoke all on aulanexo_private.support_sessions from public,anon,authenticated;
create index support_sessions_admin on aulanexo_private.support_sessions(admin_id) where ended_at is null;

create function aulanexo_private.is_support_owner() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_admins a join auth.users u on u.id=a.user_id
 join aulanexo_private.platform_admin_allowlist l on l.email=lower(u.email)
 where a.user_id=auth.uid() and u.email_confirmed_at is not null);
$$;
create function aulanexo_private.support_id() returns uuid language plpgsql stable set search_path='' as $$
declare value text; begin
 value:=nullif(current_setting('request.headers',true),'')::jsonb->>'x-micole-support';
 if value is null or value='' then return null; end if;
 if value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Acceso de soporte inválido.'; end if;
 return value::uuid;
end $$;
create function aulanexo_private.support_context() returns aulanexo_private.support_sessions language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=aulanexo_private.support_id(); context aulanexo_private.support_sessions; begin
 if sid is null then return null; end if;
 select * into context from aulanexo_private.support_sessions where id=sid and admin_id=auth.uid() and ended_at is null and expires_at>now();
 if context.id is null or not aulanexo_private.is_support_owner() then raise exception 'support_expired: El acceso de soporte terminó. Vuelve a tu panel.'; end if;
 if context.target_user_id<>auth.uid() and not exists(select 1 from public.school_memberships m where m.user_id=context.target_user_id and m.school_id=context.school_id and m.role=context.role and m.active) then raise exception 'support_expired: El usuario ya no tiene este acceso.'; end if;
 if context.role='teacher' and not exists(select 1 from public.teachers where user_id=context.target_user_id and school_id=context.school_id and status='active') then raise exception 'support_expired: La cuenta docente está inactiva.'; end if;
 return context;
end $$;
create function aulanexo_private.actor_uid() returns uuid language sql stable security definer set search_path='' as $$
 select coalesce((aulanexo_private.support_context()).target_user_id,auth.uid());
$$;
create function aulanexo_private.in_support_school(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select aulanexo_private.support_id() is null or (aulanexo_private.support_context()).school_id=p_school;
$$;
revoke all on function aulanexo_private.is_support_owner(),aulanexo_private.support_id(),aulanexo_private.support_context(),aulanexo_private.actor_uid(),aulanexo_private.in_support_school(uuid) from public,anon,authenticated;
grant execute on function aulanexo_private.actor_uid(),aulanexo_private.in_support_school(uuid) to authenticated;

-- Mantener las comprobaciones existentes usando la identidad delegada, sin modificar auth.uid().
-- Lista explícita: no sustituir la identidad real en bootstrap, notificaciones o auditoría.
do $$ declare fn record; definition text; begin
 for fn in select p.oid,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','aulanexo_private') and p.proname=any(array[
 'may_teacher_write','is_verified_guardian','may_access_student','may_manage_student','may_access_school_charge',
 'may_use_classroom','may_edit_classroom','record_school_payment','record_platform_payment','request_invoice',
 'save_teacher','save_classroom','enroll_student','create_invitation','claim_invitation','stamp_author',
 'publish_class_entry','mark_notification_read','request_institution','review_institution_request']) loop
  definition:=replace(pg_get_functiondef(fn.oid),'auth.uid()','aulanexo_private.actor_uid()');
  -- Las operaciones escolares requieren el rol de institución o una sesión explícita de soporte.
  if fn.proname=any(array['may_access_student','may_manage_student','may_access_school_charge','may_use_classroom','may_edit_classroom','record_school_payment','save_teacher','save_classroom','enroll_student']) then
   definition:=replace(definition,'public.is_platform_admin()','false');
  end if;
  execute definition;
 end loop;
end $$;
create or replace function public.is_platform_admin() returns boolean language sql stable security definer set search_path='' as $$
 select case when aulanexo_private.support_id() is not null then (aulanexo_private.support_context()).id is null
 else exists(select 1 from public.platform_admins where user_id=auth.uid()) end;
$$;
create or replace function public.has_school_role(p_school_id uuid,p_roles text[]) returns boolean language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.support_context(); begin
 if context.id is not null then
  return context.school_id=p_school_id and context.role=any(p_roles);
 end if;
 return exists(select 1 from public.school_memberships where school_id=p_school_id and user_id=auth.uid() and active and role=any(p_roles));
end $$;

-- Cambiar las referencias directas de las políticas a la identidad delegada.
do $$ declare policy record; expression text; check_expression text; begin
 for policy in select * from pg_policies where schemaname='public' and (qual like '%auth.uid()%' or with_check like '%auth.uid()%') loop
  expression:=replace(policy.qual,'auth.uid()','aulanexo_private.actor_uid()');
  check_expression:=replace(policy.with_check,'auth.uid()','aulanexo_private.actor_uid()');
  execute format('alter policy %I on public.%I %s %s',policy.policyname,policy.tablename,
   case when expression is not null then 'using ('||expression||')' else '' end,
   case when check_expression is not null then 'with check ('||check_expression||')' else '' end);
 end loop;
 -- Limitar todas las lecturas y escrituras al colegio elegido incluso si el usuario tiene varios colegios.
 for policy in select table_name,column_name from information_schema.columns where table_schema='public' and column_name='school_id' loop
  execute format('create policy support_school_scope on public.%I as restrictive for all to authenticated using(aulanexo_private.in_support_school(school_id)) with check(aulanexo_private.in_support_school(school_id))',policy.table_name);
 end loop;
end $$;
create policy support_school_scope on public.schools as restrictive for all to authenticated using(aulanexo_private.in_support_school(id)) with check(aulanexo_private.in_support_school(id));
-- El panel de plataforma no expone los registros de la comunidad.
do $$ declare name text; begin
 foreach name in array array['students','student_guardians','teachers','classrooms','teacher_classrooms','school_charges','school_payments','payment_plans','daily_entries','announcements','calendar_events','messages','grades','family_requests','media_assets'] loop
  execute format('create policy platform_operation_boundary on public.%I as restrictive for all to authenticated using(not public.is_platform_admin()) with check(not public.is_platform_admin())',name);
 end loop;
end $$;

create or replace function public.workspace_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; context aulanexo_private.support_sessions:=aulanexo_private.support_context(); actor uuid:=aulanexo_private.actor_uid(); begin
 if auth.uid() is null then raise exception 'Inicia sesión para continuar.'; end if;
 select jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email),
 'canSupport',aulanexo_private.is_support_owner(),
 'roles',case when context.id is not null then jsonb_build_array(context.role) else coalesce((select jsonb_agg(r order by case r when 'superadmin' then 0 when 'director' then 1 when 'teacher' then 2 else 3 end) from (select 'superadmin' r where public.is_platform_admin() union select role from public.school_memberships where user_id=actor and active and role in ('director','teacher','guardian')) roles),'[]'::jsonb) end,
 'memberships',case when context.id is not null then jsonb_build_array(jsonb_build_object('schoolId',context.school_id,'role',context.role)) else coalesce((select jsonb_agg(jsonb_build_object('schoolId',school_id,'role',role)) from public.school_memberships where user_id=actor and active and role in ('director','teacher','guardian')),'[]'::jsonb) end,
 'teacherIds',coalesce((select jsonb_agg(id) from public.teachers where user_id=actor and status='active' and (context.id is null or school_id=context.school_id)),'[]'::jsonb),
 'guardianStudentIds',coalesce((select jsonb_agg(g.student_id) from public.student_guardians g join public.students s on s.id=g.student_id where g.user_id=actor and g.verified_at is not null and g.can_view and (context.id is null or s.school_id=context.school_id)),'[]'::jsonb),
 'support',case when context.id is not null then jsonb_build_object('id',context.id,'schoolId',context.school_id,'role',context.role,'reason',context.reason,'expiresAt',context.expires_at,'adminId',context.admin_id) else null end) into result from auth.users u where u.id=actor;
 return result;
end $$;

create function public.support_accounts(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario de MiCole puede abrir soporte.'; end if;
 if not exists(select 1 from public.schools where id=p_school_id) then raise exception 'No se encontró el colegio.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'email',u.email,'role',m.role)) from public.school_memberships m join auth.users u on u.id=m.user_id
 where m.school_id=p_school_id and m.active and m.role in ('director','teacher','guardian') and u.email_confirmed_at is not null and u.id<>auth.uid()
 and (m.role<>'teacher' or exists(select 1 from public.teachers where user_id=u.id and school_id=p_school_id and status='active'))
 and (m.role<>'guardian' or exists(select 1 from public.student_guardians g join public.students s on s.id=g.student_id where g.user_id=u.id and s.school_id=p_school_id and g.verified_at is not null and g.can_view))),'[]'::jsonb)
 || jsonb_build_array(jsonb_build_object('id',auth.uid(),'name','Dirección · acceso de soporte','email','','role','director'));
end $$;
create function public.start_support_session(p_school_id uuid,p_user_id uuid,p_role text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; actor text; begin
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario de MiCole puede abrir soporte desde su panel.'; end if;
 if not exists(select 1 from public.schools where id=p_school_id) then raise exception 'No se encontró el colegio.'; end if;
 if p_role not in ('director','teacher','guardian') or (p_user_id=auth.uid() and p_role<>'director') then raise exception 'Selecciona un acceso válido.'; end if;
 if p_user_id<>auth.uid() and not exists(select 1 from public.school_memberships m join auth.users u on u.id=m.user_id where m.school_id=p_school_id and m.user_id=p_user_id and m.role=p_role and m.active and u.email_confirmed_at is not null) then raise exception 'El usuario no tiene ese acceso al colegio.'; end if;
 if p_role='teacher' and not exists(select 1 from public.teachers where school_id=p_school_id and user_id=p_user_id and status='active') then raise exception 'La docente está inactiva.'; end if;
 if p_role='guardian' and not exists(select 1 from public.student_guardians g join public.students s on s.id=g.student_id where g.user_id=p_user_id and s.school_id=p_school_id and g.verified_at is not null and g.can_view) then raise exception 'La familia aún no tiene hijos vinculados.'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Describe el motivo de soporte (10 a 500 caracteres).'; end if;
 update aulanexo_private.support_sessions set ended_at=now() where admin_id=auth.uid() and ended_at is null;
 insert into aulanexo_private.support_sessions(admin_id,school_id,target_user_id,role,reason) values(auth.uid(),p_school_id,p_user_id,p_role,trim(p_reason)) returning id into sid;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into actor from auth.users where id=auth.uid();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),actor,'support_sessions',sid,'START',jsonb_build_object('name','Acceso de soporte','role',p_role,'targetUserId',p_user_id,'reason',trim(p_reason)));
 return jsonb_build_object('id',sid,'expiresAt',now()+interval '30 minutes');
end $$;
create function public.end_support_session(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare context aulanexo_private.support_sessions; actor text; begin
 if not aulanexo_private.is_support_owner() then raise exception 'Acceso no autorizado.'; end if;
 update aulanexo_private.support_sessions set ended_at=now() where id=p_id and admin_id=auth.uid() and ended_at is null returning * into context;
 if context.id is null then return; end if;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into actor from auth.users where id=auth.uid();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(context.school_id,auth.uid(),actor,'support_sessions',context.id,'END',jsonb_build_object('name','Acceso de soporte','role',context.role,'targetUserId',context.target_user_id));
end $$;

-- Conservar la autoría real del propietario en auditoría, además del usuario y rol atendidos.
create or replace function aulanexo_private.capture_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare value jsonb; previous jsonb; scope uuid; actor text; summary jsonb; context aulanexo_private.support_sessions:=aulanexo_private.support_context(); begin
 value:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 previous:=case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
 scope:=case when TG_TABLE_NAME='schools' then (value->>'id')::uuid else (value->>'school_id')::uuid end;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into actor from auth.users where id=auth.uid();
 summary:=jsonb_build_object('name',coalesce(value->>'name',value->>'school_name',value->>'concept',nullif(concat_ws(' ',value->>'first_name',value->>'last_name'),'')),'status',value->>'status','previousStatus',previous->>'status','amount',value->>'amount','supportSessionId',context.id,'targetUserId',context.target_user_id,'supportRole',context.role);
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(scope,auth.uid(),coalesce(actor,'Sistema'),TG_TABLE_NAME,(value->>'id')::uuid,TG_OP,jsonb_strip_nulls(summary));
 return case when TG_OP='DELETE' then old else new end;
end $$;
do $$ declare name text; begin
 foreach name in array array['classrooms','teacher_classrooms','daily_entries','announcements','calendar_events','messages','grades','family_requests','media_assets','payment_plans'] loop
  execute format('create trigger audit_operations after insert or update on public.%I for each row execute function aulanexo_private.capture_audit()',name);
 end loop;
end $$;
-- teacher_classrooms tiene clave compuesta, no columna id; registrar classroom_id como entidad.
do $$ declare definition text; begin
 definition:=replace(pg_get_functiondef('aulanexo_private.capture_audit()'::regprocedure),'(value->>''id'')::uuid','coalesce(value->>''id'',value->>''classroom_id'')::uuid'); execute definition;
end $$;

create function public.platform_school_counts() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Acceso de plataforma requerido.'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('schoolId',sch.id,'activeStudentCount',(select count(*) from public.students where school_id=sch.id and status='active'))) from public.schools sch),'[]'::jsonb);
end $$;
revoke all on function public.support_accounts(uuid),public.start_support_session(uuid,uuid,text,text),public.end_support_session(uuid),public.platform_school_counts() from public,anon;
grant execute on function public.support_accounts(uuid),public.start_support_session(uuid,uuid,text,text),public.end_support_session(uuid),public.platform_school_counts() to authenticated;

-- No aceptar invitaciones ni modificar la propia cuenta mientras se atiende otra identidad.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.claim_invitation(text)'::regprocedure);
 definition:=regexp_replace(definition,'begin','begin if aulanexo_private.support_id() is not null then raise exception ''Sal del soporte antes de aceptar una invitación.''; end if;','i');
 execute definition;
end $$;

-- Autoría visible y contexto de lectura/escritura sin confundir una respuesta de soporte.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.stamp_author()'::regprocedure);
 definition:=replace(definition,'new.author_role:=', 'if aulanexo_private.support_id() is not null then new.author_name:=new.author_name||'' (soporte MiCole)''; end if; new.author_role:=');
 execute definition;
end $$;
create or replace function public.mark_notification_read(p_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
 update public.notifications set read_at=now() where user_id=aulanexo_private.actor_uid() and read_at is null and (p_id is null or id=p_id)
 and (aulanexo_private.support_id() is null or aulanexo_private.in_support_school(school_id));
end $$;
create policy support_guardian_scope on public.student_guardians as restrictive for all to authenticated
 using (aulanexo_private.support_id() is null or exists(select 1 from public.students s where s.id=student_id and aulanexo_private.in_support_school(s.school_id)))
 with check (aulanexo_private.support_id() is null or exists(select 1 from public.students s where s.id=student_id and aulanexo_private.in_support_school(s.school_id)));
-- Se usa únicamente para resolver una política ya definida, no se expone el esquema por PostgREST.
grant execute on function aulanexo_private.support_id() to authenticated;
