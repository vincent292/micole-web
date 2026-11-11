-- Test sessions keep the real operator for traceability, and identify the
-- selected teacher/family in visible authorship and the audit context.
-- No accounts, memberships, grants or attendance timestamps are changed.
do $$
declare definition text;
begin
 definition:=pg_get_functiondef('public.stamp_author()'::regprocedure);
 if position('new.author_role:=' in definition)=0 then
  raise exception 'Missing message author seal; migration not applied.';
 end if;
 execute replace(definition,'new.author_role:=',
  'if (aulanexo_private.test_context()).id is not null then
    new.author_name:=coalesce(nullif(public.workspace_identity()->>''name'',''''),''Cuenta de pruebas'')||'' (pruebas MiCole)'';
   end if;
   new.author_role:=');

 definition:=pg_get_functiondef('aulanexo_private.capture_audit()'::regprocedure);
 if position('''supportRole'',context.role' in definition)=0 then
  raise exception 'Missing support audit context; migration not applied.';
 end if;
 execute replace(definition,'''supportRole'',context.role',
  '''supportRole'',context.role,''mode'',context.mode,''targetTeacherId'',context.teacher_id,''targetStudentId'',context.student_id,''targetRelationship'',context.relationship');
end $$;
