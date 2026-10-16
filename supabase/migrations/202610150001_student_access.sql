-- Acceso opcional de estudiantes: identidad propia y portal de consulta mínimo.
-- Las fichas, salud, pagos y conversaciones conservan sus políticas actuales.
create table aulanexo_private.student_logins (
 student_id uuid primary key references public.students(id) on delete cascade,
 school_id uuid not null references public.schools(id) on delete cascade,
 email text not null unique check(email=lower(trim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 enabled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid not null references auth.users(id),
 foreign key(student_id,school_id) references public.students(id,school_id) on delete cascade
);
revoke all on aulanexo_private.student_logins from public,anon,authenticated;

create function aulanexo_private.student_id_for_user(p_user uuid,p_school uuid default null) returns uuid
language sql stable security definer set search_path='' as $$
 select l.student_id from aulanexo_private.student_logins l join auth.users u on lower(u.email)=l.email
 join public.students s on s.id=l.student_id
 where u.id=p_user and u.email_confirmed_at is not null and l.enabled
 and (p_school is null or l.school_id=p_school)
 -- Un correo de un adulto no puede convertirse en una cuenta infantil.
 and not exists(select 1 from public.platform_admins where user_id=u.id)
 and not exists(select 1 from public.school_memberships where user_id=u.id and active)
 and not exists(select 1 from public.students child where lower(child.mother_email)=l.email or lower(child.father_email)=l.email or lower(child.primary_guardian_email)=l.email)
 and not exists(select 1 from public.teachers where lower(email)=l.email)
 limit 1;
$$;
revoke all on function aulanexo_private.student_id_for_user(uuid,uuid) from public,anon,authenticated;

create function public.student_login_account(p_student_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.may_manage_student(p_student_id) then raise exception 'Solo Dirección puede administrar este acceso.'; end if;
 return coalesce((select jsonb_build_object('studentId',student_id,'email',email,'enabled',enabled)
 from aulanexo_private.student_logins where student_id=p_student_id),jsonb_build_object('studentId',p_student_id,'email','','enabled',false));
end $$;

create function public.set_student_login(p_student_id uuid,p_email text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare child public.students; address text:=lower(trim(coalesce(p_email,''))); existing aulanexo_private.student_logins; context aulanexo_private.support_sessions:=aulanexo_private.support_context(); begin
 if not public.may_manage_student(p_student_id) then raise exception 'Solo Dirección puede administrar este acceso.'; end if;
 select * into child from public.students where id=p_student_id for update;
 select * into existing from aulanexo_private.student_logins where student_id=p_student_id;
 if p_enabled is null then raise exception 'Indica si se habilita el acceso.'; end if;
 if not p_enabled then
  if existing.student_id is null then return; end if;
  address:=existing.email;
 else
  if child.status='inactive' then raise exception 'Primero reactiva la inscripción del estudiante.'; end if;
  if length(address)>254 or address !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Escribe un correo propio y válido del estudiante.'; end if;
  if exists(select 1 from public.students where lower(mother_email)=address or lower(father_email)=address or lower(primary_guardian_email)=address)
   or exists(select 1 from public.teachers where lower(email)=address)
   or exists(select 1 from auth.users u where lower(u.email)=address and
    (exists(select 1 from public.platform_admins a where a.user_id=u.id) or exists(select 1 from public.school_memberships m where m.user_id=u.id and m.active)))
   or exists(select 1 from public.invitations where email=address and status='pending' and expires_at>now())
  then raise exception 'Usa un correo diferente al de los padres y del personal del colegio.'; end if;
 end if;
 insert into aulanexo_private.student_logins(student_id,school_id,email,enabled,updated_by)
 values(child.id,child.school_id,address,p_enabled,auth.uid())
 on conflict(student_id) do update set email=excluded.email,enabled=excluded.enabled,updated_at=now(),updated_by=auth.uid();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 select child.school_id,auth.uid(),coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'student_logins',child.id,'UPDATE',
 jsonb_strip_nulls(jsonb_build_object('name','Acceso de estudiante','status',case when p_enabled then 'active' else 'inactive' end,
 'supportSessionId',context.id,'supportRole',context.role,'targetUserId',case when context.id is not null then context.target_user_id end)) from auth.users u where u.id=auth.uid();
exception when unique_violation then raise exception 'Ese correo ya está asignado a otro estudiante.';
end $$;

-- El soporte del propietario puede inspeccionar una cuenta infantil real.
alter table aulanexo_private.support_sessions drop constraint support_sessions_role_check;
alter table aulanexo_private.support_sessions add constraint support_sessions_role_check check(role in ('director','teacher','guardian','student'));
create or replace function aulanexo_private.support_context() returns aulanexo_private.support_sessions
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=aulanexo_private.support_id(); context aulanexo_private.support_sessions; begin
 if sid is null then return null; end if;
 select * into context from aulanexo_private.support_sessions where id=sid and admin_id=auth.uid() and ended_at is null and expires_at>now();
 if context.id is null or not aulanexo_private.is_support_owner() then raise exception 'support_expired: El acceso de soporte terminó. Vuelve a tu panel.'; end if;
 if context.role='student' then
  if aulanexo_private.student_id_for_user(context.target_user_id,context.school_id) is null then raise exception 'support_expired: El acceso del estudiante fue revocado.'; end if;
 elsif (context.target_user_id<>auth.uid() or context.role<>'director') and not exists(select 1 from public.school_memberships m where m.user_id=context.target_user_id and m.school_id=context.school_id and m.role=context.role and m.active) then
  raise exception 'support_expired: El usuario ya no tiene este acceso.';
 end if;
 if context.role='teacher' and not exists(select 1 from public.teachers where user_id=context.target_user_id and school_id=context.school_id and status='active') then raise exception 'support_expired: La cuenta docente está inactiva.'; end if;
 return context;
end $$;
alter function public.support_accounts(uuid) rename to support_accounts_adults;
alter function public.support_accounts_adults(uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.support_accounts_adults(uuid) from public,anon,authenticated;
create function public.support_accounts(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare adults jsonb; begin
 adults:=aulanexo_private.support_accounts_adults(p_school_id);
 return adults || coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',concat_ws(' ',s.first_name,s.last_name),'email',u.email,'role','student'))
 from aulanexo_private.student_logins l join auth.users u on lower(u.email)=l.email join public.students s on s.id=l.student_id
 where l.school_id=p_school_id and aulanexo_private.student_id_for_user(u.id,p_school_id)=s.id),'[]'::jsonb);
end $$;
alter function public.start_support_session(uuid,uuid,text,text) rename to start_support_session_adults;
alter function public.start_support_session_adults(uuid,uuid,text,text) set schema aulanexo_private;
revoke all on function aulanexo_private.start_support_session_adults(uuid,uuid,text,text) from public,anon,authenticated;
create function public.start_support_session(p_school_id uuid,p_user_id uuid,p_role text,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 if p_role is distinct from 'student' then return aulanexo_private.start_support_session_adults(p_school_id,p_user_id,p_role,p_reason); end if;
 if not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario de MiCole puede abrir soporte desde su panel.'; end if;
 if aulanexo_private.student_id_for_user(p_user_id,p_school_id) is null then raise exception 'El estudiante no tiene ese acceso al colegio.'; end if;
 if length(trim(coalesce(p_reason,''))) not between 10 and 500 then raise exception 'Describe el motivo de soporte (10 a 500 caracteres).'; end if;
 update aulanexo_private.support_sessions set ended_at=now() where admin_id=auth.uid() and ended_at is null;
 insert into aulanexo_private.support_sessions(admin_id,school_id,target_user_id,role,reason) values(auth.uid(),p_school_id,p_user_id,p_role,trim(p_reason)) returning id into sid;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 select p_school_id,auth.uid(),coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'support_sessions',sid,'START',jsonb_build_object('name','Acceso de soporte','role','student','targetUserId',p_user_id,'reason',trim(p_reason)) from auth.users u where u.id=auth.uid();
 return jsonb_build_object('id',sid,'expiresAt',now()+interval '30 minutes');
end $$;

-- Mantener el bootstrap/vinculación de padres existente. El rol infantil se deriva
-- únicamente del correo confirmado y de la habilitación de Dirección.
alter function public.workspace_identity() rename to workspace_identity_adults;
alter function public.workspace_identity_adults() set schema aulanexo_private;
revoke all on function aulanexo_private.workspace_identity_adults() from public,anon,authenticated;
create function public.workspace_identity() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; child public.students; context aulanexo_private.support_sessions:=aulanexo_private.support_context(); child_id uuid; begin
 if auth.uid() is null then raise exception 'Inicia sesión para continuar.'; end if;
 result:=aulanexo_private.workspace_identity_adults();
 child_id:=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),context.school_id);
 if child_id is null or (context.id is not null and context.role<>'student') then return result || jsonb_build_object('studentIds','[]'::jsonb); end if;
 select * into child from public.students where id=child_id;
 return result || jsonb_build_object('roles',jsonb_build_array('student'),'memberships',jsonb_build_array(jsonb_build_object('schoolId',child.school_id,'role','student')),
 'studentIds',jsonb_build_array(child.id),'guardianStudentIds','[]'::jsonb,'teacherIds','[]'::jsonb);
end $$;

create function aulanexo_private.student_learning_access(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s join public.schools sch on sch.id=s.school_id
 where s.id=p_student and s.status='active' and sch.status='active' and s.profile_complete
 and not exists(select 1 from public.platform_charges c where c.student_id=s.id and c.status not in ('paid','cancelled'))
 and ((s.access_until is not null and s.access_until >= (now() at time zone 'America/La_Paz')::date)
 or not exists(select 1 from public.school_charges c where c.student_id=s.id and (c.status='overdue' or (c.status='pending' and c.due_date<(now() at time zone 'America/La_Paz')::date)))));
$$;
revoke all on function aulanexo_private.student_learning_access(uuid) from public,anon,authenticated;

create function public.student_portal() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare child public.students; sch public.schools; room public.classrooms; allowed boolean; context aulanexo_private.support_sessions:=aulanexo_private.support_context(); begin
 if auth.uid() is null or (context.id is not null and context.role<>'student') then raise exception 'Este acceso corresponde al estudiante.'; end if;
 select * into child from public.students where id=aulanexo_private.student_id_for_user(aulanexo_private.actor_uid(),context.school_id);
 if child.id is null then raise exception 'El colegio no ha habilitado tu acceso de estudiante.'; end if;
 select * into sch from public.schools where id=child.school_id;
 select * into room from public.classrooms where id=child.classroom_id and school_id=child.school_id;
 allowed:=aulanexo_private.student_learning_access(child.id);
 return jsonb_build_object('accessAllowed',allowed,'accessMessage',case when allowed then '' else 'Tu acceso está en pausa. Pide a tu madre, padre o Dirección que revise tu inscripción y los pagos.' end,
 'schools',jsonb_build_array(jsonb_build_object('id',sch.id,'name',sch.name,'slug',sch.slug,'city',sch.city,'status',sch.status,'logoUrl',sch.logo_url,'color',sch.brand_color,'initials','')),
 'students',jsonb_build_array(jsonb_build_object('id',child.id,'schoolId',child.school_id,'classroomId',child.classroom_id,'firstName',child.first_name,'lastName',child.last_name,'status',child.status)),
 'classrooms',case when room.id is not null then jsonb_build_array(jsonb_build_object('id',room.id,'schoolId',room.school_id,'name',room.name,'level',room.level,'schedule',room.schedule,'teacherIds','[]'::jsonb)) else '[]'::jsonb end,
 'events',case when allowed then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'schoolId',e.school_id,'classroomId',e.classroom_id,'title',e.title,'date',e.event_date,'description',e.description,'type',e.type) order by e.event_date,e.id) from public.calendar_events e where e.school_id=child.school_id and (e.classroom_id is null or e.classroom_id=child.classroom_id)),'[]'::jsonb) else '[]'::jsonb end,
 'announcements',case when allowed then coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'schoolId',a.school_id,'classroomId',a.classroom_id,'title',a.title,'content',a.content,'audience',a.audience,'createdAt',a.created_at) order by a.created_at,a.id) from public.announcements a where a.school_id=child.school_id and (a.classroom_id is null or a.classroom_id=child.classroom_id) and a.audience in ('all','families')),'[]'::jsonb) else '[]'::jsonb end,
 'dailyEntries',case when allowed then coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'schoolId',d.school_id,'studentId',d.student_id,'category',d.category,'note',d.note,'date',d.entry_date) order by d.entry_date,d.id) from public.daily_entries d where d.student_id=child.id and d.school_id=child.school_id and d.category='tarea'),'[]'::jsonb) else '[]'::jsonb end);
end $$;

-- Bloquear altas de colegios desde una cuenta infantil, incluso por API directa.
alter function public.request_institution(jsonb) rename to request_institution_adults;
alter function public.request_institution_adults(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.request_institution_adults(jsonb) from public,anon,authenticated;
create function public.request_institution(p_request jsonb) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from aulanexo_private.student_logins l join auth.users u on lower(u.email)=l.email where u.id=auth.uid())
 or (aulanexo_private.support_context()).role='student' then raise exception 'Las cuentas de estudiantes son de solo lectura.'; end if;
 return aulanexo_private.request_institution_adults(p_request);
end $$;

revoke all on function public.student_login_account(uuid),public.set_student_login(uuid,text,boolean),public.support_accounts(uuid),public.start_support_session(uuid,uuid,text,text),public.workspace_identity(),public.student_portal(),public.request_institution(jsonb) from public,anon;
grant execute on function public.student_login_account(uuid),public.set_student_login(uuid,text,boolean),public.support_accounts(uuid),public.start_support_session(uuid,uuid,text,text),public.workspace_identity(),public.student_portal(),public.request_institution(jsonb) to authenticated;
