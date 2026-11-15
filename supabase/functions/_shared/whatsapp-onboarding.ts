import { encryptWhatsAppToken, decryptWhatsAppToken } from './whatsapp-credentials.ts';
import { metaRequest, type WhatsAppRuntime } from './whatsapp-runtime.ts';
export function whatsAppSetupReady(deps: WhatsAppRuntime) {
  return ['META_APP_ID', 'META_APP_SECRET', 'META_WHATSAPP_CONFIG_ID', 'WHATSAPP_CREDENTIALS_KEY', 'WHATSAPP_VERIFY_TOKEN', 'SUPABASE_URL'].every(k => !!deps.env(k));
}
export function whatsAppCallback(deps: WhatsAppRuntime) { return `${deps.env('SUPABASE_URL')}/functions/v1/whatsapp-webhook`; }
function subscriptionMatches(sub: any, appId: string) { return sub?.whatsapp_business_api_data?.id === appId || sub?.id === appId; }
export async function finishSchoolWhatsApp(deps: WhatsAppRuntime, schoolId: string, userId: string, data: Record<string, any>) {
  if (!whatsAppSetupReady(deps)) throw Error('La administración debe configurar la conexión con Meta.');
  const appId = deps.env('META_APP_ID')!, appSecret = deps.env('META_APP_SECRET')!;
  if (typeof data.code !== 'string' || !data.code || data.code.length > 4096) throw Error('Meta no devolvió una autorización válida.');
  for (const field of ['phoneNumberId', 'wabaId']) if (data[field] && !/^\d{3,40}$/.test(data[field])) throw Error('Selección de Meta no válida.');
  const exchange = await metaRequest<{ access_token: string; expires_in?: number }>(deps, 'oauth/access_token', `${appId}|${appSecret}`,
    new URLSearchParams({ client_id: appId, client_secret: appSecret, code: data.code }));
  if (!exchange.access_token) throw Error('Meta no devolvió una autorización válida.');
  const token = exchange.access_token;
  const debug = await metaRequest<{ data: { app_id: string; is_valid: boolean; scopes?: string[]; expires_at?: number; granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(deps,
    `debug_token?input_token=${encodeURIComponent(token)}`, `${appId}|${appSecret}`);
  if (!debug.data.is_valid || debug.data.app_id !== appId || !['whatsapp_business_management', 'whatsapp_business_messaging'].every(k => debug.data.scopes?.includes(k))) throw Error('Autoriza WhatsApp y el envío de mensajes en Meta.');
  const granted = [...new Set((debug.data.granular_scopes || []).filter(x => ['whatsapp_business_management', 'whatsapp_business_messaging'].includes(x.scope)).flatMap(x => x.target_ids || []).filter(id => /^\d+$/.test(id)))];
  if (data.wabaId && granted.length && !granted.includes(data.wabaId)) throw Error('La cuenta seleccionada no está autorizada por Meta.');
  const accounts: string[] = data.wabaId ? [data.wabaId] : granted;
  if (!accounts.length || accounts.length > 5) throw Error('Vuelve a conectar seleccionando la cuenta de esta institución.');
  type Phone = { id: string; display_phone_number: string; verified_name?: string; is_on_biz_app?: boolean };
  let phone: Phone | undefined, wabaId: string | undefined;
  for (const account of accounts) {
    let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      const result = await metaRequest<{ data: Phone[]; paging?: { next?: string; cursors?: { after?: string } } }>(deps,
        `${account}/phone_numbers?fields=id,display_phone_number,verified_name,is_on_biz_app&limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, token);
      for (const p of result.data.filter(p => data.phoneNumberId ? p.id === data.phoneNumberId : p.is_on_biz_app === true)) {
        if (phone && (phone.id !== p.id || wabaId !== account)) throw Error('Hay varios números autorizados. Selecciona únicamente el de esta sede.');
        phone = p; wabaId = account;
      }
      if (phone && data.phoneNumberId || !result.paging?.next) break;
      after = result.paging.cursors?.after;
      if (!after || page === 4) throw Error('No pudimos comprobar todos los números. Vuelve a seleccionar el de esta sede.');
    }
  }
  if (!phone || !wabaId || phone.is_on_biz_app !== true) throw Error('Selecciona el WhatsApp Business de esta sede con coexistencia.');
  if ((deps.env('WHATSAPP_FORBIDDEN_PHONE_IDS') || '').split(',').includes(phone.id)) throw Error('Este número pertenece a otro canal de la plataforma.');
  const ciphertext = await encryptWhatsAppToken(token, deps.env('WHATSAPP_CREDENTIALS_KEY')!, schoolId);
  const expires = debug.data.expires_at || (exchange.expires_in ? Math.floor(Date.now() / 1000) + exchange.expires_in : 0);
  await deps.service('save_connection', { schoolId, userId, phoneNumberId: phone.id, wabaId, displayPhone: phone.display_phone_number,
    verifiedName: phone.verified_name, ciphertext, expiresAt: expires ? new Date(expires * 1000).toISOString() : null });
  try {
    const apps = await metaRequest<{ data: any[] }>(deps, `${wabaId}/subscribed_apps`, token);
    // A no-body POST to an already subscribed WABA could remove its override.
    if (!apps.data.some(app => subscriptionMatches(app, appId))) {
      const result = await metaRequest<{ success: boolean }>(deps, `${wabaId}/subscribed_apps`, token, {});
      if (!result.success) throw Error('No se pudo suscribir la cuenta.');
    }
    // Phone-level routing preserves saas-food's global and account-level callbacks.
    const result = await metaRequest<{ success: boolean }>(deps, phone.id, token, { webhook_configuration: {
      override_callback_uri: whatsAppCallback(deps), verify_token: deps.env('WHATSAPP_VERIFY_TOKEN'),
    } });
    if (!result.success) throw Error('No se pudo activar el webhook de este número.');
    await deps.service('connection_status', { schoolId, ciphertext, status: 'connected' });
  } catch (error) {
    await deps.service('connection_status', { schoolId, ciphertext, status: 'needs_reconnect' });
    throw error;
  }
}
export async function checkSchoolWhatsApp(deps: WhatsAppRuntime, schoolId: string) {
  const connection = await deps.service<any>('connection', { schoolId });
  if (!connection?.token_ciphertext || connection.status === 'disconnected') throw Error('Conecta WhatsApp primero.');
  try {
    const token = await decryptWhatsAppToken(connection.token_ciphertext, deps.env('WHATSAPP_CREDENTIALS_KEY') || '', schoolId);
    const phone = await metaRequest<any>(deps, `${connection.phone_number_id}?fields=id,is_on_biz_app,webhook_configuration`, token);
    const apps = await metaRequest<{ data: any[] }>(deps, `${connection.waba_id}/subscribed_apps`, token);
    const callback = phone.webhook_configuration?.phone_number;
    const callbackUrl = typeof callback === 'string' ? callback : callback?.override_callback_uri || callback?.callback_url;
    if (phone.is_on_biz_app !== true || callbackUrl !== whatsAppCallback(deps) || !apps.data.some(a => subscriptionMatches(a, deps.env('META_APP_ID')!))) throw Error('Vuelve a conectar para activar el webhook de esta sede.');
    await deps.service('connection_status', { schoolId, ciphertext: connection.token_ciphertext, status: 'connected' });
  } catch (error) {
    await deps.service('connection_status', { schoolId, ciphertext: connection.token_ciphertext, status: 'needs_reconnect' }); throw error;
  }
}
