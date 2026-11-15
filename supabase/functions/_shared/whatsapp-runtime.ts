import { decryptWhatsAppToken, verifyWhatsAppSignature } from './whatsapp-credentials.ts';
import { schoolBotReply, type BotContext } from './whatsapp-bot.ts';
export interface WhatsAppRuntime {
  env: (name: string) => string | undefined;
  service: <T = any>(action: string, data?: Record<string, unknown>) => Promise<T>;
  fetch: typeof fetch;
  background?: (task: Promise<unknown>) => void;
}
export class MetaError extends Error {
  constructor(public code: string, public certain = true) { super('Meta no pudo completar la operación. Comprueba la conexión de WhatsApp.'); }
}
export async function metaRequest<T>(deps: WhatsAppRuntime, path: string, token: string, body?: object | URLSearchParams): Promise<T> {
  const version = deps.env('META_GRAPH_API_VERSION') || 'v26.0';
  if (!/^v\d+\.\d+$/.test(version)) throw Error('Versión de Meta no válida.');
  const response = await deps.fetch(`https://graph.facebook.com/${version}/${path}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json' },
    ...(body ? { body: body instanceof URLSearchParams ? body.toString() : JSON.stringify(body) } : {}), signal: AbortSignal.timeout(8000),
  });
  let result: any;
  try { result = await response.json(); } catch { throw new MetaError('invalid_response', false); }
  if (!response.ok || result.error) throw new MetaError(String(result.error?.code || response.status));
  return result as T;
}
export async function drainWhatsApp(deps: WhatsAppRuntime) {
  const ids = await deps.service<string[]>('pending');
  let sent = 0;
  for (const id of ids) {
    const job = await deps.service<any>('claim', { messageId: id });
    if (!job) continue;
    try {
      const token = await decryptWhatsAppToken(job.ciphertext, deps.env('WHATSAPP_CREDENTIALS_KEY') || '', job.schoolId);
      const result = await metaRequest<{ messages?: { id: string }[] }>(deps, `${job.phoneNumberId}/messages`, token,
        { messaging_product: 'whatsapp', recipient_type: 'individual', to: job.contactKey, type: 'text', text: { body: job.body, preview_url: false } });
      if (!result.messages?.[0]?.id) throw new MetaError('missing_message_id', false);
      await deps.service('sent', { messageId: id, providerId: result.messages[0].id }); sent++;
    } catch (error) {
      // A timeout after Meta accepted a send is ambiguous: never resend it automatically.
      await deps.service('send_error', { messageId: id, certain: error instanceof MetaError && error.certain,
        code: error instanceof MetaError ? error.code : 'delivery_unconfirmed' });
    }
  }
  return { sent };
}
export async function readWhatsAppBody(req: Request, max: number) {
  const reader = req.body?.getReader();
  if (!reader) throw Error('Solicitud vacía.');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
    if (size > max) { await reader.cancel(); throw Error('Solicitud demasiado grande.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
const digits = (v: unknown) => typeof v === 'string' && /^\d{3,40}$/.test(v);
const contact = (v: unknown) => typeof v === 'string' && /^(?:[0-9]{5,24}|[A-Z]{2}\.[A-Za-z0-9._-]{1,120})$/.test(v);
export function parseWhatsAppEvents(payload: any) {
  const events: Record<string, unknown>[] = [];
  if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) return events;
  for (const entry of payload.entry) {
    if (!digits(entry.id) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      const v = change.value;
      if (!digits(v?.metadata?.phone_number_id)) continue;
      const base = { wabaId: entry.id, phoneNumberId: v.metadata.phone_number_id };
      if (change.field === 'messages') for (const s of v.statuses || []) {
        if (typeof s.id === 'string' && s.id.length <= 512 && ['sent', 'delivered', 'read', 'failed'].includes(s.status)) events.push({ ...base, kind: 'status', providerId: s.id, status: s.status });
      }
      const echo = change.field === 'smb_message_echoes';
      if (change.field !== 'messages' && !echo) continue;
      for (const m of (echo ? v.message_echoes || v.messages : v.messages) || []) {
        const key = echo ? m.to_user_id || m.to : m.from_user_id || m.from;
        const stamp = Number(m.timestamp) * 1000;
        if (!contact(key) || typeof m.id !== 'string' || m.id.length > 512 || !Number.isFinite(stamp) || stamp <= 0 || stamp > Date.now() + 300000) continue;
        const name = (v.contacts || []).find((c: any) => [c.user_id, c.wa_id].includes(key))?.profile?.name || '';
        const body = m.text?.body || m.button?.text || m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || m.image?.caption || m.document?.caption || `Contenido recibido: ${String(m.type || 'no compatible').slice(0, 40)}`;
        if (typeof body !== 'string' || !body.trim()) continue;
        events.push({ ...base, kind: 'message', echo, providerId: m.id, contactKey: key, contactName: String(name).slice(0, 160), body: body.slice(0, 4000), timestamp: new Date(stamp).toISOString() });
      }
    }
  }
  if (events.length > 200) throw Error('Lote demasiado grande.');
  return events;
}
export async function handleWhatsAppWebhook(req: Request, deps: WhatsAppRuntime) {
  const headers = { 'Cache-Control': 'no-store' };
  if (req.method === 'GET') {
    const url = new URL(req.url), token = deps.env('WHATSAPP_VERIFY_TOKEN');
    if (!token || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== token) return new Response('Forbidden', { status: 403, headers });
    return new Response((url.searchParams.get('hub.challenge') || '').slice(0, 512), { headers });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  const secret = deps.env('META_APP_SECRET');
  if (!secret) return new Response('Not configured', { status: 503, headers });
  let bytes: Uint8Array;
  try { bytes = await readWhatsAppBody(req, 3 * 1024 * 1024); } catch { return new Response('Payload too large', { status: 413, headers }); }
  if (!await verifyWhatsAppSignature(bytes, req.headers.get('x-hub-signature-256'), secret)) return new Response('Forbidden', { status: 403, headers });
  let payload: any;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { return new Response('Invalid JSON', { status: 400, headers }); }
  try {
    const events = parseWhatsAppEvents(payload);
    if (events.length) {
      const received = await deps.service<{ context: BotContext | null; text: string; echo: boolean; kind: string }[]>('ingest_batch', { events });
      const replies: Record<string, unknown>[] = [];
      for (const item of received) {
        if (!item.context?.messageId || item.echo || item.kind !== 'message') continue;
        const reply = schoolBotReply(item.text, item.context);
        if (reply) replies.push({ inReplyTo: item.context.messageId, ...reply });
      }
      if (replies.length) await deps.service('queue_batch', { events: replies });
    }
    const task = drainWhatsApp(deps).catch(() => undefined);
    if (deps.background) deps.background(task); else await task;
    return new Response('EVENT_RECEIVED', { headers });
  } catch { return new Response('Retry later', { status: 503, headers }); }
}
