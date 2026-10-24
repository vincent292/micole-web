-- Reading a notice is not consent. Reuse the existing activity participation
-- record; legacy/automatic rows intentionally have no authorization response.
alter table public.activity_participations
 add column authorization_response boolean,
 add column authorization_by uuid references auth.users(id),
 add column authorization_at timestamptz,
 add column authorization_reason text not null default '',
 add constraint activity_authorization_complete check (
   (authorization_response is null and authorization_by is null and authorization_at is null)
   or (authorization_response is not null and authorization_by is not null and authorization_at is not null)
 );

create table public.activity_authorization_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.academic_requests(id),
 student_id uuid not null references public.students(id),school_id uuid not null references public.schools(id),
 response boolean not null,reason text not null default '',actor_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.activity_authorization_events enable row level security;
revoke all on public.activity_authorization_events from public,anon,authenticated;
grant select on public.activity_authorization_events to authenticated;
create policy authorization_events_read on public.activity_authorization_events for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and (public.may_manage_student(student_id) or public.may_teacher_write(student_id) or public.is_verified_guardian(student_id)));

-- Four-argument callers remain compatible through the optional fifth argument.
drop function public.set_activity_participation(uuid,uuid,boolean,text);
create function public.set_activity_participation(
 p_request_id uuid,p_student_id uuid,p_participating boolean,
 p_reason text default '',p_authorization boolean default false
) returns void language plpgsql security definer set search_path='' as $$
declare request public.academic_requests; child public.students; who uuid:=aulanexo_private.actor_uid(); begin
 select * into request from public.academic_requests where id=p_request_id for update;
 select * into child from public.students where id=p_student_id;
 if request.id is null or child.id is null or child.school_id<>request.school_id or child.classroom_id<>request.classroom_id or request.status<>'approved' or (request.amount<=0 and request.kind<>'activity') then
  raise exception 'No hay una actividad aprobada para este estudiante.';
 end if;
 if not(public.may_manage_student(child.id) or public.may_teacher_write(child.id) or public.is_verified_guardian(child.id)) then
  raise exception 'No tienes acceso a esta participación.';
 end if;
 if coalesce(p_authorization,false) and (request.kind<>'activity' or not public.is_verified_guardian(child.id) or aulanexo_private.support_id() is not null or public.is_platform_admin()) then
  raise exception 'La autorización debe registrarla la familia verificada desde su cuenta.';
 end if;
 if p_participating is null or (not p_participating and coalesce(length(trim(p_reason)),0)<5) then
  raise exception 'Escribe el motivo de no participación.';
 end if;
 -- Consent is independent of payment and administrative participation. Even a
 -- family that already paid must be able to state its decision.
 if p_authorization then
  if exists(select 1 from public.activity_participations where request_id=request.id and student_id=child.id and authorization_response=p_participating and authorization_by=who and authorization_reason=left(trim(coalesce(p_reason,'')),500)) then return;end if;
  insert into public.activity_participations(request_id,student_id,school_id,participating,reason,updated_by,authorization_response,authorization_by,authorization_at)
  values(request.id,child.id,child.school_id,true,left(trim(coalesce(p_reason,'')),500),who,p_participating,who,now())
  on conflict(request_id,student_id) do update set authorization_response=excluded.authorization_response,authorization_by=excluded.authorization_by,authorization_at=excluded.authorization_at,authorization_reason=left(trim(coalesce(p_reason,'')),500);
  update public.activity_participations set authorization_reason=left(trim(coalesce(p_reason,'')),500) where request_id=request.id and student_id=child.id;
  insert into public.activity_authorization_events(request_id,student_id,school_id,response,reason,actor_id)
  values(request.id,child.id,child.school_id,p_participating,left(trim(coalesce(p_reason,'')),500),who);
  return;
 end if;
 perform 1 from public.school_charges where academic_request_id=request.id and student_id=child.id for update;
 if exists(select 1 from public.school_payments p join public.school_charges c on c.id=p.charge_id where c.academic_request_id=request.id and c.student_id=child.id and p.verification_state='verified') then
  raise exception 'Ya hay un pago registrado. Dirección debe revisar el cobro antes de cambiar la participación.';
 end if;
 insert into public.activity_participations(request_id,student_id,school_id,participating,reason,updated_by,authorization_response,authorization_by,authorization_at)
 values(request.id,child.id,child.school_id,p_participating,left(trim(coalesce(p_reason,'')),500),who,
  case when p_authorization then p_participating end,case when p_authorization then who end,case when p_authorization then now() end)
 on conflict(request_id,student_id) do update set participating=excluded.participating,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now(),
  authorization_response=case when p_authorization then excluded.authorization_response else public.activity_participations.authorization_response end,
  authorization_by=case when p_authorization then excluded.authorization_by else public.activity_participations.authorization_by end,
  authorization_at=case when p_authorization then excluded.authorization_at else public.activity_participations.authorization_at end;
 -- Preserve the existing relationship between participation and charges.
 update public.school_charges set status=case when p_participating then 'pending' else 'cancelled' end where academic_request_id=request.id and student_id=child.id;
 if p_participating and request.amount>0 and not exists(select 1 from public.school_charges where academic_request_id=request.id and student_id=child.id) then
  insert into public.school_charges(school_id,student_id,concept,due_date,amount,academic_request_id) values(child.school_id,child.id,request.title,request.due_date,request.amount,request.id);
 end if;
end $$;
revoke all on function public.set_activity_participation(uuid,uuid,boolean,text,boolean) from public,anon;
grant execute on function public.set_activity_participation(uuid,uuid,boolean,text,boolean) to authenticated;

-- Align the owner's synthetic notification lab wording with real read confirmation.
do $$begin
 execute replace(pg_get_functiondef('aulanexo_private.notification_test_catalog()'::regprocedure),'Estoy de acuerdo','He leído');
end $$;
