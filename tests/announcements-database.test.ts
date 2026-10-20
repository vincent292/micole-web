import { fundInstitutionFixtures } from "./funded-institution-fixture";
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
  await db.exec(
    `create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text);create view vault.decrypted_secrets as select id,secret as decrypted_secret,name from vault.secrets;create function vault.create_secret(p_secret text,p_name text,p_desc text) returns uuid language plpgsql security definer as $$declare result uuid;begin insert into vault.secrets(secret,name) values(p_secret,p_name) returning id into result;return result;end $$;`,
  );
  await db.exec(`create schema if not exists extensions;
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
create function extensions.pgp_sym_encrypt(value text,key text,options text) returns bytea language sql as $$select convert_to(reverse(value),'UTF8')$$;
create function extensions.pgp_sym_decrypt(value bytea,key text) returns text language sql as $$select reverse(convert_from(value,'UTF8'))$$;
create function extensions.hmac(value bytea,key bytea,algorithm text) returns bytea language sql as $$select sha256(value||key)$$;`);
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
const payload = (overrides: any = {}) => ({
  id: id(1500),
  school_id: school,
  classroom_id: room,
  title: "Reunión de familias",
  content: "Revisé las indicaciones y estoy de acuerdo.",
  audience: "families",
  requires_acknowledgment: true,
  remind_hourly: true,
  urgent: false,
  category: "general",
  target_student_ids: [child],
  ...overrides,
});
const publish = async (v: any = payload(), user = director) =>
  (
    await acting(user, () =>
      q("select save_announcement($1::jsonb) as id", [JSON.stringify(v)]),
    )
  ).rows[0].id;
const pending = async (user = mother) =>
  (
    await acting(user, () =>
      q("select pending_announcements($1) as value", [school]),
    )
  ).rows[0].value;
const read = async (aid = id(1500), agree = false, user = mother) =>
  acting(user, () =>
    q("select read_announcement($1,$2) as value", [aid, agree]),
  );
async function due() {
  await q(
    "update announcement_receipts set next_reminder_at=now()-interval '1 minute'",
  );
  return q("select aulanexo_private.send_announcement_reminders() as count");
}
describe("Avisos obligatorios y destinatarios", () => {
  it("publica para los padres seleccionados y oculta el aviso a familias de otros niños", async () => {
    await q(
      "update students set mother_email='ops-stranger@test.bo',father_email='otro@test.bo' where id=$1",
      [otherChild],
    );
    await publish();
    expect((await pending()).map((n: any) => n.id)).toContain(id(1500));
    expect(
      (await as(stranger, () => q("select * from announcements"))).rows,
    ).toHaveLength(0);
    await expect(
      as(mother, () => q("select announcement_report($1)", [id(1500)])),
    ).rejects.toThrow("Solo Dirección");
  });
  it("un docente solo publica en sus aulas y valida la selección de niños", async () => {
    await publish(payload(), teacher);
    await expect(
      publish(payload({ id: id(1501), classroom_id: otherRoom }), teacher),
    ).rejects.toThrow("Solo Dirección");
    await expect(
      publish(payload({ id: id(1502), target_student_ids: [otherChild] })),
    ).rejects.toThrow("deben estar activos");
    await expect(
      publish(payload({ id: id(1503), classroom_id: null })),
    ).rejects.toThrow("Selecciona");
  });
  it("abrir no acepta: exige una confirmación explícita y la registra en una única cuenta", async () => {
    await publish();
    await read();
    let value = (await pending())[0];
    expect(value.readAt).toBeTruthy();
    expect(value.acknowledgedAt).toBeNull();
    await read(id(1500), true);
    expect(await pending()).toEqual([]);
    const rows = (
      await q(
        "select * from announcement_receipts where announcement_id=$1 order by user_id",
        [id(1500)],
      )
    ).rows;
    expect(rows.find((r) => r.user_id === mother).acknowledged_at).toBeTruthy();
    expect(rows.find((r) => r.user_id === father).acknowledged_at).toBeNull();
    await read(id(1500), true);
    expect(
      (
        await q(
          "select * from announcement_receipts where announcement_id=$1 and user_id=$2",
          [id(1500), mother],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("genera recordatorios por hora, no los duplica, y se detienen tras aceptar", async () => {
    await publish(payload({ category: "health", urgent: true }));
    await read();
    await due();
    expect(
      (
        await q(
          "select * from notifications where kind like 'announcement_reminder_%' and user_id=$1",
          [mother],
        )
      ).rows,
    ).toHaveLength(1);
    await due();
    expect(
      (
        await q(
          "select * from notifications where kind like 'announcement_reminder_%' and user_id=$1",
          [mother],
        )
      ).rows,
    ).toHaveLength(1);
    await read(id(1500), true);
    await q("select aulanexo_private.send_announcement_reminders()");
    expect(
      (
        await q(
          "select next_reminder_at from announcement_receipts where user_id=$1 and announcement_id=$2",
          [mother, id(1500)],
        )
      ).rows[0].next_reminder_at,
    ).toBeNull();
  });
  it("un aviso opcional deja de recordar al leerlo sin exigir aceptar", async () => {
    await publish(
      payload({
        requires_acknowledgment: false,
        category: "health",
        urgent: true,
      }),
    );
    expect((await pending())[0].requiresAcknowledgment).toBe(false);
    await read();
    expect(await pending()).toEqual([]);
    await due();
    expect(
      (
        await q(
          "select * from notifications where kind like 'announcement_reminder_%' and user_id=$1",
          [mother],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("permite avisos críticos con deuda sin desbloquear contenido académico", async () => {
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Mensualidad',current_date-1,500,'overdue')",
      [school, child],
    );
    await publish();
    expect(await pending()).toHaveLength(1);
    expect(
      (
        await as(mother, () =>
          q("select family_access($1) as allowed", [child]),
        )
      ).rows[0].allowed,
    ).toBe(false);
    await read(id(1500), true);
  });
  it("bloquea confirmaciones ajenas, escrituras directas y cambios del contenido aceptado", async () => {
    await publish();
    await expect(
      as(teacher, () => q("select read_announcement($1,true)", [id(1500)])),
    ).rejects.toThrow("cuenta destinataria");
    await expect(
      as(mother, () =>
        q("update announcement_receipts set acknowledged_at=now()"),
      ),
    ).rejects.toThrow();
    await expect(
      as(director, () =>
        q("update announcements set content='Otro texto' where id=$1", [
          id(1500),
        ]),
      ),
    ).rejects.toThrow("conserva su contenido");
  });
  it("retirar el aviso cancela las confirmaciones y envíos pendientes", async () => {
    await publish();
    await acting(director, () =>
      q("select withdraw_announcement($1)", [id(1500)]),
    );
    expect(await pending()).toEqual([]);
    expect(
      (
        await q(
          "select next_reminder_at from announcement_receipts where announcement_id=$1",
          [id(1500)],
        )
      ).rows.every((r) => r.next_reminder_at === null),
    ).toBe(true);
  });
  it("revocar el vínculo de la madre impide leer, aceptar y recibir recordatorios", async () => {
    await publish(payload({ urgent: true, category: "health" }));
    await q(
      "update students set mother_email='reemplazo@test.bo' where id=$1",
      [child],
    );
    expect(await pending()).toEqual([]);
    await expect(read()).rejects.toThrow("cuenta destinataria");
    await due();
    expect(
      (
        await q(
          "select * from notifications where kind like 'announcement_reminder_%' and user_id=$1",
          [mother],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("las categorías se asignan en servidor y el portal infantil excluye salud y consentimiento", async () => {
    await publish(payload({ category: "health", urgent: true }));
    expect(
      (
        await q(
          "select alert_type from notifications where kind='announcement' and source_id=$1",
          [id(1500)],
        )
      ).rows.every((n) => n.alert_type === "health"),
    ).toBe(true);
    const portal = (await as(kid, () => q("select student_portal() as value")))
      .rows[0].value;
    expect(portal.announcements).toEqual([]);
  });
  it("respeta 22:00–07:00 Bolivia y solo una urgencia evita la espera", async () => {
    for (const [at, urgent, expected] of [
      ["2026-10-21T02:00:00Z", false, "2026-10-21T11:00:00.000Z"],
      ["2026-10-21T10:59:00Z", false, "2026-10-21T11:00:00.000Z"],
      ["2026-10-21T11:00:00Z", false, "2026-10-21T11:00:00.000Z"],
      ["2026-10-21T03:00:00Z", true, "2026-10-21T03:00:00.000Z"],
    ] as const) {
      const result = (
        await q(
          "select aulanexo_private.announcement_delivery_at($1,$2) as due",
          [at, urgent],
        )
      ).rows[0].due;
      expect(new Date(result).toISOString()).toBe(expected);
    }
  });
  it("conserva evidencia y rechaza cambiar destinatarios usando la misma solicitud", async () => {
    await publish();
    await expect(publish(payload({ target_student_ids: [] }))).rejects.toThrow(
      "ya fue publicado",
    );
    await as(director, () =>
      q("delete from announcements where id=$1", [id(1500)]),
    );
    expect(
      (await q("select id from announcements where id=$1", [id(1500)])).rows,
    ).toHaveLength(1);
    await expect(
      q("delete from announcements where id=$1", [id(1500)]),
    ).rejects.toThrow("historial");
  });
  it("el enlace push abre un aviso con deuda sin aceptar ni exponer datos personales", async () => {
    await publish();
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Mensualidad',current_date-1,500,'overdue')",
      [school, child],
    );
    const nid = (
      await q(
        "select id from notifications where source_id=$1 and user_id=$2",
        [id(1500), mother],
      )
    ).rows[0].id;
    const result = (
      await acting(mother, () =>
        q("select resolve_push_notification($1) as value", [nid]),
      )
    ).rows[0].value;
    expect(result).toMatchObject({
      announcementId: id(1500),
      schoolId: school,
      target: "announcements",
    });
    expect(
      (
        await q(
          "select acknowledged_at from announcement_receipts where user_id=$1",
          [mother],
        )
      ).rows[0].acknowledged_at,
    ).toBeNull();
  });

  it("el estudiante abre avisos académicos de lectura sin acceder a consentimientos ni datos privados", async () => {
    await publish(
      payload({ requires_acknowledgment: false, category: "academic" }),
    );
    const nid = (
      await q(
        "select id from notifications where source_id=$1 and user_id=$2",
        [id(1500), kid],
      )
    ).rows[0].id;
    const result = (
      await acting(kid, () =>
        q("select resolve_push_notification($1) as value", [nid]),
      )
    ).rows[0].value;
    expect(result).toEqual({
      schoolId: school,
      studentId: child,
      target: "announcements",
    });
    await expect(
      as(kid, () => q("select announcement_view($1)", [id(1500)])),
    ).rejects.toThrow("no está disponible");
    expect(
      (
        await q(
          "select next_reminder_at from announcement_receipts where user_id=$1",
          [kid],
        )
      ).rows[0].next_reminder_at,
    ).toBeNull();
  });

  it("soporte puede revisar el aviso pero nunca confirmar por una madre o un padre", async () => {
    await publish();
    const support = (
      await acting(owner, () =>
        q("select start_support_session($1,$2,$3,$4) as value", [
          school,
          mother,
          "guardian",
          "Revisar confirmaciones sin aceptar por la familia",
        ]),
      )
    ).rows[0].value.id;
    const view = (
      await as(
        owner,
        () => q("select announcement_view($1) as value", [id(1500)]),
        support,
      )
    ).rows[0].value;
    expect(view.canAcknowledge).toBe(false);
    expect(
      (
        await as(
          owner,
          () => q("select pending_announcements($1) as value", [school]),
          support,
        )
      ).rows[0].value,
    ).toEqual([]);
    await expect(
      as(
        owner,
        () => q("select read_announcement($1,true)", [id(1500)]),
        support,
      ),
    ).rejects.toThrow("cuenta destinataria");
    expect(
      (
        await q(
          "select acknowledged_at from announcement_receipts where user_id=$1",
          [mother],
        )
      ).rows[0].acknowledged_at,
    ).toBeNull();
  });
});
