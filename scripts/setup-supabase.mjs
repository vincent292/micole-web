import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient();
try {
  await db.connect();
  const ownerEmail = (process.env.MICOLE_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  if (ownerEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail))
      throw new Error("MICOLE_ADMIN_EMAIL no es válido.");
    await db.query("begin");
    await db.query(
      "insert into aulanexo_private.platform_admin_allowlist(email) values($1) on conflict(email) do nothing",
      [ownerEmail],
    );
    await db.query(
      "insert into public.platform_admins(user_id) select id from auth.users where lower(email)=$1 and email_confirmed_at is not null on conflict(user_id) do nothing",
      [ownerEmail],
    );
    await db.query("commit");
  }
  const { rows } = await db.query(
    "select extname from pg_extension where extname='pg_cron'",
  );
  if (!rows.length)
    await db.query(
      "create extension if not exists pg_cron with schema pg_catalog",
    );
  await db.query("select cron.schedule('micole-corte-diario','5 4 * * *',$1)", [
    "select aulanexo_private.run_billing_cycle();",
  ]);
  const result = await db.query(
    "select jobname,schedule,active from cron.job where jobname='micole-corte-diario'",
  );
  console.log(
    JSON.stringify({
      ok: true,
      adminEmailReserved: !!ownerEmail,
      billing: result.rows[0],
      note: "El administrador se habilita al verificar su correo. El corte es diario a las 00:05 de Bolivia.",
    }),
  );
} catch (e) {
  try {
    await db.query("rollback");
  } catch {}
  reportFailure(e);
} finally {
  await db.end();
}
