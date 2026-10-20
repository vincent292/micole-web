-- A site uses the existing school tenant boundary. Billing, bank credentials and
-- academic records remain independent; institution_id groups authorized sites.
alter table public.schools add column institution_id uuid references public.schools(id),
 add column site_name text not null default 'Sede principal',
 add column education_levels text[] not null default '{}',
 add constraint institution_not_self check(institution_id is distinct from id);
create index schools_institution_idx on public.schools(institution_id);
alter table public.school_memberships add column institution_inherited boolean not null default false;

create function aulanexo_private.site_manager(p_root uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c aulanexo_private.support_sessions:=aulanexo_private.test_context();begin
 if c.id is not null then return c.role='director' and coalesce((select institution_id from public.schools where id=c.school_id),c.school_id)=p_root;end if;
 return auth.uid() is not null and aulanexo_private.in_support_school(p_root) and public.has_school_role(p_root,array['director']) and not public.is_platform_admin();
end $$;
revoke all on function aulanexo_private.site_manager(uuid) from public,anon,authenticated;

create function aulanexo_private.sync_site_directors() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.school_memberships;begin
 m:=case when TG_OP='DELETE' then old else new end;
 if m.role<>'director' or exists(select 1 from public.schools where id=m.school_id and institution_id is not null) then return null;end if;
 if TG_OP='DELETE' then
  update public.school_memberships set active=false where institution_inherited and user_id=m.user_id and role='director' and school_id in(select id from public.schools where institution_id=m.school_id);
 else
  insert into public.school_memberships(school_id,user_id,role,active,institution_inherited)
  select id,m.user_id,'director',m.active,true from public.schools where institution_id=m.school_id
  on conflict(school_id,user_id,role) do update set active=excluded.active where public.school_memberships.institution_inherited;
 end if;
 return null;
end $$;
revoke all on function aulanexo_private.sync_site_directors() from public,anon,authenticated;
create trigger sync_site_directors after insert or update of active or delete on public.school_memberships for each row execute function aulanexo_private.sync_site_directors();

create function public.institution_sites(p_school_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare root uuid;manager boolean;sites jsonb;begin
 select coalesce(institution_id,id) into root from public.schools where id=p_school_id;
 if root is null or not(aulanexo_private.site_manager(root) or (aulanexo_private.in_support_school(p_school_id) and public.has_school_role(p_school_id,array['director']))) then raise exception 'Solo Dirección puede consultar sus sedes.';end if;
 manager:=aulanexo_private.site_manager(root);
 select coalesce(jsonb_agg(jsonb_build_object('school',to_jsonb(s),'students',(select count(*) from public.students where school_id=s.id and status='active'),
 'directors',case when manager then coalesce((select jsonb_agg(jsonb_build_object('email',u.email,'name',coalesce(u.raw_user_meta_data->>'full_name',u.email),'inherited',m.institution_inherited,'active',m.active)) from public.school_memberships m join auth.users u on u.id=m.user_id where m.school_id=s.id and m.role='director'),'[]') else '[]'::jsonb end,
 'invitations',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'expiresAt',i.expires_at)) from public.invitations i where i.school_id=s.id and i.role='director' and i.status='pending' and i.expires_at>now()),'[]') else '[]'::jsonb end) order by s.institution_id nulls first,s.site_name),'[]') into sites
 from public.schools s where (s.id=root or s.institution_id=root) and (manager or s.id=p_school_id);
 return jsonb_build_object('institutionId',root,'canManage',manager,'sites',sites,'billing','per_site');
end $$;

create function public.save_institution_site(p_school_id uuid,p_site jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare root public.schools;sid uuid;existing public.schools;label text;levels text[];begin
 select * into root from public.schools where id=(select coalesce(institution_id,id) from public.schools where id=p_school_id);
 if root.id is null or not aulanexo_private.site_manager(root.id) then raise exception 'Solo la Dirección de la institución puede administrar sedes.';end if;
 if jsonb_typeof(p_site) is distinct from 'object' then raise exception 'Revisa los datos de la sede.';end if;
 sid:=coalesce(nullif(p_site->>'id','')::uuid,gen_random_uuid());
 perform pg_advisory_xact_lock(hashtext(root.id::text||':sites'));
 select * into existing from public.schools where id=sid for update;
 if existing.id is not null and coalesce(existing.institution_id,existing.id)<>root.id then raise exception 'La sede pertenece a otra institución.';end if;
 label:=btrim(coalesce(p_site->>'siteName',''));
 if length(label) not between 2 and 100 or length(coalesce(p_site->>'city',''))>100 or length(coalesce(p_site->>'address',''))>500 or length(coalesce(p_site->>'phone',''))>40 then raise exception 'Revisa nombre, ciudad, dirección y teléfono de la sede.';end if;
 if jsonb_typeof(p_site->'educationLevels') is distinct from 'array' or jsonb_array_length(p_site->'educationLevels') not between 1 and 6 then raise exception 'Selecciona los niveles de la sede.';end if;
 select coalesce(array_agg(value),'{}') into levels from jsonb_array_elements_text(p_site->'educationLevels');
 if not levels <@ array['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros']::text[] then raise exception 'Nivel educativo no reconocido.';end if;
 if existing.id is null then
  if root.status<>'active' then raise exception 'La institución debe estar activa para agregar una sede.';end if;
  insert into public.schools(id,institution_id,site_name,education_levels,name,slug,city,address,phone,nit,brand_color,logo_url,status,show_on_landing)
  values(sid,root.id,label,levels,root.name,'sede-'||replace(sid::text,'-',''),coalesce(nullif(p_site->>'city',''),root.city),coalesce(p_site->>'address',''),coalesce(p_site->>'phone',''),root.nit,root.brand_color,root.logo_url,'active',false);
  insert into public.school_memberships(school_id,user_id,role,active,institution_inherited)
  select sid,user_id,'director',true,true from public.school_memberships where school_id=root.id and role='director' and active;
  if (aulanexo_private.test_context()).id is not null then
   insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values(sid,true,auth.uid());
  end if;
 else
  update public.schools set site_name=label,education_levels=levels,city=coalesce(p_site->>'city',city),address=coalesce(p_site->>'address',address),phone=coalesce(p_site->>'phone',phone) where id=sid;
 end if;
 return sid;
end $$;

create function public.set_site_director(p_site_id uuid,p_email text,p_active boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare site public.schools;uid uuid;token text;email_value text:=lower(btrim(coalesce(p_email,'')));begin
 select * into site from public.schools where id=p_site_id for update;
 if site.institution_id is null or not aulanexo_private.site_manager(site.institution_id) then raise exception 'Solo la Dirección de la institución puede asignar responsables a sus sucursales.';end if;
 if email_value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(email_value)>254 or p_active is null then raise exception 'Registra un correo válido y una acción.';end if;
 select id into uid from auth.users where lower(email)=email_value and email_confirmed_at is not null;
 if uid is not null and exists(select 1 from public.school_memberships where school_id=p_site_id and user_id=uid and role='director' and institution_inherited) then raise exception 'Este acceso se administra desde la Dirección principal.';end if;
 update public.invitations set status='revoked' where school_id=p_site_id and role='director' and email=email_value and status='pending';
 if uid is not null then
  insert into public.school_memberships(school_id,user_id,role,active) values(p_site_id,uid,'director',p_active) on conflict(school_id,user_id,role) do update set active=excluded.active;
  return jsonb_build_object('linked',p_active);
 elsif p_active then
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into public.invitations(school_id,email,role,relationship,token_hash,created_by) values(p_site_id,email_value,'director','other',encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
  return jsonb_build_object('token',token,'linked',false);
 end if;
 return jsonb_build_object('linked',false);
end $$;

create function public.switch_test_site(p_site_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c aulanexo_private.support_sessions:=aulanexo_private.test_context();root uuid;begin
 if c.id is null or c.role<>'director' then raise exception 'Este cambio solo está disponible en una sesión de pruebas de Dirección.';end if;
 select coalesce(institution_id,id) into root from public.schools where id=c.school_id;
 if not exists(select 1 from public.schools s join aulanexo_private.test_institutions t on t.school_id=s.id and t.enabled where s.id=p_site_id and coalesce(s.institution_id,s.id)=root) then raise exception 'La sede no pertenece a esta institución de pruebas.';end if;
 update aulanexo_private.support_sessions set school_id=p_site_id where id=c.id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values(p_site_id,auth.uid(),'Propietario MiCole','support_sessions',c.id,'UPDATE',jsonb_build_object('name','Cambio de sede en pruebas','previousSchoolId',c.school_id));
end $$;

create table aulanexo_private.assistant_usage(id bigint generated always as identity primary key,school_id uuid not null references public.schools(id),user_id uuid not null references auth.users(id),created_at timestamptz not null default now());
create index assistant_usage_limit on aulanexo_private.assistant_usage(user_id,created_at);
revoke all on aulanexo_private.assistant_usage from public,anon,authenticated,service_role;
create function public.reserve_assistant_request(p_school_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform aulanexo_private.require_document_manager(p_school_id);
 perform pg_advisory_xact_lock(hashtext('micole-assistant:'||auth.uid()::text));
 if (select count(*) from aulanexo_private.assistant_usage where user_id=auth.uid() and created_at>now()-interval '1 hour')>=30 or (select count(*) from aulanexo_private.assistant_usage where school_id=p_school_id and created_at>now()-interval '1 day')>=300 then raise exception 'Se alcanzó el límite de consultas al asistente. Inténtalo más tarde.';end if;
 delete from aulanexo_private.assistant_usage where created_at<now()-interval '7 days';
 insert into aulanexo_private.assistant_usage(school_id,user_id) values(p_school_id,auth.uid());
end $$;
revoke all on function public.institution_sites(uuid),public.save_institution_site(uuid,jsonb),public.set_site_director(uuid,text,boolean),public.switch_test_site(uuid),public.reserve_assistant_request(uuid) from public,anon;
grant execute on function public.institution_sites(uuid),public.save_institution_site(uuid,jsonb),public.set_site_director(uuid,text,boolean),public.switch_test_site(uuid),public.reserve_assistant_request(uuid) to authenticated;
