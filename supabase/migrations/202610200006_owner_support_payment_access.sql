-- The verified MiCole owner can inspect an unpaid account through a valid,
-- audited support/test session. Financial records and normal users stay unchanged.
create function aulanexo_private.support_payment_bypass(p_school uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare context aulanexo_private.support_sessions:=aulanexo_private.support_context();
begin
 return coalesce(context.id is not null and context.school_id=p_school
   and aulanexo_private.is_support_owner(),false);
end $$;
revoke all on function aulanexo_private.support_payment_bypass(uuid) from public,anon,authenticated,service_role;

do $$begin
 execute replace(pg_get_functiondef('aulanexo_private.financial_learning_access(uuid)'::regprocedure),
   'FUNCTION aulanexo_private.financial_learning_access(',
   'FUNCTION aulanexo_private.financial_learning_access_billing(');
end $$;
revoke all on function aulanexo_private.financial_learning_access_billing(uuid) from public,anon,authenticated,service_role;
create or replace function aulanexo_private.financial_learning_access(p_student uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.students s where s.id=p_student
   and aulanexo_private.support_payment_bypass(s.school_id)) then return true;end if;
 return aulanexo_private.financial_learning_access_billing(p_student);
end $$;
revoke all on function aulanexo_private.financial_learning_access(uuid) from public,anon,authenticated,service_role;

-- The client receives this flag only from the checked, current server context.
do $$begin
 execute replace(pg_get_functiondef('public.workspace_identity()'::regprocedure),
   'FUNCTION public.workspace_identity(',
   'FUNCTION aulanexo_private.workspace_identity_without_payment_bypass(');
end $$;
revoke all on function aulanexo_private.workspace_identity_without_payment_bypass() from public,anon,authenticated,service_role;
create or replace function public.workspace_identity() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.workspace_identity_without_payment_bypass();
 context aulanexo_private.support_sessions:=aulanexo_private.support_context();
begin
 if context.id is not null and aulanexo_private.support_payment_bypass(context.school_id) then
   result:=jsonb_set(result,'{support,paymentBypass}','true'::jsonb);
 end if;
 return result;
end $$;
revoke all on function public.workspace_identity() from public,anon;
grant execute on function public.workspace_identity() to authenticated;
