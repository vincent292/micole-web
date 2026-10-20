-- Append-only consultation history and private financial supporting documents.
create table public.content_view_events(
 id uuid primary key,school_id uuid not null references public.schools(id),student_id uuid not null,
 viewer_id uuid not null references auth.users(id),viewer_role text not null,
 content_kind text not null,content_id uuid not null,content_title text not null,content_hash text not null,
 action text not null check(action in ('open','download')),client text not null check(client in ('web','android')),
 viewed_at timestamptz not null default now(),foreign key(student_id,school_id) references public.students(id,school_id)
);
create index content_views_school_date on public.content_view_events(school_id,viewed_at desc,id);
create index content_views_student on public.content_view_events(student_id,content_kind,content_id,viewed_at desc);
alter table public.content_view_events enable row level security;
revoke all on public.content_view_events from public,anon,authenticated;
grant select on public.content_view_events to authenticated;
create policy content_views_staff on public.content_view_events for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and (public.may_manage_student(student_id) or public.may_teacher_write(student_id)));

-- Deposits are recorded separately from transfers while preserving the existing checkout protections.
do $$declare item record;definition text;begin
 for item in select conrelid::regclass as tab,conname from pg_constraint where conrelid in ('public.school_receipts'::regclass,'public.school_payments'::regclass) and contype='c' and pg_get_constraintdef(oid) like '%payment_method%' loop execute format('alter table %s drop constraint %I',item.tab,item.conname);end loop;
 alter table public.school_receipts add constraint receipts_payment_methods check(payment_method in ('cash','qr','transfer','deposit'));
 alter table public.school_payments add constraint payments_payment_methods check(payment_method in ('cash','qr','transfer','deposit'));
 definition:=pg_get_functiondef('aulanexo_private.checkout_before_bank(uuid,uuid,jsonb,text,text,jsonb,boolean)'::regprocedure);
 definition:=replace(definition,'''cash'',''transfer'',''qr''','''cash'',''transfer'',''qr'',''deposit''');
 definition:=replace(definition,'p_method=''qr'' and p_qr_reviewed','p_method in (''qr'',''deposit'') and p_qr_reviewed');
 definition:=replace(definition,'p_method in (''qr'',''transfer'')','p_method in (''qr'',''transfer'',''deposit'')');
 definition:=replace(definition,'payment_method=p_method and lower(trim(reference))','(payment_method=p_method or (payment_method in (''transfer'',''deposit'') and p_method in (''transfer'',''deposit''))) and lower(trim(reference))');
 execute definition;
end $$;
drop index public.new_bank_receipt_reference;
create unique index new_bank_receipt_reference on public.school_receipts(school_id,(case when payment_method='deposit' then 'transfer' else payment_method end),lower(trim(reference))) where payment_method in ('qr','transfer','deposit') and request_hash not like 'legacy-%';

create table public.payment_submissions(
 id uuid primary key,school_id uuid not null references public.schools(id),student_id uuid not null,
 submitted_by uuid not null references auth.users(id),items jsonb not null,payment_method text not null check(payment_method in ('transfer','deposit')),
 reference text not null,paid_on date not null,invoice_details jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','pending','approved','rejected')),
 receipt_id uuid unique references public.school_receipts(id),reviewed_by uuid references auth.users(id),reviewed_at timestamptz,review_note text not null default '',
 created_at timestamptz not null default now(),foreign key(student_id,school_id) references public.students(id,school_id)
);
create index payment_submissions_school on public.payment_submissions(school_id,status,created_at desc);
alter table public.payment_submissions enable row level security;
revoke all on public.payment_submissions from public,anon,authenticated;
grant select on public.payment_submissions to authenticated;
create policy payment_submissions_read on public.payment_submissions for select to authenticated using(aulanexo_private.in_support_school(school_id) and not public.is_platform_admin() and (public.may_manage_student(student_id) or (public.is_verified_guardian(student_id) and (status<>'draft' or submitted_by=auth.uid()))));

create table public.financial_files(
 id uuid primary key default gen_random_uuid(),school_id uuid not null references public.schools(id),student_id uuid not null,
 kind text not null check(kind in ('invoice','payment_evidence')),invoice_id uuid references public.invoice_requests(id),submission_id uuid references public.payment_submissions(id),
 uploaded_by uuid not null references auth.users(id),file_name text not null,mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),staging_key text not null unique,object_key text unique,
 status text not null default 'uploading' check(status in ('uploading','ready')),created_at timestamptz not null default now(),
 check((kind='invoice' and invoice_id is not null and submission_id is null) or (kind='payment_evidence' and submission_id is not null and invoice_id is null)),
 foreign key(student_id,school_id) references public.students(id,school_id)
);
create index financial_files_invoice on public.financial_files(invoice_id) where status='ready';
create index financial_files_submission on public.financial_files(submission_id) where status='ready';
alter table public.financial_files enable row level security;
revoke all on public.financial_files from public,anon,authenticated;
grant select on public.financial_files to authenticated;
create function public.may_read_financial_file(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.financial_files f where f.id=p_id and f.status='ready' and aulanexo_private.in_support_school(f.school_id) and not public.is_platform_admin() and (
 public.may_manage_student(f.student_id) or (public.is_verified_guardian(f.student_id) and (
 (f.kind='invoice' and exists(select 1 from public.invoice_requests i where i.id=f.invoice_id and i.student_id=f.student_id and i.status='issued')) or
 (f.kind='payment_evidence' and exists(select 1 from public.payment_submissions s where s.id=f.submission_id and (s.status<>'draft' or s.submitted_by=auth.uid())))
 ))));
$$;
create policy financial_files_read on public.financial_files for select to authenticated using(public.may_read_financial_file(id));

create function public.create_payment_submission(p_id uuid,p_student_id uuid,p_items jsonb,p_method text,p_reference text,p_paid_on date,p_invoice jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare child public.students;item jsonb;c public.school_charges;old public.payment_submissions;begin
 select * into child from public.students where id=p_student_id;
 if child.id is null or not(public.is_verified_guardian(child.id) or public.may_manage_student(child.id)) then raise exception 'Solo la familia vinculada o Dirección puede presentar este comprobante.';end if;
 if p_id is null or coalesce(jsonb_typeof(p_items),'null')<>'array' or jsonb_array_length(p_items) not between 1 and 60 or p_method not in ('transfer','deposit') or p_method is null or length(trim(coalesce(p_reference,''))) not between 3 and 160 or p_paid_on is null or p_paid_on>(now() at time zone 'America/La_Paz')::date or p_paid_on<(now() at time zone 'America/La_Paz')::date-366 then raise exception 'Revisa las cuotas, el método, la referencia y la fecha del comprobante.';end if;
 if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'chargeId') from jsonb_array_elements(p_items)) then raise exception 'No repitas una cuota.';end if;
 if p_invoice is null or jsonb_typeof(p_invoice)<>'object' or octet_length(p_invoice::text)>1000 then raise exception 'Revisa los datos para factura.';end if;
 if p_invoice<>'{}' and (coalesce(length(trim(p_invoice->>'invoiceName')),0) not between 2 and 160 or coalesce(length(trim(p_invoice->>'invoiceNit')),0) not between 3 and 30 or upper(p_invoice->>'invoiceNit') !~ '^[A-Z0-9 .-]+$' or coalesce(length(trim(p_invoice->>'invoicePhone')),0) not between 6 and 25 or p_invoice->>'invoicePhone' !~ '^\+?[0-9 ()-]+$') then raise exception 'Completa nombre, NIT/CI y celular para factura.';end if;
 for item in select value from jsonb_array_elements(p_items) loop
  select * into c from public.school_charges where id=(item->>'chargeId')::uuid;
  if c.id is null or c.student_id<>child.id or c.status in ('paid','cancelled') or (item->>'amount')::numeric is null or (item->>'amount')::numeric<=0 or (item->>'amount')::numeric<>round((item->>'amount')::numeric,2) or (item->>'amount')::numeric>c.amount-c.paid_amount then raise exception 'Un abono no corresponde a una cuota pendiente o supera su saldo.';end if;
 end loop;
 perform pg_advisory_xact_lock(hashtext('evidence-'||p_id::text));
 select * into old from public.payment_submissions where id=p_id;
 if old.id is not null then
  if old.submitted_by=auth.uid() and old.student_id=p_student_id and old.items=p_items and old.payment_method=p_method and old.reference=trim(p_reference) and old.paid_on=p_paid_on and old.invoice_details=p_invoice then return old.id;end if;
  raise exception 'Esta solicitud ya se utilizó para otro comprobante.';
 end if;
 if (select count(*) from public.payment_submissions where submitted_by=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Hay demasiadas cargas recientes. Revisa las solicitudes existentes.';end if;
 insert into public.payment_submissions(id,school_id,student_id,submitted_by,items,payment_method,reference,paid_on,invoice_details) values(p_id,child.school_id,child.id,auth.uid(),p_items,p_method,trim(p_reference),p_paid_on,p_invoice);
 return p_id;
end $$;

create function public.reserve_financial_file(p_kind text,p_parent_id uuid,p_file_name text,p_mime_type text,p_size integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare sid uuid;school uuid;aid uuid:=gen_random_uuid();staging text;submission public.payment_submissions;begin
 if p_kind='invoice' then select i.student_id,i.school_id into sid,school from public.invoice_requests i where i.id=p_parent_id;if sid is null or not public.may_manage_student(sid) then raise exception 'Solo Dirección puede adjuntar la factura del cobro.';end if;
 elsif p_kind='payment_evidence' then select * into submission from public.payment_submissions where id=p_parent_id;sid:=submission.student_id;school:=submission.school_id;
  if sid is null or submission.status<>'draft' or not((submission.submitted_by=auth.uid() and public.is_verified_guardian(sid)) or public.may_manage_student(sid)) then raise exception 'No puedes adjuntar archivos a esta solicitud.';end if;
 else raise exception 'Tipo de documento inválido.';end if;
 if p_mime_type not in ('application/pdf','image/jpeg','image/png','image/webp') or p_mime_type is null or p_size is null or p_size not between 1 and 5242880 or coalesce(length(trim(p_file_name)),0) not between 1 and 180 then raise exception 'Usa PDF, JPG, PNG o WebP de hasta 5 MB.';end if;
 if (select count(*) from public.financial_files where uploaded_by=auth.uid() and created_at>now()-interval '1 hour')>=60 then raise exception 'Demasiadas cargas recientes. Revisa los archivos existentes.';end if;
 staging:=school::text||'/finance/staging/'||aid::text;
 insert into public.financial_files(id,school_id,student_id,kind,invoice_id,submission_id,uploaded_by,file_name,mime_type,size_bytes,staging_key) values(aid,school,sid,p_kind,case when p_kind='invoice' then p_parent_id end,case when p_kind='payment_evidence' then p_parent_id end,auth.uid(),regexp_replace(trim(p_file_name),'[[:cntrl:]/\\]','_','g'),p_mime_type,p_size,staging);
 return jsonb_build_object('id',aid,'objectKey',staging);
end $$;
create function public.financial_file_for_upload(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.financial_files;begin
 select * into f from public.financial_files where id=p_id and uploaded_by=auth.uid() and status='uploading' and created_at>now()-interval '20 minutes';
 if f.id is null or (f.kind='invoice' and not public.may_manage_student(f.student_id)) or (f.kind='payment_evidence' and not exists(select 1 from public.payment_submissions s where s.id=f.submission_id and s.status='draft' and ((s.submitted_by=auth.uid() and public.is_verified_guardian(s.student_id)) or public.may_manage_student(s.student_id)))) then raise exception 'La carga venció o ya no tienes permiso.';end if;
 return to_jsonb(f);
end $$;
create function public.finish_financial_file(p_id uuid,p_size integer,p_mime_type text,p_object_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare f public.financial_files;begin
 select * into f from public.financial_files where id=p_id for update;
 if f.id is null or f.status<>'uploading' or f.created_at<now()-interval '20 minutes' or p_size is distinct from f.size_bytes or p_mime_type is distinct from f.mime_type or p_object_key not like f.school_id::text||'/finance/ready/'||f.id::text||'/%' or p_object_key is null then return false;end if;
 update public.financial_files set status='ready',object_key=p_object_key where id=f.id;return true;
end $$;
create function public.submit_payment_submission(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare s public.payment_submissions;begin
 select * into s from public.payment_submissions where id=p_id for update;
 if s.id is null or not((s.submitted_by=auth.uid() and public.is_verified_guardian(s.student_id)) or public.may_manage_student(s.student_id)) then raise exception 'No tienes acceso a este comprobante.';end if;
 if s.status in ('pending','approved') then return;end if;
 if s.status<>'draft' or not exists(select 1 from public.financial_files where submission_id=s.id and status='ready') then raise exception 'Adjunta un comprobante válido antes de enviarlo.';end if;
 update public.payment_submissions set status='pending' where id=s.id;
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target) select m.user_id,s.school_id,s.student_id,'payment_evidence',s.id,'Comprobante por revisar','La familia presentó un comprobante de pago.','cash' from public.school_memberships m where m.school_id=s.school_id and m.role='director' and m.active on conflict do nothing;
end $$;
create function public.review_payment_submission(p_id uuid,p_approve boolean,p_note text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare s public.payment_submissions;receipt uuid;begin
 select * into s from public.payment_submissions where id=p_id for update;
 if s.id is null or not public.may_manage_student(s.student_id) then raise exception 'Solo Dirección puede verificar este ingreso en la cuenta de la institución.';end if;
 if p_approve is null or length(coalesce(p_note,''))>1000 then raise exception 'Revisa la decisión y la observación.';end if;
 if s.status='approved' and p_approve then return s.receipt_id;end if;
 if s.status='rejected' and not p_approve then return null;end if;
 if s.status<>'pending' then raise exception 'Este comprobante ya fue revisado o aún no fue enviado.';end if;
 if not p_approve and length(trim(coalesce(p_note,'')))<5 then raise exception 'Indica por qué no se pudo verificar el pago.';end if;
 if p_approve then
  receipt:=public.checkout_school_payment(s.id,s.student_id,s.items,s.payment_method,s.reference,s.invoice_details,true);
 end if;
 update public.payment_submissions set status=case when p_approve then 'approved' else 'rejected' end,receipt_id=receipt,reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(coalesce(p_note,'')) where id=s.id;
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target) select g.user_id,s.school_id,s.student_id,'payment_evidence_reviewed',s.id,case when p_approve then 'Comprobante aprobado' else 'Comprobante observado' end,'Consulta el resultado en tus pagos.','cash' from public.student_guardians g where g.student_id=s.student_id and g.verified_at is not null and g.can_view on conflict do nothing;
 return receipt;
end $$;

-- Authorized consultation events are distinct from fetching background data.
create function public.record_content_view(p_id uuid,p_kind text,p_content_id uuid,p_client text,p_action text default 'open') returns uuid language plpgsql security definer set search_path='' as $$
declare sid uuid;school uuid;title text;fingerprint text;payload jsonb;role_value text;begin
 if auth.uid() is null then raise exception 'Sesión requerida.';end if;
 if aulanexo_private.support_id() is not null then return null;end if;
 if p_id is null or p_client not in ('web','android') or p_client is null or p_action not in ('open','download') or p_action is null then raise exception 'Consulta inválida.';end if;
 if p_kind='grade' then select g.student_id,g.school_id,g.subject||' · '||g.period,to_jsonb(g) into sid,school,title,payload from public.grades g where g.id=p_content_id;
 elsif p_kind='media' then select m.student_id,m.school_id,m.caption,to_jsonb(m) into sid,school,title,payload from public.media_assets m where m.id=p_content_id;
 elsif p_kind='report_card' then select r.student_id,r.school_id,'Libreta publicada',to_jsonb(r) into sid,school,title,payload from public.report_cards r where r.id=p_content_id and r.published_at is not null and r.revoked_at is null;
 elsif p_kind='invoice' then select f.student_id,f.school_id,'Factura · '||f.file_name,to_jsonb(f)-'staging_key'-'object_key' into sid,school,title,payload from public.financial_files f where f.id=p_content_id and f.kind='invoice' and public.may_read_financial_file(f.id);
 elsif p_kind='receipt' then select r.student_id,r.school_id,'Recibo · '||left(r.id::text,8),to_jsonb(r) into sid,school,title,payload from public.school_receipts r where r.id=p_content_id and (public.may_manage_student(r.student_id) or public.is_verified_guardian(r.student_id));
 elsif p_kind in ('calendar','daily','materials','assignments') then select s.id,s.school_id,case p_kind when 'calendar' then 'Calendario' when 'daily' then 'Cuaderno digital' when 'materials' then 'Materiales' else 'Tareas' end,jsonb_build_object('section',p_kind) into sid,school,title,payload from public.students s where s.id=p_content_id;
 else raise exception 'Tipo de consulta no reconocido.';end if;
 if sid is null or public.is_platform_admin() or not aulanexo_private.in_support_school(school) then raise exception 'No tienes acceso a este contenido.';end if;
 if p_kind not in ('invoice','receipt') and not public.may_use_student(sid) and not (aulanexo_private.student_id_for_user(auth.uid(),school)=sid and aulanexo_private.student_learning_access(sid) and p_kind in ('calendar','daily','materials','assignments')) then raise exception 'Este contenido no está disponible para tu cuenta.';end if;
 role_value:=case when public.may_manage_student(sid) then 'director' when public.may_teacher_write(sid) then 'teacher' when public.is_verified_guardian(sid) then 'guardian' else 'student' end;
 fingerprint:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtext('content-view-'||p_id::text));
 if exists(select 1 from public.content_view_events where id=p_id and (viewer_id<>auth.uid() or content_kind<>p_kind or content_id<>p_content_id or action<>p_action)) then raise exception 'El identificador de consulta ya se utilizó.';end if;
 insert into public.content_view_events(id,school_id,student_id,viewer_id,viewer_role,content_kind,content_id,content_title,content_hash,action,client) values(p_id,school,sid,auth.uid(),role_value,p_kind,p_content_id,left(coalesce(title,''),200),fingerprint,p_action,p_client) on conflict(id) do nothing;
 return p_id;
end $$;
create function public.content_view_report(p_school_id uuid,p_from date,p_to date,p_student_id uuid default null,p_kind text default null,p_offset integer default 0,p_limit integer default 50) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>366 or p_offset<0 or p_offset is null or p_limit not between 1 and 500 or p_limit is null then raise exception 'Elige hasta un año y revisa la página del reporte.';end if;
 if not aulanexo_private.in_support_school(p_school_id) or public.is_platform_admin() or not public.has_school_role(p_school_id,array['director','teacher']) then raise exception 'Solo Dirección y docentes pueden consultar este reporte.';end if;
 with permitted as materialized (select e.*,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email) as viewer_name,s.first_name||' '||s.last_name as student_name,c.name as classroom_name from public.content_view_events e join auth.users u on u.id=e.viewer_id join public.students s on s.id=e.student_id left join public.classrooms c on c.id=s.classroom_id where e.school_id=p_school_id and e.viewed_at>=p_from::timestamp at time zone 'America/La_Paz' and e.viewed_at<(p_to+1)::timestamp at time zone 'America/La_Paz' and (p_student_id is null or e.student_id=p_student_id) and (p_kind is null or e.content_kind=p_kind) and (public.may_manage_student(s.id) or public.may_teacher_write(s.id))),
 page as(select * from permitted order by viewed_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from permitted),'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'studentId',student_id,'studentName',student_name,'classroomName',classroom_name,'viewerName',viewer_name,'viewerRole',viewer_role,'kind',content_kind,'contentId',content_id,'title',content_title,'viewedAt',viewed_at,'action',action,'client',client,'contentHash',content_hash) order by viewed_at desc,id desc) from page),'[]')) into result;
 return result;
end $$;

create function public.student_account_statement(p_student_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.students;result jsonb;begin
 select * into s from public.students where id=p_student_id;
 if s.id is null or not aulanexo_private.in_support_school(s.school_id) or public.is_platform_admin() or not(public.may_manage_student(s.id) or public.is_verified_guardian(s.id)) then raise exception 'Solo Dirección y la familia vinculada pueden consultar este estado de cuenta.';end if;
 select jsonb_build_object('studentName',s.first_name||' '||s.last_name,'schoolName',sch.name,'classroomName',c.name,'generatedAt',now(),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'concept',ch.concept,'period',ch.period,'dueDate',ch.due_date,'amount',ch.amount,'paidAmount',ch.paid_amount,'balance',case when ch.status='cancelled' then 0 else greatest(ch.amount-ch.paid_amount,0) end,'status',ch.status) order by ch.due_date,ch.id) from public.school_charges ch where ch.student_id=s.id),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',public.receipt_line_items(r.id)) order by r.created_at desc,r.id) from public.school_receipts r where r.student_id=s.id),'[]'),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,'mimeType',f.mime_type)) from public.financial_files f where f.invoice_id=i.id and f.status='ready' and (i.status='issued' or public.may_manage_student(s.id))),'[]'))) from public.invoice_requests i where i.student_id=s.id),'[]')) into result from public.schools sch left join public.classrooms c on c.id=s.classroom_id where sch.id=s.school_id;
 return result;
end $$;

create trigger financial_files_workspace after insert or update on public.financial_files for each row execute function aulanexo_private.touch_workspace();
create trigger payment_submissions_workspace after insert or update on public.payment_submissions for each row execute function aulanexo_private.touch_workspace();
create trigger financial_files_audit after insert or update on public.financial_files for each row execute function aulanexo_private.capture_audit();
create trigger payment_submissions_audit after insert or update on public.payment_submissions for each row execute function aulanexo_private.capture_audit();
-- No workspace signal for view events: reading must never cause a reload loop.
revoke all on function public.record_content_view(uuid,text,uuid,text,text),public.content_view_report(uuid,date,date,uuid,text,integer,integer),public.student_account_statement(uuid),public.create_payment_submission(uuid,uuid,jsonb,text,text,date,jsonb),public.reserve_financial_file(text,uuid,text,text,integer),public.financial_file_for_upload(uuid),public.submit_payment_submission(uuid),public.review_payment_submission(uuid,boolean,text),public.may_read_financial_file(uuid) from public,anon;
grant execute on function public.record_content_view(uuid,text,uuid,text,text),public.content_view_report(uuid,date,date,uuid,text,integer,integer),public.student_account_statement(uuid),public.create_payment_submission(uuid,uuid,jsonb,text,text,date,jsonb),public.reserve_financial_file(text,uuid,text,text,integer),public.financial_file_for_upload(uuid),public.submit_payment_submission(uuid),public.review_payment_submission(uuid,boolean,text),public.may_read_financial_file(uuid) to authenticated;
revoke all on function public.finish_financial_file(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.finish_financial_file(uuid,integer,text,text) to service_role;

create policy notifications_financial_documents on public.notifications for select to authenticated using(user_id=aulanexo_private.actor_uid() and kind in ('payment_evidence','payment_evidence_reviewed','payment_invoice_ready') and (public.may_manage_student(student_id) or public.is_verified_guardian(student_id)));
do $$declare definition text;begin
 definition:=pg_get_functiondef('aulanexo_private.push_category(text)'::regprocedure);
 definition:=replace(definition,'p_kind like ''payment_due_%''','p_kind like ''payment_%''');execute definition;
 definition:=pg_get_functiondef('aulanexo_private.push_notice_visible_before_announcements(uuid)'::regprocedure);
 definition:=replace(definition,'''payment_receipt'',''access''','''payment_receipt'',''payment_evidence'',''payment_evidence_reviewed'',''payment_invoice_ready'',''access''');execute definition;
end $$;
create function aulanexo_private.invoice_document_notification() returns trigger language plpgsql security definer set search_path='' as $$
declare target_invoice uuid;invoice public.invoice_requests;begin
 if TG_TABLE_NAME='financial_files' then
  if new.kind<>'invoice' or new.status<>'ready' then return new;end if;target_invoice:=new.invoice_id;
 else
  if new.status<>'issued' then return new;end if;target_invoice:=new.id;
 end if;
 select * into invoice from public.invoice_requests where id=target_invoice and status='issued';
 if invoice.id is null or not exists(select 1 from public.financial_files where invoice_id=invoice.id and status='ready') then return new;end if;
 insert into public.notifications(user_id,school_id,student_id,kind,source_id,title,body,target) select g.user_id,invoice.school_id,invoice.student_id,'payment_invoice_ready',invoice.id,'Factura disponible','Tu factura emitida ya se puede descargar.','invoices' from public.student_guardians g where g.student_id=invoice.student_id and g.can_view and g.verified_at is not null on conflict do nothing;
 return new;
end $$;
create trigger invoice_file_notice after update on public.financial_files for each row execute function aulanexo_private.invoice_document_notification();
create trigger invoice_issued_notice after update on public.invoice_requests for each row execute function aulanexo_private.invoice_document_notification();
revoke all on function aulanexo_private.invoice_document_notification() from public,anon,authenticated;
create or replace function public.finance_register() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('items',public.receipt_line_items(r.id)) order by r.created_at desc,r.id) from public.school_receipts r),'[]'),
 'invoices',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,'mimeType',f.mime_type) order by f.created_at,f.id) from public.financial_files f where f.invoice_id=i.id and f.status='ready'),'[]')) order by i.created_at desc,i.id) from public.invoice_requests i),'[]'));
$$;
create function public.financial_support_register(p_school_id uuid,p_student_id uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('submissions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at desc,s.id) from (select * from public.payment_submissions where school_id=p_school_id and (p_student_id is null or student_id=p_student_id) and status<>'draft' order by created_at desc,id limit 100) s),'[]'),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'submission_id',f.submission_id,'file_name',f.file_name,'mime_type',f.mime_type)) from public.financial_files f where f.school_id=p_school_id and (p_student_id is null or f.student_id=p_student_id) and f.kind='payment_evidence' and f.status='ready'),'[]'));
$$;
revoke all on function public.financial_support_register(uuid,uuid) from public,anon;
grant execute on function public.financial_support_register(uuid,uuid) to authenticated;
-- The acknowledgment report also shows invited parents who have not linked their account yet.
create or replace function public.announcement_report(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.announcements;result jsonb;begin
 select * into a from public.announcements where id=p_id;
 if a.id is null or not public.may_edit_classroom(a.school_id,a.classroom_id) or not(a.created_by=aulanexo_private.actor_uid() or public.has_school_role(a.school_id,array['director'])) then raise exception 'Solo Dirección y el autor pueden revisar las confirmaciones.';end if;
 with expected as materialized (select lower(trim(v.email)) as email,max(v.name) as name,array_agg(distinct s.first_name||' '||s.last_name order by s.first_name||' '||s.last_name) as children from public.students s cross join lateral (values(s.mother_email,s.mother_name),(s.father_email,s.father_name)) v(email,name) where s.school_id=a.school_id and s.status='active' and a.audience in ('all','families') and (a.classroom_id is null or a.classroom_id=s.classroom_id) and (not a.targeted or exists(select 1 from aulanexo_private.announcement_targets t where t.announcement_id=a.id and t.student_id=s.id)) and length(trim(coalesce(v.email,'')))>0 and not exists(select 1 from auth.users author where author.id=a.created_by and lower(author.email)=lower(trim(v.email))) group by lower(trim(v.email))),
 registered as (select u.email,coalesce(nullif(u.raw_user_meta_data->>'full_name',''),u.email) as name,r.read_at,r.acknowledged_at,coalesce(e.children,'{}') as children,false as account_pending from public.announcement_receipts r join auth.users u on u.id=r.user_id left join expected e on e.email=lower(u.email) where r.announcement_id=p_id and aulanexo_private.announcement_recipient(p_id,r.user_id)),
 waiting as (select e.email,coalesce(nullif(e.name,''),e.email) as name,null::timestamptz as read_at,null::timestamptz as acknowledged_at,e.children,true as account_pending from expected e where not exists(select 1 from registered r where lower(r.email)=e.email)),
 everyone as (select * from registered union all select * from waiting)
 select coalesce(jsonb_agg(jsonb_build_object('name',name,'email',email,'children',children,'readAt',read_at,'acknowledgedAt',acknowledged_at,'accountPending',account_pending) order by name,email),'[]') into result from everyone;
 return result;
end $$;
