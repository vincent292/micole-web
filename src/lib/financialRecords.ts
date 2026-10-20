export type FinancialFileLink = {
  id: string;
  fileName: string;
  mimeType: string;
};
export type PaymentSelection = { chargeId: string; amount: number }[];
export interface PaymentSubmission {
  id: string;
  school_id: string;
  student_id: string;
  items: PaymentSelection;
  payment_method: "transfer" | "deposit";
  reference: string;
  paid_on: string;
  status: "pending" | "approved" | "rejected";
  review_note: string;
  created_at: string;
  receipt_id?: string;
  invoice_details: Record<string, string>;
}
export interface FinancialSupport {
  submissions: PaymentSubmission[];
  files: {
    id: string;
    submission_id: string;
    file_name: string;
    mime_type: string;
  }[];
}
export interface AccountStatement {
  studentName: string;
  schoolName: string;
  classroomName: string;
  generatedAt: string;
  charges: {
    id: string;
    concept: string;
    period?: string;
    dueDate: string;
    amount: number;
    paidAmount: number;
    balance: number;
    status: string;
  }[];
  receipts: {
    id: string;
    total: number;
    payment_method: string;
    reference: string;
    created_at: string;
    items?: { concept: string; amount: number }[];
  }[];
  invoices: {
    id: string;
    receipt_id: string;
    invoice_number: string;
    status: string;
    amount: number;
    files: FinancialFileLink[];
  }[];
}
export interface ViewRow {
  id: string;
  studentId: string;
  studentName: string;
  classroomName: string;
  viewerName: string;
  viewerRole: string;
  kind: string;
  contentId: string;
  title: string;
  viewedAt: string;
  action: string;
  client: string;
  contentHash: string;
}
export interface ViewReport {
  total: number;
  rows: ViewRow[];
}
export const viewKinds = {
  grade: "Nota o recomendación",
  report_card: "Libreta",
  media: "Galería",
  calendar: "Calendario",
  daily: "Cuaderno digital",
  materials: "Materiales",
  assignments: "Tareas",
  invoice: "Factura",
  receipt: "Recibo",
} as const;
export type ViewKind = keyof typeof viewKinds;
export const paymentMethods = {
  cash: "Efectivo",
  qr: "QR",
  transfer: "Transferencia",
  deposit: "Depósito bancario",
} as const;
export function accountTotals(statement: AccountStatement) {
  const active = statement.charges.filter((c) => c.status !== "cancelled");
  const cents = (value: number) => Math.round(Number(value) * 100);
  return {
    issued: active.reduce((n, c) => n + cents(c.amount), 0) / 100,
    paid: active.reduce((n, c) => n + cents(c.paidAmount), 0) / 100,
    balance: active.reduce((n, c) => n + cents(c.balance), 0) / 100,
    pending: active.filter((c) => c.balance > 0).length,
    settled: active.filter((c) => c.balance <= 0).length,
    partial: active.filter((c) => c.balance > 0 && c.paidAmount > 0).length,
  };
}
export function statementRows(statement: AccountStatement) {
  return statement.charges.map((c) => [
    c.concept,
    c.period || "",
    c.dueDate,
    Number(c.amount),
    Number(c.paidAmount),
    Number(c.balance),
    c.status === "cancelled"
      ? "Anulada"
      : c.balance <= 0
        ? "Pagada"
        : c.paidAmount > 0
          ? "Parcial"
          : "Pendiente",
  ]);
}
export const statementHeaders = [
  "Concepto",
  "Mes",
  "Vencimiento",
  "Importe Bs",
  "Abonado Bs",
  "Saldo Bs",
  "Estado",
];
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function accountHtml(statement: AccountStatement) {
  const t = accountTotals(statement);
  return `<html lang="es"><head><meta charset="UTF-8"><title>Estado de cuenta</title><style>body{font:13px Arial;color:#263238;padding:24px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:8px;text-align:left;border-bottom:1px solid #ddd}th{background:#F8FAFF}h1{color:#3D6EF7}@media print{body{padding:0}}</style></head><body><h1>${esc(statement.schoolName)}</h1><h2>Estado de cuenta · ${esc(statement.studentName)}</h2><p>${esc(statement.classroomName)} · ${esc(new Date(statement.generatedAt).toLocaleString("es-BO", { timeZone: "America/La_Paz" }))}</p><p>Emitido: Bs ${t.issued.toFixed(2)} · Abonado: Bs ${t.paid.toFixed(2)} · Pendiente: Bs ${t.balance.toFixed(2)}</p><p>${t.settled} cuotas cubiertas · ${t.partial} con abono parcial · ${t.pending} pendientes</p><table><thead><tr>${statementHeaders.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${statementRows(
    statement,
  )
    .map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`)
    .join(
      "",
    )}</tbody></table><h2>Cobros registrados</h2><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Método</th><th>Referencia</th><th>Importe Bs</th><th>Factura</th></tr></thead><tbody>${statement.receipts.map((r) => `<tr><td>${esc(r.created_at.slice(0, 10))}</td><td>${esc(r.id)}</td><td>${esc(paymentMethods[r.payment_method as keyof typeof paymentMethods] || r.payment_method)}</td><td>${esc(r.reference)}</td><td>${Number(r.total).toFixed(2)}</td><td>${esc(statement.invoices.find((i) => i.receipt_id === r.id)?.invoice_number || "—")}</td></tr>`).join("")}</tbody></table><p>Reporte informativo. Los comprobantes pendientes de revisión no se incluyen como pagos confirmados.</p></body></html>`;
}

export function validateFinancialSupport(value: unknown): FinancialSupport {
  const v = value as Partial<FinancialSupport> | null;
  if (!v || !Array.isArray(v.submissions) || !Array.isArray(v.files))
    throw new Error(
      "No se pudo cargar el registro de comprobantes. Vuelve a intentarlo.",
    );
  return v as FinancialSupport;
}
