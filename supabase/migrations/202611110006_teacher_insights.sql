create function public.teacher_academic_dashboard(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.has_school_role(p_school,array['teacher']) or not aulanexo_private.in_support_school(p_school) then raise exception 'No tienes acceso al tablero docente de esta institución.';end if;
 return jsonb_build_object('subjects',coalesce((select jsonb_agg(jsonb_build_object(
 'id',cs.id,'classroomId',r.id,'name',ss.name,'classroomName',r.name,'year',r.academic_year,
 'students',(select count(*) from public.students s where s.classroom_id=r.id and s.status='active'),
 'pendingSubmissions',(select count(*) from public.assignment_submissions sub join public.assignments a on a.id=sub.assignment_id where a.class_subject_id=cs.id and sub.status='submitted'),
 'results',coalesce((select jsonb_agg(jsonb_build_object('term',t.name,'average',totals.average,'missing',totals.missing,'belowMinimum',totals.below_minimum) order by t.starts_on desc)
 from public.academic_terms t join public.academic_years y on y.id=t.year_id
 cross join lateral (select round(avg(case when (mark->>'missing')::integer=0 and (mark->>'max_score')::numeric>0 then (mark->>'score')::numeric/(mark->>'max_score')::numeric*100 end),2) average,
 count(*) filter(where (mark->>'missing')::integer>0 or mark->>'score' is null) missing,
 count(*) filter(where (mark->>'missing')::integer=0 and (mark->>'max_score')::numeric>0 and (mark->>'score')::numeric/(mark->>'max_score')::numeric*100<coalesce((select pass_mark from public.institution_academic_settings where school_id=p_school),51)) below_minimum
 from public.students child cross join lateral (select aulanexo_private.grade_total(t.id,child.id,r.id,cs.id) mark) value
 where child.classroom_id=r.id and child.status='active') totals
 where y.school_id=p_school and y.year=r.academic_year),'[]')) order by r.name,ss.name)
 from public.class_subjects cs join public.school_subjects ss on ss.id=cs.subject_id join public.classrooms r on r.id=cs.classroom_id
 where cs.school_id=p_school and cs.active and r.active and public.learning_can_manage(r.id,cs.id)),'[]'),
 'tutorRooms',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'year',r.academic_year,'students',(select count(*) from public.students where classroom_id=r.id and status='active')) order by r.name)
 from public.classrooms r where r.school_id=p_school and r.active and public.is_classroom_tutor(r.id)),'[]'));
end $$;
revoke all on function public.teacher_academic_dashboard(uuid) from public,anon;
grant execute on function public.teacher_academic_dashboard(uuid) to authenticated;
