-- Arrival control is optional per site; payroll and reviewed manual records stay independent.
-- Existing configured sites keep their prior behavior. New settings require explicit opt-in.
alter table public.staff_attendance_settings add column arrival_enabled boolean not null default false;
update public.staff_attendance_settings set arrival_enabled=true;

-- Pure selector shared by the real marking RPC and deterministic regression tests.
-- The caller supplies only server time; this helper is never available to API clients.
create function aulanexo_private.staff_arrival_shift(p_schedule jsonb,p_day date,p_at timestamptz,p_completed text[])
returns jsonb language sql immutable set search_path='' as $$
 select s.value from jsonb_array_elements(p_schedule) as s(value)
 cross join lateral (select (p_day+(s.value->>'start')::time) at time zone 'America/La_Paz' as starts,
  (p_day+(s.value->>'end')::time) at time zone 'America/La_Paz' as ends) w
 where (s.value->>'weekday')::int=extract(dow from p_day)::int
 and not ((s.value->>'start')||'-'||(s.value->>'end')=any(coalesce(p_completed,array[]::text[])))
 and p_at between w.starts-interval '2 hours' and w.ends
 order by case when p_at>=w.starts then 0 else 1 end,
  abs(extract(epoch from p_at-w.starts)),w.starts
 limit 1;
$$;
revoke all on function aulanexo_private.staff_arrival_shift(jsonb,date,timestamptz,text[]) from public,anon,authenticated;

create or replace function public.save_staff_settings(p_school_id uuid,p_values jsonb) returns void language plpgsql security definer set search_path='' as $$
declare arrival boolean;
begin
 perform aulanexo_private.staff_require_manager(p_school_id);
 if p_values->>'latitude' is null or p_values->>'longitude' is null then raise exception 'Define la ubicación de la sede.';end if;
 if coalesce((p_values->>'deductionsEnabled')::boolean,false) and length(trim(coalesce(p_values->>'policyNote','')))<10 then raise exception 'Indica el reglamento o acuerdo que respalda los descuentos propuestos.';end if;
 insert into public.staff_attendance_settings(school_id,latitude,longitude,radius_m,max_accuracy_m,tolerance_minutes,late_mode,late_rate,deductions_enabled,policy_note,updated_by,arrival_enabled)
 values(p_school_id,(p_values->>'latitude')::double precision,(p_values->>'longitude')::double precision,coalesce((p_values->>'radiusM')::int,150),coalesce((p_values->>'maxAccuracyM')::int,50),
 coalesce((p_values->>'toleranceMinutes')::int,10),coalesce(p_values->>'lateMode','excess'),coalesce((p_values->>'lateRate')::numeric,0),coalesce((p_values->>'deductionsEnabled')::boolean,false),left(coalesce(p_values->>'policyNote',''),2000),auth.uid(),coalesce((p_values->>'arrivalEnabled')::boolean,false))
 on conflict(school_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,radius_m=excluded.radius_m,max_accuracy_m=excluded.max_accuracy_m,tolerance_minutes=excluded.tolerance_minutes,
 late_mode=excluded.late_mode,late_rate=excluded.late_rate,deductions_enabled=excluded.deductions_enabled,policy_note=excluded.policy_note,updated_by=auth.uid(),updated_at=now(),
 arrival_enabled=case when p_values ? 'arrivalEnabled' then excluded.arrival_enabled else public.staff_attendance_settings.arrival_enabled end
 returning arrival_enabled into arrival;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_school_id,auth.uid(),'Dirección','staff_attendance_settings',p_school_id,'UPDATE',jsonb_build_object('name','Reglas de asistencia y descuentos','arrivalEnabled',arrival));
end $$;

create or replace function public.mark_staff_attendance(p_teacher_id uuid,p_kind text,p_location jsonb,p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
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
 -- Serialize GPS checks with a concurrent site toggle.
 select * into settings from public.staff_attendance_settings where school_id=profile.school_id for share;
 if settings.school_id is null then raise exception 'Dirección debe configurar la ubicación de la sede.';end if;
 if not settings.arrival_enabled then raise exception 'El control de llegada está desactivado en esta sede. Consulta con Dirección.';end if;
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
 -- Filter allowed windows before ranking. A current shift wins over an upcoming one,
 -- even if the upcoming start is nearer. Never accept a client-provided clock.
 shift:=aulanexo_private.staff_arrival_shift(profile.schedule,day,now(),array(
  select r.shift_key from public.staff_attendance_records r where r.teacher_id=p_teacher_id and r.attendance_date=day));
 if shift is null then
  if exists(select 1 from jsonb_array_elements(profile.schedule) s where (s->>'weekday')::int=extract(dow from day)::int
   and not exists(select 1 from public.staff_attendance_records r where r.teacher_id=p_teacher_id and r.attendance_date=day and r.shift_key=(s->>'start')||'-'||(s->>'end'))) then
   raise exception 'La marcación está fuera del horario de este turno. Consulta con Dirección.';
  end if;
  raise exception 'No quedan turnos programados para hoy. Consulta con Dirección.';
 end if;
 start_time:=(day+(shift->>'start')::time) at time zone 'America/La_Paz';end_time:=(day+(shift->>'end')::time) at time zone 'America/La_Paz';shift_key:=(shift->>'start')||'-'||(shift->>'end');
 if now()<start_time-interval '2 hours' or now()>end_time then raise exception 'La marcación está fuera del horario de este turno. Consulta con Dirección.';end if;
 insert into public.staff_attendance_records(id,school_id,teacher_id,attendance_date,shift_key,scheduled_start,scheduled_end,check_in,break_minutes,hourly_rate,late_minutes,tolerance_minutes,late_mode,late_rate,deductions_enabled,entry_lat,entry_lon,entry_accuracy,source,created_by)
 values(p_id,profile.school_id,p_teacher_id,day,shift_key,start_time,end_time,now(),coalesce((shift->>'breakMinutes')::int,0),profile.hourly_rate,greatest(0,ceil(extract(epoch from now()-start_time)/60)::int),settings.tolerance_minutes,settings.late_mode,settings.late_rate,settings.deductions_enabled,lat,lon,accuracy,'gps',auth.uid());
 return p_id;
end $$;

-- Keep exactly the existing authenticated entry points; no table writes or helper grants.
revoke all on function public.save_staff_settings(uuid,jsonb),public.mark_staff_attendance(uuid,text,jsonb,uuid) from public,anon;
grant execute on function public.save_staff_settings(uuid,jsonb),public.mark_staff_attendance(uuid,text,jsonb,uuid) to authenticated;
