-- Academic content keeps the existing family-access rules. Immediate observations
-- retain their independently verified family visibility.
do $$declare signature text;definition text;begin
 foreach signature in array array[
 'public.subject_feed_workspace(uuid,uuid)',
 'public.save_subject_post(uuid,uuid,uuid,text,text,text,date)',
 'public.subject_attendance_workspace(uuid,date,text,uuid)'
 ] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  execute replace(definition,'public.is_verified_guardian(','public.family_access(');
 end loop;
 definition:=pg_get_functiondef('public.student_academic_summary(uuid)'::regprocedure);
 definition:=replace(definition,' if not staff then',E' if not staff and not public.family_access(child.id) then raise exception ''El acceso académico del alumno está pendiente de habilitación.'';end if;\n if not staff then');
 execute definition;
end $$;
