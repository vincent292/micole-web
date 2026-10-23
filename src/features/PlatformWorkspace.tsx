import { platformBalance } from "../lib/pricing";
import {TariffSettings} from './Pricing';
import { TestWorkspace, type TestAccount } from "./TestWorkspace";
import { PaymentConnection } from "./PaymentConnection";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Headset,
  Plus,
  ShieldCheck,
  Wallet,
  ClipboardList,
  Settings2,
} from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Field,
  SectionTitle,
  StatCard,
} from "../components/UI";
import { money } from "../lib/format";
import { authProviders, liveMode } from "../lib/supabase";
import { rpc } from "../lib/repository";
import type { SupportAccount, Role } from "../lib/types";
import type { PageProps } from "./Pages";
const names = {
  scheduler: "Secretaría académica", director: "Dirección",
  teacher: "Docente",
  guardian: "Familia",
  student: "Estudiante",
};
export function PlatformOverview({ store, identity, go, open }: PageProps) {
  const data = store.data;
  const pending = data.platformCharges.filter(
    (c) => !["paid", "cancelled"].includes(c.status),
  );
  const requests = data.institutionRequests.filter(
    (r) => r.status === "pending",
  );
  return (
    <>
      <div className="platform-welcome">
        <div>
          <span className="eyebrow">ADMINISTRACIÓN MICOLE</span>
          <h2>Tu plataforma, bajo control.</h2>
          <p>
            Gestiona instituciones, solicitudes y cobros. Abre soporte cuando
            necesites revisar la operación de un colegio.
          </p>
        </div>
        <Button icon={Plus} onClick={() => open("school")}>
          Nueva institución
        </Button>
      </div>
      <div className="stats-grid">
        <StatCard
          label="Instituciones"
          value={data.schools.length}
          icon={Building2}
          tone="blue"
          footer={`${data.schools.filter((s) => s.status === "active").length} activas`}
        />
        <StatCard
          label="Licencias activas"
          value={data.schools.reduce(
            (total, s) =>
              total +
              (s.activeStudentCount ??
                data.students.filter(
                  (st) => st.schoolId === s.id && st.status === "active",
                ).length),
            0,
          )}
          icon={ShieldCheck}
          footer="Conteo agregado por institución"
        />
        <StatCard
          label="Por cobrar · MiCole"
          value={money(pending.reduce((total, c) => total + platformBalance(c), 0))}
          icon={Wallet}
          tone="amber"
          footer={`${pending.length} cargos pendientes`}
        />
        <StatCard
          label="Solicitudes nuevas"
          value={requests.length}
          icon={ClipboardList}
          tone="blue"
          footer="Pendientes de revisión"
        />
      </div>
      <div className="platform-columns">
        <section className="panel">
          <SectionTitle
            title="Instituciones"
            subtitle="Estado comercial de tu red"
            action={
              <button className="text-button" onClick={() => go("schools")}>
                Ver todas <ArrowRight size={16} />
              </button>
            }
          />
          {data.schools.slice(0, 6).map((s) => (
            <div className="list-row" key={s.id}>
              <span className="row-icon">
                <Building2 size={20} />
              </span>
              <div className="grow">
                <b>{s.name}</b>
                <small>
                  {s.city || "Ciudad pendiente"} ·{" "}
                  {s.activeStudentCount ??
                    data.students.filter(
                      (st) => st.schoolId === s.id && st.status === "active",
                    ).length}{" "}
                  licencias activas
                </small>
              </div>
              <Badge status={s.status} />
            </div>
          ))}
          {!data.schools.length && (
            <Empty
              title="Crea tu primera institución"
              subtitle="Después podrás invitar a su directora o abrir el acceso de soporte."
              action={() => open("school")}
            />
          )}
        </section>
        <section className="panel platform-actions">
          <SectionTitle
            title="Acciones de plataforma"
            subtitle="Tu gestión diaria"
          />
          <button onClick={() => go("institutionRequests")}>
            <ClipboardList size={21} />
            <span>
              <b>Revisar solicitudes</b>
              <small>{requests.length} pendientes</small>
            </span>
            <ArrowRight size={16} />
          </button>
          <button onClick={() => go("platform")}>
            <Wallet size={21} />
            <span>
              <b>Facturación MiCole</b>
              <small>Activaciones y licencias mensuales</small>
            </span>
            <ArrowRight size={16} />
          </button>
          {identity.canSupport && (
            <button onClick={() => go("support")}>
              <Headset size={21} />
              <span>
                <b>Probar roles y dar soporte</b>
                <small>Pruebas propias o atención a instituciones</small>
              </span>
              <ArrowRight size={16} />
            </button>
          )}
          <button onClick={() => go("settings")}>
            <Settings2 size={21} />
            <span>
              <b>Revisar integraciones</b>
              <small>Acceso, imágenes y pagos</small>
            </span>
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
    </>
  );
}
export function PlatformSupport(props: Parameters<typeof SupportAccess>[0] & {
 onTest: (schoolId: string, account: TestAccount) => Promise<void>;
}) {
 const [mode,setMode]=useState<"test"|"support">("test");
 if(!props.identity.canSupport)return <Empty title="Acceso reservado" subtitle="Solo el propietario de MiCole puede probar roles." />;
 return <div className="test-access-page">
  <div className="test-mode-tabs" role="group" aria-label="Tipo de acceso">
   <Button variant={mode==='test'?'primary':'secondary'} onClick={()=>setMode('test')}>Pruebas con mi institución</Button>
   <Button variant={mode==='support'?'primary':'secondary'} onClick={()=>setMode('support')}>Soporte a una institución</Button>
  </div>
  {mode==='test'?<TestWorkspace {...props}/>:<SupportAccess {...props}/>}
 </div>;
}
function SupportAccess({
  store,
  identity,
  initialSchoolId,
  onStart,
}: PageProps & {
  initialSchoolId?: string;
  onStart: (
    schoolId: string,
    account: SupportAccount,
    reason: string,
  ) => Promise<void>;
}) {
  const [schoolId, setSchoolId] = useState(
    initialSchoolId || store.data.schools[0]?.id || "",
  );
  const [accounts, setAccounts] = useState<SupportAccount[]>([]);
  const [role, setRole] = useState<Exclude<Role, "superadmin">>("director");
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setAccounts([]);
    setSelected("");
    setError("");
    if (!schoolId || !identity.canSupport) return;
    setLoading(true);
    const local: SupportAccount[] = [
      {
        id: "demo-director",
        name: "Dirección · acceso de soporte",
        email: "",
        role: "director",
      },
      ...store.data.teachers
        .filter((t) => t.schoolId === schoolId && t.status === "active")
        .map((t) => ({
          id: t.userId || `demo-${t.id}`,
          name: t.name,
          email: t.email,
          role: "teacher" as const,
        })),
      ...store.data.students
        .filter((s) => s.schoolId === schoolId)
        .map((s) => ({
          id: s.guardianEmail,
          name: s.guardianName,
          email: s.guardianEmail,
          role: "guardian" as const,
        })),
    ];
    void (
      liveMode
        ? rpc<SupportAccount[]>("support_accounts", { p_school_id: schoolId })
        : Promise.resolve(local)
    )
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "No se pudieron consultar los accesos.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, identity.canSupport]);
  const eligible = accounts.filter((a) => a.role === role);
  const account = eligible.find((a) => a.id === selected) || eligible[0];
  if (!identity.canSupport)
    return (
      <Empty
        title="Acceso reservado"
        subtitle="El soporte está disponible únicamente para el propietario de MiCole."
      />
    );
  return (
    <div className="support-grid">
      <section className="panel">
        <SectionTitle
          title="Abrir acceso de soporte"
          subtitle="Revisa un caso con los permisos del rol seleccionado."
        />
        <form
          className="support-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!account || busy) return;
            setBusy(true);
            setError("");
            try {
              await onStart(schoolId, account, reason);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "No se pudo abrir soporte.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Institución" name="support-school">
            <select
              required
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value)}
            >
              <option value="" disabled>
                Seleccionar colegio
              </option>
              {store.data.schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rol para revisar" name="support-role">
            <select
              value={role}
              onChange={(e) => {
                setRole(e.target.value as typeof role);
                setSelected("");
              }}
            >
              <option value="director">Dirección</option>
              <option value="teacher">Docente</option>
              <option value="guardian">Familia</option>
              <option value="student">Estudiante</option>
            </select>
          </Field>
          <Field label="Usuario o acceso" name="support-account">
            <select
              required
              value={account?.id || ""}
              disabled={loading || !eligible.length}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="" disabled>
                {loading ? "Consultando accesos…" : "Sin usuarios vinculados"}
              </option>
              {eligible.map((a, i) => (
                <option key={`${a.id}-${i}`} value={a.id}>
                  {a.name}
                  {a.email ? ` · ${a.email}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {!loading && !eligible.length && (
            <p className="soft-note">
              Para revisar {names[role].toLowerCase()}, primero debe haber una
              cuenta que haya aceptado su invitación. Puedes preparar el colegio
              desde Dirección.
            </p>
          )}
          <Field label="Motivo de soporte" name="support-reason">
            <textarea
              required
              minLength={10}
              maxLength={500}
              rows={3}
              placeholder="Ej.: revisar una inscripción o un acceso bloqueado"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            icon={Headset}
            disabled={busy || loading || !account || reason.trim().length < 10}
          >
            {busy ? "Abriendo soporte…" : `Entrar como ${names[role]}`}
          </Button>
        </form>
      </section>
      <aside className="panel support-explanation">
        <span className="row-icon">
          <ShieldCheck size={24} />
        </span>
        <h3>Un contexto a la vez</h3>
        <p>
          El acceso termina en 30 minutos. Una barra visible te permitirá volver
          a tu panel de plataforma.
        </p>
        <p>
          Docentes ven sus aulas; familias ven sus hijos y mantienen las
          restricciones por deuda o ficha incompleta.
        </p>
        <p>
          Los cambios se guardan en el colegio y la auditoría identifica tu
          cuenta, el rol atendido y la sesión de soporte.
        </p>
        <p>
          Dirección incluye un acceso de soporte para preparar un colegio nuevo
          sin asignarte permanentemente ese rol.
        </p>
      </aside>
    </div>
  );
}
export function PlatformSettings({schools}:{schools:PageProps["store"]["data"]["schools"]}) {
  const [providers, setProviders] = useState<{
    google: boolean;
    email: boolean;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void authProviders()
      .then((p) => {
        if (active) setProviders(p);
      })
      .catch(() => {
        if (active) setError("No se pudo consultar el estado del acceso.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <TariffSettings schools={schools}/>
      <PaymentConnection />
      <SectionTitle
        title="Integraciones de MiCole"
        subtitle="Estado de las conexiones que utiliza la plataforma."
      />
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      <div className="card-grid integrations-grid">
        {[
          [
            "Google",
            providers
              ? providers.google
                ? "Habilitado"
                : "Por configurar"
              : "Consultando…",
            "Acceso con la cuenta de Google. Se configura en Supabase con las credenciales de Google Cloud.",
          ],
          [
            "Enlace por correo",
            providers
              ? providers.email
                ? "Habilitado"
                : "Deshabilitado"
              : "Consultando…",
            "Para enviar invitaciones y accesos a familias externas, comprueba la entrega y configura SMTP.",
          ],
          [
            "Imágenes · Cloudflare R2",
            import.meta.env.VITE_R2_ENABLED === "true"
              ? "Habilitado en la app"
              : "Por configurar",
            "Requiere bucket privado, credenciales y servicio de imágenes desplegado.",
          ],
          [
            "QR bancario",
            "Baneco integrado",
            "Configura y comprueba la cuenta de MiCole arriba. Cada institución administra su propia conexión Baneco.",
          ],
        ].map(([title, state, description]) => (
          <article key={title} className="entity-card">
            <span className="integration-state">{state}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
      <p className="soft-note">
        El logo y la información de cada colegio se editan en Instituciones. Las
        credenciales privadas se configuran en el servidor.
      </p>
    </>
  );
}
