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
  await db.exec(`create schema if not exists extensions;
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
create function extensions.pgp_sym_encrypt(value text,key text,options text) returns bytea language sql as $$select convert_to(reverse(value),'UTF8')$$;
create function extensions.pgp_sym_decrypt(value bytea,key text) returns text language sql as $$select reverse(convert_from(value,'UTF8'))$$;
create function extensions.hmac(value bytea,key bytea,algorithm text) returns bytea language sql as $$select sha256(value||key)$$;`);
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
 await server(()=>q('select bank_generation_context($1,$2)',[r.id,r.operationToken]));
 return server(()=>q('select bank_finish_generation($1,$2,$3,$4,null,false)',[r.id,r.operationToken,qr,'data:image/png;base64,iVBORw0KGgo=']));
}
async function paid(r:any,transaction='BANCO-001'){
 const job=(await server(()=>q('select bank_claim_reconciliation($1,false) as value',[r.id]))).rows[0].value;
 expect(job).not.toBeNull();
 return server(()=>q("select bank_finish_reconciliation($1,$2,'paid',$3,null)",[r.id,job.operationToken,transaction]));
}

const account=async(user=director)=>(await as(user,()=>q('select platform_credit_account($1) as value',[school]))).rows[0].value;
async function fund(environment='production'){
 await connect(null,environment);
 const c=(await q("select id from platform_charges where school_id=$1 and kind='credit_topup'",[school])).rows[0];
 const r=await reserve([{chargeId:c.id,amount:500}],director,'platform');await generated(r);await paid(r);return r;
}
describe('crédito inicial, recogidas y solicitudes de demo',()=>{
 it('exige Bs 500 en escuelas actuales y nuevas, sin acceso académico antes de confirmar',async()=>{
  const a=await account();expect(a.initialPaid).toBe(false);expect(a.balance).toBe(0);expect(a.initialAmount).toBe(500);
  await expect(as(mother,()=>q('select platform_credit_account($1)',[school]))).rejects.toThrow(/Dirección/);
  expect((await as(director,()=>q('select platform_school_enabled($1) as enabled',[school]))).rows[0].enabled).toBe(false);
  await expect(as(director,()=>q("select school_workspace($1,current_date,current_date)",[school]))).rejects.toThrow(/500/);
  await expect(request()).rejects.toThrow(/500/);
 });
 it('solo el banco de producción acredita; el cobro manual no modifica saldo',async()=>{
  const c=(await q("select id from platform_charges where school_id=$1 and kind='credit_topup'",[school])).rows[0];
  await expect(as(owner,()=>q("select record_platform_payment($1,'cash','MANUAL')",[c.id]))).rejects.toThrow(/bancaria/);
  await fund();const a=await account();expect(a.initialPaid).toBe(true);expect(a.balance).toBe(442);expect(a.history.filter((h:any)=>h.kind==='funding')).toHaveLength(1);
  expect((await q('select platform_enabled from schools where id=$1',[school])).rows[0].platform_enabled).toBe(true);
  const intent=(await q("select id from aulanexo_private.bank_qr_intents where kind='platform' order by created_at desc limit 1")).rows[0].id;
  await q('select aulanexo_private.apply_baneco_payment($1)',[intent]);expect((await account()).balance).toBe(442);
 });
 it('inscribe sin activar Bs 50 y descuenta únicamente la licencia mensual',async()=>{
  await fund();await q('insert into school_operation_settings(school_id,require_annual_materials) values($1,false) on conflict(school_id) do update set require_annual_materials=false',[school]);
  const student={id:id(840),school_id:school,classroom_id:otherRoom,first_name:'Nueva',last_name:'Inscripción',birth_date:'2020-01-01',identity_number:'840840',mother_name:'Madre',mother_email:'ops-mother@test.bo',father_name:'Padre',father_email:'ops-father@test.bo',monthly_fee:400,activation_fee_quote:0};
  const plan={id:id(841),school_id:school,student_id:student.id,start_date:new Date().toISOString().slice(0,10),months:2,monthly_fee:400,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,prorate:false,license_fee:29};
  await acting(director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]));
  expect((await q("select id from platform_charges where student_id=$1 and kind='activation'",[student.id])).rows).toHaveLength(0);expect((await account()).balance).toBe(413);
 });
 it('habilita inscripciones pendientes al confirmar el adelanto, sin reactivar bajas',async()=>{
  await q("insert into students(id,school_id,classroom_id,first_name,last_name,status) values($1,$2,$3,'Pendiente','Temporal','pending'),($4,$2,$3,'Baja','Temporal','inactive')",[id(850),school,otherRoom,id(851)]);
  await fund();expect((await q('select status from students where id=$1',[id(850)])).rows[0].status).toBe('active');expect((await q('select status from students where id=$1',[id(851)])).rows[0].status).toBe('inactive');expect((await account()).balance).toBe(413);
 });
 it('no habilita la institución al falsificar campos públicos ni marcar el adelanto sin prueba bancaria',async()=>{
  await expect(as(director,()=>q('update schools set platform_enabled=true where id=$1',[school]))).rejects.toThrow();
  await expect(as(null,()=>q("update platform_charges set status='paid' where school_id=$1 and kind='credit_topup'",[school]),undefined,'postgres')).rejects.toThrow(/confirmado/);
  expect((await account()).initialPaid).toBe(false);
 });
 it('certificación no crea dinero real ni habilita la institución',async()=>{
  await fund('test');const a=await account();expect(a.initialPaid).toBe(false);expect(a.balance).toBe(0);
 });
 it('cubre 17 licencias y conserva Bs 7 para descontar del siguiente saldo',async()=>{
  await fund();
  await q("insert into platform_charges(school_id,kind,concept,period,amount,license_count,unit_amount) values($1,'license','Otras 15 licencias',to_char(current_date,'YYYY-MM'),435,15,29)",[school]);
  expect((await account()).balance).toBe(7);
  const c=(await q("insert into platform_charges(school_id,kind,concept,period,amount,license_count,unit_amount) values($1,'license','Otra licencia',to_char(current_date,'YYYY-MM'),29,1,29) returning id",[school])).rows[0];
  const row=(await q('select amount,credit_applied,status from platform_charges where id=$1',[c.id])).rows[0];expect(Number(row.amount)).toBe(29);expect(Number(row.credit_applied)).toBe(7);expect(row.status).toBe('pending');
  expect((await account()).balance).toBe(0);
  await expect(reserve([{chargeId:c.id,amount:29}],director,'platform')).rejects.toThrow(/cobros pendientes/);
  const r=await reserve([{chargeId:c.id,amount:22}],director,'platform');await generated(r,'QR-SALDO');await paid(r,'BANCO-SALDO');
  expect((await q('select status from platform_charges where id=$1',[c.id])).rows[0].status).toBe('paid');
  expect(Number((await q('select amount from platform_payments where charge_id=$1',[c.id])).rows[0].amount)).toBe(22);
 });
 it('el cliente y superadmin no pueden editar crédito ni borrar su historial',async()=>{
  await fund();
  await expect(as(owner,()=>q('update aulanexo_private.platform_credit_ledger set mac=mac'))).rejects.toThrow(/permission denied/);
  await expect(as(null,()=>q('delete from aulanexo_private.platform_credit_ledger'),undefined,'postgres')).rejects.toThrow(/inmutables/);
  const row=(await q("select id from platform_charges where school_id=$1 and kind='license' limit 1",[school])).rows[0];
  await expect(as(owner,()=>q('update platform_charges set credit_applied=0 where id=$1',[row.id]))).rejects.toThrow(/permission denied/);
  await expect(as(null,()=>q('update platform_charges set credit_applied=0 where id=$1',[row.id]),undefined,'postgres')).rejects.toThrow(/servidor|alterarse/);
 });
 it('la emisión mensual es idempotente, incluye nuevas altas y no factura la baja',async()=>{
  await fund();const count=(await q('select count(*)::int as n from aulanexo_private.platform_license_assessments where school_id=$1',[school])).rows[0].n;
  expect(count).toBe(2);await acting(owner,()=>q("select generate_platform_invoice($1,to_char(current_date,'YYYY-MM'))",[school]));
  expect((await q('select count(*)::int as n from aulanexo_private.platform_license_assessments where school_id=$1',[school])).rows[0].n).toBe(2);
  await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,enrolled_at) values($1,$2,$3,'Nuevo','Demo','active',current_date)",[id(810),school,otherRoom]);
  expect((await q('select count(*)::int as n from aulanexo_private.platform_license_assessments where school_id=$1',[school])).rows[0].n).toBe(3);
 });
 it('activación está apagada, acepta tarifa cero efectiva y solo el propietario la habilita',async()=>{
  let fees=(await as(null,()=>q('select platform_tariffs(null) as value'),undefined,'anon')).rows[0].value;expect(fees.activationEnabled).toBe(false);expect(Number(fees.activationFee)).toBe(0);
  await expect(as(director,()=>q("select set_platform_activation(true,'Prueba de permiso')"))).rejects.toThrow(/propietario/);
  await acting(owner,()=>q("select set_platform_activation(true,'Activar en nuevas inscripciones')"));fees=(await as(null,()=>q('select platform_tariffs(null) as value'),undefined,'anon')).rows[0].value;expect(fees.activationEnabled).toBe(true);expect(Number(fees.activationFee)).toBe(50);
 });
 it('rechaza solicitudes de recogida sin foto y restringe las cargas a madre o padre',async()=>{
  await fund();await expect(as(mother,()=>q("insert into family_requests(school_id,student_id,type,request_date,reason,pickup_name,pickup_id) values($1,$2,'pickup',current_date,'Autorización','Persona Demo','123456')",[school,child]))).rejects.toThrow(/carnet/);
  await expect(as(teacher,()=>q("select reserve_pickup_identity($1,$2,'ci.jpg','image/jpeg',50)",[id(820),child]))).rejects.toThrow(/madre o padre/);
  const prepared=(await acting(mother,()=>q("select reserve_pickup_identity($1,$2,'ci.jpg','image/jpeg',50) as value",[id(820),child]))).rows[0].value;
  await expect(as(mother,()=>q("select finish_pickup_identity($1,50,'image/jpeg','fake')",[prepared.id]))).rejects.toThrow(/permission denied/);
  const file=(await q('select * from pickup_identity_files where id=$1',[prepared.id])).rows[0],key=`${file.school_id}/pickups/${file.request_id}/${file.id}/file.jpg`;
  await server(()=>q("select finish_pickup_identity($1,50,'image/jpeg',$2)",[file.id,key]));
  await acting(mother,()=>q("insert into family_requests(id,school_id,student_id,type,request_date,reason,pickup_name,pickup_id,pickup_file_id) values($1,$2,$3,'pickup',current_date,'Autorización','Persona Demo','123456',$4)",[id(820),school,child,file.id]));
  expect((await as(teacher,()=>q('select may_read_pickup_identity($1) as ok',[file.id]))).rows[0].ok).toBe(true);
  expect((await as(stranger,()=>q('select may_read_pickup_identity($1) as ok',[file.id]))).rows[0].ok).toBe(false);
  await acting(teacher,()=>q("update family_requests set status='approved',response='Autorización revisada' where id=$1",[id(820)]));
  await expect(as(mother,()=>q("select confirm_pickup_identity($1,'Comparación presencial')",[id(820)]))).rejects.toThrow(/docente/);
  await acting(teacher,()=>q("select confirm_pickup_identity($1,'Comparé foto y documento presencialmente')",[id(820)]));
  expect((await q('select pickup_verified_by from family_requests where id=$1',[id(820)])).rows[0].pickup_verified_by).toBe(teacher);
 });
 it('las solicitudes públicas de demo solo se crean por el endpoint y se revisan como propietario',async()=>{
  const payload={schoolName:'Colegio Demo',contactName:'Contacto Demo',email:'contacto@example.test',phone:'70000000',city:'La Paz',consent:true};
  await expect(as(null,()=>q('select submit_demo_request($1,$2::jsonb,$3)',[id(830),JSON.stringify(payload),'a'.repeat(64)]),undefined,'anon')).rejects.toThrow(/permission denied/);
  const r=(await server(()=>q('select submit_demo_request($1,$2::jsonb,$3) as id',[id(830),JSON.stringify(payload),'a'.repeat(64)]))).rows[0].id;
  expect((await as(director,()=>q('select * from demo_requests'))).rows).toHaveLength(0);
  await acting(owner,()=>q("select review_demo_request($1,'contacted','Se coordinó una demostración')",[r]));
  expect((await as(owner,()=>q('select status from demo_requests'))).rows[0].status).toBe('contacted');
 });
});
