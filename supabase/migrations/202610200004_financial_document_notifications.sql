-- Financial notices bypass the academic payment gate while retaining current recipient checks.
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.push_notice_visible(uuid)'::regprocedure);
 definition:=replace(definition,'FUNCTION aulanexo_private.push_notice_visible(','FUNCTION aulanexo_private.push_notice_visible_before_financial_documents(');execute definition;
 definition:=pg_get_functiondef('aulanexo_private.push_category(text)'::regprocedure);
 definition:=replace(definition,'FUNCTION aulanexo_private.push_category(','FUNCTION aulanexo_private.push_category_before_financial_documents(');execute definition;
end $$;
revoke all on function aulanexo_private.push_notice_visible_before_financial_documents(uuid),aulanexo_private.push_category_before_financial_documents(text) from public,anon,authenticated,service_role;
create or replace function aulanexo_private.push_category(p_kind text) returns text language sql immutable set search_path='' as $$
 select case when p_kind in ('payment_evidence','payment_evidence_reviewed','payment_invoice_ready') then 'payments' else aulanexo_private.push_category_before_financial_documents(p_kind) end;
$$;
create or replace function aulanexo_private.push_notice_visible(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n public.notifications;allowed boolean:=false;previous_uid text:=current_setting('request.jwt.claim.sub',true);previous_headers text:=current_setting('request.headers',true);begin
 select * into n from public.notifications where id=p_id;
 if n.kind not in ('payment_evidence','payment_evidence_reviewed','payment_invoice_ready') or n.id is null then return aulanexo_private.push_notice_visible_before_financial_documents(p_id);end if;
 if n.read_at is not null or n.created_at<now()-interval '48 hours' or not exists(select 1 from auth.users where id=n.user_id and email_confirmed_at is not null) then return false;end if;
 perform set_config('request.jwt.claim.sub',n.user_id::text,true),set_config('request.headers','{}',true);
 if n.kind='payment_evidence' then
  allowed:=public.may_manage_student(n.student_id) and exists(select 1 from public.payment_submissions s where s.id=n.source_id and s.student_id=n.student_id and s.school_id=n.school_id and s.status='pending');
 elsif n.kind='payment_evidence_reviewed' then
  allowed:=public.is_verified_guardian(n.student_id) and exists(select 1 from public.payment_submissions s where s.id=n.source_id and s.student_id=n.student_id and s.school_id=n.school_id and s.status in ('approved','rejected'));
 else
  allowed:=public.is_verified_guardian(n.student_id) and exists(select 1 from public.invoice_requests i where i.id=n.source_id and i.student_id=n.student_id and i.school_id=n.school_id and i.status='issued' and exists(select 1 from public.financial_files f where f.invoice_id=i.id and f.status='ready'));
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return coalesce(allowed,false);
exception when others then
 perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true),set_config('request.headers',coalesce(previous_headers,'{}'),true);return false;
end $$;
revoke all on function aulanexo_private.push_notice_visible(uuid),aulanexo_private.push_category(text) from public,anon,authenticated;
