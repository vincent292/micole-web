import {ContentSeen} from '../components/ContentSeen';
import { useEffect, useState } from "react";
import { ImagePlus, Images } from "lucide-react";
import { Button, Empty, Field, SectionTitle } from "../components/UI";
import { liveMode, supabase } from "../lib/supabase";
import { dateLabel, uid } from "../lib/store";
import { fullName } from "./Pages";
import type { PageProps } from "./Pages";
import type { MediaAsset } from "../lib/types";
async function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function mediaCall(body: object) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.functions.invoke("r2-media", { body });
  if (error || data?.error)
    throw new Error(
      data?.error || error?.message || "No se pudo conectar con Cloudflare R2.",
    );
  return data as { url: string; objectKey: string };
}
export function Gallery({
  store,
  school,
  students,
  student,
  role,
  act,
}: PageProps) {
  const [selected, setSelected] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const current =
    role === "guardian"
      ? student
      : students.find((s) => s.id === selected) || students[0];
  const assets = store.data.media.filter(
    (m) =>
      m.schoolId === school?.id &&
      students.some((s) => s.id === m.studentId) &&
      (role !== "guardian" || m.studentId === student?.id),
  );
  const enabled = !liveMode || import.meta.env.VITE_R2_ENABLED === "true";
  return (
    <>
      <SectionTitle
        title="Momentos para recordar"
        subtitle="Imágenes privadas de cada estudiante, para su familia y su colegio."
      />
      {enabled ? (
        <section className="panel">
          <form
            className="gallery-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (!file || !current || busy) return;
              setUploadError("");
              setBusy(true);
              act(async () => {
                try {
                  if (
                    !["image/jpeg", "image/png", "image/webp"].includes(
                      file.type,
                    ) ||
                    file.size > 5 * 1024 * 1024
                  )
                    throw new Error("Usa JPG, PNG o WebP de hasta 5 MB.");
                  if (!liveMode && file.size > 1024 * 1024)
                    throw new Error(
                      "En modo local usa imágenes de hasta 1 MB.",
                    );
                  let objectKey = "",
                    localUrl = "";
                  if (liveMode) {
                    const signed = await mediaCall({
                      action: "upload",
                      schoolId: school?.id,
                      studentId: current.id,
                      mimeType: file.type,
                      size: file.size,
                    });
                    const response = await fetch(signed.url, {
                      method: "PUT",
                      headers: { "Content-Type": file.type },
                      body: file,
                    });
                    if (!response.ok)
                      throw new Error(
                        "R2 rechazó la subida. Comprueba el CORS del bucket.",
                      );
                    objectKey = signed.objectKey;
                  } else localUrl = await readImage(file);
                  if (liveMode) {
                    await mediaCall({
                      action: "finalize",
                      schoolId: school?.id,
                      studentId: current.id,
                      objectKey,
                      caption: caption.trim(),
                    });
                    await store.refresh();
                  } else
                    await store.save("media", {
                      id: uid(),
                      schoolId: school!.id,
                      studentId: current.id,
                      caption: caption.trim(),
                      objectKey: objectKey || `local/${uid()}`,
                      mimeType: file.type,
                      createdAt: new Date().toISOString(),
                      localUrl,
                    });
                  setCaption("");
                  setFile(null);
                  const input = document.getElementById(
                    "gallery-file",
                  ) as HTMLInputElement | null;
                  if (input) input.value = "";
                } catch (e) {
                  setUploadError(
                    e instanceof Error
                      ? e.message
                      : "No pudimos subir la imagen.",
                  );
                  throw e;
                } finally {
                  setBusy(false);
                }
              }, "Imagen compartida con la familia y el colegio.");
            }}
          >
            <div className="form-grid">
              <Field label="Estudiante" name="studentId">
                <select
                  required
                  aria-label="Estudiante de la imagen"
                  value={current?.id || ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {(role === "guardian"
                    ? current
                      ? [current]
                      : []
                    : students
                  ).map((s) => (
                    <option key={s.id} value={s.id}>
                      {fullName(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Unas palabras sobre el momento" name="caption">
                <input
                  required
                  maxLength={300}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="Su primer dibujo del día…"
                />
              </Field>
            </div>
            <div className="upload-row">
              <label className="file-picker">
                <ImagePlus size={19} />
                <input
                  id="gallery-file"
                  aria-label="Seleccionar imagen"
                  type="file"
                  required
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
              <Button
                type="submit"
                icon={Images}
                disabled={busy || !file || !current}
              >
                {busy ? "Subiendo…" : "Compartir imagen"}
              </Button>
            </div>
            {uploadError && (
              <div className="message error" role="alert">
                {uploadError}
              </div>
            )}
          </form>
        </section>
      ) : (
        <div className="message warn">
          Configura la función r2-media y VITE_R2_ENABLED=true para habilitar
          las imágenes privadas.
        </div>
      )}
      <div className="gallery-grid">
        {assets
          .slice()
          .reverse()
          .map((asset) => (
            <Photo
              key={asset.id}
              asset={asset}
              name={fullName(students.find((s) => s.id === asset.studentId))}
            />
          ))}
      </div>
      {!assets.length && (
        <section className="panel">
          <Empty
            title="Pequeños momentos, grandes recuerdos"
            subtitle="Las imágenes compartidas aparecerán aquí."
          />
        </section>
      )}
    </>
  );
}
function Photo({ asset, name }: { asset: MediaAsset; name: string }) {
  const [url, setUrl] = useState(asset.localUrl || ""),
    [error, setError] = useState(""),[loaded,setLoaded]=useState(false);
  useEffect(() => {
    let active = true;
    if (!liveMode) return;
    void mediaCall({ action: "download", assetId: asset.id })
      .then((result) => {
        if (active) setUrl(result.url);
      })
      .catch(() => {
        if (active) setError("No se pudo cargar la imagen.");
      });
    return () => {
      active = false;
    };
  }, [asset.id]);
  return (
    <ContentSeen kind="media" id={asset.id} enabled={loaded}><article className="photo-card">
      {url ? (
        <img src={url} alt={asset.caption} loading="lazy" onLoad={()=>setLoaded(true)}/>
      ) : (
        <div className="photo-placeholder">{error || "Cargando imagen…"}</div>
      )}
      <div>
        <b>{asset.caption}</b>
        <p>
          {name} · {dateLabel(asset.createdAt)}
        </p>
      </div>
    </article></ContentSeen>
  );
}
