-- The "this phone" test uses the current Auth session, rather than all devices of the account.
create or replace function public.test_push_notification() returns uuid language plpgsql security definer set search_path='' as $$
declare notice uuid:=gen_random_uuid(); target_device uuid;
 session_value uuid:=nullif(coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'session_id','')::uuid;
begin
 if auth.uid() is null or session_value is null then raise exception 'Vuelve a iniciar sesión para probar este teléfono.';end if;
 select id into target_device from aulanexo_private.push_devices where user_id=auth.uid() and session_id=session_value and enabled and expires_at>now() order by updated_at desc,id limit 1;
 if target_device is null or not aulanexo_private.push_session_active(session_value) then raise exception 'Activa primero las notificaciones de este teléfono.';end if;
 if exists(select 1 from public.notifications where user_id=auth.uid() and kind='push_test' and created_at>now()-interval '1 minute') then raise exception 'Espera un minuto para otra prueba.';end if;
 insert into public.notifications(id,user_id,kind,source_id,title,body,target) values(notice,auth.uid(),'push_test',notice,'MiCole está conectado','Las notificaciones de este teléfono están activas.','notifications');
 delete from aulanexo_private.push_deliveries where notification_id=notice and device_id<>target_device;
 return notice;
end $$;
-- Avoid name ambiguity between the local variable and the table column.
