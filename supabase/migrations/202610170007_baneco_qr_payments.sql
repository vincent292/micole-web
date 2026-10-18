create table aulanexo_private.bank_qr_intents (
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references aulanexo_private.bank_connections(id),
 school_id uuid not null references public.schools(id),student_id uuid references public.students(id),kind text not null check(kind in ('school','platform')),
 amount numeric(12,2) not null check(amount between 0.01 and 50000),currency text not null default 'BOB' check(currency='BOB'),
 items jsonb not null,invoice jsonb not null default '{}',fingerprint text not null,transaction_id text not null unique,
 due_date date not null,description text not null,qr_id text,qr_image text,
 status text not null default 'generating' check(status in ('generating','pending','paid','cancelled','expired','review','unknown','failed')),
 application_status text not null default 'waiting' check(application_status in ('waiting','applied','review','test','none')),
 bank_transaction_id text,verified_at timestamptz,last_error text,attempts integer not null default 0,
 operation_token uuid,operation_until timestamptz,next_check_at timestamptz not null default now(),
 last_attempt_at timestamptz,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index bank_qr_provider_id on aulanexo_private.bank_qr_intents(connection_id,qr_id) where qr_id is not null;
create index bank_qr_work on aulanexo_private.bank_qr_intents(next_check_at) where status not in ('paid','cancelled','failed');
create table aulanexo_private.bank_qr_allocations (
 intent_id uuid not null references aulanexo_private.bank_qr_intents(id),school_charge_id uuid references public.school_charges(id),
 platform_charge_id uuid references public.platform_charges(id),amount numeric(12,2) not null check(amount>0),starting_paid numeric(12,2) not null default 0,
 reserved boolean not null default true,check((school_charge_id is null)<>(platform_charge_id is null))
);
create unique index bank_reserve_school_charge on aulanexo_private.bank_qr_allocations(school_charge_id) where reserved and school_charge_id is not null;
create unique index bank_reserve_platform_charge on aulanexo_private.bank_qr_allocations(platform_charge_id) where reserved and platform_charge_id is not null;
alter table aulanexo_private.payment_links add column bank_intent_id uuid references aulanexo_private.bank_qr_intents(id);
revoke all on aulanexo_private.bank_qr_intents,aulanexo_private.bank_qr_allocations from public,anon,authenticated;

create function aulanexo_private.bank_intent_visible(p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare i aulanexo_private.bank_qr_intents;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id;
 if i.id is null or auth.uid() is null or not aulanexo_private.in_support_school(i.school_id) then return false;end if;
 if public.is_platform_admin() and aulanexo_private.is_support_owner() then return true;end if;
 if public.has_school_role(i.school_id,array['director']) then return true;end if;
 if i.kind='school' then return public.is_verified_guardian(i.student_id) or (public.may_teacher_write(i.student_id) and not exists(select 1 from aulanexo_private.bank_qr_allocations a join public.school_charges c on c.id=a.school_charge_id where a.intent_id=i.id and c.academic_request_id is null));end if;
 return not exists(select 1 from aulanexo_private.bank_qr_allocations a join public.platform_charges c on c.id=a.platform_charge_id where a.intent_id=i.id and (c.student_id is null or not public.is_verified_guardian(c.student_id)));
end $$;
create function aulanexo_private.bank_intent_json(p_id uuid,p_image boolean default true) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',i.id,'kind',i.kind,'amount',i.amount,'currency',i.currency,'status',i.status,'applicationStatus',i.application_status,
 'environment',c.environment,'image',case when p_image and i.status not in ('cancelled','failed') then i.qr_image end,'qrId',i.qr_id,'transactionId',i.transaction_id,'dueDate',i.due_date,'verifiedAt',i.verified_at,'reference',i.bank_transaction_id,'lastError',i.last_error,'invoiceRequested',i.invoice<>'{}'::jsonb,'createdAt',i.created_at,'studentId',i.student_id,'schoolId',i.school_id)
 from aulanexo_private.bank_qr_intents i join aulanexo_private.bank_connections c on c.id=i.connection_id where i.id=p_id;
$$;
revoke all on function aulanexo_private.bank_intent_visible(uuid),aulanexo_private.bank_intent_json(uuid,boolean) from public,anon,authenticated;
create function aulanexo_private.reserve_bank_qr(p_kind text,p_school uuid,p_student uuid,p_items jsonb,p_invoice jsonb,p_actor uuid,p_link uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection aulanexo_private.bank_connections;i aulanexo_private.bank_qr_intents;c public.school_charges;pc public.platform_charges;item jsonb;amount_value numeric;total numeric:=0;stored jsonb:='[]';hash text;conflict_id uuid;ids integer;version uuid;token uuid:=gen_random_uuid();intent uuid:=gen_random_uuid();begin
 if p_kind not in ('school','platform') or p_actor is null or coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items) not between 1 and 60 then raise exception 'Selecciona las cuotas del pago.';end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'chargeId') from jsonb_array_elements(p_items)) then raise exception 'No repitas cuotas.';end if;
 select b.* into connection from aulanexo_private.payment_connections p join aulanexo_private.bank_connections b on b.id=p.bank_connection_id where p.connection_key=case when p_kind='platform' then 'platform' else p_school::text end;
 if connection.id is null or not connection.enabled or connection.check_result is distinct from 'ok' then raise exception 'La cuenta Baneco todavía no está habilitada para cobrar.';end if;
 if ((aulanexo_private.test_context()).id is not null or exists(select 1 from aulanexo_private.test_institutions where school_id=p_school and enabled)) and connection.environment='production' then raise exception 'En modo de pruebas utiliza certificación, no cobros de producción.';end if;
 if p_kind='school' then perform pg_advisory_xact_lock(hashtext('bank-student-'||p_student::text));end if;
 for item in select value from jsonb_array_elements(p_items) order by value->>'chargeId' loop
  if coalesce(item->>'amount','') !~ '^[0-9]+(\.[0-9]{1,2})?$' then raise exception 'Revisa el importe del abono.';end if;
  amount_value:=(item->>'amount')::numeric;
  if p_kind='school' then
   select * into c from public.school_charges where id=(item->>'chargeId')::uuid for update;
   if c.id is null or c.school_id<>p_school or c.student_id<>p_student or c.status in ('paid','cancelled') or amount_value<=0 or amount_value>c.amount-c.paid_amount then raise exception 'Los saldos cambiaron. Actualiza las cuotas.';end if;
   stored:=stored||jsonb_build_array(jsonb_build_object('chargeId',c.id,'amount',amount_value,'startingPaidAmount',c.paid_amount));
  else
   select * into pc from public.platform_charges where id=(item->>'chargeId')::uuid for update;
   if pc.id is null or pc.school_id<>p_school or pc.status in ('paid','cancelled') or amount_value<>pc.amount or amount_value<=0 then raise exception 'Revisa los cobros pendientes de MiCole.';end if;
   stored:=stored||jsonb_build_array(jsonb_build_object('chargeId',pc.id,'amount',pc.amount,'startingPaidAmount',0));
  end if;
  total:=total+amount_value;
 end loop;
 if total not between 0.01 and 50000 then raise exception 'El importe debe estar entre Bs 0,01 y Bs 50.000 por QR.';end if;
 if p_invoice is null then p_invoice:='{}';end if;
 if p_invoice<>'{}'::jsonb and (coalesce(length(trim(p_invoice->>'invoiceName')),0) not between 2 and 160 or coalesce(p_invoice->>'invoiceNit','') !~ '^[A-Za-z0-9 .-]{3,30}$' or coalesce(p_invoice->>'invoicePhone','') !~ '^\+?[0-9 ()-]{6,25}$') then raise exception 'Completa nombre, NIT/CI y celular para la factura.';end if;
 hash:=encode(sha256(convert_to(jsonb_build_object('kind',p_kind,'school',p_school,'student',p_student,'items',stored,'invoice',p_invoice)::text,'UTF8')),'hex');
 select * into i from aulanexo_private.bank_qr_intents where fingerprint=hash and status not in ('paid','cancelled','failed') order by created_at desc limit 1;
 if i.id is not null then
  if p_link is not null then update aulanexo_private.payment_links set bank_intent_id=i.id where id=p_link;end if;
  return jsonb_build_object('id',i.id,'generate',false);
 end if;
 if exists(select 1 from aulanexo_private.bank_qr_allocations a where a.reserved and coalesce(a.school_charge_id,a.platform_charge_id) in (select (value->>'chargeId')::uuid from jsonb_array_elements(stored))) then raise exception 'Hay un QR pendiente para estas cuotas. Revísalo o cancélalo antes de crear otro cobro.';end if;
 insert into aulanexo_private.bank_qr_intents(id,connection_id,school_id,student_id,kind,amount,items,invoice,fingerprint,transaction_id,due_date,description,created_by,operation_token,operation_until)
 values(intent,connection.id,p_school,p_student,p_kind,total,stored,p_invoice,hash,'MC-'||replace(intent::text,'-',''),(now() at time zone 'America/La_Paz')::date,
 case when p_kind='platform' then 'Pago de servicios MiCole' else 'Pago de cuotas escolares MiCole' end,p_actor,token,now()+interval '90 seconds');
 for item in select value from jsonb_array_elements(stored) loop
  insert into aulanexo_private.bank_qr_allocations(intent_id,school_charge_id,platform_charge_id,amount,starting_paid) values(intent,case when p_kind='school' then (item->>'chargeId')::uuid end,case when p_kind='platform' then (item->>'chargeId')::uuid end,(item->>'amount')::numeric,(item->>'startingPaidAmount')::numeric);
 end loop;
 if p_link is not null then update aulanexo_private.payment_links set bank_intent_id=intent where id=p_link;end if;
 return jsonb_build_object('id',intent,'generate',true,'operationToken',token);
end $$;
revoke all on function aulanexo_private.reserve_bank_qr(text,uuid,uuid,jsonb,jsonb,uuid,uuid) from public,anon,authenticated;

create function public.reserve_baneco_payment(p_kind text,p_school_id uuid,p_student_id uuid,p_items jsonb,p_invoice jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$declare child public.students;item jsonb;c public.school_charges;pc public.platform_charges;begin
 if auth.uid() is null then raise exception 'Inicia sesión para pagar.';end if;
 if p_kind='school' then
  select * into child from public.students where id=p_student_id;
  if child.id is null or not aulanexo_private.in_support_school(child.school_id) or not(public.may_manage_student(child.id) or public.is_verified_guardian(child.id) or public.may_teacher_write(child.id)) then raise exception 'No tienes acceso a este cobro.';end if;
  if coalesce(jsonb_typeof(p_items),'null')<>'array' then raise exception 'Selecciona las cuotas.';end if;
  if not(public.may_manage_student(child.id) or public.is_verified_guardian(child.id)) and exists(select 1 from jsonb_array_elements(p_items) j join public.school_charges charge on charge.id=(j->>'chargeId')::uuid where charge.academic_request_id is null) then raise exception 'Los docentes solo cobran actividades de sus aulas.';end if;
  return aulanexo_private.reserve_bank_qr(p_kind,child.school_id,child.id,p_items,p_invoice,auth.uid());
 elsif p_kind='platform' then
  if not aulanexo_private.in_support_school(p_school_id) or coalesce(jsonb_typeof(p_items),'null')<>'array' then raise exception 'Selecciona los cobros de MiCole.';end if;
  if not(public.is_platform_admin() or public.has_school_role(p_school_id,array['director'])) then
   for item in select value from jsonb_array_elements(p_items) loop
    select * into pc from public.platform_charges where id=(item->>'chargeId')::uuid;
    if pc.id is null or pc.student_id is null or not public.is_verified_guardian(pc.student_id) then raise exception 'No tienes acceso a este cobro de MiCole.';end if;
   end loop;
  end if;
  return aulanexo_private.reserve_bank_qr(p_kind,p_school_id,null,p_items,'{}',auth.uid());
 end if;
 raise exception 'Tipo de cobro inválido.';
end $$;
create function public.reserve_baneco_link(p_token text,p_invoice jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$declare link aulanexo_private.payment_links;begin
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then raise exception 'Enlace de pago inválido.';end if;
 select * into link from aulanexo_private.payment_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if link.id is null or link.revoked_at is not null or link.expires_at<=now() then raise exception 'El enlace venció. Solicita uno nuevo.';end if;
 if link.bank_intent_id is not null and exists(select 1 from aulanexo_private.bank_qr_intents where id=link.bank_intent_id and status not in ('cancelled','failed')) then return jsonb_build_object('id',link.bank_intent_id,'generate',false);end if;
 if (aulanexo_private.payment_link_context_before_bank(p_token)->>'status')<>'pending' then raise exception 'Los saldos cambiaron. Solicita un enlace actualizado.';end if;
 return aulanexo_private.reserve_bank_qr('school',link.school_id,link.student_id,link.items,p_invoice,link.created_by,link.id);
end $$;
create function public.baneco_payment_context(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not aulanexo_private.bank_intent_visible(p_id) then raise exception 'No tienes acceso a este QR.';end if;
 return aulanexo_private.bank_intent_json(p_id);
end $$;
-- Public capabilities are opaque hashes; this endpoint exposes only the selected
-- student's shortened name and the QR for those exact charge allocations.
do $$begin execute replace(pg_get_functiondef('public.payment_link_context(text)'::regprocedure),'FUNCTION public.payment_link_context(', 'FUNCTION aulanexo_private.payment_link_context_before_bank(');end $$;
revoke all on function aulanexo_private.payment_link_context_before_bank(text) from public,anon,authenticated;
create or replace function public.payment_link_context(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;link aulanexo_private.payment_links;ready boolean;begin
 result:=aulanexo_private.payment_link_context_before_bank(p_token);
 select * into link from aulanexo_private.payment_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select b.enabled and b.check_result='ok' into ready from aulanexo_private.payment_connections p join aulanexo_private.bank_connections b on b.id=p.bank_connection_id where p.connection_key=link.school_id::text;
 return result||jsonb_build_object('qrAvailable',coalesce(ready,false),'bankPayment',aulanexo_private.bank_intent_json(link.bank_intent_id));
end $$;
create function public.baneco_payment_register(p_school_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 return coalesce((select jsonb_agg(aulanexo_private.bank_intent_json(i.id,false) order by i.created_at desc) from (select * from aulanexo_private.bank_qr_intents where (p_school_id is null or school_id=p_school_id) and aulanexo_private.bank_intent_visible(id) order by created_at desc limit 100) i),'[]'::jsonb);
end $$;

create function public.bank_generation_context(p_id uuid,p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare i aulanexo_private.bank_qr_intents;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id and operation_token=p_token and status='generating' and operation_until>now();
 if i.id is null then raise exception 'bank-operation-busy';end if;
 return jsonb_build_object('id',i.id,'connectionId',i.connection_id,'transactionId',i.transaction_id,'amount',i.amount,'currency',i.currency,'dueDate',i.due_date,'description',i.description);
end $$;
create function public.bank_finish_generation(p_id uuid,p_token uuid,p_qr_id text,p_image text,p_error text default null,p_before_generation boolean default false) returns boolean language plpgsql security definer set search_path='' as $$begin
 if p_qr_id is not null and (p_qr_id !~ '^[A-Za-z0-9_-]{1,100}$' or length(p_image)>3000000 or p_image !~ '^data:image/(png|jpeg);base64,') then raise exception 'bank-invalid-response';end if;
 update aulanexo_private.bank_qr_intents set qr_id=p_qr_id,qr_image=p_image,status=case when p_error is null and p_qr_id is not null then 'pending' when p_before_generation then 'failed' else 'unknown' end,
 last_error=left(p_error,80),operation_token=null,operation_until=null,next_check_at=now(),updated_at=now() where id=p_id and operation_token=p_token and status='generating';
 if not found then return false;end if;
 if p_before_generation then update aulanexo_private.bank_qr_allocations set reserved=false where intent_id=p_id;end if;
 return true;
end $$;
create function public.bank_claim_reconciliation(p_id uuid default null,p_cancel boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare i aulanexo_private.bank_qr_intents;token uuid:=gen_random_uuid();begin
 update aulanexo_private.bank_qr_intents set status='unknown',operation_token=null,operation_until=null,last_error='bank-generation-interrupted' where status='generating' and operation_until<now();
 select * into i from aulanexo_private.bank_qr_intents where (p_id is null or id=p_id) and qr_id is not null and status not in ('paid','cancelled','failed') and (operation_until is null or operation_until<now()) and (last_attempt_at is null or last_attempt_at<now()-interval '5 seconds') and (p_cancel or next_check_at<=now()) order by next_check_at,id for update skip locked limit 1;
 if i.id is null then return null;end if;
 update aulanexo_private.bank_qr_intents set operation_token=token,operation_until=now()+interval '90 seconds',attempts=attempts+1,last_attempt_at=now() where id=i.id;
 return jsonb_build_object('id',i.id,'operationToken',token,'connectionId',i.connection_id,'qrId',i.qr_id,'amount',i.amount,'currency',i.currency,'dueDate',i.due_date);
end $$;

create function aulanexo_private.apply_baneco_payment(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare i aulanexo_private.bank_qr_intents;connection aulanexo_private.bank_connections;a aulanexo_private.bank_qr_allocations;c public.school_charges;pc public.platform_charges;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id for update;
 if i.status<>'paid' or i.application_status in ('applied','test') then return;end if;
 select * into connection from aulanexo_private.bank_connections where id=i.connection_id;
 if connection.environment='test' and not exists(select 1 from aulanexo_private.test_institutions where school_id=i.school_id and enabled) then
  update aulanexo_private.bank_qr_intents set application_status='test' where id=i.id;update aulanexo_private.bank_qr_allocations set reserved=false where intent_id=i.id;return;
 end if;
 if i.kind='school' then
  perform pg_advisory_xact_lock(hashtext('bank-student-'||i.student_id::text));
  for a in select * from aulanexo_private.bank_qr_allocations where intent_id=i.id order by school_charge_id loop
   select * into c from public.school_charges where id=a.school_charge_id for update;
   if c.status in ('paid','cancelled') or c.paid_amount<>a.starting_paid or c.amount-c.paid_amount<a.amount then raise exception 'bank-balance-changed';end if;
  end loop;
  insert into public.school_receipts(id,school_id,student_id,total,payment_method,reference,verification_source,request_hash,recorded_by) values(i.id,i.school_id,i.student_id,i.amount,'qr',i.bank_transaction_id,'provider','baneco-'||i.id::text,i.created_by);
  for a in select * from aulanexo_private.bank_qr_allocations where intent_id=i.id order by school_charge_id loop
   insert into public.school_payments(charge_id,amount,payment_method,verification_state,created_by,reference,receipt_id) values(a.school_charge_id,a.amount,'qr','verified',i.created_by,i.bank_transaction_id,i.id);
  end loop;
  if i.invoice<>'{}'::jsonb then insert into public.invoice_requests(school_id,student_id,receipt_id,legal_name,nit_ci,phone,amount,requested_by) values(i.school_id,i.student_id,i.id,trim(i.invoice->>'invoiceName'),upper(trim(i.invoice->>'invoiceNit')),trim(i.invoice->>'invoicePhone'),i.amount,i.created_by);end if;
 else
  for a in select * from aulanexo_private.bank_qr_allocations where intent_id=i.id order by platform_charge_id loop
   select * into pc from public.platform_charges where id=a.platform_charge_id for update;
   if pc.status in ('paid','cancelled') or pc.amount<>a.amount then raise exception 'bank-balance-changed';end if;
   insert into public.platform_payments(charge_id,amount,payment_method,reference,created_by) values(pc.id,pc.amount,'qr',i.bank_transaction_id,i.created_by);
   update public.platform_charges set status='paid',provider_transaction_id='baneco-'||i.id::text||'-'||pc.id::text where id=pc.id;
  end loop;
 end if;
 update aulanexo_private.bank_qr_intents set application_status='applied',last_error=null where id=i.id;
 update aulanexo_private.bank_qr_allocations set reserved=false where intent_id=i.id;
end $$;
revoke all on function aulanexo_private.apply_baneco_payment(uuid) from public,anon,authenticated;
create table aulanexo_private.bank_settlements (
 connection_key text not null,environment text not null,bank_transaction_id text not null,intent_id uuid not null unique references aulanexo_private.bank_qr_intents(id),
 primary key(connection_key,environment,bank_transaction_id)
);
revoke all on aulanexo_private.bank_settlements from public,anon,authenticated;
create function public.bank_finish_reconciliation(p_id uuid,p_token uuid,p_status text,p_transaction text default null,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$declare i aulanexo_private.bank_qr_intents;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id and operation_token=p_token and operation_until>now() for update;
 if i.id is null then return false;end if;
 if p_error is not null then
  update aulanexo_private.bank_qr_intents set operation_token=null,operation_until=null,last_error=left(p_error,80),next_check_at=now()+make_interval(secs=>least(3600,60*power(2,least(attempts,6))::integer)),updated_at=now() where id=i.id;return true;
 end if;
 if p_status is null or p_status not in ('pending','paid','cancelled','expired','review') or (p_status='paid' and coalesce(length(trim(p_transaction)),0) not between 1 and 160) then raise exception 'bank-invalid-response';end if;
 if p_status='paid' and exists(select 1 from aulanexo_private.bank_qr_intents other join aulanexo_private.bank_connections oc on oc.id=other.connection_id join aulanexo_private.bank_connections current on current.id=i.connection_id where other.id<>i.id and other.bank_transaction_id=p_transaction and other.status='paid' and oc.connection_key=current.connection_key and oc.environment=current.environment) then p_status:='review';end if;
 if p_status='paid' then
  insert into aulanexo_private.bank_settlements(connection_key,environment,bank_transaction_id,intent_id) select connection_key,environment,p_transaction,i.id from aulanexo_private.bank_connections where id=i.connection_id on conflict do nothing;
  if not exists(select 1 from aulanexo_private.bank_settlements where intent_id=i.id) then p_status:='review';end if;
 end if;
 update aulanexo_private.bank_qr_intents set status=p_status,bank_transaction_id=case when p_status='paid' then p_transaction else bank_transaction_id end,verified_at=case when p_status='paid' then now() else verified_at end,last_error=case when p_status='review' then 'bank-payment-review' else null end,operation_token=null,operation_until=null,next_check_at=now()+case when p_status in ('expired','review') then interval '1 hour' else interval '60 seconds' end,updated_at=now() where id=i.id;
 if p_status='paid' then
  begin perform aulanexo_private.apply_baneco_payment(i.id);exception when others then update aulanexo_private.bank_qr_intents set application_status='review',last_error='bank-application-review' where id=i.id;end;
 elsif p_status='cancelled' then update aulanexo_private.bank_qr_allocations set reserved=false where intent_id=i.id;update aulanexo_private.bank_qr_intents set application_status='none' where id=i.id;
 end if;
 return true;
end $$;
create function public.bank_retry_application(p_id uuid) returns void language plpgsql security definer set search_path='' as $$declare i aulanexo_private.bank_qr_intents;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id;
 if i.id is null or not(case when i.kind='platform' then public.is_platform_admin() else public.has_school_role(i.school_id,array['director']) end) or not aulanexo_private.bank_intent_visible(i.id) then raise exception 'Solo la administración puede revisar este cobro.';end if;
 perform aulanexo_private.apply_baneco_payment(i.id);
end $$;
create function public.bank_notify_hint(p_qr_id text) returns boolean language plpgsql security definer set search_path='' as $$begin
 if coalesce(p_qr_id,'') !~ '^[A-Za-z0-9_-]{1,100}$' then return false;end if;
 update aulanexo_private.bank_qr_intents set next_check_at=now() where qr_id=p_qr_id and status not in ('paid','cancelled','failed') and (operation_until is null or operation_until<now()) and updated_at<now()-interval '10 seconds';
 return found;
end $$;
-- Manual cash/transfer collection cannot race an already emitted bank QR.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.checkout_school_payment(uuid,uuid,jsonb,text,text,jsonb,boolean)'::regprocedure);
 definition:=replace(definition,'FUNCTION public.checkout_school_payment(','FUNCTION aulanexo_private.checkout_before_bank(');execute definition;
end $$;
revoke all on function aulanexo_private.checkout_before_bank(uuid,uuid,jsonb,text,text,jsonb,boolean) from public,anon,authenticated;
create or replace function public.checkout_school_payment(p_receipt_id uuid,p_student_id uuid,p_items jsonb,p_method text,p_reference text,p_invoice jsonb default '{}',p_qr_reviewed boolean default false) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not(public.may_manage_student(p_student_id) or public.may_teacher_write(p_student_id)) then raise exception 'No tienes permiso para corroborar este cobro.';end if;
 perform pg_advisory_xact_lock(hashtext('bank-student-'||p_student_id::text));
 if exists(select 1 from aulanexo_private.bank_qr_allocations where reserved and school_charge_id in(select (value->>'chargeId')::uuid from jsonb_array_elements(p_items))) then raise exception 'Primero revisa o cancela el QR pendiente de estas cuotas.';end if;
 return aulanexo_private.checkout_before_bank(p_receipt_id,p_student_id,p_items,p_method,p_reference,p_invoice,p_qr_reviewed);
end $$;
revoke all on function public.reserve_baneco_payment(text,uuid,uuid,jsonb,jsonb),public.reserve_baneco_link(text,jsonb),public.baneco_payment_context(uuid),public.baneco_payment_register(uuid),public.bank_retry_application(uuid) from public,anon;
grant execute on function public.reserve_baneco_payment(text,uuid,uuid,jsonb,jsonb),public.reserve_baneco_link(text,jsonb),public.baneco_payment_context(uuid),public.baneco_payment_register(uuid),public.bank_retry_application(uuid) to authenticated;
grant execute on function public.reserve_baneco_link(text,jsonb) to anon;
revoke all on function public.bank_generation_context(uuid,uuid),public.bank_finish_generation(uuid,uuid,text,text,text,boolean),public.bank_claim_reconciliation(uuid,boolean),public.bank_finish_reconciliation(uuid,uuid,text,text,text),public.bank_notify_hint(text) from public,anon,authenticated;
grant execute on function public.bank_generation_context(uuid,uuid),public.bank_finish_generation(uuid,uuid,text,text,text,boolean),public.bank_claim_reconciliation(uuid,boolean),public.bank_finish_reconciliation(uuid,uuid,text,text,text),public.bank_notify_hint(text) to service_role;
do $$begin execute replace(pg_get_functiondef('public.record_platform_payment(uuid,text,text)'::regprocedure),'FUNCTION public.record_platform_payment(', 'FUNCTION aulanexo_private.record_platform_before_bank(');end $$;
revoke all on function aulanexo_private.record_platform_before_bank(uuid,text,text) from public,anon,authenticated;
create or replace function public.record_platform_payment(p_charge_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma confirma sus pagos.';end if;
 perform 1 from public.platform_charges where id=p_charge_id for update;
 if exists(select 1 from aulanexo_private.bank_qr_allocations where platform_charge_id=p_charge_id and reserved) then raise exception 'Primero revisa o cancela el QR pendiente de este cobro.';end if;
 perform aulanexo_private.record_platform_before_bank(p_charge_id,p_method,p_reference);
end $$;
do $$begin execute replace(pg_get_functiondef('public.record_school_payment(uuid,text,text)'::regprocedure),'FUNCTION public.record_school_payment(', 'FUNCTION aulanexo_private.record_school_before_bank(');end $$;
revoke all on function aulanexo_private.record_school_before_bank(uuid,text,text) from public,anon,authenticated;
create or replace function public.record_school_payment(p_charge_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$declare student uuid;begin
 select student_id into student from public.school_charges where id=p_charge_id;
 if student is null or not public.may_manage_student(student) then raise exception 'No tienes permiso para registrar este pago.';end if;
 perform pg_advisory_xact_lock(hashtext('bank-student-'||student::text));
 perform aulanexo_private.record_school_before_bank(p_charge_id,p_method,p_reference);
end $$;
