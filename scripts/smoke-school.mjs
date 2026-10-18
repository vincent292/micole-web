import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient(),
  keys = [
    "director",
    "teacher",
    "mother",
    "outsider",
    "school",
    "room",
    "child",
    "assessment",
    "batch",
  ],
  id = Object.fromEntries(keys.map((k) => [k, randomUUID()])),
  suffix = randomUUID().slice(0, 8),
  checks = [];
const q = (text, values = []) =>
  db.query({ text, values, query_timeout: 25000 });
let sequence = 0;
function check(name, ok) {
  if (!ok) throw new Error("Falló: " + name);
  checks.push(name);
}
async function as(user, task) {
  const s = `smoke_${++sequence}`;
  await q(`savepoint ${s}`);
  await q("set local role authenticated");
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers','{}',true)",
    [user, JSON.stringify({ sub: user, role: "authenticated" })],
  );
  try {
    const result = await task();
    await q("reset role");
    await q(
      "select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)",
    );
    await q(`release savepoint ${s}`);
    return result;
  } catch (e) {
    await q(`rollback to savepoint ${s}`);
    await q(`release savepoint ${s}`);
    throw e;
  }
}
async function denied(user, task) {
  try {
    await as(user, task);
    return false;
  } catch {
    return true;
  }
}
try {
  await db.connect();
  await q("set statement_timeout='25s'");
  await q("begin");
  for (const key of ["director", "teacher", "mother", "outsider"])
    await q(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),\'{"full_name":"Verificación temporal de módulos"}\')',
      [id[key], `${key}-${suffix}@example.invalid`],
    );
  await q(
    "insert into schools(id,name,slug,status) values($1,'Verificación temporal de módulos',$2,'active')",
    [id.school, `life-${suffix}`],
  );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [id.school, id.director, id.teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name,academic_year) values($1,$2,'Aula temporal',2026)",
    [id.room, id.school],
  );
  const teacherId = randomUUID();
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente temporal',$4,'active')",
    [teacherId, id.school, id.teacher, `teacher-${suffix}@example.invalid`],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [id.school, teacherId, id.room],
  );
  await as(id.director, () =>
    q("select save_admission_settings($1,'mother',false,false)", [id.school]),
  );
  const student = {
    id: id.child,
    school_id: id.school,
    classroom_id: id.room,
    first_name: "Alumno",
    last_name: "Temporal",
    birth_date: "2021-01-01",
    identity_number: "",
    mother_name: "Madre",
    mother_email: `mother-${suffix}@example.invalid`,
    father_name: "",
    father_email: "",
    monthly_fee: 300,
  };
  await as(id.director, () =>
    q("select enroll_student($1::jsonb)", [JSON.stringify(student)]),
  );
  await q(
    "update students set status='active',profile_complete=true where id=$1",
    [id.child],
  );
  await q("update platform_charges set status='paid' where student_id=$1", [
    id.child,
  ]);
  await as(id.mother, () => q("select workspace_identity()"));
  check(
    "Excepción familiar y expediente creados",
    (
      await q("select count(*) n from enrollment_history where student_id=$1", [
        id.child,
      ])
    ).rows[0].n === "1",
  );
  const day = (
    await q("select (now() at time zone 'America/La_Paz')::date::text d")
  ).rows[0].d;
  await as(id.teacher, () =>
    q("select save_care_record($1::jsonb)", [
      JSON.stringify({
        student_id: id.child,
        entry_date: day,
        kind: "rest",
        occurred_at: "12:00",
        ended_at: "13:30",
        note: "Descanso temporal",
      }),
    ]),
  );
  check(
    "Familia consulta cuidados",
    (
      await as(id.mother, () =>
        q("select school_workspace($1,$2,$2) r", [id.school, day]),
      )
    ).rows[0].r.care.length === 1,
  );
  check(
    "Tercero no ve el expediente",
    (
      await as(id.outsider, () =>
        q("select school_workspace($1,$2,$2) r", [id.school, day]),
      )
    ).rows[0].r.enrollments.length === 0,
  );
  check(
    "Familia no registra cuidados",
    await denied(id.mother, () =>
      q("select save_care_record($1::jsonb)", [
        JSON.stringify({
          student_id: id.child,
          entry_date: day,
          kind: "mood",
          occurred_at: "10:00",
          mood: "happy",
        }),
      ]),
    ),
  );
  const year = (
    await q("select id from academic_years where school_id=$1", [id.school])
  ).rows[0].id;
  const term = (
    await as(id.director, () =>
      q("select save_academic_term($1::jsonb) id", [
        JSON.stringify({
          year_id: year,
          name: "Periodo temporal",
          starts_on: "2026-01-01",
          ends_on: "2026-12-31",
          weight: 1,
        }),
      ]),
    )
  ).rows[0].id;
  const assessment = (
    await as(id.teacher, () =>
      q("select save_assessment($1::jsonb) id", [
        JSON.stringify({
          term_id: term,
          classroom_id: id.room,
          title: "Evaluación temporal",
          assessment_date: day,
          max_score: 20,
          weight: 1,
        }),
      ]),
    )
  ).rows[0].id;
  check(
    "Cierre exige notas completas",
    await denied(id.director, () =>
      q("select close_academic_term($1)", [term]),
    ),
  );
  await as(id.teacher, () =>
    q("select save_assessment_scores($1,$2::jsonb)", [
      assessment,
      JSON.stringify([{ student_id: id.child, score: 15 }]),
    ]),
  );
  await as(id.director, () => q("select close_academic_term($1)", [term]));
  const card = (
    await as(id.mother, () =>
      q("select school_workspace($1,$2,$2) r", [id.school, day]),
    )
  ).rows[0].r.cards[0];
  check(
    "Libreta publicada normaliza nota a 100",
    card.content.subjects[0].score === 75,
  );
  check(
    "Periodo cerrado impide cambios",
    await denied(id.teacher, () =>
      q("select save_assessment_scores($1,$2::jsonb)", [
        assessment,
        JSON.stringify([{ student_id: id.child, score: 20 }]),
      ]),
    ),
  );
  await as(id.director, () =>
    q("select reopen_academic_term($1,'Corrección temporal autorizada')", [
      term,
    ]),
  );
  check(
    "Reapertura retira libreta familiar",
    (
      await as(id.mother, () =>
        q("select school_workspace($1,$2,$2) r", [id.school, day]),
      )
    ).rows[0].r.cards.length === 0,
  );
  const rows = [
    {
      name: "Importación temporal",
      email: `import-${suffix}@example.invalid`,
      year: 2026,
      classroom: "Aula temporal",
    },
  ];
  const preview = (
    await as(id.director, () =>
      q("select import_school_directory($1,'teachers',$2::jsonb,false) r", [
        id.school,
        JSON.stringify(rows),
      ]),
    )
  ).rows[0].r;
  check(
    "Previsualización válida no guarda docentes",
    preview.rows[0].ok &&
      (
        await q("select count(*) n from teachers where school_id=$1", [
          id.school,
        ])
      ).rows[0].n === "1",
  );
  await as(id.director, () =>
    q("select import_school_directory($1,'teachers',$2::jsonb,true,$3)", [
      id.school,
      JSON.stringify(rows),
      id.batch,
    ]),
  );
  await as(id.director, () =>
    q("select import_school_directory($1,'teachers',$2::jsonb,true,$3)", [
      id.school,
      JSON.stringify(rows),
      id.batch,
    ]),
  );
  check(
    "Confirmación idempotente no duplica docentes",
    (await q("select count(*) n from teachers where school_id=$1", [id.school]))
      .rows[0].n === "2",
  );
  await q("rollback");
  check(
    "Verificación totalmente revertida",
    (await q("select id from auth.users where id=$1", [id.director]))
      .rowCount === 0,
  );
  console.log(
    JSON.stringify({
      ok: true,
      rolledBack: true,
      checks,
      bankCalls: false,
      emailsSent: false,
      pushesSent: false,
      realSchoolDataChanged: false,
    }),
  );
} catch (e) {
  await q("rollback").catch(() => {});
  reportFailure(e);
} finally {
  await db.end();
}
