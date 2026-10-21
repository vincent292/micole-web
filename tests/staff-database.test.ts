import {
  enableActivationFixture,
  fundInstitutionFixtures,
} from "./funded-institution-fixture";
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
async function acting<T>(
  user: string,
  task: () => Promise<T>,
  support?: string,
) {
  const save = `mutation_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role authenticated;`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [user, JSON.stringify(support ? { "x-micole-support": support } : {})],
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
  await db.exec("begin");
  await fundInstitutionFixtures(db);
  await q(
    "insert into platform_admins(user_id) values($1) on conflict do nothing",
    [owner],
  );
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

const month = "2026-09-01";
const rules = {
  latitude: -16.5,
  longitude: -68.1,
  radiusM: 150,
  maxAccuracyM: 50,
  toleranceMinutes: 10,
  lateMode: "excess",
  lateRate: 2,
  deductionsEnabled: true,
  policyNote: "Reglamento de ejemplo revisado por Dirección",
};
const schedule = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  start: "08:00",
  end: "16:00",
  breakMinutes: 60,
}));
const profile = {
  teacherId: id(50),
  payType: "monthly",
  monthlySalary: 3000,
  hourlyRate: 60,
  active: true,
  schedule,
};
const settings = () =>
  acting(director, () =>
    q("select save_staff_settings($1,$2::jsonb)", [
      school,
      JSON.stringify(rules),
    ]),
  );
const saveProfile = (value = profile) =>
  acting(director, () =>
    q("select save_staff_profile($1,$2::jsonb)", [
      school,
      JSON.stringify(value),
    ]),
  );
async function manual(extra: Record<string, unknown> = {}) {
  return (
    await acting(director, () =>
      q("select correct_staff_attendance($1,$2::jsonb,$3) as id", [
        school,
        JSON.stringify({
          teacherId: id(50),
          checkIn: "2026-09-15T08:15:00-04:00",
          checkOut: "2026-09-15T16:00:00-04:00",
          shiftStart: "08:00",
          ...extra,
        }),
        "Corrección documentada por Dirección",
      ]),
    )
  ).rows[0].id;
}
const prepare = async () =>
  (
    await acting(director, () =>
      q("select prepare_staff_payroll($1,$2::date) as id", [id(50), month]),
    )
  ).rows[0].id;

describe("asistencia y boletas de docentes", () => {
  it("rechaza familias, estudiantes, docentes administrando reglas y accesos entre sedes", async () => {
    await settings();
    await saveProfile();
    for (const user of [teacher, mother, kid, stranger])
      await expect(
        as(user, () =>
          q("select save_staff_settings($1,$2::jsonb)", [
            school,
            JSON.stringify(rules),
          ]),
        ),
      ).rejects.toThrow("Dirección");
    await expect(
      as(director, () =>
        q("select staff_workspace($1,$2::date)", [otherSchool, month]),
      ),
    ).rejects.toThrow("acceso");
    for (const user of [mother, kid, stranger]) {
      expect(
        (await as(user, () => q("select * from staff_work_profiles"))).rows,
      ).toEqual([]);
      await expect(
        as(user, () =>
          q("select staff_workspace($1,$2::date)", [school, month]),
        ),
      ).rejects.toThrow("acceso");
    }
    await expect(
      as(teacher, () =>
        q("update staff_work_profiles set monthly_salary=99999"),
      ),
    ).rejects.toThrow();
    await q(
      "insert into school_memberships(school_id,user_id,role) values($1,$2,'teacher')",
      [school, director],
    );
    await expect(
      as(director, () =>
        q("select mark_staff_attendance($1,$2,$3::jsonb,$4)", [
          id(50),
          "in",
          JSON.stringify({
            latitude: -16.5,
            longitude: -68.1,
            accuracy: 10,
            capturedAt: new Date().toISOString(),
          }),
          id(400),
        ]),
      ),
    ).rejects.toThrow("cuenta docente");
  });
  it("rechaza horarios inválidos o superpuestos y exige respaldo para activar descuentos", async () => {
    await expect(
      as(director, () =>
        q("select save_staff_settings($1,$2::jsonb)", [
          school,
          JSON.stringify({ ...rules, policyNote: "" }),
        ]),
      ),
    ).rejects.toThrow("reglamento");
    await expect(
      as(director, () =>
        q("select save_staff_profile($1,$2::jsonb)", [
          school,
          JSON.stringify({ ...profile, schedule: [schedule[0], schedule[0]] }),
        ]),
      ),
    ).rejects.toThrow("superponerse");
    await expect(
      as(director, () =>
        q("select save_staff_profile($1,$2::jsonb)", [
          school,
          JSON.stringify({
            ...profile,
            schedule: [{ start: "08:00", end: "16:00" }],
          }),
        ]),
      ),
    ).rejects.toThrow("turno");
  });
  it("valida rango, precisión, ubicación reciente y simulada y usa el reloj del servidor", async () => {
    await settings();
    await saveProfile({
      ...profile,
      schedule: schedule.map((s) => ({
        ...s,
        start: "00:00",
        end: "23:59",
        breakMinutes: 0,
      })),
    });
    const loc = {
      latitude: -16.5,
      longitude: -68.1,
      accuracy: 15,
      capturedAt: new Date().toISOString(),
    };
    for (const bad of [
      { ...loc, latitude: -17 },
      { ...loc, accuracy: 999 },
      { ...loc, mocked: true },
      { ...loc, capturedAt: "2020-01-01T00:00:00Z" },
    ])
      await expect(
        as(teacher, () =>
          q("select mark_staff_attendance($1,$2,$3::jsonb,$4)", [
            id(50),
            "in",
            JSON.stringify(bad),
            id(400),
          ]),
        ),
      ).rejects.toThrow();
    await acting(teacher, () =>
      q("select mark_staff_attendance($1,$2,$3::jsonb,$4)", [
        id(50),
        "in",
        JSON.stringify(loc),
        id(400),
      ]),
    );
    await acting(teacher, () =>
      q("select mark_staff_attendance($1,$2,$3::jsonb,$4)", [
        id(50),
        "in",
        JSON.stringify(loc),
        id(400),
      ]),
    );
    expect(
      (await q("select count(*)::int as n from staff_attendance_records"))
        .rows[0].n,
    ).toBe(1);
    await acting(teacher, () =>
      q("select mark_staff_attendance($1,$2,$3::jsonb,$4)", [
        id(50),
        "out",
        JSON.stringify(loc),
        id(400),
      ]),
    );
    expect(
      (
        await q(
          "select check_in=now() as server_time,check_out is not null as closed from staff_attendance_records",
        )
      ).rows[0],
    ).toEqual({ server_time: true, closed: true });
  });
  it("calcula sueldo mensual y descuento solo del exceso con conceptos revisables", async () => {
    await settings();
    await saveProfile();
    await manual();
    const payroll = await prepare();
    let row = (await q("select * from staff_payrolls where id=$1", [payroll]))
      .rows[0];
    expect(row).toMatchObject({
      worked_minutes: 405,
      late_minutes: 15,
      base_amount: "3000.00",
      late_deduction: "10.00",
      net_amount: "2990.00",
    });
    await acting(director, () =>
      q("select edit_staff_payroll($1,$2::jsonb,$3)", [
        payroll,
        JSON.stringify([
          { kind: "earning", label: "Bono de ejemplo", amount: 100 },
          { kind: "deduction", label: "Aporte registrado", amount: 50 },
        ]),
        "Revisar conforme al contrato",
      ]),
    );
    row = (await q("select * from staff_payrolls where id=$1", [payroll]))
      .rows[0];
    expect(row.net_amount).toBe("3040.00");
    expect(
      (await as(teacher, () => q("select * from staff_payrolls"))).rows,
    ).toEqual([]);
    await acting(director, () =>
      q("select approve_staff_payroll($1)", [payroll]),
    );
    expect(
      (await as(teacher, () => q("select net_amount from staff_payrolls")))
        .rows[0].net_amount,
    ).toBe("3040.00");
    await expect(
      as(director, () =>
        q("select edit_staff_payroll($1,$2::jsonb,$3)", [
          payroll,
          "[]",
          "Cambiar",
        ]),
      ),
    ).rejects.toThrow("borrador");
    await expect(
      as(director, () =>
        q("select correct_staff_attendance($1,$2::jsonb,$3)", [
          school,
          JSON.stringify({
            teacherId: id(50),
            checkIn: "2026-09-16T08:00:00-04:00",
            checkOut: "2026-09-16T16:00:00-04:00",
            shiftStart: "08:00",
          }),
          "Intento de cambio posterior",
        ]),
      ),
    ).rejects.toThrow("aprobada");
    await acting(director, () =>
      q("select record_staff_payroll_payment($1,$2,$3)", [
        payroll,
        "transfer",
        "TRANSFER-01",
      ]),
    );
    expect(
      (
        await as(teacher, () =>
          q("select status,payment_reference from staff_payrolls"),
        )
      ).rows[0],
    ).toMatchObject({ status: "paid", payment_reference: "TRANSFER-01" });
  });
  it("admite pago por horas y regla de descontar toda la tardanza al superar tolerancia", async () => {
    await acting(director, () =>
      q("select save_staff_settings($1,$2::jsonb)", [
        school,
        JSON.stringify({ ...rules, lateMode: "all_after_tolerance" }),
      ]),
    );
    await saveProfile({ ...profile, payType: "hourly" });
    await manual();
    await prepare();
    expect(
      (
        await q(
          "select base_amount,late_deduction,net_amount from staff_payrolls",
        )
      ).rows[0],
    ).toMatchObject({
      base_amount: "405.00",
      late_deduction: "30.00",
      net_amount: "375.00",
    });
  });
  it("las correcciones justificadas se auditan, no descuentan tardanzas eximidas y vuelven obsoleto un borrador", async () => {
    await settings();
    await saveProfile();
    const attendance = await manual();
    const payroll = await prepare();
    await manual({ id: attendance, waiveLate: true });
    await expect(
      as(director, () => q("select approve_staff_payroll($1)", [payroll])),
    ).rejects.toThrow("Recalcula");
    await prepare();
    expect(
      (await q("select late_deduction from staff_payrolls")).rows[0]
        .late_deduction,
    ).toBe("0.00");
    expect(
      (await q("select reason from staff_attendance_changes")).rowCount,
    ).toBe(1);
  });
  it("no permite aprobar períodos abiertos, entradas sin salida ni importes netos negativos", async () => {
    await settings();
    await saveProfile();
    await manual({ checkOut: "" });
    let payroll = await prepare();
    await expect(
      as(director, () => q("select approve_staff_payroll($1)", [payroll])),
    ).rejects.toThrow("sin salida");
    const attendance = (await q("select id from staff_attendance_records"))
      .rows[0].id;
    await manual({ id: attendance });
    await prepare();
    await acting(director, () =>
      q("select edit_staff_payroll($1,$2::jsonb,$3)", [
        payroll,
        JSON.stringify([
          { kind: "deduction", label: "Importe excesivo", amount: 9999 },
        ]),
        "Pendiente de revisión",
      ]),
    );
    await expect(
      as(director, () => q("select approve_staff_payroll($1)", [payroll])),
    ).rejects.toThrow("superar");
    const current = (
      await q(
        "select date_trunc('month',now() at time zone 'America/La_Paz')::date::text as month",
      )
    ).rows[0].month;
    payroll = (
      await acting(director, () =>
        q("select prepare_staff_payroll($1,$2::date) as id", [id(50), current]),
      )
    ).rows[0].id;
    await expect(
      as(director, () => q("select approve_staff_payroll($1)", [payroll])),
    ).rejects.toThrow("termina el mes");
  });
});

it("conserva el valor por hora de cada marcación cuando cambia el sueldo", async () => {
  await settings();
  await saveProfile({ ...profile, payType: "hourly" });
  await manual();
  await saveProfile({ ...profile, payType: "hourly", hourlyRate: 120 });
  await manual({
    checkIn: "2026-09-16T08:15:00-04:00",
    checkOut: "2026-09-16T16:00:00-04:00",
  });
  await prepare();
  expect(
    (await q("select base_amount,net_amount from staff_payrolls")).rows[0],
  ).toMatchObject({ base_amount: "1215.00", net_amount: "1195.00" });
});
