-- Private scheduled reconciliation continues even when the family closes MiCole.
create function aulanexo_private.dispatch_bank_qr_worker() returns bigint language plpgsql security definer set search_path='' as $$
declare secret_value text;base_url text;request_id bigint;begin
 if not exists(select 1 from aulanexo_private.bank_qr_intents where (qr_id is not null and status not in ('paid','cancelled','failed') and next_check_at<=now() and (operation_until is null or operation_until<now())) or (status='generating' and operation_until<now())) then return null;end if;
 select decrypted_secret into secret_value from vault.decrypted_secrets where name='micole_bank_worker_key';
 select decrypted_secret into base_url from vault.decrypted_secrets where name='micole_bank_project_url';
 if secret_value is null or base_url is null then return null;end if;
 select net.http_post(url:=base_url||'/functions/v1/bank-qr/worker',headers:=jsonb_build_object('Content-Type','application/json','x-micole-bank-worker-key',secret_value),body:='{}'::jsonb,timeout_milliseconds:=90000) into request_id;
 return request_id;
end $$;
revoke all on function aulanexo_private.dispatch_bank_qr_worker() from public,anon,authenticated;
-- The Edge function uses its server role for public capability links. These RPCs
-- still validate the opaque token and expiry; no table or Vault access is granted.
grant execute on function public.reserve_baneco_link(text,jsonb),public.payment_link_context(text) to service_role;
