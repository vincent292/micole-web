-- Honor the selected teacher's grants in owner test sessions while retaining the real operator in receipts.
do $$declare definition text;needle text:=' -- One lock serializes all allocations, including simultaneous imports and arrivals.';begin
 definition:=pg_get_functiondef('aulanexo_private.registration_room(uuid,uuid,boolean,uuid)'::regprocedure);
 if position(needle in definition)=0 then raise exception 'Missing registration allocation guard.';end if;
 execute replace(definition,needle,E' if p_random is distinct from true and p_existing is null and not public.has_school_role((select school_id from aulanexo_private.registration_campaigns where id=p_campaign),array[''director'']) then raise exception ''Las docentes inscriben alumnos nuevos con reparto equilibrado; las listas oficiales las importa Dirección.'';end if;\n'||needle);
end $$;
create or replace function aulanexo_private.registration_staff(p_campaign uuid,p_collect boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from aulanexo_private.registration_campaigns c
 where c.id=p_campaign and aulanexo_private.persisted_testing(c.school_id) and aulanexo_private.in_support_school(c.school_id)
 and (public.has_school_role(c.school_id,array['director']) or public.has_school_role(c.school_id,array['teacher']) and exists(select 1 from aulanexo_private.registration_delegates d
 join public.teachers t on t.user_id=d.user_id and t.school_id=c.school_id and t.status='active'
 where d.campaign_id=c.id and d.user_id=coalesce((select tt.user_id from public.teachers tt where tt.id=(aulanexo_private.test_context()).teacher_id and tt.school_id=c.school_id),aulanexo_private.actor_uid())
 and d.can_register and (not p_collect or d.can_collect))));
$$;
create or replace function aulanexo_private.registration_payment_source() returns trigger language plpgsql security definer set search_path='' as $$
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
    where d.campaign_id=a.campaign_id and d.user_id=r.recorded_by and d.can_register and d.can_collect)
   or r.recorded_by=aulanexo_private.actor_uid() and aulanexo_private.registration_staff(a.campaign_id,true)) then raise exception 'Solo personal autorizado puede registrar efectivo de esta inscripción.';end if;
 elsif new.payment_method='qr' then
  if c.simulation and aulanexo_private.persisted_testing(a.school_id) and r.request_hash='registration:'||a.id::text and r.reference like 'PRUEBA-INS-%' then return new;end if;
  if r.verification_source<>'provider' or not exists(select 1 from aulanexo_private.bank_qr_intents i join aulanexo_private.bank_qr_allocations b on b.intent_id=i.id
   where i.id=r.id and i.school_id=a.school_id and i.student_id=a.student_id and i.status='paid' and i.verified_at is not null
    and b.school_charge_id=new.charge_id and b.amount=new.amount and i.bank_transaction_id=new.reference) then raise exception 'El pago QR de inscripción requiere confirmación del banco. Una captura o revisión manual no lo habilita.';end if;
 else raise exception 'La inscripción permite pago QR bancario o efectivo recibido por personal autorizado.';
 end if;
 return new;
end $$;
