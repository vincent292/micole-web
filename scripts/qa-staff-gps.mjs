// Rejected synthetic inputs validate guards; accepted GPS marks are made only in the phone UI.
import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { qa, r, day, session, rpc } from "./qa-session.mjs";
const stage = process.argv[2],
  file = "output/qa/2026-10-29-asistencia/gps-api.json",
  privateFile = "/private/tmp/micole-qa-gps-original.json";
const report = fs.existsSync(file)
  ? JSON.parse(fs.readFileSync(file))
  : { day, cases: [] };
const save = () =>
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
const pass = (name, detail) => {
  report.cases.push({ name, status: "passed", detail });
  save();
};
const d = await session("director"),
  t = await session("teacher");
const workspace = () =>
  rpc(d, "staff_workspace", {
    p_school_id: qa.schoolId,
    p_month: day.slice(0, 7) + "-01",
  });
const setProfile = (p) =>
  rpc(d, "save_staff_profile", {
    p_school_id: qa.schoolId,
    p_values: {
      teacherId: r.teacher,
      payType: p.pay_type,
      monthlySalary: p.monthly_salary,
      hourlyRate: p.hourly_rate,
      active: p.active,
      schedule: p.schedule,
    },
  });
const setRules = (s) =>
  rpc(d, "save_staff_settings", {
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
async function deny(c, args, pattern) {
  const { error } = await c.rpc("mark_staff_attendance", args);
  assert.ok(error);
  assert.match(error.message, pattern);
}
try {
  if (stage === "prepare") {
    assert.ok(!report.prepared);
    const w = await workspace();
    assert.equal(
      w.records.filter(
        (v) => v.teacher_id === r.teacher && v.attendance_date === day,
      ).length,
      0,
    );
    const p = w.profiles.find((p) => p.teacher_id === r.teacher);
    assert.ok(p);
    const s = w.settings;
    fs.writeFileSync(privateFile, JSON.stringify({ profile: p, settings: s }), {
      mode: 0o600,
    });
    const location = () => ({
      latitude: s.latitude,
      longitude: s.longitude,
      accuracy: 10,
      capturedAt: new Date().toISOString(),
      mocked: false,
    });
    const args = (extra = {}) => ({
      p_teacher_id: r.teacher,
      p_kind: "in",
      p_id: randomUUID(),
      p_location: location(),
      ...extra,
    });
    await deny(d, args(), /cuenta docente/);
    await deny(t, args({ p_kind: "out" }), /entrada pendiente/);
    await setRules({ ...s, arrival_enabled: false });
    await deny(t, args(), /desactivado/);
    await setRules(s);
    pass(
      "disabled-and-no-entry",
      "Dirección no suplanta GPS; salida sin entrada y control desactivado se rechazan sin crear registros.",
    );
    await setProfile({
      ...p,
      schedule: Array.from({ length: 7 }, (_, weekday) => ({
        weekday,
        start: "00:00",
        end: "23:59",
        breakMinutes: 0,
      })),
    });
    for (const [name, loc, pattern] of [
      ["outside", { ...location(), latitude: s.latitude + 1 }, /rango/],
      ["inaccurate", { ...location(), accuracy: 999 }, /precisa/],
      [
        "stale",
        { ...location(), capturedAt: "2020-01-01T00:00:00Z" },
        /reciente/,
      ],
      ["mocked", { ...location(), mocked: true }, /simuladas/],
    ]) {
      await deny(t, args({ p_location: loc }), pattern);
      pass(
        name,
        "Entrada sintética rechazada por el servidor, sin crear marcaciones.",
      );
    }
    assert.equal(
      (await workspace()).records.filter(
        (v) => v.teacher_id === r.teacher && v.attendance_date === day,
      ).length,
      0,
    );
    report.prepared = true;
    save();
  } else if (stage === "verify-in") {
    const w = await workspace(),
      records = w.records.filter(
        (v) => v.teacher_id === r.teacher && v.attendance_date === day,
      );
    assert.equal(records.length, 1);
    const entry = records[0];
    assert.equal(entry.source, "gps");
    assert.equal(entry.check_out, null);
    assert.ok(entry.entry_accuracy <= w.settings.max_accuracy_m);
    report.recordId = entry.id;
    report.entryTime = entry.check_in;
    report.accuracyM = entry.entry_accuracy;
    const location = {
      latitude: entry.entry_lat,
      longitude: entry.entry_lon,
      accuracy: entry.entry_accuracy,
      capturedAt: new Date().toISOString(),
      mocked: false,
    };
    const args = {
      p_teacher_id: r.teacher,
      p_kind: "in",
      p_id: entry.id,
      p_location: location,
    };
    assert.equal(await rpc(t, "mark_staff_attendance", args), entry.id);
    await deny(t, { ...args, p_id: randomUUID() }, /salida del turno/);
    pass(
      "physical-entry-and-retry",
      "Entrada creada desde la APK con GPS real. Repetir el mismo ID no duplica; otra entrada con turno abierto es rechazada.",
    );
  } else if (stage === "verify-out") {
    const w = await workspace(),
      records = w.records.filter(
        (v) => v.teacher_id === r.teacher && v.attendance_date === day,
      );
    assert.equal(records.length, 1);
    const entry = records[0];
    assert.equal(entry.id, report.recordId);
    assert.ok(entry.check_out);
    assert.ok(new Date(entry.check_out) >= new Date(entry.check_in));
    assert.ok(entry.exit_accuracy <= w.settings.max_accuracy_m);
    report.exitTime = entry.check_out;
    report.workedMinutes = entry.worked_minutes;
    pass(
      "physical-exit",
      "Salida desde APK con otra lectura GPS; una única jornada cerrada y tiempos de servidor coherentes.",
    );
  } else if (stage === "restore") {
    const original = JSON.parse(fs.readFileSync(privateFile));
    await setProfile(original.profile);
    await setRules(original.settings);
    report.restored = true;
    save();
  } else throw Error("Unknown stage");
  console.log(
    JSON.stringify({
      ok: true,
      stage,
      cases: report.cases.length,
      recordId: report.recordId || null,
      restored: !!report.restored,
    }),
  );
} catch (e) {
  report.failure = e.message;
  save();
  console.error(JSON.stringify({ ok: false, stage, message: e.message }));
  process.exitCode = 1;
} finally {
  await Promise.allSettled([
    d.auth.signOut({ scope: "local" }),
    t.auth.signOut({ scope: "local" }),
  ]);
}
