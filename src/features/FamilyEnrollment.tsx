import { admissionRows } from "../lib/admission";
import { useState } from "react";
import { Copy, MessageCircle, Link as LinkIcon } from "lucide-react";
import { Badge, Button, Field, Modal } from "../components/UI";
import { careLabels } from "../components/CareFields";
import { dateLabel } from "../lib/format";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
export function FamilyIntakeModal({
  id,
  store,
  onClose,
}: PageProps & { id?: string; onClose: () => void }) {
  const student = store.data.students.find((s) => s.id === id);
  const [recipient, setRecipient] = useState<"mother" | "father">("mother");
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const forms = store.data.familyIntakes
    .filter((f) => f.studentId === id)
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const task = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Ficha familiar · ${fullName(student)}`}
      subtitle="Compartir, revisar o completar los cuidados de la inscripción."
      onClose={onClose}
      busy={busy || store.busy}
      error={error}
      submitLabel="Cerrar"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="parent-access-summary">
        <p>
          <b>Madre:</b> {student?.motherName || student?.guardianName} ·{" "}
          {student?.motherEmail || student?.guardianEmail}
        </p>
        <p>
          <b>Padre:</b> {student?.fatherName || "Pendiente"} ·{" "}
          {student?.fatherEmail || "Registra su correo"}
        </p>
        <small>
          Solo estas cuentas podrán acceder a sus hijos después de verificar su
          correo. Los contactos de emergencia no reciben acceso.
        </small>
      </div>
      <Field label="Enviar ficha a" name="recipient">
        <select
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value as typeof recipient);
            setLink("");
          }}
        >
          <option value="mother">Madre</option>
          <option value="father" disabled={!student?.fatherEmail}>
            Padre
          </option>
        </select>
      </Field>
      <p className="muted care-note">
        Cada enlace vence en 7 días. Crear uno nuevo reemplaza la ficha
        pendiente anterior.
      </p>
      <Button
        icon={LinkIcon}
        disabled={!student || busy}
        onClick={() => {
          void task(async () => {
            setLink(await store.createIntake(student!.id, recipient));
          }, "Enlace creado. Caduca en 7 días y reemplaza cualquier ficha pendiente anterior.");
        }}
      >
        Crear enlace de ficha
      </Button>
      {link && (
        <div className="intake-share">
          <input
            className="copy-link"
            readOnly
            value={link}
            aria-label="Enlace de ficha familiar"
          />
          <div className="action-group">
            <Button
              variant="secondary"
              icon={Copy}
              onClick={() => {
                void navigator.clipboard
                  .writeText(link)
                  .then(() => setNotice("Enlace copiado."))
                  .catch(() => setNotice("Selecciona y copia el enlace."));
              }}
            >
              Copiar enlace
            </Button>
            <a
              className="btn btn-primary"
              href={`https://wa.me/?text=${encodeURIComponent(`Hola, completa la ficha de cuidado de ${student?.firstName} para su inscripción: ${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={17} />
              Compartir por WhatsApp
            </a>
          </div>
          <p className="muted">
            El botón prepara el mensaje en WhatsApp para que lo envíes. El
            formulario se completa sin login.
          </p>
        </div>
      )}
      {notice && (
        <p className="message success" role="status">
          {notice}
        </p>
      )}
      <div className="intake-history">
        {forms.map((f) => (
          <section className="intake-record" key={f.id}>
            <div className="intake-record-heading">
              <b>
                {f.recipient === "mother" ? "Madre" : "Padre"} ·{" "}
                {dateLabel(f.createdAt)}
              </b>
              <Badge
                status={f.status}
                label={
                  {
                    open: "Por completar",
                    submitted: "Por revisar",
                    approved: "Aprobada",
                    revoked: "Cerrada",
                  }[f.status]
                }
              />
            </div>
            {f.status === "open" && (
              <p className="muted">
                Vence el {dateLabel(f.expiresAt)}. Solo el enlace compartido
                permite enviar la ficha.
              </p>
            )}
            {f.status === "submitted" && f.profile && (
              <>
                <div className="detail-grid">
                  <div>
                    <small>Seguro</small>
                    <b>{f.profile.hasInsurance ? "Sí" : "No"}</b>
                  </div>
                  {careLabels
                    .filter(([key]) => !!f.profile?.[key])
                    .map(([key, label]) => (
                      <div key={key}>
                        <small>{label}</small>
                        <b>{String(f.profile![key])}</b>
                      </div>
                    ))}
                  {admissionRows(f.profile.admissionDetails).map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}
                </div>
                <div className="action-group">
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void task(
                        () => store.reviewIntake(f, true),
                        "Ficha aprobada. Los datos de cuidado ya están guardados.",
                      );
                    }}
                  >
                    Aprobar y completar ficha
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      void task(
                        () => store.reviewIntake(f, false),
                        "Respuesta cerrada. Puedes crear un enlace nuevo para corregirla.",
                      );
                    }}
                  >
                    Solicitar corrección
                  </Button>
                </div>
              </>
            )}
            {f.status === "open" && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  void task(() => store.revokeIntake(f.id), "Enlace retirado.");
                }}
              >
                Retirar enlace
              </Button>
            )}
          </section>
        ))}
        {!forms.length && (
          <p className="muted">
            Todavía no se compartió una ficha con esta familia.
          </p>
        )}
      </div>
    </Modal>
  );
}
