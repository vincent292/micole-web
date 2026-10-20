import { publicDemo } from "./demo-config";
import { supabase, liveMode } from "./supabase";
import { rpc } from "./repository";
import type { AdmissionTemplate } from "./admission";
import type {
  DocumentDraft,
  DocumentKind,
  DocumentSource,
} from "./documentImport";
export interface StoredTemplate extends AdmissionTemplate {
  revision: number;
}
export async function loadAdmissionTemplate(
  schoolId: string,
  year: number,
): Promise<StoredTemplate | null> {
  if (publicDemo)
    return rpc("demo_admission_template", {
      p_school_id: schoolId,
      p_year: year,
    });
  if (!liveMode)
    return JSON.parse(
      localStorage.getItem(`micole-template:${schoolId}:${year}`) || "null",
    );
  if (!supabase) throw new Error("La conexión de MiCole no está disponible.");
  const { data, error } = await supabase
    .from("admission_templates")
    .select("*")
    .eq("school_id", schoolId)
    .eq("academic_year", year)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data
    ? {
        id: data.id,
        title: data.title,
        academicYear: data.academic_year,
        fields: data.fields,
        instructions: data.instructions,
        revision: data.revision,
      }
    : null;
}
export async function saveAdmissionTemplate(
  schoolId: string,
  template: AdmissionTemplate,
  revision: number,
) {
  if (publicDemo)
    return rpc<void>("save_admission_template", {
      p_school_id: schoolId,
      p_year: template.academicYear,
      p_template: template,
      p_expected_revision: revision,
    });
  if (!liveMode) {
    const next = { ...template, revision: revision + 1 };
    localStorage.setItem(
      `micole-template:${schoolId}:${template.academicYear}`,
      JSON.stringify(next),
    );
    return;
  }
  await rpc("save_admission_template", {
    p_school_id: schoolId,
    p_year: template.academicYear,
    p_template: template,
    p_expected_revision: revision,
  });
}
export async function analyzeDocuments(
  schoolId: string,
  year: number,
  kind: DocumentKind,
  files: DocumentSource[],
): Promise<DocumentDraft> {
  if (publicDemo)
    return (await import("./demo-features")).sampleDocumentDraft(year, kind);
  if (!liveMode)
    throw new Error(
      "La lectura con Gemini está disponible al conectar la institución a Supabase. Puedes preparar preguntas manualmente en esta demo.",
    );
  if (!supabase) throw new Error("La conexión de MiCole no está disponible.");
  const { data, error } = await supabase.functions.invoke("document-analyze", {
    body: { schoolId, year, kind, files, emptyDocumentConfirmed: true },
  });
  if (error) {
    let message = "No se pudo leer el documento.";
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function sourceFromFile(file: File): Promise<DocumentSource> {
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  const mimeType =
    file.type ||
    (
      {
        heic: "image/heic",
        heif: "image/heif",
        pdf: "application/pdf",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
      } as Record<string, string>
    )[ext || ""] ||
    "";
  if (
    ![
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ].includes(mimeType) ||
    file.size > 5 * 1024 * 1024 ||
    !file.size
  )
    throw new Error("Usa PDF, JPG, PNG, WebP o HEIC de hasta 5 MB.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
  return { name: file.name, mimeType, data };
}
