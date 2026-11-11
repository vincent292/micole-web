import { expect, it } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { requestError, isConnectionError } from '../src/lib/requestErrors';

function harness(initialOffline = false) {
  type Callback = (...args: any[]) => any;
  const slots: any[] = [], listeners = new Map<string, Callback>(), timers: Callback[] = [];
  let cursor = 0, changed = false, effects: Callback[] = [], auth: Callback = () => {}, modal = false;
  let user = 'family-a', offline = initialOffline, invalid = false, identityCalls = 0;
  const navigate = () => {};
  const react = {
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (v: any) => { if (!Object.is(slots[i], v)) { slots[i] = v; changed = true; } }]; },
    useRef(value: any) { const i = cursor++; return slots[i] ??= { current: value }; },
    useCallback(fn: Callback, deps: any[]) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn: Callback, deps: any[]) { const i = cursor++, old = slots[i]; if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) { slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const error = () => Object.assign(new Error(offline ? 'Failed to fetch' : 'Invalid JWT'), { name: offline ? 'AuthRetryableFetchError' : 'AuthApiError' });
  const modules: Record<string, any> = {
    react, 'react-router-dom': { useNavigate: () => navigate },
    './workspaceEvents': { onWorkspaceChange: () => () => {} }, './sessionDraft': { clearDrafts() {} },
    './requestErrors': { requestError, isConnectionError },
    './supabase': { liveMode: true, authReturnIssue: '', setSupportSession() {}, supabase: { auth: {
      getUser: async () => offline || invalid ? { data: { user: null }, error: error() } : { data: { user: { id: user } }, error: null },
      onAuthStateChange(fn: Callback) { auth = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } } },
    './repository': { claimInvitation: async () => {}, getIdentity: async () => { identityCalls++; return { id: user, roles: ['guardian'] }; } },
  };
  const code = ts.transpileModule(fs.readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as any };
  vm.runInNewContext('(function(require,module,exports){' + code + '})', {
    Error, Date, location: { pathname: '/app/care', search: '', hash: '' }, history: { replaceState() {} },
    document: { querySelector: () => modal ? {} : null }, sessionStorage: { getItem: () => null, removeItem() {} },
    window: { setTimeout(fn: Callback) { timers.push(fn); return 1; }, clearTimeout() {}, addEventListener(k: string, fn: Callback) { listeners.set(k, fn); }, removeEventListener(k: string) { listeners.delete(k); } },
  })((name: string) => { if (!(name in modules)) throw Error(name); return modules[name]; }, module, module.exports);
  let value: any;
  function render() { for (let n = 0; n < 15; n++) { cursor = 0; changed = false; effects = []; value = module.exports.useIdentity(); effects.forEach(fn => fn()); if (!changed) return value; } throw Error('Render loop'); }
  return {
    render, get value() { return value; }, get identityCalls() { return identityCalls; },
    setOffline(v: boolean) { offline = v; }, setInvalid() { invalid = true; }, setModal(v: boolean) { modal = v; },
    event(kind: string, id: string | null = user) { auth(kind, id ? { user: { id } } : null); },
    focus() { listeners.get('focus')?.(); }, closeModal() { modal = false; listeners.get('micole:modal-closed')?.(); },
    async flush() { for (let n = 0; n < 15; n++) { while (timers.length) timers.shift()!(); await Promise.resolve(); render(); } },
  };
}

it('conserva la identidad ya verificada ante un corte temporal y traduce el error', async () => {
  const h = harness(); h.render(); await h.flush(); expect(h.value.identity.id).toBe('family-a');
  h.setOffline(true); h.focus(); await h.flush();
  expect(h.value.identity.id).toBe('family-a'); expect(h.value.error).toContain('Revisa tu conexión');
});
it('difiere la renovación de identidad mientras un formulario está abierto', async () => {
  const h = harness(); h.render(); await h.flush(); const calls = h.identityCalls;
  h.setModal(true); h.event('TOKEN_REFRESHED'); await h.flush(); expect(h.identityCalls).toBe(calls);
  h.closeModal(); await h.flush(); expect(h.identityCalls).toBe(calls + 1);
});
it('un arranque sin conexión nunca obtiene una identidad no verificada', async () => {
  const h = harness(true); h.render(); await h.flush(); expect(h.value.identity).toBeNull();
});
it('una sesión inválida descarta la identidad aunque el usuario ya estuviera dentro', async () => {
  const h = harness(); h.render(); await h.flush(); h.setInvalid(); h.focus(); await h.flush(); expect(h.value.identity).toBeNull();
});
it('cambiar de cuenta descarta el ámbito anterior incluso si la nueva no tiene conexión', async () => {
  const h = harness(); h.render(); await h.flush(); h.setOffline(true); h.event('SIGNED_IN', 'family-b'); h.render();
  expect(h.value.identity).toBeNull(); await h.flush(); expect(h.value.identity).toBeNull();
});
it('cerrar sesión descarta inmediatamente la identidad y sus reintentos', async () => {
  const h = harness(); h.render(); await h.flush(); h.event('SIGNED_OUT', null); h.render(); expect(h.value.identity).toBeNull(); expect(h.value.signedIn).toBe(false);
});
