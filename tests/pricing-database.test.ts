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

async function rates(scope:string|null=school,activation=60,monthly=35){return acting(owner,()=>q("select save_platform_tariffs($1,$2,$3,'Ajuste de tarifa autorizado',false)",[scope,activation,monthly]));}
async function plan(n=210,months=3,start='2030-01-01',discount=0){const payload={id:id(n),school_id:school,student_id:child,start_date:start,months,monthly_fee:400,snack_fee:20,enrollment_fee:0,due_day:10,discount,discount_from:start,discount_to:'2030-12-31',prorate:false};await acting(director,()=>q('select create_payment_plan($1::jsonb)',[JSON.stringify(payload)]));return payload.id;}
describe('tarifas e importes emitidos',()=>{
 it('solo el propietario configura tarifas generales o por institución',async()=>{
  for(const user of [director,teacher,mother,kid,stranger])await expect(as(user,()=>q("select save_platform_tariffs($1,60,35,'Cambio de tarifa',false)",[school]))).rejects.toThrow(/propietario/);
  await rates(null,65,32);expect((await as(null,()=>q('select platform_tariffs(null) as value'),undefined,'anon')).rows[0].value).toMatchObject({activationFee:65,monthlyLicenseFee:32});
  await expect(as(null,()=>q('select platform_tariffs($1)',[school]),undefined,'anon')).rejects.toThrow(/permiso/);
 });
 it('las tarifas institucionales sustituyen las generales y pueden volver a heredarlas',async()=>{
  await rates(null,65,32);await rates(school,55,25);
  expect((await as(director,()=>q('select platform_tariffs($1) as value',[school]))).rows[0].value).toMatchObject({activationFee:55,monthlyLicenseFee:25,inherited:false});
  await acting(owner,()=>q("select save_platform_tariffs($1,null,null,'Volver a la tarifa general',true)",[school]));
  expect((await as(director,()=>q('select platform_tariffs($1) as value',[school]))).rows[0].value).toMatchObject({activationFee:65,monthlyLicenseFee:32,inherited:true});
 });
 it('la activación nueva toma la tarifa vigente sin alterar las ya emitidas',async()=>{
  await rates();await q('insert into school_operation_settings(school_id,require_annual_materials) values($1,false) on conflict(school_id) do update set require_annual_materials=false',[school]);
  const payload={id:id(72),school_id:school,classroom_id:room,first_name:'Nueva',last_name:'Inscrita',birth_date:'2020-01-01',identity_number:'1234567',mother_name:'Madre Nueva',mother_email:'madre-nueva@example.invalid',father_name:'Padre Nuevo',father_email:'padre-nuevo@example.invalid',monthly_fee:400};
  await acting(director,()=>q('select enroll_student($1::jsonb)',[JSON.stringify(payload)]));
  expect((await q('select amount from platform_charges where student_id=$1',[id(72)])).rows[0].amount).toBe('60.00');
  expect((await q('select amount from platform_charges where student_id=$1',[child])).rows[0].amount).toBe('50.00');
 });
 it('el plan fija la licencia vigente y no confía en un importe enviado por el cliente',async()=>{
  await rates();const p=await plan();expect((await q('select license_fee from payment_plans where id=$1',[p])).rows[0].license_fee).toBe('35.00');
  expect((await q('select amount,license_amount from school_charges where plan_id=$1',[p])).rows.every(c=>c.amount==='455.00'&&c.license_amount==='35.00')).toBe(true);
  await rates(school,40,15);expect((await q('select amount from school_charges where plan_id=$1',[p])).rows.every(c=>c.amount==='455.00')).toBe(true);
 });
 it('el corte y la liquidación multiplican la tarifa real y conservan la cantidad de alumnos',async()=>{
  await rates();await acting(owner,()=>q('select run_billing_cycle()'));
  const billing=(await q('select amount,license_count,unit_amount from platform_charges where school_id=$1 and student_id is null',[school])).rows[0];expect(billing).toEqual({amount:'70.00',license_count:2,unit_amount:'35.00'});
  const charges=(await q('select license_amount from school_charges where school_id=$1',[school])).rows;expect(charges.every(c=>c.license_amount==='35.00')).toBe(true);
  await acting(owner,()=>q("select generate_platform_invoice($1,'2030-06')",[school]));expect((await q("select amount,license_count from platform_charges where school_id=$1 and period='2030-06'",[school])).rows[0]).toEqual({amount:'70.00',license_count:2});
 });
 it('las nuevas tarifas y descuentos nunca disminuyen cuotas ya creadas',async()=>{
  const p=await plan(210,3,'2030-01-01',25),before=(await q('select id,amount,discount_amount from school_charges where plan_id=$1 order by id',[p])).rows;
  await acting(director,()=>q("select adjust_plan_discount($1,200,'2030-01-01','2030-12-31')",[p]));
  expect((await q('select id,amount,discount_amount from school_charges where plan_id=$1 order by id',[p])).rows).toEqual(before);
  await expect(q('update school_charges set amount=amount-1 where id=$1',[before[0].id])).rejects.toThrow(/no se puede disminuir/);
 });
 it('Dirección puede aumentar una cuota propia con motivo, pero nunca rebajarla',async()=>{
  const c=await charge();await acting(director,()=>q("select increase_issued_charge('school',$1,550,'Corrección del importe acordado')",[c]));expect((await q('select amount from school_charges where id=$1',[c])).rows[0].amount).toBe('550.00');
  await expect(as(director,()=>q("select increase_issued_charge('school',$1,400,'Solicitan una rebaja')",[c]))).rejects.toThrow(/no se puede disminuir/);
  for(const user of [mother,teacher,stranger,owner])await expect(as(user,()=>q("select increase_issued_charge('school',$1,600,'Cambio no permitido')",[c]))).rejects.toThrow(/Dirección/);
 });
 it('el propietario aumenta cobros MiCole, Dirección no cambia la tarifa SaaS',async()=>{
  const c=(await q('select id from platform_charges where student_id=$1',[child])).rows[0].id;await q("update platform_charges set status='pending' where id=$1",[c]);
  await acting(owner,()=>q("select increase_issued_charge('platform',$1,70,'Importe acordado con institución')",[c]));
  expect((await q('select amount from platform_charges where id=$1',[c])).rows[0].amount).toBe('70.00');
  await expect(as(director,()=>q("select increase_issued_charge('platform',$1,80,'Cambio no autorizado')",[c]))).rejects.toThrow(/propietario/);
 });
 it('no modifica cuotas pagadas ni cuotas reservadas por un QR',async()=>{
  await connect();const c=await charge(),r=await reserve([{chargeId:c,amount:100}]);
  await expect(as(director,()=>q("select increase_issued_charge('school',$1,600,'Cambio durante cobro')",[c]))).rejects.toThrow(/QR pendiente/);
  await generated(r);await paid(r);await acting(director,()=>q("select increase_issued_charge('school',$1,600,'Corrección posterior al abono')",[c]));
  expect((await q('select amount,paid_amount from school_charges where id=$1',[c])).rows[0]).toEqual({amount:'600.00',paid_amount:'100.00'});
 });
 it('los abonos cubren el saldo sin modificar el importe original de la cuota',async()=>{
  const c=await charge();await checkout([{chargeId:c,amount:250}]);expect((await q('select amount,paid_amount,status from school_charges where id=$1',[c])).rows[0]).toEqual({amount:'500.00',paid_amount:'250.00',status:'pending'});
  await checkout([{chargeId:c,amount:250}],id(91));expect((await q('select amount,paid_amount,status from school_charges where id=$1',[c])).rows[0]).toEqual({amount:'500.00',paid_amount:'500.00',status:'paid'});
  await expect(as(director,()=>q("select increase_issued_charge('school',$1,600,'Cambio después del pago')",[c]))).rejects.toThrow(/pagada/);
 });
 it('cambiar la mensualidad del estudiante afecta nuevas emisiones y conserva las ya creadas',async()=>{
  const p=await plan(),before=(await q('select id,amount from school_charges where plan_id=$1 order by id',[p])).rows;
  await acting(director,()=>q("select set_student_fees($1,200,10,0,'Nuevo acuerdo para siguientes emisiones')",[child]));
  expect((await q('select monthly_fee,snack_fee from students where id=$1',[child])).rows[0]).toEqual({monthly_fee:'200.00',snack_fee:'10.00'});
  expect((await q('select id,amount from school_charges where plan_id=$1 order by id',[p])).rows).toEqual(before);
  await expect(as(mother,()=>q("select set_student_fees($1,100,0,0,'Cambio familiar no permitido')",[child]))).rejects.toThrow(/Dirección/);
  await acting(owner,()=>q('select run_billing_cycle()'));
  expect((await q("select amount from school_charges where student_id=$1 and period=to_char(CURRENT_DATE,'YYYY-MM')",[child])).rows[0].amount).toBe('239.00');
 });

 it('rechaza una licencia cotizada antes de un cambio de tarifa y no crea el plan',async()=>{
  await rates();const payload={id:id(290),school_id:school,student_id:child,start_date:'2030-01-01',months:2,monthly_fee:400,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,license_fee:29,prorate:false};
  await expect(as(director,()=>q('select create_payment_plan($1::jsonb)',[JSON.stringify(payload)]))).rejects.toThrow(/tarifa.*cambió/);
  expect((await q('select id from payment_plans where id=$1',[id(290)])).rows).toHaveLength(0);
 });
 it('reporta la cantidad de licencias sin dividir por el precio antiguo de Bs 29',async()=>{
  await rates();await acting(owner,()=>q("select generate_platform_invoice($1,'2030-06')",[school]));
  const report=(await as(owner,()=>q("select financial_report($1,'2030-01-01','2030-12-31',null,null) as value",[school]))).rows[0].value;
  expect(report.charges.filter((c:any)=>c.kind==='license')[0]).toMatchObject({amount:70,licenseCount:2});
 });

});
