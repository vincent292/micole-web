import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { buildSchedule } from "../src/lib/billing";
import type { PaymentPlan } from "../src/lib/types";
const db = new PGlite();
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1),
  director = id(2),
  teacher = id(3),
  guardian = id(4),
  stranger = id(5),
  director2 = id(6),
  teacher2 = id(7);
const school = id(20),
  otherSchool = id(21),
  room = id(30),
  room2 = id(31),
  student = id(40),
  otherStudent = id(41),
  secondStudent = id(42);
async function asUser<T>(user: string, fn: () => Promise<T>) {
  await db.exec("begin; set local role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon;create role service_role; create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
  alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  // PGlite tiene UUID y SHA-256 incorporados, sin instalar la extensión pgcrypto.
  for (const file of [
    "202610130001_initial.sql",
    "202610130002_workspace.sql",
    "202610130003_billing_cycle.sql",
    "202610130004_micole_operations.sql",
    "202610130005_invitation_lifecycle.sql",
    "202610140001_platform_support.sql",
    "202610140002_family_enrollment.sql",
    "202610140003_support_registered_parents.sql",
    "202610140004_financial_reports.sql",
    "202610140005_institution_identity.sql", "202610150001_student_access.sql",
  ])
    await db.exec(
      readFileSync(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ).replace("create extension if not exists pgcrypto;", ""),
    );
  for (const [user, email] of [
    [admin, "admin@test.bo"],
    [director, "director@test.bo"],
    [teacher, "teacher@test.bo"],
    [guardian, "guardian@test.bo"],
    [stranger, "stranger@test.bo"],
    [director2, "director2@test.bo"],
    [teacher2, "teacher2@test.bo"],
  ])
    await query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await query("insert into public.platform_admins(user_id) values($1)", [
    admin,
  ]);
  await query(
    "insert into schools(id,name,slug,status) values($1,'Colegio Uno','uno','active'),($2,'Colegio Dos','dos','active')",
    [school, otherSchool],
  );
  await query(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian'),($5,$6,'director'),($5,$7,'teacher')",
    [school, director, teacher, guardian, otherSchool, director2, teacher2],
  );
  await query(
    "insert into classrooms(id,school_id,name) values($1,$2,'Nidito'),($3,$4,'Kinder')",
    [room, school, room2, otherSchool],
  );
  await query(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente Uno','teacher@test.bo','active'),($4,$5,$6,'Docente Dos','teacher2@test.bo','active')",
    [id(50), school, teacher, id(51), otherSchool, teacher2],
  );
  await query(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3),($4,$5,$6)",
    [school, id(50), room, otherSchool, id(51), room2],
  );
  await query(
    "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete) values($1,$2,$3,'Niña','Uno','active',true),($4,$5,$6,'Niño','Dos','active',true),($7,$2,$3,'Niña','Tres','active',true)",
    [student, school, room, otherStudent, otherSchool, room2, secondStudent],
  );
  await query(
    "insert into student_guardians(student_id,user_id,relationship,verified_at) values($1,$2,'mother',now())",
    [student, guardian],
  );
  await query("select set_config('request.jwt.claim.sub',$1,false)", [
    director,
  ]);
  await query(
    "insert into daily_entries(school_id,student_id,category,note) values($1,$2,'actividad','Privado Uno'),($3,$4,'actividad','Privado Dos')",
    [school, student, otherSchool, otherStudent],
  );
  await query(
    "update students set father_email='stranger@test.bo',father_name='Padre Tres' where id=$1",
    [secondStudent],
  );
  await query("select set_config('request.jwt.claim.sub','',false)");
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("migraciones, RLS y operaciones reales", () => {
  it("limita estudiante y cuaderno al vínculo familiar verificado", async () => {
    const result = await asUser(guardian, async () => ({
      students: (await query("select id from students")).rows,
      entries: (await query("select note from daily_entries")).rows,
    }));
    expect(result.students).toEqual([{ id: student }]);
    expect(result.entries).toEqual([{ note: "Privado Uno" }]);
    expect(
      (await asUser(stranger, () => query("select id from students"))).rows,
    ).toEqual([]);
  });
  it("limita dirección y docentes a su institución y aulas", async () => {
    expect(
      (await asUser(director, () => query("select id from students"))).rows,
    ).toHaveLength(2);
    expect(
      (await asUser(teacher, () => query("select id from students"))).rows,
    ).toHaveLength(2);
    expect(
      (await asUser(teacher2, () => query("select id from students"))).rows,
    ).toEqual([{ id: otherStudent }]);
    await expect(
      asUser(teacher, () =>
        query(
          "insert into daily_entries(school_id,student_id,category,note) values($1,$2,'actividad','Intento')",
          [otherSchool, otherStudent],
        ),
      ),
    ).rejects.toThrow();
  });
  it("crea inscripción y activación en una transacción y valida la activación", async () => {
    const nextId = id(43);
    const payload = {
      id: nextId,
      school_id: school,
      classroom_id: room,
      first_name: "Nueva",
      last_name: "Niña",
      birth_date: "2023-01-01",
      monthly_fee: 420,
      identity_number: "CI-NUEVA-43",
      mother_name: "Madre Nueva",
      mother_email: "new-mother@test.bo",
      father_name: "Padre Nuevo",
      father_email: "new-father@test.bo",
    };
    await asUser(director, () =>
      query("select enroll_student($1::jsonb)", [JSON.stringify(payload)]),
    );
    const activation = (
      await query<{ id: string; amount: string }>(
        "select id,amount from platform_charges where student_id=$1",
        [nextId],
      )
    ).rows[0];
    expect(Number(activation.amount)).toBe(50);
    await expect(
      asUser(director, () =>
        query("select set_student_status($1,'active')", [nextId]),
      ),
    ).rejects.toThrow(/activación/);
    await asUser(admin, () =>
      query("select record_platform_payment($1,'transfer','ACT-1')", [
        activation.id,
      ]),
    );
    await asUser(director, () =>
      query("select set_student_status($1,'active')", [nextId]),
    );
    await expect(
      asUser(director, () =>
        query("select enroll_student($1::jsonb)", [
          JSON.stringify({ ...payload, id: id(44), classroom_id: room2 }),
        ]),
      ),
    ).rejects.toThrow();
    expect(
      (await query("select id from students where id=$1", [id(44)])).rows,
    ).toEqual([]);
  });
  it("calcula cuotas igual que React, protege duplicados y registra pagos idempotentes", async () => {
    const plan: PaymentPlan = {
      id: id(60),
      schoolId: school,
      studentId: student,
      startDate: "2026-10-17",
      months: 3,
      monthlyFee: 420,
      snackFee: 60,
      enrollmentFee: 200,
      dueDay: 10,
      discount: 50,
      discountFrom: "2026-10-01",
      discountTo: "2026-11-30",
      prorate: true,
      createdAt: "2026-10-13",
    };
    const payload = {
      id: plan.id,
      school_id: school,
      student_id: student,
      start_date: plan.startDate,
      months: 3,
      monthly_fee: 420,
      snack_fee: 60,
      enrollment_fee: 200,
      due_day: 10,
      discount: 50,
      discount_from: plan.discountFrom,
      discount_to: plan.discountTo,
      prorate: true,
    };
    await asUser(director, () =>
      query("select create_payment_plan($1::jsonb)", [JSON.stringify(payload)]),
    );
    const charges = (
      await query<{ id: string; amount: string; due_date: string }>(
        "select id,amount,due_date from school_charges where plan_id=$1 order by due_date,concept",
        [plan.id],
      )
    ).rows;
    expect(charges.map((c) => Number(c.amount))).toEqual(
      buildSchedule(plan, () => "").map((c) => c.amount),
    );
    await expect(
      asUser(director, () =>
        query("select create_payment_plan($1::jsonb)", [
          JSON.stringify({ ...payload, id: id(61) }),
        ]),
      ),
    ).rejects.toThrow(/Ya existen cuotas/);
    expect(
      (await query("select id from payment_plans where id=$1", [id(61)])).rows,
    ).toHaveLength(0);
    await asUser(director, () =>
      query("select record_school_payment($1,'cash','REC-1')", [charges[0].id]),
    );
    await asUser(director, () =>
      query("select record_school_payment($1,'cash','REC-1')", [charges[0].id]),
    );
    expect(
      (
        await query("select id from school_payments where charge_id=$1", [
          charges[0].id,
        ])
      ).rows,
    ).toHaveLength(1);
    await expect(
      asUser(guardian, () =>
        query("update school_charges set status='paid' where id=$1", [
          charges[1].id,
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(director, () =>
        query("select record_school_payment($1,'qr','FAKE')", [charges[1].id]),
      ),
    ).rejects.toThrow(/QR/);
  });
  it("bloquea contenido por deuda en la base, mantiene pagos accesibles y respeta acceso temporal", async () => {
    const overdueId = id(70);
    await query(
      "insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Vencida',current_date-1,420)",
      [overdueId, school, student],
    );
    expect(
      (await asUser(guardian, () => query("select note from daily_entries")))
        .rows,
    ).toHaveLength(0);
    expect(
      (await asUser(guardian, () => query("select id from school_charges")))
        .rows.length,
    ).toBeGreaterThan(0);
    await query("update students set access_until=current_date+2 where id=$1", [
      student,
    ]);
    expect(
      (await asUser(guardian, () => query("select note from daily_entries")))
        .rows,
    ).toHaveLength(1);
    await query("update students set access_until=null where id=$1", [student]);
    await asUser(director, () =>
      query("select record_school_payment($1,'cash','REC-2')", [overdueId]),
    );
  });
  it("cancela cuotas futuras al retirar, conservando deuda histórica", async () => {
    await query(
      "insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Histórica',current_date-1,100),($1,$2,'Futura',current_date+90,100)",
      [school, secondStudent],
    );
    await asUser(director, () =>
      query("select set_student_status($1,'inactive')", [secondStudent]),
    );
    expect(
      (
        await query(
          "select concept,status from school_charges where student_id=$1 order by concept",
          [secondStudent],
        )
      ).rows,
    ).toEqual([
      { concept: "Futura", status: "cancelled" },
      { concept: "Histórica", status: "pending" },
    ]);
  });
  it("acepta invitaciones solo con el correo verificado y no permite escalar roles", async () => {
    const invite = {
      school_id: school,
      student_id: secondStudent,
      email: "stranger@test.bo",
      role: "guardian",
      relationship: "father",
    };
    const token = (
      await asUser(director, () =>
        query<{ create_invitation: string }>(
          "select create_invitation($1::jsonb)",
          [JSON.stringify(invite)],
        ),
      )
    ).rows[0].create_invitation;
    await expect(
      asUser(guardian, () => query("select claim_invitation($1)", [token])),
    ).rejects.toThrow(/correo/);
    await asUser(stranger, () => query("select claim_invitation($1)", [token]));
    await asUser(stranger, () => query("select claim_invitation($1)", [token]));
    expect(
      (await asUser(stranger, () => query("select id from students"))).rows,
    ).toEqual([{ id: secondStudent }]);
    await expect(
      asUser(director, () =>
        query("select create_invitation($1::jsonb)", [
          JSON.stringify({
            school_id: school,
            email: "stranger@test.bo",
            role: "director",
          }),
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(stranger, () =>
        query("insert into platform_admins(user_id) values($1)", [stranger]),
      ),
    ).rejects.toThrow();
  });
  it("sella la autoría de mensajes y protege el estado de solicitudes", async () => {
    await query("update students set access_until=current_date+5 where id=$1", [
      student,
    ]);
    const msg = await asUser(guardian, () =>
      query<{ author_id: string; author_role: string }>(
        "insert into messages(school_id,student_id,body,author_id,author_name,author_role) values($1,$2,'Hola',$3,'Directora','director') returning author_id,author_role",
        [school, student, director],
      ),
    );
    expect(msg.rows[0]).toEqual({
      author_id: guardian,
      author_role: "guardian",
    });
    const result = await asUser(guardian, () =>
      query<{ id: string }>(
        "insert into family_requests(school_id,student_id,type,request_date,reason) values($1,$2,'absence',current_date,'Médico') returning id",
        [school, student],
      ),
    );
    const requestId = result.rows[0].id;
    expect(
      (
        await asUser(guardian, () =>
          query(
            "update family_requests set status='approved',response='Sí' where id=$1 returning id",
            [requestId],
          ),
        )
      ).rows,
    ).toEqual([]);
    await asUser(teacher, () =>
      query(
        "update family_requests set status='approved',response='Gracias por avisar' where id=$1",
        [requestId],
      ),
    );
    await expect(
      asUser(teacher, () =>
        query("update family_requests set reason='Cambio' where id=$1", [
          requestId,
        ]),
      ),
    ).rejects.toThrow();
  });

  it("genera el corte recurrente sin duplicar y excluye alumnos de baja", async () => {
    await expect(
      asUser(director, () => query("select run_billing_cycle()")),
    ).rejects.toThrow(/Solo la plataforma/);
    const first = await asUser(admin, () =>
      query("select run_billing_cycle()"),
    );
    expect(first.rows).toHaveLength(1);
    const count = (
      await query("select count(*)::int as total from school_charges")
    ).rows;
    await asUser(admin, () => query("select run_billing_cycle()"));
    expect(
      (await query("select count(*)::int as total from school_charges")).rows,
    ).toEqual(count);
    expect(
      (
        await query(
          "select id from school_charges where student_id=$1 and period=to_char(current_date,'YYYY-MM') and status<>'cancelled'",
          [secondStudent],
        )
      ).rows,
    ).toEqual([]);
  });

  it("obtiene identidad, aulas y vínculos desde el servidor", async () => {
    const result = await asUser(guardian, () =>
      query<{
        workspace_identity: { roles: string[]; guardianStudentIds: string[] };
      }>("select workspace_identity()"),
    );
    expect(result.rows[0].workspace_identity.roles).toEqual(["guardian"]);
    expect(result.rows[0].workspace_identity.guardianStudentIds).toEqual([
      student,
    ]);
  });
  it("publica para un aula completa y limita comunicados y plazos docentes", async () => {
    await asUser(teacher, () =>
      query(
        "select publish_class_entry($1,$2,'actividad','Actividad de aula',current_date)",
        [school, room],
      ),
    );
    const classEntries = (
      await query(
        "select student_id from daily_entries where note='Actividad de aula'",
      )
    ).rows;
    expect(classEntries.length).toBeGreaterThan(1);
    await expect(
      asUser(teacher, () =>
        query(
          "select publish_class_entry($1,$2,'actividad','No autorizado',current_date)",
          [otherSchool, room2],
        ),
      ),
    ).rejects.toThrow();
    await asUser(teacher, () =>
      query(
        "insert into announcements(school_id,classroom_id,title,content) values($1,$2,'Aviso de aula','Traer acuarelas')",
        [school, room],
      ),
    );
    await expect(
      asUser(teacher, () =>
        query(
          "insert into announcements(school_id,title,content) values($1,'General','No autorizado')",
          [school],
        ),
      ),
    ).rejects.toThrow();
    await asUser(teacher, () =>
      query("select set_student_access_until($1,current_date+7)", [student]),
    );
    await expect(
      asUser(teacher, () =>
        query("select set_student_access_until($1,current_date+7)", [
          otherStudent,
        ]),
      ),
    ).rejects.toThrow();
  });
  it("ajusta descuentos sin alterar pagos y permite deshabilitarlos", async () => {
    const monthly = (
      await query<{ id: string; amount: string }>(
        "select id,amount from school_charges where plan_id=$1 and period is not null order by due_date",
        [id(60)],
      )
    ).rows;
    await asUser(director, () =>
      query("select record_school_payment($1,'cash','REC-DESCUENTO')", [
        monthly[0].id,
      ]),
    );
    await asUser(director, () =>
      query("select adjust_plan_discount($1,999,'2026-01-01','2027-12-31')", [
        id(60),
      ]),
    );
    const updated = (
      await query<{ id: string; amount: string }>(
        "select id,amount from school_charges where id=any($1::uuid[]) order by due_date",
        [monthly.map((c) => c.id)],
      )
    ).rows;
    expect(Number(updated[0].amount)).toBe(Number(monthly[0].amount));
    expect(Number(updated[1].amount)).toBe(29);
    await asUser(director, () =>
      query("select adjust_plan_discount($1,0,null,null)", [id(60)]),
    );
    expect(
      Number(
        (
          await query<{ amount: string }>(
            "select amount from school_charges where id=$1",
            [monthly[1].id],
          )
        ).rows[0].amount,
      ),
    ).toBe(509);
  });
  it("exige ficha completa para acceder a contenidos y permite completarla sin acceso académico", async () => {
    await query("update students set profile_complete=false where id=$1", [
      student,
    ]);
    expect(
      (await asUser(guardian, () => query("select note from daily_entries")))
        .rows,
    ).toHaveLength(0);
    await asUser(guardian, () =>
      query("select complete_student_profile($1,$2::jsonb)", [
        student,
        JSON.stringify({
          allergies: "Ninguna",
          foodRestrictions: "Ninguna",
          emergencyContact: "Abuela",
          emergencyPhone: "70000000",
          hasInsurance: false,
        }),
      ]),
    );
    expect(
      (await asUser(guardian, () => query("select note from daily_entries")))
        .rows,
    ).toHaveLength(2);
  });
  it("incorpora colegios por solicitud verificada y aprobación exclusiva de plataforma", async () => {
    const result = await asUser(guardian, () =>
      query<{ request_institution: string }>(
        "select request_institution($1::jsonb)",
        [
          JSON.stringify({
            school_name: "Colegio Nuevo",
            city: "Cochabamba",
            contact_name: "Directora Nueva",
            phone: "70000000",
            email: "falso@test.bo",
            message: "Queremos MiCole",
          }),
        ],
      ),
    );
    const requestId = result.rows[0].request_institution;
    expect(
      (
        await asUser(director, () =>
          query("select id from institution_requests"),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(director, () =>
        query("select review_institution_request($1,true,$2)", [
          requestId,
          "Bienvenidos",
        ]),
      ),
    ).rejects.toThrow();
    const approved = await asUser(admin, () =>
      query<{ review_institution_request: string }>(
        "select review_institution_request($1,true,$2)",
        [requestId, "Bienvenidos"],
      ),
    );
    const newSchool = approved.rows[0].review_institution_request;
    expect(
      (
        await asUser(guardian, () =>
          query(
            "select school_id,role from school_memberships where school_id=$1",
            [newSchool],
          ),
        )
      ).rows,
    ).toEqual([{ school_id: newSchool, role: "director" }]);
    expect(
      (
        await query<{ email: string }>(
          "select email from institution_requests where id=$1",
          [requestId],
        )
      ).rows[0].email,
    ).toBe("guardian@test.bo");
    const duplicate = await asUser(admin, () =>
      query<{ review_institution_request: string }>(
        "select review_institution_request($1,true,$2)",
        [requestId, "Otra vez"],
      ),
    );
    expect(duplicate.rows[0].review_institution_request).toBe(newSchool);
  });
  it("sella las notificaciones, respeta vínculos y conserva lectura individual", async () => {
    await query("update students set access_until=current_date+3 where id=$1", [
      student,
    ]);
    const inserted = await asUser(director, () =>
      query<{ id: string }>(
        "insert into messages(school_id,student_id,body,author_id,author_name,author_role) values($1,$2,'Mensaje para la familia',$3,'Dirección','director') returning id",
        [school, student, director],
      ),
    );
    const messageId = inserted.rows[0].id;
    const notice = (
      await asUser(guardian, () =>
        query<{ id: string }>(
          "select id from notifications where source_id=$1 and kind='message'",
          [messageId],
        ),
      )
    ).rows[0];
    expect(notice.id).toBeTruthy();
    await expect(
      asUser(guardian, () =>
        query("update notifications set title='Alterado' where id=$1", [
          notice.id,
        ]),
      ),
    ).rejects.toThrow();
    await asUser(guardian, () =>
      query("select mark_notification_read($1)", [notice.id]),
    );
    expect(
      (
        await query<{ read_at: string }>(
          "select read_at from notifications where id=$1",
          [notice.id],
        )
      ).rows[0].read_at,
    ).toBeTruthy();
    const staffNotice = (
      await query<{ id: string }>(
        "select id from notifications where source_id=$1 and user_id=$2",
        [messageId, teacher],
      )
    ).rows[0];
    await asUser(guardian, () =>
      query("select mark_notification_read($1)", [staffNotice.id]),
    );
    expect(
      (
        await query<{ read_at: null }>(
          "select read_at from notifications where id=$1",
          [staffNotice.id],
        )
      ).rows[0].read_at,
    ).toBeNull();
    await query(
      "insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Bloqueo de prueba',current_date-1,50)",
      [school, student],
    );
    await query("update students set access_until=null where id=$1", [student]);
    expect(
      (
        await asUser(guardian, () =>
          query(
            "select id from notifications where source_id=$1 and kind='message'",
            [messageId],
          ),
        )
      ).rows,
    ).toHaveLength(0);
    await query("update students set access_until=current_date+3 where id=$1", [
      student,
    ]);
  });
  it("audita estados sin guardar información médica y limita acceso a dirección", async () => {
    expect(
      (await asUser(teacher, () => query("select id from audit_events"))).rows,
    ).toHaveLength(0);
    const logs = (
      await asUser(director, () =>
        query<{ school_id: string; summary: Record<string, unknown> }>(
          "select school_id,summary from audit_events",
        ),
      )
    ).rows;
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((e) => e.school_id === school)).toBe(true);
    expect(
      logs.some((e) =>
        Object.keys(e.summary).some((key) =>
          [
            "allergies",
            "foodRestrictions",
            "emergencyPhone",
            "tokenHash",
          ].includes(key),
        ),
      ),
    ).toBe(false);
  });
  it("reserva el administrador en servidor y lo provisiona solo después de verificar el correo", async () => {
    await expect(
      asUser(guardian, () =>
        query(
          "insert into aulanexo_private.platform_admin_allowlist(email) values('intruso@test.bo')",
        ),
      ),
    ).rejects.toThrow();
    await query(
      "insert into aulanexo_private.platform_admin_allowlist(email) values('owner@test.bo')",
    );
    await query("insert into auth.users(id,email) values($1,'owner@test.bo')", [
      id(99),
    ]);
    expect(
      (
        await query("select user_id from platform_admins where user_id=$1", [
          id(99),
        ])
      ).rows,
    ).toHaveLength(0);
    await query("update auth.users set email_confirmed_at=now() where id=$1", [
      id(99),
    ]);
    expect(
      (
        await asUser(id(99), () =>
          query<{ workspace_identity: { roles: string[] } }>(
            "select workspace_identity()",
          ),
        )
      ).rows[0].workspace_identity.roles,
    ).toEqual(["superadmin"]);
  });
  it("revoca acceso e invitaciones al cambiar el correo docente", async () => {
    const payload = {
      id: id(50),
      school_id: school,
      name: "Docente nueva",
      email: "stranger@test.bo",
      specialty: "Inicial",
      status: "active",
    };
    const oldInvite = (
      await asUser(director, () =>
        query<{ create_invitation: string }>(
          "select create_invitation($1::jsonb)",
          [
            JSON.stringify({
              school_id: school,
              teacher_id: id(50),
              email: "teacher@test.bo",
              role: "teacher",
            }),
          ],
        ),
      )
    ).rows[0].create_invitation;
    await asUser(director, () =>
      query("select save_teacher($1::jsonb)", [JSON.stringify(payload)]),
    );
    expect(
      (await asUser(teacher, () => query("select id from students"))).rows,
    ).toHaveLength(0);
    await expect(
      asUser(teacher, () => query("select claim_invitation($1)", [oldInvite])),
    ).rejects.toThrow();
    const fresh = (
      await asUser(director, () =>
        query<{ create_invitation: string }>(
          "select create_invitation($1::jsonb)",
          [
            JSON.stringify({
              school_id: school,
              teacher_id: id(50),
              email: "stranger@test.bo",
              role: "teacher",
            }),
          ],
        ),
      )
    ).rows[0].create_invitation;
    await asUser(stranger, () => query("select claim_invitation($1)", [fresh]));
    expect(
      (
        await asUser(stranger, () =>
          query("select id from students where id=$1", [student]),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("una docente de baja no puede reactivar su cuenta con un enlace pendiente", async () => {
    const payload = {
      school_id: school,
      teacher_id: id(50),
      email: "stranger@test.bo",
      role: "teacher",
    };
    const pending = (
      await asUser(director, () =>
        query<{ create_invitation: string }>(
          "select create_invitation($1::jsonb)",
          [JSON.stringify(payload)],
        ),
      )
    ).rows[0].create_invitation;
    await asUser(director, () =>
      query("select save_teacher($1::jsonb)", [
        JSON.stringify({
          id: id(50),
          school_id: school,
          name: "Docente",
          email: "stranger@test.bo",
          specialty: "Inicial",
          status: "inactive",
        }),
      ]),
    );
    await expect(
      asUser(stranger, () => query("select claim_invitation($1)", [pending])),
    ).rejects.toThrow();
    await expect(
      asUser(director, () =>
        query("select create_invitation($1::jsonb)", [JSON.stringify(payload)]),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(stranger, () =>
        query("select aulanexo_private.claim_invitation($1)", [pending]),
      ),
    ).rejects.toThrow();
  });
});

describe("plataforma y soporte acotado", () => {
  const supportSchool = id(801),
    supportRoom = id(802),
    supportTeacher = id(803),
    child = id(804),
    sibling = id(805);
  const secondRoom = id(806),
    secondChild = id(807);
  let supportId = "";
  const beginSupport = async (target: string, role: string) => {
    const result = await asUser(admin, () =>
      query<{ start_support_session: { id: string } }>(
        "select start_support_session($1,$2,$3,$4)",
        [supportSchool, target, role, "Revisión automatizada de permisos"],
      ),
    );
    return result.rows[0].start_support_session.id;
  };
  const inSupport = <T>(
    user: string,
    sessionId: string,
    fn: () => Promise<T>,
  ) =>
    asUser(user, async () => {
      await query("select set_config('request.headers',$1,true)", [
        JSON.stringify({ "x-micole-support": sessionId }),
      ]);
      return fn();
    });
  beforeAll(async () => {
    await query(
      "insert into aulanexo_private.platform_admin_allowlist(email) values('admin@test.bo') on conflict do nothing",
    );
    await query(
      "insert into schools(id,name,slug,status) values($1,'Soporte','support-tests','active')",
      [supportSchool],
    );
    await query(
      "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian')",
      [supportSchool, director, teacher2, guardian],
    );
    await query(
      "insert into classrooms(id,school_id,name) values($1,$2,'Soporte Aula'),($3,$2,'Otra Aula')",
      [supportRoom, supportSchool, secondRoom],
    );
    await query(
      "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente Soporte','support-teacher@test.bo','active')",
      [supportTeacher, supportSchool, teacher2],
    );
    await query(
      "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
      [supportSchool, supportTeacher, supportRoom],
    );
    await query(
      "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete) values($1,$2,$3,'Hija','Soporte','active',true),($4,$2,$3,'Otra','Familia','active',true),($5,$2,$6,'Otra','Aula','active',true)",
      [child, supportSchool, supportRoom, sibling, secondChild, secondRoom],
    );
    await query(
      "insert into student_guardians(student_id,user_id,relationship,verified_at) values($1,$2,'mother',now())",
      [child, guardian],
    );
  });
  it("la plataforma consulta conteos sin acceder a fichas ni operación del colegio", async () => {
    const result = await asUser(admin, async () => ({
      students: (await query("select id from students")).rows,
      entries: (await query("select id from daily_entries")).rows,
      counts: (
        await query<{
          platform_school_counts: {
            schoolId: string;
            activeStudentCount: number;
          }[];
        }>("select platform_school_counts()")
      ).rows[0].platform_school_counts,
      identity: (
        await query<{ workspace_identity: { canSupport: boolean } }>(
          "select workspace_identity()",
        )
      ).rows[0].workspace_identity,
    }));
    expect(result.students).toHaveLength(0);
    expect(result.entries).toHaveLength(0);
    expect(
      result.counts.find((s) => s.schoolId === supportSchool)
        ?.activeStudentCount,
    ).toBe(3);
    expect(result.identity.canSupport).toBe(true);
    await expect(
      asUser(admin, () =>
        query("select set_student_access_until($1,current_date+1)", [child]),
      ),
    ).rejects.toThrow();
  });
  it("solo el propietario reservado puede abrir soporte y un motivo es obligatorio", async () => {
    for (const user of [director, guardian, stranger])
      await expect(
        asUser(user, () =>
          query("select support_accounts($1)", [supportSchool]),
        ),
      ).rejects.toThrow();
    await query(
      "insert into platform_admins(user_id) values($1) on conflict do nothing",
      [stranger],
    );
    await expect(
      asUser(stranger, () =>
        query(
          "select start_support_session($1,$2,'director','Revisar la cuenta')",
          [supportSchool, stranger],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      asUser(admin, () =>
        query("select start_support_session($1,$2,'director','corto')", [
          supportSchool,
          admin,
        ]),
      ),
    ).rejects.toThrow();
    await query("delete from platform_admins where user_id=$1", [stranger]);
    await expect(
      asUser(admin, () =>
        query(
          "select start_support_session($1,$2,'teacher','Revisar cuenta docente')",
          [supportSchool, admin],
        ),
      ),
    ).rejects.toThrow();
  });
  it("dirección de soporte sirve para preparar un colegio sin asignar un rol permanente", async () => {
    supportId = await beginSupport(admin, "director");
    await inSupport(admin, supportId, async () => {
      const identity = (
        await query<{
          workspace_identity: {
            roles: string[];
            support: { schoolId: string };
          };
        }>("select workspace_identity()")
      ).rows[0].workspace_identity;
      expect(identity.roles).toEqual(["director"]);
      expect(identity.support.schoolId).toBe(supportSchool);
      expect((await query("select id from schools")).rows).toEqual([
        { id: supportSchool },
      ]);
      expect((await query("select id from students")).rows).toHaveLength(3);
      await query("select set_student_access_until($1,current_date+1)", [
        child,
      ]);
    });
    const audit = (
      await query<{
        actor_id: string;
        summary: { supportSessionId: string; targetUserId: string };
      }>(
        "select actor_id,summary from audit_events where entity='students' and entity_id=$1 order by created_at desc limit 1",
        [child],
      )
    ).rows[0];
    expect(audit.actor_id).toBe(admin);
    expect(audit.summary.supportSessionId).toBe(supportId);
    expect(audit.summary.targetUserId).toBe(admin);
    expect(
      (
        await query("select id from school_memberships where user_id=$1", [
          admin,
        ])
      ).rows,
    ).toHaveLength(0);
    await expect(
      inSupport(stranger, supportId, () => query("select id from students")),
    ).rejects.toThrow(/support_expired/);
  });
  it("docente atendida conserva sus aulas y no hereda privilegios de plataforma", async () => {
    supportId = await beginSupport(teacher2, "teacher");
    await inSupport(admin, supportId, async () => {
      expect((await query("select id from students order by id")).rows).toEqual(
        [{ id: child }, { id: sibling }],
      );
      expect((await query("select is_platform_admin() as admin")).rows).toEqual(
        [{ admin: false }],
      );
      await query(
        "insert into daily_entries(school_id,student_id,category,note) values($1,$2,'actividad','Revisión de soporte')",
        [supportSchool, child],
      );
    });
    await expect(
      inSupport(admin, supportId, () =>
        query("select set_student_access_until($1,current_date+1)", [
          secondChild,
        ]),
      ),
    ).rejects.toThrow();
    await expect(
      inSupport(admin, supportId, () => query("select run_billing_cycle()")),
    ).rejects.toThrow();
    const audit = (
      await query<{ actor_id: string; summary: { targetUserId: string } }>(
        "select actor_id,summary from audit_events where entity='daily_entries' and summary->>'supportSessionId'=$1 order by created_at desc limit 1",
        [supportId],
      )
    ).rows[0];
    expect(audit.actor_id).toBe(admin);
    expect(audit.summary.targetUserId).toBe(teacher2);
  });
  it("familia atendida conserva hijos, bloqueos por deuda y permisos de escritura", async () => {
    supportId = await beginSupport(guardian, "guardian");
    await inSupport(admin, supportId, async () => {
      expect((await query("select id from students")).rows).toEqual([
        { id: child },
      ]);
      expect((await query("select id from daily_entries")).rows).toHaveLength(
        1,
      );
      await query(
        "insert into messages(school_id,student_id,body,author_id,author_name,author_role) values($1,$2,'Consulta en soporte',$3,'Falso','superadmin')",
        [supportSchool, child, admin],
      );
    });
    await query("update students set access_until=null where id=$1", [child]);
    await query(
      "insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Cuota vencida',current_date-2,100)",
      [supportSchool, child],
    );
    await inSupport(admin, supportId, async () => {
      expect((await query("select id from students")).rows).toEqual([
        { id: child },
      ]);
      expect((await query("select id from daily_entries")).rows).toHaveLength(
        0,
      );
      expect((await query("select id from school_charges")).rows).toHaveLength(
        1,
      );
    });
    await expect(
      inSupport(admin, supportId, () =>
        query(
          "insert into messages(school_id,student_id,body,author_id,author_name,author_role) values($1,$2,'Intento bloqueado',$3,'Falso','superadmin')",
          [supportSchool, child, admin],
        ),
      ),
    ).rejects.toThrow();
    await expect(
      inSupport(admin, supportId, () =>
        query("select set_student_access_until($1,current_date+1)", [child]),
      ),
    ).rejects.toThrow();
  });
  it("salir, caducar o revocar un rol invalida soporte sin alterar el login", async () => {
    await asUser(admin, () =>
      query("select end_support_session($1)", [supportId]),
    );
    await expect(
      inSupport(admin, supportId, () => query("select workspace_identity()")),
    ).rejects.toThrow(/support_expired/);
    supportId = await beginSupport(teacher2, "teacher");
    await query(
      "update school_memberships set active=false where school_id=$1 and user_id=$2 and role='teacher'",
      [supportSchool, teacher2],
    );
    await expect(
      inSupport(admin, supportId, () => query("select id from students")),
    ).rejects.toThrow(/support_expired/);
    supportId = await beginSupport(admin, "director");
    await query(
      "update aulanexo_private.support_sessions set expires_at=now()-interval '1 second' where id=$1",
      [supportId],
    );
    await expect(
      inSupport(admin, supportId, () => query("select workspace_identity()")),
    ).rejects.toThrow(/support_expired/);
    const normal = (
      await asUser(admin, () =>
        query<{ workspace_identity: { roles: string[] } }>(
          "select workspace_identity()",
        ),
      )
    ).rows[0].workspace_identity;
    expect(normal.roles).toContain("superadmin");
  });
});

describe("inscripción de padres y ficha compartida", () => {
  const sch = id(920),
    classroom = id(921),
    kid = id(922),
    sibling = id(923),
    mum = id(910),
    dad = id(911),
    newMum = id(912);
  const payload = (child: string, ci: string, rude = "") => ({
    id: child,
    school_id: sch,
    classroom_id: classroom,
    first_name: "Lucía",
    last_name: "Inscripción",
    birth_date: "2023-01-01",
    identity_number: ci,
    rude,
    mother_name: "Madre Inscripción",
    mother_email: "mum-intake@test.bo",
    father_name: "Padre Inscripción",
    father_email: "dad-intake@test.bo",
    monthly_fee: 450,
  });
  const care = {
    allergies: "Maní",
    foodRestrictions: "Sin maní",
    emergencyContact: "Abuela",
    emergencyPhone: "70000000",
    secondEmergencyContact: "Tío",
    secondEmergencyPhone: "71111111",
    hasInsurance: true,
    insuranceProvider: "Seguro Ejemplo",
    insuranceNumber: "POL-01",
    medicalConditions: "Ninguna",
    careInstructions: "Avisar a mamá",
  };
  let token = "",
    formId = "";
  async function asAnon<T>(fn: () => Promise<T>) {
    await db.exec("begin;set local role anon;");
    await query("select set_config('request.jwt.claim.sub','',true)");
    try {
      const result = await fn();
      await db.exec("commit");
      return result;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  }
  const createLink = async () => {
    const result = await asUser(director, () =>
      query<{ create_family_intake: string }>(
        "select create_family_intake($1,'mother')",
        [kid],
      ),
    );
    return result.rows[0].create_family_intake;
  };
  beforeAll(async () => {
    await query(
      "insert into schools(id,name,slug,status) values($1,'Colegio Fichas','fichas-tests','active')",
      [sch],
    );
    await query(
      "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
      [sch, director, teacher2],
    );
    await query(
      "insert into classrooms(id,school_id,name) values($1,$2,'Primero B')",
      [classroom, sch],
    );
    await query(
      "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente ficha','teacher-intake@test.bo','active')",
      [id(924), sch, teacher2],
    );
    await query(
      "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
      [sch, id(924), classroom],
    );
    await query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'mum-intake@test.bo',now()),($2,'dad-intake@test.bo',null),($3,'new-mum-intake@test.bo',now())",
      [mum, dad, newMum],
    );
  });
  it("admite RUDE vacío, exige padres/CI y evita duplicados sin cargos huérfanos", async () => {
    await asUser(director, () =>
      query("select enroll_student($1::jsonb)", [
        JSON.stringify(payload(kid, "CI-922")),
      ]),
    );
    await asUser(director, () =>
      query("select enroll_student($1::jsonb)", [
        JSON.stringify(payload(sibling, "CI-923")),
      ]),
    );
    expect(
      (await query("select rude from students where id=$1", [kid])).rows,
    ).toEqual([{ rude: "" }]);
    await expect(
      asUser(director, () =>
        query("select enroll_student($1::jsonb)", [
          JSON.stringify({ ...payload(id(925), "CI-925"), father_email: "" }),
        ]),
      ),
    ).rejects.toThrow(/madre y padre/);
    await expect(
      asUser(director, () =>
        query("select enroll_student($1::jsonb)", [
          JSON.stringify(payload(id(926), " ci-922 ")),
        ]),
      ),
    ).rejects.toThrow(/registrado/);
    await expect(
      asUser(director, () =>
        query("select enroll_student($1::jsonb)", [
          JSON.stringify({
            ...payload(id(927), "CI-927"),
            identity_number: "",
          }),
        ]),
      ),
    ).rejects.toThrow(/CI/);
    expect(
      (
        await query(
          "select id from platform_charges where student_id=any($1)",
          [[id(925), id(926), id(927)]],
        )
      ).rows,
    ).toHaveLength(0);
    await query("update students set rude='R-922' where id=$1", [kid]);
    await expect(
      asUser(director, () =>
        query("select enroll_student($1::jsonb)", [
          JSON.stringify(payload(id(928), "CI-928", "r-922")),
        ]),
      ),
    ).rejects.toThrow(/registrado/);
  });
  it("vincula hermanos por correo confirmado sin enlaces y no concede acceso a correos ajenos", async () => {
    const identity = (
      await asUser(mum, () =>
        query<{
          workspace_identity: { roles: string[]; guardianStudentIds: string[] };
        }>("select workspace_identity()"),
      )
    ).rows[0].workspace_identity;
    expect(identity.roles).toEqual(["guardian"]);
    expect(identity.guardianStudentIds.sort()).toEqual([kid, sibling]);
    expect(
      (
        await asUser(dad, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toHaveLength(0);
    await query("update auth.users set email_confirmed_at=now() where id=$1", [
      dad,
    ]);
    expect(
      (
        await asUser(dad, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toHaveLength(2);
    expect(
      (
        await asUser(stranger, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      asUser(director, () =>
        query("select create_invitation($1::jsonb)", [
          JSON.stringify({
            school_id: sch,
            student_id: kid,
            email: "other@test.bo",
            role: "guardian",
            relationship: "other",
          }),
        ]),
      ),
    ).rejects.toThrow(/madre y padre/);
    await expect(
      asUser(director, () =>
        query("select create_invitation($1::jsonb)", [
          JSON.stringify({
            school_id: sch,
            student_id: kid,
            email: "other@test.bo",
            role: "guardian",
            relationship: "mother",
          }),
        ]),
      ),
    ).rejects.toThrow(/registra/);
  });
  it("el enlace anónimo solo devuelve contexto y no expone fichas, CI, correos ni documentos", async () => {
    token = await createLink();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    const context = (
      await asAnon(() =>
        query<{ family_intake_context: Record<string, unknown> }>(
          "select family_intake_context($1)",
          [token],
        ),
      )
    ).rows[0].family_intake_context;
    expect(Object.keys(context).sort()).toEqual(
      [
        "schoolName",
        "logoUrl",
        "childName",
        "recipient",
        "status",
        "expiresAt",
      ].sort(),
    );
    expect(context.childName).toBe("Lucía");
    await expect(
      asAnon(() => query("select * from family_intake_forms")),
    ).rejects.toThrow();
    await expect(
      asAnon(() => query("select * from student_documents")),
    ).rejects.toThrow();
    await expect(
      asAnon(() => query("select family_intake_context('invalid')")),
    ).rejects.toThrow();
    await expect(
      asUser(teacher2, () =>
        query("select create_family_intake($1,'mother')", [kid]),
      ),
    ).rejects.toThrow();
  });
  it("valida seguro/emergencia, recibe una sola respuesta y no cambia tarifas ni autorizaciones", async () => {
    await expect(
      asAnon(() =>
        query("select submit_family_intake($1,$2::jsonb)", [
          token,
          JSON.stringify({ ...care, hasInsurance: null }),
        ]),
      ),
    ).rejects.toThrow(/seguro/);
    await expect(
      asAnon(() =>
        query("select submit_family_intake($1,$2::jsonb)", [
          token,
          JSON.stringify({ ...care, emergencyPhone: "abc" }),
        ]),
      ),
    ).rejects.toThrow(/números/);
    await expect(
      asAnon(() =>
        query("select submit_family_intake($1,$2::jsonb)", [
          token,
          JSON.stringify({ ...care, insuranceProvider: "" }),
        ]),
      ),
    ).rejects.toThrow(/entidad/);
    await asAnon(() =>
      query("select submit_family_intake($1,$2::jsonb)", [
        token,
        JSON.stringify({
          ...care,
          monthlyFee: 0,
          fatherEmail: "attacker@test.bo",
          status: "active",
          studentId: sibling,
        }),
      ]),
    );
    await asAnon(() =>
      query("select submit_family_intake($1,$2::jsonb)", [
        token,
        JSON.stringify({ ...care, allergies: "Alterado" }),
      ]),
    );
    const form = (
      await query<{ id: string; profile: typeof care; status: string }>(
        "select id,profile,status from family_intake_forms where student_id=$1 and status='submitted'",
        [kid],
      )
    ).rows[0];
    formId = form.id;
    expect(form.profile).toEqual(care);
    expect(form.profile.allergies).toBe("Maní");
    const child = (
      await query<{
        monthly_fee: string;
        profile_complete: boolean;
        father_email: string;
      }>(
        "select monthly_fee,profile_complete,father_email from students where id=$1",
        [kid],
      )
    ).rows[0];
    expect(Number(child.monthly_fee)).toBe(450);
    expect(child.profile_complete).toBe(false);
    expect(child.father_email).toBe("dad-intake@test.bo");
    expect(
      (
        await asUser(director, () =>
          query(
            "select id from notifications where kind='intake' and source_id=$1",
            [formId],
          ),
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("solo Dirección aprueba la ficha y la auditoría no copia su información médica", async () => {
    for (const user of [mum, teacher2, stranger, admin])
      await expect(
        asUser(user, () =>
          query("select review_family_intake($1,true)", [formId]),
        ),
      ).rejects.toThrow();
    await asUser(director, () =>
      query("select review_family_intake($1,true)", [formId]),
    );
    await asUser(director, () =>
      query("select review_family_intake($1,true)", [formId]),
    );
    expect(
      (
        await query(
          "select profile_complete,allergies,has_insurance,insurance_provider from students where id=$1",
          [kid],
        )
      ).rows,
    ).toEqual([
      {
        profile_complete: true,
        allergies: "Maní",
        has_insurance: true,
        insurance_provider: "Seguro Ejemplo",
      },
    ]);
    expect(
      (
        await query("select status from family_intake_forms where id=$1", [
          formId,
        ])
      ).rows,
    ).toEqual([{ status: "approved" }]);
    expect(
      JSON.stringify(
        (
          await query(
            "select summary from audit_events where entity='family_intake_forms' and entity_id=$1",
            [formId],
          )
        ).rows,
      ),
    ).not.toContain("Maní");
    expect(
      (await asUser(mum, () => query("select id from family_intake_forms")))
        .rows,
    ).toHaveLength(0);
  });
  it("reemplazar, retirar o vencer el enlace bloquea nuevos envíos; Dirección puede llenar la ficha", async () => {
    const first = await createLink(),
      second = await createLink();
    await expect(
      asAnon(() => query("select family_intake_context($1)", [first])),
    ).rejects.toThrow(/reemplazado/);
    await query(
      "update family_intake_forms set expires_at=now()-interval '1 second' where token_hash=encode(sha256(convert_to($1,'UTF8')),'hex')",
      [second],
    );
    await expect(
      asAnon(() =>
        query("select submit_family_intake($1,$2::jsonb)", [
          second,
          JSON.stringify(care),
        ]),
      ),
    ).rejects.toThrow(/venció/);
    const third = await createLink();
    await asUser(director, () =>
      query("select complete_student_profile($1,$2::jsonb)", [
        kid,
        JSON.stringify({ ...care, hasInsurance: false }),
      ]),
    );
    await expect(
      asAnon(() => query("select family_intake_context($1)", [third])),
    ).rejects.toThrow(/reemplazado/);
    expect(
      (
        await query(
          "select has_insurance,insurance_provider from students where id=$1",
          [kid],
        )
      ).rows,
    ).toEqual([{ has_insurance: false, insurance_provider: "" }]);
    await expect(
      asUser(teacher2, () =>
        query("select complete_student_profile($1,$2::jsonb)", [
          kid,
          JSON.stringify(care),
        ]),
      ),
    ).rejects.toThrow();
  });
  it("los documentos son privados de Dirección y padres; docentes y otras familias quedan fuera", async () => {
    await asUser(director, () =>
      query(
        "insert into student_documents(school_id,student_id,category,file_name,object_key,mime_type,size_bytes,uploaded_by) values($1,$2,'ci','ci.pdf',$3,'application/pdf',100,$4)",
        [sch, kid, `${sch}/${kid}/documents/${director}/test.pdf`, director],
      ),
    );
    expect(
      (
        await asUser(mum, () =>
          query("select file_name from student_documents"),
        )
      ).rows,
    ).toEqual([{ file_name: "ci.pdf" }]);
    for (const user of [teacher2, stranger, admin])
      expect(
        (await asUser(user, () => query("select id from student_documents")))
          .rows,
      ).toHaveLength(0);
  });
  it("cambiar el correo de un padre revoca enlace y acceso antiguos, conservando el vínculo con otros hijos", async () => {
    const stale = await createLink();
    await asUser(director, () =>
      query("select save_student($1::jsonb)", [
        JSON.stringify({
          ...payload(kid, "CI-922", "R-922"),
          mother_email: "new-mum-intake@test.bo",
          mother_name: "Madre actual",
        }),
      ]),
    );
    await expect(
      asAnon(() => query("select family_intake_context($1)", [stale])),
    ).rejects.toThrow(/reemplazado/);
    expect(
      (
        await asUser(mum, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toEqual([{ id: sibling }]);
    expect(
      (await asUser(mum, () => query("select id from student_documents"))).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(newMum, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toEqual([{ id: kid }]);
    await query(
      "update auth.users set email='changed-mum-intake@test.bo' where id=$1",
      [mum],
    );
    expect(
      (
        await asUser(mum, () =>
          query("select id from students where school_id=$1", [sch]),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("el propietario puede probar su propia cuenta de padre sin heredar permisos de plataforma", async () => {
    await asUser(director, () =>
      query("select save_student($1::jsonb)", [
        JSON.stringify({
          ...payload(kid, "CI-922", "R-922"),
          mother_name: "Madre actual",
          mother_email: "new-mum-intake@test.bo",
          father_name: "Propietario Padre",
          father_email: "admin@test.bo",
        }),
      ]),
    );
    const accounts = (
      await asUser(admin, () =>
        query<{ support_accounts: { id: string; role: string }[] }>(
          "select support_accounts($1)",
          [sch],
        ),
      )
    ).rows[0].support_accounts;
    expect(
      accounts.some(
        (account) => account.id === admin && account.role === "guardian",
      ),
    ).toBe(true);
    const session = (
      await asUser(admin, () =>
        query<{ start_support_session: { id: string } }>(
          "select start_support_session($1,$2,'guardian','Revisar mi cuenta de padre')",
          [sch, admin],
        ),
      )
    ).rows[0].start_support_session;
    const inOwnSupport = <T>(fn: () => Promise<T>) =>
      asUser(admin, async () => {
        await query("select set_config('request.headers',$1,true)", [
          JSON.stringify({ "x-micole-support": session.id }),
        ]);
        return fn();
      });
    expect(
      (await inOwnSupport(() => query("select id from students"))).rows,
    ).toEqual([{ id: kid }]);
    expect(
      (await inOwnSupport(() => query("select is_platform_admin() as admin")))
        .rows,
    ).toEqual([{ admin: false }]);
    await expect(
      inOwnSupport(() =>
        query("select set_student_access_until($1,current_date+1)", [kid]),
      ),
    ).rejects.toThrow();
    await query(
      "update school_memberships set active=false where user_id=$1 and school_id=$2 and role='guardian'",
      [admin, sch],
    );
    await expect(
      inOwnSupport(() => query("select id from students")),
    ).rejects.toThrow(/support_expired/);
    await asUser(admin, () =>
      query("select end_support_session($1)", [session.id]),
    );
  });
});
