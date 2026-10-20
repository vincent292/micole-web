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
const newCharge = async (amount = 200) => {
  await q(
    "insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Mensualidad',current_date-1,$4)",
    [id(2400), school, child, amount],
  );
  return id(2400);
};
const evidence = async (method = "deposit", invoice: any = {}) => {
  const charge = await newCharge();
  await acting(mother, () =>
    q(
      "select create_payment_submission($1,$2,$3::jsonb,$4,$5,current_date,$6::jsonb)",
      [
        id(2401),
        child,
        JSON.stringify([{ chargeId: charge, amount: 80 }]),
        method,
        "DEP-TEST",
        JSON.stringify(invoice),
      ],
    ),
  );
  const file = (
    await acting(mother, () =>
      q(
        "select reserve_financial_file('payment_evidence',$1,'comprobante.pdf','application/pdf',30) as value",
        [id(2401)],
      ),
    )
  ).rows[0].value;
  await q("select finish_financial_file($1,30,'application/pdf',$2)", [
    file.id,
    school + "/finance/ready/" + file.id + "/document.pdf",
  ]);
  await acting(mother, () =>
    q("select submit_payment_submission($1)", [id(2401)]),
  );
  return { charge, file };
};
describe("Consulta y documentos financieros privados", () => {
  it("impide modificar directamente el historial por API", async () => {
    await expect(
      as(mother, () => q("insert into content_view_events default values")),
    ).rejects.toThrow();
    await expect(
      as(mother, () => q("delete from content_view_events")),
    ).rejects.toThrow();
  });
  it("presentar un depósito no marca cuotas pagadas; aprobar una vez genera recibo y factura", async () => {
    const { charge } = await evidence("deposit", {
      invoiceName: "Madre Prueba",
      invoiceNit: "1234567",
      invoicePhone: "70000000",
    });
    expect(
      (await q("select paid_amount from school_charges where id=$1", [charge]))
        .rows[0].paid_amount,
    ).toBe("0.00");
    await acting(director, () =>
      q("select review_payment_submission($1,true,'Verificado en banco')", [
        id(2401),
      ]),
    );
    await acting(director, () =>
      q("select review_payment_submission($1,true,'Verificado en banco')", [
        id(2401),
      ]),
    );
    expect(
      (await q("select paid_amount from school_charges where id=$1", [charge]))
        .rows[0].paid_amount,
    ).toBe("80.00");
    expect(
      (
        await q(
          "select payment_method,total from school_receipts where id=$1",
          [id(2401)],
        )
      ).rows[0],
    ).toEqual({ payment_method: "deposit", total: "80.00" });
    expect(
      (
        await q(
          "select amount,status from invoice_requests where receipt_id=$1",
          [id(2401)],
        )
      ).rows,
    ).toEqual([{ amount: "80.00", status: "pending" }]);
  });
  it("una familia, otro colegio y un docente no aprueban; rechazar exige motivo y no cambia saldos", async () => {
    await evidence();
    for (const user of [mother, stranger, teacher])
      await expect(
        as(user, () =>
          q("select review_payment_submission($1,true)", [id(2401)]),
        ),
      ).rejects.toThrow("Solo Dirección");
    await expect(
      acting(director, () =>
        q("select review_payment_submission($1,false,'')", [id(2401)]),
      ),
    ).rejects.toThrow("por qué");
    await acting(director, () =>
      q("select review_payment_submission($1,false,'No aparece el ingreso')", [
        id(2401),
      ]),
    );
    expect(
      (await q("select * from school_receipts where id=$1", [id(2401)])).rows,
    ).toHaveLength(0);
  });
  it("requiere archivo listo y bloquea falsificar su finalización desde una cuenta de familia", async () => {
    const charge = await newCharge();
    await acting(mother, () =>
      q(
        "select create_payment_submission($1,$2,$3::jsonb,$4,$5,current_date)",
        [
          id(2401),
          child,
          JSON.stringify([{ chargeId: charge, amount: 80 }]),
          "deposit",
          "DEP-TEST",
        ],
      ),
    );
    await expect(
      acting(mother, () =>
        q("select submit_payment_submission($1)", [id(2401)]),
      ),
    ).rejects.toThrow("Adjunta");
    await expect(
      as(mother, () =>
        q("select finish_financial_file($1,30,'application/pdf','x')", [
          id(2500),
        ]),
      ),
    ).rejects.toThrow();
  });
  it("solo los padres vinculados leen el comprobante y Dirección adjunta facturas", async () => {
    const { file } = await evidence();
    expect(
      (
        await as(father, () =>
          q("select may_read_financial_file($1) as ok", [file.id]),
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await as(stranger, () =>
          q("select may_read_financial_file($1) as ok", [file.id]),
        )
      ).rows[0].ok,
    ).toBe(false);
    await expect(
      as(mother, () =>
        q(
          "select reserve_financial_file('invoice',$1,'f.pdf','application/pdf',30)",
          [id(2401)],
        ),
      ),
    ).rejects.toThrow("Solo Dirección");
  });
  it("el estado de cuenta incluye abonos y saldos y solo lo ven Dirección y los padres", async () => {
    await evidence();
    await acting(director, () =>
      q("select review_payment_submission($1,true)", [id(2401)]),
    );
    const result = (
      await as(mother, () =>
        q("select student_account_statement($1) as value", [child]),
      )
    ).rows[0].value;
    expect(result.charges[0]).toMatchObject({
      amount: 200,
      paidAmount: 80,
      balance: 120,
    });
    expect(result.receipts).toHaveLength(1);
    await expect(
      as(stranger, () => q("select student_account_statement($1)", [child])),
    ).rejects.toThrow("familia vinculada");
    await expect(
      as(kid, () => q("select student_account_statement($1)", [child])),
    ).rejects.toThrow();
  });
  it("la vista es idempotente, autorizada y solo personal puede consultar el reporte", async () => {
    await acting(teacher, () =>
      q(
        "insert into grades(id,school_id,student_id,subject,period,score,recommendation) values($1,$2,$3,'Lectura','Octubre','A','Buen avance')",
        [id(2500), school, child],
      ),
    );
    await acting(mother, () =>
      q("select record_content_view($1,'grade',$2,'web')", [
        id(2501),
        id(2500),
      ]),
    );
    await acting(mother, () =>
      q("select record_content_view($1,'grade',$2,'web')", [
        id(2501),
        id(2500),
      ]),
    );
    expect((await q("select * from content_view_events")).rows).toHaveLength(1);
    await expect(
      as(stranger, () =>
        q("select record_content_view($1,'grade',$2,'web')", [
          id(2502),
          id(2500),
        ]),
      ),
    ).rejects.toThrow("no está disponible");
    await expect(
      as(mother, () =>
        q("select content_view_report($1,current_date,current_date)", [school]),
      ),
    ).rejects.toThrow("docentes");
    const report = (
      await as(teacher, () =>
        q("select content_view_report($1,current_date,current_date) as value", [
          school,
        ]),
      )
    ).rows[0].value;
    expect(report.total).toBe(1);
    expect(report.rows[0]).toMatchObject({
      viewerRole: "guardian",
      kind: "grade",
      studentId: child,
    });
  });
  it("facturas privadas solo se descargan tras la emisión, aun con deuda, y conservan el archivo final", async () => {
    await evidence("deposit", {
      invoiceName: "Madre Prueba",
      invoiceNit: "1234567",
      invoicePhone: "70000000",
    });
    await acting(director, () =>
      q("select review_payment_submission($1,true)", [id(2401)]),
    );
    const invoice = (
      await q("select id from invoice_requests where receipt_id=$1", [id(2401)])
    ).rows[0].id;
    await expect(
      as(mother, () =>
        q(
          "select reserve_financial_file('invoice',$1,'factura.pdf','application/pdf',30)",
          [invoice],
        ),
      ),
    ).rejects.toThrow("Solo Dirección");
    const f = (
      await acting(director, () =>
        q(
          "select reserve_financial_file('invoice',$1,'factura.pdf','application/pdf',30) as value",
          [invoice],
        ),
      )
    ).rows[0].value;
    await q("select finish_financial_file($1,30,'application/pdf',$2)", [
      f.id,
      school + "/finance/ready/" + f.id + "/final.pdf",
    ]);
    expect(
      (
        await as(mother, () =>
          q("select may_read_financial_file($1) as ok", [f.id]),
        )
      ).rows[0].ok,
    ).toBe(false);
    await acting(director, () =>
      q("select mark_invoice_issued($1,'FACT-001')", [invoice]),
    );
    expect(
      (
        await as(mother, () =>
          q("select may_read_financial_file($1) as ok", [f.id]),
        )
      ).rows[0].ok,
    ).toBe(true);
    await acting(mother, () =>
      q("select record_content_view($1,'invoice',$2,'web','download')", [
        id(2501),
        f.id,
      ]),
    );
    expect(
      (
        await q(
          "select kind from notifications where kind='payment_invoice_ready'",
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await q(
          "select finish_financial_file($1,30,'application/pdf',$2) as ok",
          [f.id, school + "/finance/ready/" + f.id + "/replacement.pdf"],
        )
      ).rows[0].ok,
    ).toBe(false);
    const register = (
      await as(mother, () => q("select finance_register() as value"))
    ).rows[0].value;
    expect(register.invoices[0].files[0].id).toBe(f.id);
  });
  it("si cambió un saldo antes de aprobar no aplica un monto excesivo ni marca el comprobante como aprobado", async () => {
    const { charge } = await evidence();
    await acting(director, () =>
      q("select checkout_school_payment($1,$2,$3::jsonb,$4,$5)", [
        id(2502),
        child,
        JSON.stringify([{ chargeId: charge, amount: 150 }]),
        "cash",
        "CAJA-TEST",
      ]),
    );
    await expect(
      acting(director, () =>
        q("select review_payment_submission($1,true)", [id(2401)]),
      ),
    ).rejects.toThrow("saldo pendiente");
    expect(
      (
        await q("select status from payment_submissions where id=$1", [
          id(2401),
        ])
      ).rows[0].status,
    ).toBe("pending");
  });
  it("el docente solo ve consultas de sus aulas y una deuda bloquea registrar vistas académicas", async () => {
    await acting(director, () =>
      q(
        "insert into grades(id,school_id,student_id,subject,period,score,recommendation) values($1,$2,$3,'Lectura','Octubre','A','Buen avance')",
        [id(2500), school, otherChild],
      ),
    );
    await acting(mother, () =>
      q("select record_content_view($1,'grade',$2,'web')", [
        id(2501),
        id(2500),
      ]),
    );
    expect(
      (
        await as(teacher, () =>
          q(
            "select content_view_report($1,current_date,current_date) as value",
            [school],
          ),
        )
      ).rows[0].value.total,
    ).toBe(0);
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Mensualidad',current_date-1,200)",
      [school, otherChild],
    );
    await expect(
      as(mother, () =>
        q("select record_content_view($1,'grade',$2,'web')", [
          id(2502),
          id(2500),
        ]),
      ),
    ).rejects.toThrow("no está disponible");
  });
  it("el reporte de consentimiento incluye al padre o madre que aún no vinculó su cuenta", async () => {
    await q(
      "update students set mother_email='madre-nueva@test.bo' where id=$1",
      [child],
    );
    await publish();
    const result = (
      await as(director, () =>
        q("select announcement_report($1) as value", [id(1500)]),
      )
    ).rows[0].value;
    expect(
      result.find((r: any) => r.email === "madre-nueva@test.bo"),
    ).toMatchObject({
      accountPending: true,
      acknowledgedAt: null,
      children: ["Lucía Prueba"],
    });
  });
  it("el estudiante registra la consulta del cuaderno de tareas sin acceder a finanzas", async () => {
    await acting(kid, () =>
      q("select record_content_view($1,'daily',$2,'android')", [
        id(2500),
        child,
      ]),
    );
    expect(
      (await q("select viewer_role,content_kind from content_view_events"))
        .rows,
    ).toEqual([{ viewer_role: "student", content_kind: "daily" }]);
  });
 it('el aviso de comprobante revisado abre Caja aunque la familia siga con deuda',async()=>{await evidence();await acting(director,()=>q('select review_payment_submission($1,true)',[id(2401)]));const n=(await q("select id from notifications where kind='payment_evidence_reviewed' and user_id=$1",[mother])).rows[0].id;expect((await as(mother,()=>q('select family_access($1) as ok',[child]))).rows[0].ok).toBe(false);expect((await q('select aulanexo_private.push_notice_visible($1) as ok',[n])).rows[0].ok).toBe(true);expect((await q("select aulanexo_private.push_category('payment_invoice_ready') as value")).rows[0].value).toBe('payments');const target=(await as(mother,()=>q('select resolve_push_notification($1) as value',[n]))).rows[0].value;expect(target).toMatchObject({target:'cash',studentId:child});await expect(as(stranger,()=>q('select resolve_push_notification($1)',[n]))).rejects.toThrow();});

});
