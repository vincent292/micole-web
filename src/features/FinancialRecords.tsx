import { useWorkspaceRevision } from "../lib/useWorkspaceRevision";
import "../styles/financial-records.css";
import { useEffect, useState } from "react";
import { Button, Field, Modal, SectionTitle, Empty } from "../components/UI";
import { rpc } from "../lib/repository";
import { publicDemo } from "../lib/demo-config";
import { liveMode } from "../lib/supabase";
import { dateLabel, money, uid } from "../lib/format";
import { today } from "../lib/billing";
import {
  accountHtml,
  accountTotals,
  statementRows,
  statementHeaders,
  paymentMethods,
  type AccountStatement,
  type FinancialSupport,
  type FinancialFileLink,
  type PaymentSelection,
  type PaymentSubmission,
} from "../lib/financialRecords";
import {
  downloadFinancial,
  exportTable,
  loadFinancialSupport,
  sendPaymentEvidence,
  uploadFinancial,
} from "../lib/financialApi";
import type { PageProps } from "./Pages";
export function AccountStatementButton({ studentId }: { studentId: string }) {
  const [data, setData] = useState<AccountStatement | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setError("");
    try {
      if (!liveMode && !publicDemo)
        throw new Error(
          "El estado de cuenta completo está disponible en una institución conectada.",
        );
      setData(
        await rpc("student_account_statement", { p_student_id: studentId }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const totals = data ? accountTotals(data) : null;
  return (
    <>
      <Button
        variant="secondary"
        disabled={!studentId || busy}
        onClick={() => void load()}
      >
        Estado de cuenta por niño
      </Button>
      {error && !data && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {data && totals && (
        <Modal
          title={`Estado de cuenta · ${data.studentName}`}
          onClose={() => setData(null)}
          onSubmit={(e) => {
            e.preventDefault();
            setData(null);
          }}
          submitLabel="Cerrar"
          error={error}
        >
          <p>
            {data.schoolName} · {data.classroomName}
          </p>
          <div className="soft-note">
            <b>
              Abonado: {money(totals.paid)} · Pendiente: {money(totals.balance)}
            </b>
            <p>
              {totals.settled} cuotas cubiertas · {totals.partial} parciales ·{" "}
              {totals.pending} pendientes
            </p>
          </div>
          <div className="notice-management">
            <Button
              variant="secondary"
              onClick={() =>
                exportTable(
                  "estado-de-cuenta.csv",
                  statementHeaders,
                  statementRows(data),
                )
              }
            >
              Exportar cuotas CSV
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const popup = window.open("", "_blank");
                if (!popup) {
                  setError(
                    "Permite abrir la ventana de impresión para guardar el PDF.",
                  );
                  return;
                }
                popup.document.write(accountHtml(data));
                popup.document.close();
                popup.focus();
                popup.print();
              }}
            >
              Imprimir / guardar PDF
            </Button>
          </div>
          <div className="responsive-table statement-table">
            <table>
              <thead>
                <tr>
                  {statementHeaders.map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {statementRows(data).map((row, i) => (
                  <tr key={data.charges[i].id}>
                    {row.map((v, j) => (
                      <td key={j}>{typeof v === "number" ? money(v) : v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="statement-mobile">
            {data.charges.map((c) => (
              <article key={c.id} className="statement-line">
                <strong>{c.concept}</strong>
                <small>
                  {dateLabel(c.dueDate)} ·{" "}
                  {c.status === "cancelled"
                    ? "Anulada"
                    : c.balance <= 0
                      ? "Pagada"
                      : c.paidAmount > 0
                        ? "Parcial"
                        : "Pendiente"}
                </small>
                <div>
                  <span>
                    Total <b>{money(c.amount)}</b>
                  </span>
                  <span>
                    Abonado <b>{money(c.paidAmount)}</b>
                  </span>
                  <span>
                    Saldo <b>{money(c.balance)}</b>
                  </span>
                </div>
              </article>
            ))}
          </div>
          <h3>Cobros registrados</h3>
          {data.receipts.map((r) => (
            <div className="soft-note" key={r.id}>
              {dateLabel(r.created_at)} ·{" "}
              {paymentMethods[r.payment_method as keyof typeof paymentMethods]}{" "}
              · {money(Number(r.total))}
              <p>
                Referencia: {r.reference} · Recibo{" "}
                {r.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
          ))}
          <h3>Facturas</h3>
          {data.invoices.map((i) => (
            <div key={i.id}>
              <p>
                {i.invoice_number || "Pendiente de emisión"} ·{" "}
                {money(Number(i.amount))}
              </p>
              {i.files.map((f) => (
                <Button
                  key={f.id}
                  variant="ghost"
                  onClick={() =>
                    void downloadFinancial(f.id).catch((e) =>
                      setError(e.message),
                    )
                  }
                >
                  Descargar {f.fileName}
                </Button>
              ))}
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
export function InvoiceAttachments({
  invoiceId,
  files = [],
  canUpload,
  onChanged,
}: {
  invoiceId: string;
  files?: FinancialFileLink[];
  canUpload: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="financial-attachments">
      {files.map((file) => (
        <Button
          key={file.id}
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setError("");
            setBusy(true);
            void downloadFinancial(file.id)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Descargar factura · {file.fileName}
        </Button>
      ))}
      {canUpload && (
        <label className="field">
          <span>
            Adjuntar factura PDF o foto ·{" "}
            {publicDemo ? "hasta 1 MB en esta demo" : "hasta 5 MB"}
          </span>
          <input
            type="file"
            disabled={busy || (!liveMode && !publicDemo)}
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-label="Adjuntar factura"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setError("");
              setBusy(true);
              void uploadFinancial(file, "invoice", invoiceId)
                .then(onChanged)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          />
        </label>
      )}
      {busy && <small role="status">Procesando documento…</small>}
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
    </div>
  );
}
export function PaymentEvidencePanel({
  schoolId,
  studentId,
  role,
  items,
  revision: _revision,
  onChanged,
}: {
  schoolId?: string;
  studentId: string;
  role: PageProps["role"];
  items: PaymentSelection;
  revision: unknown;
  onChanged: () => void;
}) {
  const [data, setData] = useState<FinancialSupport>({
      submissions: [],
      files: [],
    }),
    [error, setError] = useState(""),
    [edit, setEdit] = useState(false),
    [review, setReview] = useState<PaymentSubmission | null>(null),
    [busy, setBusy] = useState(false),
    [version, setVersion] = useState(0),
    [file, setFile] = useState<File | null>(null),
    [invoice, setInvoice] = useState(false),
    [approve, setApprove] = useState(true),
    [verified, setVerified] = useState(false),
    [requestId, setRequestId] = useState(uid());
  const supportRevision = useWorkspaceRevision(["financial_files", "payment_submissions", "school_receipts", "invoice_requests"], schoolId);
  useEffect(() => {
    if (!schoolId || !studentId || !["guardian", "director"].includes(role))
      return;
    let active = true;
    void loadFinancialSupport(schoolId, studentId)
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [schoolId, studentId, role, supportRevision, version]);
  if (!["guardian", "director"].includes(role) || !studentId) return null;
  const changed = () => {
    setVersion((n) => n + 1);
    onChanged();
  };
  return (
    <section className="panel">
      <SectionTitle
        title="Comprobantes de depósito y transferencia"
        subtitle="Dirección verifica el ingreso antes de aplicarlo a las cuotas. Se muestran los últimos 100 comprobantes del niño."
        action={
          <Button
            disabled={!items.length || (!liveMode && !publicDemo)}
            onClick={() => {
              setEdit(true);
              setRequestId(uid());
              setFile(null);
              setInvoice(false);
              setError("");
            }}
          >
            Informar pago realizado
          </Button>
        }
      />
      {error && !edit && !review && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {!data.submissions.length && (
        <Empty
          title="Sin comprobantes enviados"
          subtitle="Para informar un depósito, selecciona las cuotas y los importes abonados arriba."
        />
      )}
      {data.submissions.map((s) => (
        <article className="soft-note" key={s.id}>
          <b>
            {paymentMethods[s.payment_method]} ·{" "}
            {money(s.items.reduce((n, i) => n + Number(i.amount), 0))}
          </b>
          <p>
            {dateLabel(s.paid_on)} · Ref. {s.reference} ·{" "}
            {s.status === "approved"
              ? "Aprobado"
              : s.status === "rejected"
                ? "Observado"
                : "Pendiente de verificación"}
          </p>
          {s.review_note && <p>{s.review_note}</p>}
          {data.files
            .filter((f) => f.submission_id === s.id)
            .map((f) => (
              <Button
                key={f.id}
                variant="ghost"
                onClick={() =>
                  void downloadFinancial(f.id).catch((e) => setError(e.message))
                }
              >
                Ver comprobante · {f.file_name}
              </Button>
            ))}
          {role === "director" && s.status === "pending" && (
            <Button
              variant="secondary"
              onClick={() => {
                setReview(s);
                setApprove(true);
                setVerified(false);
                setError("");
              }}
            >
              Revisar ingreso
            </Button>
          )}
        </article>
      ))}
      {edit && (
        <Modal
          title="Informar depósito o transferencia"
          busy={busy}
          error={error}
          onClose={() => setEdit(false)}
          submitLabel="Enviar para verificación"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget),
              text = (key: string) => String(form.get(key) || "").trim();
            if (!file) {
              setError("Adjunta la foto o PDF del comprobante.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await sendPaymentEvidence({
                id: requestId,
                studentId,
                items,
                method: text("method") as "deposit" | "transfer",
                reference: text("reference"),
                paidOn: text("paidOn"),
                invoice: invoice
                  ? {
                      invoiceName: text("invoiceName"),
                      invoiceNit: text("invoiceNit"),
                      invoicePhone: text("invoicePhone"),
                    }
                  : {},
                file,
              });
              setEdit(false);
              changed();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Total declarado:{" "}
            <b>{money(items.reduce((n, i) => n + i.amount, 0))}</b>. El saldo se
            actualizará tras la revisión.
          </p>
          <Field label="Método" name="method">
            <select name="method">
              <option value="deposit">Depósito bancario</option>
              <option value="transfer">Transferencia</option>
            </select>
          </Field>
          <Field
            label="Fecha del pago"
            name="paidOn"
            type="date"
            required
            defaultValue={today()}
            max={today()}
          />
          <Field label="Referencia bancaria" name="reference" required />
          <Field label="Comprobante PDF o foto" name="proof">
            <input
              aria-label="Comprobante PDF o foto"
              type="file"
              required
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </Field>
          <label className="check-field">
            <input
              type="checkbox"
              checked={invoice}
              onChange={(e) => setInvoice(e.target.checked)}
            />{" "}
            Necesito factura
          </label>
          {invoice && (
            <>
              <Field
                label="Nombre o razón social"
                name="invoiceName"
                required
              />
              <Field label="NIT o CI" name="invoiceNit" required />
              <Field
                label="Celular para factura"
                name="invoicePhone"
                required
                type="tel"
              />
            </>
          )}
        </Modal>
      )}
      {review && (
        <Modal
          title="Verificar ingreso bancario"
          busy={busy}
          error={error}
          submitLabel={
            approve
              ? "Confirmar ingreso y aplicar abonos"
              : "Guardar observación"
          }
          submitDisabled={approve && !verified}
          onClose={() => setReview(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError("");
            try {
              await rpc("review_payment_submission", {
                p_id: review.id,
                p_approve: approve,
                p_note: String(form.get("note") || ""),
              });
              setReview(null);
              changed();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            {review.reference} ·{" "}
            {money(review.items.reduce((n, i) => n + Number(i.amount), 0))}
          </p>
          <Field label="Decisión" name="decision">
            <select
              value={approve ? "approve" : "reject"}
              onChange={(e) => setApprove(e.target.value === "approve")}
            >
              <option value="approve">El ingreso está confirmado</option>
              <option value="reject">No se pudo verificar</option>
            </select>
          </Field>
          {approve && (
            <label className="check-field">
              <input
                type="checkbox"
                checked={verified}
                onChange={(e) => setVerified(e.target.checked)}
              />{" "}
              Verifiqué el ingreso real en la cuenta de la institución
            </label>
          )}
          <Field
            label={
              approve ? "Observación (opcional)" : "Motivo de la observación"
            }
            name="note"
          >
            <textarea
              name="note"
              required={!approve}
              minLength={approve ? 0 : 5}
              maxLength={1000}
            />
          </Field>
        </Modal>
      )}
    </section>
  );
}
