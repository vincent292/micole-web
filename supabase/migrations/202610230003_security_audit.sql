-- Distinguish reservations never claimed by the server from possibly sent bank requests.
alter table aulanexo_private.bank_qr_intents add column generation_started_at timestamptz;
-- Existing attempts have no reliable send history: keep them reserved conservatively.
update aulanexo_private.bank_qr_intents set generation_started_at=created_at
where status in ('generating','unknown') or qr_id is not null;

create function aulanexo_private.release_unstarted_bank_reservations() returns void
language sql security definer set search_path='' as $$
 with released as (
  update aulanexo_private.bank_qr_intents
  set status='failed',operation_token=null,operation_until=null,
      last_error='bank-generation-not-started',updated_at=now()
  where status='generating' and operation_until<now()
    and generation_started_at is null and qr_id is null
  returning id
 ) update aulanexo_private.bank_qr_allocations set reserved=false
   where intent_id in (select id from released);
$$;
revoke all on function aulanexo_private.release_unstarted_bank_reservations() from public,anon,authenticated;

-- Preserve all current scope, pricing, and test-workspace guards in the reservation function.
do $$declare definition text;needle text;begin
 definition:=pg_get_functiondef('aulanexo_private.reserve_bank_qr(text,uuid,uuid,jsonb,jsonb,uuid,uuid)'::regprocedure);
 needle:='if p_kind not in';
 if position(needle in definition)=0 then raise exception 'No se encontró la reserva bancaria esperada.';end if;
 execute replace(definition,needle,'perform aulanexo_private.release_unstarted_bank_reservations(); '||needle);
 definition:=pg_get_functiondef('public.reserve_baneco_link(text,jsonb)'::regprocedure);
 needle:='if link.bank_intent_id is not null';
 if position(needle in definition)=0 then raise exception 'No se encontró la reserva por enlace esperada.';end if;
 execute replace(definition,needle,'perform aulanexo_private.release_unstarted_bank_reservations(); '||needle);
 definition:=pg_get_functiondef('public.bank_claim_reconciliation(uuid,boolean)'::regprocedure);
 needle:='update aulanexo_private.bank_qr_intents set status=''unknown''';
 if position(needle in definition)=0 then raise exception 'No se encontró la reconciliación esperada.';end if;
 execute replace(definition,needle,'perform aulanexo_private.release_unstarted_bank_reservations(); '||needle);
end $$;

-- Atomic one-time server claim. An untrusted holder of operationToken cannot call this RPC.
create or replace function public.bank_generation_context(p_id uuid,p_token uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare i aulanexo_private.bank_qr_intents;begin
 update aulanexo_private.bank_qr_intents set generation_started_at=now()
 where id=p_id and operation_token=p_token and status='generating'
   and operation_until>now() and generation_started_at is null
 returning * into i;
 if i.id is null then raise exception 'bank-operation-busy';end if;
 return jsonb_build_object('id',i.id,'connectionId',i.connection_id,'transactionId',i.transaction_id,'amount',i.amount,'currency',i.currency,'dueDate',i.due_date,'description',i.description);
end $$;
revoke all on function public.bank_generation_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.bank_generation_context(uuid,uuid) to service_role;

-- Final assignment objects are written by the server under a fresh, never-presigned key.
-- Retain the legacy validator privately, including deadline/access/lock checks.
-- Expand first: old Edge instances retain RPC3 until the new function is deployed.
-- It remains service_role-only; no app client can confirm an upload itself.
do $$begin
 execute replace(pg_get_functiondef('public.finish_assignment_file(uuid,integer,text)'::regprocedure),
   'FUNCTION public.finish_assignment_file(', 'FUNCTION aulanexo_private.finish_assignment_file(');
end $$;
revoke all on function aulanexo_private.finish_assignment_file(uuid,integer,text) from public,anon,authenticated,service_role;
create function public.finish_assignment_file(p_id uuid,p_size integer,p_mime_type text,p_object_key text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.assignment_files;prefix text;begin
 select * into f from public.assignment_files where id=p_id;
 prefix:=f.school_id||'/assignments/ready/'||f.id||'/';
 if f.id is null or p_object_key is null or left(p_object_key,length(prefix))<>prefix
    or substring(p_object_key from length(prefix)+1) !~ '^[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
    or p_object_key=f.object_key then raise exception 'Clave final de tarea inválida.';end if;
 perform aulanexo_private.finish_assignment_file(p_id,p_size,p_mime_type);
 update public.assignment_files set object_key=p_object_key where id=p_id;
end $$;
revoke all on function public.finish_assignment_file(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.finish_assignment_file(uuid,integer,text,text) to service_role;
