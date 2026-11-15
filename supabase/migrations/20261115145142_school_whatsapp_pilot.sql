-- WhatsApp is an explicit pilot, not an entitlement granted by a school name.
create table aulanexo_private.whatsapp_pilot_schools(school_id uuid primary key references public.schools(id), enabled boolean not null default true);
insert into aulanexo_private.whatsapp_pilot_schools(school_id)
 select id from public.schools where id in ('c4490c09-05f6-4b35-a982-cfb82d34db8b','155b12b6-3b74-4b74-9bea-19ed60cde21c','6f7e1952-cdd1-43fe-a1db-fb3cfe3eedc9');
create table aulanexo_private.whatsapp_settings(
 school_id uuid primary key references public.schools(id), revision integer not null default 0, mode text not null default 'manual' check(mode in ('manual','automatic')),
 hours text not null default '' check(length(hours)<=2000), admissions text not null default '' check(length(admissions)<=4000),
 greeting text not null default 'Hola, gracias por comunicarte con {institucion} · {sede}. ¿Qué información necesitas?' check(length(btrim(greeting)) between 1 and 4000),
 fallback text not null default 'Voy a pasar tu consulta al equipo de {institucion} para que pueda ayudarte.' check(length(btrim(fallback)) between 1 and 4000),
 quick_replies jsonb not null default '[]' check(jsonb_typeof(quick_replies)='array' and jsonb_array_length(quick_replies)<=40),
 updated_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create table aulanexo_private.whatsapp_connections(
 school_id uuid primary key references public.schools(id), phone_number_id text not null unique check(phone_number_id ~ '^[0-9]{3,40}$'),
 waba_id text not null check(waba_id ~ '^[0-9]{3,40}$'), display_phone text not null, verified_name text not null default '',
 status text not null check(status in ('pending','connected','disconnected','needs_reconnect')),
 token_ciphertext text, token_expires_at timestamptz, connected_by uuid references auth.users(id),updated_at timestamptz not null default now()
);
create index whatsapp_connections_actor_idx on aulanexo_private.whatsapp_connections(connected_by);
create table aulanexo_private.whatsapp_onboarding(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),user_id uuid not null references auth.users(id),
 expires_at timestamptz not null default now()+interval '15 minutes',consumed_at timestamptz
);
create index whatsapp_onboarding_school_idx on aulanexo_private.whatsapp_onboarding(school_id,user_id);
create index whatsapp_onboarding_user_idx on aulanexo_private.whatsapp_onboarding(user_id);
create table aulanexo_private.whatsapp_conversations(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id), contact_key text not null check(length(contact_key) between 3 and 128),
 contact_name text not null default '' check(length(contact_name)<=160),human boolean not null default false,
 stage text not null default 'new' check(stage in ('new','interested','visit','enrolled','closed')),
 notes text not null default '' check(length(notes)<=4000),unread integer not null default 0 check(unread>=0),
 last_customer_at timestamptz,last_message_at timestamptz not null default now(),unique(school_id,contact_key),unique(id,school_id)
);
create index whatsapp_conversations_recent_idx on aulanexo_private.whatsapp_conversations(school_id,last_message_at desc);
create table aulanexo_private.whatsapp_messages(
 id uuid primary key default gen_random_uuid(),school_id uuid not null,conversation_id uuid not null,
 foreign key(conversation_id,school_id) references aulanexo_private.whatsapp_conversations(id,school_id),
 direction text not null check(direction in ('in','out')),source text not null check(source in ('customer','app','bot','staff')),
 body text not null check(length(body) between 1 and 4000),provider_id text unique check(length(provider_id)<=512),
 status text not null check(status in ('received','pending','sending','sent','delivered','read','failed','unknown','cancelled')),
 in_reply_to uuid unique references aulanexo_private.whatsapp_messages(id), actor_id uuid references auth.users(id),
 handoff boolean not null default false,created_at timestamptz not null default now(),claimed_at timestamptz,error_code text
);
create index whatsapp_messages_thread_idx on aulanexo_private.whatsapp_messages(conversation_id,created_at desc);
create index whatsapp_messages_school_idx on aulanexo_private.whatsapp_messages(school_id,created_at desc);
create index whatsapp_messages_actor_idx on aulanexo_private.whatsapp_messages(actor_id);
create index whatsapp_messages_pending_idx on aulanexo_private.whatsapp_messages(created_at) where status='pending';
create unique index whatsapp_one_send_per_thread on aulanexo_private.whatsapp_messages(conversation_id) where status='sending';
create table aulanexo_private.whatsapp_delivery_events(
 school_id uuid not null references public.schools(id),provider_id text not null check(length(provider_id)<=512),
 status text not null check(status in ('sent','delivered','read','failed')),updated_at timestamptz not null default now(),primary key(school_id,provider_id)
);
create index whatsapp_delivery_cleanup_idx on aulanexo_private.whatsapp_delivery_events(updated_at);
create function aulanexo_private.whatsapp_status_rank(p_status text) returns integer language sql immutable set search_path='' as $$
 select case p_status when 'read' then 5 when 'delivered' then 4 when 'failed' then 3 when 'sent' then 2 else 0 end;
$$;
revoke all on function aulanexo_private.whatsapp_status_rank(text) from public,anon,authenticated,service_role;
-- No direct Data API access, even to credentials; all access uses scoped RPCs.
do $$declare t text;begin
 foreach t in array array['whatsapp_pilot_schools','whatsapp_settings','whatsapp_connections','whatsapp_onboarding','whatsapp_conversations','whatsapp_messages','whatsapp_delivery_events'] loop
  execute format('alter table aulanexo_private.%I enable row level security',t);
  execute format('revoke all on aulanexo_private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
create function aulanexo_private.whatsapp_enabled(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.schools s join aulanexo_private.whatsapp_pilot_schools p on p.school_id=s.id and p.enabled where s.id=p_school and s.status='active');
$$;
create function aulanexo_private.whatsapp_manager(p_school uuid,p_connection boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and aulanexo_private.support_id() is null and aulanexo_private.whatsapp_enabled(p_school)
 and (public.is_platform_admin() or public.school_director(p_school) or (not p_connection and public.school_secretary(p_school)));
$$;
revoke all on function aulanexo_private.whatsapp_enabled(uuid),aulanexo_private.whatsapp_manager(uuid,boolean) from public,anon,authenticated,service_role;
create function public.whatsapp_access(p_school uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',aulanexo_private.whatsapp_manager(p_school),'canConnect',aulanexo_private.whatsapp_manager(p_school,true));
$$;
create function public.whatsapp_workspace(p_school uuid,p_conversation uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 if not aulanexo_private.whatsapp_manager(p_school) then raise exception 'WhatsApp no está habilitado para este acceso.';end if;
 insert into aulanexo_private.whatsapp_settings(school_id) values(p_school) on conflict do nothing;
 select jsonb_build_object('settings',to_jsonb(s)-'school_id'-'updated_by','canConnect',aulanexo_private.whatsapp_manager(p_school,true),
  'connection',(select to_jsonb(c)-'token_ciphertext'-'connected_by' from aulanexo_private.whatsapp_connections c where c.school_id=p_school),
  'conversations',coalesce((select jsonb_agg(to_jsonb(c) order by c.last_message_at desc) from(select * from aulanexo_private.whatsapp_conversations where school_id=p_school order by last_message_at desc limit 100)c),'[]'),
  'messages',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at,m.id) from(select id,conversation_id,direction,source,body,status,created_at,error_code from aulanexo_private.whatsapp_messages where school_id=p_school and conversation_id=p_conversation order by created_at desc,id desc limit 100)m),'[]')) into result
 from aulanexo_private.whatsapp_settings s where s.school_id=p_school;
 return result;
end $$;
create function public.whatsapp_manage(p_school uuid,p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.whatsapp_conversations; message aulanexo_private.whatsapp_messages; v_id uuid; item jsonb;v_revision integer;begin
 if not aulanexo_private.whatsapp_manager(p_school,p_action in ('prepare','consume','disconnect','settings')) then raise exception 'No tienes permiso para esta acción de WhatsApp.';end if;
 if p_action='prepare' then
  delete from aulanexo_private.whatsapp_onboarding where school_id=p_school and (user_id=auth.uid() or expires_at<now());
  insert into aulanexo_private.whatsapp_onboarding(school_id,user_id) values(p_school,auth.uid()) returning id into v_id;
  return jsonb_build_object('sessionId',v_id);
 elsif p_action='consume' then
  update aulanexo_private.whatsapp_onboarding set consumed_at=now() where id=(p_data->>'sessionId')::uuid and school_id=p_school and user_id=auth.uid() and consumed_at is null and expires_at>now() returning id into v_id;
  if v_id is null then raise exception 'La sesión de enlace venció. Vuelve a conectar.';end if;
 elsif p_action='disconnect' then
  update aulanexo_private.whatsapp_connections set status='disconnected',token_ciphertext=null,updated_at=now() where school_id=p_school;
  update aulanexo_private.whatsapp_settings set mode='manual',updated_by=auth.uid(),updated_at=now() where school_id=p_school;
  update aulanexo_private.whatsapp_messages set status='cancelled' where school_id=p_school and status='pending';
 elsif p_action='settings' then
  select revision into v_revision from aulanexo_private.whatsapp_settings where school_id=p_school for update;
  if (p_data->>'revision')::integer is distinct from coalesce(v_revision,0) then raise exception 'La configuración cambió. Actualiza la pantalla y revisa tus cambios antes de guardar.';end if;
  if p_data->>'mode' not in ('manual','automatic') or p_data->>'mode' is null or jsonb_typeof(p_data->'quick_replies') is distinct from 'array' then raise exception 'Revisa el modo y las respuestas.';end if;
  if jsonb_array_length(p_data->'quick_replies')>40 then raise exception 'Máximo 40 respuestas.';end if;
  for item in select value from jsonb_array_elements(p_data->'quick_replies') loop
   if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'title') is distinct from 'string' or jsonb_typeof(item->'body') is distinct from 'string' or (item ? 'enabled' and jsonb_typeof(item->'enabled') is distinct from 'boolean') or length(btrim(coalesce(item->>'title',''))) not between 1 and 100 or length(btrim(coalesce(item->>'body',''))) not between 1 and 4000
    or jsonb_typeof(item->'keywords') is distinct from 'array' or jsonb_array_length(item->'keywords') not between 1 and 12
    or exists(select 1 from jsonb_array_elements(item->'keywords') k where jsonb_typeof(k) is distinct from 'string' or length(k#>>'{}') not between 2 and 80) then raise exception 'Cada respuesta necesita título, contenido y entre 1 y 12 palabras clave.';end if;
  end loop;
  insert into aulanexo_private.whatsapp_settings(school_id,mode,hours,admissions,greeting,fallback,quick_replies,updated_by)
  values(p_school,p_data->>'mode',coalesce(p_data->>'hours',''),coalesce(p_data->>'admissions',''),p_data->>'greeting',p_data->>'fallback',p_data->'quick_replies',auth.uid())
  on conflict(school_id) do update set mode=excluded.mode,hours=excluded.hours,admissions=excluded.admissions,greeting=excluded.greeting,fallback=excluded.fallback,quick_replies=excluded.quick_replies,revision=aulanexo_private.whatsapp_settings.revision+1,updated_by=auth.uid(),updated_at=now();
  if p_data->>'mode'='manual' then update aulanexo_private.whatsapp_messages set status='cancelled' where school_id=p_school and source='bot' and status='pending';end if;
  return jsonb_build_object('ok',true,'revision',(select revision from aulanexo_private.whatsapp_settings where school_id=p_school));
 elsif p_action in ('conversation','send') then
  select * into c from aulanexo_private.whatsapp_conversations where id=(p_data->>'conversationId')::uuid and school_id=p_school for update;
  if c.id is null then raise exception 'Conversación no disponible.';end if;
  if p_action='conversation' then
   if exists(select 1 from aulanexo_private.whatsapp_messages where conversation_id=c.id and status='sending') then raise exception 'Hay un envío en curso. Espera un momento y vuelve a intentar.';end if;
   if p_data ? 'stage' and p_data->>'stage' not in ('new','interested','visit','enrolled','closed') then raise exception 'Etapa no válida.';end if;
   update aulanexo_private.whatsapp_conversations set human=coalesce((p_data->>'human')::boolean,human),stage=coalesce(p_data->>'stage',stage),notes=coalesce(p_data->>'notes',notes),unread=case when p_data->>'read'='true' then 0 else unread end where id=c.id;
   if p_data->>'human'='true' then update aulanexo_private.whatsapp_messages set status='cancelled' where conversation_id=c.id and source='bot' and status='pending';end if;
  else
   if c.last_customer_at is null or c.last_customer_at<=now()-interval '24 hours' then raise exception 'La ventana de 24 horas terminó. Espera un mensaje nuevo del contacto.';end if;
   if not exists(select 1 from aulanexo_private.whatsapp_connections where school_id=p_school and status='connected') then raise exception 'Conecta WhatsApp antes de responder.';end if;
   v_id:=(p_data->>'requestId')::uuid;
   select * into message from aulanexo_private.whatsapp_messages where id=v_id;
   if message.id is not null and (message.school_id<>p_school or message.conversation_id<>c.id or message.actor_id is distinct from auth.uid() or message.body is distinct from btrim(p_data->>'body')) then raise exception 'El identificador de envío ya se utilizó.';end if;
   update aulanexo_private.whatsapp_conversations set human=true,unread=0 where id=c.id;
   update aulanexo_private.whatsapp_messages set status='cancelled' where conversation_id=c.id and source='bot' and status='pending';
   insert into aulanexo_private.whatsapp_messages(id,school_id,conversation_id,direction,source,body,status,actor_id) values(v_id,p_school,c.id,'out','staff',btrim(p_data->>'body'),'pending',auth.uid()) on conflict(id) do nothing;
   return jsonb_build_object('messageId',v_id,'queued',true);
  end if;
 else raise exception 'Acción no válida.';end if;
 return jsonb_build_object('ok',true);
end $$;
-- Service-role-only gateway: never grant this RPC to browser roles.
create function public.whatsapp_service(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_data->>'schoolId')::uuid;c aulanexo_private.whatsapp_connections;t aulanexo_private.whatsapp_conversations;
 m aulanexo_private.whatsapp_messages;s aulanexo_private.whatsapp_settings;v_id uuid;event_time timestamptz;new_row boolean;event jsonb;batch jsonb:='[]'::jsonb;begin
 if p_action in ('ingest_batch','queue_batch') then
  if jsonb_typeof(p_data->'events') is distinct from 'array' or jsonb_array_length(p_data->'events')>200 then raise exception 'Lote no válido.';end if;
  for event in select value from jsonb_array_elements(p_data->'events') loop
   if p_action='ingest_batch' then
    batch:=batch||jsonb_build_array(jsonb_build_object('context',public.whatsapp_service(case when event->>'kind'='status' then 'status' else 'ingest' end,event),'text',event->>'body','echo',event->'echo','kind',event->>'kind'));
   else batch:=batch||jsonb_build_array(public.whatsapp_service('queue_auto',event));end if;
  end loop;return batch;
 end if;
 if p_action='pending' then
  delete from aulanexo_private.whatsapp_delivery_events where updated_at<now()-interval '30 days';
  update aulanexo_private.whatsapp_messages set status='unknown',error_code='delivery_unconfirmed' where status='sending' and claimed_at<now()-interval '5 minutes';
  return coalesce((select jsonb_agg(id) from(select id from aulanexo_private.whatsapp_messages where status='pending' order by created_at limit 10)x),'[]');
 elsif p_action='claim' then
  select * into m from aulanexo_private.whatsapp_messages where id=(p_data->>'messageId')::uuid for update;
  if m.id is null or m.status<>'pending' then return null;end if;
  select * into t from aulanexo_private.whatsapp_conversations where id=m.conversation_id for update;
  select * into c from aulanexo_private.whatsapp_connections where school_id=m.school_id;
  select * into s from aulanexo_private.whatsapp_settings where school_id=m.school_id;
  if not aulanexo_private.whatsapp_enabled(m.school_id) or c.status is distinct from 'connected' or c.token_ciphertext is null
   or t.last_customer_at is null or t.last_customer_at<=now()-interval '24 hours'
   or m.source='bot' and ((t.human and not m.handoff) or s.mode is distinct from 'automatic') then
   update aulanexo_private.whatsapp_messages set status='cancelled' where id=m.id;return null;
  end if;
  if exists(select 1 from aulanexo_private.whatsapp_messages where conversation_id=t.id and status='sending') then return null;end if;
  if m.source='bot' and (select count(*) from aulanexo_private.whatsapp_messages where conversation_id=t.id and source='bot' and status in ('sent','delivered','read','sending') and created_at>now()-interval '24 hours')>=30 then
   update aulanexo_private.whatsapp_conversations set human=true where id=t.id;
   update aulanexo_private.whatsapp_messages set status='cancelled' where conversation_id=t.id and source='bot' and status='pending';return null;
  end if;
  update aulanexo_private.whatsapp_messages set status='sending',claimed_at=now() where id=m.id;
  return jsonb_build_object('id',m.id,'body',m.body,'contactKey',t.contact_key,'phoneNumberId',c.phone_number_id,'ciphertext',c.token_ciphertext,'schoolId',m.school_id);
 elsif p_action='sent' then
  update aulanexo_private.whatsapp_messages set status=case when provider_id is not null and status in ('delivered','read') then status else 'sent' end,provider_id=p_data->>'providerId' where id=(p_data->>'messageId')::uuid and status in ('sending','sent','delivered','read');
  update aulanexo_private.whatsapp_messages msg set status=d.status from aulanexo_private.whatsapp_delivery_events d where msg.id=(p_data->>'messageId')::uuid and d.school_id=msg.school_id and d.provider_id=msg.provider_id and aulanexo_private.whatsapp_status_rank(d.status)>aulanexo_private.whatsapp_status_rank(msg.status);return '{}'::jsonb;
 elsif p_action='send_error' then
  update aulanexo_private.whatsapp_messages set status=case when p_data->>'certain'='true' then 'failed' else 'unknown' end,error_code=left(p_data->>'code',100) where id=(p_data->>'messageId')::uuid and status='sending';return '{}'::jsonb;
 elsif p_action='connection' then
  if not aulanexo_private.whatsapp_enabled(sid) then return null;end if;
  select * into c from aulanexo_private.whatsapp_connections where school_id=sid;return to_jsonb(c);
 elsif p_action='save_connection' then
  if not aulanexo_private.whatsapp_enabled(sid) then raise exception 'Institución fuera del piloto.';end if;
  select * into c from aulanexo_private.whatsapp_connections where school_id=sid for update;
  if c.school_id is not null and c.phone_number_id<>p_data->>'phoneNumberId' then raise exception 'Esta sede tiene otro número asociado. Conserva su historial y solicita el cambio a soporte.';end if;
  insert into aulanexo_private.whatsapp_connections(school_id,phone_number_id,waba_id,display_phone,verified_name,status,token_ciphertext,token_expires_at,connected_by)
  values(sid,p_data->>'phoneNumberId',p_data->>'wabaId',p_data->>'displayPhone',coalesce(p_data->>'verifiedName',''),'pending',p_data->>'ciphertext',(p_data->>'expiresAt')::timestamptz,(p_data->>'userId')::uuid)
  on conflict(school_id) do update set status='pending',token_ciphertext=excluded.token_ciphertext,token_expires_at=excluded.token_expires_at,connected_by=excluded.connected_by,display_phone=excluded.display_phone,verified_name=excluded.verified_name,updated_at=now() where aulanexo_private.whatsapp_connections.phone_number_id=excluded.phone_number_id returning school_id into v_id;
  if v_id is null then raise exception 'Otra conexión cambió el número de esta sede. Actualiza la pantalla.';end if;return '{}'::jsonb;
 elsif p_action='connection_status' then
  if p_data->>'status' not in ('connected','needs_reconnect') then raise exception 'Estado no válido.';end if;
  update aulanexo_private.whatsapp_connections set status=p_data->>'status',updated_at=now() where school_id=sid and token_ciphertext=p_data->>'ciphertext' and status<>'disconnected';return '{}'::jsonb;
 elsif p_action in ('ingest','status') then
  select * into c from aulanexo_private.whatsapp_connections where phone_number_id=p_data->>'phoneNumberId' and waba_id=p_data->>'wabaId' and status='connected';
  if c.school_id is null or not aulanexo_private.whatsapp_enabled(c.school_id) then return null;end if;
  if p_action='status' then
   insert into aulanexo_private.whatsapp_delivery_events(school_id,provider_id,status) values(c.school_id,p_data->>'providerId',p_data->>'status')
   on conflict(school_id,provider_id) do update set status=excluded.status,updated_at=now() where aulanexo_private.whatsapp_status_rank(excluded.status)>aulanexo_private.whatsapp_status_rank(aulanexo_private.whatsapp_delivery_events.status);
   update aulanexo_private.whatsapp_messages msg set status=d.status from aulanexo_private.whatsapp_delivery_events d where msg.school_id=c.school_id and d.school_id=msg.school_id and d.provider_id=msg.provider_id and msg.provider_id=p_data->>'providerId' and msg.direction='out' and aulanexo_private.whatsapp_status_rank(d.status)>aulanexo_private.whatsapp_status_rank(msg.status);
   return '{}'::jsonb;
  end if;
  event_time:=least((p_data->>'timestamp')::timestamptz,now());
  if p_data->>'echo'='true' and exists(select 1 from aulanexo_private.whatsapp_messages where provider_id=p_data->>'providerId') then return null;end if;
  if exists(select 1 from aulanexo_private.whatsapp_messages where provider_id=p_data->>'providerId' and school_id<>c.school_id) then return null;end if;
  insert into aulanexo_private.whatsapp_conversations(school_id,contact_key,contact_name) values(c.school_id,p_data->>'contactKey',left(coalesce(p_data->>'contactName',''),160)) on conflict(school_id,contact_key) do nothing;
  select * into t from aulanexo_private.whatsapp_conversations where school_id=c.school_id and contact_key=p_data->>'contactKey' for update;
  insert into aulanexo_private.whatsapp_messages(school_id,conversation_id,direction,source,body,provider_id,status,created_at)
  values(c.school_id,t.id,case when p_data->>'echo'='true' then 'out' else 'in' end,case when p_data->>'echo'='true' then 'app' else 'customer' end,left(p_data->>'body',4000),p_data->>'providerId',case when p_data->>'echo'='true' then 'sent' else 'received' end,event_time)
  on conflict(provider_id) do nothing returning id into v_id;
  new_row:=v_id is not null;
  if not new_row then select id into v_id from aulanexo_private.whatsapp_messages where provider_id=p_data->>'providerId' and conversation_id=t.id;end if;
  if new_row then
   update aulanexo_private.whatsapp_conversations set unread=unread+case when p_data->>'echo'='true' then 0 else 1 end,
    human=human or p_data->>'echo'='true',last_message_at=greatest(last_message_at,event_time),
    last_customer_at=case when p_data->>'echo'='true' then last_customer_at else greatest(last_customer_at,event_time) end where id=t.id returning * into t;
   if p_data->>'echo'='true' then update aulanexo_private.whatsapp_messages set status='cancelled' where conversation_id=t.id and source='bot' and status='pending';end if;
  end if;
  select * into s from aulanexo_private.whatsapp_settings where school_id=c.school_id;
  return jsonb_build_object('messageId',v_id,'conversationId',t.id,'schoolId',c.school_id,'human',t.human,'mode',coalesce(s.mode,'manual'),'settings',to_jsonb(s),
   'school',(select jsonb_build_object('name',name,'siteName',site_name,'city',city,'description',public_description,'levels',education_levels,'website',website,
    'address',case when show_public_contact then address else '' end,'phone',c.display_phone) from public.schools where id=c.school_id));
 elsif p_action='queue_auto' then
  select * into m from aulanexo_private.whatsapp_messages where id=(p_data->>'inReplyTo')::uuid and direction='in';
  if m.id is null or m.created_at<=now()-interval '24 hours' then return null;end if;
  select * into t from aulanexo_private.whatsapp_conversations where id=m.conversation_id for update;
  if t.human or not aulanexo_private.whatsapp_enabled(m.school_id) or not exists(select 1 from aulanexo_private.whatsapp_settings where school_id=m.school_id and mode='automatic') then return null;end if;
  insert into aulanexo_private.whatsapp_messages(school_id,conversation_id,direction,source,body,status,in_reply_to,handoff)
  values(m.school_id,t.id,'out','bot',p_data->>'body','pending',m.id,coalesce((p_data->>'handoff')::boolean,false)) on conflict(in_reply_to) do nothing returning id into v_id;
  if p_data->>'handoff'='true' then update aulanexo_private.whatsapp_conversations set human=true where id=t.id;end if;
  return to_jsonb(v_id);
 else raise exception 'Acción interna no válida.';end if;
end $$;
revoke all on function public.whatsapp_access(uuid),public.whatsapp_workspace(uuid,uuid),public.whatsapp_manage(uuid,text,jsonb) from public,anon;
grant execute on function public.whatsapp_access(uuid),public.whatsapp_workspace(uuid,uuid),public.whatsapp_manage(uuid,text,jsonb) to authenticated;
revoke all on function public.whatsapp_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_service(text,jsonb) to service_role;
create function aulanexo_private.dispatch_whatsapp_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret_value text;base_url text;request_id bigint;begin
 select decrypted_secret into secret_value from vault.decrypted_secrets where name='micole_whatsapp_worker_key';
 select decrypted_secret into base_url from vault.decrypted_secrets where name='micole_whatsapp_project_url';
 if secret_value is null or base_url is null then return null;end if;
 select net.http_post(url:=base_url||'/functions/v1/whatsapp-crm',headers:=jsonb_build_object('Content-Type','application/json','x-micole-worker-key',secret_value),body:='{"action":"worker"}'::jsonb,timeout_milliseconds:=90000) into request_id;return request_id;
end $$;
revoke all on function aulanexo_private.dispatch_whatsapp_worker() from public,anon,authenticated,service_role;
