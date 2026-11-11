-- Mica: help in every panel; user-wide cooldown and explicit, scoped confirmation.
alter table aulanexo_private.assistant_usage alter column school_id drop not null;
create table aulanexo_private.assistant_pauses (
 user_id uuid primary key references auth.users(id) on delete cascade,
 paused_until timestamptz not null
);
create table aulanexo_private.assistant_proposals (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 actor_id uuid not null references auth.users(id),
 school_id uuid not null references public.schools(id),
 support_id uuid,
 kind text not null check(kind='publish_announcement'),
 payload jsonb not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 status text not null default 'pending' check(status in ('pending','cancelled','executed')),
 result_id uuid
);
create index assistant_proposals_owner on aulanexo_private.assistant_proposals(user_id,created_at);
revoke all on aulanexo_private.assistant_pauses,aulanexo_private.assistant_proposals from public,anon,authenticated,service_role;

create function aulanexo_private.require_assistant_access(p_school uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
declare identity jsonb;
begin
 if auth.uid() is null or p_role is null or p_role not in ('superadmin','director','teacher','guardian','student','scheduler') then raise exception 'Inicia sesión con un rol autorizado de MiCole.';end if;
 if p_role='superadmin' then
  if p_school is not null or not public.is_platform_admin() or aulanexo_private.support_id() is not null then raise exception 'No tienes acceso a este panel.';end if;
  return;
 end if;
 if p_school is null or not aulanexo_private.in_support_school(p_school) or not exists(select 1 from public.schools where id=p_school and status='active') then raise exception 'Selecciona una sede autorizada.';end if;
 identity:=public.workspace_identity();
 if not exists(select 1 from jsonb_array_elements(coalesce(identity->'memberships','[]')) m where m->>'schoolId'=p_school::text and m->>'role'=p_role) then raise exception 'No tienes acceso a esta sede con ese rol.';end if;
end $$;
revoke all on function aulanexo_private.require_assistant_access(uuid,text) from public,anon,authenticated,service_role;

create function public.micole_assistant_state(p_school_id uuid,p_role text,p_reserve boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare until_time timestamptz;
begin
 perform aulanexo_private.require_assistant_access(p_school_id,p_role);
 perform pg_advisory_xact_lock(hashtext('micole-assistant:'||auth.uid()::text));
 select paused_until into until_time from aulanexo_private.assistant_pauses where user_id=auth.uid() and paused_until>now();
 if p_reserve and until_time is null then
  if (select count(*) from aulanexo_private.assistant_usage where user_id=auth.uid() and created_at>now()-interval '1 hour')>=30 or
   (p_school_id is not null and (select count(*) from aulanexo_private.assistant_usage where school_id=p_school_id and created_at>now()-interval '1 day')>=300)
   then raise exception 'Se alcanzó el límite de consultas al asistente. Inténtalo más tarde.';end if;
  delete from aulanexo_private.assistant_usage where created_at<now()-interval '7 days';
  insert into aulanexo_private.assistant_usage(school_id,user_id) values(p_school_id,auth.uid());
 end if;
 return jsonb_build_object('pausedUntil',until_time,'canPublish',p_role='director','serverNow',now());
end $$;
revoke all on function public.micole_assistant_state(uuid,text,boolean) from public,anon;
grant execute on function public.micole_assistant_state(uuid,text,boolean) to authenticated;

-- Only the authenticated Edge handler may classify a query and initiate a pause.
create function public.pause_micole_assistant(p_user_id uuid) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare until_time timestamptz;
begin
 perform pg_advisory_xact_lock(hashtext('micole-assistant:'||p_user_id::text));
 insert into aulanexo_private.assistant_pauses(user_id,paused_until) values(p_user_id,now()+interval '30 minutes')
 on conflict(user_id) do update set paused_until=greatest(aulanexo_private.assistant_pauses.paused_until,excluded.paused_until)
 returning paused_until into until_time;
 return until_time;
end $$;
revoke all on function public.pause_micole_assistant(uuid) from public,anon,authenticated;
grant execute on function public.pause_micole_assistant(uuid) to service_role;

create function public.prepare_assistant_announcement(p_school_id uuid,p_title text,p_content text,p_audience text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item aulanexo_private.assistant_proposals; state jsonb;
begin
 state:=public.micole_assistant_state(p_school_id,'director',false);
 if state->>'pausedUntil' is not null then raise exception 'Mica está en pausa. Espera a que termine el plazo.';end if;
 if coalesce(length(btrim(p_title)),0) not between 2 and 160 or coalesce(length(btrim(p_content)),0) not between 2 and 6000 or p_audience is null or p_audience not in ('families','staff','all') then raise exception 'Revisa el título, el texto y los destinatarios.';end if;
 if p_title ~ '\[[^]]+\]' or p_content ~ '\[[^]]+\]' then raise exception 'Completa los datos entre corchetes antes de preparar la publicación.';end if;
 if (select count(*) from aulanexo_private.assistant_proposals where user_id=auth.uid() and created_at>now()-interval '1 hour')>=30 then raise exception 'Se alcanzó el límite de propuestas. Inténtalo más tarde.';end if;
 insert into aulanexo_private.assistant_proposals(user_id,actor_id,school_id,support_id,kind,payload)
 values(auth.uid(),aulanexo_private.actor_uid(),p_school_id,aulanexo_private.support_id(),'publish_announcement',jsonb_build_object('title',btrim(p_title),'content',btrim(p_content),'audience',p_audience)) returning * into item;
 return jsonb_build_object('id',item.id,'schoolId',item.school_id,'schoolName',(select name from public.schools where id=item.school_id),'kind',item.kind,'payload',item.payload,'expiresAt',item.expires_at);
end $$;
revoke all on function public.prepare_assistant_announcement(uuid,text,text,text) from public,anon;
grant execute on function public.prepare_assistant_announcement(uuid,text,text,text) to authenticated;

create function public.confirm_assistant_proposal(p_proposal_id uuid,p_confirm boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item aulanexo_private.assistant_proposals; state jsonb; result uuid;
begin
 select * into item from aulanexo_private.assistant_proposals where id=p_proposal_id and user_id=auth.uid() for update;
 if item.id is null or item.actor_id is distinct from aulanexo_private.actor_uid() or item.support_id is distinct from aulanexo_private.support_id() then raise exception 'La propuesta no pertenece a tu sesión.';end if;
 state:=public.micole_assistant_state(item.school_id,'director',false);
 if p_confirm is not true then
  if item.status='pending' then update aulanexo_private.assistant_proposals set status='cancelled' where id=item.id;end if;
  return jsonb_build_object('status',case when item.status='executed' then 'executed' else 'cancelled' end,'id',item.result_id);
 end if;
 if state->>'pausedUntil' is not null then raise exception 'Mica está en pausa. Espera a que termine el plazo.';end if;
 if item.status='executed' then return jsonb_build_object('status','executed','id',item.result_id);end if;
 if item.status<>'pending' or item.expires_at<=now() then raise exception 'La propuesta venció o fue cancelada. Prepara una nueva.';end if;
 -- A closed operation, fixed recipient scope, no arbitrary RPC/SQL or model tools.
 if item.kind<>'publish_announcement' then raise exception 'Operación no permitida.';end if;
 result:=public.save_announcement(jsonb_build_object('id',item.id,'school_id',item.school_id,'title',item.payload->>'title','content',item.payload->>'content','audience',item.payload->>'audience','category','general','requires_acknowledgment',false,'remind_hourly',false,'urgent',false));
 update aulanexo_private.assistant_proposals set status='executed',result_id=result where id=item.id;
 insert into public.audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary)
 values(item.school_id,auth.uid(),'MiCole IA · confirmación humana','assistant_proposals',item.id,'INSERT',jsonb_build_object('name','Publicación confirmada con Mica','operation',item.kind,'resultId',result));
 return jsonb_build_object('status','executed','id',result);
end $$;
revoke all on function public.confirm_assistant_proposal(uuid,boolean) from public,anon;
grant execute on function public.confirm_assistant_proposal(uuid,boolean) to authenticated;
