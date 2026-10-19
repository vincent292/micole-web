-- Commercial leads are separate from the local-only public demonstration.
create table public.demo_requests (
 id uuid primary key default gen_random_uuid(),school_name text not null check(length(school_name) between 2 and 160),
 contact_name text not null check(length(contact_name) between 2 and 160),email text not null check(length(email)<=254),
 phone text not null check(length(phone) between 6 and 30),city text not null check(length(city) between 2 and 100),
 message text not null default '' check(length(message)<=1500),status text not null default 'pending' check(status in ('pending','contacted','closed')),
 notes text not null default '' check(length(notes)<=2000),created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),
 consent_at timestamptz not null default now(),request_key uuid not null unique
);
alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from public,anon,authenticated,service_role;
grant select on public.demo_requests to authenticated;
create function public.is_commercial_inbox_owner() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() and aulanexo_private.is_support_owner() and aulanexo_private.support_id() is null;
$$;
revoke all on function public.is_commercial_inbox_owner() from public,anon;
grant execute on function public.is_commercial_inbox_owner() to authenticated;
create policy demo_requests_owner on public.demo_requests for select to authenticated using(public.is_commercial_inbox_owner());
create table aulanexo_private.demo_request_limits (
 fingerprint text not null,window_start timestamptz not null,total integer not null check(total>0),primary key(fingerprint,window_start)
);
revoke all on aulanexo_private.demo_request_limits from public,anon,authenticated,service_role;
create function public.submit_demo_request(p_request_key uuid,p_payload jsonb,p_fingerprint text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;n integer;window_value timestamptz:=date_trunc('hour',now());begin
 if p_request_key is null or coalesce(p_fingerprint,'') !~ '^[a-f0-9]{64}$' then raise exception 'Solicitud inválida.';end if;
 select id into result from public.demo_requests where request_key=p_request_key;if result is not null then return result;end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or (p_payload->>'consent') is distinct from 'true' or length(trim(coalesce(p_payload->>'schoolName',''))) not between 2 and 160 or length(trim(coalesce(p_payload->>'contactName',''))) not between 2 and 160 or coalesce(p_payload->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(p_payload->>'email')>254 or coalesce(p_payload->>'phone','') !~ '^\+?[0-9 ()-]{6,30}$' or length(trim(coalesce(p_payload->>'city',''))) not between 2 and 100 or length(coalesce(p_payload->>'message',''))>1500 then raise exception 'Revisa los datos de contacto y acepta que te contactemos sobre la demostración.';end if;
 perform pg_advisory_xact_lock(hashtext('demo-request-'||p_fingerprint));
 select coalesce(sum(total),0) into n from aulanexo_private.demo_request_limits where fingerprint=p_fingerprint and window_start>=now()-interval '24 hours';
 if n>=10 then raise exception 'Ya recibimos varias solicitudes. Intenta nuevamente mañana.';end if;
 insert into aulanexo_private.demo_request_limits(fingerprint,window_start,total) values(p_fingerprint,window_value,1) on conflict(fingerprint,window_start) do update set total=aulanexo_private.demo_request_limits.total+1 returning total into n;
 if n>3 then raise exception 'Ya recibimos varias solicitudes. Intenta nuevamente más tarde.';end if;
 insert into public.demo_requests(school_name,contact_name,email,phone,city,message,request_key)
 values(trim(p_payload->>'schoolName'),trim(p_payload->>'contactName'),lower(trim(p_payload->>'email')),trim(p_payload->>'phone'),trim(p_payload->>'city'),trim(coalesce(p_payload->>'message','')),p_request_key) returning id into result;
 return result;
end $$;
revoke all on function public.submit_demo_request(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.submit_demo_request(uuid,jsonb,text) to service_role;
create function public.review_demo_request(p_id uuid,p_status text,p_notes text) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.is_platform_admin() or not aulanexo_private.is_support_owner() or aulanexo_private.support_id() is not null then raise exception 'Solo el propietario puede revisar solicitudes de demo.';end if;
 if p_status not in ('pending','contacted','closed') or length(coalesce(p_notes,''))>2000 then raise exception 'Revisa el estado y las observaciones.';end if;
 update public.demo_requests set status=p_status,notes=trim(coalesce(p_notes,'')),reviewed_by=auth.uid(),reviewed_at=now() where id=p_id;
 if not found then raise exception 'La solicitud ya no está disponible.';end if;
 insert into public.audit_events(actor_id,actor_name,entity,entity_id,action,summary) values(auth.uid(),'Propietario MiCole','demo_requests',p_id,'UPDATE',jsonb_build_object('name','Seguimiento de demostración','status',p_status));
end $$;
revoke all on function public.review_demo_request(uuid,text,text) from public,anon;
grant execute on function public.review_demo_request(uuid,text,text) to authenticated;
-- A lightweight owner-only signal refreshes the inbox without exposing contact details.
create table public.platform_signals (
 singleton boolean primary key default true check(singleton),revision bigint not null default 0,
 changed_table text not null default 'demo_requests',changed_at timestamptz not null default now()
);
insert into public.platform_signals default values;
alter table public.platform_signals enable row level security;
revoke all on public.platform_signals from public,anon,authenticated,service_role;
grant select on public.platform_signals to authenticated;
create policy platform_signals_owner on public.platform_signals for select to authenticated using(public.is_commercial_inbox_owner());
do $$begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.platform_signals;end if;
end $$;
create function aulanexo_private.signal_demo_request() returns trigger language plpgsql security definer set search_path='' as $$begin
 update public.platform_signals set revision=revision+1,changed_at=now();
 if TG_OP='UPDATE' then return new;end if;
 insert into public.notifications(user_id,kind,source_id,title,body,target)
 select p.user_id,'school_request',new.id,'Nueva solicitud de demo','Una institución solicitó conocer MiCole.','demoRequests' from public.platform_admins p;
 return new;
end $$;
create trigger demo_request_received after insert or update on public.demo_requests for each row execute function aulanexo_private.signal_demo_request();
revoke all on function aulanexo_private.signal_demo_request() from public,anon,authenticated,service_role;
