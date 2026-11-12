create function public.school_cashier_for_student(p_student uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.may_manage_student(p_student) or exists(select 1 from public.students s
 where s.id=p_student and public.school_secretary(s.school_id,true));
$$;
revoke all on function public.school_cashier_for_student(uuid) from public,anon;
grant execute on function public.school_cashier_for_student(uuid) to authenticated;
-- Collection uses the same bank proof, locking, references and receipts as Direction.
do $$declare signature text;definition text;begin
 foreach signature in array array[
 'public.checkout_school_payment(uuid,uuid,jsonb,text,text,jsonb,boolean)',
 'aulanexo_private.checkout_before_bank(uuid,uuid,jsonb,text,text,jsonb,boolean)',
 'public.reserve_baneco_payment(text,uuid,uuid,jsonb,jsonb)',
 'public.create_payment_link(uuid,jsonb)','public.receipt_line_items(uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  execute replace(definition,'public.may_manage_student(','public.school_cashier_for_student(');
 end loop;
end $$;
do $$declare relation text;begin
 foreach relation in array array['school_charges','school_receipts','invoice_requests'] loop
  execute format('create policy secretary_collection_read on public.%I for select to authenticated using(public.school_secretary(school_id,true))',relation);
 end loop;
end $$;

-- Delivery always reevaluates access after a tutor or family assignment changes.
do $$begin
 execute replace(pg_get_functiondef('aulanexo_private.push_notice_visible(uuid)'::regprocedure),
 'FUNCTION aulanexo_private.push_notice_visible(', 'FUNCTION aulanexo_private.push_notice_before_observations(');
end $$;
revoke all on function aulanexo_private.push_notice_before_observations(uuid) from public,anon,authenticated,service_role;
create or replace function aulanexo_private.push_notice_visible(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare notice public.notifications;
begin
 select * into notice from public.notifications where id=p_id;
 if notice.kind='student_observation' then return public.observation_visible(notice.source_id);end if;
 return aulanexo_private.push_notice_before_observations(p_id);
end $$;

-- A cashier can inspect only institutional payment intents while the permission is active.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.bank_intent_visible(uuid)'::regprocedure);
 definition:=replace(definition,'if public.has_school_role(i.school_id,array[''director'']) then return true;end if;',
 'if public.has_school_role(i.school_id,array[''director'']) or i.kind=''school'' and public.school_secretary(i.school_id,true) then return true;end if;');
 execute definition;
end $$;
