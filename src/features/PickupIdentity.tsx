import { useState } from "react";
import { Button, Field, Modal } from "../components/UI";
import { rpc } from "../lib/repository";
import { liveMode, supabase } from "../lib/supabase";
import type { FamilyRequest } from "../lib/types";
export async function uploadPickupIdentity(
  requestId: string,
  studentId: string,
  file: File,
): Promise<{ id: string; localUrl?: string }> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Adjunta una foto JPG, PNG o WebP de hasta 5 MB.");
  if (!liveMode) {
    if (file.size > 1024 * 1024)
      throw new Error("En la demo usa una foto ficticia de hasta 1 MB.");
    const localUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { id: crypto.randomUUID(), localUrl };
  }
  const call = async (body: object) => {
    const { data, error } = await supabase!.functions.invoke("r2-media", {
      body,
    });
    if (error || data?.error)
      throw new Error(data?.error || "No se pudo adjuntar el carnet.");
    return data;
  };
  const prepared = await call({
    action: "pickup_upload",
    requestId,
    studentId,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const uploaded = await fetch(prepared.url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploaded.ok) throw new Error("No se pudo subir la foto del carnet.");
  await call({ action: "pickup_finalize", assetId: prepared.id });
  return { id: prepared.id };
}
export function PickupIdentity({
  request,
  canVerify,
  onChanged,
  saveLocal,
}: {
  request: FamilyRequest;
  canVerify: boolean;
  onChanged: () => Promise<void>;
  saveLocal: (request: FamilyRequest) => Promise<void>;
}) {
  const [view, setView] = useState(false),
    [url, setUrl] = useState(""),
    [verify, setVerify] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const hasFile = !!request.pickupFileId || !!request.pickupFileUrl;
  return (
    <div className="pickup-evidence">
      <div className="request-actions">
        <Button
          variant="secondary"
          disabled={!hasFile || busy}
          onClick={() => {
            setBusy(true);
            setError("");
            void (async () => {
              if (!liveMode) {
                setUrl(request.pickupFileUrl || "");
                setView(true);
                return;
              }
              const { data, error } = await supabase!.functions.invoke(
                "r2-media",
                {
                  body: {
                    action: "pickup_download",
                    assetId: request.pickupFileId,
                  },
                },
              );
              if (error || !data?.url)
                throw new Error("No se pudo abrir el carnet privado.");
              setUrl(data.url);
              setView(true);
            })()
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Ver carnet de quien recoge
        </Button>
        {canVerify &&
          request.status === "approved" &&
          !request.pickupVerifiedAt &&
          hasFile && (
            <Button
              onClick={() => {
                setVerify(true);
                setError("");
              }}
            >
              Confirmar identidad y entrega
            </Button>
          )}
      </div>
      {!hasFile && (
        <p className="muted">
          Esta autorización antigua no tiene carnet adjunto. La familia debe
          enviar una nueva autorización con foto.
        </p>
      )}
      {request.pickupVerifiedAt && (
        <p className="message info">
          Identidad y entrega confirmadas ·{" "}
          {new Date(request.pickupVerifiedAt).toLocaleString("es-BO", {
            timeZone: "America/La_Paz",
          })}
          <br />
          {request.pickupVerificationNote}
        </p>
      )}
      {error && !verify && <p role="alert">{error}</p>}
      {view && (
        <Modal
          title="Carnet privado de la persona autorizada"
          onClose={() => {
            setView(false);
            setUrl("");
          }}
          submitLabel="Cerrar"
          onSubmit={(e) => {
            e.preventDefault();
            setView(false);
            setUrl("");
          }}
        >
          <p>
            <b>{request.pickupName}</b> · CI {request.pickupId}
          </p>
          <img
            className="pickup-identity-image"
            src={url}
            alt={`Carnet adjunto de ${request.pickupName}`}
          />
          <p className="soft-note">
            Compara la foto, el nombre y el documento con la persona presente
            antes de entregar al niño.
          </p>
        </Modal>
      )}
      {verify && (
        <Modal
          title="Confirmar identidad y entrega"
          busy={busy}
          error={error}
          onClose={() => setVerify(false)}
          submitLabel="Confirmar entrega"
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              if (form.get("checked") !== "on")
                throw new Error(
                  "Confirma la comparación presencial del carnet.",
                );
              if (liveMode)
                await rpc("confirm_pickup_identity", {
                  p_request_id: request.id,
                  p_note: String(form.get("note") || ""),
                });
              else {
                await saveLocal({
                  ...request,
                  pickupVerifiedAt: new Date().toISOString(),
                  pickupVerificationNote: String(form.get("note") || ""),
                });
              }
              await onChanged();
              setVerify(false);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Persona autorizada: <b>{request.pickupName}</b> · CI{" "}
            {request.pickupId}
          </p>
          <label className="check-field">
            <input name="checked" type="checkbox" required /> Comparé
            presencialmente a la persona con la foto y los datos del carnet.
          </label>
          <Field label="Observación de la entrega" name="note">
            <textarea
              name="note"
              required
              minLength={5}
              maxLength={1000}
              rows={3}
            />
          </Field>
          <p className="muted">
            Se registrarán la fecha y tu cuenta. Si la identidad no coincide, no
            confirmes la entrega.
          </p>
        </Modal>
      )}
    </div>
  );
}
