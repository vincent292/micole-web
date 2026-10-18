import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `ca000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, mother, father, kid, stranger] = [
  1, 2, 3, 4, 5, 6, 7,
].map(id);
const [school, otherSchool, room, otherRoom, child, otherChild] = [
  20, 21, 30, 31, 40, 41,
].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
let serial = 0;
async function as<T>(
  user: string | null,
  task: () => Promise<T>,
  support?: string,
  role = "authenticated",
) {
  const save = `auth_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role ${role};`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [
      user || "",
      JSON.stringify(support ? { "x-micole-support": support } : {}),
    ],
  );
  try {
    const result = await task();
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    throw e;
  }
}
// Para las mutaciones que sí deben persistir dentro de la transacción del caso.
async function acting<T>(user: string, task: () => Promise<T>, support?: string) {
  const save = `mutation_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role authenticated;`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [user, JSON.stringify(support ? { "x-micole-support": support } : {})],
  );
  try {
    const result = await task();
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await db.exec(`release savepoint ${save}`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save};release savepoint ${save}`);
    throw e;
  }
}
const request = async (kind = "annual_materials", amount = 0) => {
  const payload = {
    id: id(60),
    school_id: school,
    classroom_id: room,
    kind,
    academic_year: 2026,
    title: "Lista para el aula",
    details: "Cuaderno y lápices para aprender",
    event_date: "2026-10-15",
    amount,
    due_date: "2026-10-01",
    blocks_access: true,
  };
  await acting(teacher, () =>
    q("select save_academic_request($1::jsonb)", [JSON.stringify(payload)]),
  );
  return payload.id;
};
const approve = (requestId: string) =>
  acting(director, () =>
    q("select review_academic_request($1,true,'Aprobado')", [requestId]),
  );
const checkout = (
  items: any[],
  receipt = id(90),
  method = "cash",
  invoice: any = {},
  reviewed = false,
  user = director,
) =>
  acting(user, () =>
    q("select checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)", [
      receipt,
      child,
      JSON.stringify(items),
      method,
      "REC-TEST",
      JSON.stringify(invoice),
      reviewed,
    ]),
  );
beforeAll(async () => {
  await db.exec(
    `create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`,
  );
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(new URL(file, migrations), "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await db.exec(`create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text);create view vault.decrypted_secrets as select id,secret as decrypted_secret,name from vault.secrets;create function vault.create_secret(p_secret text,p_name text,p_desc text) returns uuid language plpgsql security definer as $$declare result uuid;begin insert into vault.secrets(secret,name) values(p_secret,p_name) returning id into result;return result;end $$;`);
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('ops-owner@test.bo')",
  );
  for (const [user, email] of [
    [owner, "ops-owner@test.bo"],
    [director, "ops-director@test.bo"],
    [teacher, "ops-teacher@test.bo"],
    [mother, "ops-mother@test.bo"],
    [father, "ops-father@test.bo"],
    [kid, "ops-kid@test.bo"],
    [stranger, "ops-stranger@test.bo"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into schools(id,name,slug,status) values($1,'Colegio Operaciones','ops-one','active'),($2,'Otro colegio','ops-two','active')",
    [school, otherSchool],
  );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [school, director, teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name,capacity) values($1,$2,'Primero A',2),($3,$2,'Primero B',30)",
    [room, school, otherRoom],
  );
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesora','ops-teacher@test.bo','active')",
    [id(50), school, teacher],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [school, id(50), room],
  );
  for (const [student, classroom] of [
    [child, room],
    [otherChild, otherRoom],
  ]) {
    await q(
      "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Lucía','Prueba','active',true,'Madre','ops-mother@test.bo','Padre','ops-father@test.bo',(now() at time zone 'America/La_Paz')::date+1-interval '5 years')",
      [student, school, classroom],
    );
    await q(
      "insert into platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación','2026-10',50,'paid')",
      [school, student],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  await q("insert into platform_admins(user_id) values($1) on conflict do nothing",[owner]);
  await acting(director, () =>
    q("select set_student_login($1,$2,true)", [child, "ops-kid@test.bo"]),
  );
  await acting(mother, () => q("select workspace_identity()"));
  await acting(father, () => q("select workspace_identity()"));
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});


async function server<T>(task:()=>Promise<T>){
 const point=`server_${++serial}`;await db.exec(`savepoint ${point};set local role service_role`);
 await q("select set_config('request.jwt.claim.sub','',true),set_config('request.headers','{}',true)");
 try{const result=await task();await db.exec(`reset role;release savepoint ${point}`);return result;}catch(e){await db.exec(`rollback to savepoint ${point};release savepoint ${point}`);throw e;}
}
const credentials={userName:'USUARIO-PRUEBA',password:'CONTRASENA-PRUEBA',aesKey:'LLAVE-PRUEBA',accountCredit:'CUENTA-PRIVADA-PRUEBA',encryptionMode:'bank_api'};
async function connect(scope:string|null=school,environment='production'){
 const manager=scope?director:owner;
 await acting(manager,()=>q("select save_baneco_connection($1,'Cuenta principal',$2,'A1',$3::jsonb)",[scope,environment,JSON.stringify(credentials)]));
 const version=(await acting(manager,()=>q('select bank_management_context($1) as value',[scope]))).rows[0].value;
 await server(()=>q('select bank_finish_connection_check($1,true,null)',[version]));
 await acting(manager,()=>q('select set_baneco_enabled($1,true)',[scope]));return version;
}
async function charge(n=160,amount=500,student=child){
 await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount,status,minimum_access_ratio) values($1,$2,$3,'Mensualidad',CURRENT_DATE,$4,'pending',0.5)",[id(n),school,student,amount]);return id(n);
}
async function reserve(items:any[],user=mother,kind='school',invoice:any={}){
 return (await acting(user,()=>q("select reserve_baneco_payment($1,$2,$3,$4::jsonb,$5::jsonb) as value",[kind,school,kind==='school'?child:null,JSON.stringify(items),JSON.stringify(invoice)]))).rows[0].value;
}
async function generated(r:any,qr='QR-UNICO'){
 return server(()=>q('select bank_finish_generation($1,$2,$3,$4,null,false)',[r.id,r.operationToken,qr,'data:image/png;base64,iVBORw0KGgo=']));
}
async function paid(r:any,transaction='BANCO-001'){
 const job=(await server(()=>q('select bank_claim_reconciliation($1,false) as value',[r.id]))).rows[0].value;
 expect(job).not.toBeNull();
 return server(()=>q("select bank_finish_reconciliation($1,$2,'paid',$3,null)",[r.id,job.operationToken,transaction]));
}
describe('conexiones Baneco separadas y cobros verificados',()=>{
 it('solo Dirección y el propietario guardan sus propias conexiones sin devolver secretos',async()=>{
  await connect();const value=(await as(director,()=>q('select payment_connection_status($1) as value',[school]))).rows[0].value;
  expect(value.integrationReady).toBe(true);expect(JSON.stringify(value)).not.toContain('CUENTA-PRIVADA');expect(JSON.stringify(value)).not.toContain('CONTRASENA');
  for(const user of [mother,kid,teacher,stranger])await expect(as(user,()=>q('select bank_management_context($1)',[school]))).rejects.toThrow(/permiso/);
  await expect(as(director,()=>q('select bank_management_context(null)'))).rejects.toThrow(/permiso/);
  await expect(as(director,()=>q("select save_baneco_connection($1,'Ajena','production','',$2::jsonb)",[otherSchool,JSON.stringify(credentials)]))).rejects.toThrow(/permiso/);
 });
 it('no habilita QR sin autenticación bancaria comprobada y no entrega Vault al cliente',async()=>{
  await acting(director,()=>q("select save_baneco_connection($1,'Cuenta','production','',$2::jsonb)",[school,JSON.stringify(credentials)]));
  await expect(as(director,()=>q('select set_baneco_enabled($1,true)',[school]))).rejects.toThrow(/comprueba/);
  const version=(await acting(director,()=>q('select bank_management_context($1) as value',[school]))).rows[0].value;
  await expect(as(director,()=>q('select bank_private_connection($1)',[version]))).rejects.toThrow(/permission denied/);
  expect((await server(()=>q('select bank_private_connection($1) as value',[version]))).rows[0].value.credentials.password).toBe(credentials.password);
 });
 it('conserva versiones de credenciales para conciliar QR anteriores tras un cambio de cuenta',async()=>{
  const old=await connect();await connect();
  expect((await server(()=>q('select bank_private_connection($1) as value',[old]))).rows[0].value.credentials.password).toBe(credentials.password);
  expect((await q('select count(*) as n from aulanexo_private.bank_connections')).rows[0].n).toBe(2);
 });
 it('un QR contiene la suma exacta de los abonos seleccionados y se reutiliza al repetir',async()=>{
  await connect();const c1=await charge(),c2=await charge(161,400),items=[{chargeId:c1,amount:250},{chargeId:c2,amount:400}];
  const r=await reserve(items);const again=await reserve([...items].reverse());expect(again).toEqual({id:r.id,generate:false});
  expect((await q('select amount from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0].amount).toBe('650.00');
  await expect(reserve([{chargeId:c1,amount:200}])).rejects.toThrow(/QR pendiente/);
  await expect(as(director,()=>q("select checkout_school_payment($1,$2,$3::jsonb,'cash','EFECTIVO','{}',false)",[id(170),child,JSON.stringify([{chargeId:c1,amount:250}])]))).rejects.toThrow(/QR pendiente/);
 });
 it('el navegador no confirma pagos ni altera el estado de una reserva',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:250}]);await generated(r);
  await expect(as(mother,()=>q("select bank_finish_reconciliation($1,$2,'paid','FALSO',null)",[r.id,r.operationToken]))).rejects.toThrow(/permission denied/);
  expect((await q('select paid_amount from school_charges where id=$1',[c])).rows[0].paid_amount).toBe('0.00');
 });
 it('aplica un pago bancario una sola vez, genera recibo y prepara la factura con el actor original',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:250}],mother,'school',{invoiceName:'Madre de prueba',invoiceNit:'1234567',invoicePhone:'70000000'});
  await generated(r);await paid(r);
  const row=(await q('select status,application_status from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0];expect(row).toEqual({status:'paid',application_status:'applied'});
  expect((await q('select paid_amount,status from school_charges where id=$1',[c])).rows[0]).toEqual({paid_amount:'250.00',status:'pending'});
  expect((await q('select verification_source from school_receipts where id=$1',[r.id])).rows[0].verification_source).toBe('provider');
  expect((await q('select requested_by,amount from invoice_requests where receipt_id=$1',[r.id])).rows[0]).toEqual({requested_by:mother,amount:'250.00'});
  expect((await server(()=>q('select bank_claim_reconciliation($1,false) as value',[r.id]))).rows[0].value).toBeNull();
  expect((await q('select count(*) as n from school_payments where receipt_id=$1',[r.id])).rows[0].n).toBe(1);
 });
 it('cobra activaciones y licencias con la cuenta de MiCole, nunca con la del colegio',async()=>{
  const own=await connect(null),institution=await connect();await q("update platform_charges set status='pending' where student_id=$1",[child]);const c=(await q('select id,amount from platform_charges where student_id=$1',[child])).rows[0];
  const r=await reserve([{chargeId:c.id,amount:Number(c.amount)}],mother,'platform');expect((await q('select connection_id from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0].connection_id).toBe(own);
  await generated(r);await paid(r);expect((await q('select application_status from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0].application_status).toBe('applied');
  expect((await q('select status from platform_charges where id=$1',[c.id])).rows[0].status).toBe('paid');
  expect(own).not.toBe(institution);
 });
 it('no usa la cuenta de MiCole como reemplazo de una institución sin banco habilitado',async()=>{
  await connect(null);const c=await charge();await expect(reserve([{chargeId:c,amount:500}])).rejects.toThrow(/cuenta Baneco/);
 });
 it('los enlaces públicos quedan ligados a sus cuotas y reutilizan el mismo QR sin sesión',async()=>{
  await connect();const c=await charge();const token=(await acting(director,()=>q('select create_payment_link($1,$2::jsonb) as value',[child,JSON.stringify([{chargeId:c,amount:100}])]))).rows[0].value;
  const r=(await as(null,()=>q("select reserve_baneco_link($1,'{}') as value",[token]),undefined,'anon')).rows[0].value;
  // as() rolls back by design: reserve it persistently for subsequent checks.
  const durable=(await acting(director,()=>q("select reserve_baneco_link($1,'{}') as value",[token]))).rows[0].value;
  await generated(durable);const context=(await as(null,()=>q('select payment_link_context($1) as value',[token]),undefined,'anon')).rows[0].value;
  expect(context.qrAvailable).toBe(true);expect(context.bankPayment.image).toContain('data:image/png');expect(context.total).toBe(100);
  expect(JSON.stringify(context)).not.toContain('credentials');expect(r.generate).toBe(true);
  await expect(as(null,()=>q("select reserve_baneco_link('invalid','{}')"),undefined,'anon')).rejects.toThrow(/inválido/);
 });
 it('certificación nunca acredita cuotas reales y queda identificada como prueba',async()=>{
  await connect(school,'test');const c=await charge(),r=await reserve([{chargeId:c,amount:500}]);await generated(r);await paid(r);
  expect((await q('select application_status from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0].application_status).toBe('test');expect((await q('select paid_amount from school_charges where id=$1',[c])).rows[0].paid_amount).toBe('0.00');
 });
 it('una cuota anulada después de emitir el QR conserva el pago bancario para revisión, sin duplicarlo',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:500}]);await generated(r);await q("update school_charges set status='cancelled' where id=$1",[c]);await paid(r);
  expect((await q('select status,application_status from aulanexo_private.bank_qr_intents where id=$1',[r.id])).rows[0]).toEqual({status:'paid',application_status:'review'});
  expect((await q('select count(*) as n from school_receipts where id=$1',[r.id])).rows[0].n).toBe(0);
 });
 it('no reemite un QR de resultado desconocido y solo libera reservas al confirmar cancelación',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:500}]);
  await server(()=>q("select bank_finish_generation($1,$2,null,null,'bank-timeout',false)",[r.id,r.operationToken]));
  expect((await reserve([{chargeId:c,amount:500}])).id).toBe(r.id);
  await q("update aulanexo_private.bank_qr_intents set status='pending',qr_id='QR-UNICO' where id=$1",[r.id]);
  const job=(await server(()=>q('select bank_claim_reconciliation($1,true) as value',[r.id]))).rows[0].value;
  await server(()=>q("select bank_finish_reconciliation($1,$2,'cancelled',null,null)",[r.id,job.operationToken]));
  expect((await reserve([{chargeId:c,amount:500}])).id).not.toBe(r.id);
 });
 it('el servidor de enlaces públicos recibe solo el QR autorizado por el token',async()=>{
  await connect();const c=await charge();const token=(await acting(director,()=>q('select create_payment_link($1,$2::jsonb) as value',[child,JSON.stringify([{chargeId:c,amount:100}])]))).rows[0].value;
  const r=(await server(()=>q("select reserve_baneco_link($1,'{}') as value",[token]))).rows[0].value;await generated(r);
  expect((await server(()=>q('select payment_link_context($1) as value',[token]))).rows[0].value.bankPayment.id).toBe(r.id);
 });
 it('el enlace antiguo no crea cobros adicionales después de un abono en efectivo',async()=>{
  await connect();const c=await charge();const token=(await acting(director,()=>q('select create_payment_link($1,$2::jsonb) as value',[child,JSON.stringify([{chargeId:c,amount:100}])]))).rows[0].value;
  await checkout([{chargeId:c,amount:450}]);
  await expect(server(()=>q("select reserve_baneco_link($1,'{}')",[token]))).rejects.toThrow(/saldos cambiaron/);
 });
 it('no genera pagos de producción para instituciones marcadas de prueba, ni desde un enlace público',async()=>{
  await connect();const c=await charge();const token=(await acting(director,()=>q('select create_payment_link($1,$2::jsonb) as value',[child,JSON.stringify([{chargeId:c,amount:100}])]))).rows[0].value;
  await q('insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values($1,true,$2)',[school,owner]);
  await expect(server(()=>q("select reserve_baneco_link($1,'{}')",[token]))).rejects.toThrow(/pruebas/);
 });
 it('el mismo identificador de transacción bancaria no se acredita dos veces',async()=>{
  await connect();const c1=await charge(),c2=await charge(161),r1=await reserve([{chargeId:c1,amount:100}]),r2=await reserve([{chargeId:c2,amount:100}]);await generated(r1,'QR-UNO');await generated(r2,'QR-DOS');await paid(r1,'BANCO-IGUAL');await paid(r2,'BANCO-IGUAL');
  expect((await q('select status from aulanexo_private.bank_qr_intents where id=$1',[r2.id])).rows[0].status).toBe('review');
  expect((await q('select paid_amount from school_charges where id=$1',[c2])).rows[0].paid_amount).toBe('0.00');
 });

 it('el superadmin consulta sus cobros de plataforma y entra por soporte para ver QR escolares',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:100}]);
  await expect(as(owner,()=>q('select baneco_payment_context($1)',[r.id]))).rejects.toThrow(/acceso/);
  expect((await as(owner,()=>q('select baneco_payment_register(null) as value'))).rows[0].value).toEqual([]);
  await acting(owner,()=>q('select set_test_institution($1,true)',[school]));
  const session=(await acting(owner,()=>q("select start_test_session($1,'director',null,null) as value",[school]))).rows[0].value.id;
  expect((await as(owner,()=>q('select baneco_payment_context($1) as value',[r.id]),session)).rows[0].value.id).toBe(r.id);
 });

 it('editar la etiqueta con credenciales vacías conserva los secretos y requiere comprobar de nuevo',async()=>{
  const old=await connect();await acting(director,()=>q("select save_baneco_connection($1,'Cuenta actualizada','production','A1',null)",[school]));
  const value=(await as(director,()=>q('select payment_connection_status($1) as value',[school]))).rows[0].value;
  expect(value.id).not.toBe(old);expect(value.accountReference).toBe('Cuenta actualizada');expect(value.integrationReady).toBe(false);
  const stored=(await server(()=>q('select bank_private_connection($1) as value',[value.id]))).rows[0].value;
  expect(stored.credentials).toEqual(credentials);
 });

});
