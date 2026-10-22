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

const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const marks = (status: string | null = "present") => [
  { studentId: child, status, note: "Observación familiar" },
];
const save = (
  values = marks(),
  revision = 0,
  confirm = false,
  reason = "",
  classroom = room,
  date = day,
) =>
  q("select save_student_attendance($1,$2,$3::jsonb,$4,$5,$6) as result", [
    classroom,
    date,
    JSON.stringify(values),
    revision,
    confirm,
    reason,
  ]);
const workspace = (classroom = room, student: string | null = null) =>
  q("select student_attendance_workspace($1,$2,$3,$4) as result", [
    classroom,
    day,
    day.slice(0, 7) + "-01",
    student,
  ]);
const notices = () =>
  q("select * from notifications where kind like 'attendance_%'");

describe("Asistencia de alumnos: acceso, confirmación, avisos y respaldo", () => {
  it("limita escritura al docente del aula o Dirección y bloquea edición directa y anónima", async () => {
    expect(
      (await as(teacher, () => workspace())).rows[0].result.canManage,
    ).toBe(true);
    await expect(
      as(teacher, () => save([], 0, false, "", otherRoom)),
    ).rejects.toThrow("docentes asignados");
    await expect(as(mother, () => save())).rejects.toThrow(
      "docentes asignados",
    );
    await expect(as(stranger, () => workspace(room, child))).rejects.toThrow(
      "acceso",
    );
    await expect(
      as(null, () => workspace(), undefined, "anon"),
    ).rejects.toThrow("permission denied");
    await expect(
      as(director, () => q("delete from student_attendance_records")),
    ).rejects.toThrow("permission denied");
    await acting(teacher, () => save());
  });
  it("un borrador o un día sin lista no generan faltas ni avisos y no son visibles para la familia", async () => {
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records,
    ).toEqual([]);
    await acting(teacher, () => save(marks(null)));
    expect((await notices()).rows).toHaveLength(0);
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records,
    ).toEqual([]);
    await expect(as(teacher, () => save(marks(null), 1, true))).rejects.toThrow(
      "Marca a cada estudiante",
    );
    expect(
      (await q("select status from student_attendance_sessions")).rows[0]
        .status,
    ).toBe("draft");
  });
  it("al confirmar una falta notifica solo a madre y padre vinculados; guardar de nuevo no duplica avisos", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    const rows = (await notices()).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((n) => n.user_id).sort()).toEqual([mother, father].sort());
    expect(
      rows.every(
        (n) =>
          n.target === "studentAttendance" && n.alert_type === "attendance",
      ),
    ).toBe(true);
    await expect(
      as(teacher, () => save(marks("absent"), 0, true)),
    ).rejects.toThrow("Otra persona");
    await acting(teacher, () =>
      save(marks("absent"), 1, true, "Confirmación revisada"),
    );
    expect((await notices()).rows).toHaveLength(2);
    expect(
      (await q("select * from student_attendance_changes")).rows,
    ).toHaveLength(1);
  });
  it("corrige con motivo, conserva el registro anterior y avisa de la corrección sin enviar la falta vieja", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    await expect(
      as(director, () => save(marks("late"), 1, true)),
    ).rejects.toThrow("motivo");
    await acting(director, () =>
      save(marks("late"), 1, true, "El estudiante llegó más tarde"),
    );
    const audit = (
      await q("select previous,reason from student_attendance_changes")
    ).rows[0];
    expect(audit.previous.records[0].status).toBe("absent");
    expect(audit.reason).toContain("llegó");
    expect(
      (await notices()).rows.filter((n) => n.kind === "attendance_corrected"),
    ).toHaveLength(2);
    const old = (await notices()).rows.find(
      (n) => n.kind === "attendance_absent",
    );
    expect(
      (
        await q("select aulanexo_private.push_notice_visible($1) as visible", [
          old.id,
        ])
      ).rows[0].visible,
    ).toBe(false);
    await acting(director, () =>
      save(marks("late"), 2, true, "Corrección revisada otra vez"),
    );
    expect((await notices()).rows).toHaveLength(4);
  });
  it("la familia ve solo los registros confirmados del hijo incluso con deuda y no obtiene motivos internos", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota pendiente',$3,400,'overdue')",
      [school, child, day],
    );
    const result = (await as(mother, () => workspace(room, child))).rows[0]
      .result;
    expect(result.canManage).toBe(false);
    expect(result.session).toBeNull();
    expect(result.roster).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].studentId).toBe(child);
    expect(result.records[0].status).toBe("absent");
    expect(JSON.stringify(result)).not.toContain("previous");
    expect(
      (
        await as(mother, () =>
          q("select * from notifications where kind='attendance_absent'"),
        )
      ).rows,
    ).toHaveLength(1);
    await q(
      "update student_guardians set can_view=false where student_id=$1 and user_id=$2",
      [child, mother],
    );
    await expect(as(mother, () => workspace(room, child))).rejects.toThrow(
      "acceso",
    );
    expect(
      (
        await as(mother, () =>
          q("select * from notifications where kind='attendance_absent'"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rechaza estudiantes de otra aula, listas incompletas, repetidos, estados inválidos y fechas futuras", async () => {
    await expect(
      as(director, () =>
        save([{ studentId: otherChild, status: "absent", note: "" }]),
      ),
    ).rejects.toThrow("inválidos");
    await expect(as(director, () => save([]))).rejects.toThrow("matrícula");
    await expect(
      as(director, () => save([...marks(), ...marks()])),
    ).rejects.toThrow("inválidos");
    await expect(as(director, () => save(marks("missing")))).rejects.toThrow(
      "inválidos",
    );
    await expect(
      as(director, () => save(marks(), 0, true, "", room, "2099-01-01")),
    ).rejects.toThrow("últimos");
    expect(
      (await q("select * from student_attendance_sessions")).rows,
    ).toHaveLength(0);
  });
  it("conserva historial si el estudiante cambia de aula y no duplica el padrón al cambiar su nombre", async () => {
    await acting(teacher, () => save(marks("present"), 0, true));
    await q(
      "update students set classroom_id=$1,first_name='Nombre cambiado' where id=$2",
      [otherRoom, child],
    );
    const history = (await as(mother, () => workspace(otherRoom, child)))
      .rows[0].result;
    expect(history.records).toHaveLength(1);
    expect(history.records[0].status).toBe("present");
    const own = (await as(teacher, () => workspace())).rows[0].result;
    expect(own.roster).toHaveLength(1);
  });
  it("encola push de asistencia con presentación propia, sin datos privados y respeta la revocación familiar", async () => {
    await acting(mother, () =>
      q("select register_push_device($1,$2,true,array['alerts'])", [
        id(900),
        "fcm-attendance-test-device-1234567890",
      ]),
    );
    await acting(teacher, () => save(marks("absent"), 0, true));
    const delivery = (
      await q(
        "select * from aulanexo_private.push_deliveries where notification_id in (select id from notifications where kind='attendance_absent')",
      )
    ).rows[0];
    expect(delivery).toBeDefined();
    expect(delivery.category).toBe("alerts");
    await q(
      "update aulanexo_private.push_deliveries set status='processing',lease_id=$2,locked_until=now()+interval '3 minutes' where id=$1",
      [delivery.id, id(901)],
    );
    const prepared = (
      await q("select prepare_push_delivery($1,$2) as result", [
        delivery.id,
        id(901),
      ])
    ).rows[0].result;
    expect(prepared.alertType).toBe("attendance");
    expect(prepared.kind).toBe("attendance_absent");
    expect(JSON.stringify(prepared)).not.toContain("Lucía");
    await q(
      "update school_memberships set active=false where user_id=$1 and school_id=$2",
      [mother, school],
    );
    const n = (await notices()).rows.find((n) => n.user_id === mother);
    expect(
      (
        await q("select aulanexo_private.push_notice_visible($1) as visible", [
          n.id,
        ])
      ).rows[0].visible,
    ).toBe(false);
  });
  it("bloquea gestiones cerradas y no permite al superadmin acceder sin contexto de soporte", async () => {
    await q("update academic_years set status='closed' where school_id=$1", [
      school,
    ]);
    await expect(as(director, () => save())).rejects.toThrow(
      "gestión está cerrada",
    );
    await expect(as(owner, () => workspace())).rejects.toThrow("acceso");
  });
});
