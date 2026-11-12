import fs from "node:fs";
import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient(),
  apply = process.argv.includes("--apply"),
  migrations = [
    ["202611110001", "academic_administration"],
    ["202611110002", "academic_followup"],
    ["202611110003", "institution_dashboard"],
    ["202611110004", "subject_workspace"],
    ["202611110005", "secretary_collections"],
    ["202611110006", "teacher_insights"],
    ["202611110007", "academic_signals"],
    ["202611110008", "subject_staff_assignment"],
    ["202611110009", "secretary_invitations"],
    ["202611110010", "subject_attendance_indicators"],
    ["202611110011", "secretary_invitation_chain"],
    ["202611120001", "academic_family_access"]
  ];
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
