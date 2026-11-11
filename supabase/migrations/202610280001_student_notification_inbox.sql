-- The student portal and Android delivery already allow these academic sources.
-- Apply the same current child/source checks to SELECT on the in-app inbox.
create function aulanexo_private.student_notification_visible(p_id uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; child public.students; who uuid:=auth.uid();
begin
 if who is null or aulanexo_private.support_id() is not null then return false;end if;
 select * into n from public.notifications where id=p_id and user_id=who;
 if n.id is null or n.kind not in ('announcement','daily_task','calendar') then return false;end if;
 select * into child from public.students where id=aulanexo_private.student_id_for_user(who,n.school_id);
 if child.id is null or not aulanexo_private.student_learning_access(child.id)
  or n.school_id is distinct from child.school_id
  or (n.student_id is not null and n.student_id<>child.id)
  or (n.classroom_id is not null and n.classroom_id is distinct from child.classroom_id) then return false;end if;
 if n.kind='announcement' then
  return n.target='announcements' and aulanexo_private.announcement_recipient_visible(n.source_id,who);
 elsif n.kind='daily_task' then
  return n.target='daily' and exists(select 1 from public.daily_entries d where d.id=n.source_id and d.school_id=child.school_id and d.student_id=child.id and d.category='tarea');
 else
  return n.target='calendar' and exists(select 1 from public.calendar_events e where e.id=n.source_id and e.school_id=child.school_id and (e.classroom_id is null or e.classroom_id=child.classroom_id));
 end if;
end $$;
revoke all on function aulanexo_private.student_notification_visible(uuid) from public,anon,authenticated,service_role;
grant execute on function aulanexo_private.student_notification_visible(uuid) to authenticated;

create policy notifications_student_academic on public.notifications for select to authenticated
 using(user_id=auth.uid() and kind in ('announcement','daily_task','calendar') and aulanexo_private.student_notification_visible(id));

-- Restrictive policies also apply to the student's new permissive policy.
drop policy notifications_announcement_scope on public.notifications;
create policy notifications_announcement_scope on public.notifications as restrictive for select to authenticated
 using((kind<>'announcement' and kind not like 'announcement_reminder_%')
  or public.may_view_announcement(source_id)
  or (kind='announcement' and aulanexo_private.student_notification_visible(id)));
