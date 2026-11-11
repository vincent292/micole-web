import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";

// Synthetic fixtures only; always roll back. Never sends messages or invokes a bank.
const db = databaseClient();
const ids = Object.fromEntries(["owner", "director", "school", "room", "first", "second", "request", "invalidRequest"].map(key => [key, randomUUID()]));
const suffix = randomUUID().slice(0, 8);
async function acting(sql, params) {
  await db.query("savepoint actor");
  await db.query("set local role authenticated");
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)", [ids.director]);
  try {
    const result = await db.query(sql, params);
    await db.query("reset role");
    await db.query("select set_config('request.jwt.claim.sub','',true)");
    await db.query("release savepoint actor");
    return result;
  } catch (error) {
    await db.query("rollback to savepoint actor");
    await db.query("release savepoint actor");
    throw error;
  }
}
const check = (value, message) => { if (!value) throw new Error(message); };
try {
  await db.connect();
  await db.query("begin");
  const ownerEmail = `micole-kinder-owner-${suffix}@example.invalid`;
  await db.query("insert into aulanexo_private.platform_admin_allowlist(email) values($1)", [ownerEmail]);
  for (const [id, email] of [[ids.owner, ownerEmail], [ids.director, `micole-kinder-director-${suffix}@example.invalid`]]) await db.query("insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),'{}')", [id, email]);
  await db.query("insert into platform_admins(user_id) values($1) on conflict do nothing", [ids.owner]);
  await db.query("insert into schools(id,name,slug,status,show_on_landing,education_levels) values($1,'Kínder temporal',$2,'active',false,array['Inicial'])", [ids.school, `kinder-smoke-${suffix}`]);
  await db.query("insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)", [ids.school, ids.owner]);
  await db.query("insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)", [ids.school, ids.owner]);
  await db.query("insert into school_memberships(school_id,user_id,role) values($1,$2,'director')", [ids.school, ids.director]);
  const day = (await db.query("select to_char(now() at time zone 'America/La_Paz','YYYY-MM-DD') as value")).rows[0].value;
  const year = Number(day.slice(0, 4));
  await db.query("insert into classrooms(id,school_id,name,level,academic_year,active) values($1,$2,'Inicial temporal','Inicial',$3,true)", [ids.room, ids.school, year]);
  for (const id of [ids.first, ids.second]) await db.query("insert into students(id,school_id,classroom_id,first_name,last_name,birth_date,status,profile_complete) values($1,$2,$3,'Niño','Temporal','2022-01-01','active',true)", [id, ids.school, ids.room]);
  await acting("select save_school($1::jsonb)", [JSON.stringify({ id: ids.school, workspace_mode: "kinder" })]);
  check((await db.query("select workspace_mode from schools where id=$1", [ids.school])).rows[0].workspace_mode === "kinder", "No se conservó el modo de trabajo.");
  const records = [
    { student_id: ids.first, kind: "meal", occurred_at: "09:00", food: "Merienda de prueba", amount: "all", note: "" },
    { student_id: ids.second, kind: "meal", occurred_at: "09:00", food: "Merienda de prueba", amount: "half", note: "Observación de prueba individual." },
  ];
  const submit = (request, rows) => acting("select save_care_batch($1,$2,$3,$4,$5::jsonb) as result", [ids.school, ids.room, day, request, JSON.stringify(rows)]);
  const first = (await submit(ids.request, records)).rows[0].result;
  const retry = (await submit(ids.request, records)).rows[0].result;
  const count = async () => Number((await db.query("select count(*) as n from care_records where school_id=$1", [ids.school])).rows[0].n);
  check(first.saved === 2 && retry.saved === 2 && await count() === 2, "El guardado o su reintento no conservó dos registros.");
  let rejected = false;
  try { await submit(ids.invalidRequest, [records[0], { ...records[1], amount: "invalid" }]); }
  catch { rejected = true; }
  check(rejected && await count() === 2, "Un lote inválido conservó cambios parciales.");
  check((await db.query("select count(*)::integer as n from aulanexo_private.care_batch_requests where school_id=$1", [ids.school])).rows[0].n === 1, "Se duplicó el pedido de cuidados.");
  await db.query("rollback");
  check(!(await db.query("select exists(select 1 from schools where id=$1) as present", [ids.school])).rows[0].present, "No se revirtieron los datos temporales.");
  console.log(JSON.stringify({ ok: true, workspaceModeSaved: true, childrenSaved: 2, retryWithoutDuplicates: true, invalidBatchRolledBack: true, rolledBack: true }));
} catch (error) {
  await db.query("rollback").catch(() => {});
  reportFailure(error);
} finally { await db.end(); }
