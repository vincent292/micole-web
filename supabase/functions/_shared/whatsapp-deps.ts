import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { r2OriginHeaders } from '../r2-media/origins.ts';
import type { WhatsAppApi } from './whatsapp-api.ts';
export function whatsAppDependencies(): WhatsAppApi {
  let admin: ReturnType<typeof createClient> | undefined;
  const env = (name: string) => Deno.env.get(name);
  return {
    env, fetch,
    origin: origin => r2OriginHeaders(origin, env('WHATSAPP_APP_ORIGINS') || env('APP_ORIGINS') || env('DOCUMENT_IMPORT_ORIGINS') || ''),
    background: task => EdgeRuntime.waitUntil(task),
    async authenticate(authorization, support) {
      const client = createClient(env('SUPABASE_URL')!, env('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization, ...(support ? { 'x-micole-support': support } : {}) } }, auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await client.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
      if (error || !data.user) throw Error('Sesión no válida.');
      return { id: data.user.id, async rpc<T>(name: string, args: Record<string, unknown>) { const { data, error } = await client.rpc(name, args); if (error) throw Error(error.message); return data as T; } };
    },
    async service<T>(action: string, data: Record<string, unknown> = {}) {
      admin ||= createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await admin.rpc('whatsapp_service', { p_action: action, p_data: data });
      if (result.error) throw Error(result.error.message); return result.data as T;
    },
  };
}
