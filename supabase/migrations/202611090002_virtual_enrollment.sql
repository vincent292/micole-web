-- Virtual enrollment pilot: tenant-scoped RPCs; imported applicants are not active students.
create table aulanexo_private.registration_campaigns(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),
 year integer not null check(year between 2020 and 2100),title text not null check(length(title) between 3 and 160),
 status text not null default 'open' check(status in ('open','closed')),
 payment_required boolean not null default false,amount numeric(12,2) not null default 0 check(amount between 0 and 50000),
 concept text not null default '',simulation boolean not null default true,
 template jsonb not null default '{}',revision integer not null default 1,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 unique(school_id,year),check((payment_required and amount>0 and length(concept)>=3) or (not payment_required and amount=0))
);
create table aulanexo_private.registration_rooms(
 campaign_id uuid not null references aulanexo_private.registration_campaigns(id),classroom_id uuid not null references public.classrooms(id),
 group_key text not null check(length(group_key) between 1 and 100),primary key(campaign_id,classroom_id)
);
create table aulanexo_private.registration_delegates(
 campaign_id uuid not null references aulanexo_private.registration_campaigns(id),user_id uuid not null references auth.users(id),
 can_register boolean not null default true,can_collect boolean not null default false,primary key(campaign_id,user_id)
);
create table aulanexo_private.registration_applications(
 id uuid primary key,campaign_id uuid not null references aulanexo_private.registration_campaigns(id),school_id uuid not null references public.schools(id),
 classroom_id uuid not null references public.classrooms(id),student_id uuid references public.students(id),new_student boolean not null default true,
 seed jsonb not null,profile jsonb not null default '{}',status text not null default 'draft' check(status in ('draft','payment_pending','confirmed','cancelled')),
 expected_email text not null default '',recipient text not null default 'mother' check(recipient in ('mother','father')),
 token_hash text unique,expires_at timestamptz,claimed_by uuid references auth.users(id),
 reservation_until timestamptz not null default now()+interval '7 days',charge_id uuid unique references public.school_charges(id),
 payment_token text,receipt_id uuid references public.school_receipts(id),revision integer not null default 1,
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),submitted_at timestamptz,confirmed_at timestamptz,
 unique(campaign_id,student_id)
);
create index registration_capacity on aulanexo_private.registration_applications(classroom_id,status,reservation_until);
revoke all on aulanexo_private.registration_campaigns,aulanexo_private.registration_rooms,aulanexo_private.registration_delegates,aulanexo_private.registration_applications from public,anon,authenticated,service_role;

create function aulanexo_private.registration_staff(p_campaign uuid,p_collect boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from aulanexo_private.registration_campaigns c
 where c.id=p_campaign and aulanexo_private.persisted_testing(c.school_id) and aulanexo_private.in_support_school(c.school_id)
 and (public.has_school_role(c.school_id,array['director']) or exists(select 1 from aulanexo_private.registration_delegates d
 join public.teachers t on t.user_id=d.user_id and t.school_id=c.school_id and t.status='active'
 where d.campaign_id=c.id and d.user_id=aulanexo_private.actor_uid() and d.can_register and (not p_collect or d.can_collect))));
$$;
create function aulanexo_private.require_registration_director(p_school uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not aulanexo_private.persisted_testing(p_school) or not aulanexo_private.in_support_school(p_school)
 or not public.has_school_role(p_school,array['director']) then raise exception 'Solo Dirección de la institución de pruebas puede configurar inscripciones.';end if;
end $$;
create function aulanexo_private.registration_key(p_value text) returns text language sql immutable set search_path='' as $$select upper(regexp_replace(coalesce(p_value,''),'[[:space:].-]','','g'))$$;
create function aulanexo_private.registration_occupancy(p_room uuid) returns integer language sql stable security definer set search_path='' as $$
 select (select count(*) from public.students where classroom_id=p_room and status='active')::integer+
 (select count(*) from aulanexo_private.registration_applications a where a.classroom_id=p_room and
 (a.status='payment_pending' or a.status='draft' and a.reservation_until>now())
 and not exists(select 1 from public.students s where s.id=a.student_id and s.classroom_id=p_room and s.status='active'))::integer;
$$;
create function aulanexo_private.registration_room(p_campaign uuid,p_anchor uuid,p_random boolean,p_existing uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;anchor public.classrooms;group_value text;
begin
 -- One lock serializes all allocations, including simultaneous imports and arrivals.
 perform pg_advisory_xact_lock(hashtext('registration-capacity:'||(select school_id::text from aulanexo_private.registration_campaigns where id=p_campaign)));
 select r.* into anchor from public.classrooms r join aulanexo_private.registration_rooms rr on rr.classroom_id=r.id and rr.campaign_id=p_campaign where r.id=p_anchor and r.active;
 select group_key into group_value from aulanexo_private.registration_rooms where campaign_id=p_campaign and classroom_id=p_anchor;
 if anchor.id is null then raise exception 'Selecciona un aula habilitada en esta campaña.';end if;
 if p_existing is not null and exists(select 1 from public.students where id=p_existing and classroom_id=p_anchor and status='active') then return p_anchor;end if;
 select r.id into target from public.classrooms r join aulanexo_private.registration_rooms rr on rr.classroom_id=r.id and rr.campaign_id=p_campaign
 where r.active and r.school_id=anchor.school_id and r.academic_year=anchor.academic_year and r.schedule=anchor.schedule and rr.group_key=group_value
 and (p_random or r.id=p_anchor) and aulanexo_private.registration_occupancy(r.id)<r.capacity
 order by aulanexo_private.registration_occupancy(r.id)::numeric/greatest(r.capacity,1),random() limit 1;
 if target is null then raise exception 'No hay cupos disponibles en los paralelos compatibles. Revisa la lista de espera con Dirección.';end if;
 return target;
end $$;
create function aulanexo_private.registration_json(a aulanexo_private.registration_applications,p_full boolean default true) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'campaignId',a.campaign_id,'classroomId',a.classroom_id,'classroomName',r.name,'year',c.year,
 'status',a.status,'seed',a.seed,'expectedEmail',a.expected_email,'recipient',a.recipient,'revision',a.revision,
 'reservationUntil',a.reservation_until,'expiresAt',a.expires_at,'newStudent',a.new_student,'studentId',a.student_id,'confirmedAt',a.confirmed_at,
 'paymentRequired',c.payment_required,'amount',c.amount,'concept',c.concept,'simulation',c.simulation,'receiptId',a.receipt_id,
 'familyPolicy',coalesce((select family_policy from public.school_operation_settings where school_id=a.school_id),'both'),
 'childCiRequired',coalesce((select child_ci_required from public.school_operation_settings where school_id=a.school_id),true))
 ||case when p_full then jsonb_build_object('profile',a.profile,'template',c.template,'paymentToken',a.payment_token) else '{}'::jsonb end
 from public.classrooms r,aulanexo_private.registration_campaigns c where r.id=a.classroom_id and c.id=a.campaign_id;
$$;

create function public.save_registration_campaign(p_school_id uuid,p_config jsonb,p_rooms jsonb,p_revision integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.registration_campaigns;r public.classrooms;item jsonb;room_ids uuid[]:='{}';group_value text;grade text;year_value integer;
begin
 perform aulanexo_private.require_registration_director(p_school_id);
 if jsonb_typeof(p_config) is distinct from 'object' or coalesce(p_config->>'year','') !~ '^20[0-9]{2}$' then raise exception 'Revisa la gestión de inscripción.';end if;
 year_value:=(p_config->>'year')::integer;
 if year_value not between extract(year from now())::integer and extract(year from now())::integer+1 or length(trim(coalesce(p_config->>'title',''))) not between 3 and 160
 or coalesce(p_config->>'amount','0') !~ '^[0-9]+(\.[0-9]{1,2})?$' or jsonb_typeof(p_rooms) is distinct from 'array' or jsonb_array_length(p_rooms) not between 1 and 100 then raise exception 'Revisa el título, importe y aulas de la campaña.';end if;
 perform pg_advisory_xact_lock(hashtext('registration-campaign:'||p_school_id::text||year_value::text));
 select * into c from aulanexo_private.registration_campaigns where school_id=p_school_id and year=year_value for update;
 if coalesce(c.revision,0)<>p_revision then raise exception 'La campaña cambió. Actualiza antes de guardar.';end if;
 if c.id is not null and exists(select 1 from aulanexo_private.registration_applications where campaign_id=c.id) and
 (c.payment_required is distinct from coalesce((p_config->>'paymentRequired')::boolean,false) or c.amount<>(p_config->>'amount')::numeric or c.concept<>trim(coalesce(p_config->>'concept','')) or c.simulation is distinct from coalesce((p_config->>'simulation')::boolean,true)) then raise exception 'La campaña ya tiene solicitudes. Conserva sus condiciones de pago.';end if;
 for item in select value from jsonb_array_elements(p_rooms) loop
  select * into r from public.classrooms where id=(item->>'classroomId')::uuid and school_id=p_school_id and academic_year=year_value and active;
  if r.id is null or r.id=any(room_ids) then raise exception 'Selecciona aulas distintas y abiertas de la gestión indicada.';end if;
  if r.bolivia_regular and coalesce((p_config->>'paymentRequired')::boolean,false) then raise exception 'La educación regular conserva su inscripción sin cobros adicionales obligatorios.';end if;
  select grade_code into grade from public.academic_class_policies where classroom_id=r.id;
  group_value:=trim(coalesce(item->>'groupKey',''));
  if length(group_value) not between 1 and 100 or grade is not null and grade<>'initial' and group_value<>grade then raise exception 'Conserva el grado oficial como grupo de reparto; inicial requiere un grupo definido por Dirección.';end if;
  room_ids:=array_append(room_ids,r.id);
 end loop;
 if c.id is null then
  insert into aulanexo_private.registration_campaigns(school_id,year,title,payment_required,amount,concept,simulation,created_by,template)
  values(p_school_id,year_value,trim(p_config->>'title'),coalesce((p_config->>'paymentRequired')::boolean,false),(p_config->>'amount')::numeric,trim(coalesce(p_config->>'concept','')),coalesce((p_config->>'simulation')::boolean,true),aulanexo_private.actor_uid(),
   coalesce((select jsonb_build_object('title',title,'fields',fields,'instructions',instructions,'academicYear',academic_year) from public.admission_templates where school_id=p_school_id and academic_year=year_value),'{}')) returning * into c;
 else
  if exists(select 1 from aulanexo_private.registration_applications a where a.campaign_id=c.id and not(a.classroom_id=any(room_ids)) and a.status<>'cancelled') then raise exception 'No retires aulas que tienen solicitudes vigentes.';end if;
  update aulanexo_private.registration_campaigns set title=trim(p_config->>'title'),status=case when p_config->>'status'='closed' then 'closed' else 'open' end,revision=revision+1 where id=c.id;
 end if;
 delete from aulanexo_private.registration_rooms where campaign_id=c.id;
 insert into aulanexo_private.registration_rooms(campaign_id,classroom_id,group_key) select c.id,(value->>'classroomId')::uuid,trim(value->>'groupKey') from jsonb_array_elements(p_rooms);
 return c.id;
end $$;
create function public.registration_workspace(p_school_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare director boolean:=public.has_school_role(p_school_id,array['director']);result jsonb;
begin
 if auth.uid() is null or not aulanexo_private.persisted_testing(p_school_id) or not aulanexo_private.in_support_school(p_school_id) or not(director or exists(select 1 from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and aulanexo_private.registration_staff(c.id))) then raise exception 'Dirección debe habilitarte para gestionar inscripciones de esta institución de pruebas.';end if;
 select jsonb_build_object('canManage',director,'campaigns',coalesce((select jsonb_agg(to_jsonb(c)-'created_by'-'template' order by year desc) from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and (director or aulanexo_private.registration_staff(c.id))),'[]'),
 'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'year',r.academic_year,'level',r.level,'schedule',r.schedule,'capacity',r.capacity,'occupied',aulanexo_private.registration_occupancy(r.id),'grade',p.grade_code,'regular',r.bolivia_regular)) from public.classrooms r left join public.academic_class_policies p on p.classroom_id=r.id where r.school_id=p_school_id and r.active),'[]'),
 'pools',coalesce((select jsonb_agg(jsonb_build_object('campaignId',rr.campaign_id,'classroomId',rr.classroom_id,'groupKey',rr.group_key)) from aulanexo_private.registration_rooms rr join aulanexo_private.registration_campaigns c on c.id=rr.campaign_id where c.school_id=p_school_id and (director or aulanexo_private.registration_staff(c.id))),'[]'),
 'applications',coalesce((select jsonb_agg(aulanexo_private.registration_json(a,false) order by a.created_at desc) from aulanexo_private.registration_applications a where a.school_id=p_school_id and (director or aulanexo_private.registration_staff(a.campaign_id))),'[]'),
 'teachers',case when director then coalesce((select jsonb_agg(jsonb_build_object('id',t.user_id,'name',t.name)) from public.teachers t where t.school_id=p_school_id and t.status='active' and t.user_id is not null),'[]') else '[]'::jsonb end,
 'delegates',case when director then coalesce((select jsonb_agg(to_jsonb(d)) from aulanexo_private.registration_delegates d join aulanexo_private.registration_campaigns c on c.id=d.campaign_id where c.school_id=p_school_id),'[]') else '[]'::jsonb end,
 'canCollect',coalesce((select jsonb_agg(c.id) from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and aulanexo_private.registration_staff(c.id,true)),'[]')) into result;
 return result;
end $$;
create function public.set_registration_delegate(p_campaign uuid,p_user uuid,p_register boolean,p_collect boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.require_registration_director((select school_id from aulanexo_private.registration_campaigns where id=p_campaign));
 if not exists(select 1 from public.teachers t join aulanexo_private.registration_campaigns c on c.school_id=t.school_id where c.id=p_campaign and t.user_id=p_user and t.status='active') then raise exception 'Selecciona una docente activa con cuenta vinculada.';end if;
 insert into aulanexo_private.registration_delegates values(p_campaign,p_user,p_register,p_register and p_collect) on conflict(campaign_id,user_id) do update set can_register=excluded.can_register,can_collect=excluded.can_collect;
end $$;

create function public.preview_registration_roster(p_campaign uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.registration_campaigns;row jsonb;result jsonb:='[]';matched uuid;matches integer;seen text[]:='{}';seen_rudes text[]:='{}';seen_cis text[]:='{}';key_value text;warning text;rv text;cv text;
begin
 select * into c from aulanexo_private.registration_campaigns where id=p_campaign;
 if not aulanexo_private.registration_staff(p_campaign) then raise exception 'No tienes permiso para revisar esta lista.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 or octet_length(p_rows::text)>300000 then raise exception 'Importa entre 1 y 200 filas por revisión.';end if;
 for row in select value from jsonb_array_elements(p_rows) loop
  warning:='';matched:=null;key_value:=case when coalesce(row->>'rude','')<>'' then 'rude:'||aulanexo_private.registration_key(row->>'rude') when coalesce(row->>'identityNumber','')<>'' then 'ci:'||aulanexo_private.registration_key(row->>'identityNumber') else 'name:'||lower(trim(coalesce(row->>'firstName',''))||' '||trim(coalesce(row->>'lastName',''))) end;
  rv:=aulanexo_private.registration_key(row->>'rude');cv:=aulanexo_private.registration_key(row->>'identityNumber');
  if key_value=any(seen) or rv<>'' and rv=any(seen_rudes) or cv<>'' and cv=any(seen_cis) then warning:='Repetido dentro del archivo: revisa y conserva una sola fila.';end if;seen:=array_append(seen,key_value);seen_rudes:=array_append(seen_rudes,rv);seen_cis:=array_append(seen_cis,cv);
  select count(*)::integer,min(s.id::text)::uuid into matches,matched from public.students s where s.school_id=c.school_id and
   (coalesce(row->>'rude','')<>'' and aulanexo_private.registration_key(s.rude)=aulanexo_private.registration_key(row->>'rude') or coalesce(row->>'identityNumber','')<>'' and aulanexo_private.registration_key(s.identity_number)=aulanexo_private.registration_key(row->>'identityNumber'));
  if matches>1 then warning:='Los identificadores coinciden con alumnos distintos. Dirección debe resolverlo.';matched:=null;
  elsif matched is not null and exists(select 1 from public.students s where s.id=matched and lower(trim(s.first_name)||' '||trim(s.last_name))<>lower(trim(coalesce(row->>'firstName',''))||' '||trim(coalesce(row->>'lastName','')))) then warning:='El RUDE o CI coincide, pero el nombre es distinto. Revisa el registro original.';matched:=null;
  elsif matched is not null then warning:=case when warning='' then 'Alumno existente: se vinculará su ficha, sin crear otro alumno.' else warning end;
  elsif exists(select 1 from public.students s where s.school_id=c.school_id and lower(trim(s.first_name)||' '||trim(s.last_name))=lower(trim(coalesce(row->>'firstName',''))||' '||trim(coalesce(row->>'lastName','')))) then warning:='Posible homónimo: verifica RUDE o CI antes de importar.';end if;
  if exists(select 1 from aulanexo_private.registration_applications a where a.campaign_id=c.id and a.status<>'cancelled' and (matched=a.student_id or rv<>'' and rv=aulanexo_private.registration_key(a.seed->>'rude') or cv<>'' and cv=aulanexo_private.registration_key(a.seed->>'identityNumber') or key_value=case when coalesce(a.seed->>'rude','')<>'' then 'rude:'||aulanexo_private.registration_key(a.seed->>'rude') when coalesce(a.seed->>'identityNumber','')<>'' then 'ci:'||aulanexo_private.registration_key(a.seed->>'identityNumber') else 'name:'||lower(trim(a.seed->>'firstName')||' '||trim(a.seed->>'lastName')) end)) then warning:='Ya tiene una solicitud en esta campaña.';end if;
  result:=result||jsonb_build_array(jsonb_build_object('row',row,'existingStudentId',matched,'warning',warning,'blocked',warning<>'' and warning<>'Alumno existente: se vinculará su ficha, sin crear otro alumno.'));
 end loop;
 return result;
end $$;

create function public.create_registration_application(p_id uuid,p_campaign uuid,p_room uuid,p_seed jsonb,p_random boolean default true,p_student uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.registration_campaigns;a aulanexo_private.registration_applications;s public.students;room_id uuid;seed jsonb;key text;field text;preview jsonb;
begin
 if not aulanexo_private.registration_staff(p_campaign) then raise exception 'No tienes permiso para preparar esta inscripción.';end if;
 select * into c from aulanexo_private.registration_campaigns where id=p_campaign;
 perform pg_advisory_xact_lock(hashtext('registration-capacity:'||c.school_id::text));
 select * into a from aulanexo_private.registration_applications where id=p_id;
 if a.id is not null then if a.campaign_id<>p_campaign then raise exception 'La solicitud pertenece a otra campaña.';end if;return aulanexo_private.registration_json(a);end if;
 if c.status<>'open' then raise exception 'La campaña está cerrada.';end if;
 if p_student is not null then
  select * into s from public.students where id=p_student and school_id=c.school_id;
  if s.id is null then raise exception 'Selecciona un alumno de esta institución.';end if;
  if exists(select 1 from aulanexo_private.registration_applications where campaign_id=p_campaign and student_id=p_student) then return (select aulanexo_private.registration_json(x) from aulanexo_private.registration_applications x where campaign_id=p_campaign and student_id=p_student);end if;
  -- Promotion must be validated by the existing academic process, never inferred from a name.
  if s.classroom_id is distinct from p_room then raise exception 'Confirma primero la promoción o el traslado del alumno al aula de destino.';end if;
  seed:=jsonb_build_object('firstName',s.first_name,'lastName',s.last_name,'rude',s.rude,'identityNumber',s.identity_number,'birthDate',s.birth_date,'motherName',s.mother_name,'motherEmail',s.mother_email,'motherPhone',s.mother_phone,'fatherName',s.father_name,'fatherEmail',s.father_email,'fatherPhone',s.father_phone);
 else
  if jsonb_typeof(p_seed) is distinct from 'object' or octet_length(p_seed::text)>10000 then raise exception 'Revisa los datos del alumno.';end if;
  seed:='{}';foreach field in array array['firstName','lastName','rude','identityNumber','birthDate','motherName','motherEmail','motherPhone','fatherName','fatherEmail','fatherPhone'] loop seed:=seed||jsonb_build_object(field,left(trim(coalesce(p_seed->>field,'')),160));end loop;
  if length(seed->>'firstName')<1 or length(seed->>'lastName')<1 then raise exception 'Completa nombres y apellidos antes de preparar la ficha.';end if;
  preview:=public.preview_registration_roster(p_campaign,jsonb_build_array(seed))->0;
  if coalesce((preview->>'blocked')::boolean,false) or preview->>'existingStudentId' is not null then raise exception 'Revisa duplicados y alumnos existentes antes de crear esta solicitud.';end if;
 end if;
 room_id:=aulanexo_private.registration_room(p_campaign,p_room,p_random and p_student is null,p_student);
 insert into aulanexo_private.registration_applications(id,campaign_id,school_id,classroom_id,student_id,new_student,seed,created_by)
 values(p_id,p_campaign,c.school_id,room_id,p_student,p_student is null,seed,aulanexo_private.actor_uid()) returning * into a;
 return aulanexo_private.registration_json(a);
end $$;
create function public.import_registration_roster(p_campaign uuid,p_room uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;preview jsonb;result jsonb:='[]';
begin
 perform aulanexo_private.require_registration_director((select school_id from aulanexo_private.registration_campaigns where id=p_campaign));
 preview:=public.preview_registration_roster(p_campaign,p_rows);
 if exists(select 1 from jsonb_array_elements(preview) x where (x->>'blocked')::boolean) then raise exception 'Resuelve o excluye las filas observadas antes de importar.';end if;
 for item in select value from jsonb_array_elements(preview) loop
  result:=result||jsonb_build_array(public.create_registration_application((item->'row'->>'id')::uuid,p_campaign,p_room,item->'row',false,(item->>'existingStudentId')::uuid));
 end loop;
 return result;
end $$;

create function public.registration_invite(p_id uuid,p_email text,p_recipient text,p_verified boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 if not aulanexo_private.registration_staff(a.campaign_id) then raise exception 'No tienes permiso para compartir esta ficha.';end if;
 if a.status<>'draft' or p_verified is distinct from true or p_recipient not in ('mother','father') or lower(trim(coalesce(p_email,''))) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_email)>160 then raise exception 'Verifica el contacto autorizado y prepara una ficha pendiente.';end if;
 update aulanexo_private.registration_applications set expected_email=lower(trim(p_email)),recipient=p_recipient,token_hash=encode(sha256(convert_to(token,'UTF8')),'hex'),expires_at=now()+interval '7 days',claimed_by=null,revision=revision+1,
 seed=seed||jsonb_build_object(p_recipient||'Email',lower(trim(p_email))) where id=p_id returning * into a;
 return jsonb_build_object('token',token,'application',aulanexo_private.registration_json(a));
end $$;
create function aulanexo_private.registration_access(a aulanexo_private.registration_applications,p_token text,p_staff boolean) returns boolean language sql stable security definer set search_path='' as $$
 select a.id is not null and aulanexo_private.persisted_testing(a.school_id) and
 case when p_staff then aulanexo_private.registration_staff(a.campaign_id) else
 coalesce(p_token,'')~'^[a-f0-9]{64}$' and a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and a.expires_at>now() and a.status<>'cancelled'
 and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=a.expected_email) end;
$$;
create function public.registration_context(p_token text default null,p_id uuid default null,p_staff boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;school public.schools;result jsonb;
begin
 if p_staff then select * into a from aulanexo_private.registration_applications where id=p_id;
 elsif coalesce(p_token,'')~'^[a-f0-9]{64}$' then select * into a from aulanexo_private.registration_applications where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now() and status<>'cancelled';end if;
 if a.id is null or not aulanexo_private.persisted_testing(a.school_id) then raise exception 'Esta ficha no está disponible o venció. Solicita un nuevo enlace a Dirección.';end if;
 select * into school from public.schools where id=a.school_id and status='active';
 if school.id is null then raise exception 'La institución no está disponible.';end if;
 result:=jsonb_build_object('school',jsonb_build_object('id',school.id,'name',school.name,'logoUrl',school.logo_url,'color',school.brand_color,'appearance',school.appearance),'requiresVerification',true);
 if not aulanexo_private.registration_access(a,p_token,p_staff) then
  if p_staff then raise exception 'No tienes acceso a esta inscripción.';end if;
  return result;
 end if;
 return result||jsonb_build_object('requiresVerification',false,'application',aulanexo_private.registration_json(a),'canCollect',p_staff and aulanexo_private.registration_staff(a.campaign_id,true));
end $$;

create function aulanexo_private.finish_registration(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 if a.status='confirmed' then return;end if;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 if a.status<>'payment_pending' or a.student_id is null or a.submitted_at is null then raise exception 'Completa el formulario antes de confirmar.';end if;
 if c.payment_required and not exists(select 1 from public.school_charges ch where ch.id=a.charge_id and ch.status='paid' and ch.paid_amount>=c.amount) then raise exception 'El pago todavía no está confirmado.';end if;
 update public.students set status='active',withdrawn_at=null where id=a.student_id and a.new_student;
 update aulanexo_private.registration_applications set status='confirmed',confirmed_at=now(),revision=revision+1 where id=p_id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(a.school_id,coalesce(a.claimed_by,a.created_by),'Inscripción virtual','registration',a.id,'UPDATE',jsonb_build_object('name','Inscripción confirmada','year',c.year));
end $$;
create function public.save_registration_form(p_id uuid,p_token text,p_profile jsonb,p_submit boolean,p_revision integer,p_staff boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;v_profile jsonb;care jsonb;details jsonb;birthday date;sid uuid;charge uuid;token text;fname text;lname text;rel text;field text;r public.classrooms;room_id uuid;family_policy text;ci_required boolean;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 if not aulanexo_private.registration_access(a,p_token,p_staff) then raise exception 'Verifica el correo autorizado antes de completar esta ficha.';end if;
 if a.status in ('confirmed','payment_pending') and p_submit then return aulanexo_private.registration_json(a);end if;
 if a.status<>'draft' or a.revision<>p_revision then raise exception 'La ficha cambió. Actualiza antes de guardar.';end if;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 if c.status<>'open' then raise exception 'La campaña está cerrada.';end if;
 if jsonb_typeof(p_profile) is distinct from 'object' or octet_length(p_profile::text)>85000 then raise exception 'Revisa los datos del formulario.';end if;
 v_profile:=p_profile-'status'-'studentId'-'classroomId'-'amount'-'paymentMethod';
 -- Name, identifiers, destination and trusted contact are controlled by the school.
 v_profile:=v_profile||a.seed;
 foreach field in array array['rude','identityNumber'] loop
  if coalesce(a.seed->>field,'')='' then v_profile:=jsonb_set(v_profile,array[field],to_jsonb(left(trim(coalesce(p_profile->>field,'')),100)));end if;
 end loop;
 if not p_submit then
  update aulanexo_private.registration_applications set profile=p_profile,claimed_by=case when p_staff then claimed_by else auth.uid() end,revision=revision+1 where id=p_id returning * into a;
  return aulanexo_private.registration_json(a);
 end if;
 fname:=trim(a.seed->>'firstName');lname:=trim(a.seed->>'lastName');
 if length(fname)<1 or length(lname)<1 or coalesce(p_profile->>'birthDate',a.seed->>'birthDate','') !~ '^\d{4}-\d{2}-\d{2}$' or p_profile->>'consent' is distinct from 'true' then raise exception 'Completa nacimiento y acepta la declaración del formulario.';end if;
 birthday:=coalesce(nullif(p_profile->>'birthDate',''),nullif(a.seed->>'birthDate',''))::date;
 if birthday>(now() at time zone 'America/La_Paz')::date or birthday<date '1900-01-01' then raise exception 'Revisa la fecha de nacimiento.';end if;
 foreach field in array array['motherName','motherEmail','motherPhone','fatherName','fatherEmail','fatherPhone'] loop
  v_profile:=jsonb_set(v_profile,array[field],to_jsonb(trim(coalesce(nullif(p_profile->>field,''),a.seed->>field,''))));
  if length(v_profile->>field)>160 then raise exception 'Revisa los datos de los responsables.';end if;
 end loop;
 if a.expected_email<>'' then v_profile:=jsonb_set(v_profile,array[a.recipient||'Email'],to_jsonb(a.expected_email));end if;
 rel:=a.recipient;
 if length(coalesce(v_profile->>(rel||'Name'),''))<2 or coalesce(v_profile->>(rel||'Email'),'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(regexp_replace(coalesce(v_profile->>(rel||'Phone'),''),'[^0-9]','','g')) not between 6 and 20 then raise exception 'Completa nombre, correo y celular del responsable.';end if;
 select coalesce(s.family_policy,'both'),coalesce(s.child_ci_required,true) into family_policy,ci_required from public.school_operation_settings s where s.school_id=a.school_id;
 family_policy:=coalesce(family_policy,'both');ci_required:=coalesce(ci_required,true);
 if family_policy<>'father' and (length(coalesce(v_profile->>'motherName',''))<2 or coalesce(v_profile->>'motherEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or family_policy<>'mother' and (length(coalesce(v_profile->>'fatherName',''))<2 or coalesce(v_profile->>'fatherEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') or ci_required and length(coalesce(v_profile->>'identityNumber',''))<2 then raise exception 'Completa los responsables y el CI exigidos por la institución.';end if;
 if nullif(lower(v_profile->>'motherEmail'),'')=nullif(lower(v_profile->>'fatherEmail'),'') then raise exception 'Madre y padre deben tener correos diferentes.';end if;
 care:=aulanexo_private.validate_care_profile(p_profile);
 details:=aulanexo_private.validate_admission_details(coalesce(p_profile->'admissionDetails','{}'),c.template);
 room_id:=a.classroom_id;
 if a.reservation_until<=now() then
  room_id:=aulanexo_private.registration_room(a.campaign_id,a.classroom_id,a.new_student,a.student_id);
  update aulanexo_private.registration_applications set classroom_id=room_id,reservation_until=now()+interval '7 days' where id=p_id;
 end if;
 select * into r from public.classrooms where id=room_id;
 sid:=a.student_id;
 if sid is null then
  perform pg_advisory_xact_lock(hashtext('registration-capacity:'||a.school_id::text));
  sid:=gen_random_uuid();
  if exists(select 1 from public.students s where s.school_id=a.school_id and (coalesce(v_profile->>'rude','')<>'' and aulanexo_private.registration_key(s.rude)=aulanexo_private.registration_key(v_profile->>'rude') or coalesce(v_profile->>'identityNumber','')<>'' and aulanexo_private.registration_key(s.identity_number)=aulanexo_private.registration_key(v_profile->>'identityNumber'))) then raise exception 'El alumno ya fue registrado. Dirección debe vincular la ficha existente.';end if;
  insert into public.students(id,school_id,classroom_id,first_name,last_name,birth_date,rude,identity_number,status,monthly_fee,mother_name,mother_email,mother_phone,father_name,father_email,father_phone,primary_guardian_name,primary_guardian_email)
  values(sid,a.school_id,room_id,fname,lname,birthday,coalesce(v_profile->>'rude',''),coalesce(v_profile->>'identityNumber',''),'pending',r.monthly_fee,v_profile->>'motherName',lower(v_profile->>'motherEmail'),v_profile->>'motherPhone',v_profile->>'fatherName',lower(v_profile->>'fatherEmail'),v_profile->>'fatherPhone',v_profile->>(rel||'Name'),lower(v_profile->>(rel||'Email')));
 end if;
 -- Admission is reviewed independently of existing academic history and does not move an existing pupil.
 if a.student_id is not null or a.new_student then
  update public.students set allergies=care->>'allergies',food_restrictions=care->>'foodRestrictions',emergency_contact=care->>'emergencyContact',emergency_phone=care->>'emergencyPhone',second_emergency_contact=care->>'secondEmergencyContact',second_emergency_phone=care->>'secondEmergencyPhone',has_insurance=(care->>'hasInsurance')::boolean,insurance_provider=care->>'insuranceProvider',insurance_number=care->>'insuranceNumber',medical_conditions=care->>'medicalConditions',care_instructions=care->>'careInstructions',admission_details=details,profile_complete=true where id=sid;
  perform aulanexo_private.sync_student_parents(sid);
 end if;
 if c.payment_required then
  if r.bolivia_regular then raise exception 'Este grado conserva la inscripción sin cobros adicionales obligatorios.';end if;
  charge:=gen_random_uuid();token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.school_charges(id,school_id,student_id,concept,due_date,amount) values(charge,a.school_id,sid,c.concept,(now() at time zone 'America/La_Paz')::date,c.amount);
  insert into aulanexo_private.payment_links(school_id,student_id,items,token_hash,created_by,expires_at)
  values(a.school_id,sid,jsonb_build_array(jsonb_build_object('chargeId',charge,'amount',c.amount)),encode(sha256(convert_to(token,'UTF8')),'hex'),a.created_by,now()+interval '7 days');
 end if;
 update aulanexo_private.registration_applications set student_id=sid,profile=v_profile||care||jsonb_build_object('birthDate',birthday,'admissionDetails',details,'consent',true),status='payment_pending',submitted_at=now(),claimed_by=case when p_staff then claimed_by else auth.uid() end,charge_id=charge,payment_token=token,revision=revision+1 where id=p_id;
 if not c.payment_required then perform aulanexo_private.finish_registration(p_id);end if;
 select * into a from aulanexo_private.registration_applications where id=p_id;
 return aulanexo_private.registration_json(a);
end $$;

create function aulanexo_private.registration_paid() returns trigger language plpgsql security definer set search_path='' as $$
declare app uuid;
begin
 if new.status='paid' and new.paid_amount>=new.amount then
  select id into app from aulanexo_private.registration_applications where charge_id=new.id and status='payment_pending';
  if app is not null then perform aulanexo_private.finish_registration(app);end if;
 end if;return new;
end $$;
create trigger registration_after_payment after update of status,paid_amount on public.school_charges for each row execute function aulanexo_private.registration_paid();
create function public.pay_registration(p_id uuid,p_method text,p_token text default null,p_received boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;receipt uuid:=gen_random_uuid();actor uuid;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id;
 perform 1 from public.school_charges where id=a.charge_id for update;
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 if p_method='cash' then
  if not aulanexo_private.registration_staff(a.campaign_id,true) or p_received is distinct from true then raise exception 'Solo personal autorizado puede confirmar el efectivo recibido.';end if;
 elsif p_method='test_qr' then
  if not c.simulation or not aulanexo_private.persisted_testing(c.school_id) or not(aulanexo_private.registration_access(a,p_token,false) or aulanexo_private.registration_staff(a.campaign_id)) then raise exception 'La simulación solo está disponible en la institución de pruebas.';end if;
 else raise exception 'Los pagos QR se confirman únicamente con el banco.';end if;
 if a.status='confirmed' then return aulanexo_private.registration_json(a);end if;
 if a.status<>'payment_pending' or a.charge_id is null then raise exception 'Completa el formulario antes de registrar el pago.';end if;
 if exists(select 1 from aulanexo_private.bank_qr_allocations where school_charge_id=a.charge_id and reserved) then raise exception 'Hay un QR bancario pendiente. Comprueba o cancela ese cobro antes de recibir efectivo.';end if;
 actor:=coalesce(aulanexo_private.actor_uid(),auth.uid());
 insert into public.school_receipts(id,school_id,student_id,total,payment_method,reference,request_hash,recorded_by)
 values(receipt,a.school_id,a.student_id,c.amount,case when p_method='cash' then 'cash' else 'qr' end,'PRUEBA-INS-'||receipt::text,'registration:'||a.id::text,actor);
 update aulanexo_private.registration_applications set receipt_id=receipt where id=a.id;
 insert into public.school_payments(charge_id,amount,payment_method,verification_state,created_by,receipt_id,reference)
 values(a.charge_id,c.amount,case when p_method='cash' then 'cash' else 'qr' end,'verified',actor,receipt,'PRUEBA-INS-'||receipt::text);
 select * into a from aulanexo_private.registration_applications where id=p_id;
 return aulanexo_private.registration_json(a);
end $$;
create function public.cancel_registration(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id;
 perform 1 from public.school_charges where id=a.charge_id for update;
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 if not aulanexo_private.registration_staff(a.campaign_id) then raise exception 'No tienes permiso para cancelar esta solicitud.';end if;
 if a.status='confirmed' or exists(select 1 from public.school_charges where id=a.charge_id and paid_amount>0) then raise exception 'La solicitud tiene un pago recibido. Dirección debe revisar el caso.';end if;
 if exists(select 1 from aulanexo_private.bank_qr_allocations where school_charge_id=a.charge_id and reserved) then raise exception 'Comprueba o cancela primero el QR bancario antes de liberar el cupo.';end if;
 update aulanexo_private.registration_applications set status='cancelled',token_hash=null,payment_token=null,revision=revision+1 where id=p_id;
 update public.school_charges set status='cancelled' where id=a.charge_id and paid_amount=0;
 if a.new_student then update public.students set status='inactive' where id=a.student_id and status='pending';end if;
end $$;

-- Private helpers never become PostgREST endpoints; public methods require explicit grants.
revoke all on function aulanexo_private.registration_staff(uuid,boolean),aulanexo_private.require_registration_director(uuid),aulanexo_private.registration_key(text),aulanexo_private.registration_occupancy(uuid),aulanexo_private.registration_room(uuid,uuid,boolean,uuid),aulanexo_private.registration_json(aulanexo_private.registration_applications,boolean),aulanexo_private.registration_access(aulanexo_private.registration_applications,text,boolean),aulanexo_private.finish_registration(uuid),aulanexo_private.registration_paid() from public,anon,authenticated,service_role;
revoke all on function public.save_registration_campaign(uuid,jsonb,jsonb,integer),public.registration_workspace(uuid),public.set_registration_delegate(uuid,uuid,boolean,boolean),public.preview_registration_roster(uuid,jsonb),public.create_registration_application(uuid,uuid,uuid,jsonb,boolean,uuid),public.import_registration_roster(uuid,uuid,jsonb),public.registration_invite(uuid,text,text,boolean),public.registration_context(text,uuid,boolean),public.save_registration_form(uuid,text,jsonb,boolean,integer,boolean),public.pay_registration(uuid,text,text,boolean),public.cancel_registration(uuid) from public,anon;
grant execute on function public.save_registration_campaign(uuid,jsonb,jsonb,integer),public.registration_workspace(uuid),public.set_registration_delegate(uuid,uuid,boolean,boolean),public.preview_registration_roster(uuid,jsonb),public.create_registration_application(uuid,uuid,uuid,jsonb,boolean,uuid),public.import_registration_roster(uuid,uuid,jsonb),public.registration_invite(uuid,text,text,boolean),public.registration_context(text,uuid,boolean),public.save_registration_form(uuid,text,jsonb,boolean,integer,boolean),public.pay_registration(uuid,text,text,boolean),public.cancel_registration(uuid) to authenticated;
grant execute on function public.registration_context(text,uuid,boolean) to anon;
