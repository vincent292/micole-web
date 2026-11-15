-- Expose invoker-only API contracts; privilege elevation stays in the private schema.
-- The private implementations preserve the same actor, institution and role guards.
alter function public.whatsapp_access(uuid) set schema aulanexo_private;
alter function public.whatsapp_workspace(uuid,uuid) set schema aulanexo_private;
alter function public.whatsapp_manage(uuid,text,jsonb) set schema aulanexo_private;
alter function public.whatsapp_service(text,jsonb) set schema aulanexo_private;
grant usage on schema aulanexo_private to authenticated,service_role;
revoke all on function aulanexo_private.whatsapp_access(uuid),aulanexo_private.whatsapp_workspace(uuid,uuid),aulanexo_private.whatsapp_manage(uuid,text,jsonb) from public,anon,service_role;
grant execute on function aulanexo_private.whatsapp_access(uuid),aulanexo_private.whatsapp_workspace(uuid,uuid),aulanexo_private.whatsapp_manage(uuid,text,jsonb) to authenticated;
revoke all on function aulanexo_private.whatsapp_service(text,jsonb) from public,anon,authenticated;
grant execute on function aulanexo_private.whatsapp_service(text,jsonb) to service_role;
create function public.whatsapp_access(p_school uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select aulanexo_private.whatsapp_access(p_school);
$$;
create function public.whatsapp_workspace(p_school uuid,p_conversation uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select aulanexo_private.whatsapp_workspace(p_school,p_conversation);
$$;
create function public.whatsapp_manage(p_school uuid,p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select aulanexo_private.whatsapp_manage(p_school,p_action,p_data);
$$;
create function public.whatsapp_service(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$
 select aulanexo_private.whatsapp_service(p_action,p_data);
$$;
revoke all on function public.whatsapp_access(uuid),public.whatsapp_workspace(uuid,uuid),public.whatsapp_manage(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.whatsapp_access(uuid),public.whatsapp_workspace(uuid,uuid),public.whatsapp_manage(uuid,text,jsonb) to authenticated;
revoke all on function public.whatsapp_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.whatsapp_service(text,jsonb) to service_role;
