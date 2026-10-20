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
const question = {
  key: "favorite",
  label: "Color favorito",
  section: "Otros",
  type: "select",
  required: true,
  options: ["Azul", "Verde"],
};
const template = (fields: any[] = [question]) => ({
  title: "Ficha por gestión",
  instructions: "Condiciones solo informativas",
  fields,
});
async function saveTemplate(fields: any[] = [question], revision = 0) {
  return acting(director, () =>
    q("select save_admission_template($1,2026,$2::jsonb,$3) as value", [
      school,
      JSON.stringify(template(fields)),
      revision,
    ]),
  );
}
const profile = (answers: any = { favorite: "Azul" }) => ({
  allergies: "Ninguna",
  foodRestrictions: "Ninguna",
  emergencyContact: "Abuela",
  emergencyPhone: "70000000",
  secondEmergencyContact: "",
  secondEmergencyPhone: "",
  hasInsurance: false,
  admissionDetails: {
    fields: {
      homeAddress: "Dirección ficticia",
      pickup1Name: "Tía de prueba",
      pickup1Identity: "CI-FICTICIO",
      pickup1Relationship: "Tía",
    },
    customAnswers: answers,
  },
});
async function token() {
  return (
    await acting(director, () =>
      q("select create_family_intake($1,'mother') as value", [child]),
    )
  ).rows[0].value;
}
async function importEvents(
  events: any[],
  requestId = id(900),
  classroom: string | null = room,
  year = 2026,
  user = director,
) {
  return acting(user, () =>
    q("select confirm_calendar_import($1,$2,$3,$4,$5,$6::jsonb) as value", [
      requestId,
      school,
      year,
      classroom,
      "a".repeat(64),
      JSON.stringify(events),
    ]),
  );
}
const event = (date = "2026-11-01", endDate = "") => ({
  title: "Feria de ciencias",
  date,
  endDate,
  description: "Actividad curricular",
});
describe("Formularios, emergencia e importación confirmada", () => {
  it("permite publicar a Dirección, bloquea docentes, familias, estudiantes y dueño sin soporte", async () => {
    await saveTemplate();
    for (const user of [teacher, mother, kid, owner, stranger])
      await expect(
        as(user, () =>
          q("select save_admission_template($1,2026,$2::jsonb,0)", [
            school,
            JSON.stringify(template()),
          ]),
        ),
      ).rejects.toThrow("Solo Dirección");
    expect(
      (await as(teacher, () => q("select * from admission_templates"))).rows,
    ).toHaveLength(0);
  });
  it("rechaza edición con una revisión antigua y claves repetidas", async () => {
    await saveTemplate();
    await expect(saveTemplate([], 0)).rejects.toThrow("actualizado");
    await expect(saveTemplate([question, question], 1)).rejects.toThrow(
      "preguntas",
    );
  });
  it("el enlace público expone preguntas, nunca las respuestas de salud ya guardadas", async () => {
    await saveTemplate();
    await q("update students set admission_details=$2::jsonb where id=$1", [
      child,
      JSON.stringify({ fields: { homeAddress: "SECRETO" } }),
    ]);
    const t = await token();
    const result = (
      await as(
        null,
        () => q("select family_intake_context($1) as value", [t]),
        undefined,
        "anon",
      )
    ).rows[0].value;
    expect(result.template.fields[0].label).toBe("Color favorito");
    expect(JSON.stringify(result)).not.toContain("SECRETO");
    await expect(
      as(null, () => q("select * from admission_templates"), undefined, "anon"),
    ).rejects.toThrow();
  });
  it("conserva la versión compartida aunque cambie el formulario antes de enviar y aprobar", async () => {
    await saveTemplate();
    const t = await token();
    await saveTemplate(
      [{ ...question, key: "new_question", label: "Pregunta nueva" }],
      1,
    );
    await acting(mother, () =>
      q("select submit_family_intake($1,$2::jsonb)", [
        t,
        JSON.stringify(profile()),
      ]),
    );
    const f = (
      await q(
        "select id from family_intake_forms where student_id=$1 and status='submitted'",
        [child],
      )
    ).rows[0];
    await acting(director, () =>
      q("select review_family_intake($1,true)", [f.id]),
    );
    const value = (
      await q("select admission_details from students where id=$1", [child])
    ).rows[0].admission_details;
    expect(value.template.fields[0].key).toBe("favorite");
    expect(value.customAnswers.favorite).toBe("Azul");
    expect(value.fields.pickup1Identity).toBe("CI-FICTICIO");
  });
  it("valida respuestas obligatorias y opciones también en el envío público", async () => {
    await saveTemplate();
    const t = await token();
    await expect(
      as(
        null,
        () =>
          q("select submit_family_intake($1,$2::jsonb)", [
            t,
            JSON.stringify(profile({})),
          ]),
        undefined,
        "anon",
      ),
    ).rejects.toThrow("Completa");
    await expect(
      as(
        null,
        () =>
          q("select submit_family_intake($1,$2::jsonb)", [
            t,
            JSON.stringify(profile({ favorite: "Inventado" })),
          ]),
        undefined,
        "anon",
      ),
    ).rejects.toThrow("opción válida");
  });
  it("permite completar cuidados ampliados y rechaza autorizados sin CI y declaraciones sin firmante", async () => {
    await saveTemplate();
    await acting(mother, () =>
      q("select complete_student_profile($1,$2::jsonb)", [
        child,
        JSON.stringify(profile()),
      ]),
    );
    const p = profile();
    p.admissionDetails.fields.pickup1Identity = "";
    await expect(
      as(mother, () =>
        q("select complete_student_profile($1,$2::jsonb)", [
          child,
          JSON.stringify(p),
        ]),
      ),
    ).rejects.toThrow("nombre, CI");
    const p2: any = profile();
    p2.admissionDetails.fields.emergencyAuthorization = "Sí";
    await expect(
      as(mother, () =>
        q("select complete_student_profile($1,$2::jsonb)", [
          child,
          JSON.stringify(p2),
        ]),
      ),
    ).rejects.toThrow("quien declara");
  });
  it("importa rangos y evita duplicados, incluido un reintento de la misma confirmación", async () => {
    const first = await importEvents([event("2026-11-01", "2026-11-03")]);
    expect(first.rows[0].value.added).toBe(1);
    expect(
      (await importEvents([event("2026-11-01", "2026-11-03")])).rows[0].value
        .alreadyConfirmed,
    ).toBe(true);
    expect(
      (await importEvents([event("2026-11-01", "2026-11-03")], id(901))).rows[0]
        .value.skipped,
    ).toBe(1);
    expect((await q("select * from calendar_events")).rows).toHaveLength(1);
    const portal=(await as(kid,()=>q("select student_portal() as value"))).rows[0].value;
    expect(portal.events[0].endDate).toBe("2026-11-03");
  });
  it("una fecha inválida revierte el lote completo y no deja importaciones parciales", async () => {
    await expect(
      importEvents([event(), event("2026-02-29")]),
    ).rejects.toThrow();
    expect((await q("select * from calendar_events")).rows).toHaveLength(0);
    expect((await q("select * from document_imports")).rows).toHaveLength(0);
    await expect(importEvents([event("2025-11-01")])).rejects.toThrow(
      "gestión",
    );
  });
  it("bloquea publicación en aulas de otro colegio o gestión y por roles de lectura", async () => {
    await q(
      "insert into classrooms(id,school_id,name,academic_year) values($1,$2,'Aula 2027',2027)",
      [id(700), school],
    );
    await expect(importEvents([event()], id(903), id(700))).rejects.toThrow(
      "gestión",
    );
    for (const user of [teacher, mother, kid, owner])
      await expect(
        importEvents([event()], id(904), room, 2026, user),
      ).rejects.toThrow("Solo Dirección");
    await expect(importEvents([event()], id(905), id(777))).rejects.toThrow(
      "aula",
    );
  });
  it("limita llamadas a Gemini por usuario y no ofrece la reserva a anónimos", async () => {
    for (let i = 0; i < 30; i++)
      await acting(director, () =>
        q("select reserve_document_analysis($1)", [school]),
      );
    await expect(
      as(director, () => q("select reserve_document_analysis($1)", [school])),
    ).rejects.toThrow("límite diario");
    await expect(
      as(teacher, () => q("select reserve_document_analysis($1)", [school])),
    ).rejects.toThrow("Solo Dirección");
    await expect(
      as(
        null,
        () => q("select reserve_document_analysis($1)", [school]),
        undefined,
        "anon",
      ),
    ).rejects.toThrow();
  });
});
