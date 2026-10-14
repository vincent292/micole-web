import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { Button, Field, Modal } from "../components/UI";
import { liveMode, supabase } from "../lib/supabase";
import { dateLabel, uid } from "../lib/format";
import type { StudentDocument } from "../lib/types";
import type { PageProps } from "./Pages";
import { fullName } from "./Pages";
const categories: Record<StudentDocument["category"], string> = {
  ci: "Cédula de identidad",
  birth_certificate: "Certificado de nacimiento",
  insurance: "Seguro",
  other: "Otro documento",
};
async function call(body: object) {
  if (!supabase) throw new Error("La conexión no está disponible.");
  const { data, error } = await supabase.functions.invoke("r2-media", { body });
  if (error || data?.error)
    throw new Error(
      data?.error || error?.message || "No se pudo procesar el documento.",
    );
  return data as { url: string; objectKey: string };
}
export function DocumentModal({
  id,
  store,
  identity,
  role,
  onClose,
}: PageProps & { id?: string; onClose: () => void }) {
  const student = store.data.students.find((s) => s.id === id);
  const documents = store.data.studentDocuments.filter(
    (d) => d.studentId === id,
  );
  const enabled = !liveMode || import.meta.env.VITE_R2_ENABLED === "true";
  const [category, setCategory] = useState<StudentDocument["category"]>("ci");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [download, setDownload] = useState<{
    name: string;
    url: string;
  } | null>(null);
  return (
    <Modal
      title={`Documentos · ${fullName(student)}`}
      subtitle="Archivos privados de la inscripción. Dirección y padres autorizados pueden consultarlos."
      onClose={onClose}
      busy={busy || store.busy}
      error={error}
      submitLabel="Cerrar"
      onSubmit={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {enabled && role === "director" ? (
        <>
          <Field label="Tipo de documento" name="documentCategory">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {Object.entries(categories).map(([key, name]) => (
                <option value={key} key={key}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Archivo · PDF, JPG, PNG o WebP · hasta 5 MB"
            name="documentFile"
          >
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
          <Button
            icon={Upload}
            disabled={!file || !student || busy}
            onClick={() => {
              void (async () => {
                if (!file || !student) return;
                setBusy(true);
                setError("");
                setNotice("");
                try {
                  if (
                    ![
                      "application/pdf",
                      "image/jpeg",
                      "image/png",
                      "image/webp",
                    ].includes(file.type) ||
                    file.size < 1 ||
                    file.size > 5 * 1024 * 1024
                  )
                    throw new Error("Usa PDF, JPG, PNG o WebP de hasta 5 MB.");
                  if (liveMode) {
                    const signed = await call({
                      action: "document_upload",
                      studentId: student.id,
                      schoolId: student.schoolId,
                      mimeType: file.type,
                      size: file.size,
                      category,
                      fileName: file.name,
                    });
                    const response = await fetch(signed.url, {
                      method: "PUT",
                      headers: { "Content-Type": file.type },
                      body: file,
                    });
                    if (!response.ok)
                      throw new Error("No se pudo subir el documento.");
                    await call({
                      action: "document_finalize",
                      studentId: student.id,
                      schoolId: student.schoolId,
                      objectKey: signed.objectKey,
                      category,
                      fileName: file.name,
                    });
                    await store.refresh();
                  } else {
                    if (file.size > 1024 * 1024)
                      throw new Error(
                        "En modo local usa archivos de hasta 1 MB.",
                      );
                    const localUrl = await new Promise<string>(
                      (resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result));
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                      },
                    );
                    await store.save("studentDocuments", {
                      id: uid(),
                      schoolId: student.schoolId,
                      studentId: student.id,
                      category,
                      fileName: file.name.slice(0, 180),
                      objectKey: `local/${uid()}`,
                      mimeType: file.type,
                      sizeBytes: file.size,
                      uploadedBy: identity.id,
                      createdAt: new Date().toISOString(),
                      localUrl,
                    });
                  }
                  setNotice("Documento guardado.");
                  setFile(null);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No se pudo guardar el archivo.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Subir documento
          </Button>
        </>
      ) : !enabled ? (
        <p className="message warn">
          La carga de documentos estará disponible cuando conectemos el
          almacenamiento privado. Puedes completar la inscripción y la ficha de
          cuidado mientras tanto.
        </p>
      ) : null}
      {notice && (
        <p role="status" className="message success">
          {notice}
        </p>
      )}
      {documents.map((d) => (
        <div className="list-row document-row" key={d.id}>
          <span className="row-icon">
            <FileText size={20} />
          </span>
          <div className="grow">
            <b>{d.fileName}</b>
            <small>
              {categories[d.category]} · {dateLabel(d.createdAt)} ·{" "}
              {Math.ceil(d.sizeBytes / 1024)} KB
            </small>
          </div>
          <Button
            variant="secondary"
            disabled={busy || !enabled}
            onClick={() => {
              const preview = liveMode
                ? window.open("about:blank", "_blank")
                : null;
              if (preview) preview.opener = null;
              void (async () => {
                setError("");
                setBusy(true);
                try {
                  const url = liveMode
                    ? (
                        await call({
                          action: "document_download",
                          assetId: d.id,
                        })
                      ).url
                    : d.localUrl || "";
                  setDownload({ name: d.fileName, url });
                  if (preview) preview.location.replace(url);
                } catch (e) {
                  preview?.close();
                  setError(
                    e instanceof Error
                      ? e.message
                      : "No se pudo abrir el documento.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Abrir
          </Button>
        </div>
      ))}
      {download && (
        <a
          className="btn btn-secondary"
          href={download.url}
          target="_blank"
          rel="noopener noreferrer"
          download={!liveMode ? download.name : undefined}
        >
          Ver {download.name}
        </a>
      )}
      {!documents.length && (
        <p className="muted">Todavía no hay documentos registrados.</p>
      )}
    </Modal>
  );
}
