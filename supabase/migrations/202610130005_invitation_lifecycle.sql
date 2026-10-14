-- Identidad docente: cambios de correo y bajas invalidan invitaciones anteriores.
create unique index teachers_one_user_per_school on public.teachers(school_id,user_id) where user_id is not null;
create or replace function public.save_teacher(p_teacher jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_teacher->>'school_id')::uuid; tid uuid:=(p_teacher->>'id')::uuid; previous public.teachers;
 email_value text:=lower(trim(p_teacher->>'email')); status_value text:=coalesce(p_teacher->>'status','pending'); changed_email boolean:=false;
begin
 if not (public.is_platform_admin() or public.has_school_role(sid,array['director'])) then raise exception 'No tienes permiso para gestionar docentes.'; end if;
 select * into previous from public.teachers where id=tid for update;
 if previous.id is not null and previous.school_id<>sid then raise exception 'La docente pertenece a otra institución.'; end if;
 changed_email:=previous.id is not null and lower(previous.email) is distinct from email_value;
 if changed_email and previous.user_id is not null and status_value<>'inactive' then status_value:='pending'; end if;
 insert into public.teachers(id,school_id,name,email,specialty,status) values(tid,sid,trim(p_teacher->>'name'),email_value,coalesce(p_teacher->>'specialty',''),status_value)
 on conflict(id) do update set name=excluded.name,email=excluded.email,specialty=excluded.specialty,status=excluded.status,
 user_id=case when changed_email then null else public.teachers.user_id end;
 if changed_email or status_value='inactive' then
  update public.invitations set status='revoked' where teacher_id=tid and status='pending';
 end if;
 if previous.user_id is not null then
  update public.school_memberships set active=exists(select 1 from public.teachers t where t.user_id=previous.user_id and t.school_id=sid and t.status='active') where school_id=sid and user_id=previous.user_id and role='teacher';
 end if;
end $$;
-- Las implementaciones originales quedan privadas; no se puede omitir la validación nueva.
alter function public.create_invitation(jsonb) set schema aulanexo_private;
revoke all on function aulanexo_private.create_invitation(jsonb) from public,anon,authenticated;
create function public.create_invitation(p_invite jsonb) returns text language plpgsql security definer set search_path='' as $$
declare sid uuid:=(p_invite->>'school_id')::uuid; begin
 if not(public.is_platform_admin() or ((p_invite->>'role')<>'director' and public.has_school_role(sid,array['director']))) then raise exception 'No tienes permiso para invitar a este rol.'; end if;
 if p_invite->>'role'='teacher' and not exists(select 1 from public.teachers where id=(p_invite->>'teacher_id')::uuid and school_id=sid and lower(email)=lower(trim(p_invite->>'email')) and status<>'inactive') then raise exception 'Activa la docente y utiliza el correo registrado para crear su invitación.'; end if;
 return aulanexo_private.create_invitation(p_invite);
end $$;
alter function public.claim_invitation(text) set schema aulanexo_private;
revoke all on function aulanexo_private.claim_invitation(text) from public,anon,authenticated;
create function public.claim_invitation(p_token text) returns void language plpgsql security definer set search_path='' as $$
declare i public.invitations; verified_email text; begin
 if auth.uid() is null then raise exception 'Ingresa para aceptar la invitación.'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if i.id is null or verified_email is distinct from i.email then raise exception 'La invitación no corresponde a tu correo verificado.'; end if;
 if i.role='teacher' and not exists(select 1 from public.teachers where id=i.teacher_id and school_id=i.school_id and lower(email)=i.email and status<>'inactive') then raise exception 'Esta invitación ya no está vigente. Solicita un nuevo enlace a dirección.'; end if;
 perform aulanexo_private.claim_invitation(p_token);
end $$;
revoke all on function public.create_invitation(jsonb),public.claim_invitation(text) from public,anon;
grant execute on function public.create_invitation(jsonb),public.claim_invitation(text) to authenticated;
