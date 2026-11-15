import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '../components/UI';
import { whatsAppRequest, type WhatsAppWorkspace } from '../lib/whatsapp';
interface Prepared { sessionId: string; appId: string; configId: string; version: string }
interface FacebookSdk { init: (config: object) => void; login: (callback: (data: { authResponse?: { code?: string } }) => void, options: object) => void }
const facebook = () => (window as unknown as { FB?: FacebookSdk }).FB;
let sdkPromise: Promise<void> | undefined;
function loadFacebookSdk() {
  if (facebook()) return Promise.resolve();
  sdkPromise ||= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://connect.facebook.net/en_US/sdk.js'; script.async = true; script.defer = true;
    const timer = window.setTimeout(() => { script.remove(); sdkPromise = undefined; reject(Error('Meta tardó demasiado. Revisa los bloqueadores e intenta otra vez.')); }, 20000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = () => { clearTimeout(timer); script.remove(); sdkPromise = undefined; reject(Error('No se pudo cargar Meta. Revisa los bloqueadores del navegador.')); };
    document.head.appendChild(script);
  });
  return sdkPromise;
}
export function WhatsAppConnection({ schoolId, data, onChanged }: { schoolId: string; data: WhatsAppWorkspace; onChanged: () => void }) {
  const [prepared, setPrepared] = useState<Prepared>(), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [disconnect, setDisconnect] = useState(false);
  const pending = useRef<{ prepared: Prepared; code?: string; phoneNumberId?: string; wabaId?: string; saving?: boolean } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const complete = useCallback(async () => {
    const job = pending.current;
    if (!job?.code || job.saving) return;
    job.saving = true; setMessage('Comprobando y guardando la autorización de Meta…');
    try { await whatsAppRequest(schoolId, 'connect', { sessionId: job.prepared.sessionId, code: job.code, phoneNumberId: job.phoneNumberId, wabaId: job.wabaId });
      if (pending.current === job) { setMessage('Autorización procesada. Comprueba que el estado figure como conectado.'); onChanged(); }
    } catch (e) { if (pending.current === job) setError((e as Error).message); }
    finally { if (pending.current === job) { pending.current = null; setPrepared(undefined); setBusy(false); } }
  }, [schoolId, onChanged]);
  useEffect(() => {
    function receive(event: MessageEvent) {
      const job = pending.current;
      if (!['https://www.facebook.com', 'https://web.facebook.com', 'https://business.facebook.com'].includes(event.origin) || !job || job.saving) return;
      let payload;
      try { payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (['CANCEL', 'ERROR'].includes(payload.event)) { pending.current = null; setPrepared(undefined); setBusy(false); setMessage('No se completó el enlace. Puedes volver a conectar.'); return; }
      if (!['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(payload.event)) return;
      if (/^\d{3,40}$/.test(payload.data?.phone_number_id || '')) job.phoneNumberId = payload.data.phone_number_id;
      if (/^\d{3,40}$/.test(payload.data?.waba_id || '')) job.wabaId = payload.data.waba_id;
      if (job.code) void complete();
      else setMessage('Meta completó los pasos. Esperando la autorización; mantén esta página abierta…');
    }
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); pending.current = null; timers.current.forEach(clearTimeout); };
  }, [complete]);
  async function prepare() {
    setBusy(true); setError(''); setMessage('Preparando conexión segura con Meta…');
    try { const value = await whatsAppRequest<Prepared>(schoolId, 'prepare'); await loadFacebookSdk(); setPrepared(value); setMessage('Continúa con Meta y selecciona únicamente el número de esta sede.'); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function connect() {
    const sdk = facebook();
    if (!prepared || !sdk) { setError('Vuelve a preparar la conexión con Meta.'); return; }
    const job = { prepared } as NonNullable<typeof pending.current>; pending.current = job; setBusy(true); setError('');
    timers.current.push(setTimeout(() => { if (pending.current === job && !job.saving) { pending.current = null; setPrepared(undefined); setBusy(false); setError('La autorización venció. Vuelve a conectar.'); } }, 15 * 60000));
    try {
      sdk.init({ appId: prepared.appId, version: prepared.version, cookie: false, xfbml: false });
      sdk.login(response => {
        if (pending.current !== job || job.saving) return;
        if (!response.authResponse?.code) { pending.current = null; setPrepared(undefined); setBusy(false); setMessage('Meta no autorizó la conexión. Puedes volver a intentar.'); return; }
        job.code = response.authResponse.code;
        if (job.phoneNumberId && job.wabaId) void complete(); else timers.current.push(setTimeout(() => void complete(), 1000));
      }, { config_id: prepared.configId, response_type: 'code', override_default_response_type: true,
        extras: { version: 'v4', setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' } });
    } catch { pending.current = null; setPrepared(undefined); setBusy(false); setError('No pudimos abrir Meta. Permite las ventanas emergentes y vuelve a conectar.'); }
  }
  async function manage(action: 'check' | 'disconnect') {
    setBusy(true); setError(''); setMessage('');
    try { await whatsAppRequest(schoolId, action); setMessage(action === 'check' ? 'Estado de conexión actualizado.' : 'Bot desconectado. El historial permanece disponible.'); setDisconnect(false); onChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const labels: Record<string, string> = { connected: 'Conectado', pending: 'Conexión incompleta', disconnected: 'Desconectado', needs_reconnect: 'Vuelve a conectar' };
  return <section className="panel wa-connection" aria-labelledby="wa-connection-title">
    <h2 id="wa-connection-title">Conecta el WhatsApp Business de esta sede</h2>
    <p>Autoriza desde Meta el número de tu institución. Con coexistencia puedes conservar la aplicación WhatsApp Business y atender desde aquí.</p>
    <dl><div><dt>Estado</dt><dd>{labels[data.connection?.status || 'disconnected']}</dd></div><div><dt>Número</dt><dd>{data.connection?.display_phone || 'Todavía sin conectar'}</dd></div><div><dt>Nombre en Meta</dt><dd>{data.connection?.verified_name || 'Se verificará al conectar'}</dd></div></dl>
    {!data.setupReady && <p className="message warn">La administración de MiCole debe completar la configuración de Meta antes de conectar el número.</p>}
    {error && <p className="message error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {data.canConnect ? <div className="wa-actions">
      {prepared ? <Button icon={Link} disabled={busy} onClick={connect}>Continuar con Meta</Button> : <Button icon={Link} disabled={busy || !data.setupReady} onClick={() => void prepare()}>{data.connection ? 'Volver a conectar' : 'Conectar WhatsApp'}</Button>}
      {data.connection?.status !== 'disconnected' && data.connection && <><Button variant="secondary" icon={RefreshCw} disabled={busy} onClick={() => void manage('check')}>Comprobar conexión</Button><Button variant="ghost" icon={Unplug} disabled={busy} onClick={() => setDisconnect(true)}>Desconectar bot</Button></>}
    </div> : <p className="soft-note">Solo Dirección configura la conexión y las respuestas automáticas. Secretaría puede atender las conversaciones.</p>}
    {disconnect && <section className="message warn" role="alert"><div><h3>¿Desconectar el bot de esta sede?</h3><p>Se detendrán los envíos desde MiCole y se conservará el historial.</p><div className="wa-actions"><Button variant="danger" disabled={busy} onClick={() => void manage('disconnect')}>Sí, desconectar</Button><Button variant="secondary" disabled={busy} onClick={() => setDisconnect(false)}>Conservar conexión</Button></div></div></section>}
  </section>;
}
