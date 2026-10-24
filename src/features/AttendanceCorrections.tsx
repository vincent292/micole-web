import { useState } from "react";
import { Button, Field, Modal, Badge } from "../components/UI";
import { rpc } from "../lib/repository";
import {
  attendanceLabels,
  type AttendanceWorkspace,
  type AttendanceCorrection,
} from "../lib/studentAttendance";
export function AttendanceCorrections({
  data,
  refresh,
}: {
  data: AttendanceWorkspace;
  refresh: () => void;
}) {
  const [request, setRequest] = useState<{ id: string; record: string } | null>(
      null,
    ),
    [review, setReview] = useState<AttendanceCorrection | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  if (!data.canManage) return null;
  const records = data.records.filter((r) => r.confirmed),
    corrections = data.corrections || [];
  return (
    <section className="panel" style={{ padding: 16, marginTop: 16 }}>
      <details>
        <summary>
          Correcciones de asistencia ·{" "}
          {corrections.filter((c) => c.status === "pending").length} pendientes
        </summary>
        <p>
          El registro original se conserva. Dirección revisa cada solicitud
          antes de cambiar la asistencia que ve la familia.
        </p>
        {notice && <p role="status">{notice}</p>}
        <Button
          disabled={!records.length}
          onClick={() => {
            setError("");
            setRequest({ id: crypto.randomUUID(), record: records[0].id });
          }}
        >
          Solicitar corrección
        </Button>
        {corrections.map((c) => (
          <article
            key={c.id}
            className="panel"
            style={{ padding: 12, marginTop: 12 }}
          >
            <strong>
              {c.studentName} · {c.date}
            </strong>{" "}
            <Badge status={c.status} />
            <p>
              {attendanceLabels[c.previous_status]} →{" "}
              {attendanceLabels[c.proposed_status]}
            </p>
            <p>Motivo: {c.reason}</p>
            {c.review_note && <p>Decisión de Dirección: {c.review_note}</p>}
            {data.canReview && c.status === "pending" && (
              <Button
                variant="secondary"
                onClick={() => {
                  setError("");
                  setReview(c);
                }}
              >
                Revisar solicitud
              </Button>
            )}
          </article>
        ))}
        {!corrections.length && (
          <p>No hay solicitudes en el mes seleccionado.</p>
        )}
      </details>
      {request && (
        <Modal
          title="Solicitar corrección de asistencia"
          busy={busy}
          error={error}
          onClose={() => setRequest(null)}
          submitLabel="Enviar a Dirección"
          onSubmit={async (e) => {
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("request_attendance_correction", {
                p_id: request.id,
                p_record_id: String(f.get("record")),
                p_status: String(f.get("status")),
                p_note: String(f.get("note") || ""),
                p_reason: String(f.get("reason")),
              });
              setRequest(null);
              setNotice(
                "Solicitud enviada. La asistencia cambia cuando Dirección la aprueba.",
              );
              refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="Alumno y fecha" name="record" required>
            <select
              name="record"
              value={request.record}
              onChange={(e) =>
                setRequest({ ...request, record: e.target.value })
              }
            >
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.date} · {r.studentName} ·{" "}
                  {r.status && attendanceLabels[r.status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado propuesto" name="status" required>
            <select
              name="status"
              defaultValue={
                records.find((r) => r.id === request.record)?.status ||
                "present"
              }
              key={request.record}
            >
              {Object.entries(attendanceLabels).map(([v, l]) => (
                <option value={v} key={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Observación visible para la familia" name="note">
            <textarea
              name="note"
              maxLength={1000}
              defaultValue={
                records.find((r) => r.id === request.record)?.note || ""
              }
              key={request.record}
            />
          </Field>
          <Field
            label="Motivo para Dirección"
            name="reason"
            required
            minLength={5}
            maxLength={1000}
          />
        </Modal>
      )}
      {review && (
        <Modal
          title="Revisar corrección"
          busy={busy}
          error={error}
          onClose={() => setReview(null)}
          submitLabel="Confirmar decisión"
          onSubmit={async (e) => {
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("review_attendance_correction", {
                p_id: review.id,
                p_approve: f.get("decision") === "approved",
                p_note: String(f.get("reason")),
              });
              setReview(null);
              setNotice(
                "Decisión registrada. Las correcciones aprobadas se notifican a la familia.",
              );
              refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {review.studentName} · {review.date}:{" "}
            {attendanceLabels[review.previous_status]} →{" "}
            {attendanceLabels[review.proposed_status]}
          </p>
          <p>{review.reason}</p>
          <Field name="decision" label="Decisión" required>
            <select name="decision" defaultValue="">
              <option value="" disabled>
                Selecciona una decisión
              </option>
              <option value="approved">Aprobar corrección</option>
              <option value="rejected">Rechazar solicitud</option>
            </select>
          </Field>
          <Field
            name="reason"
            label="Motivo de la decisión"
            required
            minLength={5}
            maxLength={1000}
          />
        </Modal>
      )}
    </section>
  );
}
