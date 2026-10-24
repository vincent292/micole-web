export interface WorkShift {
  weekday: number;
  start: string;
  end: string;
  breakMinutes: number;
}
export interface StaffSettings {
  school_id: string;
  arrival_enabled: boolean;
  latitude: number;
  longitude: number;
  radius_m: number;
  max_accuracy_m: number;
  tolerance_minutes: number;
  late_mode: "excess" | "all_after_tolerance";
  late_rate: number;
  deductions_enabled: boolean;
  policy_note: string;
}
export interface StaffProfile {
  id: string;
  school_id: string;
  teacher_id: string;
  pay_type: "monthly" | "hourly";
  monthly_salary: number;
  hourly_rate: number;
  active: boolean;
  schedule: WorkShift[];
}
export interface StaffRecord {
  id: string;
  school_id: string;
  teacher_id: string;
  attendance_date: string;
  shift_key: string;
  scheduled_start: string;
  scheduled_end: string;
  check_in: string;
  check_out: string | null;
  worked_minutes: number;
  hourly_rate?: number;
  late_minutes: number;
  break_minutes: number;
  tolerance_minutes: number;
  late_mode: StaffSettings["late_mode"];
  late_rate: number;
  deductions_enabled: boolean;
  late_waived: boolean;
  source: "gps" | "manual";
  note: string;
  entry_accuracy?: number;
  exit_accuracy?: number;
}
export interface PayrollAdjustment {
  kind: "earning" | "deduction";
  label: string;
  amount: number;
}
export interface StaffPayroll {
  id: string;
  school_id: string;
  teacher_id: string;
  period: string;
  status: "draft" | "approved" | "paid";
  worked_minutes: number;
  late_minutes: number;
  base_amount: number;
  late_deduction: number;
  adjustments: PayrollAdjustment[];
  gross_amount: number;
  deductions: number;
  net_amount: number;
  note: string;
  approved_at?: string;
  paid_at?: string;
  payment_method?: string;
  payment_reference?: string;
  profile_snapshot: StaffProfile & {
    teacherName?: string;
    institutionName?: string;
    nit?: string;
  };
}
export interface StaffWorkspace {
  canManage: boolean;
  settings: StaffSettings | null;
  teachers: { id: string; name: string }[];
  profiles: StaffProfile[];
  records: StaffRecord[];
  openRecords: StaffRecord[];
  payrolls: StaffPayroll[];
}
export interface StaffLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  mocked?: boolean;
}
export const weekDays = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
export const staffStatus = {
  draft: "Borrador",
  approved: "Aprobada",
  paid: "Pago registrado",
};
export function staffLateDeduction(
  r: Pick<
    StaffRecord,
    | "late_minutes"
    | "tolerance_minutes"
    | "late_mode"
    | "late_rate"
    | "deductions_enabled"
    | "late_waived"
  >,
) {
  if (
    !r.deductions_enabled ||
    r.late_waived ||
    r.late_minutes <= r.tolerance_minutes
  )
    return 0;
  return (
    Math.round(
      (r.late_mode === "excess"
        ? Math.max(0, r.late_minutes - r.tolerance_minutes)
        : r.late_minutes) *
        Number(r.late_rate) *
        100,
    ) / 100
  );
}
export function staffHours(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
export function staffTimestamp(value: string | null | undefined) {
  return value
    ? new Date(value).toLocaleString("es-BO", {
        timeZone: "America/La_Paz",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Sin salida";
}
export function previousPayrollMonth(day: string) {
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
const escape = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const amount = (value: number) => `Bs ${Number(value).toFixed(2)}`;
export function staffPayrollHtml(
  p: StaffPayroll,
  teacherName: string,
  schoolName: string,
) {
  const rows = [
    ["Sueldo base", p.base_amount, 0],
    ["Tardanzas revisadas", 0, p.late_deduction],
    ...p.adjustments.map((a) => [
      a.label,
      a.kind === "earning" ? a.amount : 0,
      a.kind === "deduction" ? a.amount : 0,
    ]),
  ];
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta ${escape(p.period.slice(0, 7))}</title><style>body{font:14px system-ui;color:#263238;max-width:800px;margin:36px auto;padding:20px}h1{color:#3D6EF7}table{width:100%;border-collapse:collapse;margin:24px 0}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}th{background:#F8FAFF}.total{background:#F8FAFF;padding:20px;font-size:20px;border-radius:12px}small{color:#52636c}footer{margin-top:40px}@media print{body{margin:0}}</style></head><body><h1>${escape(p.profile_snapshot.institutionName || schoolName)}</h1><p>NIT: ${escape(p.profile_snapshot.nit || "No registrado")}</p><h2>Boleta de pago · ${escape(p.period.slice(0, 7))}</h2><p><b>${escape(p.profile_snapshot.teacherName || teacherName)}</b> · ${escape(staffStatus[p.status])}</p><p>Modalidad: ${p.profile_snapshot.pay_type === "hourly" ? "Por horas" : "Mensual"} · Tiempo registrado: ${escape(staffHours(p.worked_minutes))} · Tardanza registrada: ${p.late_minutes} min</p><table><thead><tr><th>Concepto</th><th>Ingresos</th><th>Descuentos</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r[0])}</td><td>${Number(r[1]) ? amount(Number(r[1])) : "—"}</td><td>${Number(r[2]) ? amount(Number(r[2])) : "—"}</td></tr>`).join("")}<tr><th>Total</th><th>${amount(p.gross_amount)}</th><th>${amount(p.deductions)}</th></tr></tbody></table><div class="total">Líquido pagable: <b>${amount(p.net_amount)}</b></div><p>${escape(p.note)}</p>${p.approved_at ? `<p>Aprobada: ${escape(staffTimestamp(p.approved_at))}</p>` : "<p>Borrador pendiente de revisión de Dirección.</p>"}${p.paid_at ? `<p>Pago registrado: ${escape(staffTimestamp(p.paid_at))} · ${escape(p.payment_method)} · ${escape(p.payment_reference)}</p>` : ""}<footer><small>MiCole · Boleta ${escape(p.id)} · Los conceptos de aportes, impuestos y otros ajustes corresponden a lo revisado por la institución.</small></footer></body></html>`;
}
