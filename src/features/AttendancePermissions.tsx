import { useState } from "react";
import { Button, Field, Modal } from "../components/UI";
import { rpc } from "../lib/repository";
import type { AttendanceWorkspace } from "../lib/studentAttendance";
export function AttendancePermissions({
  data,
  context,
  canMark,
  active,
  onReviewed,
  refresh,
}: {
  data: AttendanceWorkspace;
  context: string;
  canMark: boolean;
  active: boolean;
  onReviewed: (studentIds: string[]) => void;
  refresh: () => void;
}) {
  const permissions = data.permissions || [];
  const fingerprint = context + ":" + data.permissionRevision;
  const [seen, setSeen] = useState(""),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [responses, setResponses] = useState<Record<string, string>>({});
  if (!data.canManage || !permissions.length) return null;
  const pending = permissions.some((p) => p.status === "pending");
  const opened =
    open ||
    (active && canMark && permissions.length > 0 && fingerprint !== seen);
  async function review(id: string, approve: boolean) {
    setBusy(true);
    setError("");
    try {
      await rpc("review_attendance_permission", {
        p_id: id,
        p_approve: approve,
        p_note: responses[id] || "",
      });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="message" role="status">
        <strong>
          {permissions.length} pedido(s) de permiso para esta fecha.
        </strong>{" "}
        {pending
          ? "Revisa los pendientes antes de confirmar la lista."
          : "Consulta las respuestas antes de pasar lista."}
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Ver permisos de la familia
        </Button>
      </div>
      {opened && (
        <Modal
          title="Permisos antes de pasar lista"
          busy={busy}
          error={error}
          onClose={() => {
            setSeen(fingerprint);
            setOpen(false);
          }}
          submitLabel={canMark ? "Continuar con la lista" : "Cerrar consulta"}
          submitDisabled={canMark && pending}
          onSubmit={(e) => {
            e.preventDefault();
            if (canMark && pending) {
              setError("Responde los pedidos pendientes antes de continuar.");
              return;
            }
            onReviewed(
              permissions
                .filter((p) => p.status === "approved")
                .map((p) => p.studentId),
            );
            setSeen(fingerprint);
            setOpen(false);
          }}
        >
          <p>
            {canMark
              ? "Revisa los pedidos de las familias. Los permisos aceptados se proponen como Con permiso; conserva la presencia real si el niño asistió."
              : "Consulta de Dirección. Solo el docente asignado marca o corrige la asistencia."}
          </p>
          {canMark && pending && <p>Responde todos los pedidos pendientes para continuar.</p>}
          {permissions.map((p) => (
            <article
              className="panel"
              style={{ padding: 12, marginBottom: 12 }}
              key={p.id}
            >
              <strong>
                {p.studentName} · {p.date}
              </strong>
              <p>{p.reason}</p>
              <p>
                Estado:{" "}
                {p.status === "pending"
                  ? "Pendiente"
                  : p.status === "approved"
                    ? "Aceptado"
                    : "Rechazado"}
              </p>
              {p.response && <p>Respuesta: {p.response}</p>}
              {canMark && p.status === "pending" && (
                <>
                  <Field
                    label={`Respuesta a la familia de ${p.studentName}`}
                    name={`permission-${p.id}`}
                  >
                    <textarea
                      value={responses[p.id] || ""}
                      maxLength={1000}
                      disabled={busy}
                      onChange={(e) =>
                        setResponses({ ...responses, [p.id]: e.target.value })
                      }
                    />
                  </Field>
                  <Button
                    disabled={busy || (responses[p.id] || "").trim().length < 5}
                    onClick={() => void review(p.id, true)}
                  >
                    Aceptar permiso
                  </Button>{" "}
                  <Button
                    variant="secondary"
                    disabled={busy || (responses[p.id] || "").trim().length < 5}
                    onClick={() => void review(p.id, false)}
                  >
                    Rechazar permiso
                  </Button>
                </>
              )}
            </article>
          ))}
        </Modal>
      )}
    </>
  );
}
