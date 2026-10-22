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
}, 30000);
afterAll(() => db.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
it("habilita únicamente el sandbox sin simular pago, crédito ni licencia", async () => {
  expect(
    (await q("select platform_enabled from schools where id=$1", [school]))
      .rows[0].platform_enabled,
  ).toBe(true);
  expect(
    (await q("select platform_enabled from schools where id=$1", [other]))
      .rows[0].platform_enabled,
  ).toBe(false);
  expect(
    (
      await q(
        "select initial_paid_at from aulanexo_private.platform_credit_accounts where school_id=$1",
        [school],
      )
    ).rows[0].initial_paid_at,
  ).toBeNull();
  expect(
    (
      await q(
        "select * from aulanexo_private.platform_credit_ledger where school_id=$1",
        [school],
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    (
      await q(
        "select * from platform_charges where school_id=$1 and kind in ('license','activation')",
        [school],
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec("savepoint blocked");
  await expect(
    q("update schools set platform_enabled=true where id=$1", [other]),
  ).rejects.toThrow(/pago bancario/);
  await db.exec("rollback to savepoint blocked");
});
it("cada cuenta recibe su rol, sin superadmin ni soporte y sin ver otra institución", async () => {
  for (const [user, role] of [
    [director, "director"],
    [teacher, "teacher"],
    [mother, "guardian"],
    [kid, "student"],
  ]) {
    const identity = (await as(user, "select workspace_identity() as value"))
      .rows[0].value;
    expect(identity.roles).toEqual([role]);
    expect(identity.testing).toBe(true);
    expect(identity.canSupport).toBe(false);
    expect(identity.memberships.map((m: any) => m.schoolId)).toEqual([school]);
    expect(
      (await as(user, "select id from schools")).rows.every(
        (r: any) => r.id === school,
      ),
    ).toBe(true);
  }
  expect((await as(stranger, "select id from students")).rows).toHaveLength(0);
});
it("conserva las restricciones de alumno y familia, permite al docente sus tareas", async () => {
  const portal = (await as(kid, "select student_portal() as value")).rows[0]
    .value;
  expect(portal.accessAllowed).toBe(true);
  expect(JSON.stringify(portal)).not.toContain("motherEmail");
  await expect(
    as(mother, "select save_assignment($1::jsonb)", [
      JSON.stringify({
        classroom_id: room,
        title: "Prohibido",
        status: "published",
      }),
    ]),
  ).rejects.toThrow();
  expect(
    (await as(teacher, "select id from students")).rows.map((r: any) => r.id),
  ).toEqual([child]);
});
it("impide usar cuentas ficticias en alumnos o equipo de una institución real", async () => {
  for (const [sql, args] of [
    [
      "insert into school_memberships(school_id,user_id,role) values($1,$2,'director')",
      [other, director],
    ],
    [
      "insert into students(school_id,first_name,last_name,mother_email) values($1,'Real','Alumno','familia@pruebas.micole.test')",
      [other],
    ],
    [
      "insert into teachers(school_id,name,email) values($1,'Real','docente@pruebas.micole.test')",
      [other],
    ],
  ]) {
    await db.exec("savepoint protection");
    await expect(q(sql as string, args as any[])).rejects.toThrow(
      /cuenta ficticia/,
    );
    await db.exec("rollback to savepoint protection");
  }
  await expect(
    as(
      director,
      "insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)",
      [other, director],
    ),
  ).rejects.toThrow(/permission denied/);
});
it("suspende y restaura acceso sin convertir el sandbox en cobros reales", async () => {
  await q(
    "update aulanexo_private.test_institutions set enabled=false where school_id=$1",
    [school],
  );
  expect(
    (await q("select platform_enabled from schools where id=$1", [school]))
      .rows[0].platform_enabled,
  ).toBe(false);
  await q(
    "update aulanexo_private.test_institutions set enabled=true where school_id=$1",
    [school],
  );
  await expect(
    as(
      director,
      "select save_baneco_connection($1,'Cuenta de prueba','production','',null)",
      [school],
    ),
  ).rejects.toThrow(/certificación/);
  await q("update schools set show_on_landing=true where id=$1", [school]);
  expect(
    JSON.stringify((await q("select landing_institutions() as value")).rows),
  ).not.toContain("test-persisted");
});
