-- Preserve the existing teacher/email and verified-parent checks throughout the invitation chain.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.create_invitation_base(jsonb)'::regprocedure);
 definition:=regexp_replace(definition,'public.has_school_role\(([^,()]+),\s*[Aa][Rr][Rr][Aa][Yy]\[''director''(?:::text)?\]\)', 'public.academic_manager(\1)','g');
 execute definition;
end $$;
create or replace function public.create_invitation(p_invite jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare child public.students;sid uuid:=(p_invite->>'school_id')::uuid;
 relation text:=p_invite->>'relationship';email_value text:=lower(trim(p_invite->>'email'));
begin
 if public.school_secretary(sid) and coalesce(p_invite->>'role','') not in ('teacher','guardian') then
  raise exception 'Secretaría no tiene permiso para invitar a este rol.';
 end if;
 if p_invite->>'role'='guardian' then
  select * into child from public.students where id=(p_invite->>'student_id')::uuid and school_id=sid;
  if child.id is null then raise exception 'Selecciona un alumno de esta institución.';end if;
  if relation is null or relation not in ('mother','father') then raise exception 'El acceso familiar está reservado a madre y padre.';end if;
  if not(public.may_manage_student(child.id) or public.school_secretary(child.school_id)) then raise exception 'No tienes permiso para invitar a esta familia.';end if;
  if not((relation='mother' and email_value=child.mother_email) or (relation='father' and email_value=child.father_email)) then
   raise exception 'Primero registra ese correo en la ficha de madre o padre.';
  end if;
 end if;
 return aulanexo_private.create_invitation_base(p_invite);
end $$;
