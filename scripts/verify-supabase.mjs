import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  const migrations = (
    await db.query(
      "select version from supabase_migrations.schema_migrations order by version",
    )
  ).rows;
  const tables = (
    await db.query(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relname=any($1) order by relname",
      [
        [
          "schools",
          "students",
          "student_guardians",
          "school_charges",
          "invitations",
          "notifications",
          "institution_requests",
          "audit_events",
          "messages",
          "family_intake_forms",
          "student_documents",
        ],
      ],
    )
  ).rows;
  const cron = (
    await db.query(
      "select jobname,schedule,active from cron.job where jobname='micole-corte-diario'",
    )
  ).rows;
  const reserved = Number(
    (
      await db.query(
        "select count(*) as total from aulanexo_private.platform_admin_allowlist",
      )
    ).rows[0].total,
  );
  const response = await fetch(
    process.env.VITE_SUPABASE_URL + "/auth/v1/settings",
    { headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
  );
  const providers = await response.json();
  console.log(
    JSON.stringify({
      ok: tables.length === 11 && tables.every((t) => t.relrowsecurity),
      migrations,
      tables,
      cron,
      adminEmailsReserved: reserved,
      auth: {
        email: providers.external?.email === true,
        emailAutoConfirm: providers.mailer_autoconfirm === true,
        google: providers.external?.google === true,
      },
    }),
  );
} catch (e) {
  reportFailure(e);
} finally {
  await db.end();
}
