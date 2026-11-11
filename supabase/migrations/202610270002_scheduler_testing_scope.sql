-- Permit an independent QA scheduling account without granting school roles.
alter table aulanexo_private.persisted_test_accounts
  drop constraint persisted_test_accounts_role_check;
alter table aulanexo_private.persisted_test_accounts
  add constraint persisted_test_accounts_role_check
  check (role in ('director','teacher','guardian','student','scheduler'));

-- Apply the same dedicated-school boundary to delegated scheduling access.
create trigger test_timetable_delegate_scope before insert or update
  on public.timetable_delegates for each row
  execute function aulanexo_private.guard_test_identity_scope();
