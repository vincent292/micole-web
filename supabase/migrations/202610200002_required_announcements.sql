-- Targeted communications, personal acknowledgments and hourly server reminders.
alter table public.announcements
 add column category text not null default 'general' check(category in ('general','academic','grades','health','pickup')),
 add column requires_acknowledgment boolean not null default false,
 add column remind_hourly boolean not null default false,
 add column urgent boolean not null default false,
 add column targeted boolean not null default false,
 add column revoked_at timestamptz,
 add column content_hash text not null default '';
create table aulanexo_private.announcement_settings(singleton boolean primary key default true check(singleton),quiet_hours boolean not null default true,critical_when_unpaid boolean not null default true);
insert into aulanexo_private.announcement_settings default values;
create table aulanexo_private.announcement_targets(
 announcement_id uuid not null references public.announcements(id) on delete cascade deferrable initially deferred,
 school_id uuid not null,student_id uuid not null,primary key(announcement_id,student_id),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
revoke all on aulanexo_private.announcement_settings,aulanexo_private.announcement_targets from public,anon,authenticated,service_role;
create table public.announcement_receipts(
 announcement_id uuid not null references public.announcements(id) on delete cascade,school_id uuid not null references public.schools(id),user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz,acknowledged_at timestamptz,content_hash text not null,
 created_at timestamptz not null default now(),next_reminder_at timestamptz,primary key(announcement_id,user_id)
);
create index announcement_reminders_due on public.announcement_receipts(next_reminder_at) where next_reminder_at is not null and acknowledged_at is null;
alter table public.announcement_receipts enable row level security;
revoke all on public.announcement_receipts from public,anon,authenticated;
grant select on public.announcement_receipts to authenticated;

-- Recipients are resolved against current verified relationships; a child selection never broadens to the class.
create function aulanexo_private.announcement_recipient(p_id uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.announcements a join public.schools sch on sch.id=a.school_id
 join auth.users u on u.id=p_user and u.email_confirmed_at is not null
 where a.id=p_id and a.revoked_at is null and sch.status='active' and p_user is distinct from a.created_by and (
  (a.audience in ('all','staff') and exists(select 1 from public.school_memberships m where m.school_id=a.school_id and m.user_id=p_user and m.active and (m.role='director' or (m.role='teacher' and exists(select 1 from public.teachers t join public.teacher_classrooms tc on tc.teacher_id=t.id and tc.school_id=t.school_id where t.user_id=p_user and t.status='active' and t.school_id=a.school_id and (a.classroom_id is null or tc.classroom_id=a.classroom_id))))))
  or (a.audience in ('all','families') and exists(select 1 from public.students s where s.school_id=a.school_id and s.status='active' and (a.classroom_id is null or s.classroom_id=a.classroom_id)
   and (not a.targeted or exists(select 1 from aulanexo_private.announcement_targets t where t.announcement_id=a.id and t.student_id=s.id)) and (
    exists(select 1 from public.student_guardians g join public.school_memberships m on m.school_id=s.school_id and m.user_id=g.user_id and m.role='guardian' and m.active where g.student_id=s.id and g.user_id=p_user and g.can_view and g.verified_at is not null and ((g.relationship='mother' and lower(u.email)=s.mother_email) or (g.relationship='father' and lower(u.email)=s.father_email)))
    or (not a.requires_acknowledgment and a.category not in ('health','pickup') and exists(select 1 from aulanexo_private.student_logins l where l.student_id=s.id and l.enabled and l.email=lower(u.email)))
  )))
 ));
$$;
create function aulanexo_private.announcement_recipient_visible(p_id uuid,p_user uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare a public.announcements;s public.students;allowed boolean:=false;previous_uid text:=current_setting('request.jwt.claim.sub',true);previous_headers text:=current_setting('request.headers',true);begin
 if not aulanexo_private.announcement_recipient(p_id,p_user) then return false;end if;
 select * into a from public.announcements where id=p_id;
 if exists(select 1 from public.school_memberships where school_id=a.school_id and user_id=p_user and active and role in ('director','teacher')) then return true;end if;
 -- A minimal communication access does not unlock academic content or the payment module.
 if (a.requires_acknowledgment or a.category in ('health','pickup')) and (select critical_when_unpaid from aulanexo_private.announcement_settings) and exists(select 1 from public.student_guardians g join public.students child on child.id=g.student_id where g.user_id=p_user and child.school_id=a.school_id and g.verified_at is not null and g.can_view and g.relationship in ('mother','father')) then return true;end if;
 perform set_config('request.jwt.claim.sub',p_user::text,true),set_config('request.headers','{}',true);
 for s in select * from public.students where school_id=a.school_id and status='active' and (a.classroom_id is null or classroom_id=a.classroom_id) and (not a.targeted or exists(select 1 from aulanexo_private.announcement_targets t where t.announcement_id=a.id and t.student_id=students.id)) loop
  if public.is_verified_guardian(s.id) and public.family_access(s.id) then allowed:=true;exit;end if;
  if aulanexo_private.student_id_for_user(p_user,a.school_id)=s.id and aulanexo_private.student_learning_access(s.id) then allowed:=true;exit;end if;
 end loop;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,''),true);return allowed;
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,''),true);return false;
end $$;
create function public.may_view_announcement(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.announcements a where a.id=p_id and a.revoked_at is null and aulanexo_private.in_support_school(a.school_id) and not public.is_platform_admin() and exists(select 1 from public.school_memberships m where m.school_id=a.school_id and m.user_id=aulanexo_private.actor_uid() and m.active and m.role in ('director','teacher','guardian')) and (
  public.has_school_role(a.school_id,array['director']) or (a.created_by=aulanexo_private.actor_uid() and public.may_edit_classroom(a.school_id,a.classroom_id)) or aulanexo_private.announcement_recipient_visible(a.id,aulanexo_private.actor_uid())
 ));
$$;
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using(public.may_view_announcement(id));
create policy announcement_receipts_own on public.announcement_receipts for select to authenticated using(user_id=auth.uid() and aulanexo_private.support_id() is null and public.may_view_announcement(announcement_id));
create policy notifications_announcement_scope on public.notifications as restrictive for select to authenticated using((kind<>'announcement' and kind not like 'announcement_reminder_%') or public.may_view_announcement(source_id));
create policy notifications_mandatory on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and (kind='announcement' or kind like 'announcement_reminder_%') and public.may_view_announcement(source_id));

create function aulanexo_private.guard_announcement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'Retira el aviso para conservar su historial de lecturas y confirmaciones.';end if;
 if TG_OP='UPDATE' then
  if auth.uid() is not null and not (public.may_edit_classroom(old.school_id,old.classroom_id) and (old.created_by=aulanexo_private.actor_uid() or public.has_school_role(old.school_id,array['director']))) then raise exception 'No tienes permiso para retirar este aviso.';end if;
  if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') then raise exception 'Un aviso publicado conserva su contenido y destinatarios. Retíralo y publica una nueva versión.';end if;
  if old.revoked_at is not null and new.revoked_at is null then raise exception 'El aviso retirado no se puede reactivar.';end if;
  return new;
 end if;
 if length(trim(new.title)) not between 1 and 200 or length(trim(new.content)) not between 1 and 10000 then raise exception 'Completa el título y el contenido del aviso.';end if;
 if new.targeted and (new.classroom_id is null or new.audience='staff') then raise exception 'Selecciona un aula y audiencia familiar para dirigir el aviso a niños concretos.';end if;
 if new.urgent and new.category not in ('health','pickup') then raise exception 'La urgencia se reserva para avisos de salud o recojo.';end if;
 if new.targeted and not exists(select 1 from aulanexo_private.announcement_targets where announcement_id=new.id) then raise exception 'Selecciona los niños destinatarios.';end if;
 new.content_hash:=encode(sha256(convert_to(jsonb_build_object('title',new.title,'content',new.content,'audience',new.audience,'category',new.category,'classroom',new.classroom_id,'required',new.requires_acknowledgment,'targets',(select coalesce(jsonb_agg(student_id order by student_id),'[]') from aulanexo_private.announcement_targets where announcement_id=new.id))::text,'UTF8')),'hex');
 return new;
end $$;
create trigger protect_announcement before insert or update or delete on public.announcements for each row execute function aulanexo_private.guard_announcement();
create function public.save_announcement(p_notice jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_notice->>'school_id')::uuid;cid uuid:=nullif(p_notice->>'classroom_id','')::uuid;aid uuid:=(p_notice->>'id')::uuid;ids uuid[];child_id uuid;existing public.announcements;
begin
 if not public.may_edit_classroom(sid,cid) then raise exception 'Solo Dirección y los docentes asignados pueden publicar en esta aula.';end if;
 if p_notice is null or octet_length(p_notice::text)>60000 or aid is null then raise exception 'Revisa el aviso.';end if;
 select * into existing from public.announcements where id=aid;
 if existing.id is not null then
  if existing.school_id=sid and existing.created_by=aulanexo_private.actor_uid() and existing.title=trim(p_notice->>'title') and existing.content=trim(p_notice->>'content') and existing.classroom_id is not distinct from cid and existing.audience=coalesce(p_notice->>'audience','families') and existing.category=coalesce(p_notice->>'category','general') and existing.requires_acknowledgment=coalesce((p_notice->>'requires_acknowledgment')::boolean,false) and existing.remind_hourly=coalesce((p_notice->>'remind_hourly')::boolean,false) and existing.urgent=coalesce((p_notice->>'urgent')::boolean,false) and (select coalesce(jsonb_agg(student_id::text order by student_id),'[]') from aulanexo_private.announcement_targets where announcement_id=aid)=(select coalesce(jsonb_agg(value order by value),'[]') from (select distinct value from jsonb_array_elements_text(coalesce(p_notice->'target_student_ids','[]'))) selected) then return aid;end if;
  raise exception 'Este aviso ya fue publicado. Crea una nueva versión.';
 end if;
 if jsonb_typeof(coalesce(p_notice->'target_student_ids','[]'))<>'array' or jsonb_array_length(coalesce(p_notice->'target_student_ids','[]'))>500 then raise exception 'Revisa los destinatarios seleccionados.';end if;
 select coalesce(array_agg(distinct value::uuid),'{}') into ids from jsonb_array_elements_text(coalesce(p_notice->'target_student_ids','[]'));
 if array_length(ids,1)>0 then
  if cid is null or not exists(select 1 from public.classrooms where id=cid and school_id=sid) then raise exception 'Selecciona el aula de los destinatarios.';end if;
  foreach child_id in array ids loop
   if not exists(select 1 from public.students where id=child_id and school_id=sid and classroom_id=cid and status='active') then raise exception 'Los niños seleccionados deben estar activos y pertenecer al aula.';end if;
   insert into aulanexo_private.announcement_targets(announcement_id,school_id,student_id) values(aid,sid,child_id);
  end loop;
 end if;
 insert into public.announcements(id,school_id,classroom_id,title,content,audience,requires_acknowledgment,remind_hourly,urgent,category,targeted,created_by)
 values(aid,sid,cid,trim(p_notice->>'title'),trim(p_notice->>'content'),coalesce(p_notice->>'audience','families'),coalesce((p_notice->>'requires_acknowledgment')::boolean,false),coalesce((p_notice->>'remind_hourly')::boolean,false),coalesce((p_notice->>'urgent')::boolean,false),coalesce(p_notice->>'category','general'),coalesce(array_length(ids,1),0)>0,aulanexo_private.actor_uid());
 return aid;
end $$;
create function public.withdraw_announcement(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.announcements;begin
 select * into a from public.announcements where id=p_id for update;
 if a.id is null or not public.may_edit_classroom(a.school_id,a.classroom_id) or not (a.created_by=aulanexo_private.actor_uid() or public.has_school_role(a.school_id,array['director'])) then raise exception 'No tienes permiso para retirar este aviso.';end if;
 update public.announcements set revoked_at=coalesce(revoked_at,now()) where id=p_id;
 update public.announcement_receipts set next_reminder_at=null where announcement_id=p_id;
end $$;

create function aulanexo_private.publish_announcement() returns trigger language plpgsql security definer set search_path='' as $$
declare who uuid;begin
 for who in with candidates as materialized (select m.user_id as id from public.school_memberships m where m.school_id=new.school_id and m.active union select u.id from aulanexo_private.student_logins l join auth.users u on lower(u.email)=l.email where l.school_id=new.school_id and l.enabled) select id from candidates where aulanexo_private.announcement_recipient(new.id,id) loop
  insert into public.announcement_receipts(announcement_id,school_id,user_id,content_hash,next_reminder_at) values(new.id,new.school_id,who,new.content_hash,case when new.remind_hourly and aulanexo_private.student_id_for_user(who,new.school_id) is null then now()+interval '1 hour' end) on conflict do nothing;
  insert into public.notifications(user_id,school_id,classroom_id,kind,source_id,title,body,target) values(who,new.school_id,new.classroom_id,'announcement',new.id,new.title,left(new.content,300),'announcements') on conflict(user_id,kind,source_id) do nothing;
 end loop;return new;
end $$;
drop trigger notifications_announcements on public.announcements;
drop trigger push_student_announcements on public.announcements;
create trigger announcement_recipients after insert on public.announcements for each row execute function aulanexo_private.publish_announcement();

create function aulanexo_private.ensure_announcement_receipt(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.announcements;begin
 if aulanexo_private.support_id() is not null then return;end if;
 if not aulanexo_private.announcement_recipient_visible(p_id,auth.uid()) then return;end if;
 select * into a from public.announcements where id=p_id;
 insert into public.announcement_receipts(announcement_id,school_id,user_id,content_hash,next_reminder_at) values(p_id,a.school_id,auth.uid(),a.content_hash,case when a.remind_hourly then now()+interval '1 hour' end) on conflict do nothing;
end $$;
create function public.announcement_view(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.announcements;r public.announcement_receipts;can_manage boolean;begin
 if not public.may_view_announcement(p_id) then raise exception 'Este aviso no está disponible para tu cuenta.';end if;
 perform aulanexo_private.ensure_announcement_receipt(p_id);
 select * into a from public.announcements where id=p_id;select * into r from public.announcement_receipts where announcement_id=p_id and user_id=auth.uid();
 can_manage:=public.may_edit_classroom(a.school_id,a.classroom_id) and (a.created_by=aulanexo_private.actor_uid() or public.has_school_role(a.school_id,array['director']));
 return jsonb_build_object('id',a.id,'schoolId',a.school_id,'classroomId',a.classroom_id,'title',a.title,'content',a.content,'audience',a.audience,'category',a.category,'requiresAcknowledgment',a.requires_acknowledgment,'remindHourly',a.remind_hourly,'urgent',a.urgent,'targeted',a.targeted,'createdAt',a.created_at,'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at,'canManage',can_manage,'canAcknowledge',aulanexo_private.support_id() is null and aulanexo_private.announcement_recipient_visible(p_id,auth.uid()));
end $$;
create function public.pending_announcements(p_school_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare aid uuid;result jsonb:='[]';begin
 if auth.uid() is null or aulanexo_private.support_id() is not null then return result;end if;
 for aid in select a.id from public.announcements a where a.school_id=p_school_id and a.revoked_at is null and (a.requires_acknowledgment or a.category in ('health','pickup') or a.remind_hourly) and not exists(select 1 from public.announcement_receipts r where r.announcement_id=a.id and r.user_id=auth.uid()) order by a.created_at,a.id loop
  perform aulanexo_private.ensure_announcement_receipt(aid);
 end loop;
 for aid in select a.id from public.announcements a join public.announcement_receipts r on r.announcement_id=a.id and r.user_id=auth.uid() where a.school_id=p_school_id and a.revoked_at is null and ((a.requires_acknowledgment and r.acknowledged_at is null) or (a.category in ('health','pickup') and r.read_at is null)) and aulanexo_private.announcement_recipient_visible(a.id,auth.uid()) order by a.requires_acknowledgment desc,a.urgent desc,a.created_at,a.id limit 20 loop
  result:=result||jsonb_build_array(public.announcement_view(aid));
 end loop;return result;
end $$;
create function public.read_announcement(p_id uuid,p_agree boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.announcements;begin
 if auth.uid() is null or aulanexo_private.support_id() is not null or not aulanexo_private.announcement_recipient_visible(p_id,auth.uid()) then raise exception 'La lectura y confirmación deben hacerse desde la cuenta destinataria.';end if;
 select * into a from public.announcements where id=p_id for share;
 if p_agree is null then raise exception 'Indica si estás de acuerdo.';end if;
 perform aulanexo_private.ensure_announcement_receipt(p_id);
 update public.announcement_receipts set read_at=coalesce(read_at,now()),acknowledged_at=case when a.requires_acknowledgment and p_agree then coalesce(acknowledged_at,now()) else acknowledged_at end,next_reminder_at=case when not a.requires_acknowledgment or p_agree then null else next_reminder_at end where announcement_id=p_id and user_id=auth.uid();
 update public.notifications set read_at=coalesce(read_at,now()) where user_id=auth.uid() and source_id=p_id and (kind='announcement' or kind like 'announcement_reminder_%');
 return public.announcement_view(p_id);
end $$;
create function public.announcement_report(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.announcements;result jsonb;begin
 select * into a from public.announcements where id=p_id;
 if a.id is null or not public.may_edit_classroom(a.school_id,a.classroom_id) or not(a.created_by=aulanexo_private.actor_uid() or public.has_school_role(a.school_id,array['director'])) then raise exception 'Solo Dirección y el autor pueden revisar las confirmaciones.';end if;
 select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),'readAt',r.read_at,'acknowledgedAt',r.acknowledged_at) order by u.email),'[]') into result from public.announcement_receipts r join auth.users u on u.id=r.user_id where r.announcement_id=p_id and aulanexo_private.announcement_recipient(p_id,r.user_id);
 return result;
end $$;

create function aulanexo_private.announcement_delivery_at(p_now timestamptz,p_urgent boolean) returns timestamptz language plpgsql stable security definer set search_path='' as $$
declare local_time timestamp:=p_now at time zone 'America/La_Paz';begin
 if p_urgent or not(select quiet_hours from aulanexo_private.announcement_settings) then return p_now;end if;
 if extract(hour from local_time)<7 then return (local_time::date+time '07:00') at time zone 'America/La_Paz';end if;
 if extract(hour from local_time)>=22 then return ((local_time::date+1)+time '07:00') at time zone 'America/La_Paz';end if;
 return p_now;
end $$;
revoke all on function aulanexo_private.announcement_delivery_at(timestamptz,boolean) from public,anon,authenticated;

create function aulanexo_private.send_announcement_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare item record;local_time timestamp:=now() at time zone 'America/La_Paz';added integer:=0;hour_key text:=to_char(now() at time zone 'UTC','YYYYMMDDHH24');begin
 for item in select r.*,a.classroom_id,a.title,a.content,a.requires_acknowledgment,a.urgent from public.announcement_receipts r join public.announcements a on a.id=r.announcement_id where a.revoked_at is null and a.remind_hourly and r.next_reminder_at<=now() and ((a.requires_acknowledgment and r.acknowledged_at is null) or (not a.requires_acknowledgment and r.read_at is null)) order by r.next_reminder_at limit 200 for update of r skip locked loop
  if not aulanexo_private.announcement_recipient_visible(item.announcement_id,item.user_id) then update public.announcement_receipts set next_reminder_at=null where announcement_id=item.announcement_id and user_id=item.user_id;continue;end if;
  if aulanexo_private.announcement_delivery_at(now(),item.urgent)>now() then
   update public.announcement_receipts set next_reminder_at=aulanexo_private.announcement_delivery_at(now(),item.urgent) where announcement_id=item.announcement_id and user_id=item.user_id;continue;
  end if;
  insert into public.notifications(user_id,school_id,classroom_id,kind,source_id,title,body,target) values(item.user_id,item.school_id,item.classroom_id,'announcement_reminder_'||hour_key,item.announcement_id,item.title,case when item.requires_acknowledgment then 'Tienes un aviso pendiente de confirmar.' else 'Tienes un aviso pendiente de leer.' end,'announcements') on conflict(user_id,kind,source_id) do nothing;
  update public.announcement_receipts set next_reminder_at=now()+interval '1 hour' where announcement_id=item.announcement_id and user_id=item.user_id;
  added:=added+1;
 end loop;return added;
end $$;
-- Reuse the existing minute worker; no timers on a parent phone and no extra cron job.
alter function public.claim_push_deliveries(integer) rename to claim_push_deliveries_before_announcements;
alter function public.claim_push_deliveries_before_announcements(integer) set schema aulanexo_private;
revoke all on function aulanexo_private.claim_push_deliveries_before_announcements(integer) from public,anon,authenticated,service_role;
create function public.claim_push_deliveries(p_limit integer default 40) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform aulanexo_private.send_announcement_reminders();return aulanexo_private.claim_push_deliveries_before_announcements(p_limit);end $$;

-- Typed presentations leave all personal content inside the authenticated app.
alter table public.notifications add column alert_type text not null default 'general';
create function aulanexo_private.classify_notification() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.alert_type:=case
 when new.kind='announcement' or new.kind like 'announcement_reminder_%' then coalesce((select case when category='general' then 'announcement' else category end from public.announcements where id=new.source_id),'announcement')
 when new.kind in ('request','request_response') and exists(select 1 from public.family_requests where id=new.source_id and type='pickup') then 'pickup'
 when new.kind='grade' then 'grades'
 when new.kind='daily_task' or new.kind like 'assignment_%' then 'tasks'
 when new.kind='message' then 'messages'
 when new.kind='payment' or new.kind like 'payment_%' then 'payments'
 when new.kind like 'birthday_%' then 'birthdays'
 when new.kind in ('calendar','daily','materials','activity') then 'academic' else 'general' end;
 return new;
end $$;
create trigger classify_notification before insert on public.notifications for each row execute function aulanexo_private.classify_notification();
alter function public.prepare_push_delivery(uuid,uuid) rename to prepare_push_delivery_before_alert_types;
alter function public.prepare_push_delivery_before_alert_types(uuid,uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.prepare_push_delivery_before_alert_types(uuid,uuid) from public,anon,authenticated,service_role;
create function public.prepare_push_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;notice public.notifications;due timestamptz;begin
 select n.* into notice from public.notifications n join aulanexo_private.push_deliveries d on d.notification_id=n.id where d.id=p_id and d.lease_id=p_lease and d.status='processing' and d.locked_until>now();
 if notice.kind='announcement' or notice.kind like 'announcement_reminder_%' then
  due:=aulanexo_private.announcement_delivery_at(now(),coalesce((select urgent from public.announcements where id=notice.source_id),false));
  if due>now() then update aulanexo_private.push_deliveries set status='pending',locked_until=null,available_at=due where id=p_id and lease_id=p_lease;return null;end if;
 end if;
 result:=aulanexo_private.prepare_push_delivery_before_alert_types(p_id,p_lease);if result is null then return null;end if;return result||jsonb_build_object('alertType',(select n.alert_type from public.notifications n join aulanexo_private.push_deliveries d on d.notification_id=n.id where d.id=p_id),'collapseId',(select case when n.kind='announcement' or n.kind like 'announcement_reminder_%' then n.source_id else n.id end from public.notifications n join aulanexo_private.push_deliveries d on d.notification_id=n.id where d.id=p_id));end $$;
alter function aulanexo_private.push_notice_visible(uuid) rename to push_notice_visible_before_announcements;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;a public.announcements;r public.announcement_receipts;begin
 select * into n from public.notifications where id=p_id;
 if n.kind<>'announcement' and n.kind not like 'announcement_reminder_%' then return aulanexo_private.push_notice_visible_before_announcements(p_id);end if;
 if n.id is null or n.read_at is not null or n.created_at<now()-interval '48 hours' or not aulanexo_private.announcement_recipient_visible(n.source_id,n.user_id) then return false;end if;
 select * into a from public.announcements where id=n.source_id;select * into r from public.announcement_receipts where announcement_id=a.id and user_id=n.user_id;
 return case when a.requires_acknowledgment then r.acknowledged_at is null else r.read_at is null end;
end $$;
-- Keep private messages and pickup requests immediate; urgent notices bypass quiet hours.
create or replace function aulanexo_private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
declare category_value text:=aulanexo_private.push_category(new.kind);local_time timestamp:=now() at time zone 'America/La_Paz';due timestamptz:=now();quiet boolean;begin
 quiet:=new.kind not in ('push_test','message','request','request_response');
 if new.kind='announcement' or new.kind like 'announcement_reminder_%' then quiet:=(select quiet_hours from aulanexo_private.announcement_settings) and not coalesce((select urgent from public.announcements where id=new.source_id),false);end if;
 if quiet and extract(hour from local_time)<7 then due:=(local_time::date+time '07:00') at time zone 'America/La_Paz';elsif quiet and extract(hour from local_time)>=22 then due:=((local_time::date+1)+time '07:00') at time zone 'America/La_Paz';end if;
 insert into aulanexo_private.push_deliveries(notification_id,device_id,generation,category,available_at) select new.id,d.id,d.generation,category_value,due from aulanexo_private.push_devices d where d.user_id=new.user_id and d.enabled and d.expires_at>now() and (new.kind='push_test' or category_value=any(d.categories)) on conflict(notification_id,device_id) do nothing;
 return new;
end $$;
-- The student portal must apply the same per-child recipient scope and exclude personal health/consent notices.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.student_portal_before_subjects()'::regprocedure);
 definition:=replace(definition,'where a.school_id=child.school_id and (a.classroom_id is null or a.classroom_id=child.classroom_id) and a.audience in (''all'',''families'')','where a.school_id=child.school_id and aulanexo_private.announcement_recipient_visible(a.id,aulanexo_private.actor_uid())');
 execute definition;
end $$;
-- Publish these changes on the existing workspace signals channel.
create trigger announcements_receipts_signal after insert or update on public.announcement_receipts for each row execute function aulanexo_private.touch_workspace();
revoke all on function public.save_announcement(jsonb),public.withdraw_announcement(uuid),public.announcement_view(uuid),public.pending_announcements(uuid),public.read_announcement(uuid,boolean),public.announcement_report(uuid),public.may_view_announcement(uuid) from public,anon;
grant execute on function public.save_announcement(jsonb),public.withdraw_announcement(uuid),public.announcement_view(uuid),public.pending_announcements(uuid),public.read_announcement(uuid,boolean),public.announcement_report(uuid),public.may_view_announcement(uuid) to authenticated;
revoke all on function public.claim_push_deliveries(integer),public.prepare_push_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_push_deliveries(integer),public.prepare_push_delivery(uuid,uuid) to service_role;
revoke all on function aulanexo_private.announcement_recipient(uuid,uuid),aulanexo_private.announcement_recipient_visible(uuid,uuid),aulanexo_private.guard_announcement(),aulanexo_private.publish_announcement(),aulanexo_private.ensure_announcement_receipt(uuid),aulanexo_private.send_announcement_reminders(),aulanexo_private.classify_notification(),aulanexo_private.push_notice_visible(uuid) from public,anon,authenticated;

-- Opening a previously read notice still permits a recipient to review it; opening never consents.
alter function public.resolve_push_notification(uuid) rename to resolve_push_notification_before_announcements;
alter function public.resolve_push_notification_before_announcements(uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.resolve_push_notification_before_announcements(uuid) from public,anon,authenticated,service_role;
create function public.resolve_push_notification(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare n public.notifications;begin
 if auth.uid() is null or aulanexo_private.support_id() is not null then raise exception 'Vuelve a tu cuenta para abrir el aviso.';end if;
 select * into n from public.notifications where id=p_id and user_id=auth.uid();
 if n.kind='announcement' or n.kind like 'announcement_reminder_%' then
  if aulanexo_private.student_id_for_user(auth.uid(),n.school_id) is not null and aulanexo_private.announcement_recipient_visible(n.source_id,auth.uid()) then
   update public.notifications set read_at=coalesce(read_at,now()) where id=n.id;
   return jsonb_build_object('schoolId',n.school_id,'studentId',aulanexo_private.student_id_for_user(auth.uid(),n.school_id),'target','announcements');
  end if;
  if not public.may_view_announcement(n.source_id) then raise exception 'El aviso ya no está disponible para tu acceso actual.';end if;
  return jsonb_build_object('schoolId',n.school_id,'studentId',n.student_id,'target','announcements','announcementId',n.source_id);
 end if;
 return aulanexo_private.resolve_push_notification_before_announcements(p_id);
end $$;
revoke all on function public.resolve_push_notification(uuid) from public,anon;
grant execute on function public.resolve_push_notification(uuid) to authenticated;

create index announcement_receipts_user_school on public.announcement_receipts(user_id,school_id);
create index announcements_pending_scope on public.announcements(school_id,created_at) where revoked_at is null and (requires_acknowledgment or category in ('health','pickup') or remind_hourly);
