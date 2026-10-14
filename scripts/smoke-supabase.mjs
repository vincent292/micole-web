import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient();
const ids = Object.fromEntries(
  [
    "admin",
    "director",
    "teacher",
    "mother",
    "stranger",
    "school",
    "otherSchool",
    "room",
    "teacherRecord",
    "student",
    "plan",
  ].map((k) => [k, randomUUID()]),
);
const suffix = randomUUID().slice(0, 8);
const emails = Object.fromEntries(
  ["admin", "director", "teacher", "mother", "stranger"].map((k) => [
    k,
    `micole-${k}-${suffix}@example.invalid`,
  ]),
);
const checks = [];
const check = (name, value) => {
  if (!value) throw new Error("Falló la prueba: " + name);
  checks.push(name);
};
const rpc = async (name, params) => {
  const values = Object.values(params);
  const placeholders = values.map((_, i) => `$${i + 1}`).join(",");
  return (
    await db.query(`select public.${name}(${placeholders}) as result`, values)
  ).rows[0].result;
};
async function asUser(user, fn) {
  await db.query("select set_config('request.headers','{}',true)");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  const result = await fn();
  await db.query("reset role");
  await db.query("select set_config('request.headers','{}',true)");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return result;
}
async function denied(fn) {
  await db.query("savepoint expected_denial");
  try {
    await fn();
    await db.query("release savepoint expected_denial");
    return false;
  } catch {
    await db.query("rollback to savepoint expected_denial");
    await db.query("release savepoint expected_denial");
    return true;
  }
}
try {
  await db.connect();
  await db.query("begin");
  for (const role of Object.keys(emails))
    await db.query(
      "insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),$3::jsonb)",
      [
        ids[role],
        emails[role],
        JSON.stringify({ full_name: `Prueba ${role}` }),
      ],
    );
  await db.query("insert into public.platform_admins(user_id) values($1)", [
    ids.admin,
  ]);
  await asUser(ids.admin, () =>
    rpc("save_school", {
      p_school: JSON.stringify({
        id: ids.school,
        name: `Colegio temporal ${suffix}`,
        slug: `smoke-${suffix}`,
        city: "Cochabamba",
        director_name: "Dirección temporal",
        brand_color: "#3D6EF7",
        status: "active",
      }),
    }),
  );
  const directorToken = await asUser(ids.admin, () =>
    rpc("create_invitation", {
      p_invite: JSON.stringify({
        school_id: ids.school,
        email: emails.director,
        role: "director",
        relationship: "other",
      }),
    }),
  );
  await asUser(ids.director, () =>
    rpc("claim_invitation", { p_token: directorToken }),
  );
  check(
    "dirección por invitación verificada",
    (
      await asUser(ids.director, () => rpc("workspace_identity", {}))
    ).roles.includes("director"),
  );
  await asUser(ids.director, () =>
    rpc("save_teacher", {
      p_teacher: JSON.stringify({
        id: ids.teacherRecord,
        school_id: ids.school,
        name: "Docente temporal",
        email: emails.teacher,
        specialty: "Inicial",
        status: "pending",
      }),
    }),
  );
  await asUser(ids.director, () =>
    rpc("save_classroom", {
      p_room: JSON.stringify({
        id: ids.room,
        school_id: ids.school,
        name: "Nidito temporal",
        level: "Nidito",
        schedule: "08:00–12:00",
      }),
      p_teacher_ids: [ids.teacherRecord],
    }),
  );
  const teacherToken = await asUser(ids.director, () =>
    rpc("create_invitation", {
      p_invite: JSON.stringify({
        school_id: ids.school,
        teacher_id: ids.teacherRecord,
        email: emails.teacher,
        role: "teacher",
        relationship: "other",
      }),
    }),
  );
  await asUser(ids.teacher, () =>
    rpc("claim_invitation", { p_token: teacherToken }),
  );
  await asUser(ids.director, () =>
    rpc("enroll_student", {
      p_student: JSON.stringify({
        id: ids.student,
        school_id: ids.school,
        classroom_id: ids.room,
        first_name: "Estudiante",
        last_name: "Temporal",
        birth_date: "2023-01-01",
        identity_number: "SMOKE-CI-" + suffix,
        mother_name: "Madre temporal",
        mother_email: emails.mother,
        father_name: "Padre temporal",
        father_email: `father-${suffix}@example.invalid`,
        primary_guardian_name: "Responsable temporal",
        primary_guardian_email: emails.mother,
        monthly_fee: 420,
        snack_fee: 60,
      }),
    }),
  );
  const activation = (
    await db.query(
      "select id,amount from public.platform_charges where student_id=$1",
      [ids.student],
    )
  ).rows[0];
  check("activación transaccional de Bs 50", Number(activation.amount) === 50);
  check(
    "activación impaga bloqueada",
    await asUser(ids.director, () =>
      denied(() =>
        rpc("set_student_status", {
          p_student_id: ids.student,
          p_status: "active",
        }),
      ),
    ),
  );
  await asUser(ids.admin, () =>
    rpc("record_platform_payment", {
      p_charge_id: activation.id,
      p_method: "transfer",
      p_reference: "SMOKE-SIN-TRANSACCIÓN-BANCARIA",
    }),
  );
  await asUser(ids.director, () =>
    rpc("set_student_status", {
      p_student_id: ids.student,
      p_status: "active",
    }),
  );
  const today = (
    await db.query(
      "select (now() at time zone 'America/La_Paz')::date::text as day",
    )
  ).rows[0].day;
  const plan = {
    id: ids.plan,
    school_id: ids.school,
    student_id: ids.student,
    start_date: today,
    months: 2,
    monthly_fee: 420,
    snack_fee: 60,
    enrollment_fee: 0,
    due_day: 10,
    discount: 0,
    prorate: false,
  };
  await asUser(ids.director, () =>
    rpc("create_payment_plan", { p_plan: JSON.stringify(plan) }),
  );
  const charges = (
    await db.query(
      "select id,amount from public.school_charges where plan_id=$1 order by due_date",
      [ids.plan],
    )
  ).rows;
  check(
    "mensualidad, merienda y licencia",
    charges.length === 2 && charges.every((c) => Number(c.amount) === 509),
  );
  const automaticParent = await asUser(ids.mother, () =>
    rpc("workspace_identity", {}),
  );
  check(
    "madre vinculada por correo sin aceptar invitación",
    automaticParent.guardianStudentIds.includes(ids.student),
  );
  const intakeToken = await asUser(ids.director, () =>
    rpc("create_family_intake", {
      p_student_id: ids.student,
      p_recipient: "mother",
    }),
  );
  const asGuest = async (fn) => {
    await db.query("set local role anon");
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    const value = await fn();
    await db.query("reset role");
    return value;
  };
  const intakeContext = await asGuest(() =>
    rpc("family_intake_context", { p_token: intakeToken }),
  );
  check(
    "formulario público no expone datos médicos ni correos",
    Object.keys(intakeContext).every((k) =>
      [
        "schoolName",
        "logoUrl",
        "childName",
        "recipient",
        "status",
        "expiresAt",
      ].includes(k),
    ),
  );
  const submittedCare = {
    allergies: "Ninguna",
    foodRestrictions: "Ninguna",
    emergencyContact: "Contacto temporal",
    emergencyPhone: "70000000",
    hasInsurance: false,
    secondEmergencyContact: "",
    secondEmergencyPhone: "",
    medicalConditions: "",
    careInstructions: "",
    insuranceProvider: "",
    insuranceNumber: "",
  };
  await asGuest(() =>
    rpc("submit_family_intake", {
      p_token: intakeToken,
      p_profile: JSON.stringify({
        ...submittedCare,
        monthlyFee: 0,
        status: "active",
      }),
    }),
  );
  const intakeRecord = (
    await db.query(
      "select id,status,profile from public.family_intake_forms where student_id=$1",
      [ids.student],
    )
  ).rows[0];
  check(
    "respuesta familiar pendiente de Dirección",
    intakeRecord.status === "submitted" &&
      intakeRecord.profile.monthlyFee === undefined,
  );
  check(
    "docente no aprueba la ficha familiar",
    await asUser(ids.teacher, () =>
      denied(() =>
        rpc("review_family_intake", { p_id: intakeRecord.id, p_approve: true }),
      ),
    ),
  );
  await asUser(ids.director, () =>
    rpc("review_family_intake", { p_id: intakeRecord.id, p_approve: true }),
  );
  check(
    "Dirección aprueba y completa cuidados",
    (
      await db.query(
        "select profile_complete,monthly_fee from public.students where id=$1",
        [ids.student],
      )
    ).rows[0].profile_complete === true,
  );
  const motherToken = await asUser(ids.director, () =>
    rpc("create_invitation", {
      p_invite: JSON.stringify({
        school_id: ids.school,
        student_id: ids.student,
        email: emails.mother,
        role: "guardian",
        relationship: "mother",
      }),
    }),
  );
  check(
    "invitación rechaza otro correo",
    await asUser(ids.stranger, () =>
      denied(() => rpc("claim_invitation", { p_token: motherToken })),
    ),
  );
  await asUser(ids.mother, () =>
    rpc("claim_invitation", { p_token: motherToken }),
  );
  await asUser(ids.mother, () =>
    rpc("complete_student_profile", {
      p_student_id: ids.student,
      p_profile: JSON.stringify({
        allergies: "Ninguna",
        foodRestrictions: "Ninguna",
        emergencyContact: "Contacto de prueba",
        emergencyPhone: "70000000",
        hasInsurance: false,
      }),
    }),
  );
  check(
    "familia accede solo al alumno vinculado",
    (
      await asUser(ids.mother, () => db.query("select id from public.students"))
    ).rows.every((s) => s.id === ids.student),
  );
  check(
    "cuenta ajena sin acceso",
    (
      await asUser(ids.stranger, () =>
        db.query("select id from public.students"),
      )
    ).rows.length === 0,
  );
  await asUser(ids.teacher, () =>
    rpc("publish_class_entry", {
      p_school_id: ids.school,
      p_classroom_id: ids.room,
      p_category: "actividad",
      p_note: "Actividad de prueba transaccional",
      p_date: today,
    }),
  );
  check(
    "cuaderno visible para familia",
    (
      await asUser(ids.mother, () =>
        db.query("select id from public.daily_entries where student_id=$1", [
          ids.student,
        ]),
      )
    ).rows.length === 1,
  );
  await asUser(ids.director, () =>
    rpc("record_school_payment", {
      p_charge_id: charges[0].id,
      p_method: "cash",
      p_reference: "SMOKE-RECIBO-TEMPORAL",
    }),
  );
  await asUser(ids.director, () =>
    rpc("record_school_payment", {
      p_charge_id: charges[0].id,
      p_method: "cash",
      p_reference: "SMOKE-RECIBO-TEMPORAL",
    }),
  );
  check(
    "pago manual idempotente",
    (
      await db.query(
        "select id from public.school_payments where charge_id=$1",
        [charges[0].id],
      )
    ).rows.length === 1,
  );
  check(
    "familia no puede falsificar pago",
    await asUser(ids.mother, () =>
      denied(() =>
        db.query("update public.school_charges set status='paid' where id=$1", [
          charges[1].id,
        ]),
      ),
    ),
  );
  const notices = (
    await asUser(ids.mother, () =>
      db.query(
        "select id from public.notifications where kind='payment' and source_id=$1",
        [charges[0].id],
      ),
    )
  ).rows;
  check("notificación de pago propia", notices.length === 1);
  await asUser(ids.mother, () =>
    rpc("mark_notification_read", { p_id: notices[0].id }),
  );
  check(
    "lectura persistente",
    (
      await db.query("select read_at from public.notifications where id=$1", [
        notices[0].id,
      ])
    ).rows[0].read_at !== null,
  );
  const request = await asUser(ids.stranger, () =>
    rpc("request_institution", {
      p_request: JSON.stringify({
        school_name: "Otra institución temporal",
        city: "La Paz",
        contact_name: "Dirección nueva",
        phone: "70000000",
        message: "Solicitud de prueba sin datos reales",
      }),
    }),
  );
  check(
    "solo plataforma aprueba instituciones",
    await asUser(ids.director, () =>
      denied(() =>
        rpc("review_institution_request", {
          p_id: request,
          p_approve: true,
          p_response: "Prueba",
        }),
      ),
    ),
  );
  const newSchool = await asUser(ids.admin, () =>
    rpc("review_institution_request", {
      p_id: request,
      p_approve: true,
      p_response: "Bienvenidos",
    }),
  );
  check(
    "aprobación crea institución y acceso",
    (
      await asUser(ids.stranger, () =>
        db.query("select id from public.schools where id=$1", [newSchool]),
      )
    ).rows.length === 1,
  );
  check(
    "maestra sin acceso a auditoría",
    (
      await asUser(ids.teacher, () =>
        db.query("select id from public.audit_events"),
      )
    ).rows.length === 0,
  );
  // La reserva temporal solo existe dentro de la transacción de prueba.
  await db.query(
    "insert into aulanexo_private.platform_admin_allowlist(email) values($1)",
    [emails.admin],
  );
  check(
    "plataforma no lee fichas de estudiantes",
    (await asUser(ids.admin, () => db.query("select id from public.students")))
      .rows.length === 0,
  );
  check(
    "solo propietario reservado abre soporte",
    await asUser(ids.director, () =>
      denied(() => rpc("support_accounts", { p_school_id: ids.school })),
    ),
  );
  const startSupport = (target, role) =>
    asUser(ids.admin, () =>
      rpc("start_support_session", {
        p_school_id: ids.school,
        p_user_id: target,
        p_role: role,
        p_reason: "Revisión de soporte automatizada",
      }),
    );
  const inSupport = (user, session, fn) =>
    asUser(user, async () => {
      await db.query("select set_config('request.headers',$1,true)", [
        JSON.stringify({ "x-micole-support": session }),
      ]);
      return fn();
    });
  const support = await startSupport(ids.admin, "director");
  const supportIdentity = await inSupport(ids.admin, support.id, () =>
    rpc("workspace_identity", {}),
  );
  check(
    "soporte de dirección sin rol permanente",
    supportIdentity.roles.length === 1 &&
      supportIdentity.roles[0] === "director" &&
      supportIdentity.support.schoolId === ids.school,
  );
  check(
    "soporte acotado al colegio elegido",
    (
      await inSupport(ids.admin, support.id, () =>
        db.query("select id from public.schools"),
      )
    ).rows.every((row) => row.id === ids.school),
  );
  check(
    "otro usuario no reutiliza la sesión",
    await inSupport(ids.stranger, support.id, () =>
      denied(() => rpc("workspace_identity", {})),
    ),
  );
  await inSupport(ids.admin, support.id, () =>
    rpc("set_student_access_until", {
      p_student_id: ids.student,
      p_until: "2099-01-01",
    }),
  );
  const audit = (
    await db.query(
      "select actor_id,summary from public.audit_events where entity='students' and entity_id=$1 and summary->>'supportSessionId'=$2 order by created_at desc limit 1",
      [ids.student, support.id],
    )
  ).rows[0];
  check(
    "auditoría conserva propietario y contexto de soporte",
    audit.actor_id === ids.admin && audit.summary.supportRole === "director",
  );
  await asUser(ids.admin, () =>
    rpc("end_support_session", { p_id: support.id }),
  );
  check(
    "soporte cerrado no puede seguir operando",
    await inSupport(ids.admin, support.id, () =>
      denied(() => rpc("workspace_identity", {})),
    ),
  );
  const teacherSupport = await startSupport(ids.teacher, "teacher");
  check(
    "docente atendida no hereda plataforma",
    (
      await inSupport(ids.admin, teacherSupport.id, () =>
        rpc("workspace_identity", {}),
      )
    ).roles.join() === "teacher",
  );
  check(
    "docente de soporte no ejecuta corte de plataforma",
    await inSupport(ids.admin, teacherSupport.id, () =>
      denied(() => rpc("run_billing_cycle", {})),
    ),
  );
  const familySupport = await startSupport(ids.mother, "guardian");
  const familyStudents = (
    await inSupport(ids.admin, familySupport.id, () =>
      db.query("select id from public.students"),
    )
  ).rows;
  check(
    "soporte familiar conserva solo sus hijos",
    familyStudents.length === 1 && familyStudents[0].id === ids.student,
  );
  await db.query("update public.students set access_until=null where id=$1", [
    ids.student,
  ]);
  await db.query(
    "update public.school_charges set due_date=current_date-2 where id=$1",
    [charges[1].id],
  );
  check(
    "soporte familiar conserva bloqueo por deuda",
    (
      await inSupport(ids.admin, familySupport.id, () =>
        db.query("select id from public.daily_entries"),
      )
    ).rows.length === 0,
  );
  await db.query(
    "update aulanexo_private.support_sessions set expires_at=now()-interval '1 second' where id=$1",
    [familySupport.id],
  );
  check(
    "soporte caducado rechaza solicitudes",
    await inSupport(ids.admin, familySupport.id, () =>
      denied(() => rpc("workspace_identity", {})),
    ),
  );
  const childRecord = (
    await db.query(
      "select to_jsonb(s) as record from public.students s where id=$1",
      [ids.student],
    )
  ).rows[0].record;
  await asUser(ids.director, () =>
    rpc("save_student", {
      p_student: JSON.stringify({
        ...childRecord,
        father_name: "Propietario padre",
        father_email: emails.admin,
      }),
    }),
  );
  const ownAccounts = await asUser(ids.admin, () =>
    rpc("support_accounts", { p_school_id: ids.school }),
  );
  check(
    "propietario prueba su propia cuenta de padre",
    ownAccounts.some(
      (account) => account.id === ids.admin && account.role === "guardian",
    ),
  );
  const ownSupport = await startSupport(ids.admin, "guardian");
  const ownIdentity = await inSupport(ids.admin, ownSupport.id, () =>
    rpc("workspace_identity", {}),
  );
  check(
    "padre propietario conserva permisos familiares",
    ownIdentity.roles.join() === "guardian" &&
      ownIdentity.guardianStudentIds.includes(ids.student),
  );
  await db.query("rollback");
  check(
    "prueba sin registros residuales",
    (await db.query("select id from public.schools where id=$1", [ids.school]))
      .rows.length === 0,
  );
  console.log(
    JSON.stringify({
      ok: true,
      checks: checks.length,
      passed: checks,
      rolledBack: true,
    }),
  );
} catch (e) {
  try {
    await db.query("rollback");
  } catch {}
  reportFailure(e);
} finally {
  await db.end();
}
