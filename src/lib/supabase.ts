import { authenticationError, authenticationReturnError } from "./authErrors";
import { createClient } from "@supabase/supabase-js";
import { publicDemo, isDemoEmail } from "./demo-config";
export const liveMode = !publicDemo && import.meta.env.VITE_APP_MODE === "live";
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const supportStorageKey = "micole_support_session";
export function setSupportSession(id: string | null) {
  if (id) sessionStorage.setItem(supportStorageKey, id);
  else sessionStorage.removeItem(supportStorageKey);
}
export function recoverExpiredSupport(message: string) {
  if (
    message.includes("support_expired") &&
    sessionStorage.getItem(supportStorageKey)
  ) {
    setSupportSession(null);
    window.dispatchEvent(new Event("micole:support-expired"));
  }
}
function configure() {
  if (typeof window === 'undefined' || !liveMode || !url || !key) return { client: null, error: "" };
  try {
    return {
      client: createClient(url.trim(), key.trim(), {
        global: {
          fetch: (input, init) => {
            const headers = new Headers(init?.headers);
            const support = sessionStorage.getItem(supportStorageKey);
            const target =
              typeof input === "string"
                ? input
                : input instanceof URL
                  ? input.href
                  : input.url;
            if (
              support &&
              (target.includes("/rest/v1/") ||
                target.includes("/functions/v1/"))
            )
              headers.set("x-micole-support", support);
            return fetch(input, { ...init, headers });
          },
        },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      }),
      error: "",
    };
  } catch (e) {
    return {
      client: null,
      error:
        e instanceof Error ? e.message : "Revisa la configuración de Supabase.",
    };
  }
}
export const authReturnIssue = typeof window === 'undefined' ? '' : authenticationReturnError(window.location.search, window.location.hash);
const configuration = configure();
export const supabase = configuration.client;
export const supabaseConfigurationError = configuration.error;

export async function signInGoogle() {
  if (!supabase)
    throw new Error(
      supabaseConfigurationError ||
        "Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY",
    );
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: authenticationRedirect(), queryParams: { prompt: "select_account" } },
  });
  if (error) throw new Error(authenticationError(error));
}

export async function authProviders() {
  if (!supabase || !url || !key) return { google: false, email: false };
  const response = await fetch(`${url.trim()}/auth/v1/settings`, {
    headers: { apikey: key.trim() },
  });
  if (!response.ok)
    throw new Error("No pudimos comprobar la configuración de acceso.");
  const settings = await response.json();
  return {
    google: settings.external?.google === true,
    email: settings.external?.email === true,
  };
}
export async function signInEmail(email: string) {
  if (isDemoEmail(email)) throw new Error("Este es un correo ficticio. Usa Entrar a la demo; no requiere correo de confirmación.");
  if (!supabase)
    throw new Error("La conexión de MiCole todavía no está configurada.");
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: authenticationRedirect(),
      shouldCreateUser: true,
    },
  });
  if (error) throw new Error(authenticationError(error));
}

export function authenticationRedirect() {
  const token =
    sessionStorage.getItem("micole_invite") ||
    sessionStorage.getItem("aulanexo_invite");
  return token && /^[a-f0-9-]{32,80}$/i.test(token)
    ? `${window.location.origin}/invite/${encodeURIComponent(token)}`
    : `${window.location.origin}/auth/callback`;
}
