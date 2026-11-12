-- Secretary can invite academic staff and families, without granting management roles.
do $$declare signature text;definition text;begin
 foreach signature in array array['public.create_invitation(jsonb)','aulanexo_private.create_invitation(jsonb)','public.revoke_invitation(uuid)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  definition:=regexp_replace(definition,'public.has_school_role\(([^,()]+),\s*[Aa][Rr][Rr][Aa][Yy]\[''director''(?:::text)?\]\)', 'public.academic_manager(\1)','g');
  if signature='public.create_invitation(jsonb)' then
   definition:=replace(definition,' return aulanexo_private.create_invitation(p_invite);',
    E' if public.school_secretary(sid) and coalesce(p_invite->>''role'','''') not in (''teacher'',''guardian'') then raise exception ''Secretaría solo invita docentes y familias.'';end if;\n if p_invite->>''role''=''guardian'' and not exists(select 1 from public.students where id=(p_invite->>''student_id'')::uuid and school_id=sid) then raise exception ''Selecciona un alumno de esta institución.'';end if;\n return aulanexo_private.create_invitation(p_invite);');
  end if;
  execute definition;
 end loop;
end $$;
create policy secretary_invitation_read on public.invitations for select to authenticated
 using(public.school_secretary(school_id) and role in ('teacher','guardian'));
