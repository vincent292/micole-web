-- Reuse the RLS protected revision transport; never publish pupil/payroll/payment payloads.
create or replace function aulanexo_private.touch_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end; school_value uuid;
begin
 if TG_OP='UPDATE' and to_jsonb(new)=to_jsonb(old) then return new; end if;
 school_value:=case when TG_TABLE_NAME='schools' then (data->>'id')::uuid else (data->>'school_id')::uuid end;
 if school_value is null and data ? 'student_id' then select school_id into school_value from public.students where id=(data->>'student_id')::uuid;end if;
 if school_value is null and data ? 'charge_id' then
  if TG_TABLE_NAME='platform_payments' then select school_id into school_value from public.platform_charges where id=(data->>'charge_id')::uuid;
  else select school_id into school_value from public.school_charges where id=(data->>'charge_id')::uuid;end if;
 end if;
 if school_value is not null and exists(select 1 from public.schools where id=school_value) then
  insert into public.workspace_signals(school_id,changed_table) values(school_value,TG_TABLE_NAME)
  on conflict(school_id) do update set revision=public.workspace_signals.revision+1,changed_table=excluded.changed_table,changed_at=now();
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function aulanexo_private.touch_workspace() from public,anon,authenticated,service_role;
do $$ declare relation text;begin
 foreach relation in array array[
  'public.staff_attendance_settings','public.staff_work_profiles','public.staff_attendance_records',
  'public.staff_attendance_changes','public.staff_payrolls','public.admission_templates','public.document_imports',
  'public.payment_plans','public.platform_payments','public.content_view_events',
  'aulanexo_private.platform_credit_accounts','aulanexo_private.platform_credit_ledger','aulanexo_private.bank_connections'
 ] loop
  if not exists(select 1 from pg_trigger where tgrelid=relation::regclass and tgfoid='aulanexo_private.touch_workspace()'::regprocedure) then
   execute format('create trigger realtime_module_changed after insert or update or delete on %s for each row execute function aulanexo_private.touch_workspace()',relation);
  end if;
 end loop;
end $$;
-- QR reconciliation updates leases frequently. Only a visible payment change invalidates the UI.
create trigger realtime_bank_payment_changed
 after insert or update of status,application_status,qr_id,qr_image,verified_at,last_error on aulanexo_private.bank_qr_intents
 for each row execute function aulanexo_private.touch_workspace();
-- Global tariff changes notify authorized institutions without sharing pricing/credential payloads.
create function aulanexo_private.signal_tariff_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare data jsonb:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
 insert into public.workspace_signals(school_id,changed_table)
 select id,'platform_tariffs' from public.schools where data->>'school_id' is null or id=(data->>'school_id')::uuid
 on conflict(school_id) do update set revision=public.workspace_signals.revision+1,changed_table='platform_tariffs',changed_at=now();
 update public.platform_signals set revision=revision+1,changed_table='platform_tariffs',changed_at=now() where singleton=true;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function aulanexo_private.signal_tariff_change() from public,anon,authenticated,service_role;
create trigger realtime_tariff_changed after insert or update or delete on aulanexo_private.platform_tariffs
 for each row execute function aulanexo_private.signal_tariff_change();
