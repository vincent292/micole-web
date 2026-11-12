-- The shared realtime stream carries only school/table invalidations, never pupil content.
create trigger academic_changed after insert or update or delete on public.school_grades
 for each row execute function aulanexo_private.touch_workspace();
create trigger academic_changed after insert or update or delete on public.institution_academic_settings
 for each row execute function aulanexo_private.touch_workspace();
create trigger academic_changed after insert or update or delete on public.student_observations
 for each row execute function aulanexo_private.touch_workspace();
create trigger academic_changed after insert or update or delete on aulanexo_private.subject_posts
 for each row execute function aulanexo_private.touch_workspace();
create trigger academic_changed after insert or update or delete on aulanexo_private.subject_attendance
 for each row execute function aulanexo_private.touch_workspace();

-- Secretary receives the same content-free invalidations as the institution's members.
do $$begin
 execute replace(pg_get_functiondef('public.may_receive_workspace_signal(uuid)'::regprocedure),
 'FUNCTION public.may_receive_workspace_signal(', 'FUNCTION aulanexo_private.signal_access_before_secretary(');
end $$;
revoke all on function aulanexo_private.signal_access_before_secretary(uuid) from public,anon,authenticated,service_role;
create or replace function public.may_receive_workspace_signal(p_school_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select aulanexo_private.signal_access_before_secretary(p_school_id) or public.school_secretary(p_school_id);
$$;
