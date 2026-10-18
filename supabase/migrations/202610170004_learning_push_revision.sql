-- Do not deliver obsolete submission/review versions after a quiet-hours delay.
create or replace function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;sub public.assignment_submissions;a public.assignments;child uuid;allowed boolean:=false;previous_uid text:=current_setting('request.jwt.claim.sub',true);previous_headers text:=current_setting('request.headers',true);begin
 select * into n from public.notifications where id=p_id;
 if n.kind not like 'assignment_%' then return aulanexo_private.push_notice_visible_v1(p_id);end if;
 if n.read_at is not null or n.created_at<now()-interval '48 hours' or not exists(select 1 from auth.users where id=n.user_id and email_confirmed_at is not null) then return false;end if;
 perform set_config('request.jwt.claim.sub',n.user_id::text,true),set_config('request.headers','{}',true);
 if n.kind='assignment_published' then select * into a from public.assignments where id=n.source_id;allowed:=a.id is not null and a.status='published' and public.learning_room_visible(a.school_id,a.classroom_id);
 else select * into sub from public.assignment_submissions where id=n.source_id;allowed:=sub.id is not null and public.learning_submission_visible(sub.id);
  if n.kind like 'assignment_submitted_%' then allowed:=allowed and sub.status='submitted' and n.kind='assignment_submitted_'||sub.revision::text;
  elsif n.kind like 'assignment_reviewed_%' then allowed:=allowed and sub.status in ('reviewed','returned') and n.kind='assignment_reviewed_'||sub.revision::text||'_'||sub.status;
  else allowed:=false;end if;end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return allowed;
exception when others then perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return false;
end $$;

-- The course year is academic metadata; keep all financial and care fields excluded.
create or replace function public.student_portal() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;rooms jsonb;begin
 result:=aulanexo_private.student_portal_before_subjects();
 select coalesce(jsonb_agg(item||jsonb_build_object('subjectsEnabled',r.subjects_enabled,'academicYear',r.academic_year)),'[]'::jsonb) into rooms
 from jsonb_array_elements(result->'classrooms')item join public.classrooms r on r.id=(item->>'id')::uuid;
 return jsonb_set(result,'{classrooms}',rooms);
end $$;
