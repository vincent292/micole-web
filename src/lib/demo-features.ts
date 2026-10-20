/** Local adapters for the public demonstration. No network, real email or money. */
import { demoAccounts, demoRole } from "./demo-config";
import { readDemoData, readDemoWorkspace, writeDemoData } from "./demo";
import { chargeBalance } from "./operations";
import { today } from "./billing";
import {
  viewKinds,
  type ViewRow,
  type PaymentSubmission,
} from "./financialRecords";
import type { Announcement, Student } from "./types";
import type { AnnouncementReceipt, AnnouncementView } from "./announcements";
import type { StoredTemplate } from "./documentApi";
import type { DocumentDraft, DocumentKind } from "./documentImport";
const key = "micole_public_demo_features_v1";
interface LocalFile {
  id: string;
  parentId: string;
  kind: "invoice" | "payment_evidence";
  fileName: string;
  mimeType: string;
  url: string;
}
interface State {
  receipts: Record<
    string,
    Record<string, { readAt?: string; acknowledgedAt?: string }>
  >;
  submissions: (Omit<PaymentSubmission, "status"> & {
    status: PaymentSubmission["status"] | "draft";
  })[];
  files: LocalFile[];
  views: ViewRow[];
  templates: Record<string, StoredTemplate>;
}
const stamp = () => new Date().toISOString();
function read(): State {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    if (v)
      return {
        receipts: {},
        submissions: [],
        files: [],
        views: [],
        templates: {},
        ...v,
      };
  } catch {}
  return { receipts: {}, submissions: [], files: [], views: [], templates: {} };
}
function write(s: State) {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    throw new Error(
      "No queda espacio local. Restablece la demo o usa archivos más pequeños.",
    );
  }
}
function actor() {
  const a = demoAccounts.find((a) => a.role === demoRole());
  if (!a) throw new Error("Entra primero a la demo.");
  return a;
}
function director() {
  if (actor().role !== "director")
    throw new Error("Esta acción corresponde a Dirección.");
}
function financialStudent(id: string) {
  const data = readDemoData(),
    a = actor(),
    s = data.students.find((s) => s.id === id);
  if (
    !s ||
    !["director", "guardian"].includes(a.role) ||
    (a.role === "guardian" &&
      ![s.motherEmail, s.fatherEmail, s.guardianEmail].includes(a.email))
  )
    throw new Error("Este estudiante no está disponible para tu perfil.");
  return s;
}
function children() {
  const a = actor(),
    data = readDemoData();
  return data.students.filter(
    (s) =>
      a.role === "director" ||
      (a.role === "teacher" &&
        data.classrooms.some(
          (c) =>
            c.id === s.classroomId &&
            c.teacherIds.some(
              (t) => data.teachers.find((x) => x.id === t)?.email === a.email,
            ),
        )) ||
      (a.role === "guardian" &&
        [s.motherEmail, s.fatherEmail, s.guardianEmail].includes(a.email)) ||
      (a.role === "student" && s.id === "a1"),
  );
}
function targeted(n: Announcement, s: Student) {
  return (
    (!n.classroomId || n.classroomId === s.classroomId) &&
    ((!n.targeted && !n.targetStudentIds?.length) ||
      !!n.targetStudentIds?.includes(s.id))
  );
}
function notice(id: string): AnnouncementView {
  const a = actor(),
    n = readDemoData().announcements.find((n) => n.id === id && !n.revokedAt);
  const staff = ["director", "teacher"].includes(a.role);
  if (
    !n ||
    n.schoolId !== "s1" ||
    (a.role !== "director" &&
      !(
        n.createdBy === `demo-${a.role}` ||
        ((n.audience === "all" ||
          n.audience === (staff ? "staff" : "families")) &&
          children().some((s) => targeted(n, s)))
      ))
  )
    throw new Error("Este aviso no está disponible.");
  const own = n.createdBy === `demo-${a.role}`;
  return {
    ...n,
    ...read().receipts[a.email]?.[id],
    canManage: a.role === "director" || (a.role === "teacher" && own),
    canAcknowledge:
      !own &&
      a.role !== "student" &&
      (n.audience === "all" || n.audience === (staff ? "staff" : "families")),
  };
}
function report(n: Announcement): AnnouncementReceipt[] {
  const d = readDemoData(),
    state = read(),
    expected = new Map<string, AnnouncementReceipt>();
  if (n.audience !== "staff")
    for (const s of d.students.filter(
      (s) =>
        s.schoolId === n.schoolId && targeted(n, s) && s.status !== "inactive",
    )) {
      for (const [email, name] of [
        [s.motherEmail, s.motherName],
        [s.fatherEmail, s.fatherName],
      ]) {
        if (!email) continue;
        const r = expected.get(email) || {
          email,
          name: name || email,
          children: [],
          accountPending: email !== "familia@micole.test",
          ...state.receipts[email]?.[n.id],
        };
        r.children = [
          ...new Set([...(r.children || []), `${s.firstName} ${s.lastName}`]),
        ];
        expected.set(email, r);
      }
    }
  if (n.audience !== "families")
    for (const t of d.teachers.filter(
      (t) =>
        t.schoolId === n.schoolId &&
        (!n.classroomId ||
          d.classrooms.some(
            (c) => c.id === n.classroomId && c.teacherIds.includes(t.id),
          )),
    )) {
      if (n.createdBy === "demo-teacher" && t.email === "docente@micole.test")
        continue;
      expected.set(t.email, {
        email: t.email,
        name: t.name,
        children: [],
        accountPending: t.email !== "docente@micole.test",
        ...state.receipts[t.email]?.[n.id],
      });
    }
  return [...expected.values()];
}
export const demoFeatureOperations = [
  "pending_announcements",
  "announcement_view",
  "read_announcement",
  "announcement_report",
  "withdraw_announcement",
  "student_account_statement",
  "financial_support_register",
  "create_payment_submission",
  "submit_payment_submission",
  "review_payment_submission",
  "record_content_view",
  "content_view_report",
  "demo_admission_template", "student_admission_template",
  "save_admission_template",
];
export async function demoFeatureRpc(
  name: string,
  parameters: object,
): Promise<unknown> {
  const p = parameters as Record<string, any>,
    a = actor(),
    d = readDemoData(),
    state = read();
  switch (name) {
    case "announcement_view":
      return notice(p.p_id);
    case "pending_announcements":
      return d.announcements
        .filter((n) => n.schoolId === (p.p_school_id || "s1"))
        .flatMap((n) => {
          try {
            const v = notice(n.id);
            return v.canAcknowledge &&
              ((v.requiresAcknowledgment && !v.acknowledgedAt) ||
                (["health", "pickup"].includes(v.category || "") && !v.readAt))
              ? [v]
              : [];
          } catch {
            return [];
          }
        });
    case "read_announcement": {
      const n = notice(p.p_id);
      if (!n.canAcknowledge) return n;
      state.receipts[a.email] ||= {};
      const r = state.receipts[a.email][n.id] || {};
      state.receipts[a.email][n.id] = {
        readAt: r.readAt || stamp(),
        acknowledgedAt:
          r.acknowledgedAt ||
          (p.p_agree && n.requiresAcknowledgment ? stamp() : undefined),
      };
      write(state);
      return notice(n.id);
    }
    case "announcement_report": {
      const n = notice(p.p_id);
      if (!n.canManage)
        throw new Error(
          "Solo Dirección o el docente autor puede consultar este reporte.",
        );
      return report(n);
    }
    case "withdraw_announcement": {
      const n = notice(p.p_id);
      if (!n.canManage) throw new Error("No puedes retirar este aviso.");
      d.announcements = d.announcements.map((v) =>
        v.id === n.id ? { ...v, revokedAt: stamp() } : v,
      );
      writeDemoData(d, true);
      return null;
    }
    case "student_account_statement": {
      const s = financialStudent(p.p_student_id);
      return {
        studentName: `${s.firstName} ${s.lastName}`,
        schoolName: d.schools.find((v) => v.id === s.schoolId)?.name || "",
        classroomName:
          d.classrooms.find((v) => v.id === s.classroomId)?.name || "",
        generatedAt: stamp(),
        charges: d.charges
          .filter((c) => c.studentId === s.id)
          .map((c) => ({
            ...c,
            paidAmount: c.paidAmount || 0,
            balance: chargeBalance(c),
          })),
        receipts: d.schoolReceipts
          .filter((r) => r.studentId === s.id)
          .map((r) => ({
            ...r,
            payment_method: r.paymentMethod,
            created_at: r.createdAt,
          })),
        invoices: d.invoiceRequests
          .filter((i) => i.studentId === s.id)
          .map((i) => ({
            ...i,
            receipt_id: i.receiptId,
            invoice_number: i.invoiceNumber,
            files:
              i.status === "issued" || a.role === "director"
                ? state.files
                    .filter((f) => f.kind === "invoice" && f.parentId === i.id)
                    .map(({ id, fileName, mimeType }) => ({
                      id,
                      fileName,
                      mimeType,
                    }))
                : [],
          })),
      };
    }
    case "financial_support_register": {
      const ids = p.p_student_id
        ? [financialStudent(p.p_student_id).id]
        : a.role === "director"
          ? d.students.map((s) => s.id)
          : children()
              .filter(() => a.role === "guardian")
              .map((s) => s.id);
      const list = state.submissions
        .filter(
          (s) =>
            ids.includes(s.student_id) &&
            s.school_id === p.p_school_id &&
            s.status !== "draft",
        )
        .slice(-100)
        .reverse();
      return {
        submissions: list,
        files: state.files
          .filter(
            (f) =>
              f.kind === "payment_evidence" &&
              list.some((s) => s.id === f.parentId),
          )
          .map((f) => ({
            id: f.id,
            submission_id: f.parentId,
            file_name: f.fileName,
            mime_type: f.mimeType,
          })),
      };
    }
    case "create_payment_submission": {
      const s = financialStudent(p.p_student_id);
      const existing = state.submissions.find((s) => s.id === p.p_id);
      if (existing) {
        if (existing.student_id !== s.id)
          throw new Error("Comprobante inválido.");
        return existing.id;
      }
      if (
        !["deposit", "transfer"].includes(p.p_method) ||
        !String(p.p_reference || "").trim()
      )
        throw new Error("Indica el método y la referencia bancaria.");
      const items = p.p_items as { chargeId: string; amount: number }[];
      if (
        !Array.isArray(items) ||
        !items.length ||
        new Set(items.map((i) => i.chargeId)).size !== items.length
      )
        throw new Error("Selecciona cuotas válidas.");
      for (const i of items) {
        const c = d.charges.find(
          (c) =>
            c.id === i.chargeId &&
            c.studentId === s.id &&
            c.status !== "cancelled",
        );
        if (
          !c ||
          !Number.isFinite(i.amount) ||
          i.amount <= 0 ||
          i.amount > chargeBalance(c)
        )
          throw new Error("Revisa el importe pendiente de la cuota.");
      }
      state.submissions.push({
        id: p.p_id,
        school_id: s.schoolId,
        student_id: s.id,
        items: structuredClone(items),
        payment_method: p.p_method,
        reference: p.p_reference,
        paid_on: p.p_paid_on,
        status: "draft",
        review_note: "",
        created_at: stamp(),
        invoice_details: p.p_invoice || {},
      });
      write(state);
      return p.p_id;
    }
    case "submit_payment_submission": {
      const s = state.submissions.find((s) => s.id === p.p_id);
      if (!s) throw new Error("Comprobante no encontrado.");
      financialStudent(s.student_id);
      if (
        !state.files.some(
          (f) => f.kind === "payment_evidence" && f.parentId === s.id,
        )
      )
        throw new Error("Adjunta el comprobante.");
      if (s.status === "draft") s.status = "pending";
      write(state);
      return s.id;
    }
    case "review_payment_submission": {
      director();
      const s = state.submissions.find((s) => s.id === p.p_id);
      if (!s || s.status === "draft")
        throw new Error("Comprobante no disponible.");
      if (s.status === "approved") return s.receipt_id;
      if (s.status !== "pending")
        throw new Error("Este comprobante ya fue revisado.");
      if (!p.p_approve) {
        if (!String(p.p_note || "").trim())
          throw new Error("Indica el motivo.");
        s.status = "rejected";
        s.review_note = p.p_note;
        write(state);
        return null;
      }
      for (const i of s.items) {
        const c = d.charges.find(
          (c) => c.id === i.chargeId && c.studentId === s.student_id,
        );
        if (!c || c.status === "cancelled" || i.amount > chargeBalance(c))
          throw new Error(
            "El saldo cambió. Revisa las cuotas antes de confirmar.",
          );
      }
      s.receipt_id = crypto.randomUUID();
      s.status = "approved";
      s.review_note = p.p_note || "";
      const total =
        Math.round(s.items.reduce((v, i) => v + i.amount, 0) * 100) / 100;
      for (const i of s.items) {
        const c = d.charges.find((c) => c.id === i.chargeId)!;
        c.paidAmount = Math.round(((c.paidAmount || 0) + i.amount) * 100) / 100;
        if (chargeBalance(c) <= 0) {
          c.status = "paid";
          c.paidAt = today();
        }
      }
      d.schoolReceipts.push({
        id: s.receipt_id,
        schoolId: s.school_id,
        studentId: s.student_id,
        total,
        paymentMethod: s.payment_method,
        reference: s.reference,
        items: s.items.map((i) => ({
          ...i,
          concept: d.charges.find((c) => c.id === i.chargeId)!.concept,
        })),
        verificationSource: "manual",
        recordedBy: "demo-director",
        createdAt: stamp(),
      });
      if (s.invoice_details.invoiceName)
        d.invoiceRequests.push({
          id: crypto.randomUUID(),
          schoolId: s.school_id,
          studentId: s.student_id,
          receiptId: s.receipt_id,
          amount: total,
          legalName: s.invoice_details.invoiceName,
          nitCi: s.invoice_details.invoiceNit,
          phone: s.invoice_details.invoicePhone,
          status: "pending",
          invoiceNumber: "",
          createdAt: stamp(),
        } as (typeof d.invoiceRequests)[number]);
      write(state);
      writeDemoData(d, true);
      return s.receipt_id;
    }
    case "record_content_view": {
      const kind = p.p_kind as keyof typeof viewKinds;
      if (!(kind in viewKinds)) throw new Error("Contenido inválido.");
      if (
        state.views.some(
          (v) => v.id === p.p_id || v.id.startsWith(`${p.p_id}:`),
        )
      )
        return null;
      let studentId = "",
        title = viewKinds[kind] as string,
        content: unknown = p.p_content_id;
      if (kind === "grade") {
        const g = d.grades.find((v) => v.id === p.p_content_id);
        if (!g) return null;
        studentId = g.studentId;
        title = g.subject;
        content = g;
      }
      if (kind === "media") {
        const m = d.media.find((v) => v.id === p.p_content_id);
        if (!m) return null;
        studentId = m.studentId;
        title = m.caption;
        content = m;
      }
      if (kind === "report_card") {
        const c = readDemoWorkspace().cards.find(
          (v) => v.id === p.p_content_id,
        );
        if (!c) return null;
        studentId = c.studentId;
        title = c.content.termName;
        content = c;
      }
      if (kind === "invoice") {
        const i = d.invoiceRequests.find((v) => v.id === p.p_content_id);
        if (!i) return null;
        studentId = i.studentId;
        title = `Factura ${i.invoiceNumber || "de ejemplo"}`;
        content = i;
      }
      if (kind === "receipt") {
        const r = d.schoolReceipts.find((v) => v.id === p.p_content_id);
        if (!r) return null;
        studentId = r.studentId;
        title = `Recibo ${r.reference}`;
        content = r;
      }
      const visible = children().filter(
        (s) => !studentId || s.id === studentId,
      );
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(content)),
      );
      const contentHash = Array.from(new Uint8Array(bytes), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
      const latest = read();
      for (const s of visible)
        latest.views.push({
          id: visible.length === 1 ? p.p_id : `${p.p_id}:${s.id}`,
          studentId: s.id,
          studentName: `${s.firstName} ${s.lastName}`,
          classroomName:
            d.classrooms.find((c) => c.id === s.classroomId)?.name || "",
          viewerName: a.name,
          viewerRole: a.role,
          kind,
          contentId: p.p_content_id,
          title,
          viewedAt: stamp(),
          action: p.p_action || "open",
          client: "web · demo local",
          contentHash,
        });
      latest.views = latest.views.slice(-2000);
      write(latest);
      return null;
    }
    case "content_view_report": {
      if (!["director", "teacher"].includes(a.role))
        throw new Error("El historial corresponde a Dirección o Docente.");
      const ids = children().map((s) => s.id),
        list = state.views
          .filter(
            (v) =>
              ids.includes(v.studentId) &&
              (!p.p_student_id || v.studentId === p.p_student_id) &&
              (!p.p_kind || v.kind === p.p_kind) &&
              (!p.p_from || v.viewedAt.slice(0, 10) >= p.p_from) &&
              (!p.p_to || v.viewedAt.slice(0, 10) <= p.p_to),
          )
          .reverse();
      return {
        total: list.length,
        rows: list.slice(
          p.p_offset || 0,
          (p.p_offset || 0) + (p.p_limit || 50),
        ),
      };
    }
    case "student_admission_template": {
      const s = children().find(s=>s.id===p.p_student_id);if(!s)throw new Error("Ficha no disponible para este perfil.");
      const year=d.classrooms.find(c=>c.id===s.classroomId)?.academicYear||Number(today().slice(0,4));
      return state.templates[`${s.schoolId}:${year}`]||null;
    }
    case "demo_admission_template":
      return state.templates[`${p.p_school_id}:${p.p_year}`] || null;
    case "save_admission_template": {
      director();
      const k = `${p.p_school_id}:${p.p_year}`,
        old = state.templates[k];
      if ((old?.revision || 0) !== p.p_expected_revision)
        throw new Error(
          "El formulario cambió. Recarga para revisar la última versión.",
        );
      state.templates[k] = {
        ...p.p_template,
        revision: (old?.revision || 0) + 1,
      };
      write(state);
      return null;
    }
    default:
      throw new Error("Operación no disponible en esta demo.");
  }
}
export async function uploadDemoFinancial(
  file: File,
  kind: LocalFile["kind"],
  parentId: string,
) {
  actor();
  if (file.size > 1024 * 1024)
    throw new Error("En la demo usa documentos ficticios de hasta 1 MB.");
  const state = read(),
    d = readDemoData();
  if (kind === "invoice") {
    director();
    if (!d.invoiceRequests.some((i) => i.id === parentId))
      throw new Error("Factura no encontrada.");
  } else {
    const s = state.submissions.find(
      (s) => s.id === parentId && s.status === "draft",
    );
    if (!s) throw new Error("El comprobante ya se envió o no está disponible.");
    financialStudent(s.student_id);
  }
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(new Error("No se pudo leer el archivo local."));
    reader.readAsDataURL(file);
  });
  const id = crypto.randomUUID();
  state.files.push({
    id,
    parentId,
    kind,
    fileName: file.name,
    mimeType: file.type,
    url,
  });
  write(state);
  if (kind === "invoice") {
    const i = d.invoiceRequests.find((i) => i.id === parentId)!;
    i.files = [
      ...(i.files || []),
      { id, fileName: file.name, mimeType: file.type },
    ];
    writeDemoData(d, true);
  }
  return id;
}
export async function downloadDemoFinancial(id: string) {
  const state = read(),
    f = state.files.find((f) => f.id === id),
    d = readDemoData();
  if (!f) throw new Error("Documento local no encontrado.");
  if (f.kind === "invoice") {
    const i = d.invoiceRequests.find((i) => i.id === f.parentId);
    if (!i) throw new Error("Factura no encontrada.");
    financialStudent(i.studentId);
    if (actor().role !== "director" && i.status !== "issued")
      throw new Error("La factura todavía no fue emitida.");
    await demoFeatureRpc("record_content_view", {
      p_id: crypto.randomUUID(),
      p_kind: "invoice",
      p_content_id: i.id,
      p_action: "download",
    });
  } else {
    const s = state.submissions.find((s) => s.id === f.parentId);
    if (!s) throw new Error("Comprobante no encontrado.");
    financialStudent(s.student_id);
  }
  const binary = atob(f.url.split(",")[1]);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mimeType }));
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { id, url, fileName: f.fileName };
}
export function sampleDocumentDraft(
  year: number,
  kind: DocumentKind,
): DocumentDraft {
  director();
  const base = {
    kind,
    year,
    title:
      kind === "form"
        ? "Ficha de inscripción · Ejemplo de demostración"
        : "Calendario anual · Ejemplo de demostración",
    warnings: [
      "INTERPRETACIÓN SIMULADA: este ejemplo no se extrajo de tu archivo. En la plataforma real Gemini interpreta el documento y Dirección revisa antes de publicar.",
    ],
    sourceHash: "demo-simulated-sample",
  };
  return kind === "form"
    ? {
        ...base,
        instructions:
          "Ejemplo local. Completa los contactos de emergencia y las necesidades de cuidado.",
        fields: [
          {
            key: "demo_emergency_clinic",
            label: "Centro de salud de preferencia en una emergencia",
            section: "Emergencias",
            type: "text",
            required: true,
            options: [],
            source: "Pregunta de ejemplo, no extraída del archivo",
          },
          {
            key: "demo_care_routine",
            label: "Rutina de cuidado que debemos conocer",
            section: "Cuidados",
            type: "textarea",
            required: false,
            options: [],
            source: "Pregunta de ejemplo, no extraída del archivo",
          },
        ],
      }
    : {
        ...base,
        events: [
          {
            title: "Encuentro de familias · Demo",
            date: `${year}-10-25`,
            endDate: "",
            description:
              "Actividad ficticia para probar la revisión y la publicación en agenda.",
            source: "Actividad de ejemplo, no extraída del archivo",
          },
          {
            title: "Feria de aprendizaje · Demo",
            date: `${year}-11-15`,
            endDate: "",
            description: "Presentación de trabajos de los cursos.",
            source: "Actividad de ejemplo, no extraída del archivo",
          },
        ],
      };
}
