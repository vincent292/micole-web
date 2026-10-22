-- Bound singleton signals so PostgREST safeupdate accepts notification and demo updates.
-- Keep safeupdate enabled and keep the private trigger functions inaccessible to clients.
create or replace function aulanexo_private.signal_notification_test() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='push_test' and new.target='notificationTests'
    and exists(select 1 from aulanexo_private.notification_test_runs where id=new.id) then
  update public.platform_signals
  set revision=revision+1,changed_table='notifications',changed_at=now()
  where singleton=true;
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.signal_notification_test() from public,anon,authenticated,service_role;

create or replace function aulanexo_private.signal_demo_request() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.platform_signals
 set revision=revision+1,changed_table='demo_requests',changed_at=now()
 where singleton=true;
 if TG_OP='UPDATE' then return new;end if;
 insert into public.notifications(user_id,kind,source_id,title,body,target)
 select p.user_id,'school_request',new.id,'Nueva solicitud de demo',
 'Una institución solicitó conocer MiCole.','demoRequests' from public.platform_admins p;
 return new;
end $$;
revoke all on function aulanexo_private.signal_demo_request() from public,anon,authenticated,service_role;
