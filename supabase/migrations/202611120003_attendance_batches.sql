-- Keep checked/idempotent public wrappers; replace per-pupil writes in their private core.
do $$declare definition text;old_block text;new_block text;begin
 definition:=pg_get_functiondef('aulanexo_private.attendance_save_original(uuid,date,jsonb,integer,boolean,text)'::regprocedure);
 old_block:=substring(definition from ' for item in select value from jsonb_array_elements\(p_records\) loop[\s\S]*? end loop;');
 if old_block is null then raise exception 'No se encontró el guardado por alumno de asistencia.';end if;
 new_block:=$block$
 with roster as materialized (select * from aulanexo_private.attendance_roster(room.id,p_day))
 insert into public.student_attendance_records as r(school_id,session_id,student_id,student_name,status,note)
 select room.school_id,session.id,roster.student_id,roster.student_name,nullif(incoming.value->>'status',''),trim(coalesce(incoming.value->>'note',''))
 from jsonb_array_elements(p_records) incoming(value) join roster on roster.student_id=(incoming.value->>'studentId')::uuid
 on conflict(session_id,student_id) do update set status=excluded.status,note=excluded.note,updated_at=now()
 where (r.status,r.note) is distinct from (excluded.status,excluded.note);
$block$;
 definition:=replace(definition,old_block,new_block);
 old_block:=substring(definition from '  for entry in select \* from public.student_attendance_records where session_id=session.id loop[\s\S]*?\n  end loop;');
 if old_block is null then raise exception 'No se encontró la preparación de avisos de asistencia.';end if;
 new_block:=$block$
  insert into public.notifications(user_id,school_id,student_id,classroom_id,kind,source_id,title,body,target)
  select distinct g.user_id,room.school_id,saved.student_id,room.id,
   case when saved.status='absent' then 'attendance_absent' else 'attendance_corrected' end,saved.id,
   case when saved.status='absent' then 'Falta registrada' else 'Asistencia corregida' end,
   saved.student_name||case when saved.status='absent' then ' tiene una falta registrada el ' else ' tiene una corrección de asistencia del ' end||to_char(p_day,'DD/MM/YYYY')||'. Revisa el detalle o comunícate con su docente.','studentAttendance'
  from public.student_attendance_records saved join public.student_guardians g on g.student_id=saved.student_id join auth.users u on u.id=g.user_id
  where saved.session_id=session.id and (saved.status='absent' or saved.status<>'absent' and saved.absent_notified_at is not null and saved.corrected_notified_at is null)
   and g.can_view and g.verified_at is not null and g.relationship in ('mother','father') and u.email_confirmed_at is not null
  on conflict(user_id,kind,source_id) do nothing;
  get diagnostics sent=row_count;
  update public.student_attendance_records saved
  set absent_notified_at=case when saved.status='absent' then coalesce(saved.absent_notified_at,now()) else saved.absent_notified_at end,
      corrected_notified_at=case when saved.status<>'absent' then coalesce(saved.corrected_notified_at,now()) else saved.corrected_notified_at end
  where saved.session_id=session.id and ((saved.status='absent' and saved.absent_notified_at is null) or (saved.status<>'absent' and saved.absent_notified_at is not null and saved.corrected_notified_at is null))
   and exists(select 1 from public.notifications n where n.source_id=saved.id and n.kind=case when saved.status='absent' then 'attendance_absent' else 'attendance_corrected' end);
$block$;
 execute replace(definition,old_block,new_block);
end $$;

-- One content-free workspace invalidation per affected school, per INSERT statement.
-- Recipient-specific notifications and push delivery retain their existing row-level checks.
drop trigger workspace_changed on public.notifications;
create function aulanexo_private.notification_batch_signal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.workspace_signals(school_id,changed_table)
 select distinct coalesce(n.school_id,s.school_id),'notifications' from new_notices n left join public.students s on s.id=n.student_id
 where coalesce(n.school_id,s.school_id) is not null
 on conflict(school_id) do update set revision=public.workspace_signals.revision+1,changed_table='notifications',changed_at=now();
 return null;
end $$;
revoke all on function aulanexo_private.notification_batch_signal() from public,anon,authenticated,service_role;
create trigger notifications_insert_signal after insert on public.notifications referencing new table as new_notices for each statement execute function aulanexo_private.notification_batch_signal();
create trigger notifications_other_signal after update or delete on public.notifications for each row execute function aulanexo_private.touch_workspace();
