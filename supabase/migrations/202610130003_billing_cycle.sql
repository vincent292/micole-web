-- Generación recurrente: todos los alumnos activos siguen facturando hasta su baja.
-- Se puede programar en Supabase Cron o ejecutar desde el panel superadmin.
-- El período, fecha de corte y cantidad se calculan en el servidor, en Bolivia.
create schema if not exists aulanexo_private;
revoke all on schema aulanexo_private from public,anon,authenticated;
update public.school_charges set period=to_char(due_date,'YYYY-MM') where period is null and concept ilike 'Mensualidad%';
create function aulanexo_private.run_billing_cycle() returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.students; p public.payment_plans; sch record;
 d date:=(now() at time zone 'America/La_Paz')::date; period_key text; due date;
 monthly numeric; snack numeric; deduction numeric; total integer;
 school_count integer:=0; platform_count integer:=0;
begin
 period_key:=to_char(d,'YYYY-MM');
 for s in select * from public.students where status='active' and enrolled_at<=d order by id for update loop
  if exists(select 1 from public.school_charges where student_id=s.id and period=period_key and status<>'cancelled') then continue; end if;
  select * into p from public.payment_plans where student_id=s.id and start_date<=d order by start_date desc,created_at desc limit 1;
  monthly:=s.monthly_fee; snack:=s.snack_fee;
  due:=(date_trunc('month',d)::date + (coalesce(p.due_day,10)-1));
  if to_char(s.enrolled_at,'YYYY-MM')=period_key then due:=greatest(due,s.enrolled_at); end if;
  deduction:=case when p.id is not null and due between p.discount_from and p.discount_to then least(p.discount,monthly+snack) else 0 end;
  insert into public.school_charges(school_id,student_id,concept,due_date,period,amount,base_amount,snack_amount,license_amount,discount_amount,plan_id)
  values(s.school_id,s.id,'Mensualidad '||period_key,due,period_key,monthly+snack+29-deduction,monthly,snack,29,deduction,p.id)
  on conflict(student_id,period) where period is not null and status<>'cancelled' do nothing;
  school_count:=school_count+1;
 end loop;
 for sch in select id from public.schools order by id for update loop
  if exists(select 1 from public.platform_charges where school_id=sch.id and period=period_key and student_id is null) then continue; end if;
  select count(*) into total from public.students where school_id=sch.id and status='active' and enrolled_at<=d;
  if total=0 then continue; end if;
  insert into public.platform_charges(school_id,concept,period,amount) values(sch.id,'Licencia '||period_key||' · '||total||' alumnos',period_key,total*29)
  on conflict(school_id,period) where student_id is null do nothing;
  platform_count:=platform_count+1;
 end loop;
 return jsonb_build_object('period',period_key,'schoolCharges',school_count,'platformCharges',platform_count);
end $$;
revoke all on function aulanexo_private.run_billing_cycle() from public,anon,authenticated;
create function public.run_billing_cycle() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma puede ejecutar un corte.'; end if;
 return aulanexo_private.run_billing_cycle();
end $$;
revoke all on function public.run_billing_cycle() from public,anon;
grant execute on function public.run_billing_cycle() to authenticated;
-- Para automatizar, habilitar Supabase Cron (pg_cron) y ejecutar como postgres:
-- select cron.schedule('aulanexo-corte-diario','5 4 * * *',
--   $$select aulanexo_private.run_billing_cycle();$$);
-- 04:05 UTC = 00:05 America/La_Paz. Idempotente: no repite cuotas ni liquidaciones.
