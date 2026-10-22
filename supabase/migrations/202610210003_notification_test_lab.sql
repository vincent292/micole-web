-- The laboratory uses synthetic push_test notices addressed only to the actual owner account.
-- No school, pupil, announcement, grade, payment or family request is created.
create table aulanexo_private.notification_test_runs(
 id uuid primary key references public.notifications(id) on delete cascade,
 user_id uuid not null references auth.users(id),template text not null,channel text not null check(channel in ('web','both')),
 device_id uuid,created_at timestamptz not null default now(),acknowledged_at timestamptz
);
alter table aulanexo_private.notification_test_runs enable row level security;
revoke all on aulanexo_private.notification_test_runs from public,anon,authenticated,service_role;
create index notification_test_owner_date on aulanexo_private.notification_test_runs(user_id,created_at desc);
create function aulanexo_private.require_notification_test_admin() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_platform_admin() or not exists(select 1 from auth.users u join aulanexo_private.platform_admin_allowlist a on a.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null) or coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb ? 'x-micole-support' then raise exception 'Las pruebas corresponden al superadmin desde su cuenta de plataforma. Sal del soporte para continuar.';end if;
end $$;
revoke all on function aulanexo_private.require_notification_test_admin() from public,anon,authenticated,service_role;
create function aulanexo_private.notification_test_catalog() returns jsonb language sql immutable set search_path='' as $$select '[{"key":"general","label":"Aviso general","group":"Plataforma","kind":"push_test","alertType":"general","category":"alerts","body":"Aviso ficticio para verificar la campanita y la conexión del teléfono."},{"key":"school_request","label":"Solicitud de institución","group":"Plataforma","kind":"school_request","alertType":"general","category":"alerts","body":"Una institución ficticia solicita acceso. No se registró ninguna solicitud comercial."},{"key":"access","label":"Habilitación de acceso","group":"Plataforma","kind":"access","alertType":"general","category":"alerts","body":"Ejemplo de habilitación. No cambia permisos ni el estado de ningún alumno."},{"key":"intake","label":"Ficha familiar recibida","group":"Comunidad","kind":"intake","alertType":"general","category":"alerts","body":"Una ficha ficticia está lista para revisar. No contiene datos familiares reales."},{"key":"announcement","label":"Comunicado informativo","group":"Comunidad","kind":"announcement","alertType":"announcement","category":"alerts","body":"Este comunicado ficticio permite comprobar el icono y la apertura del aviso."},{"key":"mandatory","label":"Comunicado obligatorio","group":"Comunidad","kind":"announcement","alertType":"announcement","category":"alerts","body":"Ejemplo de un aviso que pide «Estoy de acuerdo». La confirmación solo pertenece a esta prueba.","requiresAcknowledgment":true},{"key":"reminder","label":"Recordatorio de comunicado","group":"Comunidad","kind":"announcement_reminder_test","alertType":"announcement","category":"alerts","body":"Ejemplo de recordatorio pendiente. Se envía una sola vez; no activa recordatorios horarios."},{"key":"health","label":"Salud y emergencia","group":"Cuidados","kind":"announcement","alertType":"health","category":"alerts","body":"Aviso ficticio de salud para comprobar la cruz, el sonido y el canal. No ocurrió una emergencia."},{"key":"pickup","label":"Autorización de recojo","group":"Cuidados","kind":"request","alertType":"pickup","category":"alerts","body":"Ejemplo de autorización de recojo. No autoriza a entregar a ningún niño."},{"key":"permission","label":"Solicitud de permiso","group":"Cuidados","kind":"request","alertType":"general","category":"alerts","body":"Una familia ficticia solicita permiso. No crea una solicitud real."},{"key":"permission_response","label":"Respuesta a un permiso","group":"Cuidados","kind":"request_response","alertType":"general","category":"alerts","body":"Respuesta ficticia para comprobar la alerta recibida por una familia."},{"key":"attendance_absent","label":"Falta de un alumno","group":"Cuidados","kind":"attendance_absent","alertType":"attendance","category":"alerts","body":"Ejemplo de falta registrada. No se modificó la asistencia de ningún alumno."},{"key":"attendance_corrected","label":"Corrección de asistencia","group":"Cuidados","kind":"attendance_corrected","alertType":"attendance","category":"alerts","body":"Ejemplo de corrección con aviso a la familia. No modifica ninguna lista real."},{"key":"message","label":"Mensaje interno","group":"Comunidad","kind":"message","alertType":"messages","category":"messages","body":"Mensaje ficticio para comprobar el icono y la alerta de conversación."},{"key":"daily","label":"Cuaderno digital","group":"Académico","kind":"daily","alertType":"academic","category":"academic","body":"Ejemplo de novedad del cuaderno. No se publicó una entrada real."},{"key":"daily_task","label":"Tarea diaria","group":"Académico","kind":"daily_task","alertType":"tasks","category":"academic","body":"Ejemplo de tarea diaria para comprobar su aviso."},{"key":"assignment","label":"Nueva tarea por materia","group":"Académico","kind":"assignment_published","alertType":"tasks","category":"academic","body":"Una tarea ficticia está disponible. No se creó una tarea en ningún aula."},{"key":"submission","label":"Entrega de tarea recibida","group":"Académico","kind":"assignment_submitted_test","alertType":"tasks","category":"academic","body":"Ejemplo de aviso al docente de una entrega nueva."},{"key":"review","label":"Tarea revisada","group":"Académico","kind":"assignment_reviewed_test","alertType":"tasks","category":"academic","body":"Ejemplo de aviso a la familia o estudiante de una revisión."},{"key":"grade","label":"Nota o recomendación","group":"Académico","kind":"grade","alertType":"grades","category":"academic","body":"Ejemplo de nota o recomendación. No se registró ninguna calificación."},{"key":"calendar","label":"Evento del calendario","group":"Académico","kind":"calendar","alertType":"academic","category":"academic","body":"Ejemplo de una actividad próxima en el calendario."},{"key":"materials","label":"Lista de materiales","group":"Académico","kind":"materials","alertType":"academic","category":"academic","body":"Ejemplo de materiales aprobados. No publica listas ni genera cobros."},{"key":"activity","label":"Actividad o salida","group":"Académico","kind":"activity","alertType":"academic","category":"academic","body":"Ejemplo de actividad escolar. No inscribe participantes ni genera cuotas."},{"key":"birthday_today","label":"Cumpleaños de hoy","group":"Cumpleaños","kind":"birthday_test_0","alertType":"birthdays","category":"birthdays","body":"Ejemplo de cumpleaños de hoy. Todos los datos de esta prueba son ficticios."},{"key":"birthday_upcoming","label":"Cumpleaños próximo","group":"Cumpleaños","kind":"birthday_test_2","alertType":"birthdays","category":"birthdays","body":"Ejemplo de recordatorio previo de cumpleaños."},{"key":"payment_due","label":"Cuota pendiente","group":"Pagos","kind":"payment_due_test","alertType":"payments","category":"payments","body":"Ejemplo de cuota por pagar. No crea deuda ni bloquea el acceso de nadie."},{"key":"payment_receipt","label":"Cobro confirmado y recibo","group":"Pagos","kind":"payment_receipt","alertType":"payments","category":"payments","body":"Ejemplo de recibo disponible. No se realizó ni registró un pago."},{"key":"payment_evidence","label":"Comprobante por verificar","group":"Pagos","kind":"payment_evidence","alertType":"payments","category":"payments","body":"Ejemplo de comprobante pendiente de revisión. No contiene archivos reales."},{"key":"payment_reviewed","label":"Comprobante revisado","group":"Pagos","kind":"payment_evidence_reviewed","alertType":"payments","category":"payments","body":"Ejemplo de resultado de revisión. No acredita dinero ni modifica saldos."},{"key":"invoice","label":"Factura disponible","group":"Pagos","kind":"payment_invoice_ready","alertType":"payments","category":"payments","body":"Ejemplo de factura disponible. No genera una factura fiscal."}]'::jsonb$$;
revoke all on function aulanexo_private.notification_test_catalog() from public,anon,authenticated,service_role;
create function public.notification_test_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform aulanexo_private.require_notification_test_admin();
 return jsonb_build_object('devices',coalesce((select jsonb_agg(jsonb_build_object('id',id,'label','Mi teléfono · '||right(id::text,6),'updatedAt',updated_at,'expiresAt',expires_at) order by updated_at desc) from aulanexo_private.push_devices where user_id=auth.uid() and enabled and expires_at>now() and aulanexo_private.push_session_active(session_id)),'[]'::jsonb),
 'runs',coalesce((select jsonb_agg(to_jsonb(r) order by r."createdAt" desc) from (select t.id,t.template,n.title,n.body,n.alert_type as "alertType",t.channel,t.created_at as "createdAt",n.read_at as "readAt",t.acknowledged_at as "acknowledgedAt",coalesce((c.value->>'requiresAcknowledgment')::boolean,false) as "requiresAcknowledgment",
 coalesce((select d.status from aulanexo_private.push_deliveries d where d.notification_id=t.id order by d.created_at desc limit 1),case when t.channel='web' then 'web' else 'discarded' end) as status,
 (select d.last_error from aulanexo_private.push_deliveries d where d.notification_id=t.id order by d.created_at desc limit 1) as error
 from aulanexo_private.notification_test_runs t join public.notifications n on n.id=t.id cross join lateral jsonb_array_elements(aulanexo_private.notification_test_catalog()) c(value)
 where t.user_id=auth.uid() and c.value->>'key'=t.template order by t.created_at desc,t.id desc limit 50) r),'[]'::jsonb));
end $$;
create function public.create_notification_test(p_template text,p_channel text,p_device_id uuid,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item jsonb;existing aulanexo_private.notification_test_runs;device aulanexo_private.push_devices;begin
 perform aulanexo_private.require_notification_test_admin();
 if p_request_id is null or p_channel is null or p_channel not in ('web','both') or p_channel='web' and p_device_id is not null then raise exception 'Selecciona una prueba y su canal.';end if;
 select value into item from jsonb_array_elements(aulanexo_private.notification_test_catalog()) where value->>'key'=p_template;
 if item is null then raise exception 'Esta prueba no está disponible.';end if;
 perform pg_advisory_xact_lock(hashtext('notification-test-'||auth.uid()::text));
 select * into existing from aulanexo_private.notification_test_runs where id=p_request_id;
 if found then
  if existing.user_id is distinct from auth.uid() or existing.template is distinct from p_template or existing.channel is distinct from p_channel or existing.device_id is distinct from p_device_id then raise exception 'El identificador ya corresponde a otra prueba.';end if;
  return existing.id;
 end if;
 if exists(select 1 from aulanexo_private.notification_test_runs where user_id=auth.uid() and created_at>now()-interval '2 seconds') then raise exception 'Espera dos segundos antes de enviar otra prueba.';end if;
 if (select count(*) from aulanexo_private.notification_test_runs where user_id=auth.uid() and created_at>now()-interval '1 hour')>=60 then raise exception 'Se alcanzó el límite de 60 pruebas por hora.';end if;
 if p_channel='both' then
  select * into device from aulanexo_private.push_devices where id=p_device_id and user_id=auth.uid() and enabled and expires_at>now() and aulanexo_private.push_session_active(session_id) for share;
  if device.id is null then raise exception 'Selecciona un teléfono activo de tu propia cuenta. Abre MiCole en Android y activa sus notificaciones.';end if;
 end if;
 insert into public.notifications(id,user_id,kind,source_id,title,body,target)
 values(p_request_id,auth.uid(),'push_test',p_request_id,'[PRUEBA] '||(item->>'label'),'AVISO FICTICIO. '||(item->>'body'),'notificationTests');
 insert into aulanexo_private.notification_test_runs(id,user_id,template,channel,device_id) values(p_request_id,auth.uid(),p_template,p_channel,p_device_id);
 update public.notifications set alert_type=item->>'alertType' where id=p_request_id;
 if p_channel='web' then delete from aulanexo_private.push_deliveries where notification_id=p_request_id;
 else
  delete from aulanexo_private.push_deliveries where notification_id=p_request_id and device_id<>p_device_id;
  update aulanexo_private.push_deliveries set category=item->>'category' where notification_id=p_request_id and device_id=p_device_id;
 end if;
 return p_request_id;
end $$;
create function public.acknowledge_notification_test(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.require_notification_test_admin();
 if not exists(select 1 from aulanexo_private.notification_test_runs t cross join lateral jsonb_array_elements(aulanexo_private.notification_test_catalog()) c(value) where t.id=p_id and t.user_id=auth.uid() and c.value->>'key'=t.template and (c.value->>'requiresAcknowledgment')::boolean is true) then raise exception 'La prueba no requiere confirmación o no pertenece a tu cuenta.';end if;
 update aulanexo_private.notification_test_runs set acknowledged_at=coalesce(acknowledged_at,now()) where id=p_id and user_id=auth.uid();
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid();
end $$;
-- Reading the web bell must not cancel the Android test explicitly requested by the owner.
alter function aulanexo_private.push_notice_visible(uuid) rename to push_notice_visible_before_test_lab;
revoke all on function aulanexo_private.push_notice_visible_before_test_lab(uuid) from public,anon,authenticated,service_role;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from aulanexo_private.notification_test_runs where id=p_id) then
  return exists(select 1 from aulanexo_private.notification_test_runs t join public.notifications n on n.id=t.id join auth.users u on u.id=t.user_id join public.platform_admins a on a.user_id=u.id join aulanexo_private.platform_admin_allowlist l on lower(l.email)=lower(u.email) where t.id=p_id and n.user_id=t.user_id and n.kind='push_test' and n.created_at>now()-interval '48 hours' and u.email_confirmed_at is not null);
 end if;
 return aulanexo_private.push_notice_visible_before_test_lab(p_id);
end $$;
revoke all on function aulanexo_private.push_notice_visible(uuid) from public,anon,authenticated,service_role;
alter function public.prepare_push_delivery(uuid,uuid) rename to prepare_push_delivery_before_test_lab;
alter function public.prepare_push_delivery_before_test_lab(uuid,uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.prepare_push_delivery_before_test_lab(uuid,uuid) from public,anon,authenticated,service_role;
create function public.prepare_push_delivery(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;item jsonb;begin
 result:=aulanexo_private.prepare_push_delivery_before_test_lab(p_id,p_lease);
 if result is null then return null;end if;
 select c.value into item from aulanexo_private.push_deliveries d join aulanexo_private.notification_test_runs t on t.id=d.notification_id cross join lateral jsonb_array_elements(aulanexo_private.notification_test_catalog()) c(value) where d.id=p_id and c.value->>'key'=t.template;
 if item is not null then result:=result||jsonb_build_object('isTest',true,'testKind',item->>'kind','testLabel',item->>'label');end if;
 return result;
end $$;
revoke all on function public.notification_test_workspace(),public.create_notification_test(text,text,uuid,uuid),public.acknowledge_notification_test(uuid) from public,anon;
grant execute on function public.notification_test_workspace(),public.create_notification_test(text,text,uuid,uuid),public.acknowledge_notification_test(uuid) to authenticated;
revoke all on function public.prepare_push_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_push_delivery(uuid,uuid) to service_role;
-- Cross-device bell updates carry only a revision, never the test text or device tokens.
create function aulanexo_private.signal_notification_test() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='push_test' and new.target='notificationTests' and exists(select 1 from aulanexo_private.notification_test_runs where id=new.id) then
  update public.platform_signals set revision=revision+1,changed_table='notifications',changed_at=now();
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.signal_notification_test() from public,anon,authenticated,service_role;
create trigger notification_test_changed after update on public.notifications for each row execute function aulanexo_private.signal_notification_test();
