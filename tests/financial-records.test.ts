import { describe, it, expect } from "vitest";
import { financialDocumentMatches } from "../supabase/functions/r2-media/financial-document";
import {
  accountTotals,
  accountHtml,
  statementRows,
  type AccountStatement,
} from "../src/lib/financialRecords";
describe("Respaldo financiero", () => {
  it("comprueba la firma del PDF y de imágenes, sin fiarse de la extensión", () => {
    const bytes = (v: string) => new TextEncoder().encode(v);
    expect(
      financialDocumentMatches(
        bytes("%PDF-1.4\n1 0 obj\n%%EOF"),
        "application/pdf",
      ),
    ).toBe(true);
    expect(
      financialDocumentMatches(
        bytes("<script>fake</script>"),
        "application/pdf",
      ),
    ).toBe(false);
    expect(
      financialDocumentMatches(bytes("%PDF-1.4 no end"), "application/pdf"),
    ).toBe(false);
    expect(
      financialDocumentMatches(bytes("%PDF-1.4\n%%EOF"), "image/jpeg"),
    ).toBe(false);
  });
  it("suma abonos sin contar cuotas anuladas y escapa nombres al imprimir", () => {
    const s: AccountStatement = {
      studentName: "<script>bad()</script>",
      schoolName: "Colegio",
      classroomName: "Primero A",
      generatedAt: "2026-10-20T12:00:00Z",
      charges: [
        {
          id: "1",
          concept: "Cuota 1",
          dueDate: "2026-10-01",
          amount: 200,
          paidAmount: 80,
          balance: 120,
          status: "pending",
        },
        {
          id: "2",
          concept: "Cuota 2",
          dueDate: "2026-11-01",
          amount: 200,
          paidAmount: 200,
          balance: 0,
          status: "paid",
        },
        {
          id: "3",
          concept: "Anulada",
          dueDate: "2026-12-01",
          amount: 200,
          paidAmount: 0,
          balance: 0,
          status: "cancelled",
        },
      ],
      receipts: [],
      invoices: [],
    };
    expect(accountTotals(s)).toEqual({
      issued: 400,
      paid: 280,
      balance: 120,
      pending: 1,
      settled: 1,
      partial: 1,
    });
    expect(statementRows(s)[0].at(-1)).toBe("Parcial");
    expect(accountHtml(s)).not.toContain("<script>");
    expect(accountHtml(s)).toContain("&lt;script&gt;");
  });
});
