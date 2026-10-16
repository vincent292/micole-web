-- Cobros agrupados/parciales, caja opcional, solicitudes de factura y conexiones privadas.
alter table public.school_charges add column paid_amount numeric(12,2) not null default 0 check(paid_amount>=0),
 add column minimum_access_ratio numeric(3,2) not null default 1 check(minimum_access_ratio between 0.5 and 1);
update public.school_charges c set paid_amount=coalesce((select sum(amount) from public.school_payments p where p.charge_id=c.id and verification_state='verified'),case when c.status='paid' then c.amount else 0 end);

create function aulanexo_private.apply_charge_access_rule() returns trigger language plpgsql security definer set search_path='' as $$
declare plan public.payment_plans; final_count integer; begin
 if TG_OP='INSERT' then new.paid_amount:=0; end if;
 new.minimum_access_ratio:=1;
 if new.period is not null and new.plan_id is not null then
  select * into plan from public.payment_plans where id=new.plan_id;
  select coalesce((select final_full_installments from public.school_operation_settings where school_id=new.school_id),2) into final_count;
  if new.period < to_char(date_trunc('month',plan.start_date)+make_interval(months=>greatest(plan.months-final_count,0)),'YYYY-MM') then new.minimum_access_ratio:=0.5; end if;
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.apply_charge_access_rule() from public,anon,authenticated;
create trigger school_charge_access_rule before insert or update of period,plan_id on public.school_charges for each row execute function aulanexo_private.apply_charge_access_rule();
update public.school_charges set period=period where plan_id is not null;

create table public.school_receipts (
 id uuid primary key,school_id uuid not null references public.schools(id),student_id uuid not null,
 total numeric(12,2) not null check(total>0),payment_method text not null check(payment_method in ('cash','transfer','qr')),
 reference text not null,verification_source text not null default 'manual' check(verification_source in ('manual','provider')),
 request_hash text not null,recorded_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),foreign key(student_id,school_id) references public.students(id,school_id)
);
alter table public.school_payments add column receipt_id uuid references public.school_receipts(id);
create unique index new_bank_receipt_reference on public.school_receipts(school_id,payment_method,lower(trim(reference))) where payment_method in ('qr','transfer') and request_hash not like 'legacy-%';
-- Conservar el historial verificado sin inventar movimientos de dinero.
insert into public.school_receipts(id,school_id,student_id,total,payment_method,reference,request_hash,recorded_by,created_at)
 select p.id,c.school_id,c.student_id,p.amount,p.payment_method,p.reference,'legacy-'||p.id::text,coalesce(p.created_by,(select user_id from public.school_memberships m where m.school_id=c.school_id and m.role='director' order by m.user_id limit 1)),p.paid_at
 from public.school_payments p join public.school_charges c on c.id=p.charge_id
 where p.verification_state='verified' and (p.created_by is not null or exists(select 1 from public.school_memberships m where m.school_id=c.school_id and m.role='director'));
update public.school_payments p set receipt_id=p.id where exists(select 1 from public.school_receipts r where r.id=p.id);
create table public.invoice_requests (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,
 receipt_id uuid not null unique references public.school_receipts(id),legal_name text not null,nit_ci text not null,phone text not null,
 amount numeric(12,2) not null check(amount>0),status text not null default 'pending' check(status in ('pending','issued')),
 invoice_number text not null default '',issued_at timestamptz,issued_by uuid references auth.users(id),
 requested_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(student_id,school_id) references public.students(id,school_id)
);

alter table public.school_receipts enable row level security;
alter table public.invoice_requests enable row level security;
revoke all on public.school_receipts,public.invoice_requests from public,anon,authenticated;
grant select on public.school_receipts,public.invoice_requests to authenticated;
create policy receipts_read on public.school_receipts for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and
 (public.may_manage_student(student_id) or public.is_verified_guardian(student_id) or (recorded_by=aulanexo_private.actor_uid() and public.may_teacher_write(student_id))));
create policy invoices_read on public.invoice_requests for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and (public.may_manage_student(student_id) or public.is_verified_guardian(student_id)));

create function aulanexo_private.reconcile_charge_balance() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid:=case when TG_OP='DELETE' then old.charge_id else new.charge_id end; paid numeric;begin
 perform 1 from public.school_charges where id=target for update;
 select coalesce(sum(amount),0) into paid from public.school_payments where charge_id=target and verification_state='verified';
 update public.school_charges set paid_amount=paid,status=case when status='cancelled' then status when paid>=amount then 'paid' else 'pending' end,
 paid_at=case when paid>=amount then coalesce(paid_at,now()) else null end where id=target;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function aulanexo_private.reconcile_charge_balance() from public,anon,authenticated;
create trigger payment_balance after insert or update or delete on public.school_payments for each row execute function aulanexo_private.reconcile_charge_balance();

create function aulanexo_private.financial_learning_access(p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s join public.schools sch on sch.id=s.school_id where s.id=p_student and s.status='active' and sch.status='active' and s.profile_complete
 and not exists(select 1 from public.platform_charges c where c.student_id=s.id and c.status not in ('paid','cancelled'))
 and ((s.access_until is not null and s.access_until >= (now() at time zone 'America/La_Paz')::date)
 or not exists(select 1 from public.school_charges c left join public.academic_requests r on r.id=c.academic_request_id
 where c.student_id=s.id and c.status not in ('paid','cancelled')
 and (c.due_date < (now() at time zone 'America/La_Paz')::date or (c.period=to_char(now() at time zone 'America/La_Paz','YYYY-MM') and c.plan_id is not null))
 and (r.id is null or r.blocks_access)
 and c.paid_amount < ceil(c.amount*c.minimum_access_ratio*100)/100)));
$$;
revoke all on function aulanexo_private.financial_learning_access(uuid) from public,anon,authenticated;
create or replace function public.family_access(p_student_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_verified_guardian(p_student_id) and aulanexo_private.financial_learning_access(p_student_id);
$$;
create or replace function aulanexo_private.student_learning_access(p_student uuid) returns boolean language sql stable security definer set search_path='' as $$
 select aulanexo_private.financial_learning_access(p_student);
$$;
-- Una baja no anula importes que ya recibieron un abono.
create or replace function aulanexo_private.set_student_status_without_reason(p_student_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.may_manage_student(p_student_id) then raise exception 'No tienes permiso para modificar la inscripción.'; end if;
 perform 1 from public.students where id=p_student_id for update;
 if p_status is null or p_status not in ('active','inactive','pending') then raise exception 'Estado inválido.'; end if;
 if p_status='active' and exists(select 1 from public.platform_charges where student_id=p_student_id and status not in ('paid','cancelled')) then raise exception 'La activación de Bs 50 sigue pendiente.'; end if;
 update public.students set status=p_status,withdrawn_at=case when p_status='inactive' then (now() at time zone 'America/La_Paz')::date else null end where id=p_student_id;
 if p_status='inactive' then update public.school_charges set status='cancelled' where student_id=p_student_id and due_date>(now() at time zone 'America/La_Paz')::date and status not in ('paid','cancelled') and paid_amount=0; end if;
end $$;

create function aulanexo_private.create_invoice_request(p_receipt uuid,p_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare receipt public.school_receipts; result uuid; name_value text:=trim(p_details->>'invoiceName');nit_value text:=upper(trim(p_details->>'invoiceNit'));phone_value text:=trim(p_details->>'invoicePhone');begin
 if p_details is null or p_details='{}'::jsonb then return null; end if;
 if coalesce(length(name_value),0) not between 2 and 160 or coalesce(length(nit_value),0) not between 3 and 30 or nit_value !~ '^[A-Z0-9 .-]+$' or coalesce(length(phone_value),0) not between 6 and 25 or phone_value !~ '^\+?[0-9 ()-]+$' then raise exception 'Completa nombre o razón social, NIT/CI y celular para la factura.'; end if;
 select * into receipt from public.school_receipts where id=p_receipt;
 if receipt.id is null then raise exception 'Primero debe registrarse un cobro.'; end if;
 insert into public.invoice_requests(school_id,student_id,receipt_id,legal_name,nit_ci,phone,amount,requested_by)
 values(receipt.school_id,receipt.student_id,receipt.id,name_value,nit_value,phone_value,receipt.total,aulanexo_private.actor_uid())
 on conflict(receipt_id) do nothing returning id into result;
 return coalesce(result,(select id from public.invoice_requests where receipt_id=p_receipt));
end $$;
revoke all on function aulanexo_private.create_invoice_request(uuid,jsonb) from public,anon,authenticated;

create function public.checkout_school_payment(p_receipt_id uuid,p_student_id uuid,p_items jsonb,p_method text,p_reference text,p_invoice jsonb default '{}'::jsonb,p_qr_reviewed boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare child public.students; charge public.school_charges; receipt public.school_receipts; item jsonb; amount_value numeric;total_value numeric:=0;fingerprint text;director boolean;begin
 select * into child from public.students where id=p_student_id;
 director:=public.may_manage_student(p_student_id);
 if child.id is null or not(director or public.may_teacher_write(p_student_id)) then raise exception 'No tienes permiso para corroborar este cobro.'; end if;
 if p_receipt_id is null or coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items) not between 1 and 60 then raise exception 'Selecciona entre 1 y 60 cuotas.'; end if;
 if p_method is null or p_method not in ('cash','transfer','qr') or coalesce(length(trim(p_reference)),0) not between 3 and 160 then raise exception 'Selecciona el método y una referencia válida.'; end if;
 if p_method='qr' and p_qr_reviewed is distinct from true then raise exception 'Confirma que verificaste el pago QR en la cuenta de la institución.'; end if;
 if p_method in ('qr','transfer') and exists(select 1 from public.school_receipts where school_id=child.school_id and payment_method=p_method and lower(trim(reference))=lower(trim(p_reference)) and id<>p_receipt_id) then raise exception 'Esta referencia bancaria ya tiene un recibo. Revisa el registro antes de cobrar otra vez.'; end if;
 if not director and p_invoice is distinct from '{}'::jsonb then raise exception 'Los datos de facturación los registra Dirección.'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'chargeId') from jsonb_array_elements(p_items)) then raise exception 'No repitas una cuota en el cobro.'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('student',p_student_id,'items',(select jsonb_agg(value order by value->>'chargeId') from jsonb_array_elements(p_items)),'method',p_method,'reference',trim(p_reference),'invoice',coalesce(p_invoice,'{}'::jsonb))::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtext(p_receipt_id::text));
 select * into receipt from public.school_receipts where id=p_receipt_id;
 if receipt.id is not null then
  if receipt.school_id<>child.school_id or receipt.student_id<>child.id or receipt.request_hash<>fingerprint then raise exception 'Esta referencia de operación ya se usó para otro cobro.'; end if;
  return receipt.id;
 end if;
 -- Bloquear siempre en el mismo orden y comprobar todos los importes antes de escribir.
 for item in select value from jsonb_array_elements(p_items) order by value->>'chargeId' loop
  select * into charge from public.school_charges where id=(item->>'chargeId')::uuid for update;
  if charge.id is null or charge.student_id<>child.id or charge.school_id<>child.school_id or charge.status in ('paid','cancelled') then raise exception 'Una cuota cambió o no corresponde a este estudiante. Actualiza y revisa el cobro.'; end if;
  if not director and (charge.academic_request_id is null or not exists(select 1 from public.academic_requests r where r.id=charge.academic_request_id and r.status='approved')) then raise exception 'El docente solo puede corroborar cobros de actividades aprobadas de su aula.'; end if;
  amount_value:=(item->>'amount')::numeric;
  if amount_value is null or amount_value<=0 or amount_value<>round(amount_value,2) or amount_value>charge.amount-charge.paid_amount then raise exception 'El abono debe ser positivo y no superar el saldo pendiente.'; end if;
  total_value:=total_value+amount_value;
 end loop;
 insert into public.school_receipts(id,school_id,student_id,total,payment_method,reference,request_hash,recorded_by)
 values(p_receipt_id,child.school_id,child.id,total_value,p_method,trim(p_reference),fingerprint,aulanexo_private.actor_uid());
 for item in select value from jsonb_array_elements(p_items) order by value->>'chargeId' loop
  insert into public.school_payments(charge_id,amount,payment_method,verification_state,created_by,reference,receipt_id)
  values((item->>'chargeId')::uuid,(item->>'amount')::numeric,p_method,'verified',aulanexo_private.actor_uid(),trim(p_reference),p_receipt_id);
 end loop;
 if p_invoice is not null and p_invoice<>'{}'::jsonb then perform aulanexo_private.create_invoice_request(p_receipt_id,p_invoice); end if;
 return p_receipt_id;
exception when unique_violation then raise exception 'Esta referencia bancaria ya fue registrada. Actualiza el registro de recibos.';
end $$;
create or replace function public.record_school_payment(p_charge_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare charge public.school_charges; details jsonb:='{}';begin
 select * into charge from public.school_charges where id=p_charge_id for update;
 if charge.id is null or not public.may_manage_student(charge.student_id) then raise exception 'No tienes permiso para registrar este pago.'; end if;
 if p_method is null or p_method not in ('cash','transfer') or length(trim(coalesce(p_reference,'')))=0 then raise exception 'Indica medio de pago y referencia. El QR se corrobora desde Caja.'; end if;
 if charge.status='paid' then return; end if;
 if charge.invoice_name<>'' then details:=jsonb_build_object('invoiceName',charge.invoice_name,'invoiceNit',charge.invoice_nit,'invoicePhone',charge.invoice_phone); end if;
 perform public.checkout_school_payment(gen_random_uuid(),charge.student_id,jsonb_build_array(jsonb_build_object('chargeId',charge.id,'amount',charge.amount-charge.paid_amount)),p_method,p_reference,details,false);
end $$;
alter function public.request_invoice(uuid,jsonb) rename to request_invoice_details;
alter function public.request_invoice_details(uuid,jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.request_invoice_details(uuid,jsonb) from public,anon,authenticated;
create function public.request_invoice(p_charge_id uuid,p_details jsonb) returns void language plpgsql security definer set search_path='' as $$
declare receipt uuid;begin
 perform aulanexo_private.request_invoice_details(p_charge_id,p_details);
 for receipt in select distinct receipt_id from public.school_payments where charge_id=p_charge_id and receipt_id is not null and verification_state='verified' loop
  perform aulanexo_private.create_invoice_request(receipt,p_details);
 end loop;
end $$;
create function public.request_receipt_invoice(p_receipt_id uuid,p_details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare receipt public.school_receipts;begin
 select * into receipt from public.school_receipts where id=p_receipt_id;
 if receipt.id is null or not(public.may_manage_student(receipt.student_id) or public.is_verified_guardian(receipt.student_id)) then raise exception 'No tienes acceso a este recibo.'; end if;
 return aulanexo_private.create_invoice_request(receipt.id,p_details);
end $$;
create function public.mark_invoice_issued(p_id uuid,p_number text) returns void language plpgsql security definer set search_path='' as $$
declare invoice public.invoice_requests;begin
 select * into invoice from public.invoice_requests where id=p_id for update;
 if invoice.id is null or not public.may_manage_student(invoice.student_id) then raise exception 'Solo Dirección puede registrar la factura emitida.'; end if;
 if length(trim(coalesce(p_number,''))) not between 1 and 80 then raise exception 'Indica el número de la factura emitida manualmente.'; end if;
 if invoice.status='issued' then
  if invoice.invoice_number<>trim(p_number) then raise exception 'La factura ya tiene otro número de emisión.'; end if; return;
 end if;
 update public.invoice_requests set status='issued',invoice_number=trim(p_number),issued_at=now(),issued_by=aulanexo_private.actor_uid() where id=p_id;
end $$;

create table aulanexo_private.payment_connections (
 connection_key text primary key,school_id uuid unique references public.schools(id) on delete cascade,provider text not null,
 account_reference text not null default '',environment text not null default 'test' check(environment in ('test','production')),
 secret_id uuid,updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id)
);
revoke all on aulanexo_private.payment_connections from public,anon,authenticated;
create function public.payment_connection_status(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (case when p_school_id is null then public.is_platform_admin() and aulanexo_private.is_support_owner() else public.has_school_role(p_school_id,array['director']) end) then raise exception 'No tienes permiso para administrar esta conexión bancaria.'; end if;
 return coalesce((select jsonb_build_object('provider',provider,'accountReference',account_reference,'environment',environment,'credentialsStored',secret_id is not null,'integrationReady',false,'updatedAt',updated_at) from aulanexo_private.payment_connections where connection_key=coalesce(p_school_id::text,'platform')),jsonb_build_object('provider','','accountReference','','environment','test','credentialsStored',false,'integrationReady',false));
end $$;
create function public.save_payment_connection(p_school_id uuid,p_provider text,p_account_reference text,p_environment text,p_credentials jsonb default null) returns void language plpgsql security definer set search_path='' as $$
declare existing aulanexo_private.payment_connections;secret_value uuid;begin
 if not (case when p_school_id is null then public.is_platform_admin() and aulanexo_private.is_support_owner() else public.has_school_role(p_school_id,array['director']) end) then raise exception 'No tienes permiso para administrar esta conexión bancaria.'; end if;
 if length(trim(coalesce(p_provider,''))) not between 2 and 100 or length(coalesce(p_account_reference,''))>160 or p_environment not in ('test','production') then raise exception 'Completa proveedor, cuenta o comercio y ambiente.'; end if;
 perform pg_advisory_xact_lock(hashtext('payment-connection-'||coalesce(p_school_id::text,'platform')));
 select * into existing from aulanexo_private.payment_connections where connection_key=coalesce(p_school_id::text,'platform') for update;
 secret_value:=existing.secret_id;
 if p_credentials is not null then
  if jsonb_typeof(p_credentials)<>'object' or p_credentials='{}'::jsonb or octet_length(p_credentials::text)>20000 then raise exception 'Las credenciales deben ser un objeto JSON con los campos indicados por tu proveedor.'; end if;
  if not exists(select 1 from pg_namespace where nspname='vault') then raise exception 'El almacén seguro de credenciales todavía no está disponible.'; end if;
  if secret_value is null then
   execute 'select vault.create_secret($1,$2,$3)' into secret_value using p_credentials::text,'micole-payment-'||coalesce(p_school_id::text,'platform'),'Credenciales privadas de cobro institucional';
  else execute 'select vault.update_secret($1,$2)' using secret_value,p_credentials::text; end if;
 elsif existing.connection_key is not null and (existing.provider<>trim(p_provider) or existing.environment<>p_environment or existing.account_reference<>trim(p_account_reference)) then
  raise exception 'Al cambiar proveedor, cuenta o ambiente debes volver a configurar las credenciales.';
 end if;
 insert into aulanexo_private.payment_connections(connection_key,school_id,provider,account_reference,environment,secret_id,updated_by)
 values(coalesce(p_school_id::text,'platform'),p_school_id,trim(p_provider),trim(p_account_reference),p_environment,secret_value,auth.uid())
 on conflict(connection_key) do update set provider=excluded.provider,account_reference=excluded.account_reference,environment=excluded.environment,secret_id=excluded.secret_id,updated_by=excluded.updated_by,updated_at=now();
end $$;

create table aulanexo_private.payment_links (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null references public.students(id),
 token_hash text not null unique,items jsonb not null,expires_at timestamptz not null default now()+interval '48 hours',
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),revoked_at timestamptz
);
revoke all on aulanexo_private.payment_links from public,anon,authenticated;
create function public.create_payment_link(p_student_id uuid,p_items jsonb) returns text language plpgsql security definer set search_path='' as $$
declare child public.students;item jsonb;charge public.school_charges;token text;stored_items jsonb:='[]'::jsonb;begin
 select * into child from public.students where id=p_student_id;
 if child.id is null or not(public.may_manage_student(child.id) or public.is_verified_guardian(child.id) or public.may_teacher_write(child.id)) then raise exception 'No tienes acceso a estos cobros.'; end if;
 if coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items) not between 1 and 60 then raise exception 'Selecciona las cuotas del enlace.'; end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'chargeId') from jsonb_array_elements(p_items)) then raise exception 'No repitas cuotas.'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into charge from public.school_charges where id=(item->>'chargeId')::uuid;
  if charge.id is null or charge.student_id<>child.id or charge.status in ('paid','cancelled') or item->>'amount' is null or (item->>'amount')::numeric<=0 or (item->>'amount')::numeric<>round((item->>'amount')::numeric,2) or (item->>'amount')::numeric>charge.amount-charge.paid_amount then raise exception 'Revisa los saldos de las cuotas seleccionadas.'; end if;
  if not(public.may_manage_student(child.id) or public.is_verified_guardian(child.id)) and charge.academic_request_id is null then raise exception 'Los docentes solo comparten cobros de actividades.'; end if;
  stored_items:=stored_items||jsonb_build_array(jsonb_build_object('chargeId',charge.id,'amount',(item->>'amount')::numeric,'startingPaidAmount',charge.paid_amount));
 end loop;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into aulanexo_private.payment_links(school_id,student_id,token_hash,items,created_by) values(child.school_id,child.id,encode(sha256(convert_to(token,'UTF8')),'hex'),stored_items,aulanexo_private.actor_uid());
 return token;
end $$;
create function public.payment_link_context(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare link aulanexo_private.payment_links;item jsonb;charge public.school_charges;rows jsonb:='[]';total numeric:=0;changed boolean:=false;paid boolean:=true;begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'El enlace de pago no es válido.'; end if;
 select * into link from aulanexo_private.payment_links where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if link.id is null or link.revoked_at is not null or link.expires_at<=now() then raise exception 'El enlace venció o fue revocado. Solicita uno nuevo.'; end if;
 for item in select value from jsonb_array_elements(link.items) loop
  select * into charge from public.school_charges where id=(item->>'chargeId')::uuid and student_id=link.student_id and school_id=link.school_id;
  if charge.id is null or charge.status='cancelled' then changed:=true;continue;end if;
  if charge.paid_amount-coalesce((item->>'startingPaidAmount')::numeric,0)>=(item->>'amount')::numeric or charge.status='paid' then continue; end if;
  paid:=false;
  if charge.paid_amount<>coalesce((item->>'startingPaidAmount')::numeric,0) or charge.amount-charge.paid_amount < (item->>'amount')::numeric then changed:=true; end if;
  if charge.status<>'paid' then rows:=rows||jsonb_build_array(jsonb_build_object('concept',charge.concept,'amount',(item->>'amount')::numeric));total:=total+(item->>'amount')::numeric;end if;
 end loop;
 return jsonb_build_object('schoolName',(select name from public.schools where id=link.school_id),'logoUrl',(select logo_url from public.schools where id=link.school_id),'studentName',(select first_name||' '||left(last_name,1)||'.' from public.students where id=link.student_id),
 'items',case when changed then '[]'::jsonb else rows end,'total',case when changed then 0 else total end,'status',case when changed then 'changed' when paid then 'paid' else 'pending' end,'expiresAt',link.expires_at,'qrAvailable',false);
end $$;

-- Incorporar abonos al reporte sin cambiar los importes emitidos ni el ledger.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.financial_report(uuid,date,date,uuid,uuid)'::regprocedure);
 definition:=replace(definition,'''amount'',c.amount,''status'',case','''amount'',c.amount,''paidAmount'',c.paid_amount,''status'',case');
 execute definition;
end $$;
create trigger audit_receipt after insert on public.school_receipts for each row execute function aulanexo_private.capture_audit();
create trigger audit_invoice_request after insert or update on public.invoice_requests for each row execute function aulanexo_private.capture_audit();
revoke all on function public.checkout_school_payment(uuid,uuid,jsonb,text,text,jsonb,boolean),public.request_receipt_invoice(uuid,jsonb),public.mark_invoice_issued(uuid,text),public.request_invoice(uuid,jsonb),public.payment_connection_status(uuid),public.save_payment_connection(uuid,text,text,text,jsonb),public.create_payment_link(uuid,jsonb),public.payment_link_context(text) from public,anon;
grant execute on function public.checkout_school_payment(uuid,uuid,jsonb,text,text,jsonb,boolean),public.request_receipt_invoice(uuid,jsonb),public.mark_invoice_issued(uuid,text),public.request_invoice(uuid,jsonb),public.payment_connection_status(uuid),public.save_payment_connection(uuid,text,text,text,jsonb),public.create_payment_link(uuid,jsonb),public.payment_link_context(text) to authenticated;
grant execute on function public.payment_link_context(text) to anon;

-- Agregación con RLS para registros financieros completos, sin el límite de filas REST.
create function public.finance_register() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id) from public.school_receipts r),'[]'::jsonb),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from public.invoice_requests i),'[]'::jsonb));
$$;
revoke all on function public.finance_register() from public,anon;
grant execute on function public.finance_register() to authenticated;

create function public.teacher_activity_charges() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'school_id',c.school_id,'student_id',c.student_id,'concept',c.concept,'due_date',c.due_date,'amount',c.amount,'status',c.status,'paid_amount',c.paid_amount,'minimum_access_ratio',c.minimum_access_ratio,'academic_request_id',c.academic_request_id) order by c.due_date,c.id),'[]'::jsonb)
 from public.school_charges c join public.academic_requests r on r.id=c.academic_request_id
 where r.status='approved' and not public.is_platform_admin() and public.may_teacher_write(c.student_id) and aulanexo_private.in_support_school(c.school_id);
$$;
revoke all on function public.teacher_activity_charges() from public,anon;
grant execute on function public.teacher_activity_charges() to authenticated;

-- Un descuento no reescribe el importe de una cuota que ya recibió dinero.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.adjust_plan_discount(uuid,numeric,date,date)'::regprocedure);
 definition:=replace(definition,'and status not in (''paid'',''cancelled'')','and status not in (''paid'',''cancelled'') and paid_amount=0');
 execute definition;
end $$;

create function public.receipt_line_items(p_receipt_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare receipt public.school_receipts;begin
 select * into receipt from public.school_receipts where id=p_receipt_id;
 if receipt.id is null or not aulanexo_private.in_support_school(receipt.school_id) or public.is_platform_admin() or not(public.may_manage_student(receipt.student_id) or public.is_verified_guardian(receipt.student_id) or (receipt.recorded_by=aulanexo_private.actor_uid() and public.may_teacher_write(receipt.student_id))) then raise exception 'No tienes acceso a este recibo.';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('chargeId',c.id,'concept',c.concept,'amount',p.amount) order by c.due_date,c.id) from public.school_payments p join public.school_charges c on c.id=p.charge_id where p.receipt_id=receipt.id and p.verification_state='verified'),'[]'::jsonb);
end $$;
revoke all on function public.receipt_line_items(uuid) from public,anon;
grant execute on function public.receipt_line_items(uuid) to authenticated;
create or replace function public.finance_register() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',public.receipt_line_items(r.id)) order by r.created_at desc,r.id) from public.school_receipts r),'[]'::jsonb),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id) from public.invoice_requests i),'[]'::jsonb));
$$;
