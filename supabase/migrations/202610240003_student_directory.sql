-- Teachers retain operational care/contact fields, but private enrollment fields
-- are available only through an explicitly scoped directory RPC.
create function public.student_directory() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(case when public.may_manage_student(s.id) or public.is_verified_guardian(s.id)
 then to_jsonb(s) else to_jsonb(s)-array['rude','identity_number','primary_guardian_email','mother_email','father_email','insurance_number','admission_details'] end order by s.last_name,s.first_name,s.id),'[]'::jsonb)
 from public.students s where auth.uid() is not null and public.may_access_student(s.id)
 and aulanexo_private.in_support_school(s.school_id) and not public.is_platform_admin();
$$;
revoke all on function public.student_directory() from public,anon;
grant execute on function public.student_directory() to authenticated;
