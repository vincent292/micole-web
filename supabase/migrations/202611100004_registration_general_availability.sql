-- General availability: every active institution can configure its own enrollment.
-- Test classification is authoritative and separate from branding or campaign settings.
create function aulanexo_private.registration_test_school(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from aulanexo_private.test_institutions where school_id=p_school and enabled)
 or exists(select 1 from aulanexo_private.persisted_test_workspaces where school_id=p_school);
$$;
revoke all on function aulanexo_private.registration_test_school(uuid) from public,anon,authenticated,service_role;
alter table aulanexo_private.registration_campaigns alter column simulation set default false;


create or replace function aulanexo_private.registration_staff(p_campaign uuid,p_collect boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from aulanexo_private.registration_campaigns c
 where c.id=p_campaign and exists(select 1 from public.schools where id=c.school_id and status='active') and aulanexo_private.in_support_school(c.school_id)
 and (public.has_school_role(c.school_id,array['director']) or public.has_school_role(c.school_id,array['teacher']) and exists(select 1 from aulanexo_private.registration_delegates d
 join public.teachers t on t.user_id=d.user_id and t.school_id=c.school_id and t.status='active'
 where d.campaign_id=c.id and d.user_id=coalesce((select tt.user_id from public.teachers tt where tt.id=(aulanexo_private.test_context()).teacher_id and tt.school_id=c.school_id),aulanexo_private.actor_uid())
 and d.can_register and (not p_collect or d.can_collect))));
$$;

create or replace function aulanexo_private.require_registration_director(p_school uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.schools where id=p_school and status='active') or not aulanexo_private.in_support_school(p_school)
 or not public.has_school_role(p_school,array['director']) then raise exception 'Solo Dirección de la institución puede configurar inscripciones.';end if;
end $$;

create or replace function aulanexo_private.registration_json(a aulanexo_private.registration_applications,p_full boolean default true) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'campaignId',a.campaign_id,'classroomId',a.classroom_id,'classroomName',r.name,'year',c.year,
 'status',a.status,'seed',a.seed,'expectedEmail',a.expected_email,'recipient',a.recipient,'revision',a.revision,
 'reservationUntil',a.reservation_until,'expiresAt',a.expires_at,'newStudent',a.new_student,'studentId',a.student_id,'confirmedAt',a.confirmed_at,
 'paymentRequired',c.payment_required,'amount',c.amount,'concept',c.concept,'simulation',c.simulation,'testing',aulanexo_private.registration_test_school(a.school_id),'receiptId',a.receipt_id,
 'familyPolicy',coalesce((select family_policy from public.school_operation_settings where school_id=a.school_id),'both'),
 'childCiRequired',coalesce((select child_ci_required from public.school_operation_settings where school_id=a.school_id),true))
 ||case when p_full then jsonb_build_object('profile',a.profile,'template',c.template,'paymentToken',a.payment_token) else '{}'::jsonb end
 from public.classrooms r,aulanexo_private.registration_campaigns c where r.id=a.classroom_id and c.id=a.campaign_id;
$$;

create or replace function public.registration_workspace(p_school_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare director boolean:=public.has_school_role(p_school_id,array['director']);result jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.schools where id=p_school_id and status='active') or not aulanexo_private.in_support_school(p_school_id) or not(director or exists(select 1 from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and aulanexo_private.registration_staff(c.id))) then raise exception 'Dirección debe habilitarte para gestionar inscripciones de esta institución.';end if;
 select jsonb_build_object('canManage',director,'testing',aulanexo_private.registration_test_school(p_school_id),'campaigns',coalesce((select jsonb_agg(to_jsonb(c)-'created_by'-'template' order by year desc) from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and (director or aulanexo_private.registration_staff(c.id))),'[]'),
 'rooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'year',r.academic_year,'level',r.level,'schedule',r.schedule,'capacity',r.capacity,'occupied',aulanexo_private.registration_occupancy(r.id),'grade',p.grade_code,'regular',r.bolivia_regular)) from public.classrooms r left join public.academic_class_policies p on p.classroom_id=r.id where r.school_id=p_school_id and r.active),'[]'),
 'pools',coalesce((select jsonb_agg(jsonb_build_object('campaignId',rr.campaign_id,'classroomId',rr.classroom_id,'groupKey',rr.group_key)) from aulanexo_private.registration_rooms rr join aulanexo_private.registration_campaigns c on c.id=rr.campaign_id where c.school_id=p_school_id and (director or aulanexo_private.registration_staff(c.id))),'[]'),
 'applications',coalesce((select jsonb_agg(aulanexo_private.registration_json(a,false) order by a.created_at desc) from aulanexo_private.registration_applications a where a.school_id=p_school_id and (director or aulanexo_private.registration_staff(a.campaign_id))),'[]'),
 'teachers',case when director then coalesce((select jsonb_agg(jsonb_build_object('id',t.user_id,'name',t.name)) from public.teachers t where t.school_id=p_school_id and t.status='active' and t.user_id is not null),'[]') else '[]'::jsonb end,
 'delegates',case when director then coalesce((select jsonb_agg(to_jsonb(d)) from aulanexo_private.registration_delegates d join aulanexo_private.registration_campaigns c on c.id=d.campaign_id where c.school_id=p_school_id),'[]') else '[]'::jsonb end,
 'canCollect',coalesce((select jsonb_agg(c.id) from aulanexo_private.registration_campaigns c where c.school_id=p_school_id and aulanexo_private.registration_staff(c.id,true)),'[]')) into result;
 return result;
end $$;

create or replace function aulanexo_private.registration_access(a aulanexo_private.registration_applications,p_token text,p_staff boolean) returns boolean language sql stable security definer set search_path='' as $$
 select a.id is not null and exists(select 1 from public.schools where id=a.school_id and status='active') and
 case when p_staff then aulanexo_private.registration_staff(a.campaign_id) else
 coalesce(p_token,'')~'^[a-f0-9]{64}$' and a.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and a.expires_at>now() and a.status<>'cancelled'
 and exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and lower(u.email)=a.expected_email) end;
$$;

create or replace function public.registration_context(p_token text default null,p_id uuid default null,p_staff boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;school public.schools;result jsonb;
begin
 if p_staff then select * into a from aulanexo_private.registration_applications where id=p_id;
 elsif coalesce(p_token,'')~'^[a-f0-9]{64}$' then select * into a from aulanexo_private.registration_applications where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>now() and status<>'cancelled';end if;
 if a.id is null then raise exception 'Esta ficha no está disponible o venció. Solicita un nuevo enlace a Dirección.';end if;
 select * into school from public.schools where id=a.school_id and status='active';
 if school.id is null then raise exception 'La institución no está disponible.';end if;
 result:=jsonb_build_object('school',jsonb_build_object('id',school.id,'name',school.name,'logoUrl',school.logo_url,'color',school.brand_color,'appearance',school.appearance),'requiresVerification',true);
 if not aulanexo_private.registration_access(a,p_token,p_staff) then
  if p_staff then raise exception 'No tienes acceso a esta inscripción.';end if;
  return result;
 end if;
 return result||jsonb_build_object('requiresVerification',false,'application',aulanexo_private.registration_json(a),'canCollect',p_staff and aulanexo_private.registration_staff(a.campaign_id,true));
end $$;

create or replace function public.save_registration_campaign(p_school_id uuid,p_config jsonb,p_rooms jsonb,p_revision integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.registration_campaigns;r public.classrooms;item jsonb;room_ids uuid[]:='{}';group_value text;grade text;year_value integer;simulate boolean;
begin
 perform aulanexo_private.require_registration_director(p_school_id);
 simulate:=coalesce((p_config->>'simulation')::boolean,aulanexo_private.registration_test_school(p_school_id));
 if simulate and not aulanexo_private.registration_test_school(p_school_id) then raise exception 'Los pagos simulados solo están disponibles en instituciones de pruebas.';end if;
 if jsonb_typeof(p_config) is distinct from 'object' or coalesce(p_config->>'year','') !~ '^20[0-9]{2}$' then raise exception 'Revisa la gestión de inscripción.';end if;
 year_value:=(p_config->>'year')::integer;
 if year_value not between extract(year from now())::integer and extract(year from now())::integer+1 or length(trim(coalesce(p_config->>'title',''))) not between 3 and 160
 or coalesce(p_config->>'amount','0') !~ '^[0-9]+(\.[0-9]{1,2})?$' or jsonb_typeof(p_rooms) is distinct from 'array' or jsonb_array_length(p_rooms) not between 1 and 100 then raise exception 'Revisa el título, importe y aulas de la campaña.';end if;
 perform pg_advisory_xact_lock(hashtext('registration-campaign:'||p_school_id::text||year_value::text));
 select * into c from aulanexo_private.registration_campaigns where school_id=p_school_id and year=year_value for update;
 if coalesce(c.revision,0)<>p_revision then raise exception 'La campaña cambió. Actualiza antes de guardar.';end if;
 if c.id is not null and exists(select 1 from aulanexo_private.registration_applications where campaign_id=c.id) and
 (c.payment_required is distinct from coalesce((p_config->>'paymentRequired')::boolean,false) or c.amount<>(p_config->>'amount')::numeric or c.concept<>trim(coalesce(p_config->>'concept','')) or c.simulation is distinct from simulate) then raise exception 'La campaña ya tiene solicitudes. Conserva sus condiciones de pago.';end if;
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
  values(p_school_id,year_value,trim(p_config->>'title'),coalesce((p_config->>'paymentRequired')::boolean,false),(p_config->>'amount')::numeric,trim(coalesce(p_config->>'concept','')),simulate,aulanexo_private.actor_uid(),
   coalesce((select jsonb_build_object('title',title,'fields',fields,'instructions',instructions,'academicYear',academic_year) from public.admission_templates where school_id=p_school_id and academic_year=year_value),'{}')) returning * into c;
 else
  if exists(select 1 from aulanexo_private.registration_applications a where a.campaign_id=c.id and not(a.classroom_id=any(room_ids)) and a.status<>'cancelled') then raise exception 'No retires aulas que tienen solicitudes vigentes.';end if;
  update aulanexo_private.registration_campaigns set title=trim(p_config->>'title'),payment_required=coalesce((p_config->>'paymentRequired')::boolean,false),amount=(p_config->>'amount')::numeric,concept=trim(coalesce(p_config->>'concept','')),simulation=simulate,status=case when p_config->>'status'='closed' then 'closed' else 'open' end,revision=revision+1 where id=c.id;
 end if;
 delete from aulanexo_private.registration_rooms where campaign_id=c.id;
 insert into aulanexo_private.registration_rooms(campaign_id,classroom_id,group_key) select c.id,(value->>'classroomId')::uuid,trim(value->>'groupKey') from jsonb_array_elements(p_rooms);
 return c.id;
end $$;

create or replace function public.pay_registration(p_id uuid,p_method text,p_token text default null,p_received boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;receipt uuid:=gen_random_uuid();actor uuid;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id;
 perform 1 from public.school_charges where id=a.charge_id for update;
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 if p_method='cash' then
  if not aulanexo_private.registration_staff(a.campaign_id,true) or p_received is distinct from true then raise exception 'Solo personal autorizado puede confirmar el efectivo recibido.';end if;
 elsif p_method='test_qr' then
  if not c.simulation or not aulanexo_private.registration_test_school(c.school_id) or not(aulanexo_private.registration_access(a,p_token,false) or aulanexo_private.registration_staff(a.campaign_id)) then raise exception 'La simulación solo está disponible en la institución de pruebas.';end if;
 else raise exception 'Los pagos QR se confirman únicamente con el banco.';end if;
 if a.status='confirmed' then return aulanexo_private.registration_json(a);end if;
 if a.status<>'payment_pending' or a.charge_id is null then raise exception 'Completa el formulario antes de registrar el pago.';end if;
 if exists(select 1 from aulanexo_private.bank_qr_allocations where school_charge_id=a.charge_id and reserved) then raise exception 'Hay un QR bancario pendiente. Comprueba o cancela ese cobro antes de recibir efectivo.';end if;
 actor:=coalesce(aulanexo_private.actor_uid(),auth.uid());
 insert into public.school_receipts(id,school_id,student_id,total,payment_method,reference,request_hash,recorded_by)
 values(receipt,a.school_id,a.student_id,c.amount,case when p_method='cash' then 'cash' else 'qr' end,(case when aulanexo_private.registration_test_school(a.school_id) then 'PRUEBA-INS-' else 'INS-' end)||receipt::text,'registration:'||a.id::text,actor);
 update aulanexo_private.registration_applications set receipt_id=receipt where id=a.id;
 insert into public.school_payments(charge_id,amount,payment_method,verification_state,created_by,receipt_id,reference)
 values(a.charge_id,c.amount,case when p_method='cash' then 'cash' else 'qr' end,'verified',actor,receipt,(case when aulanexo_private.registration_test_school(a.school_id) then 'PRUEBA-INS-' else 'INS-' end)||receipt::text);
 select * into a from aulanexo_private.registration_applications where id=p_id;
 return aulanexo_private.registration_json(a);
end $$;

create or replace function aulanexo_private.registration_payment_source() returns trigger language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;r public.school_receipts;
begin
 if new.verification_state<>'verified' then return new;end if;
 select * into a from aulanexo_private.registration_applications where charge_id=new.charge_id;
 if a.id is null then return new;end if;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 select * into r from public.school_receipts where id=new.receipt_id and school_id=a.school_id and student_id=a.student_id;
 if r.id is null or r.payment_method<>new.payment_method then raise exception 'El pago de inscripción requiere un recibo del mismo alumno y medio de pago.';end if;
 if new.payment_method='cash' then
  if not(exists(select 1 from public.school_memberships where school_id=a.school_id and user_id=r.recorded_by and role='director' and active)
   or exists(select 1 from aulanexo_private.registration_delegates d join public.teachers t on t.user_id=d.user_id and t.school_id=a.school_id and t.status='active'
    where d.campaign_id=a.campaign_id and d.user_id=r.recorded_by and d.can_register and d.can_collect)
   or r.recorded_by=aulanexo_private.actor_uid() and aulanexo_private.registration_staff(a.campaign_id,true)) then raise exception 'Solo personal autorizado puede registrar efectivo de esta inscripción.';end if;
 elsif new.payment_method='qr' then
  if c.simulation and aulanexo_private.registration_test_school(a.school_id) and r.request_hash='registration:'||a.id::text and r.reference like 'PRUEBA-INS-%' then return new;end if;
  if r.verification_source<>'provider' or not exists(select 1 from aulanexo_private.bank_qr_intents i join aulanexo_private.bank_qr_allocations b on b.intent_id=i.id
   where i.id=r.id and i.school_id=a.school_id and i.student_id=a.student_id and i.status='paid' and i.verified_at is not null
    and b.school_charge_id=new.charge_id and b.amount=new.amount and i.bank_transaction_id=new.reference) then raise exception 'El pago QR de inscripción requiere confirmación del banco. Una captura o revisión manual no lo habilita.';end if;
 else raise exception 'La inscripción permite pago QR bancario o efectivo recibido por personal autorizado.';
 end if;
 return new;
end $$;
