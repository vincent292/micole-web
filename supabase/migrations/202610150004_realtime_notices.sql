-- Realtime transporta solo una revisión por institución, nunca fichas o pagos.
create table public.workspace_signals (
 school_id uuid primary key references public.schools(id) on delete cascade,
 revision bigint not null default 1,changed_table text not null default 'schools',changed_at timestamptz not null default now()
);
alter table public.workspace_signals enable row level security;
revoke all on public.workspace_signals from public,anon,authenticated;
grant select on public.workspace_signals to authenticated;
create function public.may_receive_workspace_signal(p_school_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or public.is_school_member(p_school_id) or aulanexo_private.student_id_for_user(auth.uid(),p_school_id) is not null;
$$;
revoke all on function public.may_receive_workspace_signal(uuid) from public,anon;
grant execute on function public.may_receive_workspace_signal(uuid) to authenticated;
create policy signals_read on public.workspace_signals for select to authenticated using(public.may_receive_workspace_signal(school_id));
insert into public.workspace_signals(school_id) select id from public.schools;
create function aulanexo_private.touch_workspace() returns trigger language plpgsql security definer set search_path='' as $$
declare data jsonb:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end; school_value uuid;begin
 school_value:=case when TG_TABLE_NAME='schools' then (data->>'id')::uuid else (data->>'school_id')::uuid end;
 if school_value is null and data ? 'student_id' then select school_id into school_value from public.students where id=(data->>'student_id')::uuid;end if;
 if school_value is null and data ? 'charge_id' then select school_id into school_value from public.school_charges where id=(data->>'charge_id')::uuid;end if;
 if school_value is not null and exists(select 1 from public.schools where id=school_value) then
  insert into public.workspace_signals(school_id,changed_table) values(school_value,TG_TABLE_NAME) on conflict(school_id) do update set revision=public.workspace_signals.revision+1,changed_table=excluded.changed_table,changed_at=now();
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function aulanexo_private.touch_workspace() from public,anon,authenticated;
do $$ declare name text;begin
 foreach name in array array['schools','students','student_guardians','classrooms','teachers','teacher_classrooms','school_memberships','school_charges','school_payments','platform_charges','announcements','calendar_events','daily_entries','messages','grades','family_requests','media_assets','notifications','invitations','family_intake_forms','student_documents','academic_requests','activity_participations','school_receipts','invoice_requests','school_operation_settings'] loop
 execute format('create trigger workspace_changed after insert or update or delete on public.%I for each row execute function aulanexo_private.touch_workspace()',name);
 end loop;
 foreach name in array array['student_logins','school_contacts','payment_connections'] loop
 execute format('create trigger workspace_changed after insert or update or delete on aulanexo_private.%I for each row execute function aulanexo_private.touch_workspace()',name);
 end loop;
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_signals') then
  alter publication supabase_realtime add table public.workspace_signals;
 end if;
end $$;

-- Aprovechar el corte diario existente; recordatorios únicos por año/día, sin sondeos.
create function aulanexo_private.send_birthday_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare today_value date:=(now() at time zone 'America/La_Paz')::date;days_before integer;target date;child record;recipient uuid;sent integer:=0;added integer;begin
 for days_before in 1..2 loop
  target:=today_value+days_before;
  for child in select s.* from public.students s join public.schools sch on sch.id=s.school_id where s.status='active' and sch.status='active' and
   (to_char(s.birth_date,'MM-DD')=to_char(target,'MM-DD') or (to_char(s.birth_date,'MM-DD')='02-29' and to_char(target,'MM-DD')='02-28' and extract(day from (date_trunc('month',target)+interval '1 month - 1 day'))=28)) loop
   for recipient in
    select user_id from public.school_memberships where school_id=child.school_id and role='director' and active
    union select t.user_id from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id where tc.classroom_id=child.classroom_id and t.status='active' and t.user_id is not null
    union select g.user_id from public.student_guardians g where g.student_id=child.id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father')
   loop
    insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
    values(recipient,child.school_id,child.id,child.classroom_id,'birthday_'||target::text||'_'||days_before,child.id,'Cumpleaños en '||days_before||case when days_before=1 then ' día' else ' días' end,child.first_name||' cumple años el '||to_char(target,'DD/MM')||'.','calendar')
    on conflict(user_id,kind,source_id) do nothing;
    get diagnostics added=row_count; sent:=sent+added;
   end loop;
  end loop;
 end loop;
 return sent;
end $$;
revoke all on function aulanexo_private.send_birthday_reminders() from public,anon,authenticated;
alter function aulanexo_private.run_billing_cycle() rename to run_billing_cycle_charges;
create function aulanexo_private.run_billing_cycle() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 result:=aulanexo_private.run_billing_cycle_charges();
 return result||jsonb_build_object('birthdayNotifications',aulanexo_private.send_birthday_reminders());
end $$;
revoke all on function aulanexo_private.run_billing_cycle(),aulanexo_private.run_billing_cycle_charges() from public,anon,authenticated;
