-- MiCole: reportes financieros de solo lectura, sin truncar movimientos.
-- Dirección consulta su institución; la plataforma recibe únicamente sus licencias y activaciones.
create function public.financial_report(
 p_school_id uuid default null,
 p_from date default null,
 p_to date default null,
 p_classroom_id uuid default null,
 p_student_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
 v_platform boolean;
 v_today date := (now() at time zone 'America/La_Paz')::date;
 v_from date;
 v_to date;
 v_student public.students;
 v_schools jsonb;
 v_classrooms jsonb := '[]'::jsonb;
 v_students jsonb := '[]'::jsonb;
 v_charges jsonb;
 v_payments jsonb;
begin
 -- Comprobar autorización antes de validar filtros evita revelar registros ajenos.
 if auth.uid() is null then
  raise exception 'Acceso no autorizado a reportes financieros.' using errcode='42501';
 end if;
 v_platform := public.is_platform_admin();
 if not v_platform and (p_school_id is null or not public.has_school_role(p_school_id,array['director'])) then
  raise exception 'Acceso no autorizado a reportes financieros.' using errcode='42501';
 end if;

 v_from := coalesce(p_from,date_trunc('year',v_today::timestamp)::date);
 v_to := coalesce(p_to,v_today);
 if not isfinite(v_from) or not isfinite(v_to) or v_from>v_to then
  raise exception 'Selecciona un rango de fechas válido.' using errcode='22023';
 end if;
 if v_to-v_from>3660 then
  raise exception 'El rango de reportes no puede superar diez años.' using errcode='22023';
 end if;

 if v_platform then
  if p_classroom_id is not null or p_student_id is not null then
   raise exception 'Los reportes de plataforma se filtran por institución.' using errcode='22023';
  end if;
  if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id) then
   raise exception 'La institución seleccionada no existe.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'status',s.status) order by s.name,s.id),'[]'::jsonb)
   into v_schools from public.schools s where p_school_id is null or s.id=p_school_id;

  select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'schoolId',c.school_id,
   'concept',case when c.student_id is null then c.concept else 'Activación inicial' end,
   'date',to_char(case when c.student_id is null then (c.period||'-01')::date else (c.created_at at time zone 'America/La_Paz')::date end,'YYYY-MM-DD'),
   'amount',c.amount,'status',c.status,
   'kind',case when c.student_id is null then 'license' else 'activation' end,
   'licenseCount',case when c.student_id is null and mod(c.amount,29)=0 then (c.amount/29)::integer else null end
  ) order by case when c.student_id is null then (c.period||'-01')::date else (c.created_at at time zone 'America/La_Paz')::date end,c.id),'[]'::jsonb)
  into v_charges from public.platform_charges c
  where (p_school_id is null or c.school_id=p_school_id)
   and case when c.student_id is null then (c.period||'-01')::date else (c.created_at at time zone 'America/La_Paz')::date end between v_from and v_to;

  select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'chargeId',c.id,'schoolId',c.school_id,
   'concept',case when c.student_id is null then c.concept else 'Activación inicial' end,
   'date',to_char((p.paid_at at time zone 'America/La_Paz')::date,'YYYY-MM-DD'),
   'amount',p.amount,'method',p.payment_method,'reference',p.reference
  ) order by (p.paid_at at time zone 'America/La_Paz')::date,p.id),'[]'::jsonb)
  into v_payments from public.platform_payments p join public.platform_charges c on c.id=p.charge_id
  where (p_school_id is null or c.school_id=p_school_id)
   and (p.paid_at at time zone 'America/La_Paz')::date between v_from and v_to;
 else
  if p_classroom_id is not null and not exists(select 1 from public.classrooms where id=p_classroom_id and school_id=p_school_id) then
   raise exception 'El curso no pertenece a la institución seleccionada.' using errcode='22023';
  end if;
  if p_student_id is not null then
   select * into v_student from public.students where id=p_student_id and school_id=p_school_id;
   if v_student.id is null then
    raise exception 'El alumno no pertenece a la institución seleccionada.' using errcode='22023';
   end if;
   if p_classroom_id is not null and v_student.classroom_id is distinct from p_classroom_id then
    raise exception 'El alumno no pertenece al curso seleccionado.' using errcode='22023';
   end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'status',s.status)),'[]'::jsonb)
   into v_schools from public.schools s where s.id=p_school_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]'::jsonb)
   into v_classrooms from public.classrooms c where c.school_id=p_school_id;
  select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',concat_ws(' ',s.first_name,s.last_name),'classroomId',s.classroom_id,'status',s.status) order by s.last_name,s.first_name,s.id),'[]'::jsonb)
   into v_students from public.students s where s.school_id=p_school_id
   and (p_classroom_id is null or s.classroom_id=p_classroom_id)
   and (p_student_id is null or s.id=p_student_id);

  select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'schoolId',c.school_id,'studentId',c.student_id,'concept',c.concept,
   'date',to_char(c.due_date,'YYYY-MM-DD'),'dueDate',to_char(c.due_date,'YYYY-MM-DD'),
   'amount',c.amount,'status',case when c.status='pending' and c.due_date<v_today then 'overdue' else c.status end,'kind','tuition'
  ) order by c.due_date,c.id),'[]'::jsonb)
  into v_charges from public.school_charges c join public.students s on s.id=c.student_id and s.school_id=c.school_id
  where c.school_id=p_school_id and c.due_date between v_from and v_to
   and (p_classroom_id is null or s.classroom_id=p_classroom_id)
   and (p_student_id is null or s.id=p_student_id);

  -- Se usa la fecha del pago: una cuota anterior también puede cobrarse en este período.
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',p.id,'chargeId',c.id,'schoolId',c.school_id,'studentId',c.student_id,'concept',c.concept,
   'date',to_char((p.paid_at at time zone 'America/La_Paz')::date,'YYYY-MM-DD'),
   'amount',p.amount,'method',p.payment_method,'reference',p.reference
  ) order by (p.paid_at at time zone 'America/La_Paz')::date,p.id),'[]'::jsonb)
  into v_payments from public.school_payments p join public.school_charges c on c.id=p.charge_id
   join public.students s on s.id=c.student_id and s.school_id=c.school_id
  where c.school_id=p_school_id and p.verification_state='verified'
   and (p.paid_at at time zone 'America/La_Paz')::date between v_from and v_to
   and (p_classroom_id is null or s.classroom_id=p_classroom_id)
   and (p_student_id is null or s.id=p_student_id);
 end if;
 return jsonb_build_object(
  'scope',case when v_platform then 'platform' else 'school' end,
  'fromDate',to_char(v_from,'YYYY-MM-DD'),'toDate',to_char(v_to,'YYYY-MM-DD'),'generatedAt',now(),
  'schools',v_schools,'classrooms',v_classrooms,'students',v_students,'charges',v_charges,'payments',v_payments
 );
end $$;
revoke all on function public.financial_report(uuid,date,date,uuid,uuid) from public,anon;
grant execute on function public.financial_report(uuid,date,date,uuid,uuid) to authenticated;
