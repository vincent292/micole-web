-- Public institutional pages. Contact/location are separately opted into by Dirección.
alter table public.schools
  add column public_description text not null default '' check (length(public_description)<=2500),
  add column show_public_contact boolean not null default false;

-- Preserve existing identity, private-contact and authorization checks.
alter function public.save_school(jsonb) rename to save_school_before_public_profile;
alter function public.save_school_before_public_profile(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.save_school_before_public_profile(jsonb) from public,anon,authenticated;

create function public.save_school(p_school jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare sid uuid; levels text[];
begin
  perform aulanexo_private.save_school_before_public_profile(p_school);
  sid:=(p_school->>'id')::uuid;
  if p_school ? 'public_description' and (jsonb_typeof(p_school->'public_description') is distinct from 'string' or length(p_school->>'public_description')>2500) then
    raise exception 'La presentación admite hasta 2500 caracteres.';
  end if;
  if p_school ? 'show_public_contact' and jsonb_typeof(p_school->'show_public_contact') is distinct from 'boolean' then
    raise exception 'Elige si deseas publicar el contacto institucional.';
  end if;
  if p_school ? 'education_levels' then
    if jsonb_typeof(p_school->'education_levels') is distinct from 'array' then raise exception 'Selecciona los niveles educativos.'; end if;
    if exists(select 1 from jsonb_array_elements(p_school->'education_levels') e where jsonb_typeof(e) is distinct from 'string') then raise exception 'Selecciona los niveles educativos.'; end if;
    select coalesce(array_agg(distinct value),'{}'::text[]) into levels from jsonb_array_elements_text(p_school->'education_levels');
    if not (levels <@ array['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros']) then raise exception 'Selecciona niveles educativos válidos.'; end if;
  end if;
  update public.schools set
    public_description=case when p_school ? 'public_description' then btrim(p_school->>'public_description') else public_description end,
    show_public_contact=case when p_school ? 'show_public_contact' then (p_school->>'show_public_contact')::boolean else show_public_contact end,
    education_levels=coalesce(levels,education_levels)
  where id=sid;
end $$;
revoke all on function public.save_school(jsonb) from public,anon;
grant execute on function public.save_school(jsonb) to authenticated;

create function aulanexo_private.public_institution_card(s public.schools)
returns jsonb language sql stable set search_path='' as $$
  select jsonb_build_object('id',s.id,'slug',s.slug,'name',s.name,'city',s.city,
    'logoUrl',s.logo_url,'bannerUrl',s.banner_url,'website',s.website,'color',s.brand_color,
    'siteName',s.site_name,'educationLevels',s.education_levels);
$$;
revoke all on function aulanexo_private.public_institution_card(public.schools) from public,anon,authenticated;

create or replace function public.landing_institutions()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(aulanexo_private.public_institution_card(s) order by s.created_at desc,s.id),'[]'::jsonb)
  from public.schools s where s.status='active' and s.show_on_landing
    and not exists(select 1 from aulanexo_private.persisted_test_workspaces t where t.school_id=s.id)
    and not exists(select 1 from aulanexo_private.test_institutions t where t.school_id=s.id and t.enabled);
$$;
revoke all on function public.landing_institutions() from public;
grant execute on function public.landing_institutions() to anon,authenticated;

create function public.landing_institution(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select aulanexo_private.public_institution_card(s) || jsonb_build_object(
    'description',s.public_description,
    'address',case when s.show_public_contact then s.address else '' end,
    'phone',case when s.show_public_contact then s.phone else '' end,
    'mapsUrl',case when s.show_public_contact then s.maps_url else '' end)
  from public.schools s where (s.slug=p_slug or s.id::text=p_slug) and s.status='active' and s.show_on_landing
    and not exists(select 1 from aulanexo_private.persisted_test_workspaces t where t.school_id=s.id)
    and not exists(select 1 from aulanexo_private.test_institutions t where t.school_id=s.id and t.enabled)
  order by (s.slug=p_slug) desc limit 1;
$$;
revoke all on function public.landing_institution(text) from public;
grant execute on function public.landing_institution(text) to anon,authenticated;
