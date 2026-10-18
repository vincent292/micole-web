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
beforeAll(async()=>{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
 const migrations=new URL('../supabase/migrations/',import.meta.url);for(const file of readdirSync(migrations).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(file,migrations),'utf8').replace('create extension if not exists pgcrypto;',''));
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
beforeEach(async()=>{await db.exec('begin');await acting(mother,()=>q('select workspace_identity()'));await acting(father,()=>q('select workspace_identity()'));});
afterEach(async()=>{await db.exec('rollback');});afterAll(async()=>{await db.close();});

describe('Android push authorization and outbox',()=>{
 const device=id(200), token='test_fcm_token_for_mother_123456789';
 const register=(who=mother,installation=device,value=token,categories=['academic','alerts','messages','payments','birthdays'])=>acting(who,()=>q('select register_push_device($1,$2,true,$3::text[])',[installation,value,categories]));
 const makeNotice=(kind='grade',source=id(300),who=mother,childId=child)=>q("insert into notifications(user_id,school_id,student_id,kind,source_id,title,body,target) values($1,$2,$3,$4,$5,'Privado','Nombre, nota, datos que nunca deben salir','grades') returning id",[who,school,childId,kind,source]);
 const claim=async()=>{await q("update aulanexo_private.push_deliveries set available_at=now()");return(await q('select claim_push_deliveries() as value')).rows[0].value;};
 it('only the backend can see tokens or claim deliveries',async()=>{
  await register();await expect(as(mother,()=>q('select * from aulanexo_private.push_devices'))).rejects.toThrow();
  await expect(as(mother,()=>q('select claim_push_deliveries()'))).rejects.toThrow();
  await expect(as(null,()=>q('select register_push_device($1,$2)',[id(201),token]),undefined,'anon')).rejects.toThrow();
 });
 it('queues once for the registered recipient and never exports private content',async()=>{
  await register();await makeNotice();const jobs=await claim();expect(jobs).toHaveLength(1);
  const data=(await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value;
  expect(data.recipientId).toBe(mother);expect(data.category).toBe('academic');expect(JSON.stringify(data)).not.toContain('Privado');expect(JSON.stringify(data)).not.toContain('Nombre');
  await q("select finish_push_delivery($1,$2,'sent')",[jobs[0].id,jobs[0].lease]);expect(await claim()).toHaveLength(0);
 });
 it('suppresses academic pushes when a family loses access, while retaining payment reminders',async()=>{
  await register();await makeNotice();await q("update students set profile_complete=false where id=$1",[child]);let jobs=await claim();expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();
  await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Mensualidad',current_date,100)",[id(301),school,child]);await makeNotice('payment_due_2026-10-16_0',id(301));jobs=await claim();expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value?.category).toBe('payments');
 });
 it('rechecks guardianship and preferences at dispatch time',async()=>{
  await register();await makeNotice();await q('delete from student_guardians where student_id=$1 and user_id=$2',[child,mother]);const jobs=await claim();expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();
 });
 it('does not send pending notices to another account on a shared phone',async()=>{
  await register();await makeNotice();await register(father);const jobs=await claim();expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();expect((await q('select user_id from aulanexo_private.push_devices where id=$1',[device])).rows[0].user_id).toBe(father);
 });
 it('revokes a signed-out device and ignores categories switched off',async()=>{
  await register(mother,device,token,['payments']);await makeNotice();expect(await claim()).toHaveLength(0);await makeNotice('payment_receipt',id(302));await acting(mother,()=>q('select unregister_push_device($1)',[device]));const jobs=await claim();expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();
 });
 it('only a valid lease can finish a delivery; expired devices are not queued',async()=>{
  await register();await makeNotice();const jobs=await claim();await q("select finish_push_delivery($1,$2,'sent')",[jobs[0].id,id(999)]);expect((await q('select status from aulanexo_private.push_deliveries')).rows[0].status).toBe('processing');await q("update aulanexo_private.push_devices set expires_at=now()-interval '1 day'");await makeNotice('grade',id(303));expect((await q('select count(*)::int as n from aulanexo_private.push_deliveries')).rows[0].n).toBe(1);
 });
 it('creates academic notices for both parents and keeps notes away from optional child accounts',async()=>{
  await acting(teacher,()=>q("insert into grades(school_id,student_id,subject,period,score,recommendation) values($1,$2,'Lectura','Octubre','A','Muy bien')",[school,child]));const ns=(await q("select user_id,kind from notifications where kind='grade'")).rows;expect(ns.map(n=>n.user_id).sort()).toEqual([mother,father].sort());
 });
 it('rejects opening another person’s notification and uses current financial access',async()=>{
  const notice=(await makeNotice()).rows[0].id;await expect(as(father,()=>q('select resolve_push_notification($1)',[notice]))).rejects.toThrow();await acting(mother,()=>q('select resolve_push_notification($1)',[notice]));expect((await q('select read_at from notifications where id=$1',[notice])).rows[0].read_at).toBeTruthy();
 });
 it('optional students receive only their tasks and lose pending pushes after revocation',async()=>{
  await acting(director,()=>q('select set_student_login($1,$2,true)',[child,'ops-kid@test.bo']));await register(kid,device,'student_device_token_123456789');
  await acting(teacher,()=>q("insert into daily_entries(school_id,student_id,category,note,created_by) values($1,$2,'tarea','Leer un cuento',$3),($1,$2,'observación','Dato privado',$3)",[school,child,teacher]));
  const ns=(await q('select kind,body from notifications where user_id=$1',[kid])).rows;expect(ns).toEqual([{kind:'daily_task',body:'Leer un cuento'}]);
  const jobs=await claim();expect(jobs).toHaveLength(1);expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value?.recipientId).toBe(kid);
  await acting(director,()=>q('select set_student_login($1,$2,false)',[child,'ops-kid@test.bo']));expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();
 });
 it('birthday reminders include today and remain idempotent',async()=>{
  await q("update students set birth_date=((now() at time zone 'America/La_Paz')::date-interval '5 years')::date where id=$1",[child]);
  await q('select aulanexo_private.send_birthday_reminders()');await q('select aulanexo_private.send_birthday_reminders()');
  expect((await q("select count(*)::int as n from notifications where student_id=$1 and kind like 'birthday_%_0'",[child])).rows[0].n).toBe(4);
 });
 it('due reminders are idempotent and a settled charge cancels pending reminders',async()=>{
  await register();await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount) values($1,$2,$3,'Mensualidad',(now() at time zone 'America/La_Paz')::date+3,100)",[id(305),school,child]);
  await q('select aulanexo_private.send_payment_reminders()');await q('select aulanexo_private.send_payment_reminders()');
  expect((await q("select count(*)::int as n from notifications where source_id=$1 and kind like 'payment_due_%'",[id(305)])).rows[0].n).toBe(2);
  const jobs=await claim();expect(jobs).toHaveLength(1);
  await acting(director,()=>q('select checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)',[id(306),child,JSON.stringify([{chargeId:id(305),amount:100}]),'cash','TEST-RECEIPT','{}',false]));
  expect((await q('select prepare_push_delivery($1,$2) as value',[jobs[0].id,jobs[0].lease])).rows[0].value).toBeNull();
  const delivered=(await q("select n.kind from aulanexo_private.push_deliveries d join notifications n on n.id=d.notification_id where d.status='pending' order by n.kind")).rows;expect(delivered.some(x=>x.kind==='payment_receipt')).toBe(true);
 });

 it('a test targets the caller’s phone session, even with multiple devices on the same account',async()=>{
  await q('create table auth.sessions(id uuid primary key)');await q('insert into auth.sessions values($1),($2)',[id(701),id(702)]);
  await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:id(701)})]);await register(mother,device,token);
  await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:id(702)})]);await register(mother,id(202),'other_phone_token_123456789');
  await q("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({session_id:id(701)})]);await acting(mother,()=>q('select test_push_notification()'));
  expect((await q('select device_id from aulanexo_private.push_deliveries')).rows).toEqual([{device_id:device}]);
 });

});
