import fs from "node:fs";
import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient(),
  apply = process.argv.includes("--apply"),
  migrations = [["202610230003", "security_audit"]];
try {
  await db.connect();
  await db.query("begin");
  await db.query(
    "select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))",
  );
  const alreadyApplied = [];
  for (const [version, name] of migrations) {
    const exists =
      (
        await db.query(
          "select 1 from supabase_migrations.schema_migrations where version=$1",
          [version],
        )
      ).rowCount > 0;
    if (exists) {
      alreadyApplied.push(version);
      continue;
    }
    const sql = fs.readFileSync(
      new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url),
      "utf8",
    );
    await db.query(sql);
    if (apply)
      await db.query(
        "insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",
        [version, name, [sql]],
      );
  }
  await db.query(apply ? "commit" : "rollback");
  if (apply) await db.query("notify pgrst,'reload schema'");
  console.log(
    JSON.stringify({
      ok: true,
      applied: apply,
      alreadyApplied,
      migrations: migrations.map(([version]) => version),
      valuesPrinted: false,
    }),
  );
} catch (e) {
  await db.query("rollback").catch(() => {});
  reportFailure(e);
} finally {
  await db.end();
}
