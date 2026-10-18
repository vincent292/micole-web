import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = id(1), director = id(2), teacher = id(3), guardian = id(4), directorOther = id(5);
const school = id(20), schoolOther = id(21), room = id(30), roomSecond = id(31), roomOther = id(32);
const student = id(40), studentSecond = id(41), studentOther = id(42);
const query = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
interface Report {
  scope: "school" | "platform";
  fromDate: string;
  toDate: string;
  generatedAt: string;
  schools: Array<{ id: string; name: string; status: string }>;
  classrooms: Array<{ id: string; name: string }>;
  students: Array<{ id: string; name: string; classroomId: string | null; status: string }>;
  charges: Array<{ id: string; schoolId: string; studentId?: string; concept: string; date: string; dueDate?: string; amount: number; status: string; kind: string; licenseCount?: number | null }>;
  payments: Array<{ id: string; chargeId: string; schoolId: string; studentId?: string; concept: string; date: string; amount: number; method: string; reference: string }>;
}
async function asUser<T>(user: string | null, fn: () => Promise<T>, role = "authenticated", supportId?: string) {
  await db.exec(`begin; set local role ${role};`);
  await query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)", [user ?? "", JSON.stringify(supportId ? { "x-micole-support": supportId } : {})]);
  try {
    const result = await fn();
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
async function report(schoolId: string | null = school, from: string | null = "2025-10-01", to: string | null = "2025-10-31", classroomId: string | null = null, studentId: string | null = null) {
  return (await query<{ report: Report }>("select public.financial_report($1,$2,$3,$4,$5) as report", [schoolId, from, to, classroomId, studentId])).rows[0].report;
}
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon;create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  for (const file of [
    "202610130001_initial.sql", "202610130002_workspace.sql", "202610130003_billing_cycle.sql",
    "202610130004_micole_operations.sql", "202610130005_invitation_lifecycle.sql",
    "202610140001_platform_support.sql", "202610140002_family_enrollment.sql",
    "202610140003_support_registered_parents.sql", "202610140004_financial_reports.sql", "202610140005_institution_identity.sql", "202610150001_student_access.sql",
  ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", ""));
  await query("insert into aulanexo_private.platform_admin_allowlist(email) values('reports-owner@test.bo')");
  for (const [user, email] of [[admin, "reports-owner@test.bo"], [director, "reports-director@test.bo"], [teacher, "reports-teacher@test.bo"], [guardian, "reports-mother@test.bo"], [directorOther, "reports-other@test.bo"]]) {
    await query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user, email]);
  }
  await query("insert into schools(id,name,slug,status) values($1,'Colegio Reportes','reports-one','active'),($2,'Otra Institución','reports-two','inactive')", [school, schoolOther]);
  await query("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian'),($5,$6,'director')", [school, director, teacher, guardian, schoolOther, directorOther]);
  await query("insert into classrooms(id,school_id,name) values($1,$2,'Primero A'),($3,$2,'Primero B'),($4,$5,'Segundo A')", [room, school, roomSecond, roomOther, schoolOther]);
  await query("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente','reports-teacher@test.bo','active')", [id(50), school, teacher]);
  await query("insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)", [school, id(50), room]);
  await query("insert into students(id,school_id,classroom_id,first_name,last_name,status) values($1,$2,$3,'Nombre Privado','Apellido Privado','active'),($4,$2,$5,'Segunda','Niña Privada','inactive'),($6,$7,$8,'Alumno Ajeno','Otro Apellido','active')", [student, school, room, studentSecond, roomSecond, studentOther, schoolOther, roomOther]);
  await query("insert into student_guardians(student_id,user_id,relationship,verified_at) values($1,$2,'mother',now())", [student, guardian]);
  for (const [n, schoolId, studentId, dueDate, amount, status] of [
    [100, school, student, "2025-09-15", 200, "paid"],
    [101, school, student, "2025-10-01", 100, "pending"],
    [102, school, student, "2025-10-02", 300, "paid"],
    [103, school, student, "2025-10-03", 400, "cancelled"],
    [104, school, studentSecond, "2025-10-04", 500, "pending"],
    [105, schoolOther, studentOther, "2025-10-02", 600, "pending"],
  ] as const) await query("insert into school_charges(id,school_id,student_id,concept,due_date,amount,status) values($1,$2,$3,$4,$5,$6,$7)", [id(n), schoolId, studentId, `Cuota ${n}`, dueDate, amount, status]);
  await query("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Vence hoy',(now() at time zone 'America/La_Paz')::date,700),($4,$2,$3,'Vence mañana',(now() at time zone 'America/La_Paz')::date+1,800)", [id(106), school, student, id(107)]);
  for (const [n, charge, amount, state, date] of [
    [200, 100, 200, "verified", "2025-10-02T02:59:00Z"],
    [201, 102, 300, "verified", "2025-10-02T04:00:00Z"],
    [202, 101, 100, "manual_pending", "2025-10-01T15:00:00Z"],
    [203, 103, 400, "rejected", "2025-10-01T15:00:00Z"],
    [204, 104, 500, "verified", "2025-10-02T15:00:00Z"],
    [205, 105, 600, "verified", "2025-10-02T15:00:00Z"],
  ] as const) await query("insert into school_payments(id,charge_id,amount,payment_method,verification_state,paid_at,created_by,reference) values($1,$2,$3,'transfer',$4,$5,$6,$7)", [id(n), id(charge), amount, state, date, director, `REC-${n}`]);
  for (const [n, schoolId, studentId, concept, period, amount, status, createdAt] of [
    [300, school, null, "Licencias octubre", "2025-10", 116, "pending", "2025-11-02T15:00:00Z"],
    [301, school, student, "Activación Nombre Privado Apellido Privado", "2025-10", 50, "paid", "2025-10-02T02:59:00Z"],
    [302, schoolOther, null, "Licencias octubre", "2025-10", 58, "pending", "2025-10-02T15:00:00Z"],
    [303, school, studentSecond, "Activación Segunda Niña Privada", "2025-10", 50, "cancelled", "2025-10-08T15:00:00Z"],
    [304, school, null, "Ajuste de licencia", "2025-11", 45, "pending", "2025-11-02T15:00:00Z"],
  ] as const) await query("insert into platform_charges(id,school_id,student_id,concept,period,amount,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)", [id(n), schoolId, studentId, concept, period, amount, status, createdAt]);
  for (const [n, charge, amount, date] of [[400, 301, 50, "2025-10-02T02:59:00Z"], [401, 300, 116, "2025-10-02T04:00:00Z"], [402, 302, 58, "2025-10-02T15:00:00Z"]] as const) {
    await query("insert into platform_payments(id,charge_id,amount,payment_method,reference,created_by,paid_at) values($1,$2,$3,'qr',$4,$5,$6)", [id(n), id(charge), amount, `PLAT-${n}`, admin, date]);
  }
}, 30000);
afterAll(async () => { await db.close(); });

describe("reportes financieros con permisos y fechas reales", () => {
  it("limita Dirección a su colegio y conserva cancelaciones para consultar el historial", async () => {
    const result = await asUser(director, () => report());
    expect(result.scope).toBe("school");
    expect(result.schools.map(s => s.id)).toEqual([school]);
    expect(result.classrooms.map(c => c.id)).toEqual([room, roomSecond]);
    expect(result.students.map(s => s.id).sort()).toEqual([student, studentSecond].sort());
    expect(result.charges.map(c => c.id)).toEqual([101, 102, 103, 104].map(id));
    expect(result.charges.map(c => c.status)).toEqual(["overdue", "paid", "cancelled", "overdue"]);
    expect(result.charges.every(c => c.kind === "tuition" && c.schoolId === school)).toBe(true);
    expect(result.charges[0].amount).toBe(100);
    expect(result.charges[0].dueDate).toBe("2025-10-01");
    expect(Object.keys(result).sort()).toEqual(["scope", "fromDate", "toDate", "generatedAt", "schools", "classrooms", "students", "charges", "payments"].sort());
    await expect(asUser(director, () => report(schoolOther))).rejects.toThrow(/Acceso no autorizado/);
    await expect(asUser(director, () => report(null))).rejects.toThrow(/Acceso no autorizado/);
    expect((await asUser(directorOther, () => report(schoolOther))).charges.map(c => c.id)).toEqual([id(105)]);
  });
  it("solo incluye pagos verificados y cobra la cuota anterior dentro del período actual", async () => {
    const result = await asUser(director, () => report());
    expect(result.payments.map(p => p.id)).toEqual([200, 201, 204].map(id));
    expect(result.payments[0].chargeId).toBe(id(100));
    expect(result.charges.some(c => c.id === id(100))).toBe(false);
    expect(result.payments.reduce((total, p) => total + p.amount, 0)).toBe(1000);
    expect(result.payments[0].method).toBe("transfer");
    expect(result.payments[0].reference).toBe("REC-200");
  });
  it("calcula pagos en fecha de Bolivia, incluso en el límite de medianoche UTC", async () => {
    const first = await asUser(director, () => report(school, "2025-10-01", "2025-10-01"));
    const second = await asUser(director, () => report(school, "2025-10-02", "2025-10-02"));
    expect(first.payments.map(p => p.id)).toEqual([id(200)]);
    expect(first.payments[0].date).toBe("2025-10-01");
    expect(second.payments.map(p => p.id)).toEqual([id(201), id(204)]);
  });
  it("deriva mora a partir de hoy y mantiene pendientes los vencimientos de hoy y mañana", async () => {
    const today = (await query<{ day: string }>("select to_char((now() at time zone 'America/La_Paz')::date,'YYYY-MM-DD') as day")).rows[0].day;
    const tomorrow = (await query<{ day: string }>("select to_char((now() at time zone 'America/La_Paz')::date+1,'YYYY-MM-DD') as day")).rows[0].day;
    const result = await asUser(director, () => report(school, today, tomorrow));
    expect(result.charges.map(c => [c.id, c.status])).toEqual([[id(106), "pending"], [id(107), "pending"]]);
  });
  it("filtra curso actual y alumno, incluyendo sus pagos en el período", async () => {
    const result = await asUser(director, () => report(school, "2025-10-01", "2025-10-31", room));
    expect(result.students.map(s => s.id)).toEqual([student]);
    expect(result.charges.map(c => c.id)).toEqual([101, 102, 103].map(id));
    expect(result.payments.map(p => p.id)).toEqual([200, 201].map(id));
    expect((await asUser(director, () => report(school, "2025-10-01", "2025-10-31", null, studentSecond))).charges.map(c => c.id)).toEqual([id(104)]);
    await expect(asUser(director, () => report(school, "2025-10-01", "2025-10-31", roomOther))).rejects.toThrow(/curso no pertenece/);
    await expect(asUser(director, () => report(school, "2025-10-01", "2025-10-31", null, studentOther))).rejects.toThrow(/alumno no pertenece/);
    await expect(asUser(director, () => report(school, "2025-10-01", "2025-10-31", room, studentSecond))).rejects.toThrow(/alumno no pertenece al curso/);
  });
  it("rechaza familias, docentes y anónimos antes de validar identificadores ajenos", async () => {
    for (const user of [teacher, guardian]) {
      await expect(asUser(user, () => report())).rejects.toThrow(/Acceso no autorizado/);
      await expect(asUser(user, () => report(id(999), "2025-12-01", "2025-01-01", id(998), id(997)))).rejects.toThrow(/Acceso no autorizado/);
    }
    await expect(asUser(null, () => report(), "anon")).rejects.toThrow(/permission denied/);
    await expect(asUser(null, () => report())).rejects.toThrow(/Acceso no autorizado/);
  });
  it("la plataforma recibe solo sus cargos y pagos, sin identidad de alumnos", async () => {
    const result = await asUser(admin, () => report(null));
    expect(result.scope).toBe("platform");
    expect(result.classrooms).toEqual([]);
    expect(result.students).toEqual([]);
    expect(result.schools).toHaveLength(2);
    expect(result.charges.map(c => c.id)).toEqual([300, 301, 302, 303].map(id));
    expect(result.charges.find(c => c.id === id(300))).toMatchObject({ kind: "license", licenseCount: 4, status: "pending", date: "2025-10-01" });
    expect(result.charges.find(c => c.id === id(301))).toMatchObject({ kind: "activation", concept: "Activación inicial", licenseCount: null, date: "2025-10-01" });
    expect(result.charges.find(c => c.id === id(303))?.status).toBe("cancelled");
    expect(result.payments.map(p => p.id)).toEqual([400, 401, 402].map(id));
    expect(result.payments[0].concept).toBe("Activación inicial");
    const encoded = JSON.stringify(result);
    for (const privateValue of [student, studentSecond, studentOther, "Nombre Privado", "Apellido Privado", "Niña Privada", "studentId", "dueDate", "mother_email"]) expect(encoded).not.toContain(privateValue);
  });
  it("filtra plataforma por institución sin abrir datos escolares y calcula solo cantidades facturadas", async () => {
    const result = await asUser(admin, () => report(school));
    expect(result.scope).toBe("platform");
    expect(result.schools.map(s => s.id)).toEqual([school]);
    expect(result.charges.map(c => c.id)).toEqual([300, 301, 303].map(id));
    expect(result.payments.map(p => p.id)).toEqual([400, 401].map(id));
    const adjusted = await asUser(admin, () => report(school, "2025-11-01", "2025-11-30"));
    expect(adjusted.charges[0]).toMatchObject({ amount: 45, licenseCount: null, kind: "license" });
    await expect(asUser(admin, () => report(school, "2025-10-01", "2025-10-31", room))).rejects.toThrow(/plataforma se filtran por institución/);
    await expect(asUser(admin, () => report(id(999)))).rejects.toThrow(/institución seleccionada no existe/);
  });
  it("usa valores predeterminados de Bolivia y rechaza rangos inválidos o excesivos", async () => {
    const today = (await query<{ day: string }>("select to_char((now() at time zone 'America/La_Paz')::date,'YYYY-MM-DD') as day")).rows[0].day;
    const result = await asUser(director, () => report(school, null, null));
    expect(result.fromDate).toBe(`${today.slice(0, 4)}-01-01`);
    expect(result.toDate).toBe(today);
    expect(Number.isNaN(Date.parse(result.generatedAt))).toBe(false);
    await expect(asUser(director, () => report(school, "2025-11-01", "2025-10-01"))).rejects.toThrow(/rango de fechas válido/);
    await expect(asUser(director, () => report(school, "2000-01-01", "2025-10-01"))).rejects.toThrow(/diez años/);
    await expect(asUser(director, () => report(school, "-infinity", "2025-10-01"))).rejects.toThrow(/rango de fechas válido/);
  });
  it("conserva el colegio y rol de soporte, y rechaza sesiones expiradas", async () => {
    for (const [target, role] of [[director, "director"], [teacher, "teacher"], [guardian, "guardian"]] as const) {
      const session = (await asUser(admin, () => query<{ session: { id: string } }>("select public.start_support_session($1,$2,$3,'Revisión de reportes financieros') as session", [school, target, role]))).rows[0].session;
      if (role === "director") {
        const result = await asUser(admin, () => report(), "authenticated", session.id);
        expect(result.scope).toBe("school");
        expect(result.students.map(s => s.id).sort()).toEqual([student, studentSecond].sort());
        await expect(asUser(admin, () => report(schoolOther), "authenticated", session.id)).rejects.toThrow(/Acceso no autorizado/);
        await expect(asUser(admin, () => report(null), "authenticated", session.id)).rejects.toThrow(/Acceso no autorizado/);
      } else {
        await expect(asUser(admin, () => report(), "authenticated", session.id)).rejects.toThrow(/Acceso no autorizado/);
      }
      await query("update aulanexo_private.support_sessions set expires_at=now()-interval '1 second' where id=$1", [session.id]);
      await expect(asUser(admin, () => report(), "authenticated", session.id)).rejects.toThrow(/support_expired/);
    }
  });
  it("no trunca más de mil cuotas ni pagos y no modifica su contabilidad", async () => {
    await query("insert into school_charges(id,school_id,student_id,concept,due_date,amount,status) select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1,$2,'Historial masivo','2024-10-01'::date+(n%28),n,'paid' from generate_series(1,1105) n", [school, student]);
    await query("insert into school_payments(charge_id,amount,payment_method,verification_state,paid_at,created_by,reference) select id,amount,'cash','verified','2024-10-10T12:00:00Z',$1,'HIST-'||amount from school_charges where concept='Historial masivo'", [director]);
    const before = (await query<{ total: number }>("select count(*)::integer as total from audit_events")).rows[0].total;
    const result = await asUser(director, () => report(school, "2024-10-01", "2024-10-31"));
    expect(result.charges).toHaveLength(1105);
    expect(result.payments).toHaveLength(1105);
    expect(result.charges.reduce((sum, c) => sum + c.amount, 0)).toBe(1105 * 1106 / 2);
    expect(result.payments.reduce((sum, p) => sum + p.amount, 0)).toBe(1105 * 1106 / 2);
    expect(result.charges.map(c => `${c.date}/${c.id}`)).toEqual(result.charges.map(c => `${c.date}/${c.id}`).sort());
    expect(result.payments.map(p => `${p.date}/${p.id}`)).toEqual(result.payments.map(p => `${p.date}/${p.id}`).sort());
    expect((await query<{ total: number }>("select count(*)::integer as total from audit_events")).rows[0].total).toBe(before);
  });
});
