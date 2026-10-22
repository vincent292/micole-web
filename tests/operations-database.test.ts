import {enableActivationFixture,fundInstitutionFixtures} from "./funded-institution-fixture";
import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite();const id=(n:number)=>`ca000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,director,teacher,mother,father,kid,stranger]=[1,2,3,4,5,6,7].map(id);
const [school,otherSchool,room,otherRoom,child,otherChild]=[20,21,30,31,40,41].map(id);
const q=(sql:string,args:unknown[]=[])=>db.query<any>(sql,args);
let serial=0;
async function as<T>(user:string|null,task:()=>Promise<T>,support?:string,role='authenticated') {
 const save=`auth_scope_${++serial}`;await db.exec(`savepoint ${save};set local role ${role};`);
 await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",[user||'',JSON.stringify(support?{'x-micole-support':support}:{})]);
 try{const result=await task();await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);return result;}
 catch(e){await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);throw e;}
}
// Para las mutaciones que sí deben persistir dentro de la transacción del caso.
async function acting<T>(user:string,task:()=>Promise<T>) {
 const save=`mutation_scope_${++serial}`;await db.exec(`savepoint ${save};set local role authenticated;`);await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",[user]);
 try{const result=await task();await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',true)");await db.exec(`release savepoint ${save}`);return result;}
 catch(e){await db.exec(`rollback to savepoint ${save};release savepoint ${save}`);throw e;}
}
const request=async(kind='annual_materials',amount=0)=>{
 const payload={id:id(60),school_id:school,classroom_id:room,kind,academic_year:2026,title:'Lista para el aula',details:'Cuaderno y lápices para aprender',event_date:'2026-10-15',amount,due_date:'2026-10-01',blocks_access:true};
 await acting(teacher,()=>q('select save_academic_request($1::jsonb)',[JSON.stringify(payload)]));return payload.id;
};
const approve=(requestId:string)=>acting(director,()=>q("select review_academic_request($1,true,'Aprobado')",[requestId]));
const checkout=(items:any[],receipt=id(90),method='cash',invoice:any={},reviewed=false,user=director)=>acting(user,()=>q('select checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)',[receipt,child,JSON.stringify(items),method,'REC-TEST',JSON.stringify(invoice),reviewed]));
beforeAll(async()=>{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
 const migrations=new URL('../supabase/migrations/',import.meta.url);for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,migrations),'utf8').replace('create extension if not exists pgcrypto;',''));
  await enableActivationFixture(db);
 await q("insert into aulanexo_private.platform_admin_allowlist(email) values('ops-owner@test.bo')");
 for(const [user,email]of[[owner,'ops-owner@test.bo'],[director,'ops-director@test.bo'],[teacher,'ops-teacher@test.bo'],[mother,'ops-mother@test.bo'],[father,'ops-father@test.bo'],[kid,'ops-kid@test.bo'],[stranger,'ops-stranger@test.bo']])await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,email]);
 await q("insert into schools(id,name,slug,status) values($1,'Colegio Operaciones','ops-one','active'),($2,'Otro colegio','ops-two','active')",[school,otherSchool]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[school,director,teacher]);
 await q("insert into classrooms(id,school_id,name,capacity) values($1,$2,'Primero A',2),($3,$2,'Primero B',30)",[room,school,otherRoom]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesora','ops-teacher@test.bo','active')",[id(50),school,teacher]);await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[school,id(50),room]);
 for(const [student,classroom]of[[child,room],[otherChild,otherRoom]]){
 await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Lucía','Prueba','active',true,'Madre','ops-mother@test.bo','Padre','ops-father@test.bo',(now() at time zone 'America/La_Paz')::date+1-interval '5 years')",[student,school,classroom]);
 await q("insert into platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación','2026-10',50,'paid')",[school,student]);
 }
},30000);
beforeEach(async()=>{await db.exec('begin');await fundInstitutionFixtures(db);await acting(mother,()=>q('select workspace_identity()'));await acting(father,()=>q('select workspace_identity()'));});
afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});
describe('operación conectada, cobros y permisos',()=>{
 it('mantiene el carnet y celular de Dirección fuera de schools y del directorio público',async()=>{
  await acting(director,()=>q('select save_school($1::jsonb)',[JSON.stringify({id:school,director_identity:'1234567 LP',director_phone:'+591 70000000',maps_url:'https://www.google.com/maps?q=LaPaz',banner_url:'data:image/webp;base64,UklGRgAAAABXRUJQ'})]));
  expect((await as(director,()=>q('select institution_private_contact($1) as value',[school]))).rows[0].value.directorIdentity).toBe('1234567 LP');
  await expect(as(mother,()=>q('select institution_private_contact($1)',[school]))).rejects.toThrow();
  expect(JSON.stringify((await as(mother,()=>q('select * from schools where id=$1',[school]))).rows)).not.toContain('1234567 LP');
  await expect(as(teacher,()=>q('select save_school($1::jsonb)',[JSON.stringify({id:school,director_identity:'nuevo'})]))).rejects.toThrow();
 });
 it('valida horarios, días, cupos y asignación de docentes por aula',async()=>{
  await acting(director,()=>q('select save_classroom($1::jsonb,$2::uuid[])',[JSON.stringify({id:room,school_id:school,name:'Primero A',level:'Primaria',schedule:'x',start_time:'08:00',end_time:'12:30',weekdays:[1,3,5],capacity:3,academic_year:2026,monthly_fee:400}),[id(50)]]));
  expect((await q('select schedule,weekdays,monthly_fee from classrooms where id=$1',[room])).rows[0]).toMatchObject({schedule:'08:00 – 12:30',weekdays:[1,3,5],monthly_fee:'400.00'});
  await expect(as(director,()=>q('select save_classroom($1::jsonb,$2::uuid[])',[JSON.stringify({id:room,school_id:school,name:'Primero A',start_time:'12:00',end_time:'08:00',weekdays:[1]}),[]]))).rejects.toThrow(/horario/);
  await expect(as(director,()=>q('select save_teacher_with_classrooms($1::jsonb,$2::uuid[])',[JSON.stringify({id:id(51),school_id:school,name:'Nueva',email:'nueva@test.bo',specialty:'Inglés',status:'active'}),[]]))).rejects.toThrow(/al menos/);
 });
 it('permite al docente preparar un aula vacía y protege las publicaciones aprobadas',async()=>{
  await q('update students set classroom_id=$2 where id=$1',[child,otherRoom]);
  expect((await as(teacher,()=>q('select may_use_classroom($1,$2) as value',[school,room]))).rows[0].value).toBe(true);
  const rid=await request();await approve(rid);
  expect((await acting(teacher,()=>q("update calendar_events set description='Cambio sin aprobación' where id=$1 returning id",[rid]))).rows).toHaveLength(0);
  expect((await acting(teacher,()=>q('delete from calendar_events where id=$1 returning id',[rid]))).rows).toHaveLength(0);
  await expect(as(teacher,()=>q("insert into calendar_events(school_id,classroom_id,title,event_date,type) values($1,$2,'Sin aprobación',current_date,'materials')",[school,room]))).rejects.toThrow();
 });
 it('impide reactivar una baja cuando el aula ya no admite inscripciones',async()=>{
  await acting(director,()=>q("select withdraw_student($1,'Cambio de institución')",[child]));await q('update classrooms set active=false where id=$1',[room]);
  await expect(as(director,()=>q("select set_student_status($1,'active')",[child]))).rejects.toThrow(/admite/);
 });
 it('exige lista anual aprobada e inscribe alumno y cuotas en una sola transacción',async()=>{
  const student={id:id(42),school_id:school,classroom_id:room,first_name:'Nuevo',last_name:'Alumno',birth_date:'2020-01-01',mother_name:'Madre',mother_email:'ops-mother@test.bo',father_name:'Padre',father_email:'ops-father@test.bo',identity_number:'CI-42',monthly_fee:400};
  const plan={id:id(80),school_id:school,student_id:student.id,start_date:'2026-10-15',months:4,monthly_fee:400,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false};
  await expect(as(director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]))).rejects.toThrow(/lista anual/);
  const rid=await request();await expect(as(teacher,()=>q("select review_academic_request($1,true,'')",[rid]))).rejects.toThrow(/Dirección/);await approve(rid);
  await acting(director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]));
 // Simula la respuesta perdida: el mismo actor reenvía exactamente el mismo pedido.
 await acting(director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]));
 expect((await q('select count(*)::int n from students where id=$1',[student.id])).rows[0].n).toBe(1);
 expect((await q('select count(*)::int n from payment_plans where student_id=$1',[student.id])).rows[0].n).toBe(1);
 expect((await q('select count(*)::int n from school_charges where student_id=$1',[student.id])).rows[0].n).toBe(4);
 await expect(as(director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify({...student,first_name:'Cambio posterior'}),JSON.stringify(plan)]))).rejects.toThrow(/otros datos/);
 for(const user of [teacher,mother,stranger])await expect(as(user,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]))).rejects.toThrow(/Dirección/);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director')",[school,stranger]);
 await expect(as(stranger,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]))).rejects.toThrow(/otros datos/);
 await expect(as(director,()=>q('select * from aulanexo_private.enrollment_requests'))).rejects.toThrow();
 await expect(as(null,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]),undefined,'anon')).rejects.toThrow();
  const charges=(await q('select amount,minimum_access_ratio from school_charges where student_id=$1 order by period',[student.id])).rows;
  expect(charges.map(c=>Number(c.amount))).toEqual([429,429,429,429]);expect(charges.map(c=>Number(c.minimum_access_ratio))).toEqual([.5,.5,1,1]);
  await expect(as(director,()=>q('select enroll_student($1::jsonb)',[JSON.stringify({...student,id:id(43),identity_number:'CI-43'})]))).rejects.toThrow(/cupos/);
 });
 it('publica materiales solo al aprobar y no permite crear listas anuales duplicadas',async()=>{
  const rid=await request();expect((await as(mother,()=>q('select id from academic_requests'))).rows).toHaveLength(0);await approve(rid);
  expect((await as(mother,()=>q('select id from academic_requests'))).rows).toHaveLength(1);
  expect((await q('select id from calendar_events where id=$1',[rid])).rows).toHaveLength(1);
  expect((await q('select id from announcements where title=$1',['Lista para el aula'])).rows).toHaveLength(1);
  await approve(rid);expect((await q('select id from announcements where title=$1',['Lista para el aula'])).rows).toHaveLength(1);
 });
 it('agrupa abonos y anticipos, calcula saldos y reintenta sin duplicar recibos',async()=>{
  for(const [charge,amount]of[[id(100),200],[id(101),300]])await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Cuota','2027-01-01',$4)",[charge,school,child,amount]);
  const items=[{chargeId:id(100),amount:100},{chargeId:id(101),amount:300}];await checkout(items);await checkout(items);
  expect((await q('select count(*)::int as n from school_receipts')).rows[0].n).toBe(1);
  expect((await q('select paid_amount,status from school_charges order by id')).rows.map(c=>[Number(c.paid_amount),c.status])).toEqual([[100,'pending'],[300,'paid']]);
  await expect(checkout([{chargeId:id(100),amount:101}],id(91))).rejects.toThrow(/saldo/);
  await checkout([{chargeId:id(100),amount:100}],id(92));expect((await q('select status from school_charges where id=$1',[id(100)])).rows[0].status).toBe('paid');
 });
 it('no confirma un QR sin revisión y no permite que padres cobren o docentes cobren mensualidades',async()=>{
  await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Cuota','2026-10-01',100)",[id(100),school,child]);
  for(const user of [mother,father,kid,stranger,owner,teacher])await expect(checkout([{chargeId:id(100),amount:100}],id(90),'cash',{},false,user)).rejects.toThrow();
  await expect(checkout([{chargeId:id(100),amount:100}],id(90),'qr')).rejects.toThrow(/verificaste/);
  await checkout([{chargeId:id(100),amount:100}],id(90),'qr',{},true);
  expect((await q('select verification_source from school_receipts')).rows[0].verification_source).toBe('manual');
 });
 it('habilita al alcanzar 50% pero exige 100% en las últimas dos cuotas',async()=>{
  await acting(director,()=>q('select create_payment_plan($1::jsonb)',[JSON.stringify({id:id(80),school_id:school,student_id:child,start_date:'2026-01-01',months:12,monthly_fee:71,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false})]));
  const charges=(await q('select id,period from school_charges where student_id=$1 order by period',[child])).rows;
  // Aislar el mes actual: las anteriores ya fueron cobradas por el mismo flujo.
  const current=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit'}).format(new Date());
  await checkout(charges.filter(c=>c.period<current).map(c=>({chargeId:c.id,amount:100})));
  const c=charges.find(c=>c.period===current);expect(c).toBeTruthy();
  await checkout([{chargeId:c.id,amount:49}],id(91));expect((await as(mother,()=>q('select family_access($1) as ok',[child]))).rows[0].ok).toBe(false);
  await checkout([{chargeId:c.id,amount:1}],id(92));expect((await as(mother,()=>q('select family_access($1) as ok',[child]))).rows[0].ok).toBe(true);
  expect((await q('select minimum_access_ratio from school_charges where period in ($1,$2)',['2026-11','2026-12'])).rows.map(c=>Number(c.minimum_access_ratio))).toEqual([1,1]);
 });
 it('una actividad aprobada genera cobros, permite corroboración docente y exige motivo para no participar',async()=>{
  const rid=await request('activity',50);await approve(rid);let charge=(await q('select id from school_charges where academic_request_id=$1',[rid])).rows[0];
  expect((await as(teacher,()=>q('select teacher_activity_charges() as value'))).rows[0].value).toHaveLength(1);
  expect((await as(teacher,()=>q('select id from school_charges'))).rows).toHaveLength(0);
  await expect(acting(mother,()=>q('select set_activity_participation($1,$2,false,$3)',[rid,child,'']))).rejects.toThrow(/motivo/);
  await acting(mother,()=>q('select set_activity_participation($1,$2,false,$3)',[rid,child,'No asistirá a la salida']));expect((await q('select status from school_charges where id=$1',[charge.id])).rows[0].status).toBe('cancelled');
  await acting(director,()=>q("select set_activity_participation($1,$2,true,'')",[rid,child]));
  await checkout([{chargeId:charge.id,amount:50}],id(90),'cash',{},false,teacher);
  await expect(acting(mother,()=>q("select set_activity_participation($1,$2,false,'No asiste')",[rid,child]))).rejects.toThrow(/pago/);
 });
 it('solicita factura por lo efectivamente recibido y conserva datos fiscales privados',async()=>{
  await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Cuota','2026-10-01',100)",[id(100),school,child]);
  const details={invoiceName:'Razón Social Prueba',invoiceNit:'123456789',invoicePhone:'70000000'};
  await checkout([{chargeId:id(100),amount:50}],id(90),'cash',details);
  const invoice=(await q('select * from invoice_requests')).rows[0];expect(Number(invoice.amount)).toBe(50);expect(invoice.status).toBe('pending');
  expect((await as(mother,()=>q('select nit_ci from invoice_requests'))).rows[0].nit_ci).toBe('123456789');expect((await as(teacher,()=>q('select id from invoice_requests'))).rows).toHaveLength(0);
  await expect(as(mother,()=>q("select mark_invoice_issued($1,'FAC-1')",[invoice.id]))).rejects.toThrow();
  await acting(director,()=>q("select mark_invoice_issued($1,'FAC-1')",[invoice.id]));expect((await q('select status from invoice_requests')).rows[0].status).toBe('issued');
  const report=(await as(director,()=>q("select financial_report($1,'2026-01-01','2027-01-01',null,null) as r",[school]))).rows[0].r;expect(report.charges[0].paidAmount).toBe(50);
  expect(JSON.stringify((await q("select summary from audit_events where entity='invoice_requests'")).rows)).not.toContain(details.invoiceNit);
 });
 it('el enlace público es de lectura, caduca y no expone NIT, contactos ni confirma pagos',async()=>{
  await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Cuota','2026-10-01',100)",[id(100),school,child]);
  const token=(await acting(director,()=>q('select create_payment_link($1,$2::jsonb) as token',[child,JSON.stringify([{chargeId:id(100),amount:50}])]))).rows[0].token;
  const result=(await as(null,()=>q('select payment_link_context($1) as value',[token]),undefined,'anon')).rows[0].value;expect(result.total).toBe(50);expect(result.qrAvailable).toBe(false);expect(Object.keys(result)).not.toContain('studentId');
  await checkout([{chargeId:id(100),amount:50}]);
  expect((await as(null,()=>q('select payment_link_context($1) as value',[token]),undefined,'anon')).rows[0].value.status).toBe('paid');
  await q("update aulanexo_private.payment_links set expires_at=now()-interval '1 second'");await expect(as(null,()=>q('select payment_link_context($1)',[token]),undefined,'anon')).rejects.toThrow(/venció/);
 });
 it('las cuotas finales no habilitan hasta recibir su importe completo',async()=>{
  const start=(await q("select to_char(date_trunc('month',now() at time zone 'America/La_Paz')-interval '2 months','YYYY-MM-DD') as date")).rows[0].date;
  await acting(director,()=>q('select create_payment_plan($1::jsonb)',[JSON.stringify({id:id(80),school_id:school,student_id:child,start_date:start,months:4,monthly_fee:71,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false})]));
  const charges=(await q('select id,minimum_access_ratio from school_charges where student_id=$1 order by period',[child])).rows;
  await checkout(charges.slice(0,2).map(c=>({chargeId:c.id,amount:100})));
  await checkout([{chargeId:charges[2].id,amount:50}],id(91));
  expect((await as(mother,()=>q('select family_access($1) as ok',[child]))).rows[0].ok).toBe(false);
  await checkout([{chargeId:charges[2].id,amount:50}],id(92));
  expect((await as(mother,()=>q('select family_access($1) as ok',[child]))).rows[0].ok).toBe(true);
 });
 it('un error fiscal revierte todo el cobro y una referencia QR no se cobra dos veces',async()=>{
  for(const n of [100,101])await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Cuota','2026-10-01',100)",[id(n),school,child]);
  await expect(checkout([{chargeId:id(100),amount:50}],id(90),'cash',{invoiceName:'Nombre sin NIT'})).rejects.toThrow(/Completa/);
  expect((await q('select count(*)::int n from school_receipts')).rows[0].n).toBe(0);
  expect(Number((await q('select paid_amount from school_charges where id=$1',[id(100)])).rows[0].paid_amount)).toBe(0);
  await checkout([{chargeId:id(100),amount:50}],id(90),'qr',{},true);
  await expect(checkout([{chargeId:id(101),amount:50}],id(91),'qr',{},true)).rejects.toThrow(/referencia bancaria/);
 });
 it('la configuración bancaria separa la cuenta de MiCole y las de instituciones',async()=>{
  await acting(director,()=>q("select save_payment_connection($1,'Banco de pruebas','Comercio','test',null)",[school]));
  expect((await as(director,()=>q('select payment_connection_status($1) as value',[school]))).rows[0].value.credentialsStored).toBe(false);
  for(const user of [mother,teacher,stranger])await expect(as(user,()=>q('select payment_connection_status($1)',[school]))).rejects.toThrow();
  await expect(as(director,()=>q('select payment_connection_status(null)'))).rejects.toThrow();
  await expect(as(director,()=>q('select payment_connection_status($1)',[otherSchool]))).rejects.toThrow();
  await acting(owner,()=>q("select save_payment_connection(null,'Banco de MiCole','MiCole','test',null)"));
  expect((await as(owner,()=>q('select payment_connection_status(null) as value'))).rows[0].value.provider).toBe('Banco de MiCole');
  await expect(as(owner,()=>q('select payment_connection_status($1)',[school]))).rejects.toThrow();
 });
 it('la baja exige motivo, conserva abonos y anula solo cuotas futuras sin pagos',async()=>{
  for(const n of [100,101])await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Futura','2027-01-01',100)",[id(n),school,child]);
  await checkout([{chargeId:id(100),amount:50}]);await expect(as(director,()=>q("select set_student_status($1,'inactive')",[child]))).rejects.toThrow(/motivo/);
  await acting(director,()=>q("select withdraw_student($1,'Cambio de domicilio')",[child]));
  expect((await q('select status from school_charges order by id')).rows.map(c=>c.status)).toEqual(['pending','cancelled']);expect((await q('select withdrawal_reason from students where id=$1',[child])).rows[0].withdrawal_reason).toBe('Cambio de domicilio');
 });
 it('Realtime publica únicamente revisiones y los recordatorios diarios son idempotentes',async()=>{
  const before=(await q('select revision from workspace_signals where school_id=$1',[school])).rows[0].revision;
  await acting(director,()=>q("insert into announcements(school_id,title,content) values($1,'Novedad','Contenido')",[school]));
  const after=(await q('select * from workspace_signals where school_id=$1',[school])).rows[0];expect(Number(after.revision)).toBeGreaterThan(Number(before));expect(Object.keys(after).sort()).toEqual(['changed_at','changed_table','revision','school_id']);
  expect((await as(stranger,()=>q('select * from workspace_signals'))).rows).toHaveLength(0);
  await q('select aulanexo_private.send_birthday_reminders()');const count=(await q("select count(*)::int n from notifications where kind like 'birthday_%'")).rows[0].n;expect(count).toBeGreaterThan(0);
  await q('select aulanexo_private.send_birthday_reminders()');expect((await q("select count(*)::int n from notifications where kind like 'birthday_%'")).rows[0].n).toBe(count);
 });
});
