import { notificationTestTemplates } from "../src/lib/notificationTests";
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
  await acting(mother, () => q("select workspace_identity()"));
  await acting(father, () => q("select workspace_identity()"));
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});

describe("laboratorio privado de notificaciones", () => {
  const device = id(600),
    otherDevice = id(601),
    familyDevice = id(602);
  const register = (who = owner, installation = device) =>
    acting(who, () =>
      q("select register_push_device($1,$2,true,$3::text[])", [
        installation,
        `synthetic_device_token_${installation}`,
        ["academic", "alerts", "messages", "payments", "birthdays"],
      ]),
    );
  const create = (
    template = "health",
    channel = "web",
    target: string | null = null,
    key = id(700),
    who = owner,
  ) =>
    acting(who, () =>
      q("select create_notification_test($1,$2,$3,$4) value", [
        template,
        channel,
        target,
        key,
      ]),
    );
  const workspace = (who = owner) =>
    as(who, () => q("select notification_test_workspace() value"));
  const claim = async () => {
    await q("update aulanexo_private.push_deliveries set available_at=now()");
    return (await q("select claim_push_deliveries() value")).rows[0].value;
  };
  it("exige propietario confirmado, sin soporte, y oculta tokens y teléfonos de otras cuentas", async () => {
    await register();
    await register(mother, familyDevice);
    const value = (await workspace()).rows[0].value;
    expect(value.devices.map((d: any) => d.id)).toEqual([device]);
    expect(JSON.stringify(value)).not.toContain("synthetic_device_token");
    expect(JSON.stringify(value)).not.toContain("session_id");
    for (const who of [director, teacher, mother, father, kid, stranger]) {
      await expect(workspace(who)).rejects.toThrow(/superadmin/);
      await expect(create("health", "web", null, id(700), who)).rejects.toThrow(
        /superadmin/,
      );
    }
    await expect(
      as(owner, () => q("select notification_test_workspace()"), id(999)),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        () => q("select notification_test_workspace()"),
        undefined,
        "anon",
      ),
    ).rejects.toThrow();
    await expect(
      as(owner, () =>
        q("select * from aulanexo_private.notification_test_runs"),
      ),
    ).rejects.toThrow();
    await q(
      "delete from aulanexo_private.platform_admin_allowlist where email=$1",
      ["ops-owner@test.bo"],
    );
    await expect(workspace()).rejects.toThrow(/superadmin/);
  });
  it("crea solo su campanita y conserva el mismo pedido al reintentar, sin casos reales", async () => {
    await register();
    const before = (
      await q(
        "select (select count(*) from students) students,(select count(*) from school_charges) charges,(select count(*) from announcements) notices,(select count(*) from family_requests) requests",
      )
    ).rows[0];
    await create();
    await create();
    expect(
      (
        await q("select count(*)::int n from notifications where id=$1", [
          id(700),
        ])
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await q("select count(*)::int n from aulanexo_private.push_deliveries"))
        .rows[0].n,
    ).toBe(0);
    const notice = (
      await q("select * from notifications where id=$1", [id(700)])
    ).rows[0];
    expect(notice).toMatchObject({
      user_id: owner,
      kind: "push_test",
      school_id: null,
      student_id: null,
      classroom_id: null,
      target: "notificationTests",
      alert_type: "health",
    });
    expect(notice.title).toContain("[PRUEBA]");
    const after = (
      await q(
        "select (select count(*) from students) students,(select count(*) from school_charges) charges,(select count(*) from announcements) notices,(select count(*) from family_requests) requests",
      )
    ).rows[0];
    expect(after).toEqual(before);
    await expect(create("grade")).rejects.toThrow(/otra prueba/);
    await expect(create("unknown", "web", null, id(701))).rejects.toThrow(
      /no está disponible/,
    );
  });
  it("solo el teléfono propio seleccionado recibe la alerta y leer la campana no cancela su envío", async () => {
    await register();
    await register(owner, otherDevice);
    await register(mother, familyDevice);
    await expect(create("health", "both", familyDevice)).rejects.toThrow(
      /propia cuenta/,
    );
    await create("health", "both", device);
    await acting(owner, () =>
      q("select mark_notification_read($1)", [id(700)]),
    );
    const jobs = await claim();
    expect(jobs).toHaveLength(1);
    const payload = (
      await q("select prepare_push_delivery($1,$2) value", [
        jobs[0].id,
        jobs[0].lease,
      ])
    ).rows[0].value;
    expect(payload).toMatchObject({
      notificationId: id(700),
      recipientId: owner,
      alertType: "health",
      category: "alerts",
      kind: "push_test",
      testKind: "announcement",
      testLabel: "Salud y emergencia",
      isTest: true,
    });
    expect(payload.token).toBe(`synthetic_device_token_${device}`);
    await q("select finish_push_delivery($1,$2,'sent')", [
      jobs[0].id,
      jobs[0].lease,
    ]);
    const value = (await workspace()).rows[0].value;
    expect(value.runs[0]).toMatchObject({ status: "sent", channel: "both" });
    expect(value.runs[0].readAt).toBeTruthy();
  });
  it("confirma un acuerdo ficticio sin crear recibos de comunicados ni tocar a otra cuenta", async () => {
    await create("mandatory");
    let value = (await workspace()).rows[0].value;
    expect(value.runs[0].acknowledgedAt).toBeNull();
    expect(value.runs[0].readAt).toBeNull();
    await acting(owner, () =>
      q("select mark_notification_read($1)", [id(700)]),
    );
    value = (await workspace()).rows[0].value;
    expect(value.runs[0].readAt).toBeTruthy();
    expect(value.runs[0].acknowledgedAt).toBeNull();
    const before = (
      await q("select count(*)::int n from public.announcement_receipts")
    ).rows[0].n;
    await expect(
      acting(mother, () =>
        q("select acknowledge_notification_test($1)", [id(700)]),
      ),
    ).rejects.toThrow(/superadmin/);
    await acting(owner, () =>
      q("select acknowledge_notification_test($1)", [id(700)]),
    );
    await acting(owner, () =>
      q("select acknowledge_notification_test($1)", [id(700)]),
    );
    value = (await workspace()).rows[0].value;
    expect(value.runs[0].acknowledgedAt).toBeTruthy();
    expect(
      (await q("select count(*)::int n from public.announcement_receipts"))
        .rows[0].n,
    ).toBe(before);
  });
  it("valida todo el catálogo, aplica su presentación y nunca genera recordatorios horarios", async () => {
    const catalog = (
      await q("select aulanexo_private.notification_test_catalog() value")
    ).rows[0].value;
    expect(catalog).toEqual(notificationTestTemplates);
    for (let i = 0; i < catalog.length; i++) {
      await q(
        "update aulanexo_private.notification_test_runs set created_at=now()-interval '3 seconds'",
      );
      await create(catalog[i].key, "web", null, id(710 + i));
      const row = (
        await q("select kind,alert_type,title from notifications where id=$1", [
          id(710 + i),
        ])
      ).rows[0];
      expect(row).toMatchObject({
        kind: "push_test",
        alert_type: catalog[i].alertType,
        title: "[PRUEBA] " + catalog[i].label,
      });
    }
    expect(
      (
        await q(
          "select count(*)::int n from aulanexo_private.notification_test_runs",
        )
      ).rows[0].n,
    ).toBe(catalog.length);
    expect(
      (await q("select count(*)::int n from public.announcement_receipts"))
        .rows[0].n,
    ).toBe(0);
    await q("select aulanexo_private.send_announcement_reminders()");
    expect(
      (await q("select count(*)::int n from notifications")).rows[0].n,
    ).toBe(catalog.length);
  });
  it("limita frecuencia, rechaza teléfonos expirados y no permite saltar permisos por el servicio público", async () => {
    await register();
    await q(
      "update aulanexo_private.push_devices set expires_at=now()-interval '1 minute' where id=$1",
      [device],
    );
    await expect(create("health", "both", device)).rejects.toThrow(
      /teléfono activo/,
    );
    await create();
    await expect(create("health", "web", null, id(701))).rejects.toThrow(
      /dos segundos/,
    );
    await create();
    await expect(
      as(owner, () =>
        q("select prepare_push_delivery($1,$2)", [id(800), id(801)]),
      ),
    ).rejects.toThrow();
    await expect(
      as(
        null,
        () =>
          q("select create_notification_test($1,$2,$3,$4)", [
            "health",
            "web",
            null,
            id(701),
          ]),
        undefined,
        "anon",
      ),
    ).rejects.toThrow();
  });
  it("vuelve a validar la cuenta y el dispositivo antes de despachar", async () => {
    await register();
    await create("health", "both", device);
    await acting(owner, () => q("select unregister_push_device($1)", [device]));
    const jobs = await claim();
    expect(
      (
        await q("select prepare_push_delivery($1,$2) value", [
          jobs[0].id,
          jobs[0].lease,
        ])
      ).rows[0].value,
    ).toBeNull();
  });
  it("revocar al superadmin también revoca un envío de prueba pendiente", async () => {
    await register();
    await create("health", "both", device);
    await q(
      "delete from aulanexo_private.platform_admin_allowlist where email=$1",
      ["ops-owner@test.bo"],
    );
    const jobs = await claim();
    expect(
      (
        await q("select prepare_push_delivery($1,$2) value", [
          jobs[0].id,
          jobs[0].lease,
        ])
      ).rows[0].value,
    ).toBeNull();
  });
});

it("emite una revisión de plataforma sin datos de alumnos ni tokens", async () => {
  const before = (await q("select revision from platform_signals")).rows[0]
    .revision;
  await acting(owner, () =>
    q("select create_notification_test($1,$2,$3,$4)", [
      "health",
      "web",
      null,
      id(990),
    ]),
  );
  const after = (await q("select * from platform_signals")).rows[0];
  expect(Number(after.revision)).toBeGreaterThan(Number(before));
  expect(after.changed_table).toBe("notifications");
  expect(JSON.stringify(after)).not.toContain("Salud");
});
it("permite recorrer escenarios pero limita los envíos nuevos a 60 por hora", async () => {
  for (let i = 0; i < 60; i++) {
    await q(
      "update aulanexo_private.notification_test_runs set created_at=now()-interval '3 seconds'",
    );
    await acting(owner, () =>
      q("select create_notification_test($1,$2,$3,$4)", [
        "general",
        "web",
        null,
        id(1000 + i),
      ]),
    );
  }
  await q(
    "update aulanexo_private.notification_test_runs set created_at=now()-interval '3 seconds'",
  );
  await expect(
    acting(owner, () =>
      q("select create_notification_test($1,$2,$3,$4)", [
        "general",
        "web",
        null,
        id(1100),
      ]),
    ),
  ).rejects.toThrow(/60 pruebas/);
  await acting(owner, () =>
    q("select create_notification_test($1,$2,$3,$4)", [
      "general",
      "web",
      null,
      id(1000),
    ]),
  );
  expect(
    (
      await q(
        "select count(*)::int n from aulanexo_private.notification_test_runs",
      )
    ).rows[0].n,
  ).toBe(60);
});
