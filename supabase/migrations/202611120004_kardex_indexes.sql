-- Look up only this pupil's records when building a history page.
create index kardex_subject_attendance_student on aulanexo_private.subject_attendance using gin(records jsonb_path_ops);
create index kardex_submissions_student on public.assignment_submissions(student_id,updated_at desc);
create index kardex_grade_changes_score on public.assessment_score_changes(score_id,created_at desc);
create index kardex_requests_student on public.family_requests(student_id,created_at desc);
create index kardex_daily_student on public.daily_entries(student_id,created_at desc);
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.student_kardex(uuid,date,date,text,jsonb,integer)'::regprocedure);
 if position('s.status=''confirmed'' and r->>''studentId''=child.id::text' in definition)=0 then raise exception 'No se encontró la consulta de asistencia del kárdex.';end if;
 execute replace(definition,'s.status=''confirmed'' and r->>''studentId''=child.id::text','s.status=''confirmed'' and s.records @> jsonb_build_array(jsonb_build_object(''studentId'',child.id::text)) and r->>''studentId''=child.id::text');
end $$;
