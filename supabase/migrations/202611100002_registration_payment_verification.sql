-- Enrollment QR payments cannot be confirmed through older manual-QR checkout paths.
create function aulanexo_private.registration_payment_source() returns trigger language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;r public.school_receipts;
begin
 if new.verification_state<>'verified' then return new;end if;
 select * into a from aulanexo_private.registration_applications where charge_id=new.charge_id;
 if a.id is null then return new;end if;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 select * into r from public.school_receipts where id=new.receipt_id and school_id=a.school_id and student_id=a.student_id;
 if r.id is null or r.payment_method<>new.payment_method then raise exception 'El pago de inscripción requiere un recibo del mismo alumno y medio de pago.';end if;
 if new.payment_method='cash' then
  if not(exists(select 1 from public.school_memberships where school_id=a.school_id and user_id=r.recorded_by and role='director' and active)
   or exists(select 1 from aulanexo_private.registration_delegates d join public.teachers t on t.user_id=d.user_id and t.school_id=a.school_id and t.status='active'
    where d.campaign_id=a.campaign_id and d.user_id=r.recorded_by and d.can_register and d.can_collect)) then raise exception 'Solo personal autorizado puede registrar efectivo de esta inscripción.';end if;
 elsif new.payment_method='qr' then
  if c.simulation and aulanexo_private.persisted_testing(a.school_id) and r.request_hash='registration:'||a.id::text and r.reference like 'PRUEBA-INS-%' then return new;end if;
  if r.verification_source<>'provider' or not exists(select 1 from aulanexo_private.bank_qr_intents i join aulanexo_private.bank_qr_allocations b on b.intent_id=i.id
   where i.id=r.id and i.school_id=a.school_id and i.student_id=a.student_id and i.status='paid' and i.verified_at is not null
    and b.school_charge_id=new.charge_id and b.amount=new.amount and i.bank_transaction_id=new.reference) then raise exception 'El pago QR de inscripción requiere confirmación del banco. Una captura o revisión manual no lo habilita.';end if;
 else raise exception 'La inscripción permite pago QR bancario o efectivo recibido por personal autorizado.';
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.registration_payment_source() from public,anon,authenticated,service_role;
create trigger registration_verify_payment before insert or update of verification_state,receipt_id,payment_method,charge_id,amount on public.school_payments for each row execute function aulanexo_private.registration_payment_source();
