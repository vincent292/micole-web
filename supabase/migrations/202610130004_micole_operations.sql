-- MiCole: onboarding, notificaciones leídas, auditoría y arranque del administrador.
-- Los correos de superadmin se reservan exclusivamente desde servidor/SQL.
create table aulanexo_private.platform_admin_allowlist (
 email text primary key check(email=lower(trim(email)) and email like '%@%'),
 created_at timestamptz not null default now()
);
revoke all on aulanexo_private.platform_admin_allowlist from public,anon,authenticated;
create function aulanexo_private.provision_platform_admin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from aulanexo_private.platform_admin_allowlist where email=lower(new.email)) then
  insert into public.platform_admins(user_id) values(new.id) on conflict(user_id) do nothing;
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.provision_platform_admin() from public,anon,authenticated;
create trigger micole_provision_platform_admin after insert or update of email,email_confirmed_at on auth.users for each row execute function aulanexo_private.provision_platform_admin();

create table public.institution_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), email text not null,
 school_name text not null check(length(trim(school_name)) between 3 and 160), city text not null check(length(trim(city)) between 2 and 100),
 contact_name text not null check(length(trim(contact_name)) between 2 and 160), phone text not null check(length(trim(phone)) between 6 and 30),
 message text not null default '' check(length(message)<=2000), status text not null default 'pending' check(status in ('pending','approved','rejected')),
 school_id uuid references public.schools(id), response text not null default '', reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now(), reviewed_at timestamptz
);
create unique index one_pending_institution_request on public.institution_requests(user_id) where status='pending';
alter table public.institution_requests enable row level security;
revoke all on public.institution_requests from public,anon,authenticated;
grant select on public.institution_requests to authenticated;
create policy institution_requests_select on public.institution_requests for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create function public.request_institution(p_request jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid; verified_email text; begin
 select email into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verifica tu correo antes de solicitar una institución.'; end if;
 if exists(select 1 from public.institution_requests where user_id=auth.uid() and status='pending') then raise exception 'Ya tienes una solicitud pendiente. Podrás consultar su estado aquí.'; end if;
 insert into public.institution_requests(user_id,email,school_name,city,contact_name,phone,message)
 values(auth.uid(),lower(verified_email),trim(p_request->>'school_name'),trim(p_request->>'city'),trim(p_request->>'contact_name'),trim(p_request->>'phone'),trim(coalesce(p_request->>'message',''))) returning id into request_id;
 return request_id;
end $$;
create function public.review_institution_request(p_id uuid,p_approve boolean,p_response text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.institution_requests; new_school_id uuid; new_slug text; begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma puede aprobar instituciones.'; end if;
 select * into r from public.institution_requests where id=p_id for update;
 if r.id is null then raise exception 'No se encontró la solicitud.'; end if;
 if r.status<>'pending' then return r.school_id; end if;
 if p_approve then
  new_school_id:=gen_random_uuid();
  new_slug:=trim(both '-' from regexp_replace(lower(r.school_name),'[^a-z0-9]+','-','g'));
  if length(new_slug)=0 then new_slug:='colegio'; end if;
  insert into public.schools(id,name,slug,city,director_name,brand_color,phone,status)
  values(new_school_id,r.school_name,new_slug||'-'||left(new_school_id::text,8),r.city,r.contact_name,'#3D6EF7',r.phone,'active');
  insert into public.school_memberships(school_id,user_id,role) values(new_school_id,r.user_id,'director');
 end if;
 update public.institution_requests set status=case when p_approve then 'approved' else 'rejected' end,school_id=new_school_id,
 response=trim(coalesce(p_response,'')),reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 return new_school_id;
end $$;
revoke all on function public.request_institution(jsonb),public.review_institution_request(uuid,boolean,text) from public,anon;
grant execute on function public.request_institution(jsonb),public.review_institution_request(uuid,boolean,text) to authenticated;

create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), school_id uuid references public.schools(id),
 student_id uuid, classroom_id uuid, kind text not null, source_id uuid not null, title text not null, body text not null default '',
 target text not null, read_at timestamptz, created_at timestamptz not null default now(),
 foreign key(student_id,school_id) references public.students(id,school_id), foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
 unique(user_id,kind,source_id)
);
create index notifications_user_date on public.notifications(user_id,created_at desc);
alter table public.notifications enable row level security;
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using(user_id=auth.uid() and
 (kind in ('payment','access','school_request') or (student_id is not null and public.may_use_student(student_id)) or (student_id is null and public.may_use_classroom(school_id,classroom_id))));
create function public.mark_notification_read(p_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null and (p_id is null or id=p_id);
end $$;
revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create function aulanexo_private.notify_student(p_school uuid,p_student uuid,p_kind text,p_source uuid,p_title text,p_body text,p_target text,p_exclude uuid default null,p_staff boolean default true,p_family boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
 select recipient,p_school,p_student,p_kind,p_source,p_title,left(p_body,300),p_target from (
  select m.user_id as recipient from public.school_memberships m where p_staff and m.school_id=p_school and m.active and m.role='director'
  union select t.user_id from public.students s join public.teacher_classrooms tc on tc.school_id=s.school_id and tc.classroom_id=s.classroom_id
  join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id where p_staff and s.id=p_student and t.status='active' and t.user_id is not null and public.has_school_role_for_user(t.user_id,p_school,'teacher')
  union select g.user_id from public.student_guardians g where p_family and g.student_id=p_student and g.verified_at is not null and g.can_view and public.has_school_role_for_user(g.user_id,p_school,'guardian')
 ) recipients where recipient is not null and recipient is distinct from p_exclude
 on conflict(user_id,kind,source_id) do nothing;
end $$;
-- Comprobar el rol del destinatario sin depender de la cuenta que publica.
create function public.has_school_role_for_user(p_user uuid,p_school uuid,p_role text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_memberships where user_id=p_user and school_id=p_school and role=p_role and active);
$$;
revoke all on function public.has_school_role_for_user(uuid,uuid,text) from public,anon,authenticated;
-- La función anterior solo se invoca desde triggers internos.
create function aulanexo_private.send_operation_notifications() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='announcements' then
  insert into public.notifications(user_id,school_id,classroom_id,kind,source_id,title,body,target)
  select distinct m.user_id,new.school_id,new.classroom_id,'announcement',new.id,new.title,left(new.content,300),'announcements'
  from public.school_memberships m where m.school_id=new.school_id and m.active and m.user_id is distinct from new.created_by and (
    m.role='director' or
    (m.role='teacher' and new.audience in ('all','staff') and (new.classroom_id is null or exists(select 1 from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id where tc.classroom_id=new.classroom_id and tc.school_id=new.school_id and t.user_id=m.user_id and t.status='active'))) or
    (m.role='guardian' and new.audience in ('all','families') and exists(select 1 from public.student_guardians g join public.students s on s.id=g.student_id where g.user_id=m.user_id and g.verified_at is not null and g.can_view and s.school_id=new.school_id and (new.classroom_id is null or s.classroom_id=new.classroom_id)))
  ) on conflict(user_id,kind,source_id) do nothing;
 elsif TG_TABLE_NAME='messages' then
  perform aulanexo_private.notify_student(new.school_id,new.student_id,'message',new.id,'Nuevo mensaje',new.author_name||': '||left(new.body,180),'messages',new.author_id);
 elsif TG_TABLE_NAME='family_requests' then
  if TG_OP='INSERT' then
   perform aulanexo_private.notify_student(new.school_id,new.student_id,'request',new.id,case when new.type='pickup' then 'Recogida autorizada para revisar' else 'Nuevo permiso de ausencia' end,'La familia envió una solicitud.','requests',new.created_by,true,false);
  elsif new.status is distinct from old.status then
   perform aulanexo_private.notify_student(new.school_id,new.student_id,'request_response',new.id,'Tu solicitud fue revisada',new.response,'requests',null,false,true);
  end if;
 elsif TG_TABLE_NAME='school_charges' then
  if TG_OP='UPDATE' and new.status='paid' and old.status<>'paid' then
   perform aulanexo_private.notify_student(new.school_id,new.student_id,'payment',new.id,'Pago registrado',new.concept||' · Bs '||new.amount::text,'payments',null,false,true);
  end if;
 elsif TG_TABLE_NAME='platform_charges' then
  if TG_OP='UPDATE' and new.student_id is not null and new.status='paid' and old.status<>'paid' then
   perform aulanexo_private.notify_student(new.school_id,new.student_id,'access',new.id,'Activación pagada','Dirección ya puede activar la inscripción.','students',null,true,false);
  end if;
 elsif TG_TABLE_NAME='institution_requests' then
  if TG_OP='INSERT' then
   insert into public.notifications(user_id,kind,source_id,title,body,target) select user_id,'school_request',new.id,'Nueva solicitud de institución',new.school_name,'institutionRequests' from public.platform_admins on conflict(user_id,kind,source_id) do nothing;
  elsif new.status is distinct from old.status then
   insert into public.notifications(user_id,school_id,kind,source_id,title,body,target) values(new.user_id,new.school_id,'school_request',new.id,case when new.status='approved' then 'Tu institución está lista' else 'Tu solicitud fue revisada' end,new.response,'overview') on conflict(user_id,kind,source_id) do nothing;
  end if;
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.notify_student(uuid,uuid,text,uuid,text,text,text,uuid,boolean,boolean),aulanexo_private.send_operation_notifications() from public,anon,authenticated;
create trigger notifications_announcements after insert on public.announcements for each row execute function aulanexo_private.send_operation_notifications();
create trigger notifications_messages after insert on public.messages for each row execute function aulanexo_private.send_operation_notifications();
create trigger notifications_requests after insert or update on public.family_requests for each row execute function aulanexo_private.send_operation_notifications();
create trigger notifications_school_payments after update of status on public.school_charges for each row execute function aulanexo_private.send_operation_notifications();
create trigger notifications_activation after update of status on public.platform_charges for each row execute function aulanexo_private.send_operation_notifications();
create trigger notifications_institutions after insert or update on public.institution_requests for each row execute function aulanexo_private.send_operation_notifications();

create table public.audit_events (
 id uuid primary key default gen_random_uuid(),school_id uuid references public.schools(id),actor_id uuid references auth.users(id),actor_name text not null,
 entity text not null,entity_id uuid not null,action text not null,summary jsonb not null default '{}',created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from public,anon,authenticated;
grant select on public.audit_events to authenticated;
create policy audit_select on public.audit_events for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create function aulanexo_private.capture_audit() returns trigger
language plpgsql security definer set search_path='' as $$
declare value jsonb; previous jsonb; scope uuid; actor text; event_summary jsonb;
begin
 value:=to_jsonb(new); previous:=case when TG_OP='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
 scope:=case when TG_TABLE_NAME='schools' then (value->>'id')::uuid else (value->>'school_id')::uuid end;
 select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into actor from auth.users where id=auth.uid();
 event_summary:=jsonb_build_object('name',coalesce(value->>'name',value->>'school_name',value->>'concept',nullif(concat_ws(' ',value->>'first_name',value->>'last_name'),'')), 'status',value->>'status','previousStatus',previous->>'status','amount',value->>'amount','classroomId',value->>'classroom_id');
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(scope,auth.uid(),coalesce(actor,'Sistema'),TG_TABLE_NAME,(value->>'id')::uuid,TG_OP,jsonb_strip_nulls(event_summary));
 return new;
end $$;
revoke all on function aulanexo_private.capture_audit() from public,anon,authenticated;
create trigger audit_schools after insert or update on public.schools for each row execute function aulanexo_private.capture_audit();
create trigger audit_students after insert or update on public.students for each row execute function aulanexo_private.capture_audit();
create trigger audit_teachers after insert or update on public.teachers for each row execute function aulanexo_private.capture_audit();
create trigger audit_school_charges after insert or update on public.school_charges for each row execute function aulanexo_private.capture_audit();
create trigger audit_platform_charges after insert or update on public.platform_charges for each row execute function aulanexo_private.capture_audit();
create trigger audit_invitations after insert or update on public.invitations for each row execute function aulanexo_private.capture_audit();
create trigger audit_institution_requests after insert or update on public.institution_requests for each row execute function aulanexo_private.capture_audit();
-- La paleta inicial usa azul MiCole. Cada institución conserva su color configurable.
alter table public.schools alter column brand_color set default '#3D6EF7';
