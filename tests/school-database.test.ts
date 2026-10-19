import {enableActivationFixture,fundInstitutionFixtures} from "./funded-institution-fixture";
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
const db = new PGlite();
const id = (n: number) =>
  `ca000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, mother, father, kid, stranger] = [
  1, 2, 3, 4, 5, 6, 7,
].map(id);
const [school, otherSchool, room, otherRoom, child, otherChild] = [
  20, 21, 30, 31, 40, 41,
].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
let serial = 0;
async function as<T>(
  user: string | null,
  task: () => Promise<T>,
  support?: string,
  role = "authenticated",
) {
  const save = `auth_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role ${role};`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [
      user || "",
      JSON.stringify(support ? { "x-micole-support": support } : {}),
    ],
  );
  try {
    const result = await task();
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    throw e;
  }
}
// Para las mutaciones que sí deben persistir dentro de la transacción del caso.
async function acting<T>(user: string, task: () => Promise<T>) {
  const save = `mutation_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role authenticated;`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",
    [user],
  );
  try {
    const result = await task();
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await db.exec(`release savepoint ${save}`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save};release savepoint ${save}`);
    throw e;
  }
}
const request = async (kind = "annual_materials", amount = 0) => {
  const payload = {
    id: id(60),
    school_id: school,
    classroom_id: room,
    kind,
    academic_year: 2026,
    title: "Lista para el aula",
    details: "Cuaderno y lápices para aprender",
    event_date: "2026-10-15",
    amount,
    due_date: "2026-10-01",
    blocks_access: true,
  };
  await acting(teacher, () =>
    q("select save_academic_request($1::jsonb)", [JSON.stringify(payload)]),
  );
  return payload.id;
};
const approve = (requestId: string) =>
  acting(director, () =>
    q("select review_academic_request($1,true,'Aprobado')", [requestId]),
  );
const checkout = (
  items: any[],
  receipt = id(90),
  method = "cash",
  invoice: any = {},
  reviewed = false,
  user = director,
) =>
  acting(user, () =>
    q("select checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)", [
      receipt,
      child,
      JSON.stringify(items),
      method,
      "REC-TEST",
      JSON.stringify(invoice),
      reviewed,
    ]),
  );
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
  await enableActivationFixture(db);
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('ops-owner@test.bo')",
  );
  for (const [user, email] of [
    [owner, "ops-owner@test.bo"],
    [director, "ops-director@test.bo"],
    [teacher, "ops-teacher@test.bo"],
    [mother, "ops-mother@test.bo"],
    [father, "ops-father@test.bo"],
    [kid, "ops-kid@test.bo"],
    [stranger, "ops-stranger@test.bo"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into schools(id,name,slug,status) values($1,'Colegio Operaciones','ops-one','active'),($2,'Otro colegio','ops-two','active')",
    [school, otherSchool],
  );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [school, director, teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name,capacity) values($1,$2,'Primero A',2),($3,$2,'Primero B',30)",
    [room, school, otherRoom],
  );
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesora','ops-teacher@test.bo','active')",
    [id(50), school, teacher],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [school, id(50), room],
  );
  for (const [student, classroom] of [
    [child, room],
    [otherChild, otherRoom],
  ]) {
    await q(
      "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Lucía','Prueba','active',true,'Madre','ops-mother@test.bo','Padre','ops-father@test.bo',(now() at time zone 'America/La_Paz')::date+1-interval '5 years')",
      [student, school, classroom],
    );
    await q(
      "insert into platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación','2026-10',50,'paid')",
      [school, student],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("begin");await fundInstitutionFixtures(db);
  await acting(director, () =>
    q("select set_student_login($1,$2,true)", [child, "ops-kid@test.bo"]),
  );
  await acting(mother, () => q("select workspace_identity()"));
  await acting(father, () => q("select workspace_identity()"));
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});
const payload = (extra: object = {}) => ({
  student_id: child,
  entry_date: "2026-10-18",
  kind: "meal",
  occurred_at: "10:00",
  food: "Fruta",
  amount: "most",
  note: "",
  ...extra,
});
const saveCare = (user: string, extra: object = {}) =>
  acting(user, () =>
    q("select save_care_record($1::jsonb) id", [
      JSON.stringify(payload(extra)),
    ]),
  );
const schoolYear = async () =>
  (
    await q("select id from academic_years where school_id=$1 and year=2026", [
      school,
    ])
  ).rows[0].id;
const makeTerm = async () => {
  const year = await schoolYear();
  return (
    await acting(director, () =>
      q("select save_academic_term($1::jsonb) id", [
        JSON.stringify({
          year_id: year,
          name: "Periodo de prueba",
          starts_on: "2026-10-01",
          ends_on: "2026-12-31",
          weight: 1,
        }),
      ]),
    )
  ).rows[0].id;
};
const makeAssessment = async (term: string, extra: object = {}) =>
  (
    await acting(teacher, () =>
      q("select save_assessment($1::jsonb) id", [
        JSON.stringify({
          term_id: term,
          classroom_id: room,
          title: "Lectura",
          assessment_date: "2026-10-18",
          max_score: 20,
          weight: 1,
          ...extra,
        }),
      ]),
    )
  ).rows[0].id;
const score = async (assessment: string, value: unknown, extra: object = {}) =>
  acting(teacher, () =>
    q("select save_assessment_scores($1,$2::jsonb)", [
      assessment,
      JSON.stringify([{ student_id: child, score: value, ...extra }]),
    ]),
  );

describe("Cuidados, gestiones, notas e importación multiinstitución", () => {
  it("permite cuidados al docente asignado, familia solo lectura y niega terceros", async () => {
    await saveCare(teacher);
    expect(
      (await as(mother, () => q("select * from care_records"))).rows,
    ).toHaveLength(1);
    expect(
      (await as(stranger, () => q("select * from care_records"))).rows,
    ).toHaveLength(0);
    await expect(saveCare(mother)).rejects.toThrow(/Solo Dirección/);
    await expect(
      as(mother, () =>
        q("insert into care_records select * from care_records"),
      ),
    ).rejects.toThrow();
    expect(
      (await as(owner, () => q("select * from care_records"))).rows,
    ).toHaveLength(0);
  });
  it("valida horas, campos y días futuros de cuidados", async () => {
    await expect(
      saveCare(teacher, {
        kind: "rest",
        occurred_at: "14:00",
        ended_at: "13:00",
      }),
    ).rejects.toThrow();
    await expect(
      saveCare(teacher, { kind: "incident", note: "x" }),
    ).rejects.toThrow();
    await expect(
      saveCare(teacher, { entry_date: "2099-10-18" }),
    ).rejects.toThrow();
  });
  it("conserva historial al cambiar de aula sin cambiar cuotas ni activación", async () => {
    await q(
      "insert into school_operation_settings(school_id,require_annual_materials) values($1,false)",
      [school],
    );
    const before = (await q("select count(*) n from platform_charges")).rows[0]
      .n;
    await acting(director, () =>
      q("select move_student_year($1,$2,$3)", [
        child,
        otherRoom,
        "Cambio solicitado por familia",
      ]),
    );
    const hist = (
      await q("select status from enrollment_history where student_id=$1", [
        child,
      ])
    ).rows
      .map((x) => x.status)
      .sort();
    expect(hist).toEqual(["enrolled", "transferred"]);
    expect((await q("select count(*) n from platform_charges")).rows[0].n).toBe(
      before,
    );
  });
  it("copia aulas, docentes y materias una vez para la nueva gestión", async () => {
    const from = await schoolYear();
    const to = (
      await acting(director, () =>
        q("select save_academic_year($1::jsonb) id", [
          JSON.stringify({
            school_id: school,
            year: 2027,
            name: "Gestión 2027",
            starts_on: "2027-01-01",
            ends_on: "2027-12-31",
          }),
        ]),
      )
    ).rows[0].id;
    expect(
      (
        await acting(director, () =>
          q("select copy_year_classrooms($1,$2) n", [from, to]),
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await acting(director, () =>
          q("select copy_year_classrooms($1,$2) n", [from, to]),
        )
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await q(
          "select count(*) n from teacher_classrooms tc join classrooms r on r.id=tc.classroom_id where r.academic_year=2027",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("calcula promedio ponderado y publica solo con notas completas", async () => {
    const term = await makeTerm(),
      a = await makeAssessment(term),
      b = await makeAssessment(term, {
        title: "Práctica",
        weight: 3,
        max_score: 100,
      });
    await score(a, 10);
    await expect(
      acting(director, () => q("select close_academic_term($1)", [term])),
    ).rejects.toThrow(/Faltan notas/);
    expect(
      (await as(mother, () => q("select * from assessment_scores"))).rows,
    ).toHaveLength(0);
    expect(
      (await as(mother, () => q("select * from report_cards"))).rows,
    ).toHaveLength(0);
    await score(b, 100);
    await acting(director, () => q("select close_academic_term($1)", [term]));
    const cards = (await as(mother, () => q("select * from report_cards")))
      .rows;
    expect(cards).toHaveLength(1);
    expect(cards[0].content.subjects[0].score).toBe(87.5);
    await expect(score(a, 20)).rejects.toThrow(/periodo abierto/);
  });
  it("reabre con motivo, revoca libreta anterior y conserva versiones", async () => {
    const t = await makeTerm(),
      a = await makeAssessment(t);
    await score(a, 15);
    await acting(director, () => q("select close_academic_term($1)", [t]));
    await expect(
      acting(teacher, () =>
        q("select reopen_academic_term($1,$2)", [t, "Corrección autorizada"]),
      ),
    ).rejects.toThrow(/Solo Dirección/);
    await acting(director, () =>
      q("select reopen_academic_term($1,$2)", [t, "Corrección autorizada"]),
    );
    expect(
      (await as(mother, () => q("select * from report_cards"))).rows,
    ).toHaveLength(0);
    await score(a, 20);
    await acting(director, () => q("select close_academic_term($1)", [t]));
    expect((await q("select * from report_cards")).rows).toHaveLength(2);
    expect(
      (await as(mother, () => q("select * from report_cards"))).rows,
    ).toHaveLength(1);
  });
  it("rechaza notas fuera de escala, terceros y periodos superpuestos", async () => {
    const t = await makeTerm(),
      a = await makeAssessment(t);
    await expect(score(a, 21)).rejects.toThrow(/máximo/);
    await expect(
      acting(stranger, () =>
        q("select save_assessment_scores($1,$2::jsonb)", [
          a,
          JSON.stringify([{ student_id: child, score: 10 }]),
        ]),
      ),
    ).rejects.toThrow(/Solo el docente/);
    await expect(makeTerm()).rejects.toThrow(/superponerse/);
  });
  it("permite exención con motivo y nunca equivale a cero", async () => {
    const t = await makeTerm(),
      a = await makeAssessment(t);
    await expect(
      score(a, null, { exempt: true, comment: "" }),
    ).rejects.toThrow();
    await score(a, null, { exempt: true, comment: "Incorporación posterior" });
    await acting(director, () => q("select close_academic_term($1)", [t]));
    const c = (await q("select content from report_cards")).rows[0].content;
    expect(c.subjects[0].score).toBeNull();
    expect(c.subjects[0].exemptions).toBe(1);
  });
  it("previsualiza sin persistir e importa docentes de manera idempotente", async () => {
    const rows = [
      {
        name: "Docente nuevo",
        email: "docente-import@test.bo",
        year: 2026,
        classroom: "Primero A",
      },
    ];
    const preview = (
      await acting(director, () =>
        q("select import_school_directory($1,$2,$3::jsonb,false) r", [
          school,
          "teachers",
          JSON.stringify(rows),
        ]),
      )
    ).rows[0].r;
    expect(preview.rows[0].ok).toBe(true);
    expect((await q("select * from teachers")).rows).toHaveLength(1);
    const batch = id(700);
    const call = () =>
      acting(director, () =>
        q("select import_school_directory($1,$2,$3::jsonb,true,$4) r", [
          school,
          "teachers",
          JSON.stringify(rows),
          batch,
        ]),
      );
    const first = (await call()).rows[0].r;
    expect(first.committed).toBe(true);
    expect((await call()).rows[0].r).toEqual(first);
    expect((await q("select * from teachers")).rows).toHaveLength(2);
  });
  it("revierte toda una importación al fallar una fila", async () => {
    const rows = [
      {
        name: "Docente uno",
        email: "import-one@test.bo",
        year: 2026,
        classroom: "Primero A",
      },
      {
        name: "Docente dos",
        email: "import-two@test.bo",
        year: 2026,
        classroom: "NO EXISTE",
      },
    ];
    await expect(
      acting(director, () =>
        q("select import_school_directory($1,$2,$3::jsonb,true,$4)", [
          school,
          "teachers",
          JSON.stringify(rows),
          id(701),
        ]),
      ),
    ).rejects.toThrow(/Fila 2/);
    expect((await q("select * from teachers")).rows).toHaveLength(1);
  });
});

describe("Inscripción e historial con requisitos configurables", () => {
  const importedStudent = {
    first_name: "Mateo",
    last_name: "Importado",
    birth_date: "2021-05-05",
    identity_number: "IMPORT-CI-1",
    rude: "",
    mother_name: "Madre Importada",
    mother_email: "madre-import@test.bo",
    father_name: "Padre Importado",
    father_email: "padre-import@test.bo",
    year: 2026,
    classroom: "Primero A",
    months: 2,
    monthly_fee: 350,
  };
  it("previsualiza estudiantes sin dejar cargos y confirma una única inscripción con plan", async () => {
    await acting(director, () =>
      q("select save_admission_settings($1,$2,true,false)", [school, "both"]),
    );
    const charges = (await q("select count(*) n from platform_charges")).rows[0]
      .n;
    const rows = JSON.stringify([importedStudent]);
    const preview = (
      await acting(director, () =>
        q("select import_school_directory($1,$2,$3::jsonb,false) r", [
          school,
          "students",
          rows,
        ]),
      )
    ).rows[0].r;
    expect(preview.rows[0]).toMatchObject({ ok: true });
    expect((await q("select count(*) n from platform_charges")).rows[0].n).toBe(
      charges,
    );
    await acting(director, () =>
      q("select import_school_directory($1,$2,$3::jsonb,true,$4,50,29)", [
        school,
        "students",
        rows,
        id(710),
      ]),
    );
    const student = (
      await q("select id from students where identity_number='IMPORT-CI-1'")
    ).rows[0].id;
    expect(
      (
        await q(
          "select count(*) n from enrollment_history where student_id=$1",
          [student],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await q("select count(*) n from school_charges where student_id=$1", [
          student,
        ])
      ).rows[0].n,
    ).toBe(2);
  });
  it("admite solo padre y CI opcional cuando Dirección lo configura", async () => {
    await acting(director, () =>
      q("select save_admission_settings($1,$2,false,false)", [
        school,
        "father",
      ]),
    );
    const rows = JSON.stringify([
      {
        ...importedStudent,
        mother_name: "",
        mother_email: "",
        identity_number: "",
      },
    ]);
    await acting(director, () =>
      q("select import_school_directory($1,$2,$3::jsonb,true,$4,50,29)", [
        school,
        "students",
        rows,
        id(711),
      ]),
    );
    const s = (await q("select * from students where first_name='Mateo'"))
      .rows[0];
    expect(s.primary_guardian_email).toBe("padre-import@test.bo");
    expect(s.mother_email).toBe("");
  });
  it("niega importación a familia y detecta tarifas desactualizadas", async () => {
    await expect(
      acting(mother, () =>
        q("select import_school_directory($1,$2,$3::jsonb,false)", [
          school,
          "students",
          JSON.stringify([importedStudent]),
        ]),
      ),
    ).rejects.toThrow(/Solo Dirección/);
    await expect(
      acting(director, () =>
        q("select import_school_directory($1,$2,$3::jsonb,true,$4,49,29)", [
          school,
          "students",
          JSON.stringify([importedStudent]),
          id(712),
        ]),
      ),
    ).rejects.toThrow(/tarifas cambiaron/);
  });
  it("impide cambiar el año de un aula con historial y conserva datos al cerrar una gestión", async () => {
    await expect(
      acting(director, () =>
        q("select save_classroom($1::jsonb,$2::uuid[])", [
          JSON.stringify({
            id: room,
            school_id: school,
            name: "Primero A",
            academic_year: 2027,
          }),
          [id(50)],
        ]),
      ),
    ).rejects.toThrow(/aula nueva/);
    const year = await schoolYear();
    await acting(director, () =>
      q("select set_academic_year_status($1,true,$2)", [
        year,
        "Cierre de la gestión académica",
      ]),
    );
    expect(
      (await q("select status from students where id=$1", [child])).rows[0]
        .status,
    ).toBe("active");
    await expect(makeTerm()).rejects.toThrow(/gestión abierta/);
  });
  it("el RPC filtra por RLS y respeta los bloqueos de pago", async () => {
    await saveCare(teacher);
    const value = (
      await as(mother, () =>
        q("select school_workspace($1,$2,$3) r", [
          school,
          "2026-10-18",
          "2026-10-18",
        ]),
      )
    ).rows[0].r;
    expect(value.care).toHaveLength(1);
    const outsider = (
      await as(stranger, () =>
        q("select school_workspace($1,$2,$3) r", [
          school,
          "2026-10-18",
          "2026-10-18",
        ]),
      )
    ).rows[0].r;
    expect(outsider.care).toHaveLength(0);
    expect(outsider.enrollments).toHaveLength(0);
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota vencida','2026-01-01',100,'overdue')",
      [school, child],
    );
    const blocked = (
      await as(mother, () =>
        q("select school_workspace($1,$2,$3) r", [
          school,
          "2026-10-18",
          "2026-10-18",
        ]),
      )
    ).rows[0].r;
    expect(blocked.care).toHaveLength(0);
  });
});
