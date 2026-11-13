-- Preserve selected levels from incorporation request through approval.
-- Existing requests and older clients remain valid without declared levels.
alter table public.institution_requests add column education_levels text[] not null default '{}'
  check (cardinality(education_levels) <= 6
    and array_position(education_levels, null) is null
    and education_levels <@ array['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros']::text[]);

create function aulanexo_private.institution_mode_for_levels(p_levels text[]) returns text
language sql immutable set search_path='' as $$
  select case
    when cardinality(p_levels)>0 and p_levels <@ array['Guardería','Inicial']::text[] then 'kinder'
    when p_levels && array['Primaria','Secundaria']::text[] and not p_levels && array['Guardería','Inicial']::text[] then 'school'
    else 'auto' end;
$$;
revoke all on function aulanexo_private.institution_mode_for_levels(text[]) from public,anon,authenticated;

-- Keep the public student-access guard and the delegated identity checks intact.
create or replace function aulanexo_private.request_institution_adults(p_request jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid; verified_email text; levels text[] := '{}'; begin
  select email into verified_email from auth.users where id=aulanexo_private.actor_uid() and email_confirmed_at is not null;
  if verified_email is null then raise exception 'Verifica tu correo antes de solicitar una institución.'; end if;
  if exists(select 1 from public.institution_requests where user_id=aulanexo_private.actor_uid() and status='pending') then raise exception 'Ya tienes una solicitud pendiente. Podrás consultar su estado aquí.'; end if;
  if p_request ? 'education_levels' then
    if jsonb_typeof(p_request->'education_levels') is distinct from 'array' then raise exception 'Selecciona al menos un nivel educativo válido.'; end if;
    if jsonb_array_length(p_request->'education_levels') not between 1 and 6
      or exists(select 1 from jsonb_array_elements(p_request->'education_levels') e where jsonb_typeof(e) is distinct from 'string') then raise exception 'Selecciona al menos un nivel educativo válido.'; end if;
    select array_agg(distinct value order by value) into levels from jsonb_array_elements_text(p_request->'education_levels');
    if not levels <@ array['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros']::text[] then raise exception 'Selecciona al menos un nivel educativo válido.'; end if;
  end if;
  insert into public.institution_requests(user_id,email,school_name,city,contact_name,phone,message,education_levels)
  values(aulanexo_private.actor_uid(),lower(verified_email),trim(p_request->>'school_name'),trim(p_request->>'city'),trim(p_request->>'contact_name'),trim(p_request->>'phone'),trim(coalesce(p_request->>'message','')),levels) returning id into request_id;
  return request_id;
end $$;
revoke all on function aulanexo_private.request_institution_adults(jsonb) from public,anon,authenticated;

create or replace function public.review_institution_request(p_id uuid,p_approve boolean,p_response text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.institution_requests; new_school_id uuid; new_slug text; begin
  if not public.is_platform_admin() then raise exception 'Solo la plataforma puede aprobar instituciones.'; end if;
  select * into r from public.institution_requests where id=p_id for update;
  if r.id is null then raise exception 'No se encontró la solicitud.'; end if;
  if r.status<>'pending' then return r.school_id; end if;
  if p_approve then
    new_school_id:=gen_random_uuid();
    new_slug:=trim(both '-' from regexp_replace(lower(r.school_name),'[^a-z0-9]+','-','g'));
    if length(new_slug)=0 then new_slug:='colegio'; end if;
    insert into public.schools(id,name,slug,city,director_name,brand_color,phone,status,education_levels,workspace_mode)
    values(new_school_id,r.school_name,new_slug||'-'||left(new_school_id::text,8),r.city,r.contact_name,'#3D6EF7',r.phone,'active',r.education_levels,aulanexo_private.institution_mode_for_levels(r.education_levels));
    insert into public.school_memberships(school_id,user_id,role) values(new_school_id,r.user_id,'director');
  end if;
  update public.institution_requests set status=case when p_approve then 'approved' else 'rejected' end,school_id=new_school_id,
    response=trim(coalesce(p_response,'')),reviewed_by=aulanexo_private.actor_uid(),reviewed_at=now() where id=r.id;
  return new_school_id;
end $$;
revoke all on function public.review_institution_request(uuid,boolean,text) from public,anon;
grant execute on function public.review_institution_request(uuid,boolean,text) to authenticated;
