import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const db = new PGlite();
const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = id(1), director = id(2), teacher = id(3), guardian = id(4);
const school = id(20), hiddenSchool = id(21), pendingSchool = id(22), inactiveSchool = id(23);
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZsAAAAASUVORK5CYII=";
interface PublicInstitution { id: string; name: string; city: string; logoUrl: string; website: string }
const query = <T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params: unknown[] = []) => db.query<T>(sql, params);
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
const save = (payload: Record<string, unknown>) => query("select public.save_school($1::jsonb)", [JSON.stringify(payload)]);
const listing = async () => (await query<{ institutions: PublicInstitution[] }>("select public.landing_institutions() as institutions")).rows[0].institutions;

beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon;create role service_role; create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  for (const file of [
    "202610130001_initial.sql", "202610130002_workspace.sql", "202610130003_billing_cycle.sql",
    "202610130004_micole_operations.sql", "202610130005_invitation_lifecycle.sql", "202610140001_platform_support.sql",
    "202610140002_family_enrollment.sql", "202610140003_support_registered_parents.sql", "202610140004_financial_reports.sql",
    "202610140005_institution_identity.sql",
  ]) await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", ""));
  await query("insert into aulanexo_private.platform_admin_allowlist(email) values('institution-owner@test.bo')");
  for (const [user, email] of [[owner, "institution-owner@test.bo"], [director, "institution-director@test.bo"], [teacher, "institution-teacher@test.bo"], [guardian, "institution-parent@test.bo"]]) {
    await query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())", [user, email]);
  }
  await query("insert into public.platform_admins(user_id) values($1) on conflict do nothing", [owner]);
  await query("insert into public.schools(id,name,slug,status,director_name,phone) values($1,'Colegio Público','identity-public','active','Dirección Privada','77700000'),($2,'Colegio Oculto','identity-hidden','active','Dirección Oculta',''),($3,'Colegio Pendiente','identity-pending','pending','',''),($4,'Colegio Inactivo','identity-inactive','inactive','','')", [school, hiddenSchool, pendingSchool, inactiveSchool]);
  await query("update public.schools set show_on_landing=false where id=$1", [hiddenSchool]);
  await query("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian')", [school, director, teacher, guardian]);
}, 30000);
afterAll(async () => { await db.close(); });

describe("identidad institucional y afiliaciones públicas", () => {
  it("la landing anónima obtiene solo cinco campos de instituciones activas y visibles", async () => {
    const rows = await asUser(null, listing, "anon");
    expect(rows).toEqual([{ id: school, name: "Colegio Público", city: "", logoUrl: "", website: "" }]);
    expect(Object.keys(rows[0]).sort()).toEqual(["city", "id", "logoUrl", "name", "website"]);
    expect(JSON.stringify(rows)).not.toMatch(/Dirección Privada|77700000|nit|address|director|phone|students/);
    expect((await asUser(null, () => query("select id from public.schools"), "anon")).rows).toEqual([]);
  });

  it("superadmin crea la identidad completa con visibilidad automática por defecto", async () => {
    await asUser(owner, () => save({ id: id(24), name: "Guardería Nueva", slug: "identity-new", city: "La Paz", director_name: "Directora Nueva", status: "active", nit: "1234567890", address: "Av. Arce 123", phone: "+591 70000000", website: "https://institucion.example.org/inicio?lang=es", logo_url: png, brand_color: "#3D6EF7" }));
    const row = (await query("select nit,address,website,logo_url,show_on_landing from public.schools where id=$1", [id(24)])).rows[0];
    expect(row).toMatchObject({ nit: "1234567890", address: "Av. Arce 123", show_on_landing: true, logo_url: png });
    expect((await asUser(null, listing, "anon")).map(s => s.id)).toContain(id(24));
    expect(JSON.stringify(await asUser(null, listing, "anon"))).not.toContain("1234567890");
  });

  it("Dirección edita sus datos pero conserva estado, slug y nombre de dirección", async () => {
    await asUser(director, () => save({ id: school, name: "Colegio Actualizado", city: "Cochabamba", status: "inactive", slug: "slug-no-permitido", director_name: "Cambio No Permitido", nit: "987654321", address: "Calle Uno 42", website: "https://colegio.example.org", logo_url: png, show_on_landing: false }));
    const row = (await query("select name,city,status,slug,director_name,nit,address,show_on_landing from public.schools where id=$1", [school])).rows[0];
    expect(row).toEqual({ name: "Colegio Actualizado", city: "Cochabamba", status: "active", slug: "identity-public", director_name: "Dirección Privada", nit: "987654321", address: "Calle Uno 42", show_on_landing: false });
    expect((await asUser(null, listing, "anon")).map(s => s.id)).not.toContain(school);
  });

  it("los campos omitidos se conservan al editar desde ambos roles", async () => {
    await asUser(director, () => save({ id: school, name: "Colegio Conservado" }));
    await asUser(owner, () => save({ id: school, city: "Santa Cruz" }));
    const row = (await query("select name,city,nit,address,website,logo_url,phone,show_on_landing,status,slug from public.schools where id=$1", [school])).rows[0];
    expect(row).toEqual({ name: "Colegio Conservado", city: "Santa Cruz", nit: "987654321", address: "Calle Uno 42", website: "https://colegio.example.org", logo_url: png, phone: "77700000", show_on_landing: false, status: "active", slug: "identity-public" });
  });

  it("el administrador puede cambiar estado y Dirección no puede activar un pendiente", async () => {
    await query("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director')", [pendingSchool, director]);
    await asUser(director, () => save({ id: pendingSchool, status: "active" }));
    expect((await query("select status from public.schools where id=$1", [pendingSchool])).rows[0].status).toBe("pending");
    await asUser(owner, () => save({ id: pendingSchool, status: "active", director_name: "Asignada por Plataforma" }));
    expect((await asUser(null, listing, "anon")).map(s => s.id)).toContain(pendingSchool);
  });

  it("los roles no autorizados reciben denegación antes de validar datos", async () => {
    for (const user of [teacher, guardian]) {
      await expect(asUser(user, () => save({ id: school, name: "x", nit: "dato-secreto-malformado", logo_url: "javascript:alert(1)" }))).rejects.toThrow(/No puedes modificar/);
      await expect(asUser(user, () => save({ id: "uuid-malformado" }))).rejects.toThrow(/No puedes modificar/);
    }
    await expect(asUser(director, () => save({ id: hiddenSchool, nit: "INVÁLIDO" }))).rejects.toThrow(/No puedes modificar/);
    await expect(asUser(null, () => save({ id: school }), "anon")).rejects.toThrow(/permission denied/);
  });

  it("valida NIT, límites y URLs HTTPS sin credenciales ni controles", async () => {
    for (const payload of [
      { nit: "123-45" }, { nit: "1".repeat(21) }, { address: "x".repeat(501) }, { city: "x".repeat(101) },
      { phone: "x".repeat(41) }, { name: "x".repeat(151) }, { website: "http://example.org" },
      { website: "javascript:alert(1)" }, { website: "https://user:password@example.org" },
      { website: "https://example.org/\nscript" }, { website: "https:///example.org" },
      { website: "https://example.org/" + "x".repeat(2048) }, { show_on_landing: "true" },
    ]) await expect(asUser(director, () => save({ id: school, ...payload }))).rejects.toThrow();
    await asUser(director, () => save({ id: school, nit: "", address: "", website: "https://example.org:443/a?x=1#institucion" }));
  });

  it("acepta logos raster y rechaza SVG, contenido falso, HTTP y tamaños excesivos", async () => {
    for (const logo_url of ["https://cdn.example.org/logo.png", png, "data:image/jpeg;base64,/9j/", "data:image/webp;base64,UklGRgAAAABXRUJQ"]) {
      await asUser(director, () => save({ id: school, logo_url }));
    }
    for (const logo_url of [
      "http://cdn.example.org/logo.png", "https://cdn.example.org/logo.svg?cache=1", "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/png;base64,PHNjcmlwdD4=", "data:image/jpeg;base64,aGVsbG8=",
      "data:image/webp;base64,aGVsbG8=", "https://user:pass@cdn.example.org/logo.png", "data:image/png;base64," + "A".repeat(350000),
    ]) await expect(asUser(director, () => save({ id: school, logo_url }))).rejects.toThrow(/logo/);
    await asUser(director, () => save({ id: school, logo_url: "" }));
  });

  it("soporte de Dirección queda limitado al colegio elegido y no escala a plataforma", async () => {
    const context = (await asUser(owner, () => query<{ session: { id: string } }>("select public.start_support_session($1,$2,'director','Verificar identidad institucional') as session", [school, director]))).rows[0].session;
    await asUser(owner, () => save({ id: school, address: "Edición durante soporte", status: "inactive" }), "authenticated", context.id);
    expect((await query("select address,status from public.schools where id=$1", [school])).rows[0]).toEqual({ address: "Edición durante soporte", status: "active" });
    await expect(asUser(owner, () => save({ id: pendingSchool, address: "No Permitida" }), "authenticated", context.id)).rejects.toThrow(/No puedes modificar/);
  });

  it("el directorio agrega todos los afiliados y no trunca a mil instituciones", async () => {
    await query("insert into public.schools(name,slug,status) select 'Afiliada '||n,'identity-bulk-'||n,'active' from generate_series(1,1050) n");
    const rows = await asUser(null, listing, "anon");
    expect(rows.filter(s => s.name.startsWith("Afiliada "))).toHaveLength(1050);
    expect(rows.some(s => s.name === "Afiliada 1050")).toBe(true);
  });

  it("cuando no hay afiliados visibles devuelve un arreglo vacío, sin datos ficticios", async () => {
    await query("update public.schools set show_on_landing=false");
    expect(await asUser(null, listing, "anon")).toEqual([]);
  });
});
