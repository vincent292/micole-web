import { ownerPaymentAccess } from "../lib/support-access";
import { useEffect, useState } from "react";
import { BookOpen, CalendarDays, Megaphone, ShieldCheck } from "lucide-react";
import { Button, Empty, Field, Modal, SectionTitle, StatCard } from "../components/UI";
import { dateLabel } from "../lib/format";
import { today } from "../lib/billing";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import type { StudentLoginAccount } from "../lib/types";
import type { PageProps } from "./Pages";

export function StudentLoginModal({
  id, students, role, onClose,
}: PageProps & { id?: string; onClose: () => void }) {
  const child = students.find(s => s.id === id);
  const [account, setAccount] = useState<StudentLoginAccount>({
    studentId: id || "", email: "", enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    if (!id) return;
    async function load() {
      if (liveMode) return rpc<StudentLoginAccount>("student_login_account", { p_student_id: id });
      const local = localStorage.getItem(`micole_demo_student_login_${id}`);
      return local ? JSON.parse(local) as StudentLoginAccount : { studentId: id!, email: "", enabled: false };
    }
    void load()
      .then(value => {
        if (active) { setAccount(value); setError(""); setLoaded(true); }
      })
      .catch(e => {
        if (active) setError(e instanceof Error ? e.message : "No pudimos consultar el acceso.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (!child || role !== "director") return null;
  return (
    <Modal
      title="Acceso del estudiante"
      subtitle={`${child.firstName} ${child.lastName}`}
      onClose={onClose}
      submitLabel="Guardar acceso"
      busy={busy}
      submitDisabled={loading || !loaded}
      error={error}
      onSubmit={async event => {
        event.preventDefault();
        if (busy || !loaded) return;
        setBusy(true); setError(""); setSaved(false);
        try {
          if (liveMode) {
            await rpc("set_student_login", {
              p_student_id: child.id, p_email: account.email, p_enabled: account.enabled,
            });
          } else {
            localStorage.setItem(`micole_demo_student_login_${child.id}`, JSON.stringify(account));
          }
          setSaved(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : "No se pudo guardar el acceso.");
        } finally {
          setBusy(false);
        }
      }}
    >
      {loading ? <p role="status">Consultando acceso…</p> : loaded && (
        <>
          <p>
            Este acceso es opcional. El estudiante consulta sus tareas, agenda,
            materiales y comunicados del curso. Dirección puede revocarlo en
            cualquier momento.
          </p>
          <label className="check-field">
            <input
              type="checkbox" checked={account.enabled} disabled={busy}
              onChange={e => {
                setAccount({ ...account, enabled: e.target.checked }); setSaved(false);
              }}
            /> Habilitar acceso de estudiante
          </label>
          <Field label="Correo propio del estudiante" name="student-login-email">
            <input
              id="student-login-email" name="student-login-email" type="email"
              autoComplete="off" maxLength={254} required={account.enabled}
              disabled={busy || !account.enabled} value={account.email}
              onChange={e => {
                setAccount({ ...account, email: e.target.value }); setSaved(false);
              }}
            />
          </Field>
          <p className="muted">
            Usa un correo distinto al de los padres y personal. El estudiante
            ingresará con Google o el enlace enviado a este correo.
          </p>
          <div className="soft-note">
            <ShieldCheck size={18} /> Las mensualidades y los datos de salud se
            administran desde la cuenta familiar. El estudiante no puede publicar
            ni modificar publicaciones del colegio. Puede entregar sus propias tareas y consultar su revisión.
          </div>
          {saved && (
            <div className="message info" role="status">
              {account.enabled
                ? "Acceso habilitado. El estudiante ya puede ingresar en /login con su correo verificado."
                : "Acceso del estudiante deshabilitado."}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export function StudentOverview({ store, student, school, go, identity }: PageProps) {
  const data = store.data;
  const allowed = ownerPaymentAccess(identity, school?.id) || data.studentPortalAccess?.allowed !== false;
  const upcoming = data.events
    .filter(e => e.schoolId === school?.id &&
      (!e.classroomId || e.classroomId === student?.classroomId) && e.date >= today())
    .sort((a,b) => a.date.localeCompare(b.date));
  const tasks = data.dailyEntries.filter(e => e.studentId === student?.id && e.category === "tarea");
  const announcements = data.announcements.filter(a => a.schoolId === school?.id &&
    a.audience !== "staff" && (!a.classroomId || a.classroomId === student?.classroomId));
  return (
    <>
      <section className="panel student-welcome">
        <span className="row-icon"><BookOpen size={25} /></span>
        <div>
          <h2>Hola, {student?.firstName || "estudiante"}</h2>
          <p>Tu espacio para consultar novedades y entregar tus tareas.</p>
        </div>
        <span className="course-tag">Mi aprendizaje</span>
      </section>
      {allowed ? (
        <>
          <div className="stats-grid">
            <StatCard label="Tareas del cuaderno" value={tasks.length} icon={BookOpen} tone="blue" />
            <StatCard label="Próximas actividades" value={upcoming.length} icon={CalendarDays} tone="purple" />
            <StatCard label="Comunicados" value={announcements.length} icon={Megaphone} tone="mint" />
          </div>
          <section className="panel">
            <SectionTitle title="Lo que viene" subtitle="Actividades y tareas de tu curso."
              action={<><Button variant="secondary" onClick={() => go("assignments")}>Tareas y entregas</Button><Button variant="ghost" onClick={() => go("calendar")}>Ver agenda</Button></>}
            />
            {upcoming.slice(0,5).map(event => (
              <article className="calendar-row" key={event.id}>
                <span className="row-icon"><CalendarDays size={20} /></span>
                <div>
                  <b>{event.title}</b><p>{event.description}</p>
                  <small>{dateLabel(event.date)}</small>
                </div>
              </article>
            ))}
            {!upcoming.length && <Empty title="Sin actividades próximas"
              subtitle="Las nuevas publicaciones de tu docente aparecerán aquí." />}
          </section>
          <div className="student-shortcuts">
            <Button onClick={() => go("journal")}>Ver mis tareas</Button>
            <Button variant="secondary" onClick={() => go("announcements")}>Leer comunicados</Button>
          </div>
        </>
      ) : (
        <section className="panel">
          <Empty title="Tu espacio está en pausa"
            subtitle="Tu familia y Dirección pueden revisar lo necesario para habilitarlo." />
        </section>
      )}
    </>
  );
}
