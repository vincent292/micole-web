import { chargeAccessMinimum } from "./operations";
import type { AppData, Charge, PaymentPlan, Student } from "./types";
export const ACTIVATION_FEE = 50;
export const LICENSE_FEE = 29;
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/La_Paz",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const round = (amount: number) =>
  Math.round((amount + Number.EPSILON) * 100) / 100;
export function buildSchedule(plan: PaymentPlan, id: () => string): Charge[] {
  const licenseFee=plan.licenseFee??LICENSE_FEE;
  const amounts = [
    licenseFee,
    plan.monthlyFee,
    plan.snackFee,
    plan.enrollmentFee,
    plan.discount,
  ];
  if (
    amounts.some((n) => !Number.isFinite(n) || n < 0) ||
    !Number.isInteger(plan.months) ||
    plan.months < 1 ||
    plan.months > 36 ||
    !Number.isInteger(plan.dueDay) ||
    plan.dueDay < 1 ||
    plan.dueDay > 28
  )
    throw new Error(
      "Revisa los importes, los meses (1–36) y el día de vencimiento (1–28).",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(plan.startDate) ||
    (plan.discount > 0 &&
      (!plan.discountFrom ||
        !plan.discountTo ||
        plan.discountFrom > plan.discountTo))
  )
    throw new Error("Indica fechas válidas para el plan y el descuento.");
  const start = new Date(`${plan.startDate}T12:00:00Z`);
  if (Number.isNaN(start.getTime()))
    throw new Error("Fecha de inicio inválida.");
  const charges: Charge[] = [];
  if (plan.enrollmentFee > 0)
    charges.push({
      id: id(),
      schoolId: plan.schoolId,
      studentId: plan.studentId,
      planId: plan.id,
      concept: "Matrícula",
      dueDate: plan.startDate,
      amount: round(plan.enrollmentFee),
      status: "pending",
      baseAmount: round(plan.enrollmentFee),
      licenseAmount: 0,
      snackAmount: 0,
      discountAmount: 0,
    });
  for (let i = 0; i < plan.months; i++) {
    const month = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1, 12),
    );
    const period = month.toISOString().slice(0, 7);
    const dueDate = `${period}-${String(i === 0 ? Math.max(plan.dueDay, start.getUTCDate()) : plan.dueDay).padStart(2, "0")}`;
    const days = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const factor =
      i === 0 && plan.prorate ? (days - start.getUTCDate() + 1) / days : 1;
    const baseAmount = round(plan.monthlyFee * factor),
      snackAmount = round(plan.snackFee * factor);
    const discountAmount =
      dueDate >= plan.discountFrom && dueDate <= plan.discountTo
        ? Math.min(round(plan.discount), round(baseAmount + snackAmount))
        : 0;
    charges.push({
      id: id(),
      schoolId: plan.schoolId,
      studentId: plan.studentId,
      planId: plan.id,
      concept: `Mensualidad ${month.toLocaleDateString("es-BO", { month: "long", year: "numeric", timeZone: "UTC" })}`,
      dueDate,
      period,
      baseAmount,
      snackAmount,
      licenseAmount: licenseFee,
      discountAmount,
      amount: round(baseAmount + snackAmount + licenseFee - discountAmount),
      status: "pending",
    });
  }
  return charges;
}
export function chargeStatus(charge: Charge, date = today()) {
  return charge.status === "pending" && charge.dueDate < date
    ? "overdue"
    : charge.status;
}
export function studentAccess(
  student: Student | undefined,
  data: AppData,
  date = today(),
) {
  if (!student)
    return {
      allowed: false,
      reason: "No hay un estudiante vinculado a tu cuenta.",
    };
  if (data.schools.find((s) => s.id === student.schoolId)?.status !== "active")
    return {
      allowed: false,
      reason: "La institución está suspendida. Contacta con dirección.",
    };
  if (student.status !== "active")
    return { allowed: false, reason: "La inscripción debe estar activa." };
  if (
    data.platformCharges.some(
      (c) =>
        c.studentId === student.id &&
        c.status !== "paid" &&
        c.status !== "cancelled",
    )
  )
    return {
      allowed: false,
      reason: "La activación inicial de MiCole está pendiente.",
    };
  if (student.accessUntil && student.accessUntil >= date)
    return { allowed: true, reason: "" };
  if (
    data.charges.some(
      (c) => c.studentId === student.id && c.status !== "paid" && c.status !== "cancelled" &&
        (chargeStatus(c, date) === "overdue" || (c.period === date.slice(0,7) && !!c.planId)) &&
        (!c.academicRequestId || data.academicRequests.find(r => r.id === c.academicRequestId)?.blocksAccess !== false) &&
        (c.paidAmount || 0) < chargeAccessMinimum(c),
    )
  )
    return {
      allowed: false,
      reason:
        "Completa el mínimo de las cuotas exigibles: 50% en las iniciales y 100% en las últimas dos y cobros adicionales.",
    };
  return { allowed: true, reason: "" };
}
