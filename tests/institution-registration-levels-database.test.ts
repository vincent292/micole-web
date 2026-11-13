import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";

const db = new PGlite();
const owner = "ac000000-0000-4000-8000-000000000001";
const applicant = "ac000000-0000-4000-8000-000000000002";
const stranger = "ac000000-0000-4000-8000-000000000003";
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
async function as(user: string, sql: string, args: unknown[] = []) {
  await db.exec("savepoint actor;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const result = await q(sql, args);
    await db.exec("reset role;release savepoint actor");
    return result;
  } catch (error) {
    await db.exec("rollback to savepoint actor;release savepoint actor");
    throw error;
  }
}
const request = async (levels?: unknown, extra = {}) => (await as(applicant, "select request_institution($1::jsonb) id", [JSON.stringify({ school_name: "Institución de ejemplo", city: "La Paz", contact_name: "Responsable de prueba", phone: "70000000", ...(levels === undefined ? {} : { education_levels: levels }), ...extra })])).rows[0].id;
const approve = async (id: string) => (await as(owner, "select review_institution_request($1,true,'Aprobada') id", [id])).rows[0].id;

beforeAll(async () => {
  await db.exec("create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;");
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(dir).filter(name => name.endsWith(".sql")).sort())
    await db.exec(readFileSync(new URL(file, dir), "utf8").replace("create extension if not exists pgcrypto;", ""));
  for (const [id, email] of [[owner, "ariasvincent292@gmail.com"], [applicant, "registration@example.invalid"], [stranger, "stranger@example.invalid"]])
    await q("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [id, email]);
  await q("insert into platform_admins(user_id) values($1) on conflict do nothing", [owner]);
}, 30000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

it("conserva los siete conjuntos de niveles al aprobar y configura cada tipo de institución", async () => {
  for (const [levels, mode] of [
    [["Inicial"], "kinder"], [["Primaria"], "school"], [["Secundaria"], "school"],
    [["Primaria", "Secundaria"], "school"], [["Inicial", "Primaria"], "auto"],
    [["Inicial", "Secundaria"], "auto"], [["Inicial", "Primaria", "Secundaria"], "auto"],
  ] as [string[], string][]) {
    const id = await request(levels);
    const school = await approve(id);
    const row = (await q("select education_levels,workspace_mode from schools where id=$1", [school])).rows[0];
    expect(row.education_levels.sort()).toEqual([...levels].sort());
    expect(row.workspace_mode).toBe(mode);
    expect(await approve(id)).toBe(school);
    expect((await q("select count(*) n from school_memberships where school_id=$1 and user_id=$2 and role='director'", [school, applicant])).rows[0].n).toBe(1);
  }
});

it("rechaza niveles vacíos, desconocidos o malformados sin crear solicitudes", async () => {
  for (const levels of [[], null, "Inicial", [null], [true], ["Inventado"], ["Inicial", ""], Array(7).fill("Inicial")])
    await expect(request(levels)).rejects.toThrow(/nivel educativo/);
  expect((await q("select count(*) n from institution_requests")).rows[0].n).toBe(0);
});

it("mantiene la privacidad, la aprobación exclusiva de plataforma y la solicitud única", async () => {
  const id = await request(["Inicial", "Primaria"], { user_id: stranger, workspace_mode: "kinder" });
  expect((await as(applicant, "select user_id,education_levels from institution_requests where id=$1", [id])).rows).toEqual([{ user_id: applicant, education_levels: ["Inicial", "Primaria"] }]);
  expect((await as(stranger, "select * from institution_requests where id=$1", [id])).rows).toEqual([]);
  await expect(as(applicant, "select review_institution_request($1,true,'')", [id])).rejects.toThrow(/Solo la plataforma/);
  await expect(request(["Primaria"])).rejects.toThrow(/solicitud pendiente/);
  const school = await approve(id);
  expect((await q("select workspace_mode from schools where id=$1", [school])).rows[0].workspace_mode).toBe("auto");
});

it("conserva solicitudes anteriores sin inventarles niveles y admite guardería opcional", async () => {
  const id = await request();
  const school = await approve(id);
  expect((await q("select education_levels,workspace_mode from schools where id=$1", [school])).rows[0]).toEqual({ education_levels: [], workspace_mode: "auto" });
  const infant = await approve(await request(["Inicial", "Guardería", "Inicial"]));
  expect((await q("select education_levels,workspace_mode from schools where id=$1", [infant])).rows[0]).toEqual({ education_levels: ["Guardería", "Inicial"], workspace_mode: "kinder" });
});
