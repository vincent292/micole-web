import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";

// Every fixture and mutation stays inside a transaction that always rolls back.
// This script never calls authentication/email APIs, a bank, or a payment provider.
const ids = Object.fromEntries([
  "admin", "director", "teacher", "mother", "school", "otherSchool", "room", "student",
  "oldCharge", "currentCharge", "payment", "unverifiedPayment", "license", "activation", "platformPayment",
].map(name => [name, randomUUID()]));
const suffix = randomUUID().slice(0, 8);
const checks = [];
let db;
let transaction = false;
const check = (name, value) => {
  if (!value) throw new Error(`Falló la prueba: ${name}`);
  checks.push(name);
};
async function asUser(user, fn, role = "authenticated") {
  await db.query("select set_config('request.headers','{}',true)");
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || ""]);
  const value = await fn();
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return value;
}
async function denied(fn) {
  await db.query("savepoint expected_report_denial");
  try {
    await fn();
    await db.query("release savepoint expected_report_denial");
    return false;
  } catch (error) {
    await db.query("rollback to savepoint expected_report_denial");
    await db.query("release savepoint expected_report_denial");
    return ["42501", "22023"].includes(error.code);
  }
}
async function report(schoolId, from, to, classroomId = null, studentId = null) {
  return (await db.query("select public.financial_report($1,$2,$3,$4,$5) as report", [schoolId, from, to, classroomId, studentId])).rows[0].report;
}
try {
  db = databaseClient();
  await db.connect();
  await db.query("begin");
  transaction = true;
  for (const role of ["admin", "director", "teacher", "mother"]) {
    await db.query("insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),$3::jsonb)", [ids[role], `micole-report-${role}-${suffix}@example.invalid`, JSON.stringify({ full_name: `Reportes temporal ${role}` })]);
  }
  await db.query("insert into public.platform_admins(user_id) values($1)", [ids.admin]);
  await db.query("insert into public.schools(id,name,slug,status) values($1,$2,$3,'active'),($4,$5,$6,'active')", [ids.school, `Reporte temporal ${suffix}`, `report-smoke-${suffix}`, ids.otherSchool, `Otra temporal ${suffix}`, `report-other-${suffix}`]);
  await db.query("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian')", [ids.school, ids.director, ids.teacher, ids.mother]);
  await db.query("insert into public.classrooms(id,school_id,name) values($1,$2,'Curso de reportes temporal')", [ids.room, ids.school]);
  await db.query("insert into public.students(id,school_id,classroom_id,first_name,last_name,status) values($1,$2,$3,'Nombre privado temporal','Apellido temporal','active')", [ids.student, ids.school, ids.room]);
  await db.query("insert into public.student_guardians(student_id,user_id,relationship,verified_at) values($1,$2,'mother',now())", [ids.student, ids.mother]);
  const dates = (await db.query(`select
    (now() at time zone 'America/La_Paz')::date::text as today,
    date_trunc('month',now() at time zone 'America/La_Paz')::date::text as month_start,
    (date_trunc('month',now() at time zone 'America/La_Paz')-interval '1 month')::date::text as previous_month,
    to_char(now() at time zone 'America/La_Paz','YYYY-MM') as period`)).rows[0];
  await db.query("insert into public.school_charges(id,school_id,student_id,concept,due_date,amount,status) values($1,$2,$3,'Cuota del mes anterior',$4,185,'paid'),($5,$2,$3,'Cuota del mes vigente',$6,120,'pending')", [ids.oldCharge, ids.school, ids.student, dates.previous_month, ids.currentCharge, dates.today]);
  await db.query("insert into public.school_payments(id,charge_id,amount,payment_method,verification_state,paid_at,created_by,reference) values($1,$2,185,'transfer','verified',now(),$3,'PRUEBA-REPORTES-SIN-BANCO'),($4,$5,120,'qr','manual_pending',now(),$3,'NO-VERIFICADO')", [ids.payment, ids.oldCharge, ids.director, ids.unverifiedPayment, ids.currentCharge]);
  await db.query("insert into public.platform_charges(id,school_id,student_id,concept,period,amount,status) values($1,$2,null,'Licencias de prueba',$3,58,'pending'),($4,$2,$5,'Activación Nombre privado temporal Apellido temporal',$3,50,'paid')", [ids.license, ids.school, dates.period, ids.activation, ids.student]);
  await db.query("insert into public.platform_payments(id,charge_id,amount,payment_method,reference,created_by,paid_at) values($1,$2,50,'transfer','PRUEBA-PLATAFORMA-SIN-BANCO',$3,now())", [ids.platformPayment, ids.activation, ids.admin]);
  const schoolReport = await asUser(ids.director, () => report(ids.school, dates.month_start, dates.today));
  check("Dirección recibe únicamente el colegio seleccionado", schoolReport.scope === "school" && schoolReport.schools.length === 1 && schoolReport.schools[0].id === ids.school);
  check("Emitido y cobrado provienen de fechas independientes", schoolReport.charges.length === 1 && schoolReport.charges[0].id === ids.currentCharge && schoolReport.charges[0].amount === 120 && schoolReport.payments.length === 1 && schoolReport.payments[0].chargeId === ids.oldCharge && schoolReport.payments[0].amount === 185);
  check("Los pagos pendientes de verificación no son ingresos", !schoolReport.payments.some(p => p.id === ids.unverifiedPayment));
  check("El vencimiento de hoy permanece pendiente", schoolReport.charges[0].status === "pending");
  check("La fecha del pago corresponde al calendario boliviano", schoolReport.payments[0].date === dates.today);
  const filtered = await asUser(ids.director, () => report(ids.school, dates.month_start, dates.today, ids.room, ids.student));
  check("Filtros de curso y alumno conservan el ledger", filtered.students.length === 1 && filtered.students[0].id === ids.student && filtered.payments.length === 1);
  check("Dirección no puede consultar otra institución", await asUser(ids.director, () => denied(() => report(ids.otherSchool, dates.month_start, dates.today))));
  check("Dirección debe seleccionar su institución", await asUser(ids.director, () => denied(() => report(null, dates.month_start, dates.today))));
  check("Docentes no consultan reportes financieros", await asUser(ids.teacher, () => denied(() => report(ids.school, dates.month_start, dates.today))));
  check("Familias no consultan reportes financieros", await asUser(ids.mother, () => denied(() => report(ids.school, dates.month_start, dates.today))));
  check("Anon no puede ejecutar el RPC", await asUser(null, () => denied(() => report(ids.school, dates.month_start, dates.today)), "anon"));
  const company = await asUser(ids.admin, () => report(ids.school, dates.month_start, dates.today));
  check("Plataforma consulta sus finanzas y no cuotas escolares", company.scope === "platform" && company.charges.length === 2 && !company.charges.some(c => c.id === ids.oldCharge || c.id === ids.currentCharge));
  check("Plataforma no recibe aulas ni alumnos", company.students.length === 0 && company.classrooms.length === 0 && !JSON.stringify(company).includes(ids.student) && !JSON.stringify(company).includes("Nombre privado temporal") && !JSON.stringify(company).includes("studentId"));
  check("Activaciones y pagos tienen concepto sanitizado", company.charges.find(c => c.id === ids.activation)?.concept === "Activación inicial" && company.payments.length === 1 && company.payments[0].concept === "Activación inicial");
  check("Cantidad de licencias es la facturada para el mes", company.charges.find(c => c.id === ids.license)?.licenseCount === 2);
  check("Plataforma no puede abrir filtros escolares", await asUser(ids.admin, () => denied(() => report(ids.school, dates.month_start, dates.today, ids.room))));
  await db.query("rollback");
  transaction = false;
  console.log(JSON.stringify({ ok: true, checks: checks.length, passed: checks, rolledBack: true }));
} catch (error) {
  if (db && transaction) {
    await db.query("rollback").catch(() => {});
    transaction = false;
  }
  reportFailure(error);
} finally {
  if (db) await db.end();
}
