-- Attendance and payroll are tenant-scoped, separate from student tuition.
create table public.staff_attendance_settings (
 school_id uuid primary key references public.schools(id), latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180), radius_m integer not null default 150 check(radius_m between 30 and 2000),
 max_accuracy_m integer not null default 50 check(max_accuracy_m between 5 and 200), tolerance_minutes integer not null default 10 check(tolerance_minutes between 0 and 120),
 late_mode text not null default 'excess' check(late_mode in ('excess','all_after_tolerance')),
 late_rate numeric(12,2) not null default 0 check(late_rate between 0 and 1000),
 deductions_enabled boolean not null default false, policy_note text not null default '', updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
create table public.staff_work_profiles (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), teacher_id uuid not null,
 pay_type text not null check(pay_type in ('monthly','hourly')), monthly_salary numeric(12,2) not null default 0 check(monthly_salary between 0 and 1000000),
 hourly_rate numeric(12,2) not null default 0 check(hourly_rate between 0 and 100000), active boolean not null default true,
 schedule jsonb not null default '[]' check(jsonb_typeof(schedule)='array' and jsonb_array_length(schedule)<=21), updated_at timestamptz not null default now(),
 foreign key(teacher_id,school_id) references public.teachers(id,school_id), unique(teacher_id,school_id)
);
create table public.staff_attendance_records (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), teacher_id uuid not null,
 attendance_date date not null, shift_key text not null, scheduled_start timestamptz not null, scheduled_end timestamptz not null,
 check_in timestamptz not null, check_out timestamptz, break_minutes integer not null check(break_minutes between 0 and 300),
 worked_minutes integer not null default 0 check(worked_minutes>=0), hourly_rate numeric(12,2) not null default 0 check(hourly_rate>=0), late_minutes integer not null check(late_minutes>=0),
 tolerance_minutes integer not null, late_mode text not null, late_rate numeric(12,2) not null, deductions_enabled boolean not null,
 late_waived boolean not null default false, entry_lat double precision, entry_lon double precision, entry_accuracy double precision,
 exit_lat double precision, exit_lon double precision, exit_accuracy double precision, source text not null check(source in ('gps','manual')),
 note text not null default '', created_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 foreign key(teacher_id,school_id) references public.teachers(id,school_id), unique(teacher_id,attendance_date,shift_key),
 check(check_out is null or check_out>=check_in)
);
create unique index staff_one_open_shift on public.staff_attendance_records(teacher_id) where check_out is null;
create index staff_attendance_period on public.staff_attendance_records(school_id,attendance_date,teacher_id);
create table public.staff_attendance_changes (
 id uuid primary key default gen_random_uuid(), school_id uuid not null, record_id uuid not null references public.staff_attendance_records(id),
 actor_id uuid not null references auth.users(id), previous jsonb not null, reason text not null, created_at timestamptz not null default now()
);
create table public.staff_payrolls (
 id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), teacher_id uuid not null,
 period date not null check(extract(day from period)=1), status text not null default 'draft' check(status in ('draft','approved','paid')),
 profile_snapshot jsonb not null, source_hash text not null, worked_minutes integer not null, late_minutes integer not null,
 base_amount numeric(12,2) not null, late_deduction numeric(12,2) not null, adjustments jsonb not null default '[]',
 gross_amount numeric(12,2) not null, deductions numeric(12,2) not null, net_amount numeric(12,2) not null,
 note text not null default '', approved_by uuid references auth.users(id), approved_at timestamptz, paid_by uuid references auth.users(id), paid_at timestamptz,
 payment_method text, payment_reference text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(teacher_id,school_id) references public.teachers(id,school_id), unique(teacher_id,period),
 check(gross_amount>=0 and deductions>=0 and net_amount=gross_amount-deductions)
);

create function aulanexo_private.staff_manager(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.has_school_role(p_school,array['director']) and aulanexo_private.in_support_school(p_school) and public.platform_school_enabled(p_school);
$$;
create function aulanexo_private.staff_reader(p_school uuid,p_teacher uuid) returns boolean language sql stable security definer set search_path='' as $$
 select aulanexo_private.in_support_school(p_school) and public.platform_school_enabled(p_school) and
 (aulanexo_private.staff_manager(p_school) or (public.has_school_role(p_school,array['teacher']) and exists(select 1 from public.teachers t
 where t.id=p_teacher and t.school_id=p_school and t.status='active' and aulanexo_private.teacher_actor_matches(t.id,t.user_id))));
$$;
create function aulanexo_private.staff_require_manager(p_school uuid) returns void language plpgsql stable security definer set search_path='' as $$begin
 if not aulanexo_private.staff_manager(p_school) then raise exception 'Solo Dirección puede administrar la asistencia y los sueldos de esta sede.';end if;
end $$;
create function aulanexo_private.staff_month_open(p_teacher uuid,p_date date) returns void language plpgsql stable security definer set search_path='' as $$begin
 if exists(select 1 from public.staff_payrolls where teacher_id=p_teacher and period=date_trunc('month',p_date)::date and status<>'draft') then
 raise exception 'La boleta del período ya fue aprobada. Registra ajustes en una boleta posterior.';end if;
end $$;
create function aulanexo_private.staff_distance(p_lat double precision,p_lon double precision,p_lat2 double precision,p_lon2 double precision) returns double precision
language sql immutable set search_path='' as $$select 6371000.0*2*asin(sqrt(least(1.0,greatest(0.0,power(sin(radians(p_lat2-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(p_lat2))*power(sin(radians(p_lon2-p_lon)/2),2)))));$$;

alter table public.staff_attendance_settings enable row level security;
alter table public.staff_work_profiles enable row level security;
alter table public.staff_attendance_records enable row level security;
alter table public.staff_attendance_changes enable row level security;
alter table public.staff_payrolls enable row level security;
revoke all on public.staff_attendance_settings,public.staff_work_profiles,public.staff_attendance_records,public.staff_attendance_changes,public.staff_payrolls from public,anon,authenticated;
grant select on public.staff_attendance_settings,public.staff_work_profiles,public.staff_attendance_records,public.staff_attendance_changes,public.staff_payrolls to authenticated;
create policy staff_settings_read on public.staff_attendance_settings for select to authenticated using(aulanexo_private.staff_manager(school_id) or
 exists(select 1 from public.teachers t where t.school_id=staff_attendance_settings.school_id and aulanexo_private.staff_reader(t.school_id,t.id)));
create policy staff_profiles_read on public.staff_work_profiles for select to authenticated using(aulanexo_private.staff_reader(school_id,teacher_id));
create policy staff_attendance_read on public.staff_attendance_records for select to authenticated using(aulanexo_private.staff_reader(school_id,teacher_id));
create policy staff_changes_read on public.staff_attendance_changes for select to authenticated using(aulanexo_private.staff_manager(school_id));
create policy staff_payrolls_read on public.staff_payrolls for select to authenticated using(aulanexo_private.staff_manager(school_id) or (status<>'draft' and aulanexo_private.staff_reader(school_id,teacher_id)));

create function public.save_staff_settings(p_school_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 perform aulanexo_private.staff_require_manager(p_school_id);
 if p_values->>'latitude' is null or p_values->>'longitude' is null then raise exception 'Define la ubicación de la sede.';end if;
 if coalesce((p_values->>'deductionsEnabled')::boolean,false) and length(trim(coalesce(p_values->>'policyNote','')))<10 then raise exception 'Indica el reglamento o acuerdo que respalda los descuentos propuestos.';end if;
 insert into public.staff_attendance_settings(school_id,latitude,longitude,radius_m,max_accuracy_m,tolerance_minutes,late_mode,late_rate,deductions_enabled,policy_note,updated_by)
 values(p_school_id,(p_values->>'latitude')::double precision,(p_values->>'longitude')::double precision,coalesce((p_values->>'radiusM')::int,150),coalesce((p_values->>'maxAccuracyM')::int,50),
 coalesce((p_values->>'toleranceMinutes')::int,10),coalesce(p_values->>'lateMode','excess'),coalesce((p_values->>'lateRate')::numeric,0),coalesce((p_values->>'deductionsEnabled')::boolean,false),left(coalesce(p_values->>'policyNote',''),2000),auth.uid())
 on conflict(school_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,radius_m=excluded.radius_m,max_accuracy_m=excluded.max_accuracy_m,tolerance_minutes=excluded.tolerance_minutes,
 late_mode=excluded.late_mode,late_rate=excluded.late_rate,deductions_enabled=excluded.deductions_enabled,policy_note=excluded.policy_note,updated_by=auth.uid(),updated_at=now();
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Dirección','staff_attendance_settings',p_school_id,'UPDATE',jsonb_build_object('name','Reglas de asistencia y descuentos'));
end $$;

create function public.save_staff_profile(p_school_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare teacher uuid:=(p_values->>'teacherId')::uuid; shifts jsonb:=coalesce(p_values->'schedule','[]');s jsonb;
begin
 perform aulanexo_private.staff_require_manager(p_school_id);
 if not exists(select 1 from public.teachers where id=teacher and school_id=p_school_id) then raise exception 'Selecciona un docente de esta sede.';end if;
 perform pg_advisory_xact_lock(hashtext('staff-attendance-'||teacher::text));
 if jsonb_typeof(shifts)<>'array' or jsonb_array_length(shifts)>21 then raise exception 'Revisa los turnos del docente.';end if;
 for s in select value from jsonb_array_elements(shifts) loop
  if coalesce((s->>'weekday')::int,-1) not between 0 and 6 or coalesce(s->>'start','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(s->>'end','')!~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   or (s->>'end')::time<=(s->>'start')::time or coalesce((s->>'breakMinutes')::int,0)<0 or coalesce((s->>'breakMinutes')::int,0)>=extract(epoch from ((s->>'end')::time-(s->>'start')::time))/60 then
   raise exception 'Cada turno necesita día, entrada, salida y descanso válidos, sin cruzar medianoche.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(shifts) with ordinality a(v,n) join jsonb_array_elements(shifts) with ordinality b(v,n) on a.n<b.n
 where a.v->>'weekday'=b.v->>'weekday' and (a.v->>'start')::time<(b.v->>'end')::time and (b.v->>'start')::time<(a.v->>'end')::time) then raise exception 'Los turnos de un mismo día no pueden superponerse.';end if;
 insert into public.staff_work_profiles(school_id,teacher_id,pay_type,monthly_salary,hourly_rate,active,schedule)
 values(p_school_id,teacher,p_values->>'payType',coalesce((p_values->>'monthlySalary')::numeric,0),coalesce((p_values->>'hourlyRate')::numeric,0),coalesce((p_values->>'active')::boolean,true),shifts)
 on conflict(teacher_id,school_id) do update set pay_type=excluded.pay_type,monthly_salary=excluded.monthly_salary,hourly_rate=excluded.hourly_rate,active=excluded.active,schedule=excluded.schedule,updated_at=now();
end $$;

create function public.mark_staff_attendance(p_teacher_id uuid,p_kind text,p_location jsonb,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare profile public.staff_work_profiles;settings public.staff_attendance_settings;entry public.staff_attendance_records;shift jsonb;day date:=(now() at time zone 'America/La_Paz')::date;
 lat double precision:=(p_location->>'latitude')::double precision;lon double precision:=(p_location->>'longitude')::double precision;accuracy double precision:=(p_location->>'accuracy')::double precision;
 start_time timestamptz;end_time timestamptz;shift_key text;
begin
 select * into profile from public.staff_work_profiles where teacher_id=p_teacher_id and active;
 if profile.id is null or not aulanexo_private.staff_reader(profile.school_id,p_teacher_id) then raise exception 'No tienes un perfil de asistencia habilitado en esta sede.';end if;
 -- A director may correct records through a separate audited RPC, not impersonate a GPS mark.
 if not public.has_school_role(profile.school_id,array['teacher']) or not exists(select 1 from public.teachers t where t.id=p_teacher_id and t.school_id=profile.school_id and t.status='active' and aulanexo_private.teacher_actor_matches(t.id,t.user_id)) then raise exception 'La marcación corresponde a la cuenta docente.';end if;
 if p_id is null or p_kind is null or p_kind not in ('in','out') then raise exception 'Marcación inválida.';end if;
 perform pg_advisory_xact_lock(hashtext('staff-attendance-'||p_teacher_id::text));
 select * into settings from public.staff_attendance_settings where school_id=profile.school_id;
 if settings.school_id is null then raise exception 'Dirección debe configurar la ubicación de la sede.';end if;
 if lat is null or lon is null or accuracy is null or lat not between -90 and 90 or lon not between -180 and 180 or accuracy<0 or accuracy>settings.max_accuracy_m
 or coalesce((p_location->>'mocked')::boolean,false) or p_location->>'capturedAt' is null or abs(extract(epoch from now()-(p_location->>'capturedAt')::timestamptz))>120 then
  raise exception 'Obtén una ubicación precisa y reciente. No se aceptan ubicaciones simuladas.';end if;
 if aulanexo_private.staff_distance(lat,lon,settings.latitude,settings.longitude)>settings.radius_m then raise exception 'Debes estar dentro del rango autorizado de la sede para marcar.';end if;
 select * into entry from public.staff_attendance_records where id=p_id;
 if found then
  if entry.teacher_id<>p_teacher_id then raise exception 'Identificador de marcación inválido.';end if;
  if p_kind='in' or entry.check_out is not null then return entry.id;end if;
 end if;
 if p_kind='out' then
  select * into entry from public.staff_attendance_records where teacher_id=p_teacher_id and check_out is null for update;
  if not found then raise exception 'No tienes una entrada pendiente de salida.';end if;
  if entry.id<>p_id then raise exception 'Actualiza la asistencia antes de marcar la salida.';end if;
  perform aulanexo_private.staff_month_open(p_teacher_id,entry.attendance_date);
  if now()>entry.check_in+interval '24 hours' then raise exception 'La entrada anterior necesita una corrección de Dirección.';end if;
  update public.staff_attendance_records set check_out=now(),worked_minutes=greatest(0,floor(extract(epoch from now()-entry.check_in)/60)::int-entry.break_minutes),exit_lat=lat,exit_lon=lon,exit_accuracy=accuracy,updated_at=now() where id=entry.id;
  return entry.id;
 end if;
 perform aulanexo_private.staff_month_open(p_teacher_id,day);
 if exists(select 1 from public.staff_attendance_records where teacher_id=p_teacher_id and check_out is null) then raise exception 'Marca la salida del turno anterior o solicita una corrección.';end if;
 select value into shift from jsonb_array_elements(profile.schedule) where (value->>'weekday')::int=extract(dow from day)::int
 and not exists(select 1 from public.staff_attendance_records r where r.teacher_id=p_teacher_id and r.attendance_date=day and r.shift_key=value->>'start'||'-'||(value->>'end'))
 order by abs(extract(epoch from now()-((day+(value->>'start')::time) at time zone 'America/La_Paz'))) limit 1;
 if shift is null then raise exception 'No quedan turnos programados para hoy. Consulta con Dirección.';end if;
 start_time:=(day+(shift->>'start')::time) at time zone 'America/La_Paz';end_time:=(day+(shift->>'end')::time) at time zone 'America/La_Paz';shift_key:=(shift->>'start')||'-'||(shift->>'end');
 if now()<start_time-interval '2 hours' or now()>end_time then raise exception 'La marcación está fuera del horario de este turno. Consulta con Dirección.';end if;
 insert into public.staff_attendance_records(id,school_id,teacher_id,attendance_date,shift_key,scheduled_start,scheduled_end,check_in,break_minutes,hourly_rate,late_minutes,tolerance_minutes,late_mode,late_rate,deductions_enabled,entry_lat,entry_lon,entry_accuracy,source,created_by)
 values(p_id,profile.school_id,p_teacher_id,day,shift_key,start_time,end_time,now(),coalesce((shift->>'breakMinutes')::int,0),profile.hourly_rate,greatest(0,ceil(extract(epoch from now()-start_time)/60)::int),settings.tolerance_minutes,settings.late_mode,settings.late_rate,settings.deductions_enabled,lat,lon,accuracy,'gps',auth.uid());
 return p_id;
end $$;

create function public.correct_staff_attendance(p_school_id uuid,p_values jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare profile public.staff_work_profiles;settings public.staff_attendance_settings;old public.staff_attendance_records;shift jsonb;teacher uuid:=(p_values->>'teacherId')::uuid;
 target uuid:=coalesce(nullif(p_values->>'id','')::uuid,gen_random_uuid());entry_time timestamptz:=(p_values->>'checkIn')::timestamptz;exit_time timestamptz:=nullif(p_values->>'checkOut','')::timestamptz;day date;
begin
 perform aulanexo_private.staff_require_manager(p_school_id);
 if length(trim(coalesce(p_reason,''))) not between 10 and 1000 then raise exception 'Explica la corrección o justificación (10 a 1000 caracteres).';end if;
 select * into profile from public.staff_work_profiles where teacher_id=teacher and school_id=p_school_id;
 select * into settings from public.staff_attendance_settings where school_id=p_school_id;
 if profile.id is null or settings.school_id is null or entry_time is null or entry_time>now() or (exit_time is not null and (exit_time<entry_time or exit_time>now() or exit_time>entry_time+interval '24 hours')) then raise exception 'Revisa docente, entrada y salida.';end if;
 day:=(entry_time at time zone 'America/La_Paz')::date;
 perform pg_advisory_xact_lock(hashtext('staff-attendance-'||teacher::text));
 perform aulanexo_private.staff_month_open(teacher,day);
 select * into old from public.staff_attendance_records where id=target for update;
 if old.id is not null then
  if old.school_id<>p_school_id or old.teacher_id<>teacher then raise exception 'La marcación no pertenece a esta sede y docente.';end if;
  perform aulanexo_private.staff_month_open(teacher,old.attendance_date);
  if day<>old.attendance_date then raise exception 'La corrección conserva la fecha original de la marcación.';end if;
  insert into public.staff_attendance_changes(school_id,record_id,actor_id,previous,reason) values(p_school_id,target,auth.uid(),to_jsonb(old),trim(p_reason));
  update public.staff_attendance_records set check_in=entry_time,check_out=exit_time,worked_minutes=case when exit_time is null then 0 else greatest(0,floor(extract(epoch from exit_time-entry_time)/60)::int-break_minutes) end,
   late_minutes=greatest(0,ceil(extract(epoch from entry_time-scheduled_start)/60)::int),late_waived=coalesce((p_values->>'waiveLate')::boolean,false),source='manual',note=trim(p_reason),updated_at=now() where id=target;
 else
  select value into shift from jsonb_array_elements(profile.schedule) where (value->>'weekday')::int=extract(dow from day)::int and value->>'start'=p_values->>'shiftStart' limit 1;
  if shift is null then raise exception 'Selecciona un turno del día que estás corrigiendo.';end if;
  insert into public.staff_attendance_records(id,school_id,teacher_id,attendance_date,shift_key,scheduled_start,scheduled_end,check_in,check_out,break_minutes,worked_minutes,hourly_rate,late_minutes,tolerance_minutes,late_mode,late_rate,deductions_enabled,late_waived,source,note,created_by)
  values(target,p_school_id,teacher,day,(shift->>'start')||'-'||(shift->>'end'),(day+(shift->>'start')::time) at time zone 'America/La_Paz',(day+(shift->>'end')::time) at time zone 'America/La_Paz',entry_time,exit_time,
   coalesce((shift->>'breakMinutes')::int,0),case when exit_time is null then 0 else greatest(0,floor(extract(epoch from exit_time-entry_time)/60)::int-coalesce((shift->>'breakMinutes')::int,0)) end,
   profile.hourly_rate,greatest(0,ceil(extract(epoch from entry_time-((day+(shift->>'start')::time) at time zone 'America/La_Paz'))/60)::int),settings.tolerance_minutes,settings.late_mode,settings.late_rate,settings.deductions_enabled,coalesce((p_values->>'waiveLate')::boolean,false),'manual',trim(p_reason),auth.uid());
 end if;
 return target;
end $$;

create function aulanexo_private.staff_payroll_source(p_teacher uuid,p_period date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare profile public.staff_work_profiles;worked int;late int;discount numeric;source text;open_count int;hourly_total numeric;
begin
 select * into profile from public.staff_work_profiles where teacher_id=p_teacher;
 if profile.id is null then raise exception 'Configura el sueldo y los horarios del docente antes de preparar su boleta.';end if;
 select coalesce(sum(worked_minutes) filter(where check_out is not null),0)::int,coalesce(sum(late_minutes),0)::int,
 coalesce(sum(case when late_waived or not deductions_enabled or late_minutes<=tolerance_minutes then 0
 else round((case late_mode when 'excess' then greatest(0,late_minutes-tolerance_minutes) else late_minutes end)*late_rate,2) end),0),
 count(*) filter(where check_out is null)::int,coalesce(sum(round(worked_minutes*hourly_rate/60,2)) filter(where check_out is not null),0),
 md5(coalesce(jsonb_agg(jsonb_build_array(id,check_in,check_out,worked_minutes,late_minutes,tolerance_minutes,late_mode,late_rate,deductions_enabled,late_waived,hourly_rate,updated_at) order by check_in,id)::text,'[]')||to_jsonb(profile)::text)
 into worked,late,discount,open_count,hourly_total,source from public.staff_attendance_records where teacher_id=p_teacher and attendance_date>=p_period and attendance_date<(p_period+interval '1 month')::date;
 return jsonb_build_object('profile',to_jsonb(profile),'workedMinutes',worked,'lateMinutes',late,'lateDeduction',discount,'openCount',open_count,'sourceHash',source,
 'baseAmount',case profile.pay_type when 'monthly' then profile.monthly_salary else hourly_total end);
end $$;

create function public.prepare_staff_payroll(p_teacher_id uuid,p_period date) returns uuid language plpgsql security definer set search_path='' as $$
declare profile public.staff_work_profiles;old public.staff_payrolls;source jsonb;target uuid;begin
 select * into profile from public.staff_work_profiles where teacher_id=p_teacher_id;
 perform aulanexo_private.staff_require_manager(profile.school_id);
 if p_period is null or extract(day from p_period)<>1 or p_period>date_trunc('month',now() at time zone 'America/La_Paz')::date then raise exception 'Selecciona una gestión y mes válidos.';end if;
 perform pg_advisory_xact_lock(hashtext('staff-attendance-'||p_teacher_id::text));
 select * into old from public.staff_payrolls where teacher_id=p_teacher_id and period=p_period for update;
 if old.id is not null and old.status<>'draft' then raise exception 'La boleta aprobada conserva sus importes y su historial.';end if;
 source:=aulanexo_private.staff_payroll_source(p_teacher_id,p_period);
 insert into public.staff_payrolls(school_id,teacher_id,period,profile_snapshot,source_hash,worked_minutes,late_minutes,base_amount,late_deduction,gross_amount,deductions,net_amount)
 values(profile.school_id,p_teacher_id,p_period,(source->'profile')||jsonb_build_object('teacherName',(select name from public.teachers where id=p_teacher_id),'institutionName',(select name from public.schools where id=profile.school_id),'nit',(select nit from public.schools where id=profile.school_id)),source->>'sourceHash',(source->>'workedMinutes')::int,(source->>'lateMinutes')::int,(source->>'baseAmount')::numeric,(source->>'lateDeduction')::numeric,
 (source->>'baseAmount')::numeric,(source->>'lateDeduction')::numeric,(source->>'baseAmount')::numeric-(source->>'lateDeduction')::numeric)
 on conflict(teacher_id,period) do update set profile_snapshot=excluded.profile_snapshot,source_hash=excluded.source_hash,worked_minutes=excluded.worked_minutes,late_minutes=excluded.late_minutes,
 base_amount=excluded.base_amount,late_deduction=excluded.late_deduction,gross_amount=excluded.gross_amount,deductions=excluded.deductions,net_amount=excluded.net_amount,adjustments='[]',note='',updated_at=now()
 returning id into target;
 return target;
end $$;

create function public.edit_staff_payroll(p_id uuid,p_adjustments jsonb,p_note text default '') returns void language plpgsql security definer set search_path='' as $$
declare payroll public.staff_payrolls;entry jsonb;earning numeric:=0;deduction numeric:=0;amount numeric;begin
 select * into payroll from public.staff_payrolls where id=p_id for update;
 perform aulanexo_private.staff_require_manager(payroll.school_id);
 if payroll.status<>'draft' then raise exception 'Solo pueden modificarse boletas en borrador.';end if;
 if p_adjustments is null or jsonb_typeof(p_adjustments)<>'array' or jsonb_array_length(p_adjustments)>50 then raise exception 'Revisa los conceptos de la boleta.';end if;
 for entry in select value from jsonb_array_elements(p_adjustments) loop
  amount:=(entry->>'amount')::numeric;
  if amount is null or amount<0 or amount>1000000 or round(amount,2)<>amount or entry->>'kind' is null or entry->>'kind' not in ('earning','deduction') or length(trim(coalesce(entry->>'label',''))) not between 2 and 160 then raise exception 'Cada concepto necesita tipo, descripción e importe válido con hasta dos decimales.';end if;
  if entry->>'kind'='earning' then earning:=earning+amount;else deduction:=deduction+amount;end if;
 end loop;
 update public.staff_payrolls set adjustments=p_adjustments,note=left(coalesce(p_note,''),2000),gross_amount=base_amount+earning,deductions=late_deduction+deduction,
 net_amount=base_amount+earning-late_deduction-deduction,updated_at=now() where id=p_id;
end $$;

create function public.approve_staff_payroll(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare payroll public.staff_payrolls;source jsonb;begin
 select * into payroll from public.staff_payrolls where id=p_id;
 perform aulanexo_private.staff_require_manager(payroll.school_id);
 perform pg_advisory_xact_lock(hashtext('staff-attendance-'||payroll.teacher_id::text));
 select * into payroll from public.staff_payrolls where id=p_id for update;
 if payroll.status<>'draft' then raise exception 'La boleta ya no está en borrador.';end if;
 if payroll.period+interval '1 month'>(now() at time zone 'America/La_Paz')::date then raise exception 'La boleta mensual se aprueba cuando termina el mes.';end if;
 source:=aulanexo_private.staff_payroll_source(payroll.teacher_id,payroll.period);
 if (source->>'openCount')::int>0 then raise exception 'Corrige las marcaciones sin salida antes de aprobar.';end if;
 if source->>'sourceHash'<>payroll.source_hash then raise exception 'La asistencia o el sueldo cambió. Recalcula el borrador y revisa sus conceptos antes de aprobar.';end if;
 if payroll.net_amount<0 then raise exception 'Los descuentos no pueden superar el total ganado.';end if;
 update public.staff_payrolls set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=p_id;
 insert into public.notifications(user_id,school_id,kind,source_id,title,body,target)
 select t.user_id,payroll.school_id,'payment',payroll.id,'Tu boleta de pago está disponible','Dirección aprobó la boleta de '||to_char(payroll.period,'MM/YYYY')||'. Puedes consultarla en MiCole.','staffPayroll'
 from public.teachers t where t.id=payroll.teacher_id and t.user_id is not null on conflict(user_id,kind,source_id) do nothing;
end $$;

create function public.record_staff_payroll_payment(p_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare payroll public.staff_payrolls;begin
 select * into payroll from public.staff_payrolls where id=p_id for update;
 perform aulanexo_private.staff_require_manager(payroll.school_id);
 if payroll.status<>'approved' then raise exception 'Solo se registra el pago de una boleta aprobada.';end if;
 if p_method is null or p_method not in ('cash','transfer','deposit') or length(trim(coalesce(p_reference,''))) not between 3 and 160 then raise exception 'Registra el método y la referencia del pago efectuado.';end if;
 update public.staff_payrolls set status='paid',payment_method=p_method,payment_reference=trim(p_reference),paid_by=auth.uid(),paid_at=now(),updated_at=now() where id=p_id;
end $$;

create function public.staff_workspace(p_school_id uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare manager boolean:=aulanexo_private.staff_manager(p_school_id);begin
 if p_month is null or extract(day from p_month)<>1 then raise exception 'Selecciona un mes válido.';end if;
 if not manager and not exists(select 1 from public.teachers t where t.school_id=p_school_id and aulanexo_private.staff_reader(p_school_id,t.id)) then raise exception 'No tienes acceso al equipo de esta sede.';end if;
 return jsonb_build_object('canManage',manager,'settings',(select to_jsonb(s) from public.staff_attendance_settings s where s.school_id=p_school_id),
 'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name) from public.teachers t where t.school_id=p_school_id and (manager or aulanexo_private.staff_reader(t.school_id,t.id))),'[]'),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p)) from public.staff_work_profiles p where p.school_id=p_school_id and (manager or aulanexo_private.staff_reader(p.school_id,p.teacher_id))),'[]'),
 'records',coalesce((select jsonb_agg(to_jsonb(r) order by r.check_in desc) from public.staff_attendance_records r where r.school_id=p_school_id and r.attendance_date>=p_month and r.attendance_date<(p_month+interval '1 month')::date and (manager or aulanexo_private.staff_reader(r.school_id,r.teacher_id))),'[]'),
 'openRecords',coalesce((select jsonb_agg(to_jsonb(r)) from public.staff_attendance_records r where r.school_id=p_school_id and r.check_out is null and (manager or aulanexo_private.staff_reader(r.school_id,r.teacher_id))),'[]'),
 'payrolls',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from public.staff_payrolls p where p.school_id=p_school_id and p.period=p_month and (manager or (p.status<>'draft' and aulanexo_private.staff_reader(p.school_id,p.teacher_id)))),'[]'));
end $$;

-- All writes go through checked RPCs; helper functions are not API entry points.
do $$declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='aulanexo_private' and p.proname like 'staff_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
-- These two predicates are required for RLS evaluation, without granting writes.
grant execute on function aulanexo_private.staff_manager(uuid),aulanexo_private.staff_reader(uuid,uuid) to authenticated;
revoke all on function public.save_staff_settings(uuid,jsonb),public.save_staff_profile(uuid,jsonb),public.mark_staff_attendance(uuid,text,jsonb,uuid),public.correct_staff_attendance(uuid,jsonb,text),public.prepare_staff_payroll(uuid,date),public.edit_staff_payroll(uuid,jsonb,text),public.approve_staff_payroll(uuid),public.record_staff_payroll_payment(uuid,text,text),public.staff_workspace(uuid,date) from public,anon;
grant execute on function public.save_staff_settings(uuid,jsonb),public.save_staff_profile(uuid,jsonb),public.mark_staff_attendance(uuid,text,jsonb,uuid),public.correct_staff_attendance(uuid,jsonb,text),public.prepare_staff_payroll(uuid,date),public.edit_staff_payroll(uuid,jsonb,text),public.approve_staff_payroll(uuid),public.record_staff_payroll_payment(uuid,text,text),public.staff_workspace(uuid,date) to authenticated;
create trigger staff_profile_audit after insert or update on public.staff_work_profiles for each row execute function aulanexo_private.capture_audit();
create trigger staff_attendance_audit after insert or update on public.staff_attendance_records for each row execute function aulanexo_private.capture_audit();
create trigger staff_payroll_audit after insert or update on public.staff_payrolls for each row execute function aulanexo_private.capture_audit();
