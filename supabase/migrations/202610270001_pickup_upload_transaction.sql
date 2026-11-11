-- This RPC calls workspace_identity(), which may refresh verified family links.
-- PostgREST runs STABLE RPCs in READ ONLY transactions, including POST requests.
-- Use the correct transaction mode while retaining the existing authorization,
-- expiry checks, SECURITY DEFINER settings, body and grants.
alter function public.pickup_identity_for_upload(uuid) volatile;
