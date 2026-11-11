import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fundInstitutionFixtures } from "./funded-institution-fixture";

const db = new PGlite();
const id = (n: number) => `cd000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, guardian, outsider] = [1, 2, 3, 4, 5].map(id);
const [school, foreignSchool, room, secondRoom, foreignRoom] = [20, 21, 30, 31, 32].map(id);
const [first, second, elsewhere, foreignChild, pending, inactive] = [40, 41, 42, 43, 44, 45].map(id);
const q = (sql: string, params: unknown[] = []) => db.query<Record<string, any>>(sql, params);
async function acting(user: string | null, sql: string, params: unknown[] = [], support?: string, role = "authenticated") {
  await db.exec(`savepoint actor;set local role ${role}`);
  await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)", [user || "", JSON.stringify(support ? { "x-micole-support": support } : {})]);
  try {
    const result = await q(sql, params);
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true),set_config('request.headers','{}',true)");
    await db.exec("release savepoint actor");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint actor;release savepoint actor");
    throw error;
  }
}
const care = (student = first, extra: object = {}) => ({ student_id: student, kind: "meal", occurred_at: "10:00", food: "Fruta", amount: "all", note: "", ...extra });
const batch = (user = teacher, records: unknown = [care(), care(second, { amount: "half", note: "Comió la mitad." })], requestId: string | null = id(100), day = "2026-10-20", classId = room, schoolId = school, support?: string) =>
  acting(user, "select save_care_batch($1,$2,$3,$4,$5::jsonb) as result", [schoolId, classId, day, requestId, JSON.stringify(records)], support);
const count = async () => Number((await q("select count(*) as n from care_records")).rows[0].n);

beforeAll(async () => {
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, directory), "utf8").replace("create extension if not exists pgcrypto;", ""));
  await q("insert into aulanexo_private.platform_admin_allowlist(email) values('kinder-owner@test.bo') on conflict do nothing");
  for (const [user, email] of [[owner, "kinder-owner@test.bo"], [director, "kinder-director@test.bo"], [teacher, "kinder-teacher@test.bo"], [guardian, "kinder-parent@test.bo"], [outsider, "kinder-outside@test.bo"]]) await q("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user, email]);
  await q("insert into platform_admins(user_id) values($1) on conflict do nothing", [owner]);
  await q("insert into schools(id,name,slug,status,education_levels) values($1,'Kínder de prueba','kinder-care','active',array['Inicial']),($2,'Otra institución','kinder-other','active',array['Inicial'])", [school, foreignSchool]);
  await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian'),($1,$5,'teacher')", [school, director, teacher, guardian, outsider]);
  await q("insert into classrooms(id,school_id,name,level,academic_year,active) values($1,$2,'Sala Inicial','Inicial',2026,true),($3,$2,'Otra sala','Inicial',2026,true),($4,$5,'Sala ajena','Inicial',2026,true)", [room, school, secondRoom, foreignRoom, foreignSchool]);
  await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Maestra de prueba','kinder-teacher@test.bo','active')", [id(50), school, teacher]);
  await q("insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)", [school, id(50), room]);
  for (const [student, classroom, institution, status] of [[first, room, school, "active"], [second, room, school, "active"], [elsewhere, secondRoom, school, "active"], [foreignChild, foreignRoom, foreignSchool, "active"], [pending, room, school, "pending"], [inactive, room, school, "inactive"]]) await q("insert into students(id,school_id,classroom_id,first_name,last_name,birth_date,status,profile_complete) values($1,$2,$3,'Niño','Prueba','2022-01-01',$4,true)", [student, institution, classroom, status]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); await fundInstitutionFixtures(db); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("cuidados del aula y modo kínder", () => {
  it("registra un lote conservando las diferencias individuales y la atribución docente", async () => {
    expect((await batch()).rows[0].result).toEqual({ saved: 2 });
    const rows = (await q("select student_id,amount,note,classroom_id,created_by from care_records order by student_id")).rows;
    expect(rows).toEqual([{ student_id: first, amount: "all", note: "", classroom_id: room, created_by: teacher }, { student_id: second, amount: "half", note: "Comió la mitad.", classroom_id: room, created_by: teacher }]);
    expect((await q("select count(*) as n from audit_events where entity='care_records'")).rows[0].n).toBe(2);
  });
  it("reintenta la misma solicitud sin duplicar cuidados ni auditoría y rechaza cambios", async () => {
    await batch();
    expect((await batch()).rows[0].result).toEqual({ saved: 2 });
    expect(await count()).toBe(2);
    expect((await q("select count(*) as n from aulanexo_private.care_batch_requests")).rows[0].n).toBe(1);
    expect((await q("select count(*) as n from audit_events where entity='care_records'")).rows[0].n).toBe(2);
    await expect(batch(teacher, [care(), care(second, { amount: "none" })])).rejects.toThrow(/otros datos/);
    await expect(batch(director)).rejects.toThrow(/otros datos/);
    expect(await count()).toBe(2);
  });
  it("revierte todo el lote si un registro individual es inválido", async () => {
    await expect(batch(teacher, [care(), care(second, { amount: "invalid" })])).rejects.toThrow();
    expect(await count()).toBe(0);
    expect((await q("select count(*) as n from aulanexo_private.care_batch_requests")).rows[0].n).toBe(0);
    expect((await batch()).rows[0].result).toEqual({ saved: 2 });
  });
  it("valida niños activos del aula, duplicados, fechas y tipos sin aceptar incidentes en grupo", async () => {
    for (const student of [elsewhere, foreignChild, pending, inactive]) await expect(batch(teacher, [care(), care(student)])).rejects.toThrow(/niños activos/);
    for (const records of [[], [care(), care()], [care(first, { kind: "incident", note: "Caída durante el juego." })], [care(first, { id: id(500) })], Array.from({ length: 201 }, () => care()), null, {}]) await expect(batch(teacher, records)).rejects.toThrow();
    await expect(batch(teacher, [care()], null)).rejects.toThrow(/identificar/);
    await expect(batch(teacher, [care()], id(101), "2100-01-01")).rejects.toThrow(/día actual/);
    expect(await count()).toBe(0);
  });
  it("solo permite a Dirección o al docente asignado; bloquea padres, terceros y plataforma sin soporte", async () => {
    for (const user of [guardian, outsider, owner]) await expect(batch(user)).rejects.toThrow(/Solo Dirección/);
    await expect(batch(teacher, [care(elsewhere)], id(102), "2026-10-20", secondRoom)).rejects.toThrow(/Solo Dirección/);
    await expect(batch(director, [care(foreignChild)], id(103), "2026-10-20", foreignRoom, foreignSchool)).rejects.toThrow(/Solo Dirección/);
    await expect(acting(null, "select save_care_batch($1,$2,$3,$4,$5::jsonb)", [school, room, "2026-10-20", id(104), JSON.stringify([care()])], undefined, "anon")).rejects.toThrow(/permission denied/);
    await expect(acting(teacher, "select * from aulanexo_private.care_batch_requests")).rejects.toThrow(/permission denied/);
    expect((await batch(director)).rows[0].result).toEqual({ saved: 2 });
  });
  it("vuelve a comprobar permisos al reintentar y respeta la habilitación de la institución", async () => {
    await batch();
    await q("delete from teacher_classrooms where teacher_id=$1 and classroom_id=$2", [id(50), room]);
    await expect(batch()).rejects.toThrow(/Solo Dirección/);
    await q("update aulanexo_private.platform_credit_accounts set initial_paid_at=null where school_id=$1", [school]);
    await q("update schools set platform_enabled=false where id=$1", [school]);
    await expect(batch(director, [care()], id(105))).rejects.toThrow(/Solo Dirección/);
  });
  it("mantiene la sede y la identidad delegada durante soporte", async () => {
    const session = (await acting(owner, "select start_support_session($1,$2,'teacher','Verificar cuidados por aula') as value", [school, teacher])).rows[0].value;
    expect((await batch(owner, [care()], id(106), "2026-10-20", room, school, session.id)).rows[0].result).toEqual({ saved: 1 });
    expect((await q("select created_by from care_records")).rows[0].created_by).toBe(teacher);
    expect((await q("select actor_id from aulanexo_private.care_batch_requests")).rows[0].actor_id).toBe(owner);
    await expect(batch(owner, [care(foreignChild)], id(107), "2026-10-20", foreignRoom, foreignSchool, session.id)).rejects.toThrow(/Solo Dirección/);
  });
  it("Dirección elige el modo de trabajo, conserva omisiones y no cambia autorizaciones", async () => {
    expect((await q("select workspace_mode from schools where id=$1", [school])).rows[0].workspace_mode).toBe("auto");
    for (const mode of ["kinder", "school", "auto"]) {
      await acting(director, "select save_school($1::jsonb)", [JSON.stringify({ id: school, workspace_mode: mode })]);
      await acting(director, "select save_school($1::jsonb)", [JSON.stringify({ id: school, city: "Cochabamba" })]);
      expect((await q("select workspace_mode from schools where id=$1", [school])).rows[0].workspace_mode).toBe(mode);
    }
    for (const value of ["unexpected", null, true]) await expect(acting(director, "select save_school($1::jsonb)", [JSON.stringify({ id: school, name: "Cambio inválido", workspace_mode: value })])).rejects.toThrow(/modo de trabajo/);
    expect((await q("select name from schools where id=$1", [school])).rows[0].name).toBe("Kínder de prueba");
    await expect(acting(teacher, "select save_school($1::jsonb)", [JSON.stringify({ id: school, workspace_mode: "kinder" })])).rejects.toThrow(/No puedes modificar/);
    await expect(acting(director, "select save_school($1::jsonb)", [JSON.stringify({ id: foreignSchool, workspace_mode: "kinder" })])).rejects.toThrow(/No puedes modificar/);
    await acting(owner, "select save_school($1::jsonb)", [JSON.stringify({ id: school, workspace_mode: "kinder" })]);
    await expect(batch(owner)).rejects.toThrow(/Solo Dirección/);
  });
});
