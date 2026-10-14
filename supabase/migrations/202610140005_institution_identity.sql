-- MiCole: identidad institucional y directorio público mínimo para la landing.
alter table public.schools
  add column nit text not null default '',
  add column address text not null default '',
  add column website text not null default '',
  add column show_on_landing boolean not null default true;

create or replace function public.save_school(p_school jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare
  sid uuid;
  platform boolean := public.is_platform_admin();
  current_school public.schools;
  institution_name text;
  institution_slug text;
  institution_city text;
  institution_director text;
  institution_color text;
  institution_status text;
  institution_logo text;
  institution_phone text;
  institution_nit text;
  institution_address text;
  institution_website text;
  institution_visible boolean;
  image_bytes bytea;
  image_type text;
  https_pattern constant text := '^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]]*)?$';
begin
  -- Comprobar el rol antes de consultar datos o validar campos privados.
  if not platform then
    if jsonb_typeof(p_school) is distinct from 'object'
      or coalesce(p_school->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'No puedes modificar esta institución.';
    end if;
    sid := (p_school->>'id')::uuid;
    if not public.has_school_role(sid,array['director']) then
      raise exception 'No puedes modificar esta institución.';
    end if;
  else
    if jsonb_typeof(p_school) is distinct from 'object'
      or coalesce(p_school->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Identificador de institución inválido.';
    end if;
    sid := (p_school->>'id')::uuid;
  end if;
  select * into current_school from public.schools where id=sid for update;
  if not platform and current_school.id is null then
    raise exception 'No puedes modificar esta institución.';
  end if;

  institution_name := case when p_school ? 'name' then btrim(coalesce(p_school->>'name','')) else coalesce(current_school.name,'') end;
  -- El slug se mantiene estable al editar, como en save_school original.
  institution_slug := coalesce(current_school.slug,btrim(coalesce(p_school->>'slug','')));
  institution_city := case when p_school ? 'city' then btrim(coalesce(p_school->>'city','')) else coalesce(current_school.city,'') end;
  institution_director := case when platform and p_school ? 'director_name' then btrim(coalesce(p_school->>'director_name','')) else coalesce(current_school.director_name,'') end;
  institution_color := case when p_school ? 'brand_color' then coalesce(p_school->>'brand_color','') else coalesce(current_school.brand_color,'#3D6EF7') end;
  institution_status := case when platform and p_school ? 'status' then coalesce(p_school->>'status','') else coalesce(current_school.status,'pending') end;
  institution_logo := case when p_school ? 'logo_url' then btrim(coalesce(p_school->>'logo_url','')) else coalesce(current_school.logo_url,'') end;
  institution_phone := case when p_school ? 'phone' then btrim(coalesce(p_school->>'phone','')) else coalesce(current_school.phone,'') end;
  institution_nit := case when p_school ? 'nit' then btrim(coalesce(p_school->>'nit','')) else coalesce(current_school.nit,'') end;
  institution_address := case when p_school ? 'address' then btrim(coalesce(p_school->>'address','')) else coalesce(current_school.address,'') end;
  institution_website := case when p_school ? 'website' then btrim(coalesce(p_school->>'website','')) else coalesce(current_school.website,'') end;
  if p_school ? 'show_on_landing' then
    if jsonb_typeof(p_school->'show_on_landing') is distinct from 'boolean' then
      raise exception 'La visibilidad pública debe ser verdadera o falsa.';
    end if;
    institution_visible := (p_school->>'show_on_landing')::boolean;
  else
    institution_visible := coalesce(current_school.show_on_landing,true);
  end if;

  if length(institution_name) not between 3 and 150 then raise exception 'El nombre debe tener entre 3 y 150 caracteres.'; end if;
  if length(institution_slug)>100 or institution_slug !~ '^[a-z0-9][a-z0-9-]*$' then raise exception 'El identificador de la institución no es válido.'; end if;
  if length(institution_city)>100 then raise exception 'La ciudad admite hasta 100 caracteres.'; end if;
  if length(institution_director)>150 then raise exception 'El nombre de dirección admite hasta 150 caracteres.'; end if;
  if length(institution_phone)>40 then raise exception 'El teléfono admite hasta 40 caracteres.'; end if;
  if length(institution_address)>500 then raise exception 'La dirección admite hasta 500 caracteres.'; end if;
  if institution_nit<>'' and institution_nit !~ '^[0-9]{1,20}$' then raise exception 'El NIT debe contener solo dígitos y hasta 20 caracteres.'; end if;
  if institution_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'El color institucional debe ser hexadecimal.'; end if;
  if institution_status not in ('pending','active','inactive') then raise exception 'Estado institucional inválido.'; end if;
  if institution_website<>'' and (length(institution_website)>2048 or institution_website !~* https_pattern) then
    raise exception 'El sitio web debe ser una URL HTTPS sin credenciales.';
  end if;
  if institution_logo<>'' then
    if length(institution_logo)>350000 then raise exception 'El logo supera el tamaño permitido.'; end if;
    if institution_logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then
      image_type := split_part(split_part(institution_logo,';',1),'/',2);
      begin
        image_bytes := decode(split_part(institution_logo,',',2),'base64');
      exception when others then
        raise exception 'El logo debe ser una imagen PNG, JPEG o WebP válida.';
      end;
      if (image_type='png' and substring(image_bytes from 1 for 8)<>decode('89504e470d0a1a0a','hex'))
        or (image_type='jpeg' and substring(image_bytes from 1 for 3)<>decode('ffd8ff','hex'))
        or (image_type='webp' and (substring(image_bytes from 1 for 4)<>decode('52494646','hex') or substring(image_bytes from 9 for 4)<>decode('57454250','hex'))) then
        raise exception 'El logo debe ser una imagen PNG, JPEG o WebP válida.';
      end if;
    elsif length(institution_logo)>2048 or institution_logo !~* https_pattern
      or institution_logo ~* '\.svg([?#]|$)' then
      raise exception 'El logo debe usar HTTPS o ser una imagen PNG, JPEG o WebP.';
    end if;
  end if;

  insert into public.schools(id,name,slug,city,director_name,brand_color,status,logo_url,phone,nit,address,website,show_on_landing)
  values(sid,institution_name,institution_slug,institution_city,institution_director,institution_color,institution_status,institution_logo,institution_phone,institution_nit,institution_address,institution_website,institution_visible)
  on conflict(id) do update set
    name=excluded.name,city=excluded.city,director_name=excluded.director_name,
    brand_color=excluded.brand_color,status=excluded.status,logo_url=excluded.logo_url,
    phone=excluded.phone,nit=excluded.nit,address=excluded.address,
    website=excluded.website,show_on_landing=excluded.show_on_landing;
end $$;
revoke all on function public.save_school(jsonb) from public,anon;
grant execute on function public.save_school(jsonb) to authenticated;

-- La landing nunca consulta schools directamente ni publica datos de familias.
create function public.landing_institutions()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'name',name,'city',city,'logoUrl',logo_url,'website',website
  ) order by created_at desc,id),'[]'::jsonb)
  from public.schools where status='active' and show_on_landing;
$$;
revoke all on function public.landing_institutions() from public;
grant execute on function public.landing_institutions() to anon,authenticated;
