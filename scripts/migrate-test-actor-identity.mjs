import fs from 'node:fs';
import assert from 'node:assert/strict';
import { databaseClient, reportFailure } from './database.mjs';
const db = databaseClient(), apply = process.argv.includes('--apply');
const version = '202611030001', name = 'test_actor_identity';
try {
  await db.connect();
  await db.query('begin');
  await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
  const alreadyApplied = (await db.query('select 1 from supabase_migrations.schema_migrations where version=$1', [version])).rowCount > 0;
  const before = (await db.query("select oid::text,prosecdef,proconfig,proacl::text from pg_proc where oid in ('public.stamp_author()'::regprocedure,'aulanexo_private.capture_audit()'::regprocedure) order by oid")).rows;
  if (!alreadyApplied) {
    const sql = fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`, import.meta.url), 'utf8');
    await db.query(sql);
    if (apply) await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])', [version, name, [sql]]);
  }
  const after = (await db.query("select oid::text,prosecdef,proconfig,proacl::text from pg_proc where oid in ('public.stamp_author()'::regprocedure,'aulanexo_private.capture_audit()'::regprocedure) order by oid")).rows;
  assert.deepEqual(after, before, 'Function privileges or security attributes changed');
  const definitions = (await db.query("select pg_get_functiondef('public.stamp_author()'::regprocedure) author,pg_get_functiondef('aulanexo_private.capture_audit()'::regprocedure) audit")).rows[0];
  assert.ok(definitions.author.includes("public.workspace_identity()->>'name'"));
  assert.ok(definitions.audit.includes("'targetTeacherId',context.teacher_id"));
  await db.query(apply ? 'commit' : 'rollback');
  if (apply) await db.query("notify pgrst,'reload schema'");
  console.log(JSON.stringify({ ok: true, migration: version, applied: apply, alreadyApplied, grantsAndSecurityAttributesUnchanged: true, valuesPrinted: false }));
} catch (e) {
  await db.query('rollback').catch(() => {});
  reportFailure(e);
} finally {
  await db.end();
}
