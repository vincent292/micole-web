-- Append-only approved corrections; original confirmed roll calls remain immutable.
create table public.student_attendance_corrections (
 id uuid primary key, school_id uuid not null references public.schools(id),
 record_id uuid not null references public.student_attendance_records(id),
 base_correction_id uuid references public.student_attendance_corrections(id),
 previous_status text not null, previous_note text not null,
 proposed_status text not null check(proposed_status in ('present','absent','late','excused')),
 proposed_note text not null default '' check(length(proposed_note)<=1000),
 reason text not null check(length(trim(reason)) between 5 and 1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 requested_by uuid not null references auth.users(id),requested_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_note text not null default ''
);
create unique index attendance_one_pending_correction on public.student_attendance_corrections(record_id) where status='pending';
create index attendance_correction_history on public.student_attendance_corrections(record_id,reviewed_at desc);
alter table public.student_attendance_corrections enable row level security;
revoke all on public.student_attendance_corrections from public,anon,authenticated;
grant select on public.student_attendance_corrections to authenticated;
create policy attendance_corrections_read on public.student_attendance_corrections for select to authenticated using(exists(
 select 1 from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id
 where r.id=record_id and public.may_manage_student_attendance(s.school_id,s.classroom_id)));
create function aulanexo_private.attendance_effective(p_record uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',coalesce(c.proposed_status,r.status),'note',coalesce(c.proposed_note,r.note),'correctionId',c.id)
 from public.student_attendance_records r left join lateral (
 select * from public.student_attendance_corrections where record_id=r.id and status='approved' order by reviewed_at desc,requested_at desc,id desc limit 1
 ) c on true where r.id=p_record;
$$;
revoke all on function aulanexo_private.attendance_effective(uuid) from public,anon,authenticated;

create function public.request_attendance_correction(p_id uuid,p_record_id uuid,p_status text,p_note text,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.student_attendance_records;s public.student_attendance_sessions;effective jsonb;old public.student_attendance_corrections;begin
 select * into r from public.student_attendance_records where id=p_record_id for update;
 select * into s from public.student_attendance_sessions where id=r.session_id;
 if r.id is null or not public.may_manage_student_attendance(s.school_id,s.classroom_id) then raise exception 'No tienes acceso a esta asistencia.';end if;
 select * into old from public.student_attendance_corrections where id=p_id;
 if old.id is not null then
  if old.requested_by=auth.uid() and old.record_id=p_record_id and old.proposed_status=p_status and old.proposed_note=trim(coalesce(p_note,'')) and old.reason=trim(p_reason) then return old.id;end if;
  raise exception 'La solicitud ya existe con otros datos.';
 end if;
 if s.status<>'confirmed' then raise exception 'Solo puedes solicitar corrección de una lista confirmada.';end if;
 if not exists(select 1 from public.classrooms c join public.academic_years y on y.school_id=c.school_id and y.year=c.academic_year where c.id=s.classroom_id and y.status='open') then raise exception 'La gestión está cerrada.';end if;
 if p_id is null or p_status is null or p_status not in ('present','absent','late','excused') or length(trim(coalesce(p_reason,''))) not between 5 and 1000 or length(coalesce(p_note,''))>1000 then raise exception 'Indica estado y motivo de la corrección.';end if;
 effective:=aulanexo_private.attendance_effective(r.id);
 if effective->>'status'=p_status and effective->>'note'=trim(coalesce(p_note,'')) then raise exception 'La solicitud no cambia el registro.';end if;
 if exists(select 1 from public.student_attendance_corrections where record_id=r.id and status='pending') then raise exception 'Ya hay una corrección pendiente para este estudiante y día.';end if;
 insert into public.student_attendance_corrections(id,school_id,record_id,base_correction_id,previous_status,previous_note,proposed_status,proposed_note,reason,requested_by)
 values(p_id,s.school_id,r.id,(effective->>'correctionId')::uuid,effective->>'status',effective->>'note',p_status,trim(coalesce(p_note,'')),trim(p_reason),auth.uid());
 insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
 select m.user_id,s.school_id,r.student_id,s.classroom_id,'attendance_correction_request',p_id,'Corrección por revisar','Hay una solicitud de corrección de asistencia pendiente en tu sede.','studentAttendance'
 from public.school_memberships m join auth.users u on u.id=m.user_id where m.school_id=s.school_id and m.role='director' and m.active and u.email_confirmed_at is not null
 on conflict(user_id,kind,source_id) do nothing;
 return p_id;
end $$;
create function public.review_attendance_correction(p_id uuid,p_approve boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare c public.student_attendance_corrections;r public.student_attendance_records;s public.student_attendance_sessions;effective jsonb;recipient uuid;begin
 select * into c from public.student_attendance_corrections where id=p_id;
 select * into r from public.student_attendance_records where id=c.record_id for update;
 select * into s from public.student_attendance_sessions where id=r.session_id;
 select * into c from public.student_attendance_corrections where id=p_id for update;
 if c.id is null or not public.may_manage_student_attendance(s.school_id,s.classroom_id) or not public.has_school_role(s.school_id,array['director']) then raise exception 'Solo Dirección de esta sede puede revisar la corrección.';end if;
 if p_approve is null or length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Indica el motivo de la decisión.';end if;
 if c.status<>'pending' then
  if c.status=(case when p_approve then 'approved' else 'rejected' end) and c.reviewed_by=auth.uid() and c.review_note=trim(p_note) then return;end if;
  raise exception 'La solicitud ya fue revisada.';
 end if;
 if not exists(select 1 from public.classrooms room join public.academic_years y on y.school_id=room.school_id and y.year=room.academic_year where room.id=s.classroom_id and y.status='open') then raise exception 'La gestión está cerrada.';end if;
 effective:=aulanexo_private.attendance_effective(r.id);
 if p_approve and (effective->>'correctionId')::uuid is distinct from c.base_correction_id then raise exception 'La asistencia cambió. Rechaza esta solicitud y solicita otra actualizada.';end if;
 update public.student_attendance_corrections set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=auth.uid(),reviewed_at=clock_timestamp(),review_note=trim(p_note) where id=c.id;
 insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
 values(c.requested_by,s.school_id,r.student_id,s.classroom_id,'attendance_correction_reviewed',c.id,'Solicitud de corrección revisada','Dirección revisó tu solicitud. Consulta la decisión en asistencia.','studentAttendance') on conflict(user_id,kind,source_id) do nothing;
 if p_approve then
  for recipient in select distinct g.user_id from public.student_guardians g join auth.users u on u.id=g.user_id
   where g.student_id=r.student_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null loop
   insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
   values(recipient,s.school_id,r.student_id,s.classroom_id,'attendance_corrected',c.id,'Asistencia corregida','Dirección aprobó una corrección de asistencia del '||to_char(s.attendance_date,'DD/MM/YYYY')||'. Consulta el historial.','studentAttendance') on conflict(user_id,kind,source_id) do nothing;
  end loop;
 end if;
end $$;
revoke all on function public.request_attendance_correction(uuid,uuid,text,text,text),public.review_attendance_correction(uuid,boolean,text) from public,anon;
grant execute on function public.request_attendance_correction(uuid,uuid,text,text,text),public.review_attendance_correction(uuid,boolean,text) to authenticated;

alter function public.student_attendance_workspace(uuid,date,date,uuid) rename to student_attendance_workspace_before_corrections;
alter function public.student_attendance_workspace_before_corrections(uuid,date,date,uuid) set schema aulanexo_private;
revoke all on function aulanexo_private.student_attendance_workspace_before_corrections(uuid,date,date,uuid) from public,anon,authenticated;
create function public.student_attendance_workspace(p_classroom_id uuid,p_day date,p_month date,p_student_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;records jsonb;manager boolean;begin
 result:=aulanexo_private.student_attendance_workspace_before_corrections(p_classroom_id,p_day,p_month,p_student_id);
 manager:=(result->>'canManage')::boolean;
 select coalesce(jsonb_agg(item || aulanexo_private.attendance_effective((item->>'id')::uuid)),'[]') into records from jsonb_array_elements(result->'records') item;
 return result||jsonb_build_object('records',records,'canReview',manager and exists(select 1 from public.classrooms where id=p_classroom_id and public.has_school_role(school_id,array['director'])),
 'corrections',case when manager then coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('studentName',r.student_name,'date',s.attendance_date) order by c.requested_at desc)
 from public.student_attendance_corrections c join public.student_attendance_records r on r.id=c.record_id join public.student_attendance_sessions s on s.id=r.session_id
 where s.classroom_id=p_classroom_id and s.attendance_date>=p_month and s.attendance_date<(p_month+interval '1 month')::date),'[]') else '[]'::jsonb end);
end $$;
revoke all on function public.student_attendance_workspace(uuid,date,date,uuid) from public,anon;
grant execute on function public.student_attendance_workspace(uuid,date,date,uuid) to authenticated;
create trigger workspace_changed after insert or update on public.student_attendance_corrections for each row execute function aulanexo_private.touch_workspace();
create trigger audit_attendance_corrections after insert or update on public.student_attendance_corrections for each row execute function aulanexo_private.capture_audit();

alter function aulanexo_private.push_notice_visible(uuid) rename to push_notice_visible_before_corrections;
create function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;c public.student_attendance_corrections;r public.student_attendance_records;begin
 select * into n from public.notifications where id=p_id;
 if n.kind in ('attendance_correction_request','attendance_correction_reviewed') then
  select * into c from public.student_attendance_corrections where id=n.source_id;
  select * into r from public.student_attendance_records where id=c.record_id;
  return c.id is not null and n.school_id=c.school_id and n.student_id=r.student_id and n.read_at is null and n.created_at>now()-interval '48 hours'
  and exists(select 1 from public.student_attendance_sessions s join auth.users u on u.id=n.user_id where s.id=r.session_id and u.email_confirmed_at is not null and exists(select 1 from public.school_memberships m where m.school_id=c.school_id and m.user_id=n.user_id and m.active and (m.role='director' or m.role='teacher' and exists(select 1 from public.teachers t join public.teacher_classrooms tc on tc.teacher_id=t.id where t.user_id=n.user_id and t.school_id=c.school_id and tc.classroom_id=s.classroom_id))))
  and (n.kind='attendance_correction_request' and c.status='pending' and exists(select 1 from public.school_memberships m where m.school_id=c.school_id and m.user_id=n.user_id and m.active and m.role='director') or n.kind='attendance_correction_reviewed' and c.status<>'pending' and c.requested_by=n.user_id);
 elsif n.kind='attendance_corrected' then
  select * into c from public.student_attendance_corrections where id=n.source_id and status='approved';
  if c.id is not null then
   select * into r from public.student_attendance_records where id=c.record_id;
   return n.read_at is null and n.created_at>now()-interval '48 hours' and n.school_id=c.school_id and n.student_id=r.student_id
    and (aulanexo_private.attendance_effective(r.id)->>'correctionId')::uuid=c.id
    and exists(select 1 from public.student_guardians g join auth.users u on u.id=g.user_id join public.school_memberships m on m.user_id=g.user_id and m.school_id=c.school_id and m.role='guardian' and m.active
      join public.schools school on school.id=c.school_id and school.status='active'
      where g.student_id=r.student_id and g.user_id=n.user_id and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null);
  end if;
 elsif n.kind='attendance_absent' and aulanexo_private.attendance_effective(n.source_id)->>'status' is distinct from 'absent' then return false;
 end if;
 return aulanexo_private.push_notice_visible_before_corrections(p_id);
end $$;
revoke all on function aulanexo_private.push_notice_visible(uuid),aulanexo_private.push_notice_visible_before_corrections(uuid) from public,anon,authenticated;

-- Idempotent submission wrapper: a lost response can be retried without another confirmation or notification.
create table aulanexo_private.attendance_submissions (
 id uuid primary key, actor_id uuid not null references auth.users(id), payload_hash text not null,
 result jsonb not null,created_at timestamptz not null default now()
);
revoke all on aulanexo_private.attendance_submissions from public,anon,authenticated;
create function public.save_student_attendance(p_classroom_id uuid,p_day date,p_records jsonb,p_revision integer,p_confirm boolean,p_reason text,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare school uuid;fingerprint text;old aulanexo_private.attendance_submissions;result jsonb;begin
 select school_id into school from public.classrooms where id=p_classroom_id;
 if p_request_id is null or not public.may_manage_student_attendance(school,p_classroom_id) then raise exception 'No tienes acceso a esta asistencia.';end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_classroom_id,p_day,p_records,p_revision,p_confirm,p_reason)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtext('attendance-submit-'||p_request_id::text));
 select * into old from aulanexo_private.attendance_submissions where id=p_request_id;
 if old.id is not null then
  if old.actor_id<>auth.uid() or old.payload_hash<>fingerprint then raise exception 'La solicitud ya existe con otros datos.';end if;
  return old.result;
 end if;
 result:=public.save_student_attendance(p_classroom_id,p_day,p_records,p_revision,p_confirm,p_reason);
 insert into aulanexo_private.attendance_submissions(id,actor_id,payload_hash,result) values(p_request_id,auth.uid(),fingerprint,result);
 return result;
end $$;
revoke all on function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid) from public,anon;
grant execute on function public.save_student_attendance(uuid,date,jsonb,integer,boolean,text,uuid) to authenticated;

create policy attendance_review_notifications on public.notifications for select to authenticated using(
 user_id=aulanexo_private.actor_uid() and kind in ('attendance_correction_request','attendance_correction_reviewed')
 and public.may_manage_student_attendance(school_id,classroom_id)
 and (kind='attendance_correction_reviewed' or public.has_school_role(school_id,array['director'])));
create or replace function aulanexo_private.classify_attendance_notification() returns trigger language plpgsql set search_path='' as $$begin
 if new.kind in ('attendance_absent','attendance_corrected','attendance_correction_request','attendance_correction_reviewed') then new.alert_type:='attendance';end if;return new;end $$;
