-- Baneco credentials remain in Vault. Versions are immutable so older QRs can
-- still be reconciled after a school rotates its bank credentials.
create table aulanexo_private.bank_connections (
 id uuid primary key default gen_random_uuid(),school_id uuid references public.schools(id),connection_key text not null,
 secret_id uuid not null,environment text not null check(environment in ('test','production')),
 label text not null,branch_code text not null default '' check(branch_code ~ '^[A-Za-z0-9]{0,5}$'),
 enabled boolean not null default false,checked_at timestamptz,check_result text,last_error text,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
revoke all on aulanexo_private.bank_connections from public,anon,authenticated;
alter table aulanexo_private.payment_connections add column bank_connection_id uuid references aulanexo_private.bank_connections(id);
create function aulanexo_private.bank_manager(p_school uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when p_school is null then aulanexo_private.is_support_owner() and aulanexo_private.support_id() is null
 else public.has_school_role(p_school,array['director']) and aulanexo_private.in_support_school(p_school) end;
$$;
revoke all on function aulanexo_private.bank_manager(uuid) from public,anon,authenticated;
create function public.save_baneco_connection(p_school_id uuid,p_label text,p_environment text,p_branch_code text,p_credentials jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare secret uuid;version uuid:=gen_random_uuid();key text:=coalesce(p_school_id::text,'platform');field text;begin
 if not aulanexo_private.bank_manager(p_school_id) then raise exception 'No tienes permiso para configurar esta cuenta bancaria.';end if;
 if ((aulanexo_private.test_context()).id is not null or exists(select 1 from aulanexo_private.test_institutions where school_id=p_school_id and enabled)) and p_environment='production' then raise exception 'En el modo de pruebas usa el ambiente de certificación.';end if;
 if length(trim(coalesce(p_label,''))) not between 2 and 100 or p_environment is null or p_environment not in ('test','production') or coalesce(p_branch_code,'') !~ '^[A-Za-z0-9]{0,5}$' then raise exception 'Completa nombre de conexión, ambiente y código de sucursal.';end if;
 if p_credentials is null then
  select b.secret_id into secret from aulanexo_private.payment_connections p join aulanexo_private.bank_connections b on b.id=p.bank_connection_id where p.connection_key=key;
  if secret is not null then execute 'select decrypted_secret::jsonb from vault.decrypted_secrets where id=$1' into p_credentials using secret;end if;
 end if;
 if jsonb_typeof(p_credentials) is distinct from 'object' or octet_length(p_credentials::text)>10000 then raise exception 'Completa las credenciales entregadas por Baneco.';end if;
 foreach field in array array['userName','password','accountCredit'] loop
  if jsonb_typeof(p_credentials->field) is distinct from 'string' or length(p_credentials->>field) not between 1 and 512 then raise exception 'Completa usuario, contraseña y cuenta de abono de Baneco.';end if;
 end loop;
 if coalesce(p_credentials->>'encryptionMode','') not in ('bank_api','pre_encrypted') or jsonb_typeof(p_credentials->'aesKey') is distinct from 'string' or length(p_credentials->>'aesKey')>256 or (p_credentials->>'encryptionMode'='bank_api' and length(p_credentials->>'aesKey')=0) then raise exception 'Revisa el formato y la llave de cifrado de Baneco.';end if;
 perform pg_advisory_xact_lock(hashtext('payment-connection-'||key));
 execute 'select vault.create_secret($1,$2,$3)' into secret using (jsonb_build_object('userName',p_credentials->>'userName','password',p_credentials->>'password','aesKey',p_credentials->>'aesKey','accountCredit',p_credentials->>'accountCredit','encryptionMode',p_credentials->>'encryptionMode'))::text,'micole-baneco-'||version::text,'Credenciales Baneco de MiCole';
 insert into aulanexo_private.bank_connections(id,school_id,connection_key,secret_id,environment,label,branch_code,created_by) values(version,p_school_id,key,secret,p_environment,trim(p_label),coalesce(p_branch_code,''),auth.uid());
 insert into aulanexo_private.payment_connections(connection_key,school_id,provider,account_reference,environment,secret_id,updated_by,bank_connection_id) values(key,p_school_id,'Baneco',trim(p_label),p_environment,secret,auth.uid(),version)
 on conflict(connection_key) do update set provider=excluded.provider,account_reference=excluded.account_reference,environment=excluded.environment,secret_id=excluded.secret_id,bank_connection_id=version,updated_at=now(),updated_by=auth.uid();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Administrador','bank_connections',version,'CREATE',jsonb_build_object('name','Cuenta Baneco','environment',p_environment));
end $$;
do $$begin execute replace(pg_get_functiondef('public.payment_connection_status(uuid)'::regprocedure),'FUNCTION public.payment_connection_status(', 'FUNCTION aulanexo_private.legacy_payment_connection_status(');end $$;
revoke all on function aulanexo_private.legacy_payment_connection_status(uuid) from public,anon,authenticated;
create or replace function public.payment_connection_status(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c aulanexo_private.bank_connections;begin
 if not aulanexo_private.bank_manager(p_school_id) then raise exception 'No tienes permiso para administrar esta conexión bancaria.';end if;
 select b.* into c from aulanexo_private.payment_connections p join aulanexo_private.bank_connections b on b.id=p.bank_connection_id where p.connection_key=coalesce(p_school_id::text,'platform');
 if c.id is null then return aulanexo_private.legacy_payment_connection_status(p_school_id);end if;
 return jsonb_build_object('id',c.id,'provider','Baneco','accountReference',c.label,'environment',c.environment,'branchCode',c.branch_code,'credentialsStored',true,'integrationReady',c.enabled and c.check_result='ok','enabled',c.enabled,'checkedAt',c.checked_at,'checkResult',c.check_result,'lastError',c.last_error);
end $$;
create function public.bank_management_context(p_school_id uuid) returns uuid language plpgsql stable security definer set search_path='' as $$declare version uuid;begin
 if not aulanexo_private.bank_manager(p_school_id) then raise exception 'No tienes permiso para administrar esta conexión bancaria.';end if;
 select bank_connection_id into version from aulanexo_private.payment_connections where connection_key=coalesce(p_school_id::text,'platform');
 if version is null then raise exception 'Primero guarda tu conexión Baneco.';end if;
 return version;
end $$;
create function public.set_baneco_enabled(p_school_id uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$declare version uuid;begin
 version:=public.bank_management_context(p_school_id);
 if p_enabled is null then raise exception 'Indica si habilitarás los cobros.';end if;
 if p_enabled and not exists(select 1 from aulanexo_private.bank_connections where id=version and check_result='ok') then raise exception 'Primero comprueba la conexión con Baneco.';end if;
 if p_enabled and (aulanexo_private.test_context()).id is not null and exists(select 1 from aulanexo_private.bank_connections where id=version and environment='production') then raise exception 'En el modo de pruebas usa el ambiente de certificación.';end if;
 update aulanexo_private.bank_connections set enabled=p_enabled where id=version;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Administrador','bank_connections',version,'UPDATE',jsonb_build_object('name','Cobros Baneco','enabled',p_enabled));
end $$;
create function public.bank_private_connection(p_version uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare c aulanexo_private.bank_connections;secret text;begin
 select * into c from aulanexo_private.bank_connections where id=p_version;
 if c.id is null then raise exception 'bank-connection-unavailable';end if;
 execute 'select decrypted_secret from vault.decrypted_secrets where id=$1' into secret using c.secret_id;
 if secret is null then raise exception 'bank-vault-unavailable';end if;
 return jsonb_build_object('id',c.id,'schoolId',c.school_id,'environment',c.environment,'branchCode',c.branch_code,'credentials',secret::jsonb);
end $$;
create function public.bank_finish_connection_check(p_version uuid,p_ok boolean,p_error text default null) returns void language plpgsql security definer set search_path='' as $$begin
 update aulanexo_private.bank_connections set checked_at=now(),check_result=case when p_ok then 'ok' else 'error' end,last_error=case when p_ok then null else left(p_error,80) end,enabled=case when p_ok then enabled else false end where id=p_version;
end $$;
revoke all on function public.save_baneco_connection(uuid,text,text,text,jsonb),public.bank_management_context(uuid),public.set_baneco_enabled(uuid,boolean) from public,anon;
grant execute on function public.save_baneco_connection(uuid,text,text,text,jsonb),public.bank_management_context(uuid),public.set_baneco_enabled(uuid,boolean) to authenticated;
revoke all on function public.bank_private_connection(uuid),public.bank_finish_connection_check(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.bank_private_connection(uuid),public.bank_finish_connection_check(uuid,boolean,text) to service_role;
-- Older clients cannot overwrite the metadata of a configured Baneco version.
do $$begin execute replace(pg_get_functiondef('public.save_payment_connection(uuid,text,text,text,jsonb)'::regprocedure),'FUNCTION public.save_payment_connection(', 'FUNCTION aulanexo_private.save_legacy_payment_connection(');end $$;
revoke all on function aulanexo_private.save_legacy_payment_connection(uuid,text,text,text,jsonb) from public,anon,authenticated;
create or replace function public.save_payment_connection(p_school_id uuid,p_provider text,p_account_reference text,p_environment text,p_credentials jsonb default null) returns void language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from aulanexo_private.payment_connections where connection_key=coalesce(p_school_id::text,'platform') and bank_connection_id is not null) then raise exception 'Usa el formulario de Baneco para cambiar esta conexión.';end if;
 perform aulanexo_private.save_legacy_payment_connection(p_school_id,p_provider,p_account_reference,p_environment,p_credentials);
end $$;
