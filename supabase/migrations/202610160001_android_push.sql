-- Android FCM: installation ownership, a private transactional outbox, and server-only delivery.
create table aulanexo_private.push_devices (
 id uuid primary key, session_id uuid, user_id uuid not null references auth.users(id) on delete cascade,
 token text not null unique, enabled boolean not null default true,
 categories text[] not null default array['academic','alerts','messages','payments','birthdays'],
 generation integer not null default 1, updated_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days'
);
create table aulanexo_private.push_deliveries (
 id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.notifications(id) on delete cascade,
 device_id uuid not null references aulanexo_private.push_devices(id) on delete cascade,
 generation integer not null, category text not null, status text not null default 'pending' check(status in ('pending','processing','sent','discarded','failed')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease_id uuid, locked_until timestamptz, last_error text, sent_at timestamptz,
 created_at timestamptz not null default now(), unique(notification_id,device_id)
);
create index push_ready on aulanexo_private.push_deliveries(available_at) where status in ('pending','processing');
revoke all on aulanexo_private.push_devices,aulanexo_private.push_deliveries from public,anon,authenticated;

create function aulanexo_private.push_session_active(p_session uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare valid boolean;begin
 if p_session is null then return true;end if;
 if to_regclass('auth.sessions') is null then return false;end if;
 execute 'select exists(select 1 from auth.sessions where id=$1)' into valid using p_session;return valid;
end $$;
revoke all on function aulanexo_private.push_session_active(uuid) from public,anon,authenticated;

create function public.register_push_device(p_installation_id uuid,p_token text,p_enabled boolean default true,p_categories text[] default array['academic','alerts','messages','payments','birthdays']) returns void
language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); session_value uuid:=nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'session_id','')::uuid;begin
 if who is null or not exists(select 1 from auth.users where id=who and email_confirmed_at is not null) then raise exception 'Verifica tu cuenta antes de activar los avisos.';end if;
 if not aulanexo_private.push_session_active(session_value) then raise exception 'Tu sesión ya no está activa.';end if;
 -- Always the authenticated account, never the user impersonated in a support session.
 if not (exists(select 1 from public.platform_admins where user_id=who) or exists(select 1 from public.school_memberships where user_id=who and active) or aulanexo_private.student_id_for_user(who) is not null) then raise exception 'Tu cuenta todavía no tiene acceso a MiCole.';end if;
 if p_installation_id is null or length(p_token) not between 20 and 4096 or p_token !~ '^[A-Za-z0-9_:.-]+$' or p_enabled is null or p_categories is null or not(p_categories <@ array['academic','alerts','messages','payments','birthdays']) then raise exception 'La configuración del dispositivo no es válida.';end if;
 -- An FCM token belongs to exactly one installation/account at a time.
 delete from aulanexo_private.push_devices where token=p_token and id<>p_installation_id;
 insert into aulanexo_private.push_devices as d(id,user_id,session_id,token,enabled,categories) values(p_installation_id,who,session_value,p_token,p_enabled,p_categories)
 on conflict(id) do update set user_id=excluded.user_id,session_id=excluded.session_id,token=excluded.token,enabled=excluded.enabled,categories=excluded.categories,
 generation=case when d.session_id is distinct from excluded.session_id or d.user_id<>excluded.user_id or d.token<>excluded.token or d.enabled<>excluded.enabled then d.generation+1 else d.generation end,
 updated_at=now(),expires_at=now()+interval '30 days';
end $$;
create function public.unregister_push_device(p_installation_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sesión requerida.';end if;
 update aulanexo_private.push_devices set enabled=false,generation=generation+1,updated_at=now() where id=p_installation_id and user_id=auth.uid();
end $$;
revoke all on function public.register_push_device(uuid,text,boolean,text[]),public.unregister_push_device(uuid) from public,anon;
grant execute on function public.register_push_device(uuid,text,boolean,text[]),public.unregister_push_device(uuid) to authenticated;

create function aulanexo_private.push_category(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind like 'birthday_%' then 'birthdays' when p_kind like 'payment_due_%' or p_kind in ('payment','payment_due','payment_receipt') then 'payments' when p_kind='message' then 'messages' when p_kind in ('daily','daily_task','grade','calendar','materials','activity') then 'academic' else 'alerts' end;
$$;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications; sid uuid; s public.students; allowed boolean:=false; previous_uid text:=current_setting('request.jwt.claim.sub',true); previous_headers text:=current_setting('request.headers',true);begin
 select * into n from public.notifications where id=p_id;
 if n.id is null or n.read_at is not null or n.created_at<now()-interval '48 hours' or not exists(select 1 from auth.users where id=n.user_id and email_confirmed_at is not null) then return false;end if;
 perform set_config('request.jwt.claim.sub',n.user_id::text,true),set_config('request.headers','{}',true);
 sid:=aulanexo_private.student_id_for_user(n.user_id,n.school_id);
 if n.kind='push_test' then allowed:=true;
 elsif sid is not null then
  select * into s from public.students where id=sid;
  allowed:=n.kind in ('daily_task','calendar','materials','activity','announcement') and aulanexo_private.student_learning_access(sid)
   and (n.student_id is null or n.student_id=sid) and (n.classroom_id is null or n.classroom_id=s.classroom_id) and n.school_id=s.school_id;
  if allowed and n.kind='announcement' then allowed:=exists(select 1 from public.announcements where id=n.source_id and audience in ('all','families') and school_id=s.school_id and (classroom_id is null or classroom_id=s.classroom_id));end if;
  if allowed and n.kind='daily_task' then allowed:=exists(select 1 from public.daily_entries where id=n.source_id and student_id=sid and category='tarea');end if;
  if allowed and n.kind='calendar' then allowed:=exists(select 1 from public.calendar_events where id=n.source_id and school_id=s.school_id and (classroom_id is null or classroom_id=s.classroom_id));end if;
 else
  allowed:=n.kind='push_test' or
   (n.kind='school_request' and (n.school_id is null and exists(select 1 from public.platform_admins where user_id=n.user_id) or public.has_school_role(n.school_id,array['director']))) or
   (n.student_id is not null and (((n.kind like 'payment_due_%' or n.kind in ('payment','payment_due','payment_receipt','access','intake')) and public.may_access_student(n.student_id)) or public.may_use_student(n.student_id))) or
   (n.student_id is null and n.school_id is not null and n.kind<>'school_request' and public.may_use_classroom(n.school_id,n.classroom_id));
 end if;
 -- A receipt replaces the legacy "charge paid" push created in the same transaction.
 if n.kind like 'payment_due_%' and not exists(select 1 from public.school_charges where id=n.source_id and student_id=n.student_id and status not in ('paid','cancelled') and paid_amount<amount) then allowed:=false;end if;
 if n.kind='payment' and exists(select 1 from public.school_receipts r where r.student_id=n.student_id and r.created_at=n.created_at) then allowed:=false;end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);
 return allowed;
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);
 return false;
end $$;

create function aulanexo_private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
declare category_value text:=aulanexo_private.push_category(new.kind); local_time timestamp:=now() at time zone 'America/La_Paz'; due timestamptz:=now();begin
 -- Do not wake families for the midnight birthday/billing job. Tests requested by the user are immediate.
 if new.kind not in ('push_test','message','request','request_response') and extract(hour from local_time)<7 then due:=(local_time::date+time '07:00') at time zone 'America/La_Paz';
 elsif new.kind not in ('push_test','message','request','request_response') and extract(hour from local_time)>=22 then due:=((local_time::date+1)+time '07:00') at time zone 'America/La_Paz';end if;
 insert into aulanexo_private.push_deliveries(notification_id,device_id,generation,category,available_at)
 select new.id,d.id,d.generation,category_value,due from aulanexo_private.push_devices d where d.user_id=new.user_id and d.enabled and d.expires_at>now() and (new.kind='push_test' or category_value=any(d.categories))
 on conflict(notification_id,device_id) do nothing;
 return new;
end $$;
create trigger push_outbox after insert on public.notifications for each row execute function aulanexo_private.enqueue_push();

create function public.claim_push_deliveries(p_limit integer default 40) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 with ready as (select id from aulanexo_private.push_deliveries where attempts<8 and created_at>now()-interval '48 hours' and available_at<=now() and (status='pending' or (status='processing' and locked_until<now())) order by available_at,id for update skip locked limit greatest(1,least(p_limit,40))),
 claimed as (update aulanexo_private.push_deliveries d set status='processing',lease_id=gen_random_uuid(),locked_until=now()+interval '3 minutes',attempts=attempts+1 from ready r where d.id=r.id returning d.id,d.lease_id)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'lease',lease_id)),'[]'::jsonb) into result from claimed;
 return result;
end $$;
create function public.prepare_push_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare delivery aulanexo_private.push_deliveries;device aulanexo_private.push_devices;n public.notifications;begin
 select * into delivery from aulanexo_private.push_deliveries where id=p_id and lease_id=p_lease and status='processing' and locked_until>now() for update;
 if delivery.id is null then return null;end if;
 select * into device from aulanexo_private.push_devices where id=delivery.device_id;
 select * into n from public.notifications where id=delivery.notification_id;
 if device.id is null or not aulanexo_private.push_session_active(device.session_id) or not device.enabled or device.expires_at<now() or device.user_id<>n.user_id or device.generation<>delivery.generation or (n.kind<>'push_test' and not(delivery.category=any(device.categories))) or not aulanexo_private.push_notice_visible(n.id) then
  update aulanexo_private.push_deliveries set status='discarded',locked_until=null,last_error='no_longer_authorized' where id=p_id;return null;
 end if;
 -- Only generic text leaves the database: no names, grades, health, NIT or amounts on a lock screen.
 return jsonb_build_object('token',device.token,'recipientId',n.user_id,'notificationId',n.id,'category',delivery.category,'kind',n.kind);
end $$;
create function public.finish_push_delivery(p_id uuid,p_lease uuid,p_result text,p_error text default null) returns void language plpgsql security definer set search_path='' as $$
declare item aulanexo_private.push_deliveries;begin
 if p_result not in ('sent','retry','invalid','failed') then raise exception 'Resultado inválido.';end if;
 select * into item from aulanexo_private.push_deliveries where id=p_id and lease_id=p_lease and status='processing' for update;
 if item.id is null then return;end if;
 if p_result='invalid' then update aulanexo_private.push_devices set enabled=false,generation=generation+1 where id=item.device_id and generation=item.generation;end if;
 update aulanexo_private.push_deliveries set status=case when p_result='sent' then 'sent' when p_result='retry' and attempts<8 then 'pending' else 'failed' end,
 sent_at=case when p_result='sent' then now() end,locked_until=null,last_error=left(p_error,100),available_at=now()+least(3600,power(2,attempts)::integer*30)*interval '1 second' where id=p_id;
end $$;
revoke all on function public.claim_push_deliveries(integer),public.prepare_push_delivery(uuid,uuid),public.finish_push_delivery(uuid,uuid,text,text) from public,anon,authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.claim_push_deliveries(integer),public.prepare_push_delivery(uuid,uuid),public.finish_push_delivery(uuid,uuid,text,text) to service_role;
end if;end$$;

create function public.resolve_push_notification(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notifications;begin
 if auth.uid() is null or coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb ? 'x-micole-support' then raise exception 'Vuelve a tu cuenta para abrir el aviso.';end if;
 select * into n from public.notifications where id=p_id and user_id=auth.uid();
 if n.id is null then raise exception 'Este aviso no corresponde a tu cuenta.';end if;
 -- Allow opening an already-read notification, while applying the same current authorization.
 if n.read_at is not null then update public.notifications set read_at=null where id=n.id;end if;
 if not aulanexo_private.push_notice_visible(n.id) then raise exception 'El aviso ya no está disponible para tu acceso actual.';end if;
 update public.notifications set read_at=coalesce(n.read_at,now()) where id=n.id;
 return jsonb_build_object('schoolId',n.school_id,'studentId',n.student_id,'target',n.target);
end $$;
create function public.test_push_notification() returns uuid language plpgsql security definer set search_path='' as $$
declare notice uuid:=gen_random_uuid();begin
 if auth.uid() is null or not exists(select 1 from aulanexo_private.push_devices where user_id=auth.uid() and enabled and expires_at>now()) then raise exception 'Activa primero las notificaciones de este teléfono.';end if;
 if exists(select 1 from public.notifications where user_id=auth.uid() and kind='push_test' and created_at>now()-interval '1 minute') then raise exception 'Espera un minuto para otra prueba.';end if;
 insert into public.notifications(id,user_id,kind,source_id,title,body,target) values(notice,auth.uid(),'push_test',notice,'MiCole está conectado','Las notificaciones de este teléfono están activas.','notifications');return notice;
end $$;
revoke all on function public.resolve_push_notification(uuid),public.test_push_notification() from public,anon;
grant execute on function public.resolve_push_notification(uuid),public.test_push_notification() to authenticated;
create policy notifications_push_finance on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and (kind='push_test' or ((kind like 'payment_due_%' or kind in ('payment_due','payment_receipt')) and public.may_access_student(student_id))));

-- Academic sources use the same per-child/per-classroom recipients as the existing inbox.
create function aulanexo_private.notify_class(p_school uuid,p_class uuid,p_kind text,p_source uuid,p_title text,p_body text,p_target text,p_exclude uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare child record;begin
 for child in select id from public.students where school_id=p_school and (p_class is null or classroom_id=p_class) and status='active' loop
  perform aulanexo_private.notify_student(p_school,child.id,p_kind,p_source,p_title,p_body,p_target,p_exclude,false,true);
 end loop;
 -- Optional student accounts receive only content already exposed by student_portal().
 insert into public.notifications(user_id,school_id,classroom_id,kind,source_id,title,body,target)
 select u.id,p_school,p_class,p_kind,p_source,p_title,left(p_body,300),p_target from auth.users u join aulanexo_private.student_logins l on l.email=lower(u.email)
 join public.students s on s.id=l.student_id where l.enabled and u.email_confirmed_at is not null and s.school_id=p_school and s.status='active' and (p_class is null or s.classroom_id=p_class)
 and aulanexo_private.student_id_for_user(u.id,p_school)=s.id and u.id is distinct from p_exclude
 on conflict(user_id,kind,source_id) do nothing;
end $$;
create function aulanexo_private.send_academic_push_notices() returns trigger language plpgsql security definer set search_path='' as $$
declare child public.students;begin
 if TG_TABLE_NAME='daily_entries' then
  perform aulanexo_private.notify_student(new.school_id,new.student_id,case when new.category='tarea' then 'daily_task' else 'daily' end,new.id,case when new.category='tarea' then 'Nueva tarea' else 'Novedad en el cuaderno' end,left(new.note,300),'daily',new.created_by,false,true);
  if new.category='tarea' then
   insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
   select u.id,new.school_id,new.student_id,'daily_task',new.id,'Nueva tarea',left(new.note,300),'daily' from auth.users u where aulanexo_private.student_id_for_user(u.id,new.school_id)=new.student_id and u.id is distinct from new.created_by on conflict(user_id,kind,source_id) do nothing;
  end if;
 elsif TG_TABLE_NAME='grades' then
  perform aulanexo_private.notify_student(new.school_id,new.student_id,'grade',new.id,'Nueva nota o recomendación','El docente publicó una actualización.','grades',new.created_by,false,true);
 elsif TG_TABLE_NAME='calendar_events' then
  -- Approved requests also publish an announcement. Use that one instead of sending twice.
  if not exists(select 1 from public.academic_requests where id=new.id and status='approved') then
   perform aulanexo_private.notify_class(new.school_id,new.classroom_id,'calendar',new.id,new.title,left(new.description,300),'calendar',new.created_by);
  end if;
 elsif TG_TABLE_NAME='school_receipts' then
  perform aulanexo_private.notify_student(new.school_id,new.student_id,'payment_receipt',new.id,'Cobro confirmado','Se registró un cobro. Consulta tu recibo y saldo.','cash',new.recorded_by,false,true);
 elsif TG_TABLE_NAME='announcements' then
  if new.audience in ('all','families') then
   -- Adults already receive the original announcement trigger; add only the student account.
   insert into public.notifications(user_id,school_id,classroom_id,kind,source_id,title,body,target)
   select u.id,new.school_id,new.classroom_id,'announcement',new.id,new.title,left(new.content,300),'announcements' from auth.users u
   join aulanexo_private.student_logins l on l.email=lower(u.email) join public.students s on s.id=l.student_id
   where l.enabled and s.school_id=new.school_id and (new.classroom_id is null or s.classroom_id=new.classroom_id) and aulanexo_private.student_id_for_user(u.id,new.school_id)=s.id and u.id is distinct from new.created_by
   on conflict(user_id,kind,source_id) do nothing;
  end if;
 end if;return new;
end $$;
create trigger push_daily_notices after insert on public.daily_entries for each row execute function aulanexo_private.send_academic_push_notices();
create trigger push_grade_notices after insert on public.grades for each row execute function aulanexo_private.send_academic_push_notices();
create trigger push_calendar_notices after insert on public.calendar_events for each row execute function aulanexo_private.send_academic_push_notices();
create trigger push_receipt_notices after insert on public.school_receipts for each row execute function aulanexo_private.send_academic_push_notices();
create trigger push_student_announcements after insert on public.announcements for each row execute function aulanexo_private.send_academic_push_notices();

create function aulanexo_private.send_payment_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare c public.school_charges; added integer:=0;d date:=(now() at time zone 'America/La_Paz')::date;begin
 for c in select ch.* from public.school_charges ch join public.students s on s.id=ch.student_id join public.schools sch on sch.id=ch.school_id where s.status='active' and sch.status='active' and ch.status not in ('paid','cancelled') and ch.paid_amount<ch.amount and ch.due_date in (d+3,d,d-1) loop
  perform aulanexo_private.notify_student(c.school_id,c.student_id,'payment_due_'||c.due_date::text||'_'||(c.due_date-d)::text,c.id,'Recordatorio de pago','Tienes una cuota próxima a vencer o pendiente.','payments',null,false,true);
  added:=added+1;
 end loop;return added;
end $$;
-- Functions in the private schema are never executable by an app account.
revoke all on function aulanexo_private.push_category(text),aulanexo_private.push_notice_visible(uuid),aulanexo_private.enqueue_push(),aulanexo_private.notify_class(uuid,uuid,text,uuid,text,text,text,uuid),aulanexo_private.send_academic_push_notices(),aulanexo_private.send_payment_reminders() from public,anon,authenticated;

create or replace function aulanexo_private.send_birthday_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare today_value date:=(now() at time zone 'America/La_Paz')::date;days_before integer;target date;child record;recipient uuid;sent integer:=0;added integer;begin
 for days_before in 0..2 loop
  target:=today_value+days_before;
  for child in select s.* from public.students s join public.schools sch on sch.id=s.school_id where s.status='active' and sch.status='active' and
   (to_char(s.birth_date,'MM-DD')=to_char(target,'MM-DD') or (to_char(s.birth_date,'MM-DD')='02-29' and to_char(target,'MM-DD')='02-28' and extract(day from (date_trunc('month',target)+interval '1 month - 1 day'))=28)) loop
   for recipient in
    select user_id from public.school_memberships where school_id=child.school_id and role='director' and active
    union select t.user_id from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id where tc.classroom_id=child.classroom_id and t.status='active' and t.user_id is not null
    union select g.user_id from public.student_guardians g where g.student_id=child.id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father')
   loop
    insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
    values(recipient,child.school_id,child.id,child.classroom_id,'birthday_'||target::text||'_'||days_before,child.id,case when days_before=0 then 'Cumpleaños de hoy' else 'Cumpleaños en '||days_before||case when days_before=1 then ' día' else ' días' end end,child.first_name||' cumple años el '||to_char(target,'DD/MM')||'.','calendar')
    on conflict(user_id,kind,source_id) do nothing;
    get diagnostics added=row_count; sent:=sent+added;
   end loop;
  end loop;
 end loop;
 return sent;
end $$;

create function aulanexo_private.dispatch_push_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret_value text; base_url text; request_id bigint;begin
 select decrypted_secret into secret_value from vault.decrypted_secrets where name='micole_push_worker_key';
 select decrypted_secret into base_url from vault.decrypted_secrets where name='micole_push_project_url';
 if secret_value is null or base_url is null then return null;end if;
 select net.http_post(url:=base_url||'/functions/v1/push-dispatch',headers:=jsonb_build_object('Content-Type','application/json','x-micole-worker-key',secret_value),body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
 return request_id;
end $$;
create function aulanexo_private.prune_push_history() returns void language plpgsql security definer set search_path='' as $$
begin
 update aulanexo_private.push_deliveries set status='discarded',locked_until=null where status in ('pending','processing') and (created_at<now()-interval '48 hours' or attempts>=8);
 delete from aulanexo_private.push_deliveries where created_at<now()-interval '14 days';
 delete from aulanexo_private.push_devices where expires_at<now()-interval '60 days';
 delete from public.notifications where kind='push_test' and created_at<now()-interval '7 days';
end $$;
revoke all on function aulanexo_private.dispatch_push_worker(),aulanexo_private.prune_push_history() from public,anon,authenticated;
