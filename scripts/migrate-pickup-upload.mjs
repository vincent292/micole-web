import fs from "node:fs";
import { databaseClient, reportFailure } from "./database.mjs";

const db = databaseClient();
const apply = process.argv.includes("--apply");
const version = "202610270001", name = "pickup_upload_transaction";
try {
  await db.connect();
  await db.query("begin");
  await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
  const existing = (await db.query("select 1 from supabase_migrations.schema_migrations where version=$1", [version])).rowCount > 0;
  const metadata = async () => (await db.query("select provolatile,prosecdef,proacl,proconfig,prosrc from pg_proc where oid='public.pickup_identity_for_upload(uuid)'::regprocedure")).rows[0];
  const before = await metadata();
  if (!existing) {
    const sql = fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), "utf8");
    await db.query(sql);
    if (apply) await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])", [version, name, [sql]]);
  }
  const after = await metadata();
  if (after.provolatile !== "v" || ["prosecdef", "proacl", "proconfig", "prosrc"].some(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))) throw new Error("La corrección debe conservar cuerpo, permisos y configuración de la función.");
  await db.query(apply ? "commit" : "rollback");
  if (apply) await db.query("notify pgrst,'reload schema'");
  console.log(JSON.stringify({ ok: true, applied: apply, alreadyApplied: existing, migration: version, authorizationPreserved: true }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  reportFailure(error);
} finally { await db.end(); }
