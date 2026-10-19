import { publicDemo } from "./demo-config";
import { demoFile, saveDemoFile } from "./demo";
import { supabase } from "./supabase";
import { rpc } from "./repository";
export const assignmentFilesEnabled =
  publicDemo || import.meta.env.VITE_R2_ENABLED === "true";
async function call(body: object) {
  if (!supabase) throw new Error("Inicia sesión para continuar.");
  const { data, error } = await supabase.functions.invoke("r2-media", { body });
  if (error || data?.error)
    throw new Error(
      data?.error || "No se pudo acceder al archivo de la tarea.",
    );
  return data;
}
export async function uploadAssignmentFile(
  assignmentId: string,
  body: string,
  file: File,
) {
  if (!assignmentFilesEnabled)
    throw new Error(
      "Los archivos aún no están habilitados por tu institución.",
    );
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    ) ||
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Usa PDF, JPG, PNG o WebP de hasta 5 MB.");
  const submission = await rpc<string>("save_assignment_submission", {
    p_assignment_id: assignmentId,
    p_body: body,
    p_submit: false,
  });
  if(publicDemo) { await saveDemoFile(submission,file); return; }
  const prepared = await call({
    action: "assignment_upload",
    submissionId: submission,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  });
  const response = await fetch(prepared.url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok)
    throw new Error("No se pudo subir el archivo. Intenta nuevamente.");
  await call({ action: "assignment_finalize", assetId: prepared.id });
}
export async function openAssignmentFile(id: string) {
  if(publicDemo) {const url=demoFile(id);if(!url)throw new Error("Este archivo solo está disponible en el navegador donde se adjuntó.");const response=await fetch(url);const blob=await response.blob();window.open(URL.createObjectURL(blob),"_blank","noopener,noreferrer");return;}
  const { url } = await call({ action: "assignment_download", assetId: id });
  window.open(url, "_blank", "noopener,noreferrer");
}
