import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  const migrated = (
    await db.query(
      "select exists(select 1 from supabase_migrations.schema_migrations where version='202610200004') as ok",
    )
  ).rows[0].ok;
  const permissions = (
    await db.query(
      "select not has_table_privilege('authenticated','public.content_view_events','update') as immutable_views,not has_table_privilege('authenticated','public.financial_files','update') as protected_files,not has_table_privilege('authenticated','public.payment_submissions','update') as reviewed_payments,not has_function_privilege('authenticated','public.finish_financial_file(uuid,integer,text,text)','execute') as server_only_finalization,not has_function_privilege('anon','public.student_account_statement(uuid)','execute') as private_statements,has_function_privilege('authenticated','public.record_content_view(uuid,text,uuid,text,text)','execute') as authorized_tracking",
    )
  ).rows[0];
  const noLoop =
    (
      await db.query(
        "select count(*)::integer as count from pg_trigger where tgrelid='public.content_view_events'::regclass and not tgisinternal",
      )
    ).rows[0].count === 0;
  const ok = migrated && Object.values(permissions).every(Boolean) && noLoop;
  console.log(
    JSON.stringify({
      ok,
      migrated,
      permissions,
      viewsDoNotTriggerRefresh: noLoop,
      personalDataPrinted: false,
    }),
  );
  if (!ok) process.exitCode = 1;
} catch (e) {
  reportFailure(e);
} finally {
  await db.end();
}
