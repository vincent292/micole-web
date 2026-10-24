-- Column-level grants preserve RLS predicates that read id/classroom_id and other
-- existing operational fields. Revoking a table grant alone would not override column grants.
revoke select on public.students from authenticated,anon;
do $$declare c record;begin
 for c in select column_name from information_schema.columns where table_schema='public' and table_name='students' loop
  execute format('revoke select (%I) on public.students from authenticated,anon',c.column_name);
  if c.column_name<>all(array['rude','identity_number','primary_guardian_email','mother_email','father_email','insurance_number','admission_details']) then
   execute format('grant select (%I) on public.students to authenticated',c.column_name);
  end if;
 end loop;
end $$;
