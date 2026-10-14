import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Brand } from "../../components/Brand";
import { Badge, Button, Field } from "../../components/UI";
import {
  liveMode,
  signInGoogle,
  supabase,
  supabaseConfigurationError,
  authProviders,
  signInEmail,
} from "../../lib/supabase";
import type { useIdentity } from "../../lib/auth";
import type { AppStore } from "../../lib/store";
export function AuthPage({
  auth,
  store,
}: {
  auth: ReturnType<typeof useIdentity>;
  store: AppStore;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [email, setEmail] = useState(""),
    [sent, setSent] = useState(false);
  const [providers, setProviders] = useState({ google: false, email: false }),
    [checking, setChecking] = useState(liveMode);
  const invitation = location.pathname.startsWith("/invite/");
  const intent =
    new URLSearchParams(location.search).get("intent") === "school";
  useEffect(() => {
    let active = true;
    if (!liveMode) return;
    void authProviders()
      .then((value) => {
        if (active) setProviders(value);
      })
      .catch(() => {
        if (active)
          setNotice(
            "No pudimos comprobar los métodos de acceso. Revisa la conexión e inténtalo de nuevo.",
          );
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const rememberInvitation = () => {
    if (invitation)
      sessionStorage.setItem("micole_invite", location.pathname.split("/")[2]);
    else {
      sessionStorage.removeItem("micole_invite");
      sessionStorage.removeItem("aulanexo_invite");
    }
  };
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Brand />
        <div>
          <span className="landing-eyebrow">TU COMUNIDAD TE ESPERA</span>
          <h1>
            Un solo acceso.
            <br />
            <span>Todo tu cole, cerca.</span>
          </h1>
          <p>
            Para dirigir con tranquilidad, enseñar con tiempo y acompañar cada
            pequeño paso.
          </p>
          <div className="auth-community">
            <span>
              <GraduationCap size={22} /> Dirección
            </span>
            <span>
              <ShieldCheck size={22} /> Maestras
            </span>
            <span>
              <Mail size={22} /> Familias
            </span>
          </div>
        </div>
        <small>
          MiCole · Todo lo importante del colegio, en un solo lugar.
        </small>
      </section>
      <section className="auth-main">
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} /> Volver a MiCole
        </Link>
        <div className="auth-card">
          <span className="auth-icon">
            <LockKeyhole size={26} />
          </span>
          <h2>
            {auth.signedIn && auth.identity && !auth.identity.roles.length
              ? "Conectemos tu institución"
              : invitation
                ? "Tu colegio te invita"
                : "Bienvenido a MiCole"}
          </h2>
          <p>
            {invitation
              ? "Ingresa con el correo al que tu institución envió la invitación."
              : intent
                ? "Ingresa para solicitar acceso para tu institución."
                : "Accede con el correo que tu colegio tiene vinculado a tu cuenta."}
          </p>
          {(auth.error || notice || supabaseConfigurationError) && (
            <div className="message error" role="alert">
              {auth.error || notice || supabaseConfigurationError}
            </div>
          )}
          {!liveMode ? (
            <>
              <div className="message info">
                Estás en el entorno de ejemplo. Los cambios se guardan
                únicamente en este navegador.
              </div>
              <Link to="/app/overview" className="btn btn-primary full">
                Abrir espacio de prueba <ArrowRight size={17} />
              </Link>
            </>
          ) : auth.signedIn ? (
            <>
              {auth.identity && !auth.error ? (
                <InstitutionOnboarding auth={auth} store={store} />
              ) : (
                <>
                  <Button
                    className="full"
                    onClick={() => {
                      void auth.refresh();
                    }}
                  >
                    Verificar acceso
                  </Button>
                  <p className="auth-hint">
                    Si la invitación corresponde a otra cuenta, ingresa con ese
                    correo.
                  </p>
                </>
              )}
              <Button
                variant="ghost"
                className="full"
                icon={Mail}
                onClick={() => {
                  void supabase?.auth.signOut();
                }}
              >
                Usar otra cuenta
              </Button>
            </>
          ) : (
            <>
              {checking ? (
                <div className="auth-check">
                  <LoaderCircle className="spin" size={19} /> Comprobando
                  métodos de acceso…
                </div>
              ) : (
                <>
                  {providers.google && (
                    <Button
                      className="full google-button"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        setNotice("");
                        try {
                          rememberInvitation();
                          await signInGoogle();
                        } catch (e) {
                          setNotice(
                            e instanceof Error
                              ? e.message
                              : "No pudimos iniciar sesión.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <span className="google-mark">G</span> Continuar con
                      Google
                    </Button>
                  )}
                  {providers.google && providers.email && (
                    <div className="auth-separator">
                      <span>o con tu correo</span>
                    </div>
                  )}
                  {providers.email &&
                    (sent ? (
                      <div className="email-sent">
                        <CheckCircle2 size={35} />
                        <h3>Revisa tu correo</h3>
                        <p>
                          Enviamos un enlace de acceso a <b>{email}</b>. Ábrelo
                          para continuar con tu cuenta.
                        </p>
                        <small>
                          Si no lo encuentras, revisa la carpeta de spam. El
                          enlace es personal y de un solo uso.
                        </small>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setSent(false);
                            setNotice("");
                          }}
                        >
                          Usar otro correo
                        </Button>
                      </div>
                    ) : (
                      <form
                        className="auth-email-form"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (busy) return;
                          setBusy(true);
                          setNotice("");
                          try {
                            rememberInvitation();
                            await signInEmail(email);
                            setSent(true);
                          } catch (e) {
                            setNotice(
                              e instanceof Error
                                ? e.message
                                : "No pudimos enviar el enlace.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <Field label="Tu correo" name="email">
                          <input
                            required
                            type="email"
                            autoComplete="email"
                            placeholder="nombre@correo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </Field>
                        <Button
                          type="submit"
                          className="full"
                          icon={busy ? LoaderCircle : Mail}
                          disabled={busy || !supabase}
                        >
                          {busy
                            ? "Enviando enlace…"
                            : "Enviar enlace de acceso"}
                        </Button>
                      </form>
                    ))}
                  {!providers.google && providers.email && (
                    <p className="auth-hint">
                      Por ahora puedes ingresar con tu correo. Google estará
                      disponible cuando se habilite para MiCole.
                    </p>
                  )}
                  {!providers.google && !providers.email && (
                    <div className="message warn">
                      No hay un método de ingreso disponible. Configura Google o
                      el acceso por correo en Supabase Authentication.
                    </div>
                  )}
                </>
              )}
            </>
          )}
          <div className="auth-security">
            <ShieldCheck size={16} />
            <span>
              Tu colegio administra los accesos. Cada cuenta tiene su propio
              espacio.
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}
function InstitutionOnboarding({
  auth,
  store,
}: {
  auth: ReturnType<typeof useIdentity>;
  store: AppStore;
}) {
  const identity = auth.identity!;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = store.data.institutionRequests
    .filter((r) => r.userId === identity.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (store.loading)
    return (
      <p className="auth-check">
        <LoaderCircle size={18} className="spin" /> Cargando tu solicitud…
      </p>
    );
  if (store.error)
    return (
      <div className="message error" role="alert">
        No pudimos cargar tu espacio.{" "}
        <Button
          variant="ghost"
          onClick={() => {
            void store.refresh();
          }}
        >
          Reintentar
        </Button>
      </div>
    );
  return (
    <div className="institution-onboarding">
      <div className="account-chip">
        <CheckCircle2 size={17} />
        {identity.email}
      </div>
      {request?.status === "pending" || request?.status === "approved" ? (
        <div className="request-status">
          <Badge status={request.status} />
          <h3>{request.schoolName}</h3>
          <p>
            {request.status === "approved"
              ? "Tu institución ya tiene acceso. Verifica tu cuenta para entrar a tu espacio."
              : "Recibimos tu solicitud. La plataforma revisará los datos de tu institución y habilitará el acceso de dirección."}
          </p>
          {request.response && <p>{request.response}</p>}
          <Button
            className="full"
            onClick={async () => {
              await store.refresh();
              await auth.refresh();
            }}
          >
            {request.status === "approved"
              ? "Entrar a mi institución"
              : "Consultar estado"}
          </Button>
        </div>
      ) : (
        <>
          <p className="auth-hint">
            Si eres familiar o docente, abre el enlace de invitación que te
            compartió tu colegio. Si diriges una institución, puedes solicitar
            su incorporación aquí.
          </p>
          {request?.status === "rejected" && (
            <div className="message warn">
              {request.response ||
                "Tu solicitud fue revisada. Puedes enviar los datos corregidos."}
            </div>
          )}
          <form
            className="onboarding-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (busy) return;
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await store.requestInstitution(
                  {
                    schoolName: String(f.get("schoolName")).trim(),
                    city: String(f.get("city")).trim(),
                    contactName: String(f.get("contactName")).trim(),
                    phone: String(f.get("phone")).trim(),
                    message: String(f.get("message") || "").trim(),
                  },
                  identity,
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "No pudimos guardar la solicitud.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              name="schoolName"
              label="Nombre de la institución"
              required
            />
            <div className="form-grid">
              <Field name="city" label="Ciudad" required />
              <Field
                name="phone"
                label="Teléfono de contacto"
                required
                type="tel"
                min={6}
              />
            </div>
            <Field
              name="contactName"
              label="Nombre de la directora o responsable"
              required
              defaultValue={identity.name.includes("@") ? "" : identity.name}
            />
            <Field name="message" label="Cuéntanos sobre tu institución">
              <textarea
                name="message"
                rows={3}
                maxLength={2000}
                placeholder="Niveles, cantidad aproximada de alumnos…"
              />
            </Field>
            {error && (
              <div className="message error" role="alert">
                {error}
              </div>
            )}
            <Button
              type="submit"
              className="full"
              icon={busy ? LoaderCircle : ArrowRight}
              disabled={busy || store.busy}
            >
              {busy ? "Guardando…" : "Solicitar incorporación"}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}
