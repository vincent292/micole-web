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
const config = (subject: string) => ({
  days: [1, 2, 3, 4, 5],
  start: 450,
  end: 800,
  periodMinutes: 40,
  breaks: [{ start: 610, end: 640 }],
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
});
const lessons = (subject: string) =>
  [0, 1].map((i) => ({
    classSubjectId: subject,
    classroomId: room,
    teacherId,
    day: 1,
    start: 450 + i * 40,
    end: 490 + i * 40,
  }));
it("valida cruces, jornada, carga y publicación independientemente del generador", async () => {
  const subject = await subjectFixture(),
    c = config(subject),
    ls = lessons(subject);
  const save = (entries: any[], cvalue: any = c) =>
    mutate(director, "select save_timetable($1::jsonb) id", [
      JSON.stringify({
        year_id: yearKey,
        name: "Semana 2026",
        config: cvalue,
        lessons: entries,
      }),
    ]);
  await expect(save([ls[0], ls[0]])).rejects.toThrow(/cruce/);
  await expect(
    save([{ ...ls[0], start: 600, end: 640 }, ls[1]]),
  ).rejects.toThrow(/recreo|jornada/);
  await expect(save([ls[0]])).rejects.toThrow(/carga/i);
  await expect(
    save(ls, { ...c, loads: [{ ...c.loads[0], teacherId: stranger }] }),
  ).rejects.toThrow(/docente/);
  const v = (await save(ls)).rows[0].id;
  await expect(
    as(teacher, "select publish_timetable($1,1)", [v]),
  ).rejects.toThrow(/Dirección|Secretaría/);
  await mutate(director, "select publish_timetable($1,1)", [v]);
  const saved = (await q("select * from timetable_versions where id=$1", [v]))
    .rows[0];
  expect(saved.status).toBe("published");
  expect(saved.revision).toBe(2);
  await expect(
    mutate(director, "select save_timetable($1::jsonb)", [
      JSON.stringify({ ...saved, year_id: yearKey, revision: 2 }),
    ]),
  ).rejects.toThrow(/publicado/);
  await expect(
    as(stranger, "select timetable_workspace($1,null)", [school]),
  ).rejects.toThrow(/acceso/);
});
it("Secretaría solo prepara horarios; Dirección delega la publicación y revoca el acceso", async () => {
  const sub = await subjectFixture();
  await mutate(
    director,
    "select save_timetable_delegate($1,'outside@example.invalid',true,false)",
    [school],
  );
  let identity = (await as(stranger, "select workspace_identity() data"))
    .rows[0].data;
  expect(identity.roles).toContain("scheduler");
  const ws = (
    await as(stranger, "select timetable_workspace($1,null) data", [school])
  ).rows[0].data;
  expect(ws.canManage).toBe(true);
  expect(ws.canApprove).toBe(false);
  expect((await as(stranger, "select id from students")).rows).toHaveLength(0);
  await expect(
    as(
      stranger,
      "select save_academic_policy($1,'primary6','flexible','best')",
      [room],
    ),
  ).rejects.toThrow(/Dirección/);
  const v = (
    await mutate(stranger, "select save_timetable($1::jsonb) id", [
      JSON.stringify({
        year_id: yearKey,
        name: "Secretaría",
        config: config(sub),
        lessons: lessons(sub),
      }),
    ])
  ).rows[0].id;
  await expect(
    as(stranger, "select publish_timetable($1,1)", [v]),
  ).rejects.toThrow(/autorizada/);
  await mutate(
    director,
    "select save_timetable_delegate($1,'outside@example.invalid',true,true)",
    [school],
  );
  await mutate(stranger, "select publish_timetable($1,1)", [v]);
  await mutate(
    director,
    "select save_timetable_delegate($1,'outside@example.invalid',false,false)",
    [school],
  );
  await expect(
    as(stranger, "select timetable_workspace($1,null)", [school]),
  ).rejects.toThrow(/acceso/);
  identity = (await as(stranger, "select workspace_identity() data")).rows[0]
    .data;
  expect(identity.roles).not.toContain("scheduler");
});
it("el algoritmo del cliente no puede ocultar un cruce en otra sede o institución", async () => {
  const sub = await subjectFixture(),
    c = config(sub),
    ls = lessons(sub);
  await q(
    "delete from aulanexo_private.persisted_test_accounts where user_id=$1",
    [teacher],
  );
  const otherTeacher = id(501),
    otherRoom = id(502),
    otherSubject = id(503),
    otherYear = id(504);
  await q(
    "insert into classrooms(id,school_id,name,academic_year) values($1,$2,'Otro paralelo',2026)",
    [otherRoom, other],
  );
  const oy = (
    await q("select id from academic_years where school_id=$1 and year=2026", [
      other,
    ])
  ).rows[0].id;
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'El mismo docente','docente@pruebas.micole.test','active')",
    [otherTeacher, other, teacher],
  );
  await q(
    "insert into timetable_versions(school_id,year_id,name,status,config,lessons,created_by) values($1,$2,'Otro horario','published',$3,$4,$5)",
    [
      other,
      oy,
      JSON.stringify(c),
      JSON.stringify(
        ls.map((l) => ({
          ...l,
          teacherId: otherTeacher,
          classroomId: otherRoom,
        })),
      ),
      director,
    ],
  );
  const v = (
    await mutate(director, "select save_timetable($1::jsonb) id", [
      JSON.stringify({
        year_id: yearKey,
        name: "Semana",
        config: c,
        lessons: ls,
      }),
    ])
  ).rows[0].id;
  await expect(
    as(director, "select publish_timetable($1,1)", [v]),
  ).rejects.toThrow(/otra sede/);
});
it("pondera dimensiones, conserva la nota original y exige aprobación del reforzamiento", async () => {
  const subject = await subjectFixture();
  await policy();
  await fillTerm(id(61), subject, 40);
  let total = (
    await q("select aulanexo_private.grade_total($1,$2,$3,$4) data", [
      id(61),
      child,
      room,
      subject,
    ])
  ).rows[0].data;
  expect(total.score).toBe(40);
  expect(total.classification).toBe("ED");
  const r = (
    await mutate(
      director,
      "select authorize_reinforcement($1,$2,$3,$4,'Apoyo pedagógico documentado') id",
      [id(61), room, subject, child],
    )
  ).rows[0].id;
  await expect(
    as(teacher, "select save_reinforcement($1,1,60,true)", [r]),
  ).rejects.toThrow(/Dirección/);
  await mutate(teacher, "select save_reinforcement($1,1,60,false)", [r]);
  await expect(
    as(director, "select close_academic_term($1)", [id(61)]),
  ).rejects.toThrow(/Faltan notas/);
  await mutate(director, "select save_reinforcement($1,2,60,true)", [r]);
  total = (
    await q("select aulanexo_private.grade_total($1,$2,$3,$4) data", [
      id(61),
      child,
      room,
      subject,
    ])
  ).rows[0].data;
  expect(total.originalScore).toBe(40);
  expect(total.score).toBe(60);
  expect(total.classification).toBe("DA");
  expect(
    (
      await q(
        "select count(*)::int n from academic_reinforcement_changes where reinforcement_id=$1",
        [r],
      )
    ).rows[0].n,
  ).toBe(2);
  await expect(
    as(teacher, "select save_reinforcement($1,3,70,false)", [r]),
  ).rejects.toThrow(/aprobado/);
});
it("una dimensión faltante no se interpreta como cero ni habilita la promoción", async () => {
  const subject = await subjectFixture();
  await policy();
  const c = (
    await mutate(teacher, "select save_assessment($1::jsonb) id", [
      JSON.stringify({
        term_id: id(61),
        classroom_id: room,
        class_subject_id: subject,
        title: "Conocimientos",
        assessment_date: "2026-03-01",
        max_score: 100,
        weight: 1,
        dimension: "saber",
      }),
    ])
  ).rows[0].id;
  await mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
    c,
    JSON.stringify([{ student_id: child, score: 100 }]),
  ]);
  const total = (
    await q("select aulanexo_private.grade_total($1,$2,$3,$4) data", [
      id(61),
      child,
      room,
      subject,
    ])
  ).rows[0].data;
  expect(total.score).toBe(null);
  expect(total.missing).toBe(3);
  const result = (
    await as(director, "select promotion_workspace($1,$2,null) data", [
      school,
      yearKey,
    ])
  ).rows[0].data;
  expect(result.students[0].outcome).toBe("pending");
  await expect(
    as(teacher, "select save_assessment($1::jsonb)", [
      JSON.stringify({
        term_id: id(61),
        classroom_id: room,
        class_subject_id: subject,
        title: "Sin dimensión",
        assessment_date: "2026-03-01",
        max_score: 100,
        weight: 1,
      }),
    ]),
  ).rejects.toThrow(/Elige Ser/);
});
async function annualFixture(value = 80, grade = "primary6") {
  const subject = await subjectFixture();
  await policy(grade);
  await q(
    "insert into school_operation_settings(school_id,require_annual_materials) values($1,false) on conflict(school_id) do update set require_annual_materials=false",
    [school],
  );
  await q(
    "update enrollment_history set started_on='2026-01-01' where student_id=$1",
    [child],
  );
  await q("update academic_terms set ends_on='2026-04-30' where id=$1", [
    id(61),
  ]);
  await q(
    "insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) values($1,$3,$4,'Segundo','2026-05-01','2026-08-31'),($2,$3,$4,'Tercero','2026-09-01','2026-12-31')",
    [id(62), id(63), school, yearKey],
  );
  for (const term of [id(61), id(62), id(63)]) {
    await fillTerm(term, subject, value);
    await mutate(director, "select close_academic_term($1)", [term]);
  }
  await mutate(
    director,
    "select set_academic_year_status($1,true,'Cierre aprobado por Dirección')",
    [yearKey],
  );
  const dest = (
    await mutate(director, "select save_academic_year($1::jsonb) id", [
      JSON.stringify({
        school_id: school,
        year: 2027,
        name: "Gestión 2027",
        starts_on: "2027-01-01",
        ends_on: "2027-12-31",
      }),
    ])
  ).rows[0].id;
  const targetRoom = id(710);
  await q(
    "insert into classrooms(id,school_id,name,academic_year) values($1,$2,'Destino A',2027)",
    [targetRoom, school],
  );
  const targetGrade =
    value < 51 ? grade : grade === "primary6" ? "secondary1" : "secondary6";
  await mutate(
    director,
    "select save_academic_policy($1,$2,'flexible','best')",
    [targetRoom, targetGrade],
  );
  return { subject, dest, targetRoom };
}
it("promueve en lote de sexto de primaria a primero de secundaria, sin repetir cobros y con reintento idempotente", async () => {
  const { dest, targetRoom } = await annualFixture();
  const result = (
    await as(director, "select promotion_workspace($1,$2,$3) data", [
      school,
      yearKey,
      dest,
    ])
  ).rows[0].data.students[0];
  expect(result.outcome).toBe("passed");
  expect(result.targetGrade).toBe("secondary1");
  const before = (await q("select count(*)::int n from school_charges")).rows[0]
    .n;
  const items = JSON.stringify([
    {
      studentId: child,
      fingerprint: result.fingerprint,
      targetClassroomId: targetRoom,
    },
  ]);
  await mutate(director, "select apply_annual_promotion($1,$2,$3,$4::jsonb)", [
    id(801),
    yearKey,
    dest,
    items,
  ]);
  await mutate(director, "select apply_annual_promotion($1,$2,$3,$4::jsonb)", [
    id(801),
    yearKey,
    dest,
    items,
  ]);
  expect(
    (await q("select classroom_id from students where id=$1", [child])).rows[0]
      .classroom_id,
  ).toBe(targetRoom);
  expect(
    (await q("select count(*)::int n from school_charges")).rows[0].n,
  ).toBe(before);
  expect(
    (
      await q(
        "select status from enrollment_history where student_id=$1 and year_id=$2",
        [child, yearKey],
      )
    ).rows[0].status,
  ).toBe("completed");
  expect(
    (await q("select count(*)::int n from promotion_batches")).rows[0].n,
  ).toBe(1);
  await expect(
    as(
      director,
      "select set_academic_year_status($1,false,'Reabrir resultados')",
      [yearKey],
    ),
  ).rejects.toThrow(/reinscripciones/);
});
it("retiene el grado si hay un área anual menor a 51 y rechaza saltos de grado o resultados obsoletos", async () => {
  const { dest, targetRoom } = await annualFixture(50);
  const result = (
    await as(director, "select promotion_workspace($1,$2,$3) data", [
      school,
      yearKey,
      dest,
    ])
  ).rows[0].data.students[0];
  expect(result.outcome).toBe("retained");
  expect(result.targetGrade).toBe("primary6");
  await expect(
    as(director, "select apply_annual_promotion($1,$2,$3,$4::jsonb)", [
      id(802),
      yearKey,
      dest,
      JSON.stringify([
        {
          studentId: child,
          fingerprint: "stale",
          targetClassroomId: targetRoom,
        },
      ]),
    ]),
  ).rejects.toThrow(/cambió/);
  await mutate(
    director,
    "select save_academic_policy($1,'secondary1','flexible','best')",
    [targetRoom],
  );
  await expect(
    as(director, "select apply_annual_promotion($1,$2,$3,$4::jsonb)", [
      id(803),
      yearKey,
      dest,
      JSON.stringify([
        {
          studentId: child,
          fingerprint: result.fingerprint,
          targetClassroomId: targetRoom,
        },
      ]),
    ]),
  ).rejects.toThrow(/grado/);
});
it("sexto de secundaria egresa y conserva las notas y el expediente", async () => {
  const { dest } = await annualFixture(80, "secondary6");
  const result = (
    await as(director, "select promotion_workspace($1,$2,$3) data", [
      school,
      yearKey,
      dest,
    ])
  ).rows[0].data.students[0];
  expect(result.outcome).toBe("graduated");
  await mutate(director, "select apply_annual_promotion($1,$2,$3,$4::jsonb)", [
    id(804),
    yearKey,
    dest,
    JSON.stringify([
      {
        studentId: child,
        fingerprint: result.fingerprint,
        targetClassroomId: null,
      },
    ]),
  ]);
  expect(
    (await q("select status from students where id=$1", [child])).rows[0]
      .status,
  ).toBe("inactive");
  expect(
    (
      await q("select count(*)::int n from report_cards where student_id=$1", [
        child,
      ])
    ).rows[0].n,
  ).toBe(3);
});

it("editar la evidencia original invalida el reforzamiento aprobado y conserva su historial", async () => {
  const subject = await subjectFixture();
  await policy();
  await fillTerm(id(61), subject, 40);
  const r = (
    await mutate(
      director,
      "select authorize_reinforcement($1,$2,$3,$4,'Reforzamiento de saberes') id",
      [id(61), room, subject, child],
    )
  ).rows[0].id;
  await mutate(director, "select save_reinforcement($1,1,70,true)", [r]);
  const a = (
    await q(
      "select a.id,s.revision from assessments a join assessment_scores s on s.assessment_id=a.id where a.classroom_id=$1 limit 1",
      [room],
    )
  ).rows[0];
  await mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
    a.id,
    JSON.stringify([{ student_id: child, score: 45, revision: a.revision }]),
  ]);
  const row = (
    await q("select * from academic_reinforcements where id=$1", [r])
  ).rows[0];
  expect(row.status).toBe("pending");
  expect(row.score).toBe("70");
  expect(
    (
      await q(
        "select count(*)::int n from academic_reinforcement_changes where reinforcement_id=$1",
        [r],
      )
    ).rows[0].n,
  ).toBe(2);
});
it("la vista familiar solo expone horarios publicados y la de Secretaría no muestra datos del alumno", async () => {
  const sub = await subjectFixture();
  await q(
    "insert into student_guardians(student_id,user_id,relationship,verified_at,can_view) values($1,$2,'mother',now(),true)",
    [child, mother],
  );
  const c = config(sub),
    ls = lessons(sub);
  const v = (
    await mutate(director, "select save_timetable($1::jsonb) id", [
      JSON.stringify({
        year_id: yearKey,
        name: "Borrador privado",
        config: c,
        lessons: ls,
      }),
    ])
  ).rows[0].id;
  await mutate(director,'select save_academic_year($1::jsonb)',[JSON.stringify({school_id:school,year:2027,name:'Gestión futura',starts_on:'2027-01-01',ends_on:'2027-12-31'})]);
  const defaultYear = (await as(mother,'select timetable_workspace($1,null) data',[school])).rows[0].data;
  expect(defaultYear.years).toHaveLength(1);
  expect(defaultYear.years[0].year).toBe(2026);
  let ws = (
    await as(mother, "select timetable_workspace($1,$2) data", [
      school,
      yearKey,
    ])
  ).rows[0].data;
  expect(ws.canManage).toBe(false);
  expect(ws.versions).toHaveLength(0);
  await mutate(director, "select publish_timetable($1,1)", [v]);
  ws = (
    await as(mother, "select timetable_workspace($1,$2) data", [
      school,
      yearKey,
    ])
  ).rows[0].data;
  expect(ws.versions).toHaveLength(1);
  expect(ws.versions[0].config.unavailable).toBeUndefined();
  expect(ws.versions[0].lessons).toHaveLength(2);
});
