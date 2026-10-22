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
const column = async (n: number, kind = "numeric", max = 100) => {
  const payload = {
    id: id(n),
    term_id: id(61),
    classroom_id: room,
    title: "Evaluación " + n,
    assessment_date: "2026-10-22",
    max_score: max,
    weight: 1,
    grading_type: kind,
  };
  await mutate(teacher, "select save_assessment($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  return id(n);
};
const mark = (a: string, value: any) =>
  mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
    a,
    JSON.stringify([{ student_id: child, ...value }]),
  ]);
it("Dirección configura el límite, las correcciones se auditan y las notas iguales no consumen intentos", async () => {
  await mutate(director, "select save_gradebook_settings($1,1,$2)", [
    school,
    ["Destacado", "Logrado"],
  ]);
  await expect(
    mutate(teacher, "select save_gradebook_settings($1,5,$2)", [
      school,
      ["Uno", "Dos"],
    ]),
  ).rejects.toThrow(/Dirección/);
  const a = await column(70);
  await mark(a, { score: 50, revision: 0 });
  await mark(a, { score: 60, revision: 1 });
  await mark(a, { score: 60, revision: 2 });
  await expect(mark(a, { score: 70, revision: 2 })).rejects.toThrow(/límite/);
  await expect(mark(a, { score: 80, revision: 1 })).rejects.toThrow(
    /otro dispositivo/,
  );
  expect(
    (
      await q(
        "select corrections,revision from assessment_scores where assessment_id=$1",
        [a],
      )
    ).rows[0],
  ).toMatchObject({ corrections: 1, revision: 2 });
  expect((await q("select * from assessment_score_changes")).rows).toHaveLength(
    1,
  );
});
it("cualitativas conservan etiquetas, sin convertirlas a números ni alterar la escala con notas", async () => {
  const a = await column(71, "qualitative");
  await mark(a, { qualitative_score: "Logrado", revision: 0 });
  await expect(
    mark(a, { qualitative_score: "Inventado", revision: 1 }),
  ).rejects.toThrow(/etiquetas/);
  await expect(mark(a, { score: 20, revision: 1 })).rejects.toThrow(
    /etiquetas/,
  );
  const payload = {
    id: a,
    term_id: id(61),
    classroom_id: room,
    title: "Cambio de escala",
    assessment_date: "2026-10-22",
    max_score: 100,
    weight: 1,
    grading_type: "qualitative",
    qualitative_options: ["Otro", "Distinto"],
  };
  await expect(
    mutate(teacher, "select save_assessment($1::jsonb)", [
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow(/conserva/);
  const workspace = (
    await as(mother, "select gradebook_workspace($1,null,$2,$3) as value", [
      room,
      id(61),
      child,
    ])
  ).rows[0].value;
  expect(workspace.canManage).toBe(false);
  expect(workspace.scores[0].qualitative_score).toBe("Logrado");
  expect(workspace.roster[0].total.score).toBeNull();
});
it("calcula suma, promedio y ponderación sin convertir pendientes en cero", async () => {
  const a = await column(72, "numeric", 10),
    b = await column(73, "numeric", 20);
  await mark(a, { score: 5 });
  await mark(b, { score: 20 });
  const total = async () =>
    (
      await q("select aulanexo_private.grade_total($1,$2,$3,null) as value", [
        id(61),
        child,
        room,
      ])
    ).rows[0].value;
  expect((await total()).score).toBe(75);
  await mutate(teacher, "select save_gradebook_rule($1,$2,null,$3)", [
    id(61),
    room,
    "sum",
  ]);
  expect(await total()).toMatchObject({ score: 25, max_score: 30, missing: 0 });
  await mutate(teacher, "select save_gradebook_rule($1,$2,null,$3)", [
    id(61),
    room,
    "average",
  ]);
  expect((await total()).score).toBe(75);
  await column(74, "numeric", 100);
  expect(await total()).toMatchObject({ score: 75, missing: 1 });
});
it("familias consultan solo al propio hijo y con pagos habilitados", async () => {
  const a = await column(75);
  await mark(a, { score: 80 });
  await expect(
    as(stranger, "select gradebook_workspace($1,null,$2,$3)", [
      room,
      id(61),
      child,
    ]),
  ).rejects.toThrow(/familia/);
  await q(
    "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota vencida',current_date-2,100,'overdue')",
    [school, child],
  );
  await expect(
    as(mother, "select gradebook_workspace($1,null,$2,$3)", [
      room,
      id(61),
      child,
    ]),
  ).rejects.toThrow(/familia/);
  await expect(
    as(mother, "select save_assessment_scores($1,$2::jsonb)", [
      a,
      JSON.stringify([{ student_id: child, score: 100 }]),
    ]),
  ).rejects.toThrow();
});
it("tarea puntuable crea columna y la revisión se guarda también en notas de forma atómica", async () => {
  const task = id(80),
    sub = id(81),
    payload = {
      id: task,
      classroom_id: room,
      title: "Tarea puntuable",
      instructions: "Resolver y entregar",
      max_score: 20,
      status: "published",
      gradeable: true,
      term_id: id(61),
      assessment_date: "2026-10-22",
    };
  await mutate(teacher, "select save_assignment($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  const a = (
    await q("select id from assessments where assignment_id=$1", [task])
  ).rows[0].id;
  expect(a).toBeTruthy();
  await q(
    "insert into assignment_submissions(id,school_id,assignment_id,student_id,body,status,submitted_by) values($1,$2,$3,$4,'Respuesta','submitted',$5)",
    [sub, school, task, child, kid],
  );
  await mutate(
    teacher,
    "select review_assignment_submission($1,'reviewed','Buen avance',18)",
    [sub],
  );
  expect(
    (await q("select score from assessment_scores where assessment_id=$1", [a]))
      .rows[0].score,
  ).toBe("18.00");
  await mutate(director, "select save_gradebook_settings($1,0,$2)", [
    school,
    ["Uno", "Dos"],
  ]);
  await expect(
    mutate(
      teacher,
      "select review_assignment_submission($1,'reviewed','Cambio',19)",
      [sub],
    ),
  ).rejects.toThrow(/límite/);
  expect(
    (await q("select score from assignment_submissions where id=$1", [sub]))
      .rows[0].score,
  ).toBe("18.00");
});
it("la asistencia confirmada bloquea API, SQL y borrado, sin excepciones de rol", async () => {
  const day = new Date().toISOString().slice(0, 10),
    records = JSON.stringify([
      { studentId: child, status: "present", note: "" },
    ]);
  await mutate(
    teacher,
    "select save_student_attendance($1,$2,$3::jsonb,0,true,'')",
    [room, day, records],
  );
  await expect(
    mutate(
      director,
      "select save_student_attendance($1,$2,$3::jsonb,1,true,'Corregir')",
      [room, day, records],
    ),
  ).rejects.toThrow(/no puede modificarse/);
  await db.exec("savepoint imm");
  await expect(
    q("update student_attendance_records set status='absent'"),
  ).rejects.toThrow(/no pueden modificarse/);
  await db.exec("rollback to savepoint imm");
  await expect(q("delete from student_attendance_sessions")).rejects.toThrow(
    /definitiva/,
  );
});
