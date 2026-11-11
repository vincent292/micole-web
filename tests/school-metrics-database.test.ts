import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import type { SchoolMetrics } from "../src/lib/schoolMetrics";
const db = new PGlite(),
  id = (n: number) => `ae000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, mother, student, other] = [
    1, 2, 3, 4, 5, 6,
  ].map(id),
  [school, testSchool, room, roomB, child, childB, childC, term, subject] = [
    20, 21, 30, 31, 40, 41, 42, 60, 70,
  ].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
let serial = 0;
async function as<T>(
  user: string | null,
  task: () => Promise<T>,
  support?: string,
  role = "authenticated",
) {
  const save = "metrics_" + ++serial;
  await db.exec(`savepoint ${save};set local role ${role}`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [
      user || "",
      JSON.stringify(support ? { "x-micole-support": support } : {}),
    ],
  );
  try {
    return await task();
  } finally {
    await db.exec(`rollback to savepoint ${save};release savepoint ${save}`);
  }
}
async function metrics(overrides: any = {}) {
  const p = {
    from: "2026-10-01",
    to: "2026-10-31",
    group: "week",
    school: null,
    room: null,
    env: "production",
    ...overrides,
  };
  return (
    await q("select platform_school_metrics($1,$2,$3,$4,$5,$6) m", [
      p.from,
      p.to,
      p.group,
      p.school,
      p.room,
      p.env,
    ])
  ).rows[0].m as SchoolMetrics;
}
beforeAll(async () => {
  await db.exec(
    `create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`,
  );
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const f of readdirSync(migrations)
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(new URL(f, migrations), "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('metrics-owner@test.bo')",
  );
  for (const [user, email] of [
    [owner, "metrics-owner@test.bo"],
    [director, "metrics-director@test.bo"],
    [teacher, "metrics-teacher@test.bo"],
    [mother, "metrics-mother@test.bo"],
    [student, "metrics-student@test.bo"],
    [other, "metrics-other@test.bo"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into platform_admins(user_id) values($1) on conflict do nothing",
    [owner],
  );
  await q(
    "insert into schools(id,name,slug,status) values($1,'Colegio Métricas','metric-one','active'),($2,'Colegio Pruebas','metric-two','active')",
    [school, testSchool],
  );
  await q(
    "insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)",
    [testSchool, owner],
  );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian')",
    [school, director, teacher, mother],
  );
  await q(
    "insert into classrooms(id,school_id,name,capacity,academic_year) values($1,$2,'Primero A',30,2026),($3,$2,'Primero B',30,2026)",
    [room, school, roomB],
  );
  for (const [sid, rid] of [
    [child, room],
    [childB, room],
    [childC, roomB],
  ])
    await q(
      "insert into students(id,school_id,classroom_id,first_name,last_name,status) values($1,$2,$3,'Nombre privado','Apellido privado','active')",
      [sid, school, rid],
    );
  await q(
    "update audit_events set created_at='2026-10-01 03:59Z' where entity='students' and entity_id=$1",
    [child],
  );
  await q(
    "update audit_events set created_at='2026-10-01 04:00Z' where entity='students' and entity_id=$1",
    [childB],
  );
  await q(
    "update audit_events set created_at='2026-10-31 23:30-04' where entity='students' and entity_id=$1",
    [childC],
  );
  await q(
    "insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) select $1,$2,id,'Trimestre 3','2026-09-01','2026-12-31' from academic_years where school_id=$2 and year=2026",
    [term, school],
  );
  await q(
    "insert into school_subjects(id,school_id,name,normalized_name) values($1,$2,'Matemáticas','matematicas')",
    [id(71), school],
  );
  await q(
    "insert into class_subjects(id,school_id,classroom_id,subject_id) values($1,$2,$3,$4)",
    [subject, school, room, id(71)],
  );
  await q(
    "insert into assessments(id,school_id,term_id,classroom_id,class_subject_id,title,assessment_date,max_score,weight,created_by) values($1,$2,$3,$4,$5,'Prueba sobre veinte','2026-10-15',20,1,$6),($7,$2,$3,$4,$5,'Prueba sobre cien','2026-10-20',100,3,$6)",
    [id(80), school, term, room, subject, teacher, id(81)],
  );
  for (const [s, a, value] of [
    [child, id(80), 10],
    [child, id(81), 100],
    [childB, id(80), 0],
  ])
    await q(
      "insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,$4,$5)",
      [school, a, s, value, teacher],
    );
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});
describe("métricas de colegios del superadmin", () => {
  it("deniega docentes, familias, alumnos, dirección, usuarios ajenos y anon", async () => {
    for (const user of [director, teacher, mother, student, other, null])
      await expect(as(user, () => metrics())).rejects.toThrow(
        /Solo Superadministración/,
      );
    await expect(as(null, () => metrics(), undefined, "anon")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("separa las instituciones de prueba y rechaza mezclar entornos por identificador", async () => {
    const real = await as(owner, () => metrics()),
      test = await as(owner, () => metrics({ env: "testing" }));
    expect(real.schools.map((s) => s.id)).toEqual([school]);
    expect(test.schools.map((s) => s.id)).toEqual([testSchool]);
    expect(test.summary.activeStudents).toBe(0);
    await expect(
      as(owner, () => metrics({ school: testSchool })),
    ).rejects.toThrow(/entorno/);
    await expect(
      as(owner, () => metrics({ school: school, room: id(999) })),
    ).rejects.toThrow(/curso/);
  });
  it("rechaza fechas nulas, infinitas, invertidas, exceso de rango y parámetros inválidos", async () => {
    for (const overrides of [
      { from: null },
      { from: "infinity", to: "infinity" },
      { to: "2026-09-01" },
      { from: "2024-01-01" },
      { group: "day" },
      { group: null },
      { env: "wrong" },
      { room },
    ])
      await expect(as(owner, () => metrics(overrides))).rejects.toThrow();
  });
  it("cuenta altas en hora de Bolivia y genera semanas parciales sin inventar actividad", async () => {
    const m = await as(owner, () => metrics());
    expect(m.summary.newStudents).toBe(2);
    expect(m.trend[0]).toMatchObject({
      from: "2026-10-01",
      to: "2026-10-04",
      newStudents: 1,
    });
    expect(m.trend.at(-1)).toMatchObject({
      from: "2026-10-26",
      to: "2026-10-31",
      newStudents: 1,
    });
    expect(m.trend.reduce((s, r) => s + r.newStudents, 0)).toBe(2);
    const monthly = await as(owner, () => metrics({ group: "month" }));
    expect(monthly.trend).toHaveLength(1);
  });
  it("usa la nota ponderada real normalizada y excluye notas sin terminar", async () => {
    const m = await as(owner, () => metrics());
    expect(m.summary.average).toBe(87.5);
    expect(m.summary.completedGrades).toBe(1);
    expect(m.summary.incompleteGrades).toBe(1);
    expect(m.summary.studentsAtRisk).toBe(0);
    expect(m.subjects[0]).toMatchObject({
      subject: "Matemáticas",
      average: 87.5,
      completed: 1,
      incomplete: 1,
      risk_evaluated: 0,
    });
  });
  it("no transforma el cero en sin dato ni las notas flexibles en riesgo oficial", async () => {
    await q(
      "insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,0,$4)",
      [school, id(81), childB, teacher],
    );
    const m = await as(owner, () => metrics());
    expect(m.summary.average).toBe(43.75);
    expect(m.summary.completedGrades).toBe(2);
    expect(m.summary.riskEvaluated).toBe(0);
  });
  it("no devuelve identidades privadas ni notas individuales", async () => {
    const m = await as(owner, () => metrics());
    const text = JSON.stringify(m);
    for (const value of [
      child,
      childB,
      "Nombre privado",
      "Apellido privado",
      "metrics-mother@test.bo",
    ])
      expect(text).not.toContain(value);
    expect(m.scope).toBe("platform-school-metrics");
  });
  it("suma solo pagos verificados, alumnos únicos, cuotas previas y saldo de vencimientos del rango", async () => {
    for (const [n, s, d, amount, status] of [
      [100, child, "2026-10-10", 300, "pending"],
      [101, child, "2026-09-10", 200, "pending"],
      [102, childB, "2026-10-10", 400, "cancelled"],
    ] as const)
      await q(
        "insert into school_charges(id,school_id,student_id,concept,due_date,amount,status) values($1,$2,$3,'Cuota QA',$4,$5,$6)",
        [id(n), school, s, d, amount, status],
      );
    for (const [n, c, amount, state, at] of [
      [110, 100, 100, "verified", "2026-10-02 04:00Z"],
      [111, 101, 50, "verified", "2026-10-03 04:00Z"],
      [112, 100, 50, "rejected", "2026-10-03 04:00Z"],
      [113, 100, 25, "manual_pending", "2026-10-03 04:00Z"],
    ] as const)
      await q(
        "insert into school_payments(id,charge_id,amount,payment_method,verification_state,paid_at) values($1,$2,$3,'cash',$4,$5)",
        [id(n), id(c), amount, state, at],
      );
    const m = await as(owner, () => metrics());
    expect(m.summary).toMatchObject({
      collected: 150,
      studentsPaid: 1,
      due: 300,
      outstanding: 200,
      studentsPending: 1,
    });
    expect(m.trend.reduce((s, r) => s + r.collected, 0)).toBe(150);
  });
  it("no infiere ausencias sin lista y respeta el curso seleccionado", async () => {
    const m = await as(owner, () => metrics({ school, room: roomB }));
    expect(m.summary).toMatchObject({
      activeStudents: 1,
      newStudents: 1,
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
    });
    expect(m.subjects).toEqual([]);
  });
  it("bloquea la consulta desde soporte incluso con un JWT de superadmin", async () => {
    const support = id(900);
    await q(
      "insert into aulanexo_private.support_sessions(id,admin_id,school_id,target_user_id,role,reason,expires_at) values($1,$2,$3,$4,'director','Verificar métricas de soporte',now()+interval '1 hour')",
      [support, owner, school, director],
    );
    await expect(as(owner, () => metrics(), support)).rejects.toThrow(
      /Solo Superadministración/,
    );
    await expect(as(owner, () => metrics(), id(901))).rejects.toThrow();
  });
  it("respeta las cuatro dimensiones bolivianas y cuenta riesgo solo al completar todas", async () => {
    await q(
      "insert into academic_class_policies(classroom_id,school_id,grade_code,scheme,updated_by) values($1,$2,'primary1','bolivia2026',$3)",
      [room, school, director],
    );
    await q("update assessments set dimension='saber' where id in ($1,$2)", [
      id(80),
      id(81),
    ]);
    for (const [n, dim] of [
      [83, "ser"],
      [84, "hacer"],
      [85, "self"],
    ] as const) {
      await q(
        "insert into assessments(id,school_id,term_id,classroom_id,class_subject_id,title,assessment_date,max_score,weight,dimension,created_by) values($1,$2,$3,$4,$5,'Dimensión QA','2026-10-20',100,1,$6,$7)",
        [id(n), school, term, room, subject, dim, teacher],
      );
      for (const sid of [child, childB])
        await q(
          "insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,40,$4)",
          [school, id(n), sid, teacher],
        );
    }
    let m = await as(owner, () => metrics());
    expect(m.summary.riskEvaluated).toBe(1);
    expect(m.summary.studentsAtRisk).toBe(0);
    expect(m.summary.average).toBe(61.38);
    await q(
      "insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,0,$4)",
      [school, id(81), childB, teacher],
    );
    m = await as(owner, () => metrics());
    expect(m.summary.riskEvaluated).toBe(2);
    expect(m.summary.studentsAtRisk).toBe(1);
    expect(m.subjects[0]).toMatchObject({
      below_minimum: 1,
      risk_evaluated: 2,
    });
  });
  it("cuenta solo listas confirmadas, con permiso y correcciones vigentes", async () => {
    for (const [n, status, date] of [
      [910, "draft", "2026-10-01"],
      [911, "confirmed", "2026-10-02"],
    ] as const) {
      await q(
        "insert into student_attendance_sessions(id,school_id,classroom_id,attendance_date,status,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6)",
        [id(n), school, room, date, "draft", teacher],
      );
      for (const [sid, mark] of [
        [child, "absent"],
        [childB, "excused"],
      ])
        await q(
          "insert into student_attendance_records(school_id,session_id,student_id,student_name,status) values($1,$2,$3,'Privado',$4)",
          [school, id(n), sid, mark],
        );
      if (status === "confirmed")
        await q(
          "update student_attendance_sessions set status='confirmed' where id=$1",
          [id(n)],
        );
    }
    const m = await as(owner, () => metrics());
    expect(m.summary.absent).toBe(1);
    expect(m.summary.excused).toBe(1);
    await q(
      "insert into student_attendance_corrections(id,school_id,record_id,previous_status,previous_note,proposed_status,proposed_note,reason,status,requested_by,reviewed_by,reviewed_at) select $1,$2,id,'absent','','present','','Justificativo QA','approved',$3,$3,now() from student_attendance_records where session_id=$4 and student_id=$5",
      [id(920), school, teacher, id(911), child],
    );
    const corrected = await as(owner, () => metrics());
    expect(corrected.summary.absent).toBe(0);
    expect(corrected.summary.present).toBe(1);
  });
  it("agrega más de mil eventos sin truncar por límites REST", async () => {
    await q(
      "insert into audit_events(school_id,actor_name,entity,entity_id,action,created_at) select $1,'Sistema','care_records',gen_random_uuid(),'INSERT','2026-10-10 12:00Z' from generate_series(1,1205)",
      [school],
    );
    const m = await as(owner, () => metrics());
    expect(
      m.usage.find((r) => r.module === "care_records")?.registrations,
    ).toBe(1205);
  });
});
