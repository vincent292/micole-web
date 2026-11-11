import { useState } from "react";
import { Button, Field, Modal, Badge } from "../components/UI";
import { rpc } from "../lib/repository";
import {
  attendanceLabels,
  type AttendanceWorkspace,
} from "../lib/studentAttendance";
export function AttendanceCorrections({
  data,
  refresh,
  canCorrect,
}: {
  data: AttendanceWorkspace;
  refresh: () => void;
  canCorrect: boolean;
}) {
  const [request, setRequest] = useState<{ id: string; record: string; records: AttendanceWorkspace["records"] } | null>(
    null,
  );
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
          Correcciones con justificativo · {corrections.length} registro(s)
        </summary>
        <p>
          El original se conserva. Solo el docente asignado puede corregir con
          justificativo; Dirección consulta el historial.
        </p>
        {notice && <p role="status">{notice}</p>}
        {canCorrect && (
          <Button
            disabled={!records.length}
            onClick={() => {
              setError("");
              setRequest({ id: crypto.randomUUID(), record: records[0].id, records });
            }}
          >
            Corregir con justificativo
          </Button>
        )}
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
            <p>Justificativo: {c.reason}</p>
            {c.review_note && <p>Registro: {c.review_note}</p>}
          </article>
        ))}
        {!corrections.length && (
          <p>No hay correcciones en el mes seleccionado.</p>
        )}
      </details>
      {request && canCorrect && (
        <Modal
          title="Corregir asistencia con justificativo"
          busy={busy}
          error={error}
          onClose={() => setRequest(null)}
          submitLabel="Guardar corrección y avisar"
          onSubmit={async (e) => {
            const f = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("request_attendance_correction", {
                p_id: request.id,
                p_record_id: String(f.get("record")),
                p_base_correction_id: request.records.find(r => r.id === String(f.get("record")))?.correctionId || null,
                p_status: String(f.get("status")),
                p_note: String(f.get("note") || ""),
                p_reason: String(f.get("reason")),
              });
              setRequest(null);
              setNotice(
                "Corrección guardada con justificativo. El original se conserva y se avisa a la familia.",
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
            La corrección cambia el estado que consulta la familia y queda en el
            historial. Revisa el alumno, la fecha y el justificativo.
          </p>
          <Field label="Alumno y fecha" name="record" required>
            <select
              name="record"
              value={request.record}
              onChange={(e) =>
                setRequest({ ...request, record: e.target.value })
              }
            >
              {request.records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.date} · {r.studentName} ·{" "}
                  {r.status && attendanceLabels[r.status]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estado corregido" name="status" required>
            <select
              name="status"
              key={request.record}
              defaultValue={
                request.records.find((r) => r.id === request.record)?.status ||
                "present"
              }
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
              key={request.record}
              defaultValue={
                request.records.find((r) => r.id === request.record)?.note || ""
              }
            />
          </Field>
          <Field
            label="Justificativo obligatorio"
            name="reason"
            required
            minLength={5}
            maxLength={1000}
          />
        </Modal>
      )}
    </section>
  );
}
