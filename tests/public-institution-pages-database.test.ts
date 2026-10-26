import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const id = (n: number) => `26000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, school, other, testSchool] = [1, 2, 3, 20, 21, 22].map(id);
const q = (sql: string, params: unknown[] = []) => db.query<Record<string, any>>(sql, params);
async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`savepoint actor;set local role ${user ? "authenticated" : "anon"}`);
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user || ""]);
  try { return await q(sql, params); }
  finally { await db.exec("rollback to savepoint actor;release savepoint actor"); }
}
async function save(user: string, payload: Record<string, unknown>) {
  // Keep successful changes, so anonymous calls can observe them afterwards.
  await db.exec("savepoint writer;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try { await q("select save_school($1::jsonb)", [JSON.stringify(payload)]); await db.exec("reset role;release savepoint writer"); }
  catch (error) { await db.exec("rollback to savepoint writer;release savepoint writer"); throw error; }
}
const profile = async (slug = "cole-publico") => (await as(null, "select landing_institution($1) as value", [slug])).rows[0].value;

beforeAll(async () => {
  await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(directory).filter(file => file.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file, directory), "utf8").replace("create extension if not exists pgcrypto;", ""));
  for (const [user, email] of [[owner, "public-page-owner@test.bo"], [director, "public-page-director@test.bo"], [teacher, "public-page-teacher@test.bo"]]) await q("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user, email]);
  await q("insert into aulanexo_private.platform_admin_allowlist(email) values('public-page-owner@test.bo') on conflict do nothing");
  await q("insert into public.platform_admins(user_id) values($1) on conflict do nothing", [owner]);
  await q("insert into schools(id,name,slug,status,phone,address,maps_url,nit,director_name,public_description) values($1,'Cole Público','cole-publico','active','+591 70000000','Av. Arce 123','https://www.google.com/maps/embed?pb=example','123456789','PRIVATE_DIRECTOR','Aprendemos juntos.'),($2,'Cole Ajeno','cole-ajeno','active','','','','','',''),($3,'Cole de prueba','cole-pruebas','active','','','','','','')", [school, other, testSchool]);
  await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')", [school, director, teacher]);
  await q("insert into aulanexo_private.school_contacts(school_id,director_identity,director_phone) values($1,'PRIVATE_CI','PRIVATE_PHONE')", [school]);
}, 60000);
beforeEach(async () => { await db.exec("begin"); });
afterEach(async () => { await db.exec("rollback"); });
afterAll(async () => { await db.close(); });

describe("páginas públicas por institución", () => {
  it("ofrece identidad y presentación sin publicar contacto por defecto ni datos privados", async () => {
    const value = await profile();
    expect(value).toMatchObject({ slug: "cole-publico", name: "Cole Público", description: "Aprendemos juntos.", phone: "", address: "", mapsUrl: "" });
    expect(Object.keys(value).sort()).toEqual(["id", "slug", "name", "city", "logoUrl", "bannerUrl", "website", "color", "siteName", "educationLevels", "description", "phone", "address", "mapsUrl"].sort());
    expect(JSON.stringify(value)).not.toMatch(/PRIVATE_|123456789|Av\. Arce|70000000/);
    expect((await as(null, "select id from schools")).rows).toEqual([]);
  });
  it("Dirección guarda su presentación, niveles y contacto público; conserva los campos omitidos", async () => {
    await save(director, { id: school, public_description: " Una propuesta Montessori. ", show_public_contact: true, education_levels: ["Guardería", "Inicial"] });
    await save(director, { id: school, name: "Cole Público Actualizado" });
    expect(await profile()).toMatchObject({ name: "Cole Público Actualizado", description: "Una propuesta Montessori.", educationLevels: ["Guardería", "Inicial"], phone: "+591 70000000", address: "Av. Arce 123", mapsUrl: "https://www.google.com/maps/embed?pb=example" });
    const rows = (await as(null, "select landing_institutions() as value")).rows[0].value;
    const card = rows.find((row: { id: string }) => row.id === school);
    expect(card).toMatchObject({ slug: "cole-publico", educationLevels: ["Guardería", "Inicial"] });
    expect(JSON.stringify(card)).not.toMatch(/phone|address|description|PRIVATE_|123456789/);
    await save(director, { id: school, show_public_contact: false });
    expect(await profile()).toMatchObject({ address: "", phone: "", mapsUrl: "" });
  });
  it("al ocultar o desactivar la institución, también impide abrirla directamente", async () => {
    await save(director, { id: school, show_on_landing: false });
    expect(await profile()).toBeNull();
    await save(owner, { id: school, show_on_landing: true, status: "inactive" });
    expect(await profile()).toBeNull();
    expect(await profile("inexistente")).toBeNull();
  });
  it("excluye las instituciones de prueba aun cuando se marca su visibilidad", async () => {
    await q("insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)", [testSchool, owner]);
    await q("insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)", [testSchool, owner]);
    await q("update schools set show_on_landing=true where id=$1", [testSchool]);
    expect(await profile("cole-pruebas")).toBeNull();
    expect(JSON.stringify((await as(null, "select landing_institutions() as value")).rows[0].value)).not.toContain("cole-pruebas");
  });
  it("rechaza cambios de otros roles y valida el contenido sin cambios parciales", async () => {
    await expect(save(teacher, { id: school, public_description: "Cambio" })).rejects.toThrow(/No puedes modificar/);
    await expect(save(director, { id: other, show_public_contact: true })).rejects.toThrow(/No puedes modificar/);
    await expect(as(null, "select save_school($1::jsonb)", [JSON.stringify({ id: school })])).rejects.toThrow(/permission denied/);
    for (const value of [{ public_description: "x".repeat(2501) }, { public_description: {} }, { show_public_contact: "true" }, { education_levels: "Inicial" }, { education_levels: ["Inventado"] }, { education_levels: [null] }]) await expect(save(director, { id: school, name: "Cambio inválido", ...value })).rejects.toThrow();
    expect(await profile()).toMatchObject({ name: "Cole Público", description: "Aprendemos juntos." });
  });
});
