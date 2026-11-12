-- Daily attendance and attendance by lesson keep separate denominators.
do $$begin
 execute replace(pg_get_functiondef('public.institution_dashboard(date,date,text,uuid,uuid,text)'::regprocedure),
 'FUNCTION public.institution_dashboard(', 'FUNCTION aulanexo_private.dashboard_before_subject_attendance(');
end $$;
revoke all on function aulanexo_private.dashboard_before_subject_attendance(date,date,text,uuid,uuid,text) from public,anon,authenticated,service_role;
create or replace function public.institution_dashboard(p_from date,p_to date,p_group text default 'week',p_school_id uuid default null,p_classroom_id uuid default null,p_environment text default 'production')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;counts jsonb;
begin
 result:=aulanexo_private.dashboard_before_subject_attendance(p_from,p_to,p_group,p_school_id,p_classroom_id,p_environment);
 select jsonb_build_object('present',count(*) filter(where record->>'status'='present'),'late',count(*) filter(where record->>'status'='late'),
 'absent',count(*) filter(where record->>'status'='absent'),'excused',count(*) filter(where record->>'status'='excused')) into counts
 from aulanexo_private.subject_attendance session cross join lateral jsonb_array_elements(session.records) record
 where session.school_id=p_school_id and session.status='confirmed' and session.attendance_date between p_from and p_to
 and (p_classroom_id is null or session.classroom_id=p_classroom_id);
 return result||jsonb_build_object('subjectAttendance',counts);
end $$;
