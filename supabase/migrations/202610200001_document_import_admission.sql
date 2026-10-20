-- Formularios por gestión, datos familiares ampliados e importación revisada de calendario.
alter table public.students add column admission_details jsonb not null default '{}'::jsonb check(jsonb_typeof(admission_details)='object' and octet_length(admission_details::text)<=70000);
alter table public.family_intake_forms add column template_snapshot jsonb not null default '{}'::jsonb;
alter table public.calendar_events add column end_date date;
alter table public.calendar_events add constraint calendar_event_range check(end_date is null or (end_date>=event_date and end_date<=event_date+365));
create table public.admission_templates(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),academic_year integer not null check(academic_year between 2020 and 2100),
 title text not null check(length(trim(title)) between 1 and 160),fields jsonb not null,instructions text not null default '' check(length(instructions)<=12000),
 revision integer not null default 1,updated_by uuid not null references auth.users(id),updated_at timestamptz not null default now(),unique(school_id,academic_year)
);
alter table public.admission_templates enable row level security;
revoke all on public.admission_templates from public,anon,authenticated;
grant select on public.admission_templates to authenticated;
create policy admission_template_director on public.admission_templates for select to authenticated using(public.has_school_role(school_id,array['director']) and aulanexo_private.in_support_school(school_id) and not public.is_platform_admin());
create trigger audit_admission_templates after insert or update on public.admission_templates for each row execute function aulanexo_private.capture_audit();
create table aulanexo_private.document_analysis_usage(id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
revoke all on aulanexo_private.document_analysis_usage from public,anon,authenticated,service_role;
create index document_analysis_usage_date on aulanexo_private.document_analysis_usage(created_at,school_id,user_id);
create table public.document_imports(
 id uuid primary key,school_id uuid not null references public.schools(id),academic_year integer not null check(academic_year between 2020 and 2100),classroom_id uuid,
 source_hash text not null check(source_hash ~ '^[a-f0-9]{64}$'),event_count integer not null default 0,created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 foreign key(classroom_id,school_id) references public.classrooms(id,school_id)
);
alter table public.document_imports enable row level security;
revoke all on public.document_imports from public,anon,authenticated;
grant select on public.document_imports to authenticated;
create policy document_imports_director on public.document_imports for select to authenticated using(public.has_school_role(school_id,array['director']) and aulanexo_private.in_support_school(school_id) and not public.is_platform_admin());
create trigger audit_document_imports after insert on public.document_imports for each row execute function aulanexo_private.capture_audit();

create function aulanexo_private.require_document_manager(p_school uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or public.is_platform_admin() or not aulanexo_private.in_support_school(p_school) or not public.has_school_role(p_school,array['director']) or not exists(select 1 from public.schools where id=p_school and status='active') then raise exception 'Solo Dirección puede importar documentos de esta institución.';end if;
end $$;
revoke all on function aulanexo_private.require_document_manager(uuid) from public,anon,authenticated;
create function public.reserve_document_analysis(p_school_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.require_document_manager(p_school_id);
 perform pg_advisory_xact_lock(hashtext('micole-document-analysis'));
 if (select count(*) from aulanexo_private.document_analysis_usage where user_id=auth.uid() and created_at>now()-interval '1 day')>=30 or (select count(*) from aulanexo_private.document_analysis_usage where school_id=p_school_id and created_at>now()-interval '1 day')>=100 then raise exception 'Se alcanzó el límite diario de lectura de documentos. Puedes continuar mañana.'; end if;
 delete from aulanexo_private.document_analysis_usage where created_at<now()-interval '7 days';
 insert into aulanexo_private.document_analysis_usage(school_id,user_id) values(p_school_id,auth.uid());
end $$;

create function aulanexo_private.validate_admission_fields(p_fields jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare f jsonb; result jsonb:='[]';keys text[]:='{}';o jsonb;
begin
 if p_fields is null or jsonb_typeof(p_fields)<>'array' or jsonb_array_length(p_fields)>60 or octet_length(p_fields::text)>50000 then raise exception 'Revisa las preguntas del formulario.';end if;
 for f in select value from jsonb_array_elements(p_fields) loop
  if jsonb_typeof(f)<>'object' or coalesce(f->>'key','') !~ '^[a-z][a-z0-9_]{0,63}$' or f->>'key'=any(keys) or coalesce(length(trim(f->>'label')),0) not between 1 and 200 or coalesce(f->>'type','') not in ('text','textarea','tel','date','select') or jsonb_typeof(f->'required') is distinct from 'boolean' or coalesce(length(f->>'section'),0)>100 or jsonb_typeof(f->'options') is distinct from 'array' or jsonb_array_length(f->'options')>30 then raise exception 'Revisa los nombres, tipos y opciones de las preguntas.';end if;
  for o in select value from jsonb_array_elements(f->'options') loop
   if jsonb_typeof(o)<>'string' or length(trim(o#>>'{}')) not between 1 and 160 then raise exception 'Revisa las opciones de respuesta.'; end if;
  end loop;
  if f->>'type'='select' and jsonb_array_length(f->'options')=0 then raise exception 'Agrega opciones a la pregunta de selección.';end if;
  keys:=array_append(keys,f->>'key');
  result:=result||jsonb_build_array(jsonb_build_object('key',f->>'key','label',trim(f->>'label'),'section',coalesce(nullif(trim(f->>'section'),''),'Información adicional'),'type',f->>'type','required',(f->>'required')::boolean,'options',f->'options'));
 end loop;
 return result;
end $$;
revoke all on function aulanexo_private.validate_admission_fields(jsonb) from public,anon,authenticated;
create function public.save_admission_template(p_school_id uuid,p_year integer,p_template jsonb,p_expected_revision integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare current_revision integer; row_value public.admission_templates;
begin
 perform aulanexo_private.require_document_manager(p_school_id);
 if p_year is null or p_year not between 2020 and 2100 or p_template is null or jsonb_typeof(p_template)<>'object' or octet_length(p_template::text)>70000 or coalesce(length(trim(p_template->>'title')),0) not between 1 and 160 or coalesce(length(p_template->>'instructions'),0)>12000 then raise exception 'Revisa el título, gestión y condiciones del formulario.';end if;
 perform pg_advisory_xact_lock(hashtext(p_school_id::text||':admission:'||p_year));
 select revision into current_revision from public.admission_templates where school_id=p_school_id and academic_year=p_year for update;
 if coalesce(current_revision,0) is distinct from p_expected_revision then raise exception 'El formulario fue actualizado por otra persona. Ábrelo de nuevo antes de guardar.';end if;
 insert into public.admission_templates(school_id,academic_year,title,fields,instructions,updated_by)
 values(p_school_id,p_year,trim(p_template->>'title'),aulanexo_private.validate_admission_fields(p_template->'fields'),coalesce(p_template->>'instructions',''),auth.uid())
 on conflict(school_id,academic_year) do update set title=excluded.title,fields=excluded.fields,instructions=excluded.instructions,revision=admission_templates.revision+1,updated_by=auth.uid(),updated_at=now() returning * into row_value;
 return to_jsonb(row_value);
end $$;
create function aulanexo_private.admission_template_snapshot(p_school uuid,p_year integer) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('id',id,'title',title,'academicYear',academic_year,'fields',fields,'instructions',instructions,'revision',revision) from public.admission_templates where school_id=p_school and academic_year=p_year),'{}'::jsonb);
$$;
revoke all on function aulanexo_private.admission_template_snapshot(uuid,integer) from public,anon,authenticated;
create function public.student_admission_template(p_student_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid;y integer;begin
 if not (public.may_manage_student(p_student_id) or public.is_verified_guardian(p_student_id)) then raise exception 'No tienes acceso a esta ficha.';end if;
 select s.school_id,c.academic_year into sid,y from public.students s join public.classrooms c on c.id=s.classroom_id where s.id=p_student_id;
 return aulanexo_private.admission_template_snapshot(sid,y);
end $$;
create function aulanexo_private.validate_admission_details(p_details jsonb,p_template jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f jsonb;k text;v jsonb;answer text;fields jsonb;answers jsonb:='{}';n integer;
begin
 if p_details is null or jsonb_typeof(p_details)<>'object' or octet_length(p_details::text)>65000 then raise exception 'Revisa los datos familiares adicionales.';end if;
 fields:=coalesce(p_details->'fields','{}');
 if jsonb_typeof(fields)<>'object' or (select count(*) from jsonb_object_keys(fields))>60 or jsonb_typeof(coalesce(p_details->'customAnswers','{}'))<>'object' then raise exception 'Revisa las respuestas familiares.';end if;
 for k,v in select * from jsonb_each(fields) loop
  if k !~ '^[a-zA-Z][a-zA-Z0-9]{0,63}$' or jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Revisa los datos familiares.';end if;
 end loop;
 for n in 1..5 loop
  if coalesce(fields->>('pickup'||n||'Name'),'')<>'' or coalesce(fields->>('pickup'||n||'Identity'),'')<>'' or coalesce(fields->>('pickup'||n||'Relationship'),'')<>'' or coalesce(fields->>('pickup'||n||'Phone'),'')<>'' then
   if length(trim(coalesce(fields->>('pickup'||n||'Name'),'')))<2 or length(trim(coalesce(fields->>('pickup'||n||'Identity'),'')))<2 or length(trim(coalesce(fields->>('pickup'||n||'Relationship'),'')))<2 then raise exception 'Completa nombre, CI y parentesco de cada persona autorizada para el recojo.';end if;
  end if;
 end loop;
 if coalesce(fields->>'emergencyAuthorization','') not in ('','Sí','No') then raise exception 'Revisa la declaración de emergencia.';end if;
 if fields->>'emergencyAuthorization' in ('Sí','No') and (length(trim(coalesce(fields->>'authorizationName','')))<2 or length(trim(coalesce(fields->>'authorizationIdentity','')))<2) then raise exception 'Completa nombre y CI de quien declara para emergencias.';end if;
 for f in select value from jsonb_array_elements(coalesce(p_template->'fields','[]')) loop
  v:=p_details->'customAnswers'->(f->>'key');
  if v is not null and jsonb_typeof(v)<>'string' then raise exception 'Revisa las respuestas adicionales.';end if;
  answer:=trim(coalesce(v#>>'{}',''));
  if length(answer)>2000 or ((f->>'required')::boolean and answer='') then raise exception 'Completa o revisa: %',f->>'label';end if;
  if answer<>'' and f->>'type'='select' and not (f->'options' ? answer) then raise exception 'Selecciona una opción válida para: %',f->>'label';end if;
  if answer<>'' and f->>'type'='date' then
   if answer !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Revisa la fecha de: %',f->>'label';end if;
   perform answer::date;
  end if;
  answers:=answers||jsonb_build_object(f->>'key',answer);
 end loop;
 return jsonb_build_object('fields',fields,'customAnswers',answers,'template',p_template,'recordedAt',now());
end $$;
revoke all on function aulanexo_private.validate_admission_details(jsonb,jsonb) from public,anon,authenticated;

-- La normalización histórica conserva sus validaciones; los nuevos datos tienen límites propios.
alter function aulanexo_private.validate_care_profile(jsonb) rename to validate_care_profile_20261019;
create function aulanexo_private.validate_care_profile(p_profile jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 return aulanexo_private.validate_care_profile_20261019(p_profile-'admissionDetails')||case when p_profile ? 'admissionDetails' then jsonb_build_object('admissionDetails',p_profile->'admissionDetails') else '{}'::jsonb end;
end $$;
revoke all on function aulanexo_private.validate_care_profile(jsonb) from public,anon,authenticated;
create or replace function public.complete_student_profile(p_student_id uuid,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare value jsonb; details jsonb;template jsonb;s public.students;
begin
 if not(public.may_manage_student(p_student_id) or public.is_verified_guardian(p_student_id)) then raise exception 'No tienes acceso a este estudiante.';end if;
 select * into s from public.students where id=p_student_id for update;
 value:=aulanexo_private.validate_care_profile(p_profile);
 template:=public.student_admission_template(p_student_id);
 details:=aulanexo_private.validate_admission_details(coalesce(value->'admissionDetails',s.admission_details),template);
 update public.students set allergies=value->>'allergies',food_restrictions=value->>'foodRestrictions',emergency_contact=value->>'emergencyContact',emergency_phone=value->>'emergencyPhone',
 second_emergency_contact=value->>'secondEmergencyContact',second_emergency_phone=value->>'secondEmergencyPhone',has_insurance=(value->>'hasInsurance')::boolean,
 insurance_provider=value->>'insuranceProvider',insurance_number=value->>'insuranceNumber',medical_conditions=value->>'medicalConditions',care_instructions=value->>'careInstructions',admission_details=details,profile_complete=true where id=p_student_id;
 update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where student_id=p_student_id and status in ('open','submitted');
end $$;
alter function public.create_family_intake(uuid,text) rename to create_family_intake_20261019;
alter function public.create_family_intake_20261019(uuid,text) set schema aulanexo_private;
revoke all on function aulanexo_private.create_family_intake_20261019(uuid,text) from public,anon,authenticated;
create function public.create_family_intake(p_student_id uuid,p_recipient text) returns text language plpgsql security definer set search_path='' as $$
declare token text;template jsonb;begin
 template:=public.student_admission_template(p_student_id);
 token:=aulanexo_private.create_family_intake_20261019(p_student_id,p_recipient);
 update public.family_intake_forms set template_snapshot=template where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 return token;
end $$;
alter function public.family_intake_context(text) rename to family_intake_context_20261019;
alter function public.family_intake_context_20261019(text) set schema aulanexo_private;
revoke all on function aulanexo_private.family_intake_context_20261019(text) from public,anon,authenticated;
create function public.family_intake_context(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare context jsonb;begin
 context:=aulanexo_private.family_intake_context_20261019(p_token);
 return context||jsonb_build_object('template',(select template_snapshot from public.family_intake_forms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex')));
end $$;
create or replace function public.submit_family_intake(p_token text,p_profile jsonb) returns void language plpgsql security definer set search_path='' as $$
declare f public.family_intake_forms;value jsonb;begin
 perform public.family_intake_context(p_token);
 select * into f from public.family_intake_forms where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if f.status in ('submitted','approved') then return;end if;
 if f.status<>'open' then raise exception 'El enlace ya no está disponible.';end if;
 value:=aulanexo_private.validate_care_profile(p_profile);
 value:=value||jsonb_build_object('admissionDetails',aulanexo_private.validate_admission_details(coalesce(value->'admissionDetails','{}'),f.template_snapshot));
 update public.family_intake_forms set profile=value,status='submitted',submitted_at=now() where id=f.id;
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
 select user_id,f.school_id,f.student_id,'intake',f.id,'Ficha familiar recibida','Revisa los datos de cuidado de la inscripción.','students' from public.school_memberships where school_id=f.school_id and role='director' and active on conflict(user_id,kind,source_id) do nothing;
end $$;
-- Aprobar siempre la versión que recibió la familia, aunque Dirección publique otra después.
create or replace function public.review_family_intake(p_id uuid,p_approve boolean) returns void language plpgsql security definer set search_path='' as $$
declare f public.family_intake_forms;value jsonb;begin
 select * into f from public.family_intake_forms where id=p_id for update;
 if f.id is null or not public.may_manage_student(f.student_id) then raise exception 'Solo Dirección puede revisar esta ficha.';end if;
 if f.status='approved' and p_approve then return;end if;
 if f.status<>'submitted' or p_approve is null then raise exception 'Esta ficha ya fue revisada o reemplazada.';end if;
 if p_approve then
  value:=aulanexo_private.validate_care_profile(f.profile);
  update public.students set allergies=value->>'allergies',food_restrictions=value->>'foodRestrictions',emergency_contact=value->>'emergencyContact',emergency_phone=value->>'emergencyPhone',second_emergency_contact=value->>'secondEmergencyContact',second_emergency_phone=value->>'secondEmergencyPhone',has_insurance=(value->>'hasInsurance')::boolean,insurance_provider=value->>'insuranceProvider',insurance_number=value->>'insuranceNumber',medical_conditions=value->>'medicalConditions',care_instructions=value->>'careInstructions',admission_details=aulanexo_private.validate_admission_details(coalesce(value->'admissionDetails','{}'),f.template_snapshot),profile_complete=true where id=f.student_id;
  update public.family_intake_forms set status='revoked',reviewed_at=now(),reviewed_by=auth.uid() where student_id=f.student_id and status in ('open','submitted') and id<>f.id;
 end if;
 update public.family_intake_forms set status=case when p_approve then 'approved' else 'revoked' end,reviewed_at=now(),reviewed_by=auth.uid() where id=f.id;
end $$;

create function public.confirm_calendar_import(p_id uuid,p_school_id uuid,p_year integer,p_classroom_id uuid,p_source_hash text,p_events jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare e jsonb;d date;last_day date;added integer:=0;skipped integer:=0;prev public.document_imports;begin
 perform aulanexo_private.require_document_manager(p_school_id);
 if not public.may_edit_classroom(p_school_id,p_classroom_id) then raise exception 'No tienes permiso para publicar en esta agenda.';end if;
 if p_id is null or p_year is null or p_year not between 2020 and 2100 or p_source_hash is null or p_source_hash !~ '^[a-f0-9]{64}$' or p_events is null or jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events) not between 1 and 180 or octet_length(p_events::text)>700000 then raise exception 'Revisa la gestión y las actividades seleccionadas.';end if;
 if p_classroom_id is not null and not exists(select 1 from public.classrooms where id=p_classroom_id and school_id=p_school_id and academic_year=p_year and active) then raise exception 'El aula debe estar activa y pertenecer a la gestión seleccionada.';end if;
 perform pg_advisory_xact_lock(hashtext(p_school_id::text||':calendar-import'));
 select * into prev from public.document_imports where id=p_id;
 if prev.id is not null then
  if prev.school_id<>p_school_id or prev.academic_year<>p_year or prev.classroom_id is distinct from p_classroom_id or prev.source_hash<>p_source_hash then raise exception 'Esta importación pertenece a otra revisión.';end if;
  return jsonb_build_object('added',prev.event_count,'skipped',0,'alreadyConfirmed',true);
 end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if jsonb_typeof(e)<>'object' or coalesce(length(trim(e->>'title')),0) not between 1 and 200 or coalesce(length(e->>'description'),0)>3000 or coalesce(e->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Revisa el título y la fecha de cada actividad seleccionada.';end if;
  d:=(e->>'date')::date;last_day:=coalesce(nullif(e->>'endDate','')::date,d);
  if extract(year from d)<>p_year or extract(year from last_day)<>p_year or last_day<d then raise exception 'Las fechas deben corresponder a la gestión seleccionada, en orden de inicio a fin.';end if;
  if exists(select 1 from public.calendar_events where school_id=p_school_id and classroom_id is not distinct from p_classroom_id and event_date=d and coalesce(end_date,event_date)=last_day and lower(trim(title))=lower(trim(e->>'title'))) then skipped:=skipped+1;continue;end if;
  insert into public.calendar_events(school_id,classroom_id,title,description,event_date,end_date,type,created_by) values(p_school_id,p_classroom_id,trim(e->>'title'),coalesce(e->>'description',''),d,case when last_day=d then null else last_day end,'event',aulanexo_private.actor_uid());
  added:=added+1;
 end loop;
 insert into public.document_imports(id,school_id,academic_year,classroom_id,source_hash,event_count,created_by) values(p_id,p_school_id,p_year,p_classroom_id,p_source_hash,added,auth.uid());
 return jsonb_build_object('added',added,'skipped',skipped,'alreadyConfirmed',false);
end $$;
revoke all on function public.reserve_document_analysis(uuid),public.save_admission_template(uuid,integer,jsonb,integer),public.student_admission_template(uuid),public.confirm_calendar_import(uuid,uuid,integer,uuid,text,jsonb),public.create_family_intake(uuid,text) from public,anon;
grant execute on function public.reserve_document_analysis(uuid),public.save_admission_template(uuid,integer,jsonb,integer),public.student_admission_template(uuid),public.confirm_calendar_import(uuid,uuid,integer,uuid,text,jsonb),public.create_family_intake(uuid,text) to authenticated;
revoke all on function public.family_intake_context(text) from public;
grant execute on function public.family_intake_context(text) to anon,authenticated;

-- El portal de estudiante conserva su respuesta mínima e incluye el fin de los eventos.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.student_portal_before_subjects()'::regprocedure);
 definition:=replace(definition,'''date'',e.event_date,''description''','''date'',e.event_date,''endDate'',e.end_date,''description''');
 execute definition;
end $$;
