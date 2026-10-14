-- MiCole: inscripción dirigida, solo madre/padre y ficha de cuidado compartida.
alter table public.students
 add column rude text not null default '', add column identity_number text not null default '',
 add column mother_name text not null default '', add column mother_email text not null default '', add column mother_phone text not null default '',
 add column father_name text not null default '', add column father_email text not null default '', add column father_phone text not null default '',
 add column has_insurance boolean, add column insurance_provider text not null default '', add column insurance_number text not null default '',
 add column medical_conditions text not null default '', add column care_instructions text not null default '',
 add column second_emergency_contact text not null default '', add column second_emergency_phone text not null default '';
create unique index students_unique_rude_in_school on public.students(school_id,upper(regexp_replace(rude,'\s','','g'))) where trim(rude)<>'';
create unique index students_unique_ci_in_school on public.students(school_id,upper(regexp_replace(identity_number,'\s','','g'))) where trim(identity_number)<>'';
create index students_mother_email on public.students(lower(mother_email)) where mother_email<>'';
create index students_father_email on public.students(lower(father_email)) where father_email<>'';
-- Conservar las inscripciones anteriores sin inventar un segundo responsable.
update public.students s set mother_name=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(s.primary_guardian_name,''),u.email),mother_email=lower(u.email)
 from public.student_guardians g join auth.users u on u.id=g.user_id where g.student_id=s.id and g.relationship='mother' and g.verified_at is not null;
update public.students s set father_name=coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email),father_email=lower(u.email)
 from public.student_guardians g join auth.users u on u.id=g.user_id where g.student_id=s.id and g.relationship='father' and g.verified_at is not null;
update public.students set mother_name=primary_guardian_name,mother_email=lower(primary_guardian_email) where mother_email='' and primary_guardian_email<>'' and lower(primary_guardian_email)<>father_email;
update public.student_guardians set can_view=false,can_pay=false,can_authorize_pickup=false where relationship not in ('mother','father');
update public.invitations set status='revoked' where role='guardian' and relationship not in ('mother','father') and status='pending';

create function aulanexo_private.sync_student_parents(p_student uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.students; begin
 select * into s from public.students where id=p_student;
 if s.id is null then return; end if;
 -- Revocar vínculos cuyo correo ya no corresponda a la madre o al padre registrados.
 update public.student_guardians g set can_view=false,can_pay=false,can_authorize_pickup=false
 where g.student_id=s.id and not exists(select 1 from auth.users u where u.id=g.user_id and u.email_confirmed_at is not null
 and ((g.relationship='mother' and lower(u.email)=s.mother_email) or (g.relationship='father' and lower(u.email)=s.father_email)));
 update public.invitations i set status='revoked' where student_id=s.id and role='guardian' and status='pending'
 and not ((relationship='mother' and email=s.mother_email) or (relationship='father' and email=s.father_email));
 insert into public.student_guardians(student_id,user_id,relationship,can_view,can_pay,can_authorize_pickup,verified_at)
 select s.id,u.id,p.relationship,true,true,true,now() from auth.users u
 join (values ('mother',s.mother_email),('father',s.father_email)) p(relationship,email) on lower(u.email)=p.email
 where p.email<>'' and u.email_confirmed_at is not null
 on conflict(student_id,user_id) do update set relationship=excluded.relationship,can_view=true,can_pay=true,can_authorize_pickup=true,verified_at=excluded.verified_at;
 insert into public.school_memberships(school_id,user_id,role,active)
 select s.school_id,g.user_id,'guardian',true from public.student_guardians g where g.student_id=s.id and g.can_view and g.verified_at is not null
 on conflict(school_id,user_id,role) do update set active=true;
 update public.school_memberships m set active=false where m.school_id=s.school_id and m.role='guardian'
 and not exists(select 1 from public.student_guardians g join public.students child on child.id=g.student_id where child.school_id=s.school_id and g.user_id=m.user_id and g.relationship in ('mother','father') and g.can_view and g.verified_at is not null);
end $$;
revoke all on function aulanexo_private.sync_student_parents(uuid) from public,anon,authenticated;

create function aulanexo_private.save_admission_details(p_student jsonb,p_new boolean) returns void language plpgsql security definer set search_path='' as $$
declare s public.students; mn text; me text; fn text; fe text; ci text; begin
 select * into s from public.students where id=(p_student->>'id')::uuid for update;
 if s.id is null then raise exception 'No se encontró al estudiante.'; end if;
 mn:=trim(coalesce(p_student->>'mother_name',s.mother_name)); me:=lower(trim(coalesce(p_student->>'mother_email',s.mother_email)));
 fn:=trim(coalesce(p_student->>'father_name',s.father_name)); fe:=lower(trim(coalesce(p_student->>'father_email',s.father_email)));
 ci:=upper(trim(coalesce(p_student->>'identity_number',s.identity_number)));
 if length(mn)<2 or length(fn)<2 or me !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or fe !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Completa nombres y correos de madre y padre.'; end if;
 if me=fe then raise exception 'Madre y padre deben tener correos diferentes.'; end if;
 if p_new and ci='' then raise exception 'Completa el número de CI del niño.'; end if;
 if length(ci)>40 or length(coalesce(p_student->>'rude',''))>40 or greatest(length(mn),length(fn))>160 or greatest(length(me),length(fe))>254 then raise exception 'Revisa la longitud de los datos de inscripción.'; end if;
 update public.students set rude=upper(trim(coalesce(p_student->>'rude',s.rude))),identity_number=ci,
 mother_name=mn,mother_email=me,mother_phone=trim(coalesce(p_student->>'mother_phone',s.mother_phone)),
 father_name=fn,father_email=fe,father_phone=trim(coalesce(p_student->>'father_phone',s.father_phone)),
 primary_guardian_name=mn,primary_guardian_email=me where id=s.id;
 perform aulanexo_private.sync_student_parents(s.id);
exception when unique_violation then raise exception 'El RUDE o CI ya está registrado en esta institución. Revisa la ficha existente.';
end $$;
revoke all on function aulanexo_private.save_admission_details(jsonb,boolean) from public,anon,authenticated;
alter function public.enroll_student(jsonb) rename to enroll_student_base;
alter function public.enroll_student_base(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.enroll_student_base(jsonb) from public,anon,authenticated;
create function public.enroll_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.enroll_student_base(p_student);
 perform aulanexo_private.save_admission_details(p_student,true);
end $$;
alter function public.save_student(jsonb) rename to save_student_base;
alter function public.save_student_base(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_student_base(jsonb) from public,anon,authenticated;
create function public.save_student(p_student jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.save_student_base(p_student);
 perform aulanexo_private.save_admission_details(p_student,false);
end $$;
revoke all on function public.enroll_student(jsonb),public.save_student(jsonb) from public,anon;
grant execute on function public.enroll_student(jsonb),public.save_student(jsonb) to authenticated;

create or replace function public.is_verified_guardian(p_student_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.student_guardians g join public.students s on s.id=g.student_id join auth.users u on u.id=g.user_id
 where g.student_id=p_student_id and g.user_id=aulanexo_private.actor_uid() and g.relationship in ('mother','father') and g.verified_at is not null and g.can_view and u.email_confirmed_at is not null
 and public.has_school_role(s.school_id,array['guardian']) and ((s.mother_email='' and s.father_email='') or (g.relationship='mother' and lower(u.email)=s.mother_email) or (g.relationship='father' and lower(u.email)=s.father_email)));
$$;
-- Al ingresar con correo verificado se vinculan todos sus hijos, sin aceptar un enlace por cada niño.
alter function public.workspace_identity() rename to workspace_identity_base;
alter function public.workspace_identity_base() set schema aulanexo_private;
revoke all on function aulanexo_private.workspace_identity_base() from public,anon,authenticated;
create function public.workspace_identity() returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid; verified_email text; begin
 if auth.uid() is null then raise exception 'Inicia sesión para continuar.'; end if;
 if aulanexo_private.support_id() is null then
  select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  for sid in select id from public.students where mother_email=verified_email or father_email=verified_email loop perform aulanexo_private.sync_student_parents(sid); end loop;
 end if;
 return aulanexo_private.workspace_identity_base();
end $$;
revoke all on function public.workspace_identity() from public,anon;
grant execute on function public.workspace_identity() to authenticated;
-- El listado de hijos no incluye contactos de emergencia ni otros vínculos antiguos.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('aulanexo_private.workspace_identity_base()'::regprocedure);
 definition:=replace(definition,'g.verified_at is not null and g.can_view','g.verified_at is not null and g.can_view and g.relationship in (''mother'',''father'')');
 execute definition;
end $$;
alter function public.create_invitation(jsonb) rename to create_invitation_base;
alter function public.create_invitation_base(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.create_invitation_base(jsonb) from public,anon,authenticated;
create function public.create_invitation(p_invite jsonb) returns text language plpgsql security definer set search_path='' as $$
declare s public.students; rel text:=p_invite->>'relationship'; email_value text:=lower(trim(p_invite->>'email')); begin
 if p_invite->>'role'='guardian' then
  if rel is null or rel not in ('mother','father') then raise exception 'El acceso familiar está reservado a madre y padre.'; end if;
  select * into s from public.students where id=(p_invite->>'student_id')::uuid;
  if not public.may_manage_student(s.id) then raise exception 'No tienes permiso para invitar a esta familia.'; end if;
  if not ((rel='mother' and email_value=s.mother_email) or (rel='father' and email_value=s.father_email)) then raise exception 'Primero registra ese correo en la ficha de madre o padre.'; end if;
 end if;
 return aulanexo_private.create_invitation_base(p_invite);
end $$;
alter function public.claim_invitation(text) rename to claim_invitation_base;
alter function public.claim_invitation_base(text) set schema aulanexo_private;
revoke all on function aulanexo_private.claim_invitation_base(text) from public,anon,authenticated;
create function public.claim_invitation(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare i public.invitations; s public.students; begin
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if i.role='guardian' then
  select * into s from public.students where id=i.student_id;
  if i.relationship not in ('mother','father') or not ((i.relationship='mother' and i.email=s.mother_email) or (i.relationship='father' and i.email=s.father_email)) then raise exception 'El correo ya no está autorizado en la inscripción.'; end if;
 end if;
 perform aulanexo_private.claim_invitation_base(p_token);
end $$;
revoke all on function public.create_invitation(jsonb),public.claim_invitation(text) from public,anon;
grant execute on function public.create_invitation(jsonb),public.claim_invitation(text) to authenticated;

create table public.family_intake_forms (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,
 recipient text not null check(recipient in ('mother','father')),recipient_email text not null,token_hash text not null unique,
 status text not null default 'open' check(status in ('open','submitted','approved','revoked')),
 profile jsonb,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',submitted_at timestamptz,reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
create index intake_student_status on public.family_intake_forms(student_id,status);
alter table public.family_intake_forms enable row level security;
revoke all on public.family_intake_forms from public,anon,authenticated;
grant select on public.family_intake_forms to authenticated;
create policy intake_director on public.family_intake_forms for select to authenticated using(public.may_manage_student(student_id));
create policy intake_scope on public.family_intake_forms as restrictive for all to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin());
create trigger audit_intake after insert or update on public.family_intake_forms for each row execute function aulanexo_private.capture_audit();

create function aulanexo_private.validate_care_profile(p_profile jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb; field text; phone text; insured boolean; begin
 if jsonb_typeof(p_profile)<>'object' or octet_length(p_profile::text)>20000 then raise exception 'Revisa la ficha enviada.'; end if;
 foreach field in array array['allergies','foodRestrictions','emergencyContact','emergencyPhone'] loop
  if length(trim(coalesce(p_profile->>field,'')))=0 then raise exception 'Completa alergias, alimentación y contacto de emergencia.'; end if;
 end loop;
 if p_profile->>'hasInsurance' not in ('true','false') or p_profile->>'hasInsurance' is null then raise exception 'Indica si el niño tiene seguro.'; end if;
 insured:=(p_profile->>'hasInsurance')::boolean;
 if insured and length(trim(coalesce(p_profile->>'insuranceProvider','')))<2 then raise exception 'Indica la entidad del seguro.'; end if;
 if (trim(coalesce(p_profile->>'secondEmergencyContact',''))='')<>(trim(coalesce(p_profile->>'secondEmergencyPhone',''))='') then raise exception 'Completa nombre y teléfono del segundo contacto, o deja ambos vacíos.'; end if;
 foreach field in array array['emergencyPhone','secondEmergencyPhone'] loop
  phone:=trim(coalesce(p_profile->>field,''));
  if phone<>'' and (length(regexp_replace(phone,'[^0-9]','','g')) not between 6 and 20 or phone !~ '^[+0-9() .-]+$') then raise exception 'Revisa los números de emergencia.'; end if;
 end loop;
 result:=jsonb_build_object('hasInsurance',insured);
 foreach field in array array['allergies','foodRestrictions','emergencyContact','emergencyPhone','secondEmergencyContact','secondEmergencyPhone','insuranceProvider','insuranceNumber','medicalConditions','careInstructions'] loop
  if length(coalesce(p_profile->>field,''))>2000 then raise exception 'Uno de los campos es demasiado largo.'; end if;
  result:=result||jsonb_build_object(field,case when not insured and field in ('insuranceProvider','insuranceNumber') then '' else trim(coalesce(p_profile->>field,'')) end);
 end loop;
 return result;
end $$;
revoke all on function aulanexo_private.validate_care_profile(jsonb) from public,anon,authenticated;

create or replace function public.complete_student_profile(p_student_id uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare value jsonb; begin
 if not(public.may_manage_student(p_student_id) or public.is_verified_guardian(p_student_id)) then raise exception 'No tienes acceso a este estudiante.'; end if;
 value:=aulanexo_private.validate_care_profile(p_profile);
 update public.students set allergies=value->>'allergies',food_restrictions=value->>'foodRestrictions',emergency_contact=value->>'emergencyContact',emergency_phone=value->>'emergencyPhone',
 second_emergency_contact=value->>'secondEmergencyContact',second_emergency_phone=value->>'secondEmergencyPhone',has_insurance=(value->>'hasInsurance')::boolean,
 insurance_provider=value->>'insuranceProvider',insurance_number=value->>'insuranceNumber',medical_conditions=value->>'medicalConditions',care_instructions=value->>'careInstructions',profile_complete=true where id=p_student_id;
 update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where student_id=p_student_id and status in ('open','submitted');
end $$;
create function public.create_family_intake(p_student_id uuid,p_recipient text) returns text language plpgsql security definer set search_path='' as $$
declare s public.students; token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); recipient_email text; begin
 select * into s from public.students where id=p_student_id for update;
 if s.id is null or not public.may_manage_student(s.id) then raise exception 'Solo Dirección puede enviar la ficha.'; end if;
 if p_recipient not in ('mother','father') or p_recipient is null then raise exception 'Selecciona madre o padre.'; end if;
 if s.status='inactive' then raise exception 'El estudiante está dado de baja.'; end if;
 recipient_email:=case when p_recipient='mother' then s.mother_email else s.father_email end;
 if recipient_email='' then raise exception 'Registra primero el correo de ese responsable.'; end if;
 update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where student_id=s.id and status in ('open','submitted');
 insert into public.family_intake_forms(school_id,student_id,recipient,recipient_email,token_hash,created_by) values(s.school_id,s.id,p_recipient,recipient_email,encode(sha256(convert_to(token,'UTF8')),'hex'),aulanexo_private.actor_uid());
 return token;
end $$;
create function public.family_intake_context(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.family_intake_forms; school public.schools; child public.students; begin
 if p_token !~ '^[a-f0-9]{64}$' or p_token is null then raise exception 'Este enlace no está disponible.'; end if;
 select * into f from public.family_intake_forms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if f.id is null or f.status='revoked' or f.expires_at<=now() then raise exception 'Este enlace venció o fue reemplazado. Solicita otro a Dirección.'; end if;
 select * into school from public.schools where id=f.school_id;
 select * into child from public.students where id=f.student_id;
 if school.status<>'active' or child.status='inactive' then raise exception 'La inscripción ya no está disponible.'; end if;
 return jsonb_build_object('schoolName',school.name,'logoUrl',nullif(school.logo_url,''),'childName',child.first_name,'recipient',f.recipient,'status',f.status,'expiresAt',f.expires_at);
end $$;
create function public.submit_family_intake(p_token text,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f public.family_intake_forms; validated_profile jsonb; begin
 perform public.family_intake_context(p_token);
 select * into f from public.family_intake_forms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if f.status in ('submitted','approved') then return; end if;
 if f.status<>'open' then raise exception 'El enlace ya no está disponible.'; end if;
 validated_profile:=aulanexo_private.validate_care_profile(p_profile);
 update public.family_intake_forms set profile=validated_profile,status='submitted',submitted_at=now() where id=f.id;
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
 select user_id,f.school_id,f.student_id,'intake',f.id,'Ficha familiar recibida','Revisa los datos de cuidado de la inscripción.','students' from public.school_memberships where school_id=f.school_id and role='director' and active
 on conflict(user_id,kind,source_id) do nothing;
end $$;
create function public.review_family_intake(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare f public.family_intake_forms; begin
 select * into f from public.family_intake_forms where id=p_id for update;
 if f.id is null or not public.may_manage_student(f.student_id) then raise exception 'Solo Dirección puede revisar esta ficha.'; end if;
 if f.status='approved' and p_approve then return; end if;
 if f.status<>'submitted' then raise exception 'Esta ficha ya fue revisada o reemplazada.'; end if;
 if p_approve is null then raise exception 'Selecciona una respuesta.'; end if;
 if p_approve then perform public.complete_student_profile(f.student_id,f.profile); end if;
 update public.family_intake_forms set status=case when p_approve then 'approved' else 'revoked' end,reviewed_at=now(),reviewed_by=auth.uid() where id=f.id;
end $$;
create function public.revoke_family_intake(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.family_intake_forms where id=p_id and public.may_manage_student(student_id)) then raise exception 'Solo Dirección puede retirar esta ficha.'; end if;
 update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where id=p_id and status in ('open','submitted');
end $$;
revoke all on function public.create_family_intake(uuid,text),public.review_family_intake(uuid,boolean),public.revoke_family_intake(uuid) from public,anon;
grant execute on function public.create_family_intake(uuid,text),public.review_family_intake(uuid,boolean),public.revoke_family_intake(uuid) to authenticated;
revoke all on function public.family_intake_context(text),public.submit_family_intake(text,jsonb) from public;
grant execute on function public.family_intake_context(text),public.submit_family_intake(text,jsonb) to anon,authenticated;

create table public.student_documents (
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,
 category text not null check(category in ('ci','birth_certificate','insurance','other')),file_name text not null check(length(file_name) between 1 and 180),
 object_key text not null unique,mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),uploaded_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
alter table public.student_documents enable row level security;
revoke all on public.student_documents from public,anon,authenticated;
grant select,insert on public.student_documents to authenticated;
create policy documents_select on public.student_documents for select to authenticated using(public.may_manage_student(student_id) or public.is_verified_guardian(student_id));
create policy documents_insert on public.student_documents for insert to authenticated with check(public.may_manage_student(student_id) and uploaded_by=aulanexo_private.actor_uid() and object_key like school_id::text||'/'||student_id::text||'/documents/'||aulanexo_private.actor_uid()::text||'/%');
create policy documents_scope on public.student_documents as restrictive for all to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin()) with check(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin());
create trigger audit_documents after insert on public.student_documents for each row execute function aulanexo_private.capture_audit();
-- Nunca devolver datos médicos desde el formulario público. Auditoría registra solo su estado.

-- Cambios de correo o de responsables revocan los accesos anteriores inmediatamente.
create function aulanexo_private.sync_parent_auth() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid; begin
 for sid in select s.id from public.students s where s.mother_email=lower(new.email) or s.father_email=lower(new.email)
 or exists(select 1 from public.student_guardians g where g.student_id=s.id and g.user_id=new.id) loop
  perform aulanexo_private.sync_student_parents(sid);
 end loop;
 return new;
end $$;
revoke all on function aulanexo_private.sync_parent_auth() from public,anon,authenticated;
create trigger micole_parent_auth after insert or update of email,email_confirmed_at on auth.users for each row execute function aulanexo_private.sync_parent_auth();
-- El cambio del destinatario invalida el enlace compartido para sus datos anteriores.
create function aulanexo_private.protect_intake_recipient() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where student_id=new.id and status in ('open','submitted')
 and not ((recipient='mother' and recipient_email=new.mother_email) or (recipient='father' and recipient_email=new.father_email));
 return new;
end $$;
revoke all on function aulanexo_private.protect_intake_recipient() from public,anon,authenticated;
create trigger protect_intake_recipient after update of mother_email,father_email on public.students for each row execute function aulanexo_private.protect_intake_recipient();
-- La campana conserva avisos de pagos para padres vinculados, incluso con la agenda bloqueada.
drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and
 (kind='school_request' or (student_id is not null and ((kind in ('payment','access','intake') and public.may_access_student(student_id)) or public.may_use_student(student_id)))
 or (student_id is null and kind<>'school_request' and public.may_use_classroom(school_id,classroom_id))));
