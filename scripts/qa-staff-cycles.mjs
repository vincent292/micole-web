// Live QA-only staff cycles. Mutations use normal Auth RPCs, never owner impersonation.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { qa, r, session, rpc, rows, day } from "./qa-session.mjs";
const dir = "output/qa/2026-10-29-asistencia";
fs.mkdirSync(dir, { recursive: true });
const file = dir + "/personal-api.json";
const report = {
  day,
  mode: "normal Auth, live QA only",
  status: "running",
  cases: [],
  resources: {},
};
const clients = [];
const save = () =>
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
const check = (name, detail) => {
  report.cases.push({ name, status: "passed", detail });
  save();
};
async function login(k) {
  const c = await session(k);
  clients.push(c);
  return c;
}
async function denied(c, name, args, pattern) {
  const { error } = await c.rpc(name, args);
  assert.ok(error, `${name} should reject`);
  if (pattern) assert.match(error.message, pattern);
  return error.code;
}
let d, original;
try {
  assert.ok(
    !fs.existsSync(file),
    "This QA run already exists. Review it before creating another.",
  );
  save();
  d = await login("director");
  const t = await login("teacher"),
    tb = await login("teacherb");
  const workspace = (c, month = "2026-09-01") =>
    rpc(c, "staff_workspace", { p_school_id: qa.schoolId, p_month: month });
  original = await workspace(d);
  assert.ok(original.settings);
  assert.equal(original.records.length, 0);
  assert.equal(original.payrolls.length, 0);
  fs.writeFileSync(
    "/private/tmp/micole-qa-staff-original.json",
    JSON.stringify({
      school: qa.schoolId,
      settings: original.settings,
      profiles: original.profiles,
    }),
    { mode: 0o600 },
  );
  const settings = (extra = {}) =>
    rpc(d, "save_staff_settings", {
      p_school_id: qa.schoolId,
      p_values: {
        latitude: original.settings.latitude,
        longitude: original.settings.longitude,
        radiusM: 150,
        maxAccuracyM: 50,
        arrivalEnabled: true,
        toleranceMinutes: 10,
        lateMode: "excess",
        lateRate: 2,
        deductionsEnabled: true,
        policyNote:
          "QA ficticia: regla de ejemplo para validar cálculos, sin aplicación laboral real.",
        ...extra,
      },
    });
  const schedule = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    start: "08:00",
    end: "16:00",
    breakMinutes: 60,
  }));
  const profile = (teacherId, extra = {}) =>
    rpc(d, "save_staff_profile", {
      p_school_id: qa.schoolId,
      p_values: {
        teacherId,
        payType: "monthly",
        monthlySalary: 3000,
        hourlyRate: 60,
        active: true,
        schedule,
        ...extra,
      },
    });
  const create = async (teacherId, date, time, extra = {}) => {
    const id = randomUUID();
    await rpc(d, "correct_staff_attendance", {
      p_school_id: qa.schoolId,
      p_values: {
        id,
        teacherId,
        checkIn: `${date}T${time}-04:00`,
        checkOut: `${date}T16:00:00-04:00`,
        shiftStart: "08:00",
        ...extra,
      },
      p_reason:
        "QA2910: registro ficticio revisado para comprobar asistencia y boletas.",
    });
    return id;
  };
  const prepare = async (teacherId, period) =>
    rpc(d, "prepare_staff_payroll", {
      p_teacher_id: teacherId,
      p_period: period,
    });
  const payroll = async (id, month) => {
    const w = await workspace(d, month);
    return w.payrolls.find((p) => p.id === id);
  };
  const ownRecords = async (month = "2026-09-01") =>
    (await workspace(d, month)).records;
  await settings();
  await profile(r.teacher);
  await profile(r.teacherB, { payType: "hourly" });
  check(
    "profiles-and-rules",
    "Dirección configura Bs 3000 mensual, Bs 60/h, turno 08–16, descanso 60 min, tolerancia 10 y Bs 2/min adicionales. Solo QA.",
  );
  for (const who of [
    "guardian",
    "father",
    "familyb",
    "studentb",
    "scheduler",
    "directorb",
    "teacherc",
  ]) {
    const c = await login(who);
    await denied(
      c,
      "staff_workspace",
      { p_school_id: qa.schoolId, p_month: "2026-09-01" },
      /acceso/,
    );
    assert.equal(
      (
        await rows(
          c
            .from("staff_attendance_records")
            .select("id")
            .eq("school_id", qa.schoolId),
        )
      ).length,
      0,
    );
  }
  for (const c of [t, tb]) {
    await denied(
      c,
      "save_staff_settings",
      { p_school_id: qa.schoolId, p_values: {} },
      /Dirección/,
    );
    await denied(
      c,
      "save_staff_profile",
      {
        p_school_id: qa.schoolId,
        p_values: { teacherId: r.teacher, monthlySalary: 999999 },
      },
      /Dirección/,
    );
    await denied(
      c,
      "correct_staff_attendance",
      {
        p_school_id: qa.schoolId,
        p_values: { teacherId: r.teacher },
        p_reason: "QA no autorizado",
      },
      /Dirección/,
    );
  }
  check(
    "permissions",
    "Familias, estudiante, Secretaría y otra sede no leen el módulo; los docentes no cambian reglas, sueldos ni marcaciones manuales.",
  );
  const monthly = await prepare(r.teacher, "2026-07-01");
  report.resources.noMarksPayroll = monthly;
  save();
  assert.equal(Number((await payroll(monthly, "2026-07-01")).net_amount), 3000);
  check(
    "monthly-without-marks",
    "Sin marcaciones: sueldo mensual Bs 3000, descuento automático Bs 0. No se inventan ausencias ni sanciones.",
  );
  const hourlyEmpty = await prepare(r.teacherB, "2026-07-01");
  assert.equal(
    Number((await payroll(hourlyEmpty, "2026-07-01")).net_amount),
    0,
  );
  check("hourly-without-marks", "Sin turnos cerrados: pago por horas Bs 0.");
  await denied(
    d,
    "save_staff_settings",
    {
      p_school_id: qa.schoolId,
      p_values: {
        latitude: original.settings.latitude,
        longitude: original.settings.longitude,
        deductionsEnabled: true,
        policyNote: "",
      },
    },
    /reglamento/,
  );
  check(
    "discount-requires-policy",
    "Rechaza habilitar descuentos sin indicar una regla o acuerdo.",
  );
  const records = {};
  for (const [label, date, time] of [
    ["onTime", "2026-09-01", "08:00:00"],
    ["withinTolerance", "2026-09-02", "08:10:00"],
    ["late15", "2026-09-03", "08:15:00"],
    ["fraction", "2026-09-04", "08:10:01"],
    ["waived", "2026-09-05", "08:25:00"],
  ])
    records[label] = await create(
      r.teacher,
      date,
      time,
      label === "waived" ? { waiveLate: true } : {},
    );
  await settings({ lateMode: "all_after_tolerance" });
  records.allLate = await create(r.teacher, "2026-09-06", "08:15:00");
  await settings({ deductionsEnabled: false });
  records.disabled = await create(r.teacher, "2026-09-07", "08:45:00");
  await settings();
  records.open = await create(r.teacher, "2026-09-08", "08:00:00", {
    checkOut: "",
  });
  report.resources.records = records;
  save();
  let p = await prepare(r.teacher, "2026-09-01");
  report.resources.monthlyPayroll = p;
  save();
  let value = await payroll(p, "2026-09-01");
  assert.equal(Number(value.late_deduction), 42);
  assert.equal(Number(value.net_amount), 2958);
  const recorded = await ownRecords();
  assert.equal(
    recorded.find((x) => x.id === records.fraction).late_minutes,
    11,
  );
  assert.equal(
    recorded.find((x) => x.id === records.disabled).deductions_enabled,
    false,
  );
  check(
    "late-calculations",
    "A tiempo y 10 min: Bs 0; 15 min en exceso: Bs 10; 10 min 1 s redondea a 11: Bs 2; 25 min justificados: Bs 0; 15 min completos: Bs 30; descuentos apagados: Bs 0. Total Bs 42.",
  );
  await denied(d, "approve_staff_payroll", { p_id: p }, /sin salida/);
  check(
    "missing-exit-blocks-approval",
    "Un turno sin salida impide aprobar la boleta.",
  );
  await denied(
    d,
    "correct_staff_attendance",
    {
      p_school_id: qa.schoolId,
      p_values: {
        id: records.open,
        teacherId: r.teacher,
        checkIn: "2026-09-08T08:00:00-04:00",
        checkOut: "2026-09-08T16:00:00-04:00",
      },
      p_reason: "x",
    },
    /10 a 1000/,
  );
  await rpc(d, "correct_staff_attendance", {
    p_school_id: qa.schoolId,
    p_values: {
      id: records.open,
      teacherId: r.teacher,
      checkIn: "2026-09-08T08:00:00-04:00",
      checkOut: "2026-09-08T16:00:00-04:00",
    },
    p_reason: "QA2910: salida olvidada contrastada y corregida por Dirección.",
  });
  await denied(d, "approve_staff_payroll", { p_id: p }, /cambió/);
  check(
    "changes-require-recalculation",
    "Corrección con motivo y auditoría; la boleta anterior no se aprueba sin recalcular.",
  );
  p = await prepare(r.teacher, "2026-09-01");
  assert.equal((await workspace(t)).payrolls.length, 0);
  await denied(t, "approve_staff_payroll", { p_id: p }, /Dirección/);
  await denied(
    t,
    "edit_staff_payroll",
    { p_id: p, p_adjustments: [], p_note: "no permitido" },
    /Dirección/,
  );
  await denied(
    d,
    "record_staff_payroll_payment",
    { p_id: p, p_method: "cash", p_reference: "QA NO PAGADO" },
    /aprobada/,
  );
  check(
    "draft-and-payment-permissions",
    "El docente no ve borradores ni puede editar/aprobar; no se registra pago antes de aprobar.",
  );
  await rpc(d, "edit_staff_payroll", {
    p_id: p,
    p_adjustments: [
      { kind: "deduction", label: "QA descuento excesivo", amount: 9999 },
    ],
    p_note: "Solo prueba de validación",
  });
  await denied(d, "approve_staff_payroll", { p_id: p }, /superar/);
  check("excessive-deduction-blocked", "No permite aprobar un neto negativo.");
  await rpc(d, "edit_staff_payroll", {
    p_id: p,
    p_adjustments: [
      { kind: "earning", label: "QA bono ficticio", amount: 100 },
      { kind: "deduction", label: "QA ajuste ficticio", amount: 50 },
    ],
    p_note: "QA2910: ejemplo de boleta, sin pago real.",
  });
  value = await payroll(p, "2026-09-01");
  assert.equal(Number(value.gross_amount), 3100);
  assert.equal(Number(value.deductions), 92);
  assert.equal(Number(value.net_amount), 3008);
  await rpc(d, "approve_staff_payroll", { p_id: p });
  assert.equal(
    Number((await workspace(t)).payrolls.find((x) => x.id === p).net_amount),
    3008,
  );
  check(
    "monthly-payroll-complete",
    "Sueldo 3000 + bono 100 − tardanza 42 − ajuste 50 = Bs 3008. Dirección aprueba y docente consulta.",
  );
  for (const [name, args] of [
    [
      "prepare_staff_payroll",
      { p_teacher_id: r.teacher, p_period: "2026-09-01" },
    ],
    ["edit_staff_payroll", { p_id: p, p_adjustments: [], p_note: "" }],
    [
      "correct_staff_attendance",
      {
        p_school_id: qa.schoolId,
        p_values: {
          id: records.late15,
          teacherId: r.teacher,
          checkIn: "2026-09-03T08:00:00-04:00",
        },
        p_reason: "QA intento posterior a aprobación",
      },
    ],
  ])
    await denied(d, name, args, /aprobada|borrador/);
  await denied(
    d,
    "record_staff_payroll_payment",
    { p_id: p, p_method: "cash", p_reference: "" },
    /referencia/,
  );
  await rpc(d, "record_staff_payroll_payment", {
    p_id: p,
    p_method: "cash",
    p_reference: "QA2910-SIMULADO-SIN-DINERO-REAL",
  });
  await denied(
    d,
    "record_staff_payroll_payment",
    {
      p_id: p,
      p_method: "cash",
      p_reference: "QA2910-SIMULADO-SIN-DINERO-REAL",
    },
    /aprobada/,
  );
  assert.equal((await payroll(p, "2026-09-01")).status, "paid");
  check(
    "approved-lock-and-single-payment",
    "Boleta aprobada inmutable; bloquea corregir ese período, exige referencia y rechaza registrar el pago dos veces. Solo pago ficticio.",
  );
  const own = await workspace(t),
    other = await workspace(tb);
  assert.ok(own.records.every((x) => x.teacher_id === r.teacher));
  assert.equal(other.records.length, 0);
  assert.equal(other.payrolls.length, 0);
  const audit = await rows(
    d
      .from("staff_attendance_changes")
      .select("id,reason")
      .eq("record_id", records.open),
  );
  assert.equal(audit.length, 1);
  assert.ok(audit[0].reason.includes("QA2910"));
  assert.equal(
    (await rows(t.from("staff_attendance_changes").select("id"))).length,
    0,
  );
  check(
    "own-records-and-audit",
    "Cada docente ve solo sus registros/boletas; la corrección conserva historial reservado a Dirección.",
  );
  await settings({ deductionsEnabled: false });
  const h1 = await create(r.teacherB, "2026-08-03", "08:00:00");
  await profile(r.teacherB, { payType: "hourly", hourlyRate: 120 });
  const h2 = await create(r.teacherB, "2026-08-04", "08:00:00");
  let hp = await prepare(r.teacherB, "2026-08-01");
  report.resources.hourlyPayroll = hp;
  report.resources.hourlyRecords = [h1, h2];
  save();
  value = await payroll(hp, "2026-08-01");
  assert.equal(Number(value.worked_minutes), 840);
  assert.equal(Number(value.base_amount), 1260);
  await rpc(d, "approve_staff_payroll", { p_id: hp });
  assert.equal(
    Number(
      (await workspace(tb, "2026-08-01")).payrolls.find((x) => x.id === hp)
        .net_amount,
    ),
    1260,
  );
  check(
    "hourly-rate-snapshot",
    "Dos jornadas de 7 horas netas: una a Bs 60/h y otra a Bs 120/h = Bs 1260. Cambiar tarifa no altera la jornada previa.",
  );
  const current = await prepare(r.teacher, day.slice(0, 7) + "-01");
  report.resources.currentDraft = current;
  save();
  await denied(d, "approve_staff_payroll", { p_id: current }, /termina el mes/);
  check(
    "current-month-blocked",
    "No se puede aprobar el mes antes de que termine.",
  );
  report.status = "passed";
  save();
} catch (e) {
  report.status = "failed";
  report.failure = { message: e.message };
  save();
  console.error(JSON.stringify({ ok: false, message: e.message }));
  process.exitCode = 1;
} finally {
  if (d && original?.settings) {
    const s = original.settings;
    try {
      await rpc(d, "save_staff_settings", {
        p_school_id: qa.schoolId,
        p_values: {
          latitude: s.latitude,
          longitude: s.longitude,
          radiusM: s.radius_m,
          maxAccuracyM: s.max_accuracy_m,
          arrivalEnabled: s.arrival_enabled,
          toleranceMinutes: s.tolerance_minutes,
          lateMode: s.late_mode,
          lateRate: s.late_rate,
          deductionsEnabled: s.deductions_enabled,
          policyNote: s.policy_note,
        },
      });
      for (const p of original.profiles)
        await rpc(d, "save_staff_profile", {
          p_school_id: qa.schoolId,
          p_values: {
            teacherId: p.teacher_id,
            payType: p.pay_type,
            monthlySalary: p.monthly_salary,
            hourlyRate: p.hourly_rate,
            active: p.active,
            schedule: p.schedule,
          },
        });
      report.originalRulesAndProfilesRestored = true;
    } catch (e) {
      report.restorationError = e.message;
      process.exitCode = 1;
    }
    save();
  }
  await Promise.allSettled(
    clients.map((c) => c.auth.signOut({ scope: "local" })),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      cases: report.cases.length,
      file,
      restored: report.originalRulesAndProfilesRestored,
    }),
  );
}
