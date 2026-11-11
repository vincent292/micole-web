-- A roster is an intake draft: identifiers, surnames and contacts can be completed later.
-- Keep names as provided; never infer surnames, kinship or student identity from names alone.
create function aulanexo_private.registration_name(p_first text,p_last text) returns text language sql immutable set search_path='' as $$
 select lower(trim(regexp_replace(coalesce(p_first,'')||' '||coalesce(p_last,''),'[[:space:]]+',' ','g')));
$$;
revoke all on function aulanexo_private.registration_name(text,text) from public,anon,authenticated,service_role;

create or replace function public.preview_registration_roster(p_campaign uuid,p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.registration_campaigns;row jsonb;result jsonb:='[]';matched uuid;matches integer;
 seen_names text[]:='{}';seen_unidentified text[]:='{}';seen_rudes text[]:='{}';seen_cis text[]:='{}';
 name_value text;warning text;rv text;cv text;blocked boolean;
begin
 select * into c from aulanexo_private.registration_campaigns where id=p_campaign;
 if not aulanexo_private.registration_staff(p_campaign) then raise exception 'No tienes permiso para revisar esta lista.';end if;
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 or octet_length(p_rows::text)>300000 then raise exception 'Importa entre 1 y 200 filas por revisión.';end if;
 for row in select value from jsonb_array_elements(p_rows) loop
  warning:='';matched:=null;blocked:=false;
  name_value:=aulanexo_private.registration_name(row->>'firstName',row->>'lastName');
  rv:=aulanexo_private.registration_key(row->>'rude');cv:=aulanexo_private.registration_key(row->>'identityNumber');
  if rv<>'' and rv=any(seen_rudes) or cv<>'' and cv=any(seen_cis) or name_value=any(seen_unidentified) or rv='' and cv='' and name_value=any(seen_names) then
   warning:='Repetido dentro del archivo: revisa y conserva una sola fila.';blocked:=true;
  end if;
  seen_names:=array_append(seen_names,name_value);seen_rudes:=array_append(seen_rudes,rv);seen_cis:=array_append(seen_cis,cv);
  if rv='' and cv='' then seen_unidentified:=array_append(seen_unidentified,name_value);end if;
  select count(*)::integer,min(s.id::text)::uuid into matches,matched from public.students s where s.school_id=c.school_id and
   (rv<>'' and aulanexo_private.registration_key(s.rude)=rv or cv<>'' and aulanexo_private.registration_key(s.identity_number)=cv);
  if matches>1 then warning:='Los identificadores coinciden con alumnos distintos. Dirección debe resolverlo.';matched:=null;blocked:=true;
  elsif matched is not null and not exists(select 1 from public.students s where s.id=matched and
   (aulanexo_private.registration_name(s.first_name,s.last_name)=name_value or trim(coalesce(row->>'lastName',''))='' and aulanexo_private.registration_name(s.first_name,'')=name_value)) then
   warning:='El RUDE o CI coincide, pero el nombre es distinto. Revisa el registro original.';matched:=null;blocked:=true;
  elsif matched is not null then if warning='' then warning:='Alumno existente: se vinculará su ficha, sin crear otro alumno.';end if;
  elsif exists(select 1 from public.students s where s.school_id=c.school_id and
   (aulanexo_private.registration_name(s.first_name,s.last_name)=name_value or trim(coalesce(row->>'lastName',''))='' and aulanexo_private.registration_name(s.first_name,'')=name_value)) then
   warning:='Posible homónimo: verifica RUDE o CI antes de importar.';blocked:=true;
  end if;
  if exists(select 1 from aulanexo_private.registration_applications a where a.campaign_id=c.id and a.status<>'cancelled' and
   (matched=a.student_id or rv<>'' and rv=aulanexo_private.registration_key(a.seed->>'rude') or cv<>'' and cv=aulanexo_private.registration_key(a.seed->>'identityNumber')
   or aulanexo_private.registration_name(a.seed->>'firstName',a.seed->>'lastName')=name_value and (rv='' and cv='' or aulanexo_private.registration_key(a.seed->>'rude')='' and aulanexo_private.registration_key(a.seed->>'identityNumber')=''))) then
   warning:='Ya tiene una solicitud en esta campaña.';blocked:=true;
  end if;
  if length(trim(coalesce(row->>'firstName','')))<1 then warning:='Completa al menos el nombre del alumno antes de importar esta fila.';matched:=null;blocked:=true;
  elsif warning='' and trim(coalesce(row->>'lastName',''))='' then warning:='Ficha incompleta: se importará el nombre tal como está. Completa nombres y apellidos al llenar la inscripción.';end if;
  result:=result||jsonb_build_array(jsonb_build_object('row',row,'existingStudentId',matched,'warning',warning,'blocked',blocked));
 end loop;
 return result;
end $$;


create or replace function public.create_registration_application(p_id uuid,p_campaign uuid,p_room uuid,p_seed jsonb,p_random boolean default true,p_student uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
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
  seed:='{}';foreach field in array array['firstName','lastName','rude','identityNumber','contactEmail','birthDate','motherName','motherEmail','motherPhone','fatherName','fatherEmail','fatherPhone'] loop seed:=seed||jsonb_build_object(field,left(trim(coalesce(p_seed->>field,'')),160));end loop;
  if length(seed->>'firstName')<1 then raise exception 'Completa al menos el nombre del alumno antes de preparar la ficha.';end if;
  preview:=public.preview_registration_roster(p_campaign,jsonb_build_array(seed))->0;
  if coalesce((preview->>'blocked')::boolean,false) or preview->>'existingStudentId' is not null then raise exception 'Revisa duplicados y alumnos existentes antes de crear esta solicitud.';end if;
 end if;
 room_id:=aulanexo_private.registration_room(p_campaign,p_room,p_random and p_student is null,p_student);
 insert into aulanexo_private.registration_applications(id,campaign_id,school_id,classroom_id,student_id,new_student,seed,created_by)
 values(p_id,p_campaign,c.school_id,room_id,p_student,p_student is null,seed,aulanexo_private.actor_uid()) returning * into a;
 return aulanexo_private.registration_json(a);
end $$;

create or replace function public.save_registration_form(p_id uuid,p_token text,p_profile jsonb,p_submit boolean,p_revision integer,p_staff boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare a aulanexo_private.registration_applications;c aulanexo_private.registration_campaigns;v_profile jsonb;care jsonb;details jsonb;birthday date;sid uuid;charge uuid;token text;fname text;lname text;rel text;field text;r public.classrooms;room_id uuid;family_policy text;ci_required boolean;name_pending boolean;
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
 -- A single-name column stays untouched until an authorized person completes the name.
 name_pending:=a.new_student and a.student_id is null and trim(coalesce(a.seed->>'lastName',''))='';
 if name_pending then
  foreach field in array array['firstName','lastName'] loop
   v_profile:=jsonb_set(v_profile,array[field],to_jsonb(left(trim(coalesce(nullif(p_profile->>field,''),a.seed->>field,'')),160)));
  end loop;
 end if;
 foreach field in array array['rude','identityNumber'] loop
  if coalesce(a.seed->>field,'')='' then v_profile:=jsonb_set(v_profile,array[field],to_jsonb(left(trim(coalesce(p_profile->>field,'')),100)));end if;
 end loop;
 if not p_submit then
  update aulanexo_private.registration_applications set profile=p_profile,claimed_by=case when p_staff then claimed_by else auth.uid() end,revision=revision+1 where id=p_id returning * into a;
  return aulanexo_private.registration_json(a);
 end if;
 fname:=trim(v_profile->>'firstName');lname:=trim(v_profile->>'lastName');
 if length(fname)<1 or length(lname)<1 then raise exception 'Completa nombres y apellidos antes de enviar la inscripción.';end if;
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
 update aulanexo_private.registration_applications set seed=case when name_pending then seed||jsonb_build_object('firstName',fname,'lastName',lname) else seed end,student_id=sid,profile=v_profile||care||jsonb_build_object('birthDate',birthday,'admissionDetails',details,'consent',true),status='payment_pending',submitted_at=now(),claimed_by=case when p_staff then claimed_by else auth.uid() end,charge_id=charge,payment_token=token,revision=revision+1 where id=p_id;
 if not c.payment_required then perform aulanexo_private.finish_registration(p_id);end if;
 select * into a from aulanexo_private.registration_applications where id=p_id;
 return aulanexo_private.registration_json(a);
end $$;
