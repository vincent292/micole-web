import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `ef000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [
  owner,
  director,
  teacher,
  mother,
  kid,
  stranger,
  school,
  other,
  room,
  child,
  teacherId,
] = [1, 2, 3, 4, 5, 6, 20, 21, 30, 40, 50].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
async function as(user: string, sql: string, args: unknown[] = []) {
  await db.exec("savepoint actor;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    await q("select workspace_identity()");
    return await q(sql, args);
  } finally {
    await db.exec("rollback to savepoint actor;release savepoint actor");
  }
}
let yearKey = id(60);
beforeAll(async () => {
  await db.exec(
    `create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`,
  );
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(new URL(file, migrations), "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );

  for (const [user, email] of [
    [owner, "ariasvincent292@gmail.com"],
    [director, "direccion@pruebas.micole.test"],
    [teacher, "docente@pruebas.micole.test"],
    [mother, "familia@pruebas.micole.test"],
    [kid, "estudiante@pruebas.micole.test"],
    [stranger, "outside@example.invalid"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('ariasvincent292@gmail.com') on conflict do nothing",
  );
  await q(
    "insert into platform_admins(user_id) values($1) on conflict do nothing",
    [owner],
  );
  await q(
    "insert into schools(id,name,slug,status) values($1,'MiCole pruebas','test-persisted','active'),($2,'Colegio real','real-persisted','active')",
    [school, other],
  );
  await q(
    "insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)",
    [school, owner],
  );
  await q(
    "insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)",
    [school, owner],
  );
  for (const [user, email, role] of [
    [director, "direccion@pruebas.micole.test", "director"],
    [teacher, "docente@pruebas.micole.test", "teacher"],
    [mother, "familia@pruebas.micole.test", "guardian"],
    [kid, "estudiante@pruebas.micole.test", "student"],
  ])
    await q(
      "insert into aulanexo_private.persisted_test_accounts(user_id,school_id,email,role) values($1,$2,$3,$4)",
      [user, school, email, role],
    );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [school, director, teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name) values($1,$2,'Primero A')",
    [room, school],
  );
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente de pruebas','docente@pruebas.micole.test','active')",
    [teacherId, school, teacher],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [school, teacherId, room],
  );
  await q(
    "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email) values($1,$2,$3,'Lucía','Ficticia','active',true,'Madre de prueba','familia@pruebas.micole.test')",
    [child, school, room],
  );
  await q(
    "insert into aulanexo_private.student_logins(student_id,school_id,email,enabled,updated_by) values($1,$2,'estudiante@pruebas.micole.test',true,$3)",
    [child, school, owner],
  );
  await q(
    "insert into academic_years(id,school_id,year,name,starts_on,ends_on) values($1,$2,2026,'Gestión 2026','2026-01-01','2026-12-31') on conflict(school_id,year) do nothing",
    [id(60), school],
  );
  yearKey = (
    await q("select id from academic_years where school_id=$1 and year=2026", [
      school,
    ])
  ).rows[0].id;
  await q(
    "insert into enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,started_on,status) select $1,$2,$3,$4,'Lucía Ficticia','Primero A','2026-01-01','enrolled' where not exists(select 1 from enrollment_history where student_id=$2)",
    [school, child, room, yearKey],
  );
  await q(
    "insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) values($1,$2,$3,'Periodo 2026','2026-01-01','2026-12-31')",
    [id(61), school, yearKey],
  );
}, 30000);
afterAll(() => db.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
async function mutate(user: string, sql: string, args: unknown[] = []) {
  await db.exec("savepoint mutation;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const result = await q(sql, args);
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await db.exec("release savepoint mutation");
    return result;
  } catch (e) {
    await db.exec("rollback to savepoint mutation;release savepoint mutation");
    throw e;
  }
}

async function subjectFixture() {
  await q("update classrooms set subjects_enabled=true where id=$1", [room]);
  return (
    await mutate(
      director,
      "select configure_class_subject($1,'Matemáticas',$2::uuid[],true) id",
      [room, [teacherId]],
    )
  ).rows[0].id as string;
}
async function policy(code = "primary6", scheme = "bolivia2026") {
  await mutate(director, "select save_academic_policy($1,$2,$3,'best')", [
    room,
    code,
    scheme,
  ]);
}
async function fillTerm(term: string, subject: string, value = 80) {
  for (const [j, dimension] of ["ser", "saber", "hacer", "self"].entries()) {
    const payload = {
      term_id: term,
      classroom_id: room,
      class_subject_id: subject,
      title: `Evidencia ${dimension}`,
      assessment_date:
        term === id(61)
          ? "2026-03-01"
          : term === id(62)
            ? "2026-06-01"
            : "2026-10-01",
      max_score: 100,
      weight: 1,
      dimension,
    };
    const column = (
      await mutate(teacher, "select save_assessment($1::jsonb) id", [
        JSON.stringify(payload),
      ])
    ).rows[0].id;
    await mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
      column,
      JSON.stringify([{ student_id: child, score: value, revision: 0 }]),
    ]);
  }
}

const draft = (kind: string, subject: string | null = null) => ({
  year_id: yearKey,
  classroom_id: kind === "poa" ? null : room,
  class_subject_id: subject,
  student_id: kind === "support" ? child : null,
  kind,
  title: "Seguimiento de aprendizaje",
  starts_on: "2026-02-01",
  ends_on: "2026-11-30",
  objective: "Mejorar los aprendizajes identificados",
  activities: "Tutorías semanales con revisión de avances",
  evidence: "Cuaderno y actividades de seguimiento",
  adaptations: "Material accesible y acompañamiento",
  participants: "Directora: presidente; docente: secretaria",
  status: "submitted",
});
it("la mora deja de bloquear solo al alumno de primaria y no a inicial de la misma sede", async () => {
  await q(
    "insert into school_charges(student_id,school_id,concept,amount,due_date) values($1,$2,'Saldo anterior',100,'2020-01-01')",
    [child, school],
  );
  expect(
    (
      await q("select aulanexo_private.financial_learning_access($1) ok", [
        child,
      ])
    ).rows[0].ok,
  ).toBe(false);
  await subjectFixture();
  await policy();
  expect(
    (
      await q("select aulanexo_private.financial_learning_access($1) ok", [
        child,
      ])
    ).rows[0].ok,
  ).toBe(true);
  await policy("initial", "qualitative");
  expect(
    (
      await q("select aulanexo_private.financial_learning_access($1) ok", [
        child,
      ])
    ).rows[0].ok,
  ).toBe(false);
  expect(
    (await q("select bolivia_regular from classrooms where id=$1", [room]))
      .rows[0].bolivia_regular,
  ).toBe(false);
});
it("emite diez pensiones sin cargos adicionales, conserva deudas anteriores y rechaza once cuotas", async () => {
  await subjectFixture();
  await policy();
  const p = {
    id: id(300),
    school_id: school,
    student_id: child,
    start_date: "2026-03-01",
    months: 10,
    monthly_fee: 100,
    snack_fee: 0,
    enrollment_fee: 0,
    due_day: 10,
    discount: 0,
    discount_from: null,
    discount_to: null,
    prorate: false,
    license_fee: 29,
  };
  await mutate(director, "select create_payment_plan($1::jsonb)", [
    JSON.stringify(p),
  ]);
  const charges = (
    await q(
      "select amount,license_amount from school_charges where student_id=$1",
      [child],
    )
  ).rows;
  expect(charges).toHaveLength(10);
  expect(
    charges.every(
      (v: any) => Number(v.amount) === 100 && Number(v.license_amount) === 0,
    ),
  ).toBe(true);
  await expect(
    mutate(director, "select create_payment_plan($1::jsonb)", [
      JSON.stringify({ ...p, id: id(301), months: 1 }),
    ]),
  ).rejects.toThrow(/diez/);
  await expect(
    q(
      "insert into school_charges(student_id,school_id,concept,amount,due_date) values($1,$2,'Material extra',20,'2026-04-01')",
      [child, school],
    ),
  ).rejects.toThrow(/adicionales/);
});
it("guarda planes y actas por sede, restringe materias y exige revisión antes de aprobar", async () => {
  const subject = await subjectFixture();
  await policy();
  const doc = (
    await mutate(teacher, "select save_bolivia_document($1::jsonb) id", [
      JSON.stringify(draft("support", subject)),
    ])
  ).rows[0].id;
  await expect(
    mutate(teacher, "select review_bolivia_document($1,1,true,$2)", [
      doc,
      "Trabajo revisado",
    ]),
  ).rejects.toThrow(/Dirección/);
  await mutate(director, "select review_bolivia_document($1,1,true,$2)", [
    doc,
    "Revisado con evidencia de seguimiento",
  ]);
  await expect(
    mutate(teacher, "select save_bolivia_document($1::jsonb)", [
      JSON.stringify({ ...draft("support", subject), id: doc, revision: 2 }),
    ]),
  ).rejects.toThrow(/aprobado/);
  const w = (await as(teacher, "select bolivia_workspace($1) data", [school]))
    .rows[0].data;
  expect(w.documents).toHaveLength(1);
  expect(w.cards).toEqual([]);
  await expect(
    as(stranger, "select bolivia_workspace($1)", [school]),
  ).rejects.toThrow(/asignadas/);
  await expect(
    as(teacher, "select bolivia_workspace($1)", [other]),
  ).rejects.toThrow();
});
it("no habilita el perfil revisado sin 200 fechas y controla la revisión concurrente", async () => {
  await subjectFixture();
  await policy();
  const days = (
    await q(
      "select to_char(d,'YYYY-MM-DD') d from generate_series(date '2026-01-01',date '2026-12-31',interval '1 day') d where extract(isodow from d)<=5 limit 200",
    )
  ).rows.map((v: any) => v.d);
  const profile = {
    year_id: yearKey,
    unit_code: "12345678",
    district: "Distrito de pruebas",
    department: "La Paz",
    authorization_reference: "Resolución de funcionamiento 123",
    reference: "RM 0001/2026",
    reference_url: "https://www.minedu.gob.bo/norma.pdf",
    school_days: days,
    calendar_note: "Calendario regional verificado",
    reviewed: true,
  };
  await expect(
    mutate(director, "select save_bolivia_profile($1::jsonb)", [
      JSON.stringify({ ...profile, school_days: days.slice(1) }),
    ]),
  ).rejects.toThrow(/200/);
  await mutate(director, "select save_bolivia_profile($1::jsonb)", [
    JSON.stringify(profile),
  ]);
  await expect(
    mutate(director, "select save_bolivia_profile($1::jsonb)", [
      JSON.stringify({ ...profile, revision: 99 }),
    ]),
  ).rejects.toThrow(/cambió/);
  await expect(
    mutate(teacher, "select save_bolivia_profile($1::jsonb)", [
      JSON.stringify(profile),
    ]),
  ).rejects.toThrow(/Dirección/);
});
it("el servidor rechaza periodos arbitrarios para colegio y los conserva en inicial", async () => {
  const subject = await subjectFixture();
  await policy();
  const c = {
    days: [1],
    start: 450,
    end: 720,
    periodMinutes: 90,
    breaks: [],
    loads: [
      {
        classSubjectId: subject,
        classroomId: room,
        teacherId,
        periods: 2,
        blockSize: 1,
      },
    ],
    unavailable: [],
  };
  await expect(
    q(
      "select aulanexo_private.validate_timetable($1,$2::jsonb,$3::jsonb,false)",
      [yearKey, JSON.stringify(c), "[]"],
    ),
  ).rejects.toThrow(/40 minutos/);
  // A failed SELECT is recovered via a savepoint, so this is checked in its own transaction below.
});
it("mantiene los periodos configurables de inicial", async () => {
  const subject = await subjectFixture();
  await policy("initial", "qualitative");
  const c = {
    days: [1],
    start: 450,
    end: 720,
    periodMinutes: 90,
    breaks: [],
    loads: [
      {
        classSubjectId: subject,
        classroomId: room,
        teacherId,
        periods: 2,
        blockSize: 1,
      },
    ],
    unavailable: [],
  };
  await q(
    "select aulanexo_private.validate_timetable($1,$2::jsonb,$3::jsonb,false)",
    [yearKey, JSON.stringify(c), "[]"],
  );
});
