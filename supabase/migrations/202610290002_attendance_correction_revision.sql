-- A stale correction form cannot replace a newer justification from another tab/teacher.
alter function public.request_attendance_correction(uuid,uuid,text,text,text) rename to attendance_correct_with_justification;
alter function public.attendance_correct_with_justification(uuid,uuid,text,text,text) set schema aulanexo_private;
revoke all on function aulanexo_private.attendance_correct_with_justification(uuid,uuid,text,text,text) from public,anon,authenticated;
create function public.request_attendance_correction(p_id uuid,p_record_id uuid,p_status text,p_note text,p_reason text,p_base_correction_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.student_attendance_records;s public.student_attendance_sessions;effective jsonb;begin
 select * into r from public.student_attendance_records where id=p_record_id for update;
 select * into s from public.student_attendance_sessions where id=r.session_id;
 if r.id is null or not public.may_mark_student_attendance(s.school_id,s.classroom_id) then raise exception 'Solo el docente asignado puede corregir con justificativo. Dirección tiene acceso de consulta.';end if;
 -- The original helper verifies actor and exact payload before returning an already saved request.
 if exists(select 1 from public.student_attendance_corrections where id=p_id) then
  return aulanexo_private.attendance_correct_with_justification(p_id,p_record_id,p_status,p_note,p_reason);
 end if;
 effective:=aulanexo_private.attendance_effective(r.id);
 if (effective->>'correctionId')::uuid is distinct from p_base_correction_id then
  raise exception 'La asistencia cambió. Actualiza antes de corregir y compara el historial.';
 end if;
 return aulanexo_private.attendance_correct_with_justification(p_id,p_record_id,p_status,p_note,p_reason);
end $$;
-- Legacy clients imply the uncorrected original; they can never replace a newer correction.
create function public.request_attendance_correction(p_id uuid,p_record_id uuid,p_status text,p_note text,p_reason text) returns uuid
language sql security definer set search_path='' as $$select public.request_attendance_correction(p_id,p_record_id,p_status,p_note,p_reason,null)$$;
revoke all on function public.request_attendance_correction(uuid,uuid,text,text,text),public.request_attendance_correction(uuid,uuid,text,text,text,uuid) from public,anon;
grant execute on function public.request_attendance_correction(uuid,uuid,text,text,text),public.request_attendance_correction(uuid,uuid,text,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
