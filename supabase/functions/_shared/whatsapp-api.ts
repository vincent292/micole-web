import { readWhatsAppBody, drainWhatsApp, type WhatsAppRuntime } from './whatsapp-runtime.ts';
import { whatsAppSetupReady, finishSchoolWhatsApp, checkSchoolWhatsApp } from './whatsapp-onboarding.ts';
export interface WhatsAppApi extends WhatsAppRuntime {
  origin: (origin: string | null) => Record<string, string> | null;
  authenticate: (authorization: string, support: string | null) => Promise<{ id: string; rpc: <T = any>(method: string, args: Record<string, unknown>) => Promise<T> }>;
}
const uuid = (s: unknown) => typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
function sameSecret(a: string, b: string) { if (!a || !b || a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
export async function handleWhatsAppApi(req: Request, deps: WhatsAppApi) {
  const cors = deps.origin(req.headers.get('origin'));
  const headers = { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers });
  if (req.method !== 'POST') return reply({ error: 'Método no permitido.' }, 405);
  let body: any;
  try { body = JSON.parse(new TextDecoder().decode(await readWhatsAppBody(req, 64000))); } catch { return reply({ error: 'Solicitud no válida.' }, 400); }
  if (body.action === 'worker') {
    if (!sameSecret(req.headers.get('x-micole-worker-key') || '', deps.env('WHATSAPP_WORKER_KEY') || '')) return reply({ error: 'No autorizado.' }, 401);
    try { return reply(body.health ? { ok: true } : { ok: true, ...await drainWhatsApp(deps) }); } catch { return reply({ error: 'Worker no disponible.' }, 503); }
  }
  if (!cors) return reply({ error: 'Origen no autorizado.' }, 403);
  if (!uuid(body.schoolId)) return reply({ error: 'Selecciona una institución.' }, 400);
  const authorization = req.headers.get('authorization') || '';
  if (!/^Bearer .+/i.test(authorization)) return reply({ error: 'Inicia sesión.' }, 401);
  let actor: Awaited<ReturnType<WhatsAppApi['authenticate']>>;
  try { actor = await deps.authenticate(authorization, req.headers.get('x-micole-support')); } catch { return reply({ error: 'Tu sesión venció.' }, 401); }
  const school = body.schoolId as string;
  try {
    const access = await actor.rpc<{ enabled: boolean; canConnect: boolean }>('whatsapp_access', { p_school: school });
    if (!access.enabled) return reply({ error: 'WhatsApp no está habilitado para esta institución o rol.' }, 403);
    if (['prepare', 'connect', 'check', 'disconnect', 'settings'].includes(body.action) && !access.canConnect) return reply({ error: 'Solo Dirección puede configurar la conexión y el bot.' }, 403);
    const manage = (action: string, data = body.data || {}) => actor.rpc('whatsapp_manage', { p_school: school, p_action: action, p_data: data });
    switch (body.action) {
      case 'workspace': return reply({ ...await actor.rpc<any>('whatsapp_workspace', { p_school: school, p_conversation: uuid(body.conversationId) ? body.conversationId : null }), setupReady: whatsAppSetupReady(deps) });
      case 'prepare': {
        if (!whatsAppSetupReady(deps)) throw Error('La administración debe habilitar la configuración de Meta.');
        return reply({ ...await manage('prepare'), appId: deps.env('META_APP_ID'), configId: deps.env('META_WHATSAPP_CONFIG_ID'), version: deps.env('META_GRAPH_API_VERSION') || 'v26.0' });
      }
      case 'connect':
        if (!uuid(body.data?.sessionId)) throw Error('Vuelve a iniciar la conexión.');
        await manage('consume'); await finishSchoolWhatsApp(deps, school, actor.id, body.data); return reply({ ok: true });
      case 'check': await checkSchoolWhatsApp(deps, school); return reply({ ok: true });
      case 'disconnect': case 'settings': case 'conversation': return reply(await manage(body.action));
      case 'send': {
        if (!uuid(body.data?.requestId) || !uuid(body.data?.conversationId) || typeof body.data?.body !== 'string' || !body.data.body.trim() || body.data.body.length > 4000) throw Error('Revisa el texto del mensaje.');
        const queued = await manage('send'); const task = drainWhatsApp(deps).catch(() => undefined);
        if (deps.background) deps.background(task); else await task;
        return reply(queued, 202);
      }
      default: return reply({ error: 'Acción no válida.' }, 400);
    }
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }, 400); }
}
