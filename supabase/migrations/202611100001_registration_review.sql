-- Preserve existing contacts and academic boundaries when completing enrollment.
create or replace function aulanexo_private.registration_room(p_campaign uuid,p_anchor uuid,p_random boolean,p_existing uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;anchor public.classrooms;group_value text;
begin
 -- One lock serializes all allocations, including simultaneous imports and arrivals.
 perform pg_advisory_xact_lock(hashtext('registration-capacity:'||(select school_id::text from aulanexo_private.registration_campaigns where id=p_campaign)));
 select r.* into anchor from public.classrooms r join aulanexo_private.registration_rooms rr on rr.classroom_id=r.id and rr.campaign_id=p_campaign where r.id=p_anchor and r.active;
 select group_key into group_value from aulanexo_private.registration_rooms where campaign_id=p_campaign and classroom_id=p_anchor;
 if anchor.id is null then raise exception 'Selecciona un aula habilitada en esta campaña.';end if;
 if p_existing is not null and exists(select 1 from public.students where id=p_existing and classroom_id=p_anchor and status='active') then return p_anchor;end if;
 select r.id into target from public.classrooms r join aulanexo_private.registration_rooms rr on rr.classroom_id=r.id and rr.campaign_id=p_campaign
 where r.active and r.school_id=anchor.school_id and r.academic_year=anchor.academic_year and r.schedule=anchor.schedule and rr.group_key=group_value and lower(trim(r.level))=lower(trim(anchor.level)) and r.bolivia_regular=anchor.bolivia_regular
 and (p_random or r.id=p_anchor) and aulanexo_private.registration_occupancy(r.id)<r.capacity
 order by aulanexo_private.registration_occupancy(r.id)::numeric/greatest(r.capacity,1),random() limit 1;
 if target is null then raise exception 'No hay cupos disponibles en los paralelos compatibles. Revisa la lista de espera con Dirección.';end if;
 return target;
end $$;

create or replace function public.preview_registration_roster(p_campaign uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if length(trim(coalesce(row->>'firstName','')))<1 or length(trim(coalesce(row->>'lastName','')))<1 then warning:='Completa nombres y apellidos antes de importar esta fila.';matched:=null;end if;
  result:=result||jsonb_build_array(jsonb_build_object('row',row,'existingStudentId',matched,'warning',warning,'blocked',warning<>'' and warning<>'Alumno existente: se vinculará su ficha, sin crear otro alumno.'));
 end loop;
 return result;
end $$;

create or replace function public.save_registration_form(p_id uuid,p_token text,p_profile jsonb,p_submit boolean,p_revision integer,p_staff boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;v_profile jsonb;care jsonb;details jsonb;birthday date;sid uuid;charge uuid;token text;fname text;lname text;rel text;field text;r public.classrooms;room_id uuid;family_policy text;ci_required boolean;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id;
 if not aulanexo_private.registration_access(a,p_token,p_staff) then raise exception 'Verifica el correo autorizado antes de completar esta ficha.';end if;
 perform pg_advisory_xact_lock(hashtext('registration-capacity:'||a.school_id::text));
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
 birthday:=coalesce(nullif(a.seed->>'birthDate',''),nullif(p_profile->>'birthDate',''))::date;
 if birthday>(now() at time zone 'America/La_Paz')::date or birthday<date '1900-01-01' then raise exception 'Revisa la fecha de nacimiento.';end if;
 foreach field in array array['motherName','motherEmail','motherPhone','fatherName','fatherEmail','fatherPhone'] loop
  if field like '%Email' and coalesce(a.seed->>field,'')<>'' then
   v_profile:=jsonb_set(v_profile,array[field],to_jsonb(a.seed->>field));
  else v_profile:=jsonb_set(v_profile,array[field],to_jsonb(trim(coalesce(nullif(p_profile->>field,''),a.seed->>field,''))));end if;
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
 if exists(select 1 from public.students s where s.school_id=a.school_id and s.id<>sid and
 (coalesce(v_profile->>'rude','')<>'' and aulanexo_private.registration_key(s.rude)=aulanexo_private.registration_key(v_profile->>'rude') or coalesce(v_profile->>'identityNumber','')<>'' and aulanexo_private.registration_key(s.identity_number)=aulanexo_private.registration_key(v_profile->>'identityNumber'))) then raise exception 'El RUDE o CI corresponde a otro alumno. Solicita revisión a Dirección.';end if;
 if a.student_id is not null or a.new_student then
  update public.students set birth_date=coalesce(birth_date,birthday),rude=coalesce(nullif(rude,''),v_profile->>'rude'),identity_number=coalesce(nullif(identity_number,''),v_profile->>'identityNumber'),
  mother_name=v_profile->>'motherName',mother_email=lower(v_profile->>'motherEmail'),mother_phone=v_profile->>'motherPhone',father_name=v_profile->>'fatherName',father_email=lower(v_profile->>'fatherEmail'),father_phone=v_profile->>'fatherPhone',
  primary_guardian_name=v_profile->>(rel||'Name'),primary_guardian_email=lower(v_profile->>(rel||'Email')),allergies=care->>'allergies',food_restrictions=care->>'foodRestrictions',emergency_contact=care->>'emergencyContact',emergency_phone=care->>'emergencyPhone',second_emergency_contact=care->>'secondEmergencyContact',second_emergency_phone=care->>'secondEmergencyPhone',has_insurance=(care->>'hasInsurance')::boolean,insurance_provider=care->>'insuranceProvider',insurance_number=care->>'insuranceNumber',medical_conditions=care->>'medicalConditions',care_instructions=care->>'careInstructions',admission_details=details,profile_complete=true where id=sid;
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

create or replace function aulanexo_private.finish_registration(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;
begin
 select * into a from aulanexo_private.registration_applications where id=p_id for update;
 if a.status='confirmed' then return;end if;
 select * into c from aulanexo_private.registration_campaigns where id=a.campaign_id;
 if a.status<>'payment_pending' or a.student_id is null or a.submitted_at is null then raise exception 'Completa el formulario antes de confirmar.';end if;
 if c.payment_required and not exists(select 1 from public.school_charges ch where ch.id=a.charge_id and ch.status='paid' and ch.paid_amount>=c.amount) then raise exception 'El pago todavía no está confirmado.';end if;
 update public.students set status='active',withdrawn_at=null where id=a.student_id and a.new_student;
 update aulanexo_private.registration_applications set status='confirmed',confirmed_at=now(),receipt_id=coalesce(receipt_id,(select p.receipt_id from public.school_payments p where p.charge_id=a.charge_id and p.verification_state='verified' order by p.paid_at desc limit 1)),revision=revision+1 where id=p_id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(a.school_id,coalesce(a.claimed_by,a.created_by),'Inscripción virtual','registration',a.id,'UPDATE',jsonb_build_object('name','Inscripción confirmada','year',c.year));
end $$;

create or replace function public.save_registration_campaign(p_school_id uuid,p_config jsonb,p_rooms jsonb,p_revision integer default 0) returns uuid language plpgsql security definer set search_path='' as $$
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
  update aulanexo_private.registration_campaigns set title=trim(p_config->>'title'),payment_required=coalesce((p_config->>'paymentRequired')::boolean,false),amount=(p_config->>'amount')::numeric,concept=trim(coalesce(p_config->>'concept','')),simulation=coalesce((p_config->>'simulation')::boolean,true),status=case when p_config->>'status'='closed' then 'closed' else 'open' end,revision=revision+1 where id=c.id;
 end if;
 delete from aulanexo_private.registration_rooms where campaign_id=c.id;
 insert into aulanexo_private.registration_rooms(campaign_id,classroom_id,group_key) select c.id,(value->>'classroomId')::uuid,trim(value->>'groupKey') from jsonb_array_elements(p_rooms);
 return c.id;
end $$;
