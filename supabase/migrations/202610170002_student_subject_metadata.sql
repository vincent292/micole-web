-- Add only the new classroom organization flag to the existing curated student portal.
alter function public.student_portal() rename to student_portal_before_subjects;
alter function public.student_portal_before_subjects() set schema aulanexo_private;
revoke all on function aulanexo_private.student_portal_before_subjects() from public,anon,authenticated;
create function public.student_portal() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;rooms jsonb;begin
 result:=aulanexo_private.student_portal_before_subjects();
 select coalesce(jsonb_agg(item||jsonb_build_object('subjectsEnabled',r.subjects_enabled)),'[]'::jsonb) into rooms
 from jsonb_array_elements(result->'classrooms')item join public.classrooms r on r.id=(item->>'id')::uuid;
 return jsonb_set(result,'{classrooms}',rooms);
end $$;
revoke all on function public.student_portal() from public,anon;
grant execute on function public.student_portal() to authenticated;
