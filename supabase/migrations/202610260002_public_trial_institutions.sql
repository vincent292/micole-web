-- Trial mode is also used by real institutions. Respect their publication choice.
-- Dedicated synthetic workspaces remain excluded regardless of their visibility flag.
create or replace function public.landing_institutions()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(aulanexo_private.public_institution_card(s) order by s.created_at desc,s.id),'[]'::jsonb)
  from public.schools s where s.status='active' and s.show_on_landing
    and not exists(select 1 from aulanexo_private.persisted_test_workspaces t where t.school_id=s.id);
$$;
revoke all on function public.landing_institutions() from public;
grant execute on function public.landing_institutions() to anon,authenticated;

create or replace function public.landing_institution(p_slug text)
returns jsonb language sql stable security definer set search_path='' as $$
  select aulanexo_private.public_institution_card(s) || jsonb_build_object(
    'description',s.public_description,
    'address',case when s.show_public_contact then s.address else '' end,
    'phone',case when s.show_public_contact then s.phone else '' end,
    'mapsUrl',case when s.show_public_contact then s.maps_url else '' end)
  from public.schools s where (s.slug=p_slug or s.id::text=p_slug) and s.status='active' and s.show_on_landing
    and not exists(select 1 from aulanexo_private.persisted_test_workspaces t where t.school_id=s.id)
  order by (s.slug=p_slug) desc limit 1;
$$;
revoke all on function public.landing_institution(text) from public;
grant execute on function public.landing_institution(text) to anon,authenticated;
