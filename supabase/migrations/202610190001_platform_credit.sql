-- Initial funding is a prepayment for monthly licenses, never an activation fee.
-- No client role receives INSERT/UPDATE/DELETE access to credit accounts or ledger.
alter table public.schools add column platform_enabled boolean not null default false,add column activation_enabled boolean not null default false;
create table aulanexo_private.platform_billing_settings (
 singleton boolean primary key default true check(singleton), activation_enabled boolean not null default false
);
insert into aulanexo_private.platform_billing_settings default values;
create table aulanexo_private.platform_credit_accounts (
 school_id uuid primary key references public.schools(id), initial_paid_at timestamptz,
 created_at timestamptz not null default now()
);
create table aulanexo_private.platform_credit_keys (
 singleton boolean primary key default true check(singleton), secret_id uuid not null
);
create table aulanexo_private.platform_credit_ledger (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 school_id uuid not null references public.schools(id), kind text not null check(kind in ('funding','license')),
 source_id uuid not null references public.platform_charges(id), payload bytea not null,
 previous_mac text not null, mac text not null, created_at timestamptz not null default now(),
 unique(kind,source_id)
);
revoke all on aulanexo_private.platform_billing_settings,aulanexo_private.platform_credit_accounts,aulanexo_private.platform_credit_keys,aulanexo_private.platform_credit_ledger from public,anon,authenticated,service_role;
create function aulanexo_private.immutable_credit_ledger() returns trigger language plpgsql set search_path='' as $$begin
 raise exception 'Los movimientos de crédito son inmutables.';
end $$;
create trigger immutable_credit_ledger before update or delete on aulanexo_private.platform_credit_ledger for each row execute function aulanexo_private.immutable_credit_ledger();

-- The key is created lazily in Vault, within the first verified payment transaction.
create function aulanexo_private.credit_key() returns text language plpgsql security definer set search_path='' as $$
declare secret uuid;value text;begin
 select secret_id into secret from aulanexo_private.platform_credit_keys;
 if secret is null then
  perform pg_advisory_xact_lock(hashtext('micole-credit-key'));
  select secret_id into secret from aulanexo_private.platform_credit_keys;
 end if;
 if secret is null then
  execute 'select encode(extensions.gen_random_bytes(32),''hex'')' into value;
  execute 'select vault.create_secret($1,$2,$3)' into secret using value,'micole-credit-ledger','Clave privada de cifrado y autenticación de créditos';
  insert into aulanexo_private.platform_credit_keys(secret_id) values(secret);
 end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where id=$1' into value using secret;
 if value is null or length(value)<32 then raise exception 'No se pudo verificar el registro de créditos.';end if;
 return value;
end $$;
create function aulanexo_private.credit_payload(p_row aulanexo_private.platform_credit_ledger) returns jsonb language plpgsql security definer set search_path='' as $$
declare key text;expected text;result jsonb;begin
 key:=aulanexo_private.credit_key();
 execute 'select encode(extensions.hmac(convert_to($1,''UTF8''),convert_to($2,''UTF8''),''sha256''),''hex'')' into expected
 using p_row.school_id::text||':'||p_row.kind||':'||p_row.source_id::text||':'||p_row.previous_mac||':'||encode(p_row.payload,'hex'),key;
 if expected is distinct from p_row.mac then raise exception 'No se pudo verificar el registro de créditos.';end if;
 execute 'select extensions.pgp_sym_decrypt($1,$2)::jsonb' into result using p_row.payload,key;
 return result;
end $$;
create function aulanexo_private.credit_balance(p_school uuid) returns bigint language plpgsql security definer set search_path='' as $$
declare row aulanexo_private.platform_credit_ledger;begin
 select * into row from aulanexo_private.platform_credit_ledger where school_id=p_school order by sequence desc limit 1;
 if row.id is null then return 0;end if;
 return (aulanexo_private.credit_payload(row)->>'balanceCents')::bigint;
end $$;
create function aulanexo_private.append_credit(p_school uuid,p_kind text,p_source uuid,p_delta bigint) returns void language plpgsql security definer set search_path='' as $$
declare previous text:='';balance bigint;cipher bytea;signature text;key text;begin
 perform pg_advisory_xact_lock(hashtext('micole-credit-'||p_school::text));
 if exists(select 1 from aulanexo_private.platform_credit_ledger where kind=p_kind and source_id=p_source) then return;end if;
 balance:=aulanexo_private.credit_balance(p_school)+p_delta;
 if balance<0 or p_delta=0 then raise exception 'El crédito disponible no cubre esta operación.';end if;
 select mac into previous from aulanexo_private.platform_credit_ledger where school_id=p_school order by sequence desc limit 1;
 previous:=coalesce(previous,'');key:=aulanexo_private.credit_key();
 execute 'select extensions.pgp_sym_encrypt($1,$2,''cipher-algo=aes256,compress-algo=0'')' into cipher
 using jsonb_build_object('deltaCents',p_delta,'balanceCents',balance)::text,key;
 execute 'select encode(extensions.hmac(convert_to($1,''UTF8''),convert_to($2,''UTF8''),''sha256''),''hex'')' into signature
 using p_school::text||':'||p_kind||':'||p_source::text||':'||previous||':'||encode(cipher,'hex'),key;
 insert into aulanexo_private.platform_credit_ledger(school_id,kind,source_id,payload,previous_mac,mac) values(p_school,p_kind,p_source,cipher,previous,signature);
end $$;

alter table public.platform_charges add column kind text,add column credit_applied numeric(12,2) not null default 0 check(credit_applied>=0 and credit_applied<=amount);
update public.platform_charges set kind=case when student_id is null then 'license' else 'activation' end;
alter table public.platform_charges alter column kind set not null;
alter table public.platform_charges add constraint platform_charge_kind check(kind in ('activation','license','credit_topup'));
drop index public.platform_one_monthly_per_school;
create unique index platform_one_initial_funding on public.platform_charges(school_id) where kind='credit_topup';
create table aulanexo_private.platform_license_assessments (
 student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 period text not null,charge_id uuid not null references public.platform_charges(id),primary key(student_id,period)
);
revoke all on aulanexo_private.platform_license_assessments from public,anon,authenticated,service_role;
-- Preserve already issued monthly snapshots; do not bill those same licenses twice.
insert into aulanexo_private.platform_license_assessments(student_id,school_id,period,charge_id)
 select s.id,c.school_id,c.period,c.id from public.platform_charges c
 cross join lateral (select id from public.students s where s.school_id=c.school_id and s.enrolled_at<(c.period||'-01')::date+interval '1 month' order by s.enrolled_at,s.id limit coalesce(c.license_count,0)) s
 where c.kind='license' and c.status<>'cancelled' on conflict do nothing;

create function public.platform_school_enabled(p_school_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or (aulanexo_private.is_support_owner() and aulanexo_private.support_id() is not null and aulanexo_private.in_support_school(p_school_id)) or exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=p_school_id and initial_paid_at is not null);
$$;
revoke all on function public.platform_school_enabled(uuid) from public,anon;
grant execute on function public.platform_school_enabled(uuid) to authenticated;
create function aulanexo_private.apply_credit_to_license(p_charge uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.platform_charges;available bigint;debit bigint;begin
 select school_id into c.school_id from public.platform_charges where id=p_charge;
 perform pg_advisory_xact_lock(hashtext('micole-credit-'||c.school_id::text));
 select * into c from public.platform_charges where id=p_charge for update;
 if c.kind<>'license' or c.status in ('paid','cancelled') or c.credit_applied>0 or exists(select 1 from aulanexo_private.bank_qr_allocations where platform_charge_id=c.id and reserved) then return;end if;
 if not exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=c.school_id and initial_paid_at is not null) then return;end if;
 available:=aulanexo_private.credit_balance(c.school_id);debit:=least(available,(c.amount*100)::bigint);
 if debit<=0 then return;end if;
 perform aulanexo_private.append_credit(c.school_id,'license',c.id,-debit);
 update public.platform_charges set credit_applied=debit/100.0,status=case when debit=(amount*100)::bigint then 'paid' else status end where id=c.id;
end $$;
create function aulanexo_private.credit_charge_created() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.kind='license' then perform aulanexo_private.apply_credit_to_license(new.id);end if;return new;
end $$;
create function aulanexo_private.classify_platform_charge() returns trigger language plpgsql security definer set search_path='' as $$declare expected numeric;begin
 if TG_OP='INSERT' then
  new.kind:=coalesce(new.kind,case when new.student_id is null then 'license' else 'activation' end);
  if new.kind='activation' and not(select activation_enabled from aulanexo_private.platform_billing_settings) then return null;end if;
  if new.credit_applied<>0 then raise exception 'El crédito solo se aplica desde el servidor.';end if;
 else
  if new.kind is distinct from old.kind or new.school_id is distinct from old.school_id or new.student_id is distinct from old.student_id or new.period is distinct from old.period then raise exception 'La obligación emitida conserva su institución y concepto de cobro.';end if;
  if new.credit_applied is distinct from old.credit_applied then
   select -(aulanexo_private.credit_payload(l)->>'deltaCents')::numeric/100 into expected from aulanexo_private.platform_credit_ledger l where l.kind='license' and l.source_id=new.id;
   if new.credit_applied is distinct from expected then raise exception 'El crédito solo se aplica desde el servidor.';end if;
  end if;
  if old.credit_applied>0 and (new.status='cancelled' or new.amount<>old.amount or new.credit_applied<old.credit_applied) then raise exception 'Una cuota cubierta con crédito no puede alterarse.';end if;
  if old.kind='credit_topup' and new.amount<>old.amount then raise exception 'El adelanto inicial conserva su importe de Bs 500.';end if;
 end if;
 return new;
end $$;
-- Issuance and payment changes use checked RPCs, never client table edits.
revoke insert,update,delete on public.platform_charges from authenticated,anon,service_role;
create trigger classify_platform_charge before insert or update on public.platform_charges for each row execute function aulanexo_private.classify_platform_charge();
create trigger credit_charge_created after insert on public.platform_charges for each row execute function aulanexo_private.credit_charge_created();

create function aulanexo_private.issue_monthly_licenses(p_school uuid,p_period text) returns integer language plpgsql security definer set search_path='' as $$
declare school record;children uuid[];charge uuid;rate numeric;count_value integer;issued integer:=0;cutoff date;begin
 if coalesce(p_period,'') !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Indica un período válido.';end if;
 cutoff:=least((now() at time zone 'America/La_Paz')::date,((p_period||'-01')::date+interval '1 month - 1 day')::date);
 for school in select s.id from public.schools s join aulanexo_private.platform_credit_accounts a on a.school_id=s.id where (p_school is null or s.id=p_school) and a.initial_paid_at is not null and s.status='active' order by s.id loop
  perform pg_advisory_xact_lock(hashtext('micole-credit-'||school.id::text));
  select array_agg(s.id order by s.id) into children from public.students s where s.school_id=school.id and s.status='active' and s.enrolled_at<=cutoff and not exists(select 1 from aulanexo_private.platform_license_assessments b where b.student_id=s.id and b.period=p_period);
  count_value:=coalesce(cardinality(children),0);if count_value=0 then continue;end if;
  rate:=aulanexo_private.platform_fee(school.id,'monthly');
  insert into public.platform_charges(school_id,kind,concept,period,amount,license_count,unit_amount) values(school.id,'license','Licencia '||p_period||' · '||count_value||' estudiantes',p_period,count_value*rate,count_value,rate) returning id into charge;
  insert into aulanexo_private.platform_license_assessments(student_id,school_id,period,charge_id) select unnest(children),school.id,p_period,charge;
  issued:=issued+1;
 end loop;return issued;
end $$;
create function aulanexo_private.fund_platform_credit() returns trigger language plpgsql security definer set search_path='' as $$
declare c record;begin
 if new.kind<>'credit_topup' or new.status<>'paid' or old.status='paid' then return new;end if;
 perform pg_advisory_xact_lock(hashtext('micole-credit-'||new.school_id::text));
 if new.amount<>500 or not exists(
  select 1 from aulanexo_private.bank_qr_allocations a join aulanexo_private.bank_qr_intents i on i.id=a.intent_id join aulanexo_private.bank_connections b on b.id=i.connection_id
  join public.platform_payments p on p.charge_id=new.id and p.reference=i.bank_transaction_id
  where a.platform_charge_id=new.id and a.amount=500 and i.kind='platform' and i.school_id=new.school_id and i.status='paid' and i.verified_at is not null and b.environment='production' and p.amount=500
 ) then raise exception 'El crédito inicial requiere un pago de Bs 500 confirmado por el banco en producción.';end if;
 perform aulanexo_private.append_credit(new.school_id,'funding',new.id,50000);
 update aulanexo_private.platform_credit_accounts set initial_paid_at=coalesce(initial_paid_at,now()) where school_id=new.school_id;
 update public.schools set platform_enabled=true where id=new.school_id;
 if not(select activation_enabled from aulanexo_private.platform_billing_settings) then update public.students set status='active' where school_id=new.school_id and status='pending';end if;
 for c in select id from public.platform_charges where school_id=new.school_id and kind='license' and status not in ('paid','cancelled') order by period,created_at,id loop perform aulanexo_private.apply_credit_to_license(c.id);end loop;
 perform aulanexo_private.issue_monthly_licenses(new.school_id,to_char(now() at time zone 'America/La_Paz','YYYY-MM'));
 return new;
end $$;
create trigger fund_platform_credit after update of status on public.platform_charges for each row execute function aulanexo_private.fund_platform_credit();
create function aulanexo_private.create_platform_credit_account() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into aulanexo_private.platform_credit_accounts(school_id) values(new.id);
 insert into public.platform_charges(school_id,kind,concept,period,amount) values(new.id,'credit_topup','Crédito inicial para licencias MiCole',to_char(now() at time zone 'America/La_Paz','YYYY-MM'),500);
 return new;
end $$;
create trigger create_platform_credit_account after insert on public.schools for each row execute function aulanexo_private.create_platform_credit_account();
insert into aulanexo_private.platform_credit_accounts(school_id) select id from public.schools;
insert into public.platform_charges(school_id,kind,concept,period,amount) select id,'credit_topup','Crédito inicial para licencias MiCole',to_char(now() at time zone 'America/La_Paz','YYYY-MM'),500 from public.schools;

create function public.platform_credit_account(p_school_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.platform_credit_accounts;history jsonb;balance bigint;begin
 if not (public.is_platform_admin() or (aulanexo_private.in_support_school(p_school_id) and public.has_school_role(p_school_id,array['director']))) then raise exception 'Solo Dirección y superadmin pueden consultar este crédito.';end if;
 select * into a from aulanexo_private.platform_credit_accounts where school_id=p_school_id;if a.school_id is null then raise exception 'Selecciona una institución válida.';end if;
 balance:=aulanexo_private.credit_balance(p_school_id);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'chargeId',r.source_id,'createdAt',r.created_at,'amount',(aulanexo_private.credit_payload(r)->>'deltaCents')::numeric/100,'balance',(aulanexo_private.credit_payload(r)->>'balanceCents')::numeric/100) order by r.sequence desc),'[]') into history from (select * from aulanexo_private.platform_credit_ledger where school_id=p_school_id order by sequence desc limit 100) r;
 return jsonb_build_object('schoolId',p_school_id,'initialAmount',500,'initialPaid',a.initial_paid_at is not null,'initialPaidAt',a.initial_paid_at,'balance',balance/100.0,'history',history,'chargeId',(select id from public.platform_charges where school_id=p_school_id and kind='credit_topup'),'chargeStatus',(select status from public.platform_charges where school_id=p_school_id and kind='credit_topup'));
end $$;
revoke all on function public.platform_credit_account(uuid) from public,anon;
grant execute on function public.platform_credit_account(uuid) to authenticated;

-- Activation is off initially; the owner can enable it later without rewriting charges.
create or replace function aulanexo_private.platform_fee(p_school uuid,p_kind text) returns numeric language sql stable security definer set search_path='' as $$
 select case when p_kind='activation' then case when b.activation_enabled then coalesce(s.activation_fee,g.activation_fee) else 0 end else coalesce(s.monthly_license_fee,g.monthly_license_fee) end
 from aulanexo_private.platform_tariffs g cross join aulanexo_private.platform_billing_settings b left join aulanexo_private.platform_tariffs s on s.school_id=p_school where g.scope_key='global';
$$;
create or replace function public.platform_tariffs(p_school_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inherited boolean;stamp timestamptz;begin
 if p_school_id is not null and not(public.is_platform_admin() or (aulanexo_private.in_support_school(p_school_id) and public.has_school_role(p_school_id,array['director','teacher','guardian']))) then raise exception 'No tienes permiso para consultar estas tarifas.';end if;
 inherited:=p_school_id is not null and not exists(select 1 from aulanexo_private.platform_tariffs where school_id=p_school_id);
 select updated_at into stamp from aulanexo_private.platform_tariffs where scope_key=case when inherited or p_school_id is null then 'global' else p_school_id::text end;
 return jsonb_build_object('schoolId',p_school_id,'activationFee',aulanexo_private.platform_fee(p_school_id,'activation'),'configuredActivationFee',(select coalesce(s.activation_fee,g.activation_fee) from aulanexo_private.platform_tariffs g left join aulanexo_private.platform_tariffs s on s.school_id=p_school_id where g.scope_key='global'),'activationEnabled',(select activation_enabled from aulanexo_private.platform_billing_settings),'initialCredit',500,'monthlyLicenseFee',aulanexo_private.platform_fee(p_school_id,'monthly'),'inherited',inherited,'updatedAt',stamp);
end $$;
create function public.set_platform_activation(p_enabled boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_platform_admin() or not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede cambiar la activación.';end if;
 if p_enabled is null or length(trim(coalesce(p_reason,''))) not between 5 and 500 then raise exception 'Indica el motivo del cambio.';end if;
 perform pg_advisory_xact_lock(hashtext('micole-platform-tariffs'));
 update aulanexo_private.platform_billing_settings set activation_enabled=p_enabled;
 update public.schools set activation_enabled=p_enabled;
 insert into public.audit_events(actor_id,actor_name,entity,entity_id,action,summary) values(auth.uid(),'Propietario MiCole','platform_billing_settings',auth.uid(),'UPDATE',jsonb_build_object('name','Activación por estudiante','enabled',p_enabled,'reason',trim(p_reason)));
end $$;
revoke all on function public.set_platform_activation(boolean,text) from public,anon;
grant execute on function public.set_platform_activation(boolean,text) to authenticated;

-- Platform QR amounts are the balance after credit; the issued amount never shrinks.
do $$declare body text;begin
 body:=pg_get_functiondef('aulanexo_private.reserve_bank_qr(text,uuid,uuid,jsonb,jsonb,uuid,uuid)'::regprocedure);
 body:=replace(body,'amount_value<>pc.amount','amount_value<>pc.amount-pc.credit_applied');
 body:=replace(body,'''amount'',pc.amount,','''amount'',pc.amount-pc.credit_applied,');execute body;
 body:=pg_get_functiondef('aulanexo_private.apply_baneco_payment(uuid)'::regprocedure);
 body:=replace(body,'pc.amount<>a.amount','pc.amount-pc.credit_applied<>a.amount');
 body:=replace(body,'values(pc.id,pc.amount,','values(pc.id,a.amount,');execute body;
 -- Partial credit is not an editable/manual cash receipt.
 body:=pg_get_functiondef('public.record_platform_payment(uuid,text,text)'::regprocedure);
 body:=replace(body,'begin',E'begin\n if exists(select 1 from public.platform_charges where id=p_charge_id and (kind=''credit_topup'' or credit_applied>0)) then raise exception ''Este cobro requiere confirmación bancaria.'';end if;');execute body;
 -- Replace the old platform loop while retaining the existing school tuition engine.
 body:=pg_get_functiondef('aulanexo_private.run_billing_cycle_charges()'::regprocedure);
 body:=regexp_replace(body,'for sch in select id from public.schools.*?end loop;',E'platform_count:=aulanexo_private.issue_monthly_licenses(null,period_key);','ns');execute body;
end $$;
create or replace function public.generate_platform_invoice(p_school_id uuid,p_period text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma puede generar liquidaciones.';end if;
 perform aulanexo_private.issue_monthly_licenses(p_school_id,p_period);
end $$;
create function aulanexo_private.license_on_enrollment() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='active' and (TG_OP='INSERT' or old.status is distinct from new.status) then perform aulanexo_private.issue_monthly_licenses(new.school_id,to_char(now() at time zone 'America/La_Paz','YYYY-MM'));end if;return new;
end $$;
create trigger license_on_enrollment after insert or update of status on public.students for each row execute function aulanexo_private.license_on_enrollment();
create function aulanexo_private.require_platform_credit() returns trigger language plpgsql set search_path='' as $$begin
 if auth.uid() is not null and (TG_OP='INSERT' or new.status='active') and not public.platform_school_enabled(new.school_id) then raise exception 'La institución debe completar el crédito inicial de Bs 500 antes de habilitar estudiantes.';end if;return new;
end $$;
create trigger require_platform_credit before insert or update of status on public.students for each row execute function aulanexo_private.require_platform_credit();

-- Existing unpaid activations retain their historical amount, but no longer gate access.
-- School access is funded by the verified institution prepayment instead.
do $$declare f record;body text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','aulanexo_private') and p.proname in ('may_access_student','may_use_student','family_access','set_student_status','record_school_payment','enroll_student_with_plan','review_family_intake','complete_student_profile') loop
  body:=pg_get_functiondef(f.oid);
  body:=replace(body,$old$student_id=p_student_id and status$old$,$new$student_id=p_student_id and kind='activation' and (select activation_enabled from aulanexo_private.platform_billing_settings) and status$new$);
  execute body;
 end loop;
end $$;
-- Private entry points stay inaccessible even to service_role; service RPCs have their own checks.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aulanexo_private' and p.proname in ('immutable_credit_ledger','credit_key','credit_payload','credit_balance','append_credit','apply_credit_to_license','credit_charge_created','classify_platform_charge','issue_monthly_licenses','fund_platform_credit','create_platform_credit_account','license_on_enrollment','require_platform_credit') loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);end loop;
end $$;

-- Protect reads as well as enrollment; a forged browser route cannot unlock school content.
do $$declare target text;definition text;begin
 foreach target in array array['daily_entries','announcements','calendar_events','messages','grades','media_assets','academic_requests','activity_participations','assignments','assignment_submissions','assignment_files','care_records','academic_terms','assessments','assessment_scores','report_cards'] loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=target and column_name='school_id') then
   execute format('create policy initial_credit_read on public.%I as restrictive for select to authenticated using(public.platform_school_enabled(school_id))',target);
   execute format('create policy initial_credit_insert on public.%I as restrictive for insert to authenticated with check(public.platform_school_enabled(school_id))',target);
   execute format('create policy initial_credit_update on public.%I as restrictive for update to authenticated using(public.platform_school_enabled(school_id)) with check(public.platform_school_enabled(school_id))',target);
  end if;
 end loop;
 definition:=pg_get_functiondef('public.school_workspace(uuid,date,date)'::regprocedure);
 definition:=regexp_replace(definition,'\mbegin\M',E'begin\n if not public.platform_school_enabled(p_school_id) then raise exception ''La institución debe completar el crédito inicial de Bs 500.'';end if;','i');execute definition;
end $$;

create function aulanexo_private.protect_platform_enabled() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then new.platform_enabled:=exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=new.id and initial_paid_at is not null);new.activation_enabled:=(select activation_enabled from aulanexo_private.platform_billing_settings);
 elsif new.activation_enabled is distinct from (select activation_enabled from aulanexo_private.platform_billing_settings) then raise exception 'Solo el propietario puede cambiar el cobro de activación.';end if;
 if new.platform_enabled is distinct from exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=new.id and initial_paid_at is not null) then raise exception 'La habilitación depende del pago bancario inicial confirmado.';end if;
 return new;
end $$;
create trigger protect_platform_enabled before insert or update of platform_enabled,activation_enabled on public.schools for each row execute function aulanexo_private.protect_platform_enabled();
revoke all on function aulanexo_private.protect_platform_enabled() from public,anon,authenticated,service_role;

-- Keep the child header available, while suppressing every academic payload.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.student_portal()'::regprocedure);
 definition:=replace(definition,'allowed:=aulanexo_private.student_learning_access(child.id);','allowed:=aulanexo_private.student_learning_access(child.id) and public.platform_school_enabled(child.school_id);');
 execute definition;
 definition:=pg_get_functiondef('aulanexo_private.student_learning_access(uuid)'::regprocedure);
 definition:=regexp_replace(definition,'\mselect\M',E'select public.platform_school_enabled((select school_id from public.students where id=p_student)) and','i');execute definition;
end $$;
create policy initial_credit_scores_read on public.assessment_scores as restrictive for select to authenticated using(exists(select 1 from public.assessments a where a.id=assessment_id and public.platform_school_enabled(a.school_id)));

-- All versions of the access helpers must honor the disabled activation policy.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','aulanexo_private') and p.prosrc like '%from public.platform_charges%' and (p.prosrc like '%where c.student_id=%' or p.prosrc like '%where student_id=p_student_id%') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,$old$from public.platform_charges c where c.student_id=$old$,$new$from public.platform_charges c where c.kind='activation' and (select activation_enabled from aulanexo_private.platform_billing_settings) and c.student_id=$new$);
  definition:=replace(definition,$old$from public.platform_charges where student_id=p_student_id$old$,$new$from public.platform_charges where kind='activation' and (select activation_enabled from aulanexo_private.platform_billing_settings) and student_id=p_student_id$new$);
  execute definition;
 end loop;
 -- Report the original obligation, its credit and actual bank payments separately.
 definition:=pg_get_functiondef('public.financial_report(uuid,date,date,uuid,uuid)'::regprocedure);
 definition:=replace(definition,$old$'amount',c.amount,'status',c.status,$old$,$new$'amount',c.amount,'paidAmount',c.credit_applied+coalesce((select sum(p.amount) from public.platform_payments p where p.charge_id=c.id),0),'status',c.status,$new$);
 definition:=replace(definition,$old$'kind',case when c.student_id is null then 'license' else 'activation' end$old$,$new$'kind',c.kind$new$);
 execute definition;
end $$;

-- Security-definer academic RPCs also pass this guard; hiding navigation or RLS
-- alone would not protect writes made through those checked RPCs.
create function aulanexo_private.require_academic_credit() returns trigger language plpgsql security definer set search_path='' as $$
declare row_value jsonb;school_value uuid;begin
 if auth.uid() is null then if TG_OP='DELETE' then return old;else return new;end if;end if;
 if TG_OP='DELETE' then row_value:=to_jsonb(old);else row_value:=to_jsonb(new);end if;
 school_value:=(row_value->>'school_id')::uuid;
 if TG_TABLE_NAME='assessment_scores' then select school_id into school_value from public.assessments where id=(row_value->>'assessment_id')::uuid;end if;
 if school_value is null or not public.platform_school_enabled(school_value) then raise exception 'La institución debe completar el crédito inicial de Bs 500 para utilizar el contenido académico.';end if;
 if TG_OP='DELETE' then return old;else return new;end if;
end $$;
revoke all on function aulanexo_private.require_academic_credit() from public,anon,authenticated,service_role;
do $$declare target text;begin
 foreach target in array array['daily_entries','announcements','calendar_events','messages','grades','media_assets','academic_requests','activity_participations','assignments','assignment_submissions','assignment_files','care_records','academic_terms','assessments','assessment_scores','report_cards'] loop
  if target='assessment_scores' or exists(select 1 from information_schema.columns where table_schema='public' and table_name=target and column_name='school_id') then
   execute format('create trigger initial_credit_mutation before insert or update or delete on public.%I for each row execute function aulanexo_private.require_academic_credit()',target);
  end if;
 end loop;
end $$;

-- Enrollment no longer waits for a disabled activation charge. Profile and tuition
-- requirements still control each family's academic access independently.
do $$declare definition text;needle text:='perform aulanexo_private.enroll_student_care(p_student);';begin
 definition:=pg_get_functiondef('public.enroll_student(jsonb)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Revisa el flujo de inscripción antes de aplicar crédito.';end if;
 definition:=replace(definition,needle,needle||E'\n if not(select activation_enabled from aulanexo_private.platform_billing_settings) then update public.students set status=''active'' where id=(p_student->>''id'')::uuid and status=''pending'';end if;');
 execute definition;
end $$;
