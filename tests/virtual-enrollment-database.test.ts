import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
const db=new PGlite(),id=(n:number)=>`ad000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [director,teacher,mother,stranger,school,other,roomA,roomB,child]=[1,2,3,4,20,21,30,31,40].map(id);
const owner=id(5),realDirector=id(6),realTeacher=id(7),realRoom=id(33);
const year=new Date().getUTCFullYear(),q=(sql:string,args:unknown[]=[])=>db.query<any>(sql,args);
async function as<T>(user:string|null,task:()=>Promise<T>,role='authenticated',support?:string){
 await db.exec('savepoint actor');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",[user||'',JSON.stringify(support?{'x-micole-support':support}:{})]);await db.exec(`set local role ${role}`);
 try{const result=await task();await db.exec('reset role');await q("select set_config('request.jwt.claim.sub','',true)");await db.exec('release savepoint actor');return result;}
 catch(e){await db.exec('rollback to savepoint actor;release savepoint actor');throw e;}
}
async function rpc(name:string,args:unknown[],user=director){return as(user,async()=>{const r=await q(`select ${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as v`,args);return r.rows[0].v;});}
let campaign:string;
const seed=(n:number)=>({firstName:'Alumno '+n,lastName:'Prueba',rude:'RUDE-'+n,identityNumber:'CI-'+n,motherName:'Madre Prueba',motherEmail:'mother@test.bo',motherPhone:'70000000'});
const profile={birthDate:'2020-01-01',motherName:'Madre Prueba',motherEmail:'mother@test.bo',motherPhone:'70000000',fatherName:'Padre Prueba',fatherEmail:'father@test.bo',fatherPhone:'70000002',allergies:'Ninguna',foodRestrictions:'Ninguna',emergencyContact:'Contacto Prueba',emergencyPhone:'70000001',hasInsurance:false,consent:true,admissionDetails:{fields:{}}};
const create=(n:number,random=true,room=roomA)=>rpc('create_registration_application',[id(n),campaign,room,JSON.stringify(seed(n)),random,null]);
beforeAll(async()=>{
 await db.exec(`create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
 const root=new URL('../supabase/migrations/',import.meta.url);
 for(const f of readdirSync(root).filter(f=>f.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(f,root),'utf8').replace('create extension if not exists pgcrypto;',''));
 for(const [uid,email] of [[director,'director@test.bo'],[teacher,'teacher@test.bo'],[mother,'mother@test.bo'],[stranger,'stranger@test.bo'],[realDirector,'real-director@test.bo'],[realTeacher,'real-teacher@test.bo']])await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid,email]);
 await q("insert into aulanexo_private.platform_admin_allowlist(email) values('owner@test.bo')");await q("insert into auth.users(id,email,email_confirmed_at) values($1,'owner@test.bo',now())",[owner]);await q('insert into platform_admins(user_id) values($1) on conflict do nothing',[owner]);
 await q("insert into schools(id,name,slug,status) values($1,'Pruebas','admissions-test','active'),($2,'Otro','admissions-other','active')",[school,other]);
 await q('insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values($1,true,$2)',[school,director]);
 await q('insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)',[school,director]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[school,director,teacher]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente','teacher@test.bo','active')",[id(50),school,teacher]);
 await q("insert into classrooms(id,school_id,name,level,schedule,academic_year,capacity,monthly_fee) values($1,$3,'Inicial A','Inicial','Mañana',$4,4,100),($2,$3,'Inicial B','Inicial','Mañana',$4,4,100)",[roomA,roomB,school,year]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[other,realDirector,realTeacher]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente real','real-teacher@test.bo','active')",[id(51),other,realTeacher]);
 await q("insert into classrooms(id,school_id,name,level,schedule,academic_year,capacity,monthly_fee) values($1,$2,'Inicial real','Inicial','Mañana',$3,10,100)",[realRoom,other,year]);
},30000);
beforeEach(async()=>{
 await db.exec('begin');campaign=await rpc('save_registration_campaign',[school,JSON.stringify({year,title:'Inscripciones de prueba',paymentRequired:true,amount:1,concept:'Servicio de prueba',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'initial-5'},{classroomId:roomB,groupKey:'initial-5'}]),0]);
});
afterEach(()=>db.exec('rollback'));afterAll(()=>db.close());
it('reparte aleatoriamente entre paralelos compatibles con menor ocupación y nunca supera cupos',async()=>{
 const apps=[];for(let n=100;n<108;n++)apps.push(await create(n));
 expect(apps.filter(a=>a.classroomId===roomA)).toHaveLength(4);expect(apps.filter(a=>a.classroomId===roomB)).toHaveLength(4);
 await expect(create(109)).rejects.toThrow('cupos');expect((await q('select count(*)::int n from students')).rows[0].n).toBe(0);
 expect((await create(100)).id).toBe(id(100));
});
it('preserva el paralelo importado, detecta repetidos y no usa nombres como prueba de parentesco',async()=>{
 const rows=[{id:id(100),...seed(100)},{id:id(101),...seed(100)}];const p=await rpc('preview_registration_roster',[campaign,JSON.stringify(rows)]);expect(p[1].blocked).toBe(true);
 await expect(rpc('import_registration_roster',[campaign,roomA,JSON.stringify(rows)])).rejects.toThrow('observadas');
 const imported=await rpc('import_registration_roster',[campaign,roomA,JSON.stringify([rows[0]])]);expect(imported[0].classroomId).toBe(roomA);
 expect((await rpc('preview_registration_roster',[campaign,JSON.stringify([rows[0]])]))[0].blocked).toBe(true);
});
it('oculta datos personales sin verificar contacto, rechaza otro usuario y revoca enlaces anteriores',async()=>{
 await create(100);const invite=await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);
 const anon=await as(null,()=>q('select registration_context($1) v',[invite.token]),'anon');expect(anon.rows[0].v.requiresVerification).toBe(true);expect(JSON.stringify(anon.rows[0].v)).not.toContain('Alumno');
 const otherAccount=await rpc('registration_context',[invite.token,null,false],stranger);expect(otherAccount.requiresVerification).toBe(true);
 await expect(rpc('save_registration_form',[id(100),invite.token,JSON.stringify(profile),true,invite.application.revision,false],stranger)).rejects.toThrow('Verifica');
 const verified=await rpc('registration_context',[invite.token,null,false],mother);expect(verified.application.seed.firstName).toBe('Alumno 100');
 await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);await expect(rpc('registration_context',[invite.token,null,false],mother)).rejects.toThrow('disponible');
});
it('guarda borrador, exige pago, simula QR solo en pruebas y confirma una sola vez',async()=>{
 await create(100);const invite=await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);
 let app=await rpc('save_registration_form',[id(100),invite.token,JSON.stringify(profile),false,invite.application.revision,false],mother);
 expect(app.status).toBe('draft');expect((await q('select count(*)::int n from students')).rows[0].n).toBe(0);
 app=await rpc('save_registration_form',[id(100),invite.token,JSON.stringify(profile),true,app.revision,false],mother);
 expect(app.status).toBe('payment_pending');expect((await q('select status from students where id=$1',[app.studentId])).rows[0].status).toBe('pending');
 await expect(rpc('pay_registration',[id(100),'cash',invite.token,true],mother)).rejects.toThrow('autorizado');
 await expect(rpc('pay_registration',[id(100),'qr',invite.token,true],mother)).rejects.toThrow('banco');
 app=await rpc('pay_registration',[id(100),'test_qr',invite.token,false],mother);expect(app.status).toBe('confirmed');
 expect((await q('select status from students where id=$1',[app.studentId])).rows[0].status).toBe('active');
 await rpc('pay_registration',[id(100),'test_qr',invite.token,false],mother);expect((await q('select count(*)::int n from school_receipts')).rows[0].n).toBe(1);
});
it('separa permiso de inscribir del permiso de cobrar efectivo y conserva al usuario que cobra',async()=>{
 await expect(create(100)).resolves.toBeTruthy();await expect(rpc('registration_workspace',[school],teacher)).rejects.toThrow('habilitarte');
 await rpc('set_registration_delegate',[campaign,teacher,true,false]);const app=await rpc('save_registration_form',[id(100),null,JSON.stringify(profile),true,1,true],teacher);expect(app.status).toBe('payment_pending');
 await expect(rpc('pay_registration',[id(100),'cash',null,true],teacher)).rejects.toThrow('autorizado');
 await rpc('set_registration_delegate',[campaign,teacher,true,true]);expect((await rpc('pay_registration',[id(100),'cash',null,true],teacher)).status).toBe('confirmed');
 expect((await q('select recorded_by from school_receipts')).rows[0].recorded_by).toBe(teacher);
});
it('rechaza acceso a otra institución y cambios de condiciones cuando hay solicitudes',async()=>{
 await expect(rpc('registration_workspace',[other])).rejects.toThrow('habilitarte');
 await create(100);await expect(rpc('save_registration_campaign',[school,JSON.stringify({year,title:'Cambio',paymentRequired:true,amount:2,concept:'Servicio de prueba',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'initial-5'}]),1])).rejects.toThrow('condiciones');
});
it('cancela solicitudes impagas y libera la reserva sin borrar historial',async()=>{
 await create(100,false);await rpc('cancel_registration',[id(100)]);expect((await q('select status from aulanexo_private.registration_applications where id=$1',[id(100)])).rows[0].status).toBe('cancelled');
 const app=await create(101,false);expect(app.classroomId).toBe(roomA);
});
it('revierte una importación completa si no hay cupos, incluso si las primeras filas cabían',async()=>{
 const rows=Array.from({length:5},(_,n)=>({id:id(100+n),...seed(100+n)}));await expect(rpc('import_registration_roster',[campaign,roomA,JSON.stringify(rows)])).rejects.toThrow('cupos');
 expect((await q('select count(*)::int n from aulanexo_private.registration_applications')).rows[0].n).toBe(0);
});
it('detecta un CI repetido aunque los RUDE sean distintos y exige revisión de homónimos',async()=>{
 const rows=[seed(100),{...seed(101),identityNumber:seed(100).identityNumber}];expect((await rpc('preview_registration_roster',[campaign,JSON.stringify(rows)]))[1].blocked).toBe(true);
});
it('no permite modificar precio, identidad ni curso desde el formulario familiar',async()=>{
 await create(100);const invite=await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);
 const app=await rpc('save_registration_form',[id(100),invite.token,JSON.stringify({...profile,firstName:'Otro',classroomId:roomB,status:'confirmed',amount:0}),true,invite.application.revision,false],mother);
 expect(app.status).toBe('payment_pending');expect(Number(app.amount)).toBe(1);expect(app.seed.firstName).toBe('Alumno 100');
});
it('conserva la revisión más reciente y rechaza formularios de un enlace vencido',async()=>{
 await create(100);const invite=await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);
 await rpc('save_registration_form',[id(100),invite.token,JSON.stringify({}),false,invite.application.revision,false],mother);
 await expect(rpc('save_registration_form',[id(100),invite.token,JSON.stringify(profile),true,invite.application.revision,false],mother)).rejects.toThrow('cambió');
 await q("update aulanexo_private.registration_applications set expires_at=now()-interval '1 second'");await expect(rpc('registration_context',[invite.token,null,false],mother)).rejects.toThrow('disponible');
});
it('mantiene educación regular sin cobros adicionales obligatorios',async()=>{
 await q("update classrooms set level='Primaria',academic_year=$2 where id=$1",[roomA,year+1]);
 await q("update schools set education_levels=array['Primaria'] where id=$1",[school]);
 expect((await q('select bolivia_regular from classrooms where id=$1',[roomA])).rows[0].bolivia_regular).toBe(true);
 await expect(rpc('save_registration_campaign',[school,JSON.stringify({year:year+1,title:'Primaria',paymentRequired:true,amount:1,concept:'Matrícula',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'primary3'}]),0])).rejects.toThrow('regular');
});
it('permite filas sin apellidos al importar y conserva los correos ya autorizados',async()=>{
 expect((await rpc('preview_registration_roster',[campaign,JSON.stringify([{...seed(100),lastName:''}])]))[0].blocked).toBe(false);
 await rpc('create_registration_application',[id(100),campaign,roomA,JSON.stringify({...seed(100),fatherName:'Padre original',fatherEmail:'padre-original@test.bo'}),true,null]);
 const app=await rpc('save_registration_form',[id(100),null,JSON.stringify({...profile,fatherEmail:'otro@test.bo'}),true,1,true]);
 expect(app.profile.fatherEmail).toBe('padre-original@test.bo');expect((await q('select father_email from students where id=$1',[app.studentId])).rows[0].father_email).toBe('padre-original@test.bo');
});
it('no utiliza un grupo homónimo de otro nivel para completar cupos',async()=>{
 await q("insert into classrooms(id,school_id,name,level,schedule,academic_year,capacity) values($1,$2,'Otro nivel','Otro nivel','Mañana',$3,4)",[id(32),school,year]);
 await rpc('save_registration_campaign',[school,JSON.stringify({year,title:'Inscripciones de prueba',paymentRequired:true,amount:1,concept:'Servicio de prueba',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'initial-5'},{classroomId:roomB,groupKey:'initial-5'},{classroomId:id(32),groupKey:'initial-5'}]),1]);
 for(let n=100;n<108;n++)await create(n);
 await expect(create(109)).rejects.toThrow('cupos');
});
it('permite corregir condiciones de una campaña vacía y las conserva al existir solicitudes',async()=>{
 await rpc('save_registration_campaign',[school,JSON.stringify({year,title:'Campaña corregida',paymentRequired:true,amount:2,concept:'Otro servicio',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'initial-5'}]),1]);
 expect(Number((await rpc('registration_workspace',[school])).campaigns[0].amount)).toBe(2);
 await create(100,false);await expect(rpc('save_registration_campaign',[school,JSON.stringify({year,title:'Campaña corregida',paymentRequired:true,amount:3,concept:'Otro servicio',simulation:true}),JSON.stringify([{classroomId:roomA,groupKey:'initial-5'}]),2])).rejects.toThrow('condiciones');
});
it('también impide confirmar QR de inscripción por las rutas manuales de caja anteriores',async()=>{
 await create(100);const app=await rpc('save_registration_form',[id(100),null,JSON.stringify(profile),true,1,true]);
 const charge=(await q('select charge_id from aulanexo_private.registration_applications where id=$1',[id(100)])).rows[0].charge_id;
 await expect(rpc('checkout_school_payment',[id(200),app.studentId,JSON.stringify([{chargeId:charge,amount:1}]),'qr','CAPTURA-NO-VALIDA',JSON.stringify({}),true])).rejects.toThrow('banco');
 expect((await q('select status from aulanexo_private.registration_applications where id=$1',[id(100)])).rows[0].status).toBe('payment_pending');
 expect((await q('select count(*)::int n from school_receipts')).rows[0].n).toBe(0);
 expect((await rpc('pay_registration',[id(100),'cash',null,true])).status).toBe('confirmed');
});
it('respeta la docente seleccionada en pruebas del propietario y conserva al operador real en el recibo',async()=>{
 await rpc('set_registration_delegate',[campaign,teacher,true,true]);await create(100);
 const support=await rpc('start_test_session',[school,'teacher',id(50),null],owner);
 const app=await as(owner,async()=>(await q('select save_registration_form($1,null,$2::jsonb,true,1,true) v',[id(100),JSON.stringify(profile)])).rows[0].v,'authenticated',support.id);expect(app.status).toBe('payment_pending');
 const paid=await as(owner,async()=>(await q("select pay_registration($1,'cash',null,true) v",[id(100)])).rows[0].v,'authenticated',support.id);expect(paid.status).toBe('confirmed');
 expect((await q('select recorded_by from school_receipts')).rows[0].recorded_by).toBe(owner);
});
it('una docente no puede desactivar el reparto equilibrado desde el cliente',async()=>{
 await rpc('set_registration_delegate',[campaign,teacher,true,true]);
 for(const random of [false,null])await expect(rpc('create_registration_application',[id(100),campaign,roomA,JSON.stringify(seed(100)),random,null],teacher)).rejects.toThrow('reparto equilibrado');
 expect((await rpc('create_registration_application',[id(100),campaign,roomA,JSON.stringify(seed(100)),true,null],teacher)).status).toBe('draft');
});

const realConfig=(extra:object={})=>JSON.stringify({year,title:'Inscripciones institucionales',paymentRequired:true,amount:100,concept:'Servicio inicial',...extra});
const realPools=()=>JSON.stringify([{classroomId:realRoom,groupKey:'initial-5'}]);
async function prepareReal(){
 // Unit-only paid-platform fixture; never applied by the production migration.
 await q('update aulanexo_private.platform_credit_accounts set initial_paid_at=now() where school_id=$1',[other]);
 await q('update schools set platform_enabled=true where id=$1',[other]);
 return rpc('save_registration_campaign',[other,realConfig(),realPools(),0],realDirector);
}
it('habilita colegios sin registro de pruebas ni plantilla, sin crear campañas automáticamente',async()=>{
 const workspace=await rpc('registration_workspace',[other],realDirector);
 expect(workspace).toMatchObject({testing:false,canManage:true,campaigns:[],applications:[]});
 expect(workspace.rooms.map((r:any)=>r.id)).toEqual([realRoom]);
 expect((await q('select appearance from schools where id=$1',[other])).rows[0].appearance).toBeNull();
 await prepareReal();const updated=await rpc('registration_workspace',[other],realDirector);
 expect(updated.campaigns).toHaveLength(1);expect(updated.campaigns[0].simulation).toBe(false);
 await expect(rpc('registration_workspace',[school],realDirector)).rejects.toThrow('habilitarte');
 await expect(rpc('save_registration_campaign',[school,realConfig(),realPools(),0],realDirector)).rejects.toThrow('Solo Dirección');
});
it('rechaza activar simulación en un colegio real aunque lo solicite su director',async()=>{
 await expect(rpc('save_registration_campaign',[other,realConfig({simulation:true}),realPools(),0],realDirector)).rejects.toThrow('simulados');
 expect((await rpc('registration_workspace',[other],realDirector)).campaigns).toEqual([]);
 const cid=await prepareReal();
 await expect(rpc('save_registration_campaign',[other,realConfig({simulation:true}),realPools(),1],realDirector)).rejects.toThrow('simulados');
 expect((await rpc('registration_workspace',[other],realDirector)).campaigns[0]).toMatchObject({id:cid,simulation:false});
});
it('permite importar, verificar a la familia y confirmar efectivo real, sin aceptar QR simulado o manual',async()=>{
 const cid=await prepareReal();
 const imported=await rpc('import_registration_roster',[cid,realRoom,JSON.stringify([{id:id(300),...seed(300)}])],realDirector);
 expect(imported[0]).toMatchObject({classroomId:realRoom,testing:false,simulation:false});
 const invite=await rpc('registration_invite',[id(300),'mother@test.bo','mother',true],realDirector);
 const anonymous=await as(null,()=>q('select registration_context($1) v',[invite.token]),'anon');
 expect(anonymous.rows[0].v.requiresVerification).toBe(true);expect(anonymous.rows[0].v.application).toBeUndefined();
 expect((await rpc('registration_context',[invite.token,null,false],stranger)).application).toBeUndefined();
 await expect(rpc('registration_context',[null,id(300),true])).rejects.toThrow('acceso');
 const app=await rpc('save_registration_form',[id(300),invite.token,JSON.stringify(profile),true,invite.application.revision,false],mother);
 expect(app).toMatchObject({status:'payment_pending',testing:false,simulation:false,amount:100});
 await expect(rpc('pay_registration',[id(300),'test_qr',invite.token,false],mother)).rejects.toThrow('simulación');
 await expect(rpc('pay_registration',[id(300),'cash',invite.token,true],mother)).rejects.toThrow('autorizado');
 const charge=(await q('select charge_id from aulanexo_private.registration_applications where id=$1',[id(300)])).rows[0].charge_id;
 await expect(rpc('checkout_school_payment',[id(301),app.studentId,JSON.stringify([{chargeId:charge,amount:100}]),'qr','CAPTURA',JSON.stringify({}),true],realDirector)).rejects.toThrow('banco');
 const confirmed=await rpc('pay_registration',[id(300),'cash',null,true],realDirector);expect(confirmed.status).toBe('confirmed');
 const receipt=(await q('select reference,recorded_by,total from school_receipts where id=$1',[confirmed.receiptId])).rows[0];
 expect(receipt.reference).toBe('INS-'+confirmed.receiptId);expect(receipt.recorded_by).toBe(realDirector);expect(Number(receipt.total)).toBe(100);
 expect((await q('select status from students where id=$1',[app.studentId])).rows[0].status).toBe('active');
});
it('aplica las delegaciones docentes a cada campaña y colegio real',async()=>{
 const cid=await prepareReal();
 await expect(rpc('registration_workspace',[other],realTeacher)).rejects.toThrow('habilitarte');
 await rpc('set_registration_delegate',[cid,realTeacher,true,false],realDirector);
 expect((await rpc('registration_workspace',[other],realTeacher)).canManage).toBe(false);
 await rpc('create_registration_application',[id(300),cid,realRoom,JSON.stringify(seed(300)),true,null],realTeacher);
 await rpc('save_registration_form',[id(300),null,JSON.stringify(profile),true,1,true],realTeacher);
 await expect(rpc('pay_registration',[id(300),'cash',null,true],realTeacher)).rejects.toThrow('autorizado');
 await expect(rpc('set_registration_delegate',[cid,teacher,true,true],realDirector)).rejects.toThrow();
 await rpc('set_registration_delegate',[cid,realTeacher,true,true],realDirector);
 expect((await rpc('pay_registration',[id(300),'cash',null,true],realTeacher)).status).toBe('confirmed');
 await expect(rpc('registration_workspace',[school],realTeacher)).rejects.toThrow('habilitarte');
});
it('conserva identificación de prueba y bloquea instituciones inactivas',async()=>{
 expect((await rpc('registration_workspace',[school])).testing).toBe(true);
 await create(100);const invite=await rpc('registration_invite',[id(100),'mother@test.bo','mother',true]);
 await q("update schools set status='inactive' where id=$1",[school]);
 await expect(rpc('registration_workspace',[school])).rejects.toThrow('habilitarte');
 await expect(rpc('registration_context',[invite.token,null,false],mother)).rejects.toThrow('no está disponible');
});

it('importa fichas con solo nombre o nombre y RUDE sin exigir apellidos, carnet o correo',async()=>{
 const rows=[{id:id(300),firstName:'Lucía'},{id:id(301),firstName:'Mario Pérez',rude:'000123'},{id:id(302),firstName:'Elena',identityNumber:'000456',contactEmail:'responsable@test.bo'}];
 const preview=await rpc('preview_registration_roster',[campaign,JSON.stringify(rows)]);expect(preview.every((r:any)=>!r.blocked)).toBe(true);
 const imported=await rpc('import_registration_roster',[campaign,roomA,JSON.stringify(rows)]);expect(imported).toHaveLength(3);
 expect(imported[0]).toMatchObject({status:'draft',classroomId:roomA,seed:{firstName:'Lucía',lastName:'',rude:'',identityNumber:'',motherEmail:'',fatherEmail:''}});
 expect(imported[1].seed.rude).toBe('000123');expect(imported[2].seed.contactEmail).toBe('responsable@test.bo');expect(imported[2].seed.motherEmail).toBe('');
 expect((await q('select count(*)::int n from students')).rows[0].n).toBe(0);
 await expect(rpc('registration_invite',[id(300),'','mother',true])).rejects.toThrow('contacto autorizado');
});
it('mantiene revisión de duplicados entre filas mínimas y filas con identificadores',async()=>{
 for(const rows of [[{firstName:'Ana'},{firstName:'Ana',rude:'1'}],[{firstName:'Ana Pérez',rude:'1'},{firstName:'Ana',lastName:'Pérez'}],[{firstName:'Ana',rude:'1'},{firstName:'Mario',rude:'1'}]]){
  expect((await rpc('preview_registration_roster',[campaign,JSON.stringify(rows)]))[1].blocked).toBe(true);
 }
 await rpc('import_registration_roster',[campaign,roomA,JSON.stringify([{id:id(300),firstName:'Ana Pérez',rude:'000123'}])]);
 expect((await rpc('preview_registration_roster',[campaign,JSON.stringify([{firstName:'Ana',lastName:'Pérez'}])]))[0].blocked).toBe(true);
 expect((await rpc('preview_registration_roster',[campaign,JSON.stringify([{rude:'000999'}])]))[0]).toMatchObject({blocked:true,existingStudentId:null});
});
it('permite completar y guardar el nombre pendiente antes de confirmar, sin activar el borrador',async()=>{
 await rpc('import_registration_roster',[campaign,roomA,JSON.stringify([{id:id(300),firstName:'Ana María Pérez López'}])]);
 let app=await rpc('save_registration_form',[id(300),null,JSON.stringify({firstName:'Ana María',lastName:'Pérez López'}),false,1,true]);
 expect(app.status).toBe('draft');expect(app.profile.lastName).toBe('Pérez López');expect(app.seed.firstName).toBe('Ana María Pérez López');
 await expect(rpc('save_registration_form',[id(300),null,JSON.stringify(profile),true,app.revision,true])).rejects.toThrow('nombres y apellidos');
 app=await rpc('save_registration_form',[id(300),null,JSON.stringify({...profile,firstName:'Ana María',lastName:'Pérez López',identityNumber:'CI-300'}),true,app.revision,true]);
 expect(app.status).toBe('payment_pending');expect(app.seed).toMatchObject({firstName:'Ana María',lastName:'Pérez López'});
 expect((await q('select first_name,last_name,status from students where id=$1',[app.studentId])).rows[0]).toMatchObject({first_name:'Ana María',last_name:'Pérez López',status:'pending'});
 expect((await rpc('pay_registration',[id(300),'cash',null,true])).status).toBe('confirmed');
});
it('la familia verificada completa un nombre pendiente y no puede editar nombres oficiales ya separados',async()=>{
 await rpc('import_registration_roster',[campaign,roomA,JSON.stringify([{id:id(300),firstName:'Ana'}])]);
 const invite=await rpc('registration_invite',[id(300),'mother@test.bo','mother',true]);
 const app=await rpc('save_registration_form',[id(300),invite.token,JSON.stringify({...profile,firstName:'Ana María',lastName:'Pérez López',identityNumber:'CI-300'}),true,invite.application.revision,false],mother);
 expect(app.seed).toMatchObject({firstName:'Ana María',lastName:'Pérez López'});
 await create(100);const original=await rpc('save_registration_form',[id(100),null,JSON.stringify({...profile,firstName:'Otro',lastName:'Otro'}),true,1,true]);
 expect(original.seed).toMatchObject({firstName:'Alumno 100',lastName:'Prueba'});
});
it('reconoce alumnos existentes por identificador con lista mínima sin vincular por nombre solamente',async()=>{
 await q("insert into students(id,school_id,classroom_id,first_name,last_name,rude,status) values($1,$2,$3,'Ana María','Pérez López','000123','active')",[child,school,roomA]);
 for(const firstName of ['Ana María','Ana María Pérez López']){
  const preview=await rpc('preview_registration_roster',[campaign,JSON.stringify([{firstName,rude:'000123'}])]);
  expect(preview[0]).toMatchObject({blocked:false,existingStudentId:child});
 }
 expect((await rpc('preview_registration_roster',[campaign,JSON.stringify([{firstName:'Ana María Pérez López'}])]))[0]).toMatchObject({blocked:true,existingStudentId:null});
 const rows=await rpc('import_registration_roster',[campaign,roomA,JSON.stringify([{id:id(300),firstName:'Ana María',rude:'000123'}])]);
 expect(rows[0]).toMatchObject({studentId:child,newStudent:false,seed:{firstName:'Ana María',lastName:'Pérez López'}});
});

// Academic administration and subject isolation use the same complete migration history.
async function enableSecretary(collect=false){await rpc('save_secretary_access',[school,'stranger@test.bo',true,collect]);}
async function academicFixture(){
 await q("insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3) on conflict do nothing",[school,id(50),roomA]);
 await rpc('set_classroom_tutor',[roomA,id(50)]);
 await q("insert into auth.users(id,email,email_confirmed_at) values($1,'subject-other@test.bo',now())",[id(8)]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'teacher')",[school,id(8)]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Otro docente','subject-other@test.bo','active')",[id(52),school,id(8)]);
 await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[school,id(52),roomA]);
 const math=await rpc('configure_class_subject',[roomA,'Matemáticas',[id(50)],true]);
 const history=await rpc('configure_class_subject',[roomA,'Historia',[id(52)],true]);
 await rpc('create_registration_application',[id(300),campaign,roomA,JSON.stringify(seed(300)),false,null]);
 const app=await rpc('save_registration_form',[id(300),null,JSON.stringify(profile),true,1,true]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'guardian') on conflict do nothing",[school,mother]);
 await q("insert into student_guardians(student_id,user_id,relationship,verified_at,can_view) values($1,$2,'mother',now(),true) on conflict do nothing",[app.studentId,mother]);
 await rpc('pay_registration',[id(300),'cash',null,true]);
 return {math,history,student:app.studentId};
}
it('Secretaría organiza grados, paralelos y materias sin recibir rol de Dirección ni cobros implícitos',async()=>{
 await enableSecretary();const identity=await rpc('workspace_identity',[],stranger);
 expect(identity.secretarySchoolIds).toContain(school);expect(identity.collectionSchoolIds).not.toContain(school);
 expect(await rpc('has_school_role',[school,['director']],stranger)).toBe(false);
 const gid=await rpc('save_school_grade',[school,id(600),year,'Sala de cinco','Inicial','initial'],stranger);
 const parallel=await rpc('save_academic_parallel',[gid,id(601),'Blanco',id(50),30,'Mañana'],stranger);
 expect((await q('select grade_id,parallel_name,tutor_teacher_id from classrooms where id=$1',[parallel])).rows[0]).toMatchObject({grade_id:gid,parallel_name:'Blanco',tutor_teacher_id:id(50)});
 await expect(rpc('configure_class_subject',[parallel,'Lenguaje',[id(50)],true],stranger)).resolves.toBeTruthy();
 await expect(rpc('save_school_grade',[other,id(602),year,'Ajeno','Inicial',null],stranger)).rejects.toThrow('Secretaría');
 expect((await rpc('registration_workspace',[school],stranger)).canManage).toBe(true);
 expect((await rpc('registration_workspace',[school],stranger)).canCollect).toEqual([]);
 await expect(rpc('save_secretary_access',[school,'teacher@test.bo',true,true],stranger)).rejects.toThrow('Solo Dirección');
});
it('activar y revocar cobros de Secretaría se aplica en el servidor a cada operación',async()=>{
 await enableSecretary();await create(100);const app=await rpc('save_registration_form',[id(100),null,JSON.stringify(profile),true,1,true]);
 await expect(rpc('pay_registration',[id(100),'cash',null,true],stranger)).rejects.toThrow('autorizado');
 expect((await as(stranger,()=>q('select count(*)::int n from school_charges'))).rows[0].n).toBe(0);
 await enableSecretary(true);expect((await rpc('workspace_identity',[],stranger)).collectionSchoolIds).toContain(school);
 expect((await as(stranger,()=>q('select count(*)::int n from school_charges'))).rows[0].n).toBe(1);
 const charge=(await q('select charge_id from aulanexo_private.registration_applications where id=$1',[id(100)])).rows[0].charge_id;
 await expect(rpc('checkout_school_payment',[id(605),app.studentId,JSON.stringify([{chargeId:charge,amount:1}]),'cash','SECRETARIA-TEST',JSON.stringify({}),false],stranger)).resolves.toBeTruthy();
 await rpc('save_secretary_access',[school,'stranger@test.bo',false,false]);
 await expect(rpc('registration_workspace',[school],stranger)).rejects.toThrow('habilitarte');
 await expect(rpc('school_cashier_for_student',[app.studentId],stranger)).resolves.toBe(false);
});
it('el seguimiento de una materia llega a tutoría, Dirección y la familia, sin edición por otro profesor',async()=>{
 const {math,history,student}=await academicFixture();
 const observation=await rpc('save_student_observation',[id(610),student,history,'positive','Excelente participación.',null],id(8));
 expect(await rpc('observation_visible',[observation],teacher)).toBe(true);
 expect(await rpc('observation_visible',[observation],mother)).toBe(true);
 expect(await rpc('observation_visible',[observation],stranger)).toBe(false);
 await expect(rpc('save_student_observation',[id(611),student,history,'incident','Observación ajena.',null],teacher)).rejects.toThrow('propia materia');
 await expect(rpc('save_student_observation',[id(610),student,history,'positive','Texto alterado.',null],id(8))).rejects.toThrow('referencia');
 const observations=await rpc('student_observation_workspace',[null,student,null],mother);expect(observations).toHaveLength(1);
 const notices=(await q("select user_id from notifications where kind='student_observation' and source_id=$1",[observation])).rows.map((r:any)=>r.user_id);
 expect(notices).toContain(teacher);expect(notices).toContain(mother);expect(notices).toContain(director);expect(notices).not.toContain(stranger);
});
it('cada materia tiene publicaciones y mensajes privados del alumno correspondiente',async()=>{
 const {math,history,student}=await academicFixture();
 await rpc('save_subject_post',[id(620),math,null,'notice','Aviso de Matemáticas','Práctica para la próxima clase.',null],teacher);
 await expect(rpc('save_subject_post',[id(621),history,null,'notice','Ajeno','Intento fuera de mi materia.',null],teacher)).rejects.toThrow('Solo el docente');
 await rpc('save_subject_post',[id(622),math,student,'message','Consulta familiar','Tengo una consulta de la tarea.',null],mother);
 const family=await rpc('subject_feed_workspace',[math,student],mother);expect(family.posts).toHaveLength(2);expect(family.canWrite).toBe(false);
 await expect(rpc('subject_feed_workspace',[math,student],stranger)).rejects.toThrow('acceso');
 expect((await rpc('subject_feed_workspace',[history,student],teacher)).canWrite).toBe(false);
});
it('la asistencia por materia separa fecha y clase, valida nómina y conserva revisiones',async()=>{
 const {math,history,student}=await academicFixture();
 const day=(await q("select to_char(now() at time zone 'America/La_Paz','YYYY-MM-DD') as attendance_day")).rows[0].attendance_day;
 const workspace=await rpc('subject_attendance_workspace',[math,day,'08:00',null],teacher);
 const rows=workspace.roster.map((s:any)=>({studentId:s.student_id,status:'present',note:''}));
 expect(rows.length).toBeGreaterThan(0);
 await expect(rpc('save_subject_attendance',[history,day,'08:00',JSON.stringify(rows),0,true],teacher)).rejects.toThrow('Solo el docente');
 await rpc('save_subject_attendance',[math,day,'08:00',JSON.stringify(rows),0,false],teacher);
 await expect(rpc('save_subject_attendance',[math,day,'08:00',JSON.stringify(rows),0,true],teacher)).rejects.toThrow('cambió');
 await rpc('save_subject_attendance',[math,day,'08:00',JSON.stringify(rows),1,true],teacher);
 const family=await rpc('subject_attendance_workspace',[math,day,'08:00',student],mother);expect(family.roster).toEqual([]);expect(family.records).toEqual(rows.filter((r:any)=>r.studentId===student));
});
it('el tablero de Dirección está limitado al colegio y conserva datos incompletos',async()=>{
 const {math,student}=await academicFixture();
 const from=year+'-01-01',to=year+'-12-31';
 const dashboard=await rpc('institution_dashboard',[from,to,'month',school,null,'all']);
 expect(dashboard.schools.every((s:any)=>s.id===school)).toBe(true);
 await expect(rpc('institution_dashboard',[from,to,'month',other,null,'all'])).rejects.toThrow('Solo Dirección');
 await expect(rpc('institution_dashboard',[from,to,'month',school,null,'all'],teacher)).rejects.toThrow('Solo Dirección');
 const own=await rpc('teacher_academic_dashboard',[school],teacher);expect(own.subjects.map((s:any)=>s.id)).toEqual([math]);expect(own.tutorRooms.map((r:any)=>r.id)).toContain(roomA);
});
it('el consolidado conserva el método de cálculo, las notas faltantes y el umbral institucional',async()=>{
 const {math,history,student}=await academicFixture();
 const academicYear=(await q('select id from academic_years where school_id=$1 and year=$2',[school,year])).rows[0].id;
 await q("insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) values($1,$2,$3,'Primer período',$4,$5)",[id(700),school,academicYear,year+'-01-01',year+'-12-31']);
 for(const [assessment,subject] of [[id(701),math],[id(702),history]])await q("insert into assessments(id,school_id,term_id,classroom_id,class_subject_id,title,assessment_date,max_score,weight,created_by) values($1,$2,$3,$4,$5,'Evaluación',$6,100,1,$7)",[assessment,school,id(700),roomA,subject,year+'-05-01',teacher]);
 await q('insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,45,$4)',[school,id(701),student,teacher]);
 await rpc('save_institution_pass_mark',[school,60,0]);
 const summary=await rpc('student_academic_summary',[student],teacher);
 expect(summary.passMark).toBe(60);expect(summary.subjects.find((s:any)=>s.id===math).periods[0].total.score).toBe(45);
 expect(summary.subjects.find((s:any)=>s.id===history).periods[0].total.missing).toBeGreaterThan(0);
 await expect(rpc('student_academic_summary',[student],id(8))).rejects.toThrow('Solo tutoría');
 const family=await rpc('student_academic_summary',[student],mother);expect(family.publishedOnly).toBe(true);expect(family.subjects).toBeUndefined();
 const dashboard=await rpc('institution_dashboard',[year+'-01-01',year+'-12-31','month',school,null,'all']);expect(dashboard.summary.studentsAtRisk).toBe(1);
});
it('Secretaría invita docentes de su institución y no puede conceder Dirección ni enlazar alumnos ajenos',async()=>{
 await enableSecretary();
 await expect(rpc('create_invitation',[JSON.stringify({school_id:school,teacher_id:id(50),email:'teacher@test.bo',role:'teacher'})],stranger)).resolves.toMatch(/^[a-f0-9]{64}$/);
 await expect(rpc('create_invitation',[JSON.stringify({school_id:school,email:'stranger@test.bo',role:'director'})],stranger)).rejects.toThrow('rol');
 await expect(rpc('create_invitation',[JSON.stringify({school_id:school,email:'mother@test.bo',student_id:id(999),role:'guardian'})],stranger)).rejects.toThrow('institución');
});
it('la familia conserva las reglas de acceso académico y recibe el seguimiento inmediatamente',async()=>{
 const {math,student}=await academicFixture();
 await rpc('save_student_observation',[id(750),student,math,'positive','Reconocimiento compartido inmediatamente.',null],teacher);
 await q("insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Cuota ficticia vencida',(now() at time zone 'America/La_Paz')::date-1,10)",[school,student]);
 expect(await rpc('family_access',[student],mother)).toBe(false);
 await expect(rpc('subject_feed_workspace',[math,student],mother)).rejects.toThrow('acceso');
 await expect(rpc('student_academic_summary',[student],mother)).rejects.toThrow('acceso académico');
 expect((await rpc('student_observation_workspace',[null,student,null],mother))).toHaveLength(1);
});
