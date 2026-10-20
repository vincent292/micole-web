import { validateFinancialSupport } from "./financialRecords";
import { publicDemo } from "./demo-config";
import { supabase, liveMode } from "./supabase";
import { rpc } from "./repository";
import { uid } from "./format";
import { csvContent } from "./reports";
import type {
  FinancialSupport,
  PaymentSelection,
  ViewKind,
} from "./financialRecords";
export async function financialCall(body: object) {
  if (!supabase || !liveMode)
    throw new Error(
      "Los documentos privados requieren una institución conectada.",
    );
  const { data, error } = await supabase.functions.invoke("r2-media", { body });
  if (error || data?.error) {
    let message = data?.error;
    try {
      message ||= (await error?.context?.json())?.error;
    } catch {}
    throw new Error(message || "No se pudo acceder al documento privado.");
  }
  return data as { url: string; id: string; fileName?: string };
}
export async function uploadFinancial(
  file: File,
  kind: "invoice" | "payment_evidence",
  parentId: string,
) {
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    ) ||
    file.size <= 0 ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error("Usa PDF, JPG, PNG o WebP de hasta 5 MB.");
  if (publicDemo) {
    const { uploadDemoFinancial } = await import("./demo-features");
    return uploadDemoFinancial(file, kind, parentId);
  }
  const prepared = await financialCall({
    action: "financial_upload",
    kind,
    parentId,
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
    throw new Error("No se pudo subir el documento. Reintenta la carga.");
  const result = await financialCall({
    action: "financial_finalize",
    assetId: prepared.id,
  });
  return result.id;
}
export async function downloadFinancial(id: string) {
  const value = publicDemo
    ? await (await import("./demo-features")).downloadDemoFinancial(id)
    : await financialCall({
        action: "financial_download",
        assetId: id,
        eventId: uid(),
        client: "web",
      });
  const a = document.createElement("a");
  a.href = value.url;
  a.download = value.fileName || "documento";
  a.target = "_blank";
  a.rel = "noopener";
  a.click();
}
export const loadFinancialSupport = (schoolId: string, studentId?: string) =>
  liveMode || publicDemo
    ? rpc<FinancialSupport>("financial_support_register", {
        p_school_id: schoolId,
        p_student_id: studentId || null,
      }).then(validateFinancialSupport)
    : Promise.resolve({ submissions: [], files: [] });
export async function sendPaymentEvidence({
  id,
  studentId,
  items,
  method,
  reference,
  paidOn,
  invoice,
  file,
}: {
  id: string;
  studentId: string;
  items: PaymentSelection;
  method: "deposit" | "transfer";
  reference: string;
  paidOn: string;
  invoice: Record<string, string>;
  file: File;
}) {
  await rpc("create_payment_submission", {
    p_id: id,
    p_student_id: studentId,
    p_items: items,
    p_method: method,
    p_reference: reference,
    p_paid_on: paidOn,
    p_invoice: invoice,
  });
  await uploadFinancial(file, "payment_evidence", id);
  await rpc("submit_payment_submission", { p_id: id });
}
export async function recordView(
  kind: ViewKind,
  id: string,
  action: "open" | "download" = "open",
  eventId = uid(),
) {
  if (liveMode || publicDemo)
    await rpc("record_content_view", {
      p_id: eventId,
      p_kind: kind,
      p_content_id: id,
      p_client: "web",
      p_action: action,
    });
}
export function exportTable(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const url = URL.createObjectURL(
    new Blob([csvContent(headers, rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
