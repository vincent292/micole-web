import fs from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { qa, r, day, session, rpc, rows } from "./qa-session.mjs";
const file = "output/qa/2026-10-29-asistencia/alumnos-api.json";
assert.ok(
  !fs.existsSync(file),
  "Review the previous run before repeating confirmed attendance.",
);
const report = {
  day,
  status: "running",
  mode: "normal QA Auth, live server",
  cases: [],
  resources: {},
};
const clients = [];
const save = () =>
  fs.writeFileSync(file, JSON.stringify(report, null, 2) + "\n");
const pass = (name, detail) => {
  report.cases.push({ name, status: "passed", detail });
  save();
};
const login = async (key) => {
  const c = await session(key);
  clients.push(c);
  return c;
};
async function deny(c, name, args, pattern) {
  const { error } = await c.rpc(name, args);
  assert.ok(error, `${name} must reject`);
  assert.match(error.message, pattern);
}
try {
  save();
  const d = await login("director"),
    t = await login("teacher"),
    tb = await login("teacherb"),
    m = await login("guardian"),
    f = await login("father"),
    other = await login("familyb"),
    kid = await login("studentb"),
    scheduler = await login("scheduler"),
    tc = await login("teacherc");
  const w = (c, room = r.kinderB, child = null) =>
    rpc(c, "student_attendance_workspace", {
      p_classroom_id: room,
      p_day: day,
      p_month: day.slice(0, 7) + "-01",
      p_student_id: child,
    });
  const before = await w(tb);
  assert.equal(before.session, null);
  assert.ok(before.roster.some((s) => s.student_id === r.bruno));
  assert.equal(before.canMark, true);
  assert.equal(before.canCorrect, true);
  assert.equal(before.canReview, false);
  const direction = await w(d);
  assert.equal(direction.canMark, false);
  assert.equal(direction.canCorrect, false);
  assert.equal(direction.canReview, false);
  const marks = (status) =>
    before.roster.map((s) => ({
      studentId: s.student_id,
      status,
      note: "QA2910: simulacro de asistencia.",
    }));
  const payload = (rev, status = "excused") => ({
    p_classroom_id: r.kinderB,
    p_day: day,
    p_records: marks(status),
    p_revision: 0,
    p_confirm: true,
    p_reason: "",
    p_request_id: report.resources.submission,
    p_permission_revision: rev,
  });
  report.resources.permissionB = randomUUID();
  report.resources.submission = randomUUID();
  save();
  const permission = async (c, id, child, reason) =>
    rows(
      c
        .from("family_requests")
        .insert({
          id,
          school_id: qa.schoolId,
          student_id: child,
          type: "absence",
          request_date: day,
          reason,
        })
        .select("id"),
    );
  await permission(
    other,
    report.resources.permissionB,
    r.bruno,
    "QA2910: cita ficticia informada por la familia de Bruno.",
  );
  const pending = await w(tb);
  assert.equal(pending.permissions.length, 1);
  assert.equal((await w(d)).permissions.length, 1);
  assert.equal((await w(other, r.kinderB, r.bruno)).permissions.length, 0);
  await deny(
    t,
    "student_attendance_workspace",
    {
      p_classroom_id: r.kinderB,
      p_day: day,
      p_month: day.slice(0, 7) + "-01",
      p_student_id: null,
    },
    /acceso/,
  );
  assert.equal(
    (
      await rows(
        m
          .from("family_requests")
          .select("id")
          .eq("id", report.resources.permissionB),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await rows(
        kid
          .from("family_requests")
          .select("id")
          .eq("id", report.resources.permissionB),
      )
    ).length,
    0,
  );
  pass(
    "permission-privacy",
    "Pedido familiar visible al docente asignado y Dirección. Otra familia, estudiante y docente de otra aula no obtienen su contenido.",
  );
  await deny(
    tb,
    "save_student_attendance",
    payload(before.permissionRevision),
    /cambiaron/,
  );
  await deny(
    tb,
    "save_student_attendance",
    payload(pending.permissionRevision),
    /pendientes/,
  );
  for (const c of [d, m, other, kid, scheduler, tc])
    await deny(
      c,
      "save_student_attendance",
      payload(pending.permissionRevision),
      /docentes asignados/,
    );
  const legacy = payload(pending.permissionRevision);
  delete legacy.p_permission_revision;
  await deny(tb, "save_student_attendance", legacy, /permisos de la familia/);
  delete legacy.p_request_id;
  await deny(tb, "save_student_attendance", legacy, /permisos de la familia/);
  pass(
    "only-teacher-and-fresh-permissions",
    "Solo docente asignado marca. Los pedidos nuevos invalidan la revisión anterior; pendientes y llamadas antiguas no pueden confirmar la lista.",
  );
  const response = {
    p_id: report.resources.permissionB,
    p_approve: true,
    p_note: "QA2910: permiso ficticio recibido y aceptado por su docente.",
  };
  for (const c of [d, m, other, kid, t, tc])
    await deny(c, "review_attendance_permission", response, /docente asignado/);
  await deny(
    tb,
    "review_attendance_permission",
    { ...response, p_note: "" },
    /respuesta/,
  );
  await rpc(tb, "review_attendance_permission", response);
  await rpc(tb, "review_attendance_permission", response);
  const approved = await w(tb);
  assert.equal(approved.permissions[0].status, "approved");
  assert.ok(approved.permissions[0].response.includes("QA2910"));
  await deny(
    tb,
    "save_student_attendance",
    payload(pending.permissionRevision),
    /cambiaron/,
  );
  await deny(
    tb,
    "save_student_attendance",
    payload(approved.permissionRevision, "absent"),
    /permiso aceptado/,
  );
  pass(
    "permission-accept-and-absence-guard",
    "Docente acepta con respuesta; reintento no duplica. Dirección/familia/otro docente no usan la acción de asistencia. Permiso aceptado bloquea Falta.",
  );
  const confirmed = await rpc(
    tb,
    "save_student_attendance",
    payload(approved.permissionRevision),
  );
  assert.deepEqual(
    await rpc(
      tb,
      "save_student_attendance",
      payload(approved.permissionRevision),
    ),
    confirmed,
  );
  let family = await w(other, r.kinderB, r.bruno);
  assert.equal(
    family.records.find((v) => v.studentId === r.bruno && v.date === day)
      .status,
    "excused",
  );
  const noAbsence = await rows(
    other
      .from("notifications")
      .select("id")
      .eq("kind", "attendance_absent")
      .eq("student_id", r.bruno)
      .gte("created_at", day + "T04:00:00Z"),
  );
  assert.equal(noAbsence.length, 0);
  const requestReplies = await rows(
    other
      .from("notifications")
      .select("id")
      .eq("kind", "request_response")
      .eq("source_id", report.resources.permissionB),
  );
  assert.equal(requestReplies.length, 1);
  pass(
    "confirmed-excused-and-family",
    "Lista confirmada como Con permiso; familia ve el estado y una respuesta, sin aviso falso de falta. Reintento conserva una sola lista.",
  );
  const current = await w(tb),
    record = current.records.find(
      (v) => v.studentId === r.bruno && v.date === day,
    );
  report.resources.record = record.id;
  report.resources.correction = randomUUID();
  save();
  const correction = {
    p_id: report.resources.correction,
    p_record_id: record.id,
    p_status: "late",
    p_note: "QA2910: finalmente asistió tarde.",
    p_reason:
      "QA2910: el docente verificó que asistió después de su cita ficticia.",
  };
  for (const c of [d, t, m, other, kid, scheduler, tc])
    await deny(
      c,
      "request_attendance_correction",
      correction,
      /docente asignado/,
    );
  await deny(
    tb,
    "request_attendance_correction",
    { ...correction, p_reason: "" },
    /justificativo/,
  );
  await rpc(tb, "request_attendance_correction", correction);
  await rpc(tb, "request_attendance_correction", correction);
  for (const c of [d, tb])
    await deny(
      c,
      "review_attendance_correction",
      {
        p_id: correction.p_id,
        p_approve: false,
        p_note: "QA intento sin permiso",
      },
      /Dirección no puede cambiar/,
    );
  family = await w(other, r.kinderB, r.bruno);
  assert.equal(family.records.find((v) => v.id === record.id).status, "late");
  assert.equal(family.corrections.length, 0);
  const history = (await w(d)).corrections.filter(
    (c) => c.id === correction.p_id,
  );
  assert.equal(history.length, 1);
  assert.equal(history[0].reason, correction.p_reason);
  assert.equal(
    history[0].requested_by,
    qa.accounts.find((a) => a.key === "teacherb").id,
  );
  const original = await rows(
    d.from("student_attendance_records").select("status").eq("id", record.id),
  );
  assert.equal(original[0].status, "excused");
  const correctionNotices = await rows(
    other
      .from("notifications")
      .select("id")
      .eq("kind", "attendance_corrected")
      .eq("source_id", correction.p_id),
  );
  assert.equal(correctionNotices.length, 1);
  pass(
    "teacher-justification-history",
    "Solo docente asignado corrige con justificativo. Original Con permiso intacto, estado efectivo Tardanza, una corrección y un aviso. Dirección consulta el motivo sin modificar.",
  );
  const direct = await d
    .from("student_attendance_records")
    .update({ status: "absent" })
    .eq("id", record.id);
  assert.ok(direct.error);
  await deny(
    tb,
    "save_student_attendance",
    {
      ...payload(approved.permissionRevision, "present"),
      p_revision: current.session.revision,
      p_request_id: randomUUID(),
    },
    /confirmada/,
  );
  pass(
    "confirmed-list-immutable",
    "Ni Dirección mediante tabla ni docente reescribiendo la lista pueden modificar el original confirmado.",
  );
  // Prepare the other classroom for visible web/APK review, without confirming its list.
  const a = await w(t, r.kinderA);
  assert.equal(a.session, null);
  for (const [key, c, child, reason] of [
    [
      "mateoPermission",
      m,
      r.mateo,
      "QA2910-MATEO: permiso ficticio solicitado por mamá para una cita.",
    ],
    [
      "emmaPermission",
      m,
      r.emma,
      "QA2910-EMMA: pedido ficticio para revisar y responder antes de lista.",
    ],
    [
      "sofiaPermission",
      other,
      r.sofia,
      "QA2910-SOFIA: permiso ficticio de otra familia de la misma aula.",
    ],
  ]) {
    report.resources[key] = randomUUID();
    save();
    await permission(c, report.resources[key], child, reason);
  }
  await rpc(t, "review_attendance_permission", {
    p_id: report.resources.sofiaPermission,
    p_approve: true,
    p_note: "QA2910: permiso ficticio de Sofia aceptado.",
  });
  pass(
    "visible-fixture-ready",
    "Aula A lista para interfaz: Mateo y Emma pendientes; Sofia aceptada. Cada familia conserva solo sus pedidos. No se confirmó esta lista.",
  );
  report.status = "passed";
  save();
  console.log(JSON.stringify({ ok: true, cases: report.cases.length, file }));
} catch (e) {
  report.status = "failed";
  report.failure = e.message;
  save();
  console.error(JSON.stringify({ ok: false, message: e.message, file }));
  process.exitCode = 1;
} finally {
  await Promise.allSettled(
    clients.map((c) => c.auth.signOut({ scope: "local" })),
  );
}
