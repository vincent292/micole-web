-- Operaciones reales, invitaciones, agenda y facturación transaccional.
-- Aplicar DESPUÉS de 202610130001_initial.sql.
alter table public.schools add column logo_url text not null default '', add column phone text not null default '';
alter table public.students
  add column food_restrictions text not null default '',
  add column emergency_contact text not null default '',
  add column emergency_phone text not null default '',
  add column profile_complete boolean not null default false,
  add column access_until date,
  add column snack_fee numeric(12,2) not null default 0 check(snack_fee >= 0),
  add column enrollment_fee numeric(12,2) not null default 0 check(enrollment_fee >= 0);
alter table public.daily_entries drop constraint daily_entries_category_check;
alter table public.daily_entries add constraint daily_entries_category_check check(category in ('actividad','alimentación','descanso','observación','tarea'));
create table public.payment_plans (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
  start_date date not null, months integer not null check(months between 1 and 36),
  monthly_fee numeric(12,2) not null check(monthly_fee >= 0), snack_fee numeric(12,2) not null default 0 check(snack_fee >= 0),
  enrollment_fee numeric(12,2) not null default 0 check(enrollment_fee >= 0), due_day integer not null check(due_day between 1 and 28),
  discount numeric(12,2) not null default 0 check(discount >= 0), discount_from date, discount_to date,
  prorate boolean not null default false, created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id),
  check(discount = 0 or (discount_from is not null and discount_to is not null and discount_from <= discount_to))
);
alter table public.school_charges add column period text,
  add column plan_id uuid references public.payment_plans(id),
  add column base_amount numeric(12,2) not null default 0,
  add column snack_amount numeric(12,2) not null default 0,
  add column license_amount numeric(12,2) not null default 0,
  add column discount_amount numeric(12,2) not null default 0,
  add column invoice_name text not null default '', add column invoice_nit text not null default '', add column invoice_phone text not null default '';
create unique index charges_unique_student_period on public.school_charges(student_id,period) where period is not null and status <> 'cancelled';
create table public.platform_payments (
  id uuid primary key default gen_random_uuid(), charge_id uuid not null references public.platform_charges(id),
  amount numeric(12,2) not null check(amount>0), payment_method text not null check(payment_method in ('cash','transfer','qr')),
  reference text not null, created_by uuid not null references auth.users(id), paid_at timestamptz not null default now()
);
alter table public.school_payments add column reference text not null default '';
create table public.invitations (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id),
  student_id uuid, teacher_id uuid, email text not null,
  role text not null check(role in ('director','teacher','guardian')), relationship text not null default 'other' check(relationship in ('mother','father','guardian','other')),
  token_hash text unique not null, expires_at timestamptz not null default now()+interval '7 days',
  status text not null default 'pending' check(status in ('pending','accepted','revoked')),
  created_by uuid not null references auth.users(id), accepted_by uuid references auth.users(id),
  foreign key(student_id,school_id) references public.students(id,school_id), foreign key(teacher_id,school_id) references public.teachers(id,school_id),
  check((role='guardian' and student_id is not null and teacher_id is null) or (role='teacher' and teacher_id is not null and student_id is null) or (role='director' and student_id is null and teacher_id is null))
);
create table public.family_requests (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
  type text not null check(type in ('absence','pickup')), request_date date not null,
  reason text not null check(length(trim(reason))>0), pickup_name text not null default '', pickup_id text not null default '', vehicle_plate text not null default '',
  status text not null default 'pending' check(status in ('pending','approved','rejected')), response text not null default '',
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id),
  check(type <> 'pickup' or (length(trim(pickup_name))>0 and length(trim(pickup_id))>0))
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), classroom_id uuid,
  title text not null, description text not null, event_date date not null, type text not null check(type in ('event','homework','materials')),
  created_by uuid not null default auth.uid() references auth.users(id),
  foreign key(classroom_id,school_id) references public.classrooms(id,school_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
  body text not null check(length(trim(body)) between 1 and 4000), author_id uuid not null references auth.users(id),
  author_name text not null, author_role text not null check(author_role in ('superadmin','director','teacher','guardian')),
  created_at timestamptz not null default now(), foreign key(student_id,school_id) references public.students(id,school_id)
);
create table public.grades (
  id uuid primary key default gen_random_uuid(), school_id uuid not null references public.schools(id), student_id uuid not null,
  subject text not null, period text not null, score text not null, recommendation text not null,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id)
);
alter table public.media_assets add column caption text not null default '';
create index messages_student_date on public.messages(student_id,created_at);
create index requests_school_date on public.family_requests(school_id,request_date);
create index events_school_date on public.calendar_events(school_id,event_date);

-- Helpers. Los permisos dependen de auth.uid(), nunca del rol que envía React.
create or replace function public.may_teacher_write(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.students s join public.teacher_classrooms tc on tc.classroom_id=s.classroom_id and tc.school_id=s.school_id
  join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id
  join public.schools sch on sch.id=s.school_id
  where s.id=p_student_id and t.user_id=auth.uid() and t.status='active' and sch.status='active' and public.has_school_role(s.school_id,array['teacher']));
$$;
create function public.is_verified_guardian(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_guardians g join public.students s on s.id=g.student_id
 where g.student_id=p_student_id and g.user_id=auth.uid() and g.verified_at is not null and g.can_view and public.has_school_role(s.school_id,array['guardian']));
$$;
create or replace function public.may_access_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.students s where s.id=p_student_id and (public.is_platform_admin() or public.has_school_role(s.school_id,array['director','secretary']) or public.is_verified_guardian(s.id) or public.may_teacher_write(s.id)));
$$;
create function public.family_access(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_verified_guardian(p_student_id) and exists(select 1 from public.students s join public.schools sch on sch.id=s.school_id
 where s.id=p_student_id and s.status='active' and s.profile_complete and sch.status='active'
 and not exists(select 1 from public.platform_charges c where c.student_id=s.id and c.status not in ('paid','cancelled'))
 and ((s.access_until is not null and s.access_until >= (now() at time zone 'America/La_Paz')::date)
 or not exists(select 1 from public.school_charges c where c.student_id=s.id and (c.status='overdue' or (c.status='pending' and c.due_date < (now() at time zone 'America/La_Paz')::date)))));
$$;
create function public.may_use_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.may_manage_student(p_student_id) or public.may_teacher_write(p_student_id) or public.family_access(p_student_id);
$$;
create function public.may_use_classroom(p_school_id uuid,p_classroom_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or public.has_school_role(p_school_id,array['director'])
 or exists(select 1 from public.students s where s.school_id=p_school_id and (p_classroom_id is null or s.classroom_id=p_classroom_id) and public.may_use_student(s.id));
$$;
create function public.may_edit_classroom(p_school_id uuid,p_classroom_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or public.has_school_role(p_school_id,array['director'])
 or (p_classroom_id is not null and public.has_school_role(p_school_id,array['teacher']) and exists(select 1 from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id where tc.school_id=p_school_id and tc.classroom_id=p_classroom_id and t.user_id=auth.uid() and t.status='active'));
$$;

create function public.workspace_identity() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if auth.uid() is null then raise exception 'Inicia sesión para continuar.'; end if;
 select jsonb_build_object('id',u.id,'email',u.email,'name',coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email),
 'roles',coalesce((select jsonb_agg(r order by case r when 'superadmin' then 0 when 'director' then 1 when 'teacher' then 2 else 3 end) from
 (select 'superadmin' as r where public.is_platform_admin() union select role from public.school_memberships where user_id=auth.uid() and active and role in ('director','teacher','guardian')) roles),'[]'::jsonb),
 'memberships',coalesce((select jsonb_agg(jsonb_build_object('schoolId',school_id,'role',role)) from public.school_memberships where user_id=auth.uid() and active and role in ('director','teacher','guardian')),'[]'::jsonb),
 'guardianStudentIds',coalesce((select jsonb_agg(student_id) from public.student_guardians where user_id=auth.uid() and verified_at is not null and can_view),'[]'::jsonb),
 'teacherIds',coalesce((select jsonb_agg(id) from public.teachers where user_id=auth.uid() and status='active'),'[]'::jsonb)) into result from auth.users u where u.id=auth.uid();
 return result;
end $$;

create function public.save_school(p_school jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid := (p_school->>'id')::uuid; begin
 if public.is_platform_admin() then
  insert into public.schools(id,name,slug,city,director_name,brand_color,status,logo_url,phone)
  values(sid,p_school->>'name',p_school->>'slug',coalesce(p_school->>'city',''),coalesce(p_school->>'director_name',''),coalesce(p_school->>'brand_color','#7460d5'),coalesce(p_school->>'status','pending'),coalesce(p_school->>'logo_url',''),coalesce(p_school->>'phone',''))
  on conflict(id) do update set name=excluded.name,city=excluded.city,director_name=excluded.director_name,brand_color=excluded.brand_color,status=excluded.status,logo_url=excluded.logo_url,phone=excluded.phone;
 elsif public.has_school_role(sid,array['director']) then
  update public.schools set name=p_school->>'name',city=coalesce(p_school->>'city',''),brand_color=coalesce(p_school->>'brand_color','#7460d5'),logo_url=coalesce(p_school->>'logo_url',''),phone=coalesce(p_school->>'phone','') where id=sid;
 else raise exception 'No puedes modificar esta institución.'; end if;
end $$;
create function public.save_teacher(p_teacher jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_teacher->>'school_id')::uuid; tid uuid:=(p_teacher->>'id')::uuid; begin
 if not (public.is_platform_admin() or public.has_school_role(sid,array['director'])) then raise exception 'No tienes permiso para gestionar docentes.'; end if;
 if exists(select 1 from public.teachers where id=tid and school_id<>sid) then raise exception 'La docente pertenece a otra institución.'; end if;
 insert into public.teachers(id,school_id,name,email,specialty,status) values(tid,sid,p_teacher->>'name',lower(trim(p_teacher->>'email')),coalesce(p_teacher->>'specialty',''),coalesce(p_teacher->>'status','pending'))
 on conflict(id) do update set name=excluded.name,email=excluded.email,specialty=excluded.specialty,status=excluded.status;
 update public.school_memberships set active=(p_teacher->>'status'='active') where school_id=sid and role='teacher' and user_id=(select user_id from public.teachers where id=tid);
end $$;
create function public.save_classroom(p_room jsonb,p_teacher_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_room->>'school_id')::uuid; cid uuid:=(p_room->>'id')::uuid; begin
 if not (public.is_platform_admin() or public.has_school_role(sid,array['director'])) then raise exception 'No tienes permiso para gestionar aulas.'; end if;
 if exists(select 1 from public.classrooms where id=cid and school_id<>sid) then raise exception 'El aula pertenece a otra institución.'; end if;
 if exists(select 1 from unnest(p_teacher_ids) t(id) where not exists(select 1 from public.teachers where id=t.id and school_id=sid)) then raise exception 'Una docente pertenece a otra institución.'; end if;
 insert into public.classrooms(id,school_id,name,level,schedule,academic_year) values(cid,sid,p_room->>'name',coalesce(p_room->>'level',''),coalesce(p_room->>'schedule',''),extract(year from current_date)::integer)
 on conflict(id) do update set name=excluded.name,level=excluded.level,schedule=excluded.schedule;
 delete from public.teacher_classrooms where classroom_id=cid;
 insert into public.teacher_classrooms(school_id,teacher_id,classroom_id) select sid,id,cid from (select distinct unnest(p_teacher_ids) as id) t;
end $$;
create function public.enroll_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_student->>'school_id')::uuid; student_id uuid:=(p_student->>'id')::uuid; begin
 if not (public.is_platform_admin() or public.has_school_role(sid,array['director'])) then raise exception 'No tienes permiso para inscribir estudiantes.'; end if;
 if (p_student->>'birth_date')::date > current_date then raise exception 'Fecha de nacimiento inválida.'; end if;
 insert into public.students(id,school_id,classroom_id,first_name,last_name,birth_date,primary_guardian_name,primary_guardian_email,allergies,monthly_fee,snack_fee,enrollment_fee)
 values(student_id,sid,(p_student->>'classroom_id')::uuid,p_student->>'first_name',p_student->>'last_name',(p_student->>'birth_date')::date,coalesce(p_student->>'primary_guardian_name',''),lower(coalesce(p_student->>'primary_guardian_email','')),coalesce(p_student->>'allergies',''),coalesce((p_student->>'monthly_fee')::numeric,0),coalesce((p_student->>'snack_fee')::numeric,0),coalesce((p_student->>'enrollment_fee')::numeric,0));
 insert into public.platform_charges(school_id,student_id,concept,period,amount) values(sid,student_id,'Activación de '||(p_student->>'first_name')||' '||(p_student->>'last_name'),to_char((now() at time zone 'America/La_Paz')::date,'YYYY-MM'),50);
end $$;
create function public.save_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_student->>'id')::uuid; begin
 if not public.may_manage_student(sid) then raise exception 'No tienes permiso para modificar este estudiante.'; end if;
 if (p_student->>'birth_date')::date > current_date then raise exception 'Fecha de nacimiento inválida.'; end if;
 update public.students set classroom_id=(p_student->>'classroom_id')::uuid,first_name=p_student->>'first_name',last_name=p_student->>'last_name',birth_date=(p_student->>'birth_date')::date,
 primary_guardian_name=coalesce(p_student->>'primary_guardian_name',''),primary_guardian_email=lower(coalesce(p_student->>'primary_guardian_email','')),
 allergies=coalesce(p_student->>'allergies',''),monthly_fee=coalesce((p_student->>'monthly_fee')::numeric,0),snack_fee=coalesce((p_student->>'snack_fee')::numeric,0),enrollment_fee=coalesce((p_student->>'enrollment_fee')::numeric,0),access_until=(p_student->>'access_until')::date where id=sid;
end $$;
create function public.complete_student_profile(p_student_id uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not (public.may_manage_student(p_student_id) or public.is_verified_guardian(p_student_id)) then raise exception 'No tienes acceso a este estudiante.'; end if;
 if length(trim(coalesce(p_profile->>'allergies','')))=0 or length(trim(coalesce(p_profile->>'foodRestrictions','')))=0 or length(trim(coalesce(p_profile->>'emergencyContact','')))=0 or length(trim(coalesce(p_profile->>'emergencyPhone','')))=0 then raise exception 'Completa los datos de salud y emergencia.'; end if;
 update public.students set allergies=trim(p_profile->>'allergies'),food_restrictions=trim(p_profile->>'foodRestrictions'),emergency_contact=trim(p_profile->>'emergencyContact'),emergency_phone=trim(p_profile->>'emergencyPhone'),profile_complete=true where id=p_student_id;
end $$;
create function public.set_student_status(p_student_id uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.may_manage_student(p_student_id) then raise exception 'No tienes permiso para modificar la inscripción.'; end if;
 perform 1 from public.students where id=p_student_id for update;
 if p_status not in ('active','inactive','pending') then raise exception 'Estado inválido.'; end if;
 if p_status='active' and exists(select 1 from public.platform_charges where student_id=p_student_id and status not in ('paid','cancelled')) then raise exception 'La activación de Bs 50 sigue pendiente.'; end if;
 update public.students set status=p_status,withdrawn_at=case when p_status='inactive' then (now() at time zone 'America/La_Paz')::date else null end where id=p_student_id;
 if p_status='inactive' then update public.school_charges set status='cancelled' where student_id=p_student_id and due_date>(now() at time zone 'America/La_Paz')::date and status not in ('paid','cancelled'); end if;
end $$;
create function public.create_payment_plan(p_plan jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.payment_plans; s public.students; i integer; m date; due date; period_key text; factor numeric; base numeric; snack numeric; deduction numeric; start_day integer; days integer;
begin
 select * into s from public.students where id=(p_plan->>'student_id')::uuid for update;
 if s.id is null or not public.may_manage_student(s.id) then raise exception 'No tienes permiso para crear este plan.'; end if;
 if s.status='inactive' then raise exception 'El estudiante está dado de baja.'; end if;
 if (p_plan->>'school_id')::uuid <> s.school_id then raise exception 'Institución inválida.'; end if;
 insert into public.payment_plans(id,school_id,student_id,start_date,months,monthly_fee,snack_fee,enrollment_fee,due_day,discount,discount_from,discount_to,prorate)
 values((p_plan->>'id')::uuid,s.school_id,s.id,(p_plan->>'start_date')::date,(p_plan->>'months')::integer,(p_plan->>'monthly_fee')::numeric,coalesce((p_plan->>'snack_fee')::numeric,0),coalesce((p_plan->>'enrollment_fee')::numeric,0),(p_plan->>'due_day')::integer,coalesce((p_plan->>'discount')::numeric,0),(p_plan->>'discount_from')::date,(p_plan->>'discount_to')::date,coalesce((p_plan->>'prorate')::boolean,false)) returning * into p;
 if p.enrollment_fee>0 then insert into public.school_charges(school_id,student_id,concept,due_date,amount,plan_id,base_amount) values(s.school_id,s.id,'Matrícula',p.start_date,p.enrollment_fee,p.id,p.enrollment_fee); end if;
 for i in 0..p.months-1 loop
  m := (date_trunc('month',p.start_date)+make_interval(months=>i))::date;
  period_key:=to_char(m,'YYYY-MM');
  due:=m+(p.due_day-1); if i=0 then due:=greatest(due,p.start_date); end if;
  days:=extract(day from (m+interval '1 month - 1 day')); start_day:=extract(day from p.start_date);
  factor:=case when i=0 and p.prorate then (days-start_day+1)::numeric/days else 1 end;
  base:=round(p.monthly_fee*factor,2); snack:=round(p.snack_fee*factor,2);
  deduction:=case when due between p.discount_from and p.discount_to then least(p.discount,base+snack) else 0 end;
  insert into public.school_charges(school_id,student_id,concept,due_date,amount,plan_id,period,base_amount,snack_amount,license_amount,discount_amount)
  values(s.school_id,s.id,'Mensualidad '||period_key,due,base+snack+29-deduction,p.id,period_key,base,snack,29,deduction);
 end loop;
 update public.students set monthly_fee=p.monthly_fee,snack_fee=p.snack_fee,enrollment_fee=p.enrollment_fee where id=s.id;
exception when unique_violation then raise exception 'Ya existen cuotas para este estudiante en los meses del plan.';
end $$;
create function public.record_school_payment(p_charge_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare c public.school_charges; begin
 select * into c from public.school_charges where id=p_charge_id for update;
 if c.id is null or not(public.is_platform_admin() or public.has_school_role(c.school_id,array['director','treasurer'])) then raise exception 'No tienes permiso para registrar este pago.'; end if;
 if p_method not in ('cash','transfer') or length(trim(p_reference))=0 then raise exception 'Indica medio de pago y referencia. El QR solo se confirma por el proveedor.'; end if;
 if c.status='paid' then return; end if; if c.status='cancelled' then raise exception 'La cuota está anulada.'; end if;
 insert into public.school_payments(charge_id,amount,payment_method,verification_state,created_by,reference) values(c.id,c.amount,p_method,'verified',auth.uid(),trim(p_reference));
 update public.school_charges set status='paid',paid_at=now() where id=c.id;
end $$;
create function public.record_platform_payment(p_charge_id uuid,p_method text,p_reference text) returns void language plpgsql security definer set search_path='' as $$
declare c public.platform_charges; begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma confirma sus pagos.'; end if;
 select * into c from public.platform_charges where id=p_charge_id for update;
 if c.id is null then raise exception 'No se encontró el cobro.'; end if;
 if p_method not in ('cash','transfer') or length(trim(p_reference))=0 then raise exception 'Indica medio de pago y referencia.'; end if;
 if c.status='paid' then return; end if; if c.status='cancelled' then raise exception 'El cobro está anulado.'; end if;
 insert into public.platform_payments(charge_id,amount,payment_method,reference,created_by) values(c.id,c.amount,p_method,trim(p_reference),auth.uid());
 update public.platform_charges set status='paid' where id=c.id;
end $$;
create function public.generate_platform_invoice(p_school_id uuid,p_period text) returns void language plpgsql security definer set search_path='' as $$
declare total integer; begin
 if not public.is_platform_admin() then raise exception 'Solo la plataforma puede generar liquidaciones.'; end if;
 if p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then raise exception 'Período inválido.'; end if;
 perform 1 from public.schools where id=p_school_id for update;
 select count(*) into total from public.students where school_id=p_school_id and status='active';
 if total=0 then raise exception 'No hay estudiantes activos para facturar.'; end if;
 insert into public.platform_charges(school_id,concept,period,amount) values(p_school_id,'Licencia '||p_period||' · '||total||' alumnos',p_period,total*29);
exception when unique_violation then raise exception 'Ya existe una liquidación para ese período.';
end $$;
create function public.request_invoice(p_charge_id uuid,p_details jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.may_access_school_charge(p_charge_id) then raise exception 'No tienes acceso a esta cuota.'; end if;
 if length(trim(coalesce(p_details->>'invoiceName','')))=0 or length(trim(coalesce(p_details->>'invoiceNit','')))=0 or length(trim(coalesce(p_details->>'invoicePhone','')))=0 then raise exception 'Completa nombre, NIT/CI y celular.'; end if;
 update public.school_charges set invoice_name=trim(p_details->>'invoiceName'),invoice_nit=trim(p_details->>'invoiceNit'),invoice_phone=trim(p_details->>'invoicePhone') where id=p_charge_id and status<>'cancelled';
end $$;

create function public.create_invitation(p_invite jsonb) returns text language plpgsql security definer set search_path='' as $$
declare token text; sid uuid:=(p_invite->>'school_id')::uuid; invitation_role text:=p_invite->>'role'; email_value text:=lower(trim(p_invite->>'email')); begin
 if not (public.is_platform_admin() or (invitation_role<>'director' and public.has_school_role(sid,array['director']))) then raise exception 'No tienes permiso para invitar a este rol.'; end if;
 if email_value is null or email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido.'; end if;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.invitations(school_id,student_id,teacher_id,email,role,relationship,token_hash,created_by)
 values(sid,(p_invite->>'student_id')::uuid,(p_invite->>'teacher_id')::uuid,email_value,invitation_role,coalesce(p_invite->>'relationship','other'),encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 return token;
end $$;
create function public.revoke_invitation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.invitations; begin
 select * into i from public.invitations where id=p_id;
 if i.id is null or not(public.is_platform_admin() or (i.role<>'director' and public.has_school_role(i.school_id,array['director']))) then raise exception 'No puedes revocar esta invitación.'; end if;
 update public.invitations set status='revoked' where id=p_id and status='pending';
end $$;
create function public.claim_invitation(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare i public.invitations; email_value text; begin
 if auth.uid() is null then raise exception 'Ingresa con Google para aceptar la invitación.'; end if;
 select lower(email) into email_value from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if i.id is null or email_value is distinct from i.email then raise exception 'La invitación no corresponde a tu correo Google.'; end if;
 if i.status='accepted' and i.accepted_by=auth.uid() then return; end if;
 if i.status<>'pending' or i.expires_at<now() then raise exception 'La invitación caducó o fue revocada. Pide un nuevo enlace.'; end if;
 if i.role='guardian' then
  insert into public.student_guardians(student_id,user_id,relationship,can_view,can_pay,can_authorize_pickup,verified_at)
  values(i.student_id,auth.uid(),i.relationship,true,true,true,now()) on conflict(student_id,user_id) do update set verified_at=now(),can_view=true,can_pay=true,can_authorize_pickup=true,relationship=excluded.relationship;
 elsif i.role='teacher' then
  if exists(select 1 from public.teachers where id=i.teacher_id and user_id is not null and user_id<>auth.uid()) then raise exception 'La docente ya tiene otra cuenta vinculada.'; end if;
  update public.teachers set user_id=auth.uid(),status='active' where id=i.teacher_id and school_id=i.school_id;
 end if;
 insert into public.school_memberships(school_id,user_id,role) values(i.school_id,auth.uid(),i.role) on conflict(school_id,user_id,role) do update set active=true;
 update public.invitations set status='accepted',accepted_by=auth.uid() where id=i.id;
end $$;

-- Sellar autoría y fechas, independientemente del contenido enviado por el navegador.
create function public.stamp_author() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sesión requerida.'; end if;
 if TG_TABLE_NAME='messages' then
  new.author_id:=auth.uid();
  select coalesce(nullif(raw_user_meta_data->>'full_name',''),email) into new.author_name from auth.users where id=auth.uid();
  new.author_role:=case when public.is_platform_admin() then 'superadmin' when public.has_school_role(new.school_id,array['director']) then 'director' when public.may_teacher_write(new.student_id) then 'teacher' else 'guardian' end;
 else new.created_by:=auth.uid(); end if;
 if TG_TABLE_NAME<>'calendar_events' then new.created_at:=now(); end if;
 return new;
end $$;
create trigger messages_author before insert on public.messages for each row execute function public.stamp_author();
create trigger entries_author before insert on public.daily_entries for each row execute function public.stamp_author();
create trigger grades_author before insert on public.grades for each row execute function public.stamp_author();
create trigger requests_author before insert on public.family_requests for each row execute function public.stamp_author();
create trigger events_author before insert on public.calendar_events for each row execute function public.stamp_author();
create trigger announcements_author before insert on public.announcements for each row execute function public.stamp_author();
create function public.protect_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.school_id is distinct from old.school_id or new.student_id is distinct from old.student_id or new.type is distinct from old.type or new.request_date is distinct from old.request_date or new.reason is distinct from old.reason or new.pickup_name is distinct from old.pickup_name or new.pickup_id is distinct from old.pickup_id or new.vehicle_plate is distinct from old.vehicle_plate or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then raise exception 'Solo se puede modificar la respuesta de la solicitud.'; end if;
 if new.status not in ('approved','rejected') or length(trim(new.response))=0 then raise exception 'Indica una respuesta para la familia.'; end if;
 return new;
end $$;
create trigger requests_protect before update on public.family_requests for each row execute function public.protect_request();

-- RLS para todos los módulos. Los pagos y cambios sensibles solo pasan por RPC.
alter table public.payment_plans enable row level security;
alter table public.platform_payments enable row level security;
alter table public.invitations enable row level security;
alter table public.family_requests enable row level security;
alter table public.calendar_events enable row level security;
alter table public.messages enable row level security;
alter table public.grades enable row level security;
create policy plans_select on public.payment_plans for select to authenticated using(public.may_manage_student(student_id) or public.is_verified_guardian(student_id));
create policy platform_payments_select on public.platform_payments for select to authenticated using(public.is_platform_admin());
create policy invitations_select on public.invitations for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy requests_select on public.family_requests for select to authenticated using(public.may_use_student(student_id));
create policy requests_insert on public.family_requests for insert to authenticated with check(public.family_access(student_id) and status='pending' and response='' and created_by=auth.uid() and request_date>=(now() at time zone 'America/La_Paz')::date and exists(select 1 from public.student_guardians g where g.student_id=family_requests.student_id and g.user_id=auth.uid() and (family_requests.type<>'pickup' or g.can_authorize_pickup)));
create policy requests_update on public.family_requests for update to authenticated using(public.may_manage_student(student_id) or public.may_teacher_write(student_id)) with check(public.may_manage_student(student_id) or public.may_teacher_write(student_id));
create policy events_select on public.calendar_events for select to authenticated using(public.may_use_classroom(school_id,classroom_id));
create policy events_insert on public.calendar_events for insert to authenticated with check(public.may_edit_classroom(school_id,classroom_id) and created_by=auth.uid());
create policy events_update on public.calendar_events for update to authenticated using(public.may_edit_classroom(school_id,classroom_id)) with check(public.may_edit_classroom(school_id,classroom_id));
create policy messages_select on public.messages for select to authenticated using(public.may_use_student(student_id));
create policy messages_insert on public.messages for insert to authenticated with check(public.may_use_student(student_id) and author_id=auth.uid());
create policy grades_select on public.grades for select to authenticated using(public.may_use_student(student_id));
create policy grades_insert on public.grades for insert to authenticated with check((public.may_manage_student(student_id) or public.may_teacher_write(student_id)) and created_by=auth.uid());
create policy grades_update on public.grades for update to authenticated using(public.may_manage_student(student_id) or public.may_teacher_write(student_id)) with check(public.may_manage_student(student_id) or public.may_teacher_write(student_id));
drop policy daily_entries_select on public.daily_entries;
create policy daily_entries_select on public.daily_entries for select to authenticated using(public.may_use_student(student_id));
drop policy announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']) or (audience in ('all','staff') and public.has_school_role(school_id,array['teacher'])) or (audience in ('all','families') and exists(select 1 from public.students s where s.school_id=announcements.school_id and public.family_access(s.id))));
drop policy media_assets_select on public.media_assets;
drop policy media_assets_insert on public.media_assets;
create policy media_assets_select on public.media_assets for select to authenticated using(student_id is not null and public.may_use_student(student_id));
create policy media_assets_insert on public.media_assets for insert to authenticated with check(student_id is not null and public.may_use_student(student_id) and uploaded_by=auth.uid() and bucket='aulanexo-private' and object_key like school_id::text||'/'||student_id::text||'/'||auth.uid()::text||'/%');
-- Familia puede ver el cargo inicial a AulaNexo aunque tenga bloqueada la agenda.
drop policy platform_charges_select on public.platform_charges;
create policy platform_charges_select on public.platform_charges for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']) or (student_id is not null and public.is_verified_guardian(student_id)));

-- Quitar los accesos directos a tablas sensibles también evita saltarse las transacciones.
revoke insert,update,delete on public.students,public.schools,public.teachers,public.classrooms,public.teacher_classrooms,public.school_memberships,public.student_guardians,public.platform_charges,public.school_payments from authenticated;
revoke update,delete on public.school_charges from authenticated;
drop policy charges_insert on public.school_charges;
create policy charges_insert on public.school_charges for insert to authenticated with check((public.is_platform_admin() or public.has_school_role(school_id,array['director','treasurer'])) and status='pending' and paid_at is null and period is null and plan_id is null and license_amount=0 and amount>0);
grant select on public.payment_plans,public.platform_payments,public.invitations,public.family_requests,public.calendar_events,public.messages,public.grades to authenticated;
grant insert,update on public.family_requests,public.calendar_events,public.grades to authenticated;
grant insert on public.messages to authenticated;
revoke all on public.payment_plans,public.platform_payments,public.invitations from anon;
-- Todo RPC con SECURITY DEFINER requiere permiso explícito.
revoke all on function public.is_verified_guardian(uuid),public.family_access(uuid),public.may_use_student(uuid),public.may_use_classroom(uuid,uuid),public.may_edit_classroom(uuid,uuid),public.workspace_identity(),public.save_school(jsonb),public.save_teacher(jsonb),public.save_classroom(jsonb,uuid[]),public.enroll_student(jsonb),public.save_student(jsonb),public.complete_student_profile(uuid,jsonb),public.set_student_status(uuid,text),public.create_payment_plan(jsonb),public.record_school_payment(uuid,text,text),public.record_platform_payment(uuid,text,text),public.generate_platform_invoice(uuid,text),public.request_invoice(uuid,jsonb),public.create_invitation(jsonb),public.revoke_invitation(uuid),public.claim_invitation(text),public.stamp_author(),public.protect_request() from public,anon;
grant execute on function public.is_verified_guardian(uuid),public.family_access(uuid),public.may_use_student(uuid),public.may_use_classroom(uuid,uuid),public.may_edit_classroom(uuid,uuid),public.workspace_identity(),public.save_school(jsonb),public.save_teacher(jsonb),public.save_classroom(jsonb,uuid[]),public.enroll_student(jsonb),public.save_student(jsonb),public.complete_student_profile(uuid,jsonb),public.set_student_status(uuid,text),public.create_payment_plan(jsonb),public.record_school_payment(uuid,text,text),public.record_platform_payment(uuid,text,text),public.generate_platform_invoice(uuid,text),public.request_invoice(uuid,jsonb),public.create_invitation(jsonb),public.revoke_invitation(uuid),public.claim_invitation(text) to authenticated;

-- Comunicados por aula para las maestras; dirección conserva el alcance general.
alter table public.announcements add column classroom_id uuid;
alter table public.announcements add foreign key(classroom_id,school_id) references public.classrooms(id,school_id);
drop policy announcements_select on public.announcements;
drop policy announcements_insert on public.announcements;
drop policy announcements_update on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using(public.may_use_classroom(school_id,classroom_id) and (public.is_platform_admin() or public.has_school_role(school_id,array['director']) or (audience in ('all','staff') and public.has_school_role(school_id,array['teacher'])) or (audience in ('all','families') and exists(select 1 from public.students s where s.school_id=announcements.school_id and (announcements.classroom_id is null or s.classroom_id=announcements.classroom_id) and public.family_access(s.id)))));
create policy announcements_insert on public.announcements for insert to authenticated with check(public.may_edit_classroom(school_id,classroom_id) and created_by=auth.uid());
create policy announcements_update on public.announcements for update to authenticated using(public.may_edit_classroom(school_id,classroom_id)) with check(public.may_edit_classroom(school_id,classroom_id));
create function public.publish_class_entry(p_school_id uuid,p_classroom_id uuid,p_category text,p_note text,p_date date) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.may_edit_classroom(p_school_id,p_classroom_id) then raise exception 'No tienes permiso para publicar en esta aula.'; end if;
 if not exists(select 1 from public.students where school_id=p_school_id and classroom_id=p_classroom_id and status='active') then raise exception 'No hay estudiantes activos en esta aula.'; end if;
 if length(trim(p_note))=0 then raise exception 'Escribe la actividad.'; end if;
 insert into public.daily_entries(school_id,student_id,category,note,entry_date,created_by)
 select school_id,id,p_category,trim(p_note),p_date,auth.uid() from public.students where school_id=p_school_id and classroom_id=p_classroom_id and status='active';
end $$;
revoke all on function public.publish_class_entry(uuid,uuid,text,text,date) from public,anon;
grant execute on function public.publish_class_entry(uuid,uuid,text,text,date) to authenticated;
create function public.adjust_plan_discount(p_plan_id uuid,p_discount numeric,p_from date,p_to date) returns void
language plpgsql security definer set search_path='' as $$
declare p public.payment_plans; begin
 select * into p from public.payment_plans where id=p_plan_id for update;
 if p.id is null or not public.may_manage_student(p.student_id) then raise exception 'No tienes permiso para ajustar este plan.'; end if;
 if p_discount is null or p_discount<0 or (p_discount>0 and (p_from is null or p_to is null or p_from>p_to)) then raise exception 'Indica un descuento y fechas válidas.'; end if;
 update public.payment_plans set discount=p_discount,discount_from=p_from,discount_to=p_to where id=p.id;
 update public.school_charges set discount_amount=case when due_date between p_from and p_to then least(p_discount,base_amount+snack_amount) else 0 end,
 amount=base_amount+snack_amount+license_amount-case when due_date between p_from and p_to then least(p_discount,base_amount+snack_amount) else 0 end
 where plan_id=p.id and period is not null and status not in ('paid','cancelled');
end $$;
revoke all on function public.adjust_plan_discount(uuid,numeric,date,date) from public,anon;
grant execute on function public.adjust_plan_discount(uuid,numeric,date,date) to authenticated;
create or replace function public.may_access_school_charge(p_charge_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.school_charges c where c.id=p_charge_id and (public.is_platform_admin() or public.has_school_role(c.school_id,array['director','treasurer']) or (public.has_school_role(c.school_id,array['guardian']) and exists(select 1 from public.student_guardians g where g.student_id=c.student_id and g.user_id=auth.uid() and g.verified_at is not null and g.can_pay))));
$$;
alter table public.students alter column enrolled_at set default (now() at time zone 'America/La_Paz')::date;
create function public.set_student_access_until(p_student_id uuid,p_until date) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not(public.may_manage_student(p_student_id) or public.may_teacher_write(p_student_id)) then raise exception 'No tienes permiso para conceder acceso a este estudiante.'; end if;
 if p_until is null or p_until<(now() at time zone 'America/La_Paz')::date then raise exception 'Indica una fecha de acceso válida.'; end if;
 update public.students set access_until=p_until where id=p_student_id;
end $$;
revoke all on function public.set_student_access_until(uuid,date) from public,anon;
grant execute on function public.set_student_access_until(uuid,date) to authenticated;
-- Numeric NaN no debe pasar los límites monetarios.
alter table public.students add constraint students_finite_fees check(monthly_fee<=1000000000 and snack_fee<=1000000000 and enrollment_fee<=1000000000);
alter table public.payment_plans add constraint plans_finite_fees check(monthly_fee<=1000000000 and snack_fee<=1000000000 and enrollment_fee<=1000000000 and discount<=1000000000);
alter table public.school_charges add constraint charges_finite_amount check(amount<=1000000000);
alter table public.platform_charges add constraint platform_finite_amount check(amount<=1000000000);
