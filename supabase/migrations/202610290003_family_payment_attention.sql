-- Personal, explicit payment reminders. Reading never changes a financial record.
create table aulanexo_private.family_payment_alert_reads(
 notification_id uuid not null references public.notifications(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 read_at timestamptz not null default now(),
 primary key(notification_id,user_id)
);
revoke all on aulanexo_private.family_payment_alert_reads from public,anon,authenticated,service_role;

create function public.family_payment_alerts(p_school_id uuid,p_include_read boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();d date:=(now() at time zone 'America/La_Paz')::date;
 child record;ch record;items jsonb;content text;total numeric;signature text;notice_kind text;
 first_charge uuid;notice_id uuid;seen timestamptz;result jsonb:='[]';days_left integer;
begin
 if actor is null or aulanexo_private.support_id() is not null or not exists(
   select 1 from public.school_memberships m where m.school_id=p_school_id and m.user_id=actor and m.role='guardian' and m.active
 ) then return result;end if;
 for child in
   select s.id,s.school_id,s.first_name,s.last_name from public.students s
   join public.schools sch on sch.id=s.school_id and sch.status='active'
   where s.school_id=p_school_id and s.status='active'
   and exists(select 1 from public.student_guardians g join auth.users u on u.id=g.user_id and u.email_confirmed_at is not null
     where g.student_id=s.id and g.user_id=actor and g.can_view and g.verified_at is not null
     and ((g.relationship='mother' and lower(u.email)=s.mother_email) or (g.relationship='father' and lower(u.email)=s.father_email)))
   and exists(select 1 from public.school_charges c where c.student_id=s.id and c.school_id=p_school_id and c.status not in ('paid','cancelled') and c.amount>c.paid_amount and c.due_date<=d+5)
   order by s.first_name,s.last_name,s.id
 loop
   items:='[]';total:=0;first_charge:=null;
   content:=trim(child.first_name||' '||child.last_name)||E'\n';
   for ch in select c.id,c.concept,c.due_date,round(c.amount-c.paid_amount,2) as remaining
     from public.school_charges c where c.school_id=p_school_id and c.student_id=child.id
     and c.status not in ('paid','cancelled') and c.amount>c.paid_amount and c.due_date<=d+5 order by c.due_date,c.id
   loop
     if first_charge is null then first_charge:=ch.id;end if;
     days_left:=ch.due_date-d;total:=total+ch.remaining;
     items:=items||jsonb_build_array(jsonb_build_object('id',ch.id,'concept',ch.concept,'dueDate',ch.due_date,'remaining',ch.remaining,'daysLeft',days_left));
     content:=content||E'\n'||ch.concept||' - Bs '||to_char(ch.remaining,'FM999999999990.00')||' pendientes. '||
       case when days_left<0 then 'Vencida hace '||(-days_left)||case when days_left=-1 then ' día.' else ' días.' end
       when days_left=0 then 'Vence hoy.' when days_left=1 then 'Vence mañana.' else 'Vence en '||days_left||' días.' end||
       ' Fecha: '||to_char(ch.due_date,'DD/MM/YYYY')||'.';
   end loop;
   signature:=md5(jsonb_build_object('student',child.id,'day',d,'charges',items)::text);
   notice_kind:='payment_due_attention_'||d::text||'_'||signature;
   insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target)
     values(actor,p_school_id,child.id,notice_kind,first_charge,'Pagos de tu familia','Revisa las cuotas próximas a vencer o pendientes.','payments')
     on conflict(user_id,kind,source_id) do nothing;
   select n.id into notice_id from public.notifications n where n.user_id=actor and n.kind=notice_kind and n.source_id=first_charge;
   select r.read_at into seen from aulanexo_private.family_payment_alert_reads r where r.user_id=actor and r.notification_id=notice_id;
   if coalesce(p_include_read,false) or seen is null then
     result:=result||jsonb_build_array(jsonb_build_object(
       'id','payment:'||notice_id::text,'schoolId',p_school_id,'title','Pagos de '||trim(child.first_name||' '||child.last_name),
       'content',content||E'\n\nTotal pendiente de estas cuotas: Bs '||to_char(total,'FM999999999990.00')||'.',
       'category','general','audience','families','requiresAcknowledgment',false,'urgent',false,
       'canManage',false,'canAcknowledge',true,'readAt',seen,
       'payment',jsonb_build_object('studentId',child.id,'studentName',trim(child.first_name||' '||child.last_name),'amount',total,'charges',items,'day',d)));
   end if;
 end loop;
 return result;
end $$;

create function public.read_family_payment_alert(p_school_id uuid,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item jsonb;seen timestamptz;begin
 select value into item from jsonb_array_elements(public.family_payment_alerts(p_school_id,true))
   where value->>'id'='payment:'||p_id::text;
 if item is null and aulanexo_private.support_id() is null and exists(
   select 1 from public.notifications n where n.id=p_id and n.user_id=auth.uid() and n.school_id=p_school_id
   and n.kind like 'payment_due_attention_%' and public.is_verified_guardian(n.student_id)
   and exists(select 1 from public.school_memberships m where m.school_id=p_school_id and m.user_id=auth.uid() and m.active and m.role='guardian')
 ) then return jsonb_build_object('resolved',true);end if;
 if item is null then raise exception 'Este aviso de pago cambió o no pertenece a tu familia. Actualiza los pagos.';end if;
 insert into aulanexo_private.family_payment_alert_reads(notification_id,user_id) values(p_id,auth.uid()) on conflict do nothing;
 select read_at into seen from aulanexo_private.family_payment_alert_reads where notification_id=p_id and user_id=auth.uid();
 update public.notifications set read_at=coalesce(read_at,seen) where id=p_id and user_id=auth.uid();
 return jsonb_set(item,'{readAt}',to_jsonb(seen));
end $$;
revoke all on function public.family_payment_alerts(uuid,boolean),public.read_family_payment_alert(uuid,uuid) from public,anon;
grant execute on function public.family_payment_alerts(uuid,boolean),public.read_family_payment_alert(uuid,uuid) to authenticated;

-- Keep the existing worker, with an additional reminder five days before the due date.
create or replace function aulanexo_private.send_payment_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare c public.school_charges;added integer:=0;d date:=(now() at time zone 'America/La_Paz')::date;begin
 for c in select ch.* from public.school_charges ch join public.students s on s.id=ch.student_id join public.schools sch on sch.id=ch.school_id
   where s.status='active' and sch.status='active' and ch.status not in ('paid','cancelled') and ch.paid_amount<ch.amount and ch.due_date in (d+5,d+3,d,d-1)
 loop
   perform aulanexo_private.notify_student(c.school_id,c.student_id,'payment_due_'||c.due_date::text||'_'||(c.due_date-d)::text,c.id,
     'Recordatorio de pago','Tienes una cuota próxima a vencer o pendiente.','payments',null,false,true);
   added:=added+1;
 end loop;return added;
end $$;
revoke all on function aulanexo_private.send_payment_reminders() from public,anon,authenticated;
