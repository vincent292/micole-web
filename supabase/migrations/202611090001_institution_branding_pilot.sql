-- The initial rollout is restricted to enabled, persisted test institutions.
alter table public.schools add column appearance jsonb;
create function aulanexo_private.require_branding_manager(p_school uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not aulanexo_private.persisted_testing(p_school) or not aulanexo_private.in_support_school(p_school)
 or not (public.has_school_role(p_school,array['director']) or public.is_platform_admin()) then
  raise exception 'La personalización piloto solo está disponible para Dirección en una institución persistida de pruebas.';
 end if;
end $$;
revoke all on function aulanexo_private.require_branding_manager(uuid) from public,anon,authenticated,service_role;
create function aulanexo_private.validate_school_appearance(p_config jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>3000
 or coalesce(p_config->>'template','') not in ('aurora','academia','bosque','atelier','horizonte')
 or coalesce(p_config->>'primary','') !~ '^#[0-9A-Fa-f]{6}$'
 or coalesce(p_config->>'accent','') !~ '^#[0-9A-Fa-f]{6}$'
 or length(coalesce(p_config->>'welcome',''))>140
 or length(coalesce(p_config->>'tagline',''))>100 then raise exception 'Revisa la plantilla, los colores y los textos institucionales.';end if;
 return jsonb_build_object('version',1,'template',p_config->>'template','primary',upper(p_config->>'primary'),'accent',upper(p_config->>'accent'),'welcome',trim(coalesce(p_config->>'welcome','')),'tagline',trim(coalesce(p_config->>'tagline','')));
end $$;
revoke all on function aulanexo_private.validate_school_appearance(jsonb) from public,anon,authenticated,service_role;
create function aulanexo_private.guard_school_appearance() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (TG_OP='INSERT' and new.appearance is not null) or (TG_OP='UPDATE' and new.appearance is distinct from old.appearance) then
  perform aulanexo_private.require_branding_manager(new.id);
  if new.appearance is not null then new.appearance:=aulanexo_private.validate_school_appearance(new.appearance);end if;
 end if;
 return new;
end $$;
revoke all on function aulanexo_private.guard_school_appearance() from public,anon,authenticated,service_role;
create trigger guard_school_appearance before insert or update of appearance on public.schools for each row execute function aulanexo_private.guard_school_appearance();
create function public.save_school_appearance(p_school_id uuid,p_config jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare config jsonb;
begin
 perform aulanexo_private.require_branding_manager(p_school_id);
 config:=case when p_config is null then null else aulanexo_private.validate_school_appearance(p_config) end;
 update public.schools set appearance=config where id=p_school_id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(p_school_id,auth.uid(),'Personalización institucional','school_appearance',p_school_id,'UPDATE',jsonb_build_object('name',case when config is null then 'Personalización desactivada' else 'Plantilla institucional aplicada' end,'template',config->>'template'));
 return config;
end $$;
revoke all on function public.save_school_appearance(uuid,jsonb) from public,anon;
grant execute on function public.save_school_appearance(uuid,jsonb) to authenticated;

create table aulanexo_private.school_credentials (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id),student_id uuid not null references public.students(id),
 year integer not null check(year between 2020 and 2100),
 code text not null unique default ('MC-'||upper(replace(gen_random_uuid()::text,'-',''))),
 student_name text not null,classroom_name text not null,
 issued_at timestamptz not null default now(),expires_on date not null,
 issued_by uuid not null references auth.users(id),revoked_at timestamptz,revoked_by uuid references auth.users(id)
);
create unique index school_credential_active on aulanexo_private.school_credentials(student_id,year) where revoked_at is null;
revoke all on aulanexo_private.school_credentials from public,anon,authenticated,service_role;
create function aulanexo_private.credential_json(p_card aulanexo_private.school_credentials) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',p_card.id,'schoolId',p_card.school_id,'studentId',p_card.student_id,'year',p_card.year,'code',p_card.code,'studentName',p_card.student_name,'classroomName',p_card.classroom_name,'issuedAt',p_card.issued_at,'expiresOn',p_card.expires_on,'status',case when p_card.revoked_at is not null then 'revoked' when p_card.expires_on<(now() at time zone 'America/La_Paz')::date then 'expired' else 'active' end);
$$;
revoke all on function aulanexo_private.credential_json(aulanexo_private.school_credentials) from public,anon,authenticated,service_role;
create function public.school_credentials(p_school_id uuid,p_student_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not aulanexo_private.persisted_testing(p_school_id) or not aulanexo_private.in_support_school(p_school_id)
 or not(public.has_school_role(p_school_id,array['director']) or p_student_id is not null and public.may_access_student(p_student_id)) then raise exception 'No tienes acceso a estos carnets.';end if;
 select coalesce(jsonb_agg(aulanexo_private.credential_json(c) order by c.issued_at desc),'[]') into result from aulanexo_private.school_credentials c where c.school_id=p_school_id and (p_student_id is null or c.student_id=p_student_id);
 return result;
end $$;
create function public.issue_school_credential(p_school_id uuid,p_student_id uuid,p_year integer,p_replace_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.students;card aulanexo_private.school_credentials;room_name text;
begin
 perform aulanexo_private.require_branding_manager(p_school_id);
 if p_year is null or p_year not between extract(year from (now() at time zone 'America/La_Paz'))::integer and extract(year from (now() at time zone 'America/La_Paz'))::integer+1 then raise exception 'Selecciona la gestión actual o la siguiente.';end if;
 select * into child from public.students where id=p_student_id and school_id=p_school_id and status='active';
 if child.id is null then raise exception 'Selecciona un estudiante activo de esta sede.';end if;
 perform pg_advisory_xact_lock(hashtext('credential:'||p_student_id::text||':'||p_year::text));
 select * into card from aulanexo_private.school_credentials where student_id=p_student_id and year=p_year and revoked_at is null for update;
 if p_replace_id is null and card.id is not null then return aulanexo_private.credential_json(card);end if;
 if p_replace_id is not null then
  if card.id is distinct from p_replace_id then raise exception 'El carnet cambió. Actualiza la lista antes de reemitir.';end if;
  update aulanexo_private.school_credentials set revoked_at=now(),revoked_by=auth.uid() where id=card.id;
 end if;
 select name into room_name from public.classrooms where id=child.classroom_id and school_id=p_school_id;
 insert into aulanexo_private.school_credentials(school_id,student_id,year,student_name,classroom_name,expires_on,issued_by)
 values(p_school_id,p_student_id,p_year,concat_ws(' ',child.first_name,child.last_name),coalesce(room_name,'Sin aula'),make_date(p_year,12,31),auth.uid()) returning * into card;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(p_school_id,auth.uid(),'Carnet institucional','school_credentials',card.id,'INSERT',jsonb_build_object('name','Carnet escolar emitido','year',p_year,'replaces',p_replace_id));
 return aulanexo_private.credential_json(card);
end $$;
create function public.verify_school_credential(p_school_id uuid,p_code text) returns jsonb language plpgsql security definer set search_path='' as $$
declare card aulanexo_private.school_credentials;
begin
 if auth.uid() is null or not aulanexo_private.in_support_school(p_school_id) or not aulanexo_private.persisted_testing(p_school_id) then raise exception 'Inicia sesión en una sede autorizada.';end if;
 select * into card from aulanexo_private.school_credentials where school_id=p_school_id and code=upper(trim(p_code));
 if not(public.has_school_role(p_school_id,array['director']) or card.id is not null and public.may_access_student(card.student_id)) then raise exception 'No tienes permiso para verificar este carnet.';end if;
 if card.id is null then return jsonb_build_object('found',false);end if;
 return aulanexo_private.credential_json(card)||jsonb_build_object('found',true);
end $$;
revoke all on function public.school_credentials(uuid,uuid),public.issue_school_credential(uuid,uuid,integer,uuid),public.verify_school_credential(uuid,text) from public,anon;
grant execute on function public.school_credentials(uuid,uuid),public.issue_school_credential(uuid,uuid,integer,uuid),public.verify_school_credential(uuid,text) to authenticated;

-- The limited student portal receives the same public visual identity, no new records.
do $$begin execute replace(pg_get_functiondef('public.student_portal()'::regprocedure),'FUNCTION public.student_portal(','FUNCTION aulanexo_private.student_portal_before_appearance(');end $$;
revoke all on function aulanexo_private.student_portal_before_appearance() from public,anon,authenticated,service_role;
create or replace function public.student_portal() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:=aulanexo_private.student_portal_before_appearance();schools jsonb;
begin
 select coalesce(jsonb_agg(s||jsonb_build_object('appearance',(select appearance from public.schools where id=(s->>'id')::uuid))),'[]') into schools from jsonb_array_elements(coalesce(result->'schools','[]')) s;
 return jsonb_set(result,'{schools}',schools);
end $$;
