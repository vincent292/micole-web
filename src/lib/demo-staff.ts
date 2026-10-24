import { demoRole } from "./demo-config";
import { readDemoData } from "./demo";
import { today } from "./billing";
import {
  previousPayrollMonth,
  staffLateDeduction,
  type StaffWorkspace,
  type StaffProfile,
  type StaffRecord,
  type StaffPayroll,
  type PayrollAdjustment,
} from "./staff";
const key = "micole_public_demo_staff_v1";
export const staffOperations = [
  "staff_workspace",
  "save_staff_settings",
  "save_staff_profile",
  "mark_staff_attendance",
  "correct_staff_attendance",
  "prepare_staff_payroll",
  "edit_staff_payroll",
  "approve_staff_payroll",
  "record_staff_payroll_payment",
];
type State = Record<string, StaffWorkspace>;
const id = () => crypto.randomUUID(),
  stamp = () => new Date().toISOString();
function seed(schoolId: string): StaffWorkspace {
  const teachers = readDemoData()
    .teachers.filter((t) => t.schoolId === schoolId)
    .map((t) => ({ id: t.id, name: t.name }));
  const profiles: StaffProfile[] = teachers.map((t, i) => ({
    id: id(),
    school_id: schoolId,
    teacher_id: t.id,
    pay_type: i ? "hourly" : "monthly",
    monthly_salary: 3000,
    hourly_rate: 60,
    active: true,
    schedule: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      start: "08:00",
      end: "16:00",
      breakMinutes: 60,
    })),
  }));
  const month = previousPayrollMonth(today()),
    date = month + "-15";
  const records: StaffRecord[] = teachers.slice(0, 2).map((t) => ({
    id: id(),
    school_id: schoolId,
    teacher_id: t.id,
    attendance_date: date,
    shift_key: "08:00-16:00",
    scheduled_start: date + "T08:00:00-04:00",
    scheduled_end: date + "T16:00:00-04:00",
    check_in: date + "T08:15:00-04:00",
    check_out: date + "T16:00:00-04:00",
    break_minutes: 60,
    worked_minutes: 405,
    hourly_rate: 60,
    late_minutes: 15,
    tolerance_minutes: 10,
    late_mode: "excess",
    late_rate: 2,
    deductions_enabled: true,
    late_waived: false,
    source: "manual",
    note: "Registro de ejemplo para explorar la boleta.",
  }));
  const settings = {
    school_id: schoolId,
    arrival_enabled: true,
    latitude: -16.5,
    longitude: -68.1,
    radius_m: 150,
    max_accuracy_m: 50,
    tolerance_minutes: 10,
    late_mode: "excess" as const,
    late_rate: 2,
    deductions_enabled: true,
    policy_note: "Regla ficticia de demostración",
  };
  const payrolls: StaffPayroll[] = profiles.slice(0, 1).map((p) => ({
    id: id(),
    school_id: schoolId,
    teacher_id: p.teacher_id,
    period: month + "-01",
    status: "approved",
    profile_snapshot: {
      ...p,
      teacherName: teachers.find((t) => t.id === p.teacher_id)?.name,
      institutionName: readDemoData().schools.find((s) => s.id === schoolId)
        ?.name,
    },
    worked_minutes: 405,
    late_minutes: 15,
    base_amount: 3000,
    late_deduction: 10,
    adjustments: [],
    gross_amount: 3000,
    deductions: 10,
    net_amount: 2990,
    note: "Boleta ficticia sin pago real.",
    approved_at: stamp(),
  }));
  return {
    canManage: true,
    settings,
    teachers,
    profiles,
    records,
    openRecords: [],
    payrolls,
  };
}
export async function demoStaffRpc(
  name: string,
  params: object,
): Promise<unknown> {
  const role = demoRole();
  if (!role || !["director", "teacher"].includes(role))
    throw new Error("El módulo corresponde al equipo de la institución.");
  const p = params as Record<string, any>;
  let all: State = {};
  try {
    all = JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    /* fresh local state */
  }
  const d = readDemoData();
  let schoolId = p.p_school_id as string | undefined;
  if (!schoolId && p.p_teacher_id)
    schoolId = d.teachers.find((t) => t.id === p.p_teacher_id)?.schoolId;
  if (!schoolId && p.p_id)
    schoolId = Object.values(all).find(
      (s) =>
        s.payrolls.some((x) => x.id === p.p_id) ||
        s.records.some((x) => x.id === p.p_id),
    )?.settings?.school_id;
  schoolId ||= d.schools[0]?.id;
  if (!schoolId || !d.schools.some((s) => s.id === schoolId))
    throw new Error("Sede no disponible.");
  const state = all[schoolId] || seed(schoolId),
    manager = role === "director";
  // Existing local demos already had configured arrival control.
  if (state.settings && state.settings.arrival_enabled === undefined)
    state.settings.arrival_enabled = true;
  const ownTeacher = d.teachers.find((t) => t.schoolId === schoolId)?.id;
  const permitted = (teacherId: string) => manager || teacherId === ownTeacher;
  const commit = () => {
    all[schoolId!] = state;
    localStorage.setItem(key, JSON.stringify(all));
  };
  const monthOpen = (teacherId: string, date: string) => {
    if (
      state.payrolls.some(
        (x) =>
          x.teacher_id === teacherId &&
          x.period.slice(0, 7) === date.slice(0, 7) &&
          x.status !== "draft",
      )
    )
      throw new Error("La boleta del período ya fue aprobada.");
  };
  if (name === "staff_workspace") {
    commit();
    return {
      ...state,
      canManage: manager,
      teachers: state.teachers.filter((t) => permitted(t.id)),
      profiles: state.profiles.filter((t) => permitted(t.teacher_id)),
      records: state.records.filter(
        (r) =>
          permitted(r.teacher_id) &&
          r.attendance_date.slice(0, 7) === p.p_month.slice(0, 7),
      ),
      openRecords: state.records.filter(
        (r) => permitted(r.teacher_id) && !r.check_out,
      ),
      payrolls: state.payrolls.filter(
        (x) =>
          permitted(x.teacher_id) &&
          x.period === p.p_month &&
          (manager || x.status !== "draft"),
      ),
    };
  }
  if (name === "mark_staff_attendance") {
    if (role !== "teacher" || !permitted(p.p_teacher_id))
      throw new Error("La marcación corresponde al docente.");
    if (!state.settings?.arrival_enabled)
      throw new Error("El control de llegada está desactivado en esta sede.");
    if (p.p_kind === "out") {
      const r = state.records.find(
        (r) => r.teacher_id === p.p_teacher_id && !r.check_out,
      );
      if (!r) throw new Error("No hay entrada pendiente.");
      r.check_out = stamp();
      r.worked_minutes = Math.max(
        0,
        Math.floor((Date.now() - Date.parse(r.check_in)) / 60000) -
          r.break_minutes,
      );
      commit();
      return r.id;
    }
    if (state.records.some((r) => r.id === p.p_id)) return p.p_id;
    if (
      state.records.some((r) => r.teacher_id === p.p_teacher_id && !r.check_out)
    )
      throw new Error("Marca primero la salida.");
    monthOpen(p.p_teacher_id, today());
    const profile = state.profiles.find(
      (x) => x.teacher_id === p.p_teacher_id && x.active,
    );
    if (!profile) throw new Error("Horario pendiente de configuración.");
    state.records.push({
      id: p.p_id,
      teacher_id: p.p_teacher_id,
      school_id: schoolId,
      attendance_date: today(),
      shift_key: "demo",
      scheduled_start: stamp(),
      scheduled_end: stamp(),
      check_in: stamp(),
      check_out: null,
      worked_minutes: 0,
      hourly_rate: profile.hourly_rate,
      late_minutes: 0,
      break_minutes: 0,
      tolerance_minutes: state.settings!.tolerance_minutes,
      late_mode: state.settings!.late_mode,
      late_rate: state.settings!.late_rate,
      deductions_enabled: state.settings!.deductions_enabled,
      late_waived: false,
      source: "gps",
      entry_accuracy: 5,
      note: "Ubicación y horario simulados en demo.",
    });
    commit();
    return p.p_id;
  }
  if (!manager)
    throw new Error("Solo Dirección puede administrar asistencia y boletas.");
  if (name === "save_staff_settings") {
    const v = p.p_values;
    state.settings = {
      school_id: schoolId,
      arrival_enabled: v.arrivalEnabled ?? state.settings?.arrival_enabled ?? false,
      latitude: v.latitude,
      longitude: v.longitude,
      radius_m: v.radiusM,
      max_accuracy_m: v.maxAccuracyM,
      tolerance_minutes: v.toleranceMinutes,
      late_mode: v.lateMode,
      late_rate: v.lateRate,
      deductions_enabled: v.deductionsEnabled,
      policy_note: v.policyNote,
    };
    commit();
    return null;
  }
  if (name === "save_staff_profile") {
    const v = p.p_values;
    if (!state.teachers.some((t) => t.id === v.teacherId))
      throw new Error("Docente no disponible en esta sede.");
    const old = state.profiles.find((t) => t.teacher_id === v.teacherId);
    const next = {
      id: old?.id || id(),
      school_id: schoolId,
      teacher_id: v.teacherId,
      pay_type: v.payType,
      monthly_salary: v.monthlySalary,
      hourly_rate: v.hourlyRate,
      active: v.active,
      schedule: v.schedule,
    };
    state.profiles = state.profiles
      .filter((t) => t.teacher_id !== v.teacherId)
      .concat(next);
    commit();
    return null;
  }
  if (name === "correct_staff_attendance") {
    const v = p.p_values;
    if (!v.checkIn || String(p.p_reason || "").trim().length < 10)
      throw new Error("Completa entrada y motivo de la corrección.");
    const profile = state.profiles.find((t) => t.teacher_id === v.teacherId);
    if (!profile) throw new Error("Configura al docente.");
    const date = v.checkIn.slice(0, 10);
    monthOpen(v.teacherId, date);
    const old = state.records.find((r) => r.id === v.id);
    if (old && old.teacher_id !== v.teacherId)
      throw new Error("Docente incorrecto.");
    const start = v.shiftStart || old?.shift_key.slice(0, 5) || "08:00";
    const shift =
      profile.schedule.find((s) => s.start === start) || profile.schedule[0];
    if (!shift) throw new Error("Configura los turnos.");
    const base = old || {
      id: id(),
      teacher_id: v.teacherId,
      school_id: schoolId,
      attendance_date: date,
      shift_key: start + "-" + shift.end,
      scheduled_start: date + "T" + start + ":00-04:00",
      scheduled_end: date + "T" + shift.end + ":00-04:00",
      break_minutes: shift.breakMinutes,
      hourly_rate: profile.hourly_rate,
      tolerance_minutes: state.settings!.tolerance_minutes,
      late_mode: state.settings!.late_mode,
      late_rate: state.settings!.late_rate,
      deductions_enabled: state.settings!.deductions_enabled,
    };
    if (v.checkOut && Date.parse(v.checkOut) < Date.parse(v.checkIn))
      throw new Error("La salida debe ser posterior a la entrada.");
    const next: StaffRecord = {
      ...base,
      check_in: v.checkIn,
      check_out: v.checkOut || null,
      worked_minutes: v.checkOut
        ? Math.max(
            0,
            Math.floor(
              (Date.parse(v.checkOut) - Date.parse(v.checkIn)) / 60000,
            ) - base.break_minutes,
          )
        : 0,
      late_minutes: Math.max(
        0,
        Math.ceil(
          (Date.parse(v.checkIn) - Date.parse(base.scheduled_start)) / 60000,
        ),
      ),
      late_waived: !!v.waiveLate,
      source: "manual",
      note: p.p_reason,
    };
    state.records = state.records.filter((r) => r.id !== next.id).concat(next);
    commit();
    return next.id;
  }
  if (name === "prepare_staff_payroll") {
    const profile = state.profiles.find(
      (pf) => pf.teacher_id === p.p_teacher_id,
    );
    if (!profile) throw new Error("Configura el sueldo.");
    const old = state.payrolls.find(
      (x) => x.teacher_id === p.p_teacher_id && x.period === p.p_period,
    );
    if (old && old.status !== "draft")
      throw new Error("La boleta ya fue aprobada.");
    const records = state.records.filter(
      (r) =>
        r.teacher_id === p.p_teacher_id &&
        r.attendance_date.slice(0, 7) === p.p_period.slice(0, 7),
    );
    const worked = records
        .filter((r) => r.check_out)
        .reduce((n, r) => n + r.worked_minutes, 0),
      late = records.reduce((n, r) => n + r.late_minutes, 0),
      discount = records.reduce((n, r) => n + staffLateDeduction(r), 0),
      base =
        profile.pay_type === "monthly"
          ? profile.monthly_salary
          : Math.round(
              records
                .filter((r) => r.check_out)
                .reduce(
                  (n, r) =>
                    n +
                    Math.round(
                      ((r.worked_minutes *
                        Number(r.hourly_rate ?? profile.hourly_rate)) /
                        60) *
                        100,
                    ) /
                      100,
                  0,
                ) * 100,
            ) / 100;
    const next: StaffPayroll = {
      id: old?.id || id(),
      school_id: schoolId,
      teacher_id: profile.teacher_id,
      period: p.p_period,
      status: "draft",
      profile_snapshot: {
        ...profile,
        teacherName: state.teachers.find((t) => t.id === profile.teacher_id)
          ?.name,
        institutionName: d.schools.find((s) => s.id === schoolId)?.name,
      },
      worked_minutes: worked,
      late_minutes: late,
      base_amount: base,
      late_deduction: discount,
      adjustments: [],
      gross_amount: base,
      deductions: discount,
      net_amount: base - discount,
      note: "",
    };
    state.payrolls = state.payrolls
      .filter((x) => x.id !== next.id)
      .concat(next);
    commit();
    return next.id;
  }
  const payroll = state.payrolls.find((x) => x.id === p.p_id);
  if (!payroll) throw new Error("Boleta no disponible.");
  if (name === "edit_staff_payroll") {
    if (payroll.status !== "draft")
      throw new Error("La boleta ya fue aprobada.");
    const entries = p.p_adjustments as PayrollAdjustment[];
    if (
      entries.some(
        (a) => !a.label.trim() || a.amount < 0 || !Number.isFinite(a.amount),
      )
    )
      throw new Error("Revisa los conceptos.");
    payroll.adjustments = entries;
    payroll.note = p.p_note;
    payroll.gross_amount =
      payroll.base_amount +
      entries
        .filter((a) => a.kind === "earning")
        .reduce((n, a) => n + a.amount, 0);
    payroll.deductions =
      payroll.late_deduction +
      entries
        .filter((a) => a.kind === "deduction")
        .reduce((n, a) => n + a.amount, 0);
    payroll.net_amount = payroll.gross_amount - payroll.deductions;
  }
  if (name === "approve_staff_payroll") {
    if (payroll.status !== "draft" || payroll.net_amount < 0)
      throw new Error("Revisa la boleta antes de aprobar.");
    if (payroll.period.slice(0, 7) >= today().slice(0, 7))
      throw new Error("La boleta se aprueba cuando termina el mes.");
    if (
      state.records.some(
        (r) =>
          r.teacher_id === payroll.teacher_id &&
          r.attendance_date.slice(0, 7) === payroll.period.slice(0, 7) &&
          !r.check_out,
      )
    )
      throw new Error("Corrige las marcaciones sin salida.");
    payroll.status = "approved";
    payroll.approved_at = stamp();
  }
  if (name === "record_staff_payroll_payment") {
    if (payroll.status !== "approved" || !p.p_reference?.trim())
      throw new Error("Registra la referencia de una boleta aprobada.");
    payroll.status = "paid";
    payroll.paid_at = stamp();
    payroll.payment_method = p.p_method;
    payroll.payment_reference = p.p_reference;
  }
  commit();
  return null;
}
