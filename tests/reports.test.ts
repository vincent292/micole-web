import { describe, expect, it } from "vitest";
import { csvContent, demoReport, lateDays, reportDebtors, reportMonths, reportTotals, validateReportRange, validReportScope } from "../src/lib/reports";
import type { ReportSnapshot } from "../src/lib/reports";
import { seed } from "../src/lib/seed";

const snapshot: ReportSnapshot = {
  scope: "school", fromDate: "2026-01-01", toDate: "2026-10-14", generatedAt: "2026-10-14T10:00:00Z",
  schools: [{ id: "s", name: "Colegio", status: "active" }], classrooms: [{ id: "c", name: "Primero A" }],
  students: [{ id: "a", name: "Ana", classroomId: "c", status: "active" }],
  charges: [
    { id: "1", schoolId: "s", studentId: "a", date: "2026-01-10", dueDate: "2026-01-10", concept: "Enero", amount: 100.15, status: "paid", kind: "tuition" },
    { id: "2", schoolId: "s", studentId: "a", date: "2026-02-10", dueDate: "2026-02-10", concept: "Febrero", amount: 100.15, status: "overdue", kind: "tuition" },
    { id: "3", schoolId: "s", studentId: "a", date: "2026-10-15", dueDate: "2026-10-15", concept: "Octubre", amount: 100.15, status: "pending", kind: "tuition" },
    { id: "4", schoolId: "s", studentId: "a", date: "2026-02-11", concept: "Anulada", amount: 999, status: "cancelled", kind: "tuition" },
  ],
  payments: [{ id: "p", chargeId: "previous-period", schoolId: "s", studentId: "a", date: "2026-03-01", amount: 200.35, concept: "Cuota anterior", method: "cash", reference: "REC-1" }],
};
describe("cálculos y exportación de reportes", () => {
  it("suma centavos, excluye anulaciones y calcula el cobro desde el ledger", () => {
    expect(reportTotals(snapshot)).toEqual({ issued: 300.45, collected: 200.35, outstanding: 200.3, overdue: 100.15 });
    expect(reportTotals({ charges: [], payments: [] })).toEqual({ issued: 0, collected: 0, outstanding: 0, overdue: 0 });
  });
  it("agrupa ingresos por fecha de cobro aunque su cuota sea de otro período", () => {
    expect(reportMonths(snapshot)).toEqual([
      { month: "2026-01", issued: 100.15, collected: 0 },
      { month: "2026-02", issued: 100.15, collected: 0 },
      { month: "2026-03", issued: 0, collected: 200.35 },
      { month: "2026-10", issued: 100.15, collected: 0 },
    ]);
  });
  it("muestra solo estudiantes con mora, preservando también sus cuotas pendientes", () => {
    expect(reportDebtors(snapshot)[0]).toMatchObject({ id: "a", overdue: 100.15, outstanding: 200.3, charges: 2 });
    expect(lateDays("2026-10-13", "2026-10-14")).toBe(1);
    expect(lateDays("2026-10-14", "2026-10-14")).toBe(0);
    expect(lateDays("2026-10-15", "2026-10-14")).toBe(0);
  });
  it("valida fechas de calendario, orden y máximo de rango", () => {
    expect(validateReportRange("2026-01-01", "2026-12-31")).toBe("");
    expect(validateReportRange("2024-02-29", "2024-02-29")).toBe("");
    for (const [from, to] of [["2026-02-29", "2026-03-01"], ["", "2026-01-01"], ["2026-12-01", "2026-01-01"], ["2000-01-01", "2026-01-01"], ["2026-13-01", "2026-13-02"]]) expect(validateReportRange(from, to)).not.toBe("");
  });
  it("exporta CSV de Excel con acentos, separadores, comillas y saltos escapados", () => {
    expect(csvContent(["Concepto", "Bs"], [['Matrícula; "especial"\nNiña', 29.5]])).toBe('\uFEFF"Concepto";"Bs"\r\n"Matrícula; ""especial""\nNiña";29.5\r\n');
  });
  it("neutraliza fórmulas en textos recibidos de usuarios, manteniendo números", () => {
    const csv = csvContent(["Concepto", "Bs"], [["=HYPERLINK(\"http://x\")", -29], ["  +SUM(1,2)", 0], ["@dato", 10], ["\ttexto", 5], ["Colegio MiCole", 1]]);
    expect(csv).toContain('"\'=HYPERLINK');
    expect(csv).toContain('"\'  +SUM');
    expect(csv).toContain('"\'@dato"');
    expect(csv).toContain('"\'\ttexto"');
    expect(csv).toContain(';-29\r\n');
    expect(csv).toContain('"Colegio MiCole";1');
  });
  it("el demo respeta filtros y conserva cobros anteriores sin divulgar niños en plataforma", () => {
    const data = structuredClone(seed);
    data.charges.push({ ...data.charges[0], id: "old", dueDate: "2025-12-10", status: "paid", paidAt: "2026-10-01", amount: 99 });
    const filters = { schoolId: "s1", from: "2026-10-01", to: "2026-10-14", classroomId: "c1", studentId: "" };
    const result = demoReport(data, "school", filters);
    expect(result.charges.some((c) => c.id === "old")).toBe(false);
    expect(result.payments.some((p) => p.chargeId === "old")).toBe(true);
    expect(result.students.every((s) => s.classroomId === "c1")).toBe(true);
    const platform = demoReport(data, "platform", { ...filters, schoolId: "", classroomId: "" });
    expect(platform.students).toEqual([]);
    expect(platform.classrooms).toEqual([]);
    expect(platform.charges.every((c) => c.studentId === undefined)).toBe(true);
    expect(platform.payments.every((p) => p.studentId === undefined)).toBe(true);
  });
  it("rechaza respuestas de otro acceso, fechas y datos escolares en plataforma", () => {
    const filters = { schoolId: "s", from: snapshot.fromDate, to: snapshot.toDate, classroomId: "", studentId: "" };
    // The sample includes a future charge; allow that date in the validated period.
    const valid = { ...snapshot, toDate: "2026-10-31" };
    const range = { ...filters, to: valid.toDate };
    expect(validReportScope(valid, "school", range)).toBe(true);
    expect(validReportScope(valid, "platform", range)).toBe(false);
    expect(validReportScope(valid, "school", { ...range, schoolId: "other" })).toBe(false);
    expect(validReportScope(valid, "school", { ...range, studentId: "other" })).toBe(false);
    expect(validReportScope({ ...valid, payments: [{ ...valid.payments[0], schoolId: "other" }] }, "school", range)).toBe(false);
    expect(validReportScope({ ...valid, charges: [{ ...valid.charges[0], amount: Number.NaN }] }, "school", range)).toBe(false);
    expect(validReportScope({ ...valid, scope: "platform", classrooms: [], students: [] }, "platform", range)).toBe(false);
  });
});
