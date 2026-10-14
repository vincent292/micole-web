import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";

// Todos los registros temporales se revierten. No invoca correo ni servicios externos.
const ids = Object.fromEntries(["owner", "director", "teacher", "guardian", "school", "hidden", "pending", "created"].map(name => [name, randomUUID()]));
const suffix = randomUUID().slice(0, 8);
const checks = [];
let db;
let transaction = false;
const check = (name, passed) => {
  if (!passed) throw new Error(`Falló la prueba: ${name}`);
  checks.push(name);
};
async function asUser(user, fn, role = "authenticated") {
  await db.query(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)", [user || ""]);
  const value = await fn();
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  return value;
}
async function denied(fn) {
  await db.query("savepoint expected_institution_denial");
  try {
    await fn();
    await db.query("release savepoint expected_institution_denial");
    return false;
  } catch (error) {
    await db.query("rollback to savepoint expected_institution_denial");
    await db.query("release savepoint expected_institution_denial");
    return ["42501", "P0001", "22023"].includes(error.code);
  }
}
const save = payload => db.query("select public.save_school($1::jsonb)", [JSON.stringify(payload)]);
const listing = async () => (await db.query("select public.landing_institutions() as institutions")).rows[0].institutions;
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZsAAAAASUVORK5CYII=";
try {
  db = databaseClient();
  await db.connect();
  await db.query("begin");
  transaction = true;
  for (const role of ["owner", "director", "teacher", "guardian"]) {
    await db.query("insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),$3::jsonb)", [ids[role], `micole-institution-${role}-${suffix}@example.invalid`, JSON.stringify({ full_name: `Institución temporal ${role}` })]);
  }
  await db.query("insert into public.platform_admins(user_id) values($1)", [ids.owner]);
  await db.query("insert into public.schools(id,name,slug,status,show_on_landing,director_name) values($1,$2,$3,'active',true,'Directora Privada'),($4,$5,$6,'active',false,''),($7,$8,$9,'pending',true,'')", [ids.school, `Institución pública ${suffix}`, `institution-public-${suffix}`, ids.hidden, `Institución oculta ${suffix}`, `institution-hidden-${suffix}`, ids.pending, `Institución pendiente ${suffix}`, `institution-pending-${suffix}`]);
  await db.query("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian'),($5,$2,'director')", [ids.school, ids.director, ids.teacher, ids.guardian, ids.pending]);
  const initial = await asUser(null, listing, "anon");
  check("La landing anónima contiene la institución activa", initial.some(s => s.id === ids.school));
  check("Instituciones ocultas o pendientes no son públicas", !initial.some(s => [ids.hidden, ids.pending].includes(s.id)));
  check("La respuesta publica únicamente cinco campos", initial.every(s => Object.keys(s).sort().join(",") === "city,id,logoUrl,name,website"));
  check("Anon no puede leer schools directamente", (await asUser(null, () => db.query("select id from public.schools"), "anon")).rows.length === 0);
  await asUser(ids.owner, () => save({ id: ids.created, name: `Institución creada ${suffix}`, slug: `institution-created-${suffix}`, status: "active", nit: "1122334455", address: "Dirección privada de prueba", website: "https://institucion.example.org", logo_url: png }));
  const created = (await db.query("select show_on_landing,nit,address,logo_url from public.schools where id=$1", [ids.created])).rows[0];
  check("Nueva institución visible por defecto y datos guardados", created.show_on_landing && created.nit === "1122334455" && created.address === "Dirección privada de prueba" && created.logo_url === png);
  const createdPublic = (await asUser(null, listing, "anon")).find(s => s.id === ids.created);
  check("NIT y dirección quedan fuera de la landing", Boolean(createdPublic) && !JSON.stringify(createdPublic).includes("1122334455") && !JSON.stringify(createdPublic).includes("Dirección privada"));
  await asUser(ids.director, () => save({ id: ids.school, nit: "987654321", address: "Dirección de prueba", website: "https://colegio.example.org", logo_url: png, status: "inactive", director_name: "Cambio indebido", slug: "cambio-indebido" }));
  const updated = (await db.query("select nit,address,status,director_name,slug from public.schools where id=$1", [ids.school])).rows[0];
  check("Dirección guarda identidad y conserva estado y privilegios", updated.nit === "987654321" && updated.address === "Dirección de prueba" && updated.status === "active" && updated.director_name === "Directora Privada" && updated.slug === `institution-public-${suffix}`);
  await asUser(ids.director, () => save({ id: ids.school, city: "La Paz" }));
  check("Los campos omitidos no se borran", (await db.query("select nit,address,logo_url from public.schools where id=$1", [ids.school])).rows[0].nit === "987654321");
  await asUser(ids.director, () => save({ id: ids.pending, status: "active" }));
  check("Dirección no puede activar una institución pendiente", (await db.query("select status from public.schools where id=$1", [ids.pending])).rows[0].status === "pending");
  check("Dirección no puede editar otra institución", await asUser(ids.director, () => denied(() => save({ id: ids.hidden, nit: "123" }))));
  check("Docentes no pueden editar identidad", await asUser(ids.teacher, () => denied(() => save({ id: ids.school, name: "x" }))));
  check("Familias no pueden editar identidad", await asUser(ids.guardian, () => denied(() => save({ id: ids.school, name: "x" }))));
  check("Anon no puede ejecutar save_school", await asUser(null, () => denied(() => save({ id: ids.school })), "anon"));
  check("Sitios con credenciales y logos SVG se rechazan", await asUser(ids.director, async () => (await denied(() => save({ id: ids.school, website: "https://user:pass@example.org" }))) && (await denied(() => save({ id: ids.school, logo_url: "data:image/svg+xml;base64,PHN2Zy8+" })))));
  check("NIT inválido y logo falso se rechazan", await asUser(ids.director, async () => (await denied(() => save({ id: ids.school, nit: "123-45" }))) && (await denied(() => save({ id: ids.school, logo_url: "data:image/png;base64,aGVsbG8=" })))));
  await asUser(ids.director, () => save({ id: ids.school, show_on_landing: false }));
  check("La preferencia de visibilidad retira la institución", !(await asUser(null, listing, "anon")).some(s => s.id === ids.school));
  await db.query("rollback");
  transaction = false;
  console.log(JSON.stringify({ ok: true, checks: checks.length, passed: checks, rolledBack: true }));
} catch (error) {
  if (db && transaction) await db.query("rollback").catch(() => {});
  reportFailure(error);
} finally {
  if (db) await db.end();
}
