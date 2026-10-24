import { useState } from "react";
import { RefreshCw, Send } from "lucide-react";
import {
  Button,
  Empty,
  Field,
  Modal,
  SearchBox,
  SectionTitle,
} from "../components/UI";
import { AlertIcon } from "./Announcements";
import type { PageProps } from "./Pages";
import { rpc } from "../lib/repository";
import { uid } from "../lib/format";
import { liveMode } from "../lib/supabase";
import {
  notificationTestTemplates,
  notificationTestStatus,
  type NotificationTestRun,
} from "../lib/notificationTests";
import { useNotificationTests } from "../lib/useNotificationTests";
import "../styles/notification-tests.css";
const stamp = (s?: string) =>
  s
    ? new Date(s).toLocaleString("es-BO", { timeZone: "America/La_Paz" })
    : "Pendiente";
export function NotificationTests(p: PageProps) {
  if (!liveMode)
    return (
      <Empty
        title="Pruebas de notificaciones"
        subtitle="Ingresa con tu cuenta de superadmin en la plataforma conectada para probar tus teléfonos."
      />
    );
  return <ConnectedTests {...p} />;
}
function ConnectedTests({ store, identity }: PageProps) {
  const {
    data,
    error: loadError,
    loading,
    refresh,
  } = useNotificationTests(store.data.notifications);
  const [chosen, setChosen] = useState("general"),
    [group, setGroup] = useState(""),
    [search, setSearch] = useState(""),
    [channel, setChannel] = useState<"web" | "both">("web"),
    [device, setDevice] = useState(""),
    [request, setRequest] = useState<string>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [active, setActive] = useState<NotificationTestRun>();
  const template = notificationTestTemplates.find((t) => t.key === chosen)!,
    devices = data?.devices || [],
    runs = data?.runs || [],
    view = runs.find((r) => r.id === active?.id) || active;
  async function send() {
    if (!request || busy) return;
    setBusy(true);
    setError("");
    try {
      await rpc("create_notification_test", {
        p_template: template.key,
        p_channel: channel,
        p_device_id: channel === "both" ? device : null,
        p_request_id: request,
      });
      setRequest(undefined);
      setNotice(
        channel === "both"
          ? "Prueba creada en tu campanita y encolada para el teléfono seleccionado. El envío puede tardar alrededor de un minuto."
          : "Prueba creada solo en tu campanita.",
      );
      await store.refresh();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRun(run: NotificationTestRun) {
    setActive(run);
    setError("");
    try {
      await store.readNotification(run.id);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <SectionTitle
        title="Elige y comprueba tus avisos"
        subtitle="Comprueba cada tipo de aviso en tu cuenta y tus propios teléfonos."
        action={
          <Button
            variant="secondary"
            icon={RefreshCw}
            disabled={loading || busy}
            onClick={refresh}
          >
            Actualizar estado
          </Button>
        }
      />
      <div className="lab-safety">
        <b>Destinatario: {identity.email}</b>
        <p>
          Todos los avisos llevan [PRUEBA]. Se crean avisos ficticios en tu
          cuenta; no se registran alumnos, emergencias, cobros ni comunicados
          reales. No se envía nada a familias o docentes.
        </p>
      </div>
      {(error || loadError) && !request && !active && (
        <p className="message error" role="alert">
          {error || loadError}
        </p>
      )}
      {notice && (
        <p className="message success" role="status">
          {notice}
        </p>
      )}
      <div className="lab-layout">
        <section className="panel lab-panel">
          <h3>1. Elige el aviso</h3>
          <SearchBox
            value={search}
            onChange={setSearch}
            placeholder="Buscar tipo de aviso"
          />
          <Field label="Grupo" name="testGroup">
            <select
              name="testGroup"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">Todos los grupos</option>
              {[...new Set(notificationTestTemplates.map((t) => t.group))].map(
                (g) => (
                  <option key={g}>{g}</option>
                ),
              )}
            </select>
          </Field>
          <div
            className="lab-catalog"
            role="group"
            aria-label="Tipos de aviso de prueba"
          >
            {notificationTestTemplates
              .filter(
                (t) =>
                  (!group || t.group === group) &&
                  t.label
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
              )
              .map((t) => (
                <button
                  type="button"
                  key={t.key}
                  aria-pressed={chosen === t.key}
                  onClick={() => {
                    setChosen(t.key);
                    setError("");
                  }}
                >
                  <AlertIcon
                    notice={{ kind: "push_test", alertType: t.alertType }}
                  />
                  <span>
                    {t.label}
                    <small>{t.group}</small>
                  </span>
                </button>
              ))}
          </div>
        </section>
        <section className="panel lab-panel">
          <h3>2. Revisa y envía a tu cuenta</h3>
          <article className="lab-preview">
            <AlertIcon
              notice={{ kind: "push_test", alertType: template.alertType }}
            />
            <div>
              <b>[PRUEBA] {template.label}</b>
              <p>{template.body}</p>
              {template.requiresAcknowledgment && (
                <small>
                  Podrás probar «He leído» al abrirla desde este panel.
                </small>
              )}
            </div>
          </article>
          <Field label="Dónde probar" name="testChannel">
            <select
              name="testChannel"
              value={channel}
              onChange={(e) => {
                setChannel(e.target.value as "web" | "both");
                setError("");
              }}
            >
              <option value="web">Solo campanita</option>
              <option value="both">Campanita + mi teléfono Android</option>
            </select>
          </Field>
          {channel === "both" && (
            <>
              <Field label="Mi teléfono" name="testDevice">
                <select
                  name="testDevice"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  required
                >
                  <option value="">Selecciona tu dispositivo</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.label} · activo {stamp(d.updatedAt)}
                    </option>
                  ))}
                </select>
              </Field>
              {!devices.length && (
                <p className="message warn">
                  No hay teléfonos activos en tu cuenta. Inicia sesión en la APK
                  con tu correo de superadmin y activa notificaciones en
                  Configuración.
                </p>
              )}
              <p className="muted">
                El aviso usa su canal, icono y sonido existentes. Android puede
                silenciarlo según los permisos, volumen y modo No molestar. El
                envío es inmediato en la cola incluso de noche porque lo
                solicitas tú; no genera recordatorios automáticos.
              </p>
            </>
          )}
          <Button
            icon={Send}
            disabled={
              loading ||
              !!loadError ||
              busy ||
              (channel === "both" && !devices.some((d) => d.id === device))
            }
            onClick={() => {
              setError("");
              setRequest(uid());
            }}
          >
            Revisar envío de prueba
          </Button>
          <p className="muted">
            Sin suscripciones ni cobros. Máximo 60 pruebas por hora. No envía
            correos ni SMS.
          </p>
        </section>
      </div>
      <section className="panel lab-panel">
        <SectionTitle
          title="Historial de mis pruebas"
          subtitle="La aceptación de Firebase no confirma que Android haya mostrado el aviso ni que lo hayas leído."
        />
        {loading && !data ? (
          <p>Cargando dispositivos y pruebas…</p>
        ) : !runs.length ? (
          <Empty
            title="Aún no realizaste pruebas"
            subtitle="Elige un aviso y comienza con Solo campanita."
          />
        ) : (
          runs.map((r) => (
            <article className="lab-history" key={r.id}>
              <AlertIcon
                notice={{ kind: "push_test", alertType: r.alertType }}
              />
              <div>
                <b>{r.title}</b>
                <small>
                  {stamp(r.createdAt)} · {notificationTestStatus[r.status]}
                </small>
                <small>
                  Lectura: {stamp(r.readAt)}
                  {r.requiresAcknowledgment
                    ? ` · Acuerdo: ${stamp(r.acknowledgedAt)}`
                    : ""}
                </small>
                {r.error && <small className="error">{r.error}</small>}
              </div>
              <Button variant="secondary" onClick={() => void openRun(r)}>
                Abrir prueba
              </Button>
            </article>
          ))
        )}
      </section>
      {request && (
        <Modal
          title="Enviar aviso de prueba"
          onClose={() => setRequest(undefined)}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          submitLabel="Enviar prueba"
          busy={busy}
          error={error}
        >
          <article className="lab-preview">
            <AlertIcon
              notice={{ kind: "push_test", alertType: template.alertType }}
            />
            <div>
              <b>[PRUEBA] {template.label}</b>
              <p>{template.body}</p>
            </div>
          </article>
          <p>
            Solo para <b>{identity.email}</b>.
          </p>
          <p>
            {channel === "web"
              ? "Aparecerá en tu campanita. No se enviará al teléfono."
              : `Aparecerá en tu campanita y se enviará a ${devices.find((d) => d.id === device)?.label || "tu teléfono seleccionado"}.`}
          </p>
          <p>
            No afecta datos reales. Si se interrumpe la conexión, puedes
            reintentar este envío sin duplicarlo.
          </p>
        </Modal>
      )}
      {view && (
        <Modal
          title={view.title}
          onClose={() => setActive(undefined)}
          busy={busy}
          error={error}
          submitLabel={
            view.requiresAcknowledgment && !view.acknowledgedAt
              ? "He leído (prueba)"
              : "Cerrar"
          }
          onSubmit={async (e) => {
            e.preventDefault();
            if (view.requiresAcknowledgment && !view.acknowledgedAt) {
              setBusy(true);
              setError("");
              try {
                await rpc("acknowledge_notification_test", { p_id: view.id });
                setNotice(
                  "Acuerdo de prueba registrado. No corresponde a ningún comunicado real.",
                );
                setActive(undefined);
                await store.refresh();
                refresh();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            } else setActive(undefined);
          }}
        >
          <div className="lab-preview">
            <AlertIcon
              notice={{ kind: "push_test", alertType: view.alertType }}
            />
            <p>{view.body}</p>
          </div>
          {view.requiresAcknowledgment && !view.acknowledgedAt && (
            <Field label="He leído este aviso ficticio" name="testRead">
              <input type="checkbox" required />
            </Field>
          )}
          {view.acknowledgedAt && (
            <p>Acuerdo de prueba registrado: {stamp(view.acknowledgedAt)}</p>
          )}
        </Modal>
      )}
    </>
  );
}
