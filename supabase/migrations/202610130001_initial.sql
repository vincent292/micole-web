-- AulaNexo · Esquema inicial multiinstitución (octubre 2026)
-- Ejecutar con Supabase CLI migrations o SQL Editor en un proyecto nuevo.
-- NO contiene usuarios administrativos sembrados ni credenciales.
-- Base inicial. Aplicar también las migraciones 002 y 003 para las operaciones del frontend conectado.

create extension if not exists pgcrypto;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 3 and 160),
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  city text not null default '',
  director_name text not null default '',
  brand_color text not null default '#24916a',
  status text not null default 'pending' check (status in ('pending','active','inactive')),
  created_at timestamptz not null default now()
);

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('director','secretary','treasurer','teacher','guardian')),
  active boolean not null default true,
  unique (school_id,user_id,role)
);
create index school_memberships_user_idx on public.school_memberships(user_id,school_id);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  level text not null default '',
  schedule text not null default '',
  academic_year integer not null default 2026,
  created_at timestamptz not null default now(),
  unique(id,school_id),
  unique(school_id,academic_year,name)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text not null,
  specialty text not null default '',
  status text not null default 'pending' check(status in ('active','pending','inactive')),
  created_at timestamptz not null default now(),
  unique(id,school_id)
);
create unique index teachers_school_email_idx on public.teachers(school_id,lower(email));

create table public.teacher_classrooms (
  school_id uuid not null references public.schools(id) on delete cascade,
  teacher_id uuid not null,
  classroom_id uuid not null,
  subject_name text not null default 'Titular',
  primary key(teacher_id,classroom_id,subject_name),
  foreign key(teacher_id,school_id) references public.teachers(id,school_id) on delete cascade,
  foreign key(classroom_id,school_id) references public.classrooms(id,school_id) on delete cascade
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  classroom_id uuid,
  first_name text not null,
  last_name text not null,
  birth_date date,
  primary_guardian_name text not null default '',
  primary_guardian_email text not null default '',
  allergies text not null default '',
  monthly_fee numeric(12,2) not null default 0 check(monthly_fee >= 0),
  status text not null default 'pending' check(status in ('active','pending','inactive')),
  enrolled_at date not null default current_date,
  withdrawn_at date,
  unique(id,school_id),
  foreign key(classroom_id,school_id) references public.classrooms(id,school_id),
  check(withdrawn_at is null or withdrawn_at >= enrolled_at)
);
create index students_school_class_idx on public.students(school_id,classroom_id);

create table public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  relationship text not null check(relationship in ('mother','father','guardian','other')),
  can_view boolean not null default true,
  can_pay boolean not null default true,
  can_authorize_pickup boolean not null default false,
  verified_at timestamptz,
  primary key(student_id,user_id)
);

create table public.school_charges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  concept text not null,
  due_date date not null,
  amount numeric(12,2) not null check(amount >= 0),
  status text not null default 'pending' check(status in ('pending','paid','overdue','cancelled')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id)
);
create index school_charges_student_idx on public.school_charges(student_id,due_date);

create table public.school_payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.school_charges(id) on delete restrict,
  amount numeric(12,2) not null check(amount > 0),
  payment_method text not null check(payment_method in ('qr','cash','transfer')),
  provider_transaction_id text unique,
  verification_state text not null default 'manual_pending' check(verification_state in ('manual_pending','verified','rejected')),
  paid_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.platform_charges (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid,
  concept text not null,
  period text not null check(period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  amount numeric(12,2) not null check(amount >= 0),
  status text not null default 'pending' check(status in ('pending','paid','overdue','cancelled')),
  provider_transaction_id text unique,
  created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id)
);
create unique index platform_one_activation_per_student on public.platform_charges(student_id) where student_id is not null and concept like 'Activación%';
create unique index platform_one_monthly_per_school on public.platform_charges(school_id,period) where student_id is null;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  content text not null,
  audience text not null default 'all' check(audience in ('all','staff','families')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.daily_entries (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null,
  category text not null check(category in ('actividad','alimentación','descanso','observación')),
  note text not null,
  entry_date date not null default current_date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid,
  bucket text not null,
  object_key text not null unique,
  mime_type text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key(student_id,school_id) references public.students(id,school_id)
);

-- Helpers SECURITY DEFINER: nunca confiar en 'role' o school_id enviados por el frontend.
create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(select 1 from public.platform_admins a where a.user_id = auth.uid());
$$;

create function public.has_school_role(p_school_id uuid,p_roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1 from public.school_memberships m
    where m.school_id=p_school_id and m.user_id=auth.uid() and m.active=true and m.role=any(p_roles)
  );
$$;

create function public.is_school_member(p_school_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or public.has_school_role(p_school_id,array['director','secretary','treasurer','teacher','guardian']);
$$;

create function public.may_access_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1 from public.students s
    where s.id=p_student_id and (
      public.is_platform_admin()
      or public.has_school_role(s.school_id,array['director','secretary'])
      or exists (select 1 from public.student_guardians g where g.student_id=s.id and g.user_id=auth.uid() and g.verified_at is not null and g.can_view)
      or exists (select 1 from public.teacher_classrooms tc join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id where tc.classroom_id=s.classroom_id and tc.school_id=s.school_id and t.user_id=auth.uid() and t.status='active')
    )
  );
$$;

create function public.may_manage_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.students s where s.id=p_student_id and (public.is_platform_admin() or public.has_school_role(s.school_id,array['director','secretary'])));
$$;

create function public.may_teacher_write(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    join public.teacher_classrooms tc on tc.classroom_id=s.classroom_id and tc.school_id=s.school_id
    join public.teachers t on t.id=tc.teacher_id and t.school_id=tc.school_id
    where s.id=p_student_id and t.user_id=auth.uid() and t.status='active'
  );
$$;

create function public.may_access_school_charge(p_charge_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.school_charges c where c.id=p_charge_id
    and (public.is_platform_admin() or public.has_school_role(c.school_id,array['director','treasurer'])
      or exists(select 1 from public.student_guardians g where g.student_id=c.student_id and g.user_id=auth.uid() and g.verified_at is not null and g.can_pay))
  );
$$;

-- Revoke PUBLIC default execute, grant only authenticated users.
revoke all on function public.is_platform_admin() from public;
revoke all on function public.has_school_role(uuid,text[]) from public;
revoke all on function public.is_school_member(uuid) from public;
revoke all on function public.may_access_student(uuid) from public;
revoke all on function public.may_manage_student(uuid) from public;
revoke all on function public.may_teacher_write(uuid) from public;
revoke all on function public.may_access_school_charge(uuid) from public;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.has_school_role(uuid,text[]) to authenticated;
grant execute on function public.is_school_member(uuid) to authenticated;
grant execute on function public.may_access_student(uuid) to authenticated;
grant execute on function public.may_manage_student(uuid) to authenticated;
grant execute on function public.may_teacher_write(uuid) to authenticated;
grant execute on function public.may_access_school_charge(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.classrooms enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_classrooms enable row level security;
alter table public.students enable row level security;
alter table public.student_guardians enable row level security;
alter table public.school_charges enable row level security;
alter table public.school_payments enable row level security;
alter table public.platform_charges enable row level security;
alter table public.announcements enable row level security;
alter table public.daily_entries enable row level security;
alter table public.media_assets enable row level security;

create policy profiles_select on public.profiles for select to authenticated using(user_id=auth.uid() or public.is_platform_admin());
create policy profiles_insert on public.profiles for insert to authenticated with check(user_id=auth.uid());
create policy profiles_update on public.profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy platform_admins_select on public.platform_admins for select to authenticated using(user_id=auth.uid());
-- Platform admins are provisioned manually using SQL Editor / service role only.

create policy schools_select on public.schools for select to authenticated using(public.is_school_member(id));
create policy schools_insert on public.schools for insert to authenticated with check(public.is_platform_admin());
create policy schools_update on public.schools for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
-- La marca del colegio será editable mediante RPC controlado; su estado comercial, nunca desde el navegador de dirección.

create policy memberships_select on public.school_memberships for select to authenticated using(user_id=auth.uid() or public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy memberships_insert on public.school_memberships for insert to authenticated with check(public.is_platform_admin() or (role <> 'director' and public.has_school_role(school_id,array['director'])));
create policy memberships_update on public.school_memberships for update to authenticated using(public.is_platform_admin() or (role <> 'director' and public.has_school_role(school_id,array['director']))) with check(public.is_platform_admin() or (role <> 'director' and public.has_school_role(school_id,array['director'])));
create policy memberships_delete on public.school_memberships for delete to authenticated using(public.is_platform_admin() or (role <> 'director' and public.has_school_role(school_id,array['director'])));
-- El alta/baja del rol director queda reservada al superadministrador.

create policy classrooms_select on public.classrooms for select to authenticated using(public.is_school_member(school_id));
create policy classrooms_insert on public.classrooms for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy classrooms_update on public.classrooms for update to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director'])) with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']));

create policy teachers_select on public.teachers for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary','teacher']));
create policy teachers_insert on public.teachers for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary']));
create policy teachers_update on public.teachers for update to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary'])) with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary']));

create policy teacher_classrooms_select on public.teacher_classrooms for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary','teacher']));
create policy teacher_classrooms_insert on public.teacher_classrooms for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy teacher_classrooms_delete on public.teacher_classrooms for delete to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']));

create policy students_select on public.students for select to authenticated using(public.may_access_student(id));
create policy students_insert on public.students for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary']));
create policy students_update on public.students for update to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary'])) with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary']));

create policy guardians_select on public.student_guardians for select to authenticated using(user_id=auth.uid() or public.may_manage_student(student_id));
create policy guardians_insert on public.student_guardians for insert to authenticated with check(public.may_manage_student(student_id));
create policy guardians_update on public.student_guardians for update to authenticated using(public.may_manage_student(student_id)) with check(public.may_manage_student(student_id));
create policy guardians_delete on public.student_guardians for delete to authenticated using(public.may_manage_student(student_id));

create policy charges_select on public.school_charges for select to authenticated using(public.may_access_school_charge(id));
create policy charges_insert on public.school_charges for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','treasurer']));
create policy charges_update on public.school_charges for update to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','treasurer'])) with check(public.is_platform_admin() or public.has_school_role(school_id,array['director','treasurer']));

create policy payments_select on public.school_payments for select to authenticated using(public.may_access_school_charge(charge_id));
create policy payments_insert on public.school_payments for insert to authenticated with check(verification_state='manual_pending' and exists(select 1 from public.school_charges c where c.id=charge_id and (public.is_platform_admin() or public.has_school_role(c.school_id,array['director','treasurer']))));
-- Nunca autorizar que el cliente web registre pagos QR "verified"; implementar función segura con webhook firmado.

create policy platform_charges_select on public.platform_charges for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy platform_charges_insert on public.platform_charges for insert to authenticated with check(public.is_platform_admin());
create policy platform_charges_update on public.platform_charges for update to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());

create policy announcements_select on public.announcements for select to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director','secretary']) or (audience in ('all','staff') and public.has_school_role(school_id,array['teacher'])) or (audience in ('all','families') and public.has_school_role(school_id,array['guardian'])));
create policy announcements_insert on public.announcements for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']));
create policy announcements_update on public.announcements for update to authenticated using(public.is_platform_admin() or public.has_school_role(school_id,array['director'])) with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']));

create policy daily_entries_select on public.daily_entries for select to authenticated using(public.may_access_student(student_id));
create policy daily_entries_insert on public.daily_entries for insert to authenticated with check(public.may_manage_student(student_id) or public.may_teacher_write(student_id));
create policy daily_entries_update on public.daily_entries for update to authenticated using(public.may_manage_student(student_id) or (created_by=auth.uid() and public.may_teacher_write(student_id))) with check(public.may_manage_student(student_id) or (created_by=auth.uid() and public.may_teacher_write(student_id)));

create policy media_assets_select on public.media_assets for select to authenticated using(public.is_platform_admin() or (student_id is not null and public.may_access_student(student_id)) or (student_id is null and public.has_school_role(school_id,array['director','teacher'])));
create policy media_assets_insert on public.media_assets for insert to authenticated with check(public.is_platform_admin() or public.has_school_role(school_id,array['director']) or (student_id is not null and public.may_teacher_write(student_id)));

-- Bootstrap después de que el superadmin haya iniciado sesión con Google:
-- insert into public.platform_admins (user_id) values ('UUID_DE_AUTH_USERS');
-- Insertar la primera directora en school_memberships después de crear el colegio.
