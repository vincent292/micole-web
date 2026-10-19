import type { AppData } from "./types";
import { chargeStatus, today } from "./billing";

export interface ReportCharge {
  id: string;
  schoolId: string;
  studentId?: string;
  concept: string;
  date: string;
  dueDate?: string;
  amount: number;
  paidAmount?: number;
  status: "pending" | "paid" | "overdue" | "cancelled";
  kind: "tuition" | "license" | "activation" | "credit_topup";
  licenseCount?: number | null;
}
export interface ReportPayment {
  id: string;
  chargeId: string;
  schoolId: string;
  studentId?: string;
  concept: string;
  date: string;
  amount: number;
  method: "cash" | "transfer" | "qr";
  reference: string;
}
export interface ReportSnapshot {
  scope: "school" | "platform";
  fromDate: string;
  toDate: string;
  generatedAt: string;
  schools: { id: string; name: string; status: string }[];
  classrooms: { id: string; name: string }[];
  students: { id: string; name: string; classroomId: string | null; status: string }[];
  charges: ReportCharge[];
  payments: ReportPayment[];
}
export interface ReportFilters {
  schoolId: string;
  from: string;
  to: string;
  classroomId: string;
  studentId: string;
}
const cents = (value: number) => Math.round(value * 100);
const balanceRows = (rows: ReportCharge[]) => rows.map(row => ({amount: Math.max(0, row.amount - (row.paidAmount || 0))}));
const sum = (rows: { amount: number }[]) => rows.reduce((n, row) => n + cents(row.amount), 0) / 100;
export function reportTotals(report: Pick<ReportSnapshot, "charges" | "payments">) {
  return {
    issued: sum(report.charges.filter((row) => row.status !== "cancelled")),
    collected: sum(report.payments),
    outstanding: sum(balanceRows(report.charges.filter((row) => row.status === "pending" || row.status === "overdue"))),
    overdue: sum(balanceRows(report.charges.filter((row) => row.status === "overdue"))),
  };
}
export function reportMonths(report: ReportSnapshot) {
  const result = new Map<string, { month: string; issued: number; collected: number }>();
  const touch = (date: string) => {
    const month = date.slice(0, 7);
    if (!result.has(month)) result.set(month, { month, issued: 0, collected: 0 });
    return result.get(month)!;
  };
  for (const charge of report.charges) if (charge.status !== "cancelled") touch(charge.date).issued += cents(charge.amount);
  for (const payment of report.payments) touch(payment.date).collected += cents(payment.amount);
  return [...result.values()].sort((a, b) => a.month.localeCompare(b.month)).map((row) => ({ ...row, issued: row.issued / 100, collected: row.collected / 100 }));
}
export function lateDays(dueDate: string, asOf = today()) {
  return Math.max(0, Math.floor((Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) / 86400000));
}
export function reportDebtors(report: ReportSnapshot) {
  return report.students.map((student) => {
    const charges = report.charges.filter((row) => row.studentId === student.id && (row.status === "pending" || row.status === "overdue"));
    return { ...student, outstanding: sum(balanceRows(charges)), overdue: sum(balanceRows(charges.filter((row) => row.status === "overdue"))), charges: charges.length, lateDays: Math.max(0, ...charges.filter((row) => row.status === "overdue").map((row) => lateDays(row.dueDate || row.date))) };
  }).filter((student) => student.overdue > 0).sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name));
}
export function validateReportRange(from: string, to: string) {
  const valid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid(from) || !valid(to)) return "Elige una fecha de inicio y una fecha de fin válidas.";
  if (from > to) return "La fecha de inicio debe ser anterior o igual a la fecha de fin.";
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 3660) return "El período máximo del reporte es de 3660 días.";
  return "";
}
export function validReportScope(value: ReportSnapshot, scope: ReportSnapshot["scope"], filters: ReportFilters) {
  if (!value || value.scope !== scope || value.fromDate !== filters.from || value.toDate !== filters.to || ![value.schools, value.classrooms, value.students, value.charges, value.payments].every(Array.isArray)) return false;
  const schools = new Set(value.schools.map((s) => s.id));
  if (filters.schoolId && (schools.size !== 1 || !schools.has(filters.schoolId))) return false;
  if (scope === "platform" && (value.students.length || value.classrooms.length || value.charges.some((c) => "studentId" in c || "dueDate" in c) || value.payments.some((p) => "studentId" in p))) return false;
  const students = new Set(value.students.map((s) => s.id));
  if (scope === "school" && value.students.some((s) => (filters.studentId && s.id !== filters.studentId) || (filters.classroomId && s.classroomId !== filters.classroomId))) return false;
  const allowed = (row: { schoolId: string; studentId?: string; amount: number; date: string; concept: string }) => schools.has(row.schoolId) && (scope === "platform" || (!!row.studentId && students.has(row.studentId))) && Number.isFinite(row.amount) && row.amount >= 0 && typeof row.concept === "string" && !validateReportRange(row.date, row.date) && row.date >= filters.from && row.date <= filters.to;
  return value.charges.every((c) => allowed(c) && ["paid", "pending", "overdue", "cancelled"].includes(c.status)) && value.payments.every((p) => allowed(p) && ["cash", "transfer", "qr"].includes(p.method));
}
export function csvContent(headers: string[], rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    if (typeof value === "number") return String(Number.isFinite(value) ? value : 0);
    // CSV values can be interpreted as spreadsheet formulas, even after whitespace.
    const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(";")).join("\r\n")}\r\n`;
}
/** Local demonstration only; live reports always use the verified payment ledger RPC. */
export function demoReport(data: AppData, scope: ReportSnapshot["scope"], filters: ReportFilters): ReportSnapshot {
  const inPeriod = (date: string) => date >= filters.from && date <= filters.to;
  const inSchool = (id: string) => !filters.schoolId || id === filters.schoolId;
  const schools = data.schools.filter((row) => inSchool(row.id)).map(({ id, name, status }) => ({ id, name, status }));
  const students = scope === "school" ? data.students.filter((row) => inSchool(row.schoolId) && (!filters.classroomId || row.classroomId === filters.classroomId) && (!filters.studentId || row.id === filters.studentId)).map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`, classroomId: row.classroomId, status: row.status })) : [];
  const allowedStudents = new Set(students.map((row) => row.id));
  const charges: ReportCharge[] = scope === "school"
    ? data.charges.filter((row) => inSchool(row.schoolId) && allowedStudents.has(row.studentId) && inPeriod(row.dueDate)).map((row) => ({ id: row.id, schoolId: row.schoolId, studentId: row.studentId, concept: row.concept, date: row.dueDate, dueDate: row.dueDate, amount: row.amount, status: chargeStatus(row), kind: "tuition" }))
    : data.platformCharges.filter((row) => inSchool(row.schoolId) && inPeriod(`${row.period}-01`)).map((row) => ({ id: row.id, schoolId: row.schoolId, concept: row.studentId ? "Activación inicial" : row.concept, date: `${row.period}-01`, amount: row.amount, status: row.status, kind: row.studentId ? "activation" : "license", licenseCount: row.licenseCount ?? (!row.studentId && row.amount % 29 === 0 ? row.amount / 29 : null) }));
  const payments: ReportPayment[] = scope === "school"
    ? data.charges.filter((row) => row.status === "paid" && row.paidAt && inPeriod(row.paidAt.slice(0, 10)) && inSchool(row.schoolId) && allowedStudents.has(row.studentId)).map((row) => ({ id: `demo-${row.id}`, chargeId: row.id, schoolId: row.schoolId, studentId: row.studentId, concept: row.concept, date: row.paidAt!.slice(0, 10), amount: row.amount, method: "transfer", reference: "Registro de ejemplo" }))
    : charges.filter((row) => row.status === "paid").map((row) => ({ id: `demo-${row.id}`, chargeId: row.id, schoolId: row.schoolId, concept: row.concept, date: row.date, amount: row.amount, method: "transfer", reference: "Registro de ejemplo" }));
  return { scope, fromDate: filters.from, toDate: filters.to, generatedAt: new Date().toISOString(), schools, classrooms: scope === "school" ? data.classrooms.filter((row) => inSchool(row.schoolId)).map(({ id, name }) => ({ id, name })) : [], students, charges: charges.sort((a, b) => a.date.localeCompare(b.date)), payments: payments.sort((a, b) => a.date.localeCompare(b.date)) };
}
