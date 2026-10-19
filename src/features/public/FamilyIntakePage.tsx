import { publicDemo } from "../../lib/demo-config";
import { demoDataKey } from "../../lib/demo";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Brand } from "../../components/Brand";
import { Button } from "../../components/UI";
import { CareFields, readCareProfile } from "../../components/CareFields";
import { liveMode } from "../../lib/supabase";
import type { AppData, CareProfile } from "../../lib/types";
interface Context {
  schoolName: string;
  logoUrl?: string;
  childName: string;
  recipient: "mother" | "father";
  status: string;
  expiresAt: string;
}
const localKey = publicDemo ? demoDataKey : "aulanexo_demo_v2";
let anonymous: SupabaseClient | null = null;
async function publicCall<T>(name: string, params: object): Promise<T> {
  if (!anonymous)
    anonymous = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: "micole-public-intake",
        },
      },
    );
  const { data, error } = await anonymous.rpc(name, params);
  if (error) throw new Error(error.message);
  return data as T;
}
function localContext(token: string): {
  context: Context;
  data: AppData;
  id: string;
} {
  const data = JSON.parse(localStorage.getItem(localKey) || "{}") as AppData;
  const form = data.familyIntakes?.find((f) => f.token === token);
  const child = data.students?.find((s) => s.id === form?.studentId);
  const school = data.schools?.find((s) => s.id === form?.schoolId);
  if (
    !form ||
    !child ||
    !school ||
    form.status === "revoked" ||
    new Date(form.expiresAt).getTime() <= Date.now() ||
    school.status !== "active" ||
    child.status === "inactive"
  )
    throw new Error(
      "Este enlace venció o fue reemplazado. Solicita otro a Dirección.",
    );
  return {
    id: form.id,
    data,
    context: {
      schoolName: school.name,
      logoUrl: school.logoUrl,
      childName: child.firstName,
      recipient: form.recipient,
      status: form.status,
      expiresAt: form.expiresAt,
    },
  };
}
export function FamilyIntakePage() {
  const token = useLocation().pathname.split("/")[2] || "";
  const [context, setContext] = useState<Context | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    setContext(null);
    setDone(false);
    void (
      liveMode
        ? publicCall<Context>("family_intake_context", { p_token: token })
        : Promise.resolve().then(() => localContext(token).context)
    )
      .then((next) => {
        if (active) {
          setContext(next);
          setDone(["submitted", "approved"].includes(next.status));
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "No se pudo abrir la ficha.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);
  const submit = async (profile: CareProfile) => {
    if (liveMode)
      await publicCall("submit_family_intake", {
        p_token: token,
        p_profile: profile,
      });
    else {
      const { data, id, context: current } = localContext(token);
      if (current.status === "open") {
        data.familyIntakes = data.familyIntakes.map((f) =>
          f.id === id
            ? {
                ...f,
                profile,
                status: "submitted",
                submittedAt: new Date().toISOString(),
              }
            : f,
        );
        localStorage.setItem(localKey, JSON.stringify(data));
      }
    }
  };
  return (
    <main className="intake-page">
      <header className="intake-header">
        <Brand />
        <span>
          <ShieldCheck size={16} /> Ficha de inscripción
        </span>
      </header>
      <div className="intake-container">
        {loading ? (
          <section className="panel">
            <p>Preparando la ficha…</p>
          </section>
        ) : !context ? (
          <section className="panel intake-complete">
            <h1>La ficha no está disponible</h1>
            <p role="alert">{error}</p>
            <p>Contacta a Dirección para recibir un nuevo enlace.</p>
          </section>
        ) : done ? (
          <section className="panel intake-complete">
            <CheckCircle2 size={42} />
            <h1>Ficha recibida</h1>
            <p>
              Dirección de {context.schoolName} revisará los datos de cuidado.
              Si necesitas corregir algo, comunícate con el colegio.
            </p>
            <p>
              El acceso a MiCole corresponde a los correos de madre y padre
              registrados por Dirección.
            </p>
            <Link className="btn btn-secondary" to="/login">
              Ingresar a MiCole
            </Link>
          </section>
        ) : (
          <>
            <section className="intake-heading">
              {context.logoUrl && (
                <img src={context.logoUrl} alt={context.schoolName} />
              )}
              <div>
                <span className="eyebrow">{context.schoolName}</span>
                <h1>Ayúdanos a cuidar a {context.childName}</h1>
                <p>
                  Completa la información de salud y emergencia para su
                  inscripción. Puedes hacerlo ahora desde tu celular.
                </p>
              </div>
            </section>
            <section className="panel">
              <form
                className="intake-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (busy) return;
                  const profile = readCareProfile(e.currentTarget);
                  setBusy(true);
                  setError("");
                  try {
                    await submit(profile);
                    setDone(true);
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "No se pudo enviar. Tus datos siguen en el formulario.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <fieldset disabled={busy}>
                  <CareFields />
                  <label className="intake-confirmation">
                    <input type="checkbox" required /> Confirmo que revisé los
                    datos y que están completos.
                  </label>
                  {error && (
                    <p className="message error" role="alert">
                      {error}
                    </p>
                  )}
                  <Button type="submit" disabled={busy}>
                    {busy ? "Enviando ficha…" : "Enviar ficha a Dirección"}
                  </Button>
                  <p className="muted care-note">
                    Este formulario completa la inscripción. Dirección mantiene
                    el control del curso, los responsables autorizados y los
                    pagos.
                  </p>
                </fieldset>
              </form>
            </section>
          </>
        )}
        {!liveMode && (
          <p className="soft-note">
            Datos de prueba guardados en este navegador.
          </p>
        )}
      </div>
      <footer className="intake-footer">MiCole · Cerca en cada paso</footer>
    </main>
  );
}
