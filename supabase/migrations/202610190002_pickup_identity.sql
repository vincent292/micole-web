-- A pickup document is private evidence for a single authorization, never gallery media.
create table public.pickup_identity_files (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 file_name text not null check(length(file_name) between 1 and 180),mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),object_key text not null unique,staging_key text not null unique,
 uploaded_by uuid not null references auth.users(id),status text not null default 'pending' check(status in ('pending','ready')),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '30 minutes',confirmed_at timestamptz
);
alter table public.pickup_identity_files enable row level security;
revoke all on public.pickup_identity_files from public,anon,authenticated,service_role;
alter table public.family_requests add column pickup_file_id uuid references public.pickup_identity_files(id),add column pickup_verified_at timestamptz,add column pickup_verified_by uuid references auth.users(id),add column pickup_verification_note text not null default '';
create function public.may_read_pickup_identity(p_file_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare f public.pickup_identity_files;begin
 select * into f from public.pickup_identity_files where id=p_file_id;
 if f.id is null or f.status<>'ready' or not aulanexo_private.in_support_school(f.school_id) then return false;end if;
 if public.is_platform_admin() and aulanexo_private.support_id() is null then return false;end if;
 if public.is_verified_guardian(f.student_id) then return true;end if;
 return exists(select 1 from public.family_requests r where r.id=f.request_id and r.pickup_file_id=f.id and (public.may_manage_student(r.student_id) or public.may_teacher_write(r.student_id)));
end $$;
revoke all on function public.may_read_pickup_identity(uuid) from public,anon;
grant execute on function public.may_read_pickup_identity(uuid) to authenticated;
grant select on public.pickup_identity_files to authenticated;
create policy pickup_identity_read on public.pickup_identity_files for select to authenticated using(public.may_read_pickup_identity(id));
create function public.reserve_pickup_identity(p_request_id uuid,p_student_id uuid,p_file_name text,p_mime_type text,p_size integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.students;f public.pickup_identity_files;who uuid;ext text;begin
 select * into s from public.students where id=p_student_id;
 who:=(public.workspace_identity()->>'id')::uuid;
 if s.id is null or not public.is_verified_guardian(s.id) or not aulanexo_private.in_support_school(s.school_id) or not exists(select 1 from public.student_guardians where student_id=s.id and user_id=who and can_authorize_pickup) then raise exception 'Solo madre o padre autorizados pueden adjuntar este carnet.';end if;
 if p_request_id is null or exists(select 1 from public.family_requests where id=p_request_id) then raise exception 'Una solicitud enviada conserva el carnet adjunto.';end if;
 if length(trim(coalesce(p_file_name,''))) not between 1 and 180 or p_mime_type not in ('image/jpeg','image/png','image/webp') or p_size not between 1 and 5242880 then raise exception 'Adjunta una foto JPG, PNG o WebP de hasta 5 MB.';end if;
 perform pg_advisory_xact_lock(hashtext('pickup-'||p_request_id::text));
 select * into f from public.pickup_identity_files where request_id=p_request_id;
 if f.id is not null then
  if f.uploaded_by<>who or f.student_id<>p_student_id then raise exception 'Este adjunto pertenece a otra autorización.';end if;
  if f.status='ready' then raise exception 'El carnet ya fue confirmado. Abre una autorización nueva para reemplazarlo.';end if;
  if f.expires_at<=now() then raise exception 'La carga venció. Abre una autorización nueva.';end if;
  return jsonb_build_object('id',f.id,'objectKey',f.staging_key);
 end if;
 ext:=case p_mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
 f.id:=gen_random_uuid();
 insert into public.pickup_identity_files(id,request_id,student_id,school_id,file_name,mime_type,size_bytes,uploaded_by,object_key,staging_key)
 values(f.id,p_request_id,p_student_id,s.school_id,trim(p_file_name),p_mime_type,p_size,who,s.school_id::text||'/pickups/'||p_request_id::text||'/'||f.id::text||'.'||ext,s.school_id::text||'/pickup-staging/'||who::text||'/'||f.id::text||'.'||ext) returning * into f;
 return jsonb_build_object('id',f.id,'objectKey',f.staging_key);
end $$;
create function public.pickup_identity_for_upload(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.pickup_identity_files;who uuid;begin
 select * into f from public.pickup_identity_files where id=p_id;who:=(public.workspace_identity()->>'id')::uuid;
 if f.id is null or f.status<>'pending' or f.expires_at<=now() or f.uploaded_by<>who or not public.is_verified_guardian(f.student_id) or not aulanexo_private.in_support_school(f.school_id) then raise exception 'La carga del carnet no está autorizada o venció.';end if;
 return to_jsonb(f);
end $$;
create function public.finish_pickup_identity(p_id uuid,p_size integer,p_mime_type text,p_object_key text) returns boolean language plpgsql security definer set search_path='' as $$begin
 if current_user not in ('postgres','supabase_admin') then raise exception 'Operación privada.';end if;
 update public.pickup_identity_files set status='ready',confirmed_at=now(),object_key=p_object_key where id=p_id and status='pending' and expires_at>now() and size_bytes=p_size and mime_type=p_mime_type and p_object_key like school_id::text||'/pickups/'||request_id::text||'/'||id::text||'/%' and p_object_key !~ '[.][.]';
 return found;
end $$;
revoke all on function public.reserve_pickup_identity(uuid,uuid,text,text,integer),public.pickup_identity_for_upload(uuid),public.finish_pickup_identity(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.reserve_pickup_identity(uuid,uuid,text,text,integer),public.pickup_identity_for_upload(uuid) to authenticated;
grant execute on function public.finish_pickup_identity(uuid,integer,text,text) to service_role;
create function aulanexo_private.protect_pickup_evidence() returns trigger language plpgsql security definer set search_path='' as $$
declare f public.pickup_identity_files;begin
 if TG_OP='UPDATE' and old.pickup_verified_at is not null and new.status is distinct from old.status then raise exception 'La entrega del niño ya fue registrada.';end if;
 if TG_OP='UPDATE' and (new.pickup_file_id is distinct from old.pickup_file_id or new.pickup_verified_at is distinct from old.pickup_verified_at or new.pickup_verified_by is distinct from old.pickup_verified_by or new.pickup_verification_note is distinct from old.pickup_verification_note) then
  if new.pickup_file_id is distinct from old.pickup_file_id then raise exception 'El carnet de una autorización enviada no se puede reemplazar.';end if;
  if old.pickup_verified_at is not null then raise exception 'La entrega del niño ya fue registrada.';end if;
  if new.status<>'approved' or new.request_date<>(now() at time zone 'America/La_Paz')::date or not(public.may_manage_student(new.student_id) or public.may_teacher_write(new.student_id)) or length(trim(new.pickup_verification_note)) not between 5 and 1000 then raise exception 'Verifica la identidad presencialmente en la fecha de la recogida e indica una observación.';end if;
  new.pickup_verified_at:=now();new.pickup_verified_by:=auth.uid();
 end if;
 if new.type='pickup' and (TG_OP='INSERT' or new.status='approved') then
  select * into f from public.pickup_identity_files where id=new.pickup_file_id and status='ready' and student_id=new.student_id and request_id=new.id;
  if f.id is null then raise exception 'Adjunta y confirma la foto del carnet de quien recogerá al niño.';end if;
  if TG_OP='INSERT' and (f.uploaded_by<>(public.workspace_identity()->>'id')::uuid or new.pickup_verified_at is not null or new.pickup_verified_by is not null) then raise exception 'La evidencia de recogida no corresponde a tu autorización.';end if;
 elsif new.type<>'pickup' and (new.pickup_file_id is not null or new.pickup_verified_at is not null or new.pickup_verified_by is not null) then raise exception 'El carnet se adjunta únicamente a autorizaciones de recogida.';
 end if;
 return new;
end $$;
create trigger protect_pickup_evidence before insert or update on public.family_requests for each row execute function aulanexo_private.protect_pickup_evidence();
create function public.confirm_pickup_identity(p_request_id uuid,p_note text) returns void language plpgsql security definer set search_path='' as $$
declare r public.family_requests;begin
 select * into r from public.family_requests where id=p_request_id for update;
 if r.id is null or r.type<>'pickup' or r.status<>'approved' or r.pickup_verified_at is not null or not aulanexo_private.in_support_school(r.school_id) or not(public.may_manage_student(r.student_id) or public.may_teacher_write(r.student_id)) then raise exception 'Solo Dirección o la docente asignada pueden confirmar una recogida aprobada.';end if;
 update public.family_requests set pickup_verified_at=now(),pickup_verification_note=trim(coalesce(p_note,'')) where id=r.id;
end $$;
revoke all on function public.confirm_pickup_identity(uuid,text) from public,anon;
grant execute on function public.confirm_pickup_identity(uuid,text) to authenticated;
revoke all on function aulanexo_private.protect_pickup_evidence() from public,anon,authenticated,service_role;
