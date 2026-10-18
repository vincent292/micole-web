-- Platform administration sees its own charges. Institution tuition requires
-- entering the institution through an authorized support or owner test session.
create or replace function aulanexo_private.bank_intent_visible(p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare i aulanexo_private.bank_qr_intents;begin
 select * into i from aulanexo_private.bank_qr_intents where id=p_id;
 if i.id is null or auth.uid() is null or not aulanexo_private.in_support_school(i.school_id) then return false;end if;
 if public.is_platform_admin() and aulanexo_private.is_support_owner() then return i.kind='platform';end if;
 if public.has_school_role(i.school_id,array['director']) then return true;end if;
 if i.kind='school' then return public.is_verified_guardian(i.student_id) or (public.may_teacher_write(i.student_id) and not exists(select 1 from aulanexo_private.bank_qr_allocations a join public.school_charges c on c.id=a.school_charge_id where a.intent_id=i.id and c.academic_request_id is null));end if;
 return not exists(select 1 from aulanexo_private.bank_qr_allocations a join public.platform_charges c on c.id=a.platform_charge_id where a.intent_id=i.id and (c.student_id is null or not public.is_verified_guardian(c.student_id)));
end $$;
