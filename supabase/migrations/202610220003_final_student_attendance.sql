-- Confirmed attendance is final for every role. Drafts remain editable.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('public.save_student_attendance(uuid,date,jsonb,integer,boolean,text)'::regprocedure);
 needle:='if coalesce(session.revision,0)<>p_revision then';
 if position(needle in definition)=0 then raise exception 'No se encontró el control de la sesión de asistencia.';end if;
 definition:=replace(definition,needle,E'if session.status=''confirmed'' then raise exception ''La asistencia de este día está confirmada y no puede modificarse.'';end if;\n '||needle);
 execute definition;
end $$;
create function aulanexo_private.final_attendance_session() returns trigger language plpgsql set search_path='' as $$begin
 if old.status='confirmed' then raise exception 'La asistencia confirmada es definitiva y no puede modificarse ni eliminarse.';end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
create trigger final_attendance_session before update or delete on public.student_attendance_sessions for each row execute function aulanexo_private.final_attendance_session();
create function aulanexo_private.final_attendance_record() returns trigger language plpgsql security definer set search_path='' as $$
declare sid uuid;begin
 sid:=case when TG_OP='DELETE' then old.session_id else new.session_id end;
 if exists(select 1 from public.student_attendance_sessions where id=sid and status='confirmed') then
  -- Delivery bookkeeping is not a correction to attendance. No client has DML.
  if TG_OP='UPDATE' and (to_jsonb(new)-array['absent_notified_at','corrected_notified_at'])=(to_jsonb(old)-array['absent_notified_at','corrected_notified_at']) then return new;end if;
  raise exception 'Los registros de una lista confirmada no pueden modificarse ni eliminarse.';
 end if;
 if TG_OP='UPDATE' and old.session_id<>new.session_id and exists(select 1 from public.student_attendance_sessions where id=old.session_id and status='confirmed') then raise exception 'El registro pertenece a una lista confirmada.';end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
create trigger final_attendance_record before insert or update or delete on public.student_attendance_records for each row execute function aulanexo_private.final_attendance_record();
revoke all on function aulanexo_private.final_attendance_session(),aulanexo_private.final_attendance_record() from public,anon,authenticated,service_role;
