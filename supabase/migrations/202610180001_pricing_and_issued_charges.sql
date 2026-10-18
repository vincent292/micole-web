-- Owner-managed tariffs. Every issued charge keeps its original price.
create table aulanexo_private.platform_tariffs (
 scope_key text primary key,school_id uuid unique references public.schools(id),
 activation_fee numeric(12,2) not null check(activation_fee between 0.01 and 1000000),
 monthly_license_fee numeric(12,2) not null check(monthly_license_fee between 0.01 and 1000000),
 updated_by uuid references auth.users(id),updated_at timestamptz not null default now(),
 check(scope_key=coalesce(school_id::text,'global'))
);
insert into aulanexo_private.platform_tariffs(scope_key,activation_fee,monthly_license_fee) values('global',50,29);
revoke all on aulanexo_private.platform_tariffs from public,anon,authenticated;
create function aulanexo_private.platform_fee(p_school uuid,p_kind text) returns numeric language sql stable security definer set search_path='' as $$
 select case when p_kind='activation' then coalesce(s.activation_fee,g.activation_fee) else coalesce(s.monthly_license_fee,g.monthly_license_fee) end
 from aulanexo_private.platform_tariffs g left join aulanexo_private.platform_tariffs s on s.school_id=p_school where g.scope_key='global';
$$;
revoke all on function aulanexo_private.platform_fee(uuid,text) from public,anon,authenticated;
create function public.platform_tariffs(p_school_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare inherited boolean;stamp timestamptz;begin
 if p_school_id is not null and not(public.is_platform_admin() or (aulanexo_private.in_support_school(p_school_id) and public.has_school_role(p_school_id,array['director','teacher','guardian']))) then raise exception 'No tienes permiso para consultar estas tarifas.';end if;
 if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id) then raise exception 'Selecciona una institución válida.';end if;
 inherited:=p_school_id is not null and not exists(select 1 from aulanexo_private.platform_tariffs where school_id=p_school_id);
 select updated_at into stamp from aulanexo_private.platform_tariffs where scope_key=case when inherited or p_school_id is null then 'global' else p_school_id::text end;
 return jsonb_build_object('schoolId',p_school_id,'activationFee',aulanexo_private.platform_fee(p_school_id,'activation'),'monthlyLicenseFee',aulanexo_private.platform_fee(p_school_id,'monthly'),'inherited',inherited,'updatedAt',stamp);
end $$;
create function public.save_platform_tariffs(p_school_id uuid,p_activation_fee numeric,p_monthly_license_fee numeric,p_reason text,p_use_global boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare old_value jsonb;new_value jsonb;begin
 if not public.is_platform_admin() or not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede modificar las tarifas de MiCole desde su panel.';end if;
 if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id) then raise exception 'Selecciona una institución válida.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 500 then raise exception 'Indica el motivo del cambio (5 a 500 caracteres).';end if;
 if p_use_global is null or (p_use_global and p_school_id is null) then raise exception 'Las tarifas generales no pueden heredar otra configuración.';end if;
 if not p_use_global and (p_activation_fee is null or p_monthly_license_fee is null or p_activation_fee not between 0.01 and 1000000 or p_monthly_license_fee not between 0.01 and 1000000 or p_activation_fee<>round(p_activation_fee,2) or p_monthly_license_fee<>round(p_monthly_license_fee,2)) then raise exception 'Usa importes positivos con hasta dos decimales.';end if;
 perform pg_advisory_xact_lock(hashtext('micole-platform-tariffs'));
 old_value:=public.platform_tariffs(p_school_id);
 if p_use_global then delete from aulanexo_private.platform_tariffs where school_id=p_school_id;
 else insert into aulanexo_private.platform_tariffs(scope_key,school_id,activation_fee,monthly_license_fee,updated_by) values(coalesce(p_school_id::text,'global'),p_school_id,p_activation_fee,p_monthly_license_fee,auth.uid()) on conflict(scope_key) do update set activation_fee=excluded.activation_fee,monthly_license_fee=excluded.monthly_license_fee,updated_by=excluded.updated_by,updated_at=now();end if;
 new_value:=public.platform_tariffs(p_school_id);
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Propietario MiCole','platform_tariffs',coalesce(p_school_id,auth.uid()),'UPDATE',jsonb_build_object('name','Tarifas MiCole','before',old_value,'after',new_value,'reason',trim(p_reason)));
end $$;
revoke all on function public.platform_tariffs(uuid) from public;
grant execute on function public.platform_tariffs(uuid) to anon,authenticated;
revoke all on function public.save_platform_tariffs(uuid,numeric,numeric,text,boolean) from public,anon;
grant execute on function public.save_platform_tariffs(uuid,numeric,numeric,text,boolean) to authenticated;

-- A plan snapshots its license fee once, before any installments are issued.
alter table public.payment_plans add column license_fee numeric(12,2) not null default 29 check(license_fee between 0.01 and 1000000);
create function aulanexo_private.plan_license_snapshot() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='INSERT' then new.license_fee:=aulanexo_private.platform_fee(new.school_id,'monthly');
 elsif new.license_fee is distinct from old.license_fee then raise exception 'La licencia del plan emitido no se puede modificar.';end if;
 return new;
end $$;
revoke all on function aulanexo_private.plan_license_snapshot() from public,anon,authenticated;
create trigger plan_license_snapshot before insert or update of license_fee on public.payment_plans for each row execute function aulanexo_private.plan_license_snapshot();
alter table public.platform_charges add column license_count integer check(license_count>=0),add column unit_amount numeric(12,2) check(unit_amount>=0);
update public.platform_charges set license_count=(amount/29)::integer,unit_amount=29 where student_id is null and mod(amount,29)=0;
update public.platform_charges set unit_amount=amount where student_id is not null;
-- Preserve function OIDs used by policies and callers; only replace rate constants.
do $$declare original text;updated text;begin
 original:=pg_get_functiondef('aulanexo_private.enroll_student_base(jsonb)'::regprocedure);
 updated:=regexp_replace(original,',\s*50\s*\);',',aulanexo_private.platform_fee(sid,''activation''));','g');
 if updated=original then raise exception 'No se encontró la emisión de activación esperada.';end if;
 updated:=regexp_replace(updated,'\mbegin\M',E'begin\n perform pg_advisory_xact_lock_shared(hashtext(''micole-platform-tariffs''));\n if p_student ? ''activation_fee_quote'' and ((p_student->>''activation_fee_quote'')::numeric is distinct from aulanexo_private.platform_fee((p_student->>''school_id'')::uuid,''activation'')) then raise exception ''La tarifa de activación cambió. Actualiza el formulario antes de inscribir.'';end if;','i');execute updated;
 original:=pg_get_functiondef('public.create_payment_plan(jsonb)'::regprocedure);
 updated:=replace(replace(original,'+29-','+p.license_fee-'),',29,',',p.license_fee,');
 if updated=original then raise exception 'No se encontró la emisión de mensualidades esperada.';end if;
 updated:=regexp_replace(updated,'\mbegin\M',E'begin\n if not public.may_manage_student((p_plan->>''student_id'')::uuid) then raise exception ''No tienes permiso para crear este plan.'';end if;\n perform pg_advisory_xact_lock_shared(hashtext(''micole-platform-tariffs''));\n if p_plan ? ''license_fee'' and ((p_plan->>''license_fee'')::numeric is distinct from aulanexo_private.platform_fee((p_plan->>''school_id'')::uuid,''monthly'')) then raise exception ''La tarifa de licencia cambió. Actualiza el formulario antes de crear el plan.'';end if;','i');execute updated;
 original:=pg_get_functiondef('public.generate_platform_invoice(uuid,text)'::regprocedure);
 updated:=replace(original,'public.platform_charges(school_id,concept,period,amount)','public.platform_charges(school_id,concept,period,amount,license_count,unit_amount)');
 updated:=replace(updated,'total*29)','total*aulanexo_private.platform_fee(p_school_id,''monthly''),total,aulanexo_private.platform_fee(p_school_id,''monthly''))');
 if updated=original then raise exception 'No se encontró la liquidación esperada.';end if;
 updated:=regexp_replace(updated,'\mbegin\M',E'begin\n if not public.is_platform_admin() then raise exception ''Solo la plataforma puede generar liquidaciones.'';end if;\n perform pg_advisory_xact_lock_shared(hashtext(''micole-platform-tariffs''));','i');execute updated;
 original:=pg_get_functiondef('aulanexo_private.run_billing_cycle_charges()'::regprocedure);
 updated:=replace(replace(original,'monthly+snack+29-deduction','monthly+snack+aulanexo_private.platform_fee(s.school_id,''monthly'')-deduction'),'monthly,snack,29,deduction','monthly,snack,aulanexo_private.platform_fee(s.school_id,''monthly''),deduction');
 updated:=replace(updated,'public.platform_charges(school_id,concept,period,amount)','public.platform_charges(school_id,concept,period,amount,license_count,unit_amount)');
 updated:=replace(updated,'total*29)','total*aulanexo_private.platform_fee(sch.id,''monthly''),total,aulanexo_private.platform_fee(sch.id,''monthly''))');
 if updated=original then raise exception 'No se encontró el corte mensual esperado.';end if;
 updated:=regexp_replace(updated,'\mbegin\M',E'begin\n perform pg_advisory_xact_lock_shared(hashtext(''micole-platform-tariffs''));','i');execute updated;
end $$;
-- Tariff edits, discounts and student edits never rewrite issued installments.
create or replace function public.adjust_plan_discount(p_plan_id uuid,p_discount numeric,p_from date,p_to date) returns void language plpgsql security definer set search_path='' as $$
declare p public.payment_plans;begin
 select * into p from public.payment_plans where id=p_plan_id for update;
 if p.id is null or not public.may_manage_student(p.student_id) then raise exception 'No tienes permiso para ajustar este plan.';end if;
 if p_discount is null or p_discount<0 or p_discount>1000000000 or (p_discount>0 and (p_from is null or p_to is null or p_from>p_to)) then raise exception 'Indica un descuento y fechas válidas.';end if;
 update public.payment_plans set discount=p_discount,discount_from=p_from,discount_to=p_to where id=p.id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p.school_id,auth.uid(),'Dirección','payment_plans',p.id,'UPDATE',jsonb_build_object('name','Descuento para nuevas cuotas','discount',p_discount,'from',p_from,'to',p_to,'issuedChargesChanged',false));
end $$;
create function aulanexo_private.protect_issued_charge_amount() returns trigger language plpgsql set search_path='' as $$begin
 if new.amount<old.amount then raise exception 'Una cuota emitida no se puede disminuir. Registra un abono para cubrir parte del saldo.';end if;
 if new.amount is distinct from old.amount and old.status in ('paid','cancelled') then raise exception 'No se puede cambiar el importe de una cuota pagada o anulada.';end if;
 return new;
end $$;
revoke all on function aulanexo_private.protect_issued_charge_amount() from public,anon,authenticated;
create trigger protect_issued_school_amount before update of amount on public.school_charges for each row execute function aulanexo_private.protect_issued_charge_amount();
create trigger protect_issued_platform_amount before update of amount on public.platform_charges for each row execute function aulanexo_private.protect_issued_charge_amount();

create function public.increase_issued_charge(p_kind text,p_charge_id uuid,p_amount numeric,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare child uuid;school uuid;old_amount numeric;state text;begin
 if p_kind='school' then
  select student_id,school_id into child,school from public.school_charges where id=p_charge_id;
  if child is null or not public.may_manage_student(child) or not aulanexo_private.in_support_school(school) then raise exception 'Solo Dirección puede modificar este importe.';end if;
  perform pg_advisory_xact_lock(hashtext('bank-student-'||child::text));
  select amount,status into old_amount,state from public.school_charges where id=p_charge_id for update;
 elsif p_kind='platform' then
  if not public.is_platform_admin() or not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede modificar este cobro de MiCole.';end if;
  select amount,status,school_id into old_amount,state,school from public.platform_charges where id=p_charge_id for update;
 else raise exception 'Tipo de cobro inválido.';end if;
 if old_amount is null then raise exception 'No se encontró la cuota.';end if;
 if p_amount is null or p_amount not between 0.01 and 1000000000 or p_amount<>round(p_amount,2) then raise exception 'Indica un importe positivo con hasta dos decimales.';end if;
 if p_amount<old_amount then raise exception 'Una cuota emitida no se puede disminuir. Registra un abono para cubrir parte del saldo.';end if;
 if state in ('paid','cancelled') then raise exception 'No se puede cambiar el importe de una cuota pagada o anulada.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 500 then raise exception 'Indica el motivo del ajuste (5 a 500 caracteres).';end if;
 if exists(select 1 from aulanexo_private.bank_qr_allocations where reserved and coalesce(school_charge_id,platform_charge_id)=p_charge_id) then raise exception 'Primero revisa o cancela el QR pendiente de esta cuota.';end if;
 if p_amount=old_amount then return;end if;
 if p_kind='school' then update public.school_charges set amount=p_amount,base_amount=base_amount+(p_amount-old_amount) where id=p_charge_id;
 else update public.platform_charges set amount=p_amount where id=p_charge_id;end if;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(school,auth.uid(),case when p_kind='platform' then 'Propietario MiCole' else 'Dirección' end,case when p_kind='platform' then 'platform_charges' else 'school_charges' end,p_charge_id,'UPDATE',jsonb_build_object('name','Incremento de cuota emitida','previousAmount',old_amount,'amount',p_amount,'reason',trim(p_reason)));
end $$;
revoke all on function public.increase_issued_charge(text,uuid,numeric,text) from public,anon;
grant execute on function public.increase_issued_charge(text,uuid,numeric,text) to authenticated;
-- Quantity is a snapshot, not amount divided by today's license price.
do $$declare f record;definition text;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosrc like '%''licenseCount''%' loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'case when c.student_id is null and mod(c.amount,29)=0 then (c.amount/29)::integer else null end','case when c.student_id is null then c.license_count else null end');execute definition;
 end loop;
end $$;
create function public.set_student_fees(p_student_id uuid,p_monthly_fee numeric,p_snack_fee numeric,p_enrollment_fee numeric,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.students;begin
 if not public.may_manage_student(p_student_id) then raise exception 'Solo Dirección puede modificar la mensualidad del estudiante.';end if;
 select * into s from public.students where id=p_student_id for update;
 if s.id is null or not aulanexo_private.in_support_school(s.school_id) then raise exception 'No tienes acceso a este estudiante.';end if;
 if p_monthly_fee is null or p_snack_fee is null or p_enrollment_fee is null or p_monthly_fee not between 0 and 1000000000 or p_snack_fee not between 0 and 1000000000 or p_enrollment_fee not between 0 and 1000000000 or p_monthly_fee<>round(p_monthly_fee,2) or p_snack_fee<>round(p_snack_fee,2) or p_enrollment_fee<>round(p_enrollment_fee,2) then raise exception 'Revisa los precios: usa importes desde cero con hasta dos decimales.';end if;
 if coalesce(length(trim(p_reason)),0) not between 5 and 500 then raise exception 'Indica el motivo del cambio (5 a 500 caracteres).';end if;
 update public.students set monthly_fee=p_monthly_fee,snack_fee=p_snack_fee,enrollment_fee=p_enrollment_fee where id=s.id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(s.school_id,auth.uid(),'Dirección','students',s.id,'UPDATE',jsonb_build_object('name','Precios para nuevas cuotas','previousMonthlyFee',s.monthly_fee,'monthlyFee',p_monthly_fee,'snackFee',p_snack_fee,'enrollmentFee',p_enrollment_fee,'reason',trim(p_reason),'issuedChargesChanged',false));
end $$;
revoke all on function public.set_student_fees(uuid,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.set_student_fees(uuid,numeric,numeric,numeric,text) to authenticated;
