import { useState } from "react";
import { CheckCircle2, Clock, Search, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  SectionTitle,
} from "../components/UI";
import { dateLabel } from "../lib/format";
import type { PageProps } from "./Pages";
import type { InstitutionRequest } from "../lib/types";
export function PlatformOperations({
  page,
  store,
  school,
  role,
  act,
}: PageProps & { page: string }) {
  const [review, setReview] = useState<InstitutionRequest | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("");
  if (page === "audit") {
    const names: Record<string, string> = {
      schools: "Institución",
      students: "Estudiante",
      teachers: "Docente",
      school_charges: "Cobro escolar",
      platform_charges: "Cobro de plataforma",
      invitations: "Invitación",
      institution_requests: "Solicitud de colegio",
      support_sessions: "Acceso de soporte",
      family_intake_forms: "Ficha familiar",
      student_documents: "Documento de inscripción",
      classrooms: "Aula",
      teacher_classrooms: "Asignación docente",
      daily_entries: "Cuaderno",
      announcements: "Comunicado",
      calendar_events: "Agenda",
      messages: "Mensaje",
      grades: "Nota",
      family_requests: "Permiso o recogida",
      media_assets: "Imagen",
      payment_plans: "Plan de pagos",
    };
    const events = store.data.auditEvents.filter(
      (e) =>
        (role === "superadmin" || e.schoolId === school?.id) &&
        `${e.actorName} ${e.summary.name || ""} ${names[e.entity]}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
    );
    return (
      <>
        <SectionTitle
          title="Cada cambio tiene su historia"
          subtitle="Altas, modificaciones y estados de cobros registrados por el servidor."
        />
        <label className="search-box">
          <Search size={18} />
          <input
            placeholder="Buscar por persona o registro…"
            aria-label="Buscar en el historial"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <section className="panel table-panel audit-panel">
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>PERSONA</th>
                  <th>REGISTRO</th>
                  <th>CAMBIO</th>
                  <th>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td>
                      {dateLabel(e.createdAt)}
                      <small className="cell-note">
                        {new Date(e.createdAt).toLocaleTimeString("es-BO", {
                          timeZone: "America/La_Paz",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </small>
                    </td>
                    <td>
                      {e.actorName}
                      {(e.summary.supportRole || e.summary.role) && (
                        <small className="cell-note">
                          Soporte ·{" "}
                          {(
                            {
                              director: "Dirección",
                              teacher: "Docente",
                              guardian: "Familia",
                            } as Record<string, string>
                          )[e.summary.supportRole || e.summary.role || ""] ||
                            e.summary.role}
                        </small>
                      )}
                    </td>
                    <td>
                      <b>{e.summary.name || names[e.entity]}</b>
                      <small className="cell-note">{names[e.entity]}</small>
                      {e.summary.reason && (
                        <small className="cell-note">{e.summary.reason}</small>
                      )}
                    </td>
                    <td>
                      {e.action === "START"
                        ? "Soporte abierto"
                        : e.action === "END"
                          ? "Soporte cerrado"
                          : e.action === "INSERT"
                            ? "Registro creado"
                            : e.summary.previousStatus &&
                                e.summary.status !== e.summary.previousStatus
                              ? `${e.summary.previousStatus} → ${e.summary.status}`
                              : "Datos actualizados"}
                    </td>
                    <td>
                      {e.summary.status && <Badge status={e.summary.status} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!events.length && (
            <Empty
              title="Todo comienza con un primer paso"
              subtitle="Los cambios de tu institución aparecerán aquí."
            />
          )}
        </section>
      </>
    );
  }
  const requests = store.data.institutionRequests
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <SectionTitle
        title="Nuevas comunidades por conectar"
        subtitle="Revisa las solicitudes de colegios y habilita su espacio de dirección."
      />
      <div className="card-grid">
        {requests.map((r) => (
          <article className="entity-card" key={r.id}>
            <div className="entity-top">
              <span className="row-icon">
                <ShieldCheck size={23} />
              </span>
              <Badge status={r.status} />
            </div>
            <h3>{r.schoolName}</h3>
            <p>
              {r.city} · {r.contactName}
            </p>
            <small className="cell-note">
              {r.email} · {r.phone}
            </small>
            <p>{r.message}</p>
            <div className="entity-footer">
              <small>{dateLabel(r.createdAt)}</small>
              {r.status === "pending" && (
                <Button
                  icon={Clock}
                  variant="secondary"
                  onClick={() => {
                    setError("");
                    setReview(r);
                  }}
                >
                  Revisar solicitud
                </Button>
              )}
            </div>
            {r.response && <p className="response-text">{r.response}</p>}
          </article>
        ))}
      </div>
      {!requests.length && (
        <section className="panel">
          <Empty
            title="La próxima comunidad llegará pronto"
            subtitle="Las solicitudes enviadas desde la landing aparecerán aquí."
          />
        </section>
      )}
      {review && (
        <Modal
          title={`Conectar ${review.schoolName}`}
          subtitle="Aprobar crea la institución y asigna dirección a la cuenta verificada que la solicitó."
          busy={busy || store.busy}
          error={error}
          onClose={() => setReview(null)}
          submitLabel="Guardar decisión"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await store.reviewInstitution(
                review.id,
                f.get("decision") === "approve",
                String(f.get("response") || ""),
              );
              setReview(null);
              act(async () => {}, "Solicitud revisada.");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "No pudimos revisar la solicitud.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {review.email} · {review.contactName}
          </p>
          <Field name="decision" label="Decisión">
            <select name="decision">
              <option value="approve">Aprobar y crear institución</option>
              <option value="reject">Solicitar correcciones / rechazar</option>
            </select>
          </Field>
          <Field name="response" label="Mensaje para la institución">
            <textarea
              required
              name="response"
              rows={3}
              placeholder="Tu espacio ya está listo. Bienvenidos a MiCole."
            />
          </Field>
          <div className="soft-note">
            <CheckCircle2 size={18} />
            <span>
              La cuenta de dirección recibe acceso únicamente a la institución
              creada. Puede consultar la respuesta desde su solicitud.
            </span>
          </div>
        </Modal>
      )}
    </>
  );
}
