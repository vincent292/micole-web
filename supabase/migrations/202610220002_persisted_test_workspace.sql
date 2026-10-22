-- Explicit, private sandbox registry. Confirmed Auth accounts use the usual RLS;
-- the exception grants no admin permissions and never creates a paid receipt.
create table aulanexo_private.persisted_test_workspaces (
 school_id uuid primary key references aulanexo_private.test_institutions(school_id),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now()
);
create table aulanexo_private.persisted_test_accounts (
 user_id uuid primary key references auth.users(id),school_id uuid not null references aulanexo_private.persisted_test_workspaces(school_id),
 email text not null unique check(email=lower(email) and email ~ '^[a-z]+@pruebas[.]micole[.]test$'),
 role text not null check(role in ('director','teacher','guardian','student'))
);
revoke all on aulanexo_private.persisted_test_workspaces,aulanexo_private.persisted_test_accounts from public,anon,authenticated,service_role;
create function aulanexo_private.persisted_testing(p_school uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from aulanexo_private.persisted_test_workspaces p join aulanexo_private.test_institutions t using(school_id) where p.school_id=p_school and t.enabled);
$$;
revoke all on function aulanexo_private.persisted_testing(uuid) from public,anon,authenticated,service_role;

create or replace function public.platform_school_enabled(p_school_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or (aulanexo_private.is_support_owner() and aulanexo_private.support_id() is not null and aulanexo_private.in_support_school(p_school_id))
 or aulanexo_private.persisted_testing(p_school_id)
 or exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=p_school_id and initial_paid_at is not null);
$$;
-- This flag remains derived; clients cannot purchase, forge or edit credit.
create or replace function aulanexo_private.protect_platform_enabled() returns trigger language plpgsql security definer set search_path='' as $$
declare enabled boolean;begin
 enabled:=aulanexo_private.persisted_testing(new.id) or exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=new.id and initial_paid_at is not null);
 if TG_OP='INSERT' then new.platform_enabled:=enabled;new.activation_enabled:=(select activation_enabled from aulanexo_private.platform_billing_settings);
 elsif new.activation_enabled is distinct from (select activation_enabled from aulanexo_private.platform_billing_settings) then raise exception 'Solo el propietario puede cambiar el cobro de activación.';end if;
 if new.platform_enabled is distinct from enabled then raise exception 'La habilitación depende del pago bancario inicial confirmado.';end if;
 return new;
end $$;
-- Synchronize the UI flag when the owner suspends or restores the test workspace.
create function aulanexo_private.sync_persisted_testing() returns trigger language plpgsql security definer set search_path='' as $$begin
 if exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=new.school_id) then
  update public.schools set platform_enabled=aulanexo_private.persisted_testing(new.school_id) or exists(select 1 from aulanexo_private.platform_credit_accounts where school_id=new.school_id and initial_paid_at is not null),show_on_landing=false where id=new.school_id;
 end if;return new;
end $$;
create trigger sync_persisted_testing after insert or update on aulanexo_private.test_institutions for each row execute function aulanexo_private.sync_persisted_testing();
create trigger enable_persisted_testing after insert on aulanexo_private.persisted_test_workspaces for each row execute function aulanexo_private.sync_persisted_testing();

-- The sandbox never issues MiCole license/activation debts. Its tuition entries
-- are still normal, tenant-scoped test records, including partial payments.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.classify_platform_charge()'::regprocedure);
 definition:=replace(definition,'if TG_OP=''INSERT'' then',E'if TG_OP=''INSERT'' then\n if exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=new.school_id) then return null;end if;');
 execute definition;
end $$;
-- A workspace cannot become a real bank customer by turning off its test switch.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('aulanexo_private.reserve_bank_qr(text,uuid,uuid,jsonb,jsonb,uuid,uuid)'::regprocedure);
 needle:='exists(select 1 from aulanexo_private.test_institutions where school_id=p_school and enabled)';
 if position(needle in definition)=0 then raise exception 'No se encontró la protección de QR de pruebas.';end if;
 execute replace(definition,needle,'('||needle||' or exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=p_school))');
 definition:=pg_get_functiondef('public.save_baneco_connection(uuid,text,text,text,jsonb)'::regprocedure);
 needle:='exists(select 1 from aulanexo_private.test_institutions where school_id=p_school_id and enabled)';
 if position(needle in definition)=0 then raise exception 'No se encontró la protección de conexión bancaria de pruebas.';end if;
 execute replace(definition,needle,'('||needle||' or exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=p_school_id))');
end $$;

-- Do not allow a test identity to be linked to real pupils or staff accidentally.
create function aulanexo_private.guard_test_identity_scope() returns trigger language plpgsql security definer set search_path='' as $$
declare record jsonb:=to_jsonb(new);account record;begin
 for account in select * from aulanexo_private.persisted_test_accounts loop
  if (record->>'user_id'=account.user_id::text or lower(coalesce(record->>'email',''))=account.email or
      lower(coalesce(record->>'mother_email',''))=account.email or lower(coalesce(record->>'father_email',''))=account.email or lower(coalesce(record->>'primary_guardian_email',''))=account.email)
    and (record->>'school_id')::uuid is distinct from account.school_id then
   raise exception 'Una cuenta ficticia solo puede vincularse a su institución de pruebas.';
  end if;
  if TG_TABLE_NAME='school_memberships' and record->>'user_id'=account.user_id::text and record->>'role'<>account.role then raise exception 'La cuenta de pruebas conserva el rol asignado.';end if;
 end loop;
 return new;
end $$;
create trigger test_membership_scope before insert or update on public.school_memberships for each row execute function aulanexo_private.guard_test_identity_scope();
create trigger test_teacher_scope before insert or update on public.teachers for each row execute function aulanexo_private.guard_test_identity_scope();
create trigger test_family_scope before insert or update on public.students for each row execute function aulanexo_private.guard_test_identity_scope();
create trigger test_student_login_scope before insert or update on aulanexo_private.student_logins for each row execute function aulanexo_private.guard_test_identity_scope();
-- Explicit banner even when entering with a normal, verified password session.
do $$begin
 execute replace(pg_get_functiondef('public.workspace_identity()'::regprocedure),'FUNCTION public.workspace_identity(', 'FUNCTION aulanexo_private.workspace_identity_without_test_flag(');
end $$;
revoke all on function aulanexo_private.workspace_identity_without_test_flag() from public,anon,authenticated,service_role;
create or replace function public.workspace_identity() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.workspace_identity_without_test_flag();begin
 return result || jsonb_build_object('testing',exists(select 1 from aulanexo_private.persisted_test_accounts where user_id=auth.uid()));
end $$;
revoke all on function public.workspace_identity() from public,anon;
grant execute on function public.workspace_identity() to authenticated;
-- Keep synthetic institutions out of the public directory even after a UI edit.
create or replace function public.landing_institutions() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'city',s.city,'logoUrl',s.logo_url,'website',s.website) order by s.created_at desc,s.id),'[]'::jsonb)
 from public.schools s where s.status='active' and s.show_on_landing and not exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=s.id);
$$;
revoke all on function aulanexo_private.sync_persisted_testing(),aulanexo_private.guard_test_identity_scope() from public,anon,authenticated,service_role;
