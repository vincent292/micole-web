import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),keys=['owner','outsider','school','otherSchool','room','otherRoom','teacher','child','otherChild','task'],ids=Object.fromEntries(keys.map(k=>[k,randomUUID()])),suffix=randomUUID().slice(0,8),checks=[];
const q=(text,values=[])=>db.query({text,values,query_timeout:30000});db.on('error',()=>{});let serial=0;
function check(name,value){if(!value)throw new Error('Falló: '+name);checks.push(name);}
async function as(user,task,sid){const point=`test_scope_${++serial}`;await q(`savepoint ${point}`);await q('set local role authenticated');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[user,JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify(sid?{'x-micole-support':sid}:{})]);try{const r=await task();await q('reset role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true)");await q(`release savepoint ${point}`);return r;}catch(e){await q(`rollback to savepoint ${point}`);await q(`release savepoint ${point}`);throw e;}}
async function denied(user,task,sid){try{await as(user,task,sid);return false;}catch{return true;}}
async function start(role,target=null,relationship=null){return (await as(ids.owner,()=>q('select start_test_session($1,$2,$3,$4) as value',[ids.school,role,target,relationship]))).rows[0].value.id;}
try{
 await db.connect();await q("set statement_timeout='25s'");await q('begin');
 if(process.argv.includes('--with-migration'))await q(fs.readFileSync(new URL('../supabase/migrations/202610170005_owner_test_workspace.sql',import.meta.url),'utf8'));
 for(const k of ['owner','outsider'])await q("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{\"full_name\":\"Verificación temporal de pruebas\"}')",[ids[k],`${k}-${suffix}@example.invalid`]);
 await q('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[`owner-${suffix}@example.invalid`]);await q('insert into platform_admins(user_id) values($1)',[ids.owner]);
 await q("insert into schools(id,name,slug,status) values($1,'Pruebas temporales de roles',$2,'active'),($3,'Otro colegio temporal',$4,'active')",[ids.school,`testing-${suffix}`,ids.otherSchool,`other-testing-${suffix}`]);
 await q("insert into classrooms(id,school_id,name) values($1,$2,'Aula temporal'),($3,$2,'Otra aula temporal')",[ids.room,ids.school,ids.otherRoom]);
 await q("insert into teachers(id,school_id,name,email,status) values($1,$2,'Docente sin cuenta','sin-cuenta@example.invalid','active')",[ids.teacher,ids.school]);await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[ids.school,ids.teacher,ids.room]);
 for(const [child,room] of [[ids.child,ids.room],[ids.otherChild,ids.otherRoom]])await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Niño','Temporal','active',true,'Madre','madre@example.invalid','Padre','padre@example.invalid','2017-01-01')",[child,ids.school,room]);
 await q("update platform_charges set status='paid' where school_id=$1",[ids.school]);
 check('Otras cuentas no habilitan pruebas',await denied(ids.outsider,()=>q('select set_test_institution($1,true)',[ids.school])));
 check('No se prueban instituciones sin marcar',await denied(ids.owner,()=>q("select start_test_session($1,'director',null,null)",[ids.school])));
 await as(ids.owner,()=>q('select set_test_institution($1,true)',[ids.school]));
 let sid=await start('director');let identity=(await as(ids.owner,()=>q('select workspace_identity() as value'),sid)).rows[0].value;
 check('Dirección tiene contexto de pruebas sin ticket',identity.roles[0]==='director'&&identity.support.mode==='test');
 check('Dirección no accede a otra institución',(await as(ids.owner,()=>q("select has_school_role($1,array['director']) as value",[ids.otherSchool]),sid)).rows[0].value===false);
 const subject=(await as(ids.owner,()=>q("select configure_class_subject($1,'Matemáticas',array[$2]::uuid[],true) as value",[ids.room,ids.teacher]),sid)).rows[0].value;
 sid=await start('teacher',ids.teacher);identity=(await as(ids.owner,()=>q('select workspace_identity() as value'),sid)).rows[0].value;
 check('Docente de correo ficticio usa sus aulas',identity.teacherIds[0]===ids.teacher&&(await as(ids.owner,()=>q('select id from students'),sid)).rowCount===1);
 const task={id:ids.task,classroom_id:ids.room,class_subject_id:subject,title:'Tarea temporal',instructions:'Responder para verificar los roles',status:'published',max_score:20,allow_late:true};
 await as(ids.owner,()=>q('select save_assignment($1::jsonb)',[JSON.stringify(task)]),sid);
 sid=await start('student',ids.child);const portal=(await as(ids.owner,()=>q('select student_portal() as value'),sid)).rows[0].value;
 check('Portal infantil activo sin ficha privada',portal.accessAllowed&&portal.students[0].id===ids.child&&!JSON.stringify(portal).includes('motherEmail'));
 const sub=(await as(ids.owner,()=>q('select save_assignment_submission($1,$2,true) as value',[ids.task,'Respuesta de prueba']),sid)).rows[0].value;
 sid=await start('teacher',ids.teacher);await as(ids.owner,()=>q("select review_assignment_submission($1,'reviewed','Correcto',18)",[sub]),sid);
 sid=await start('guardian',ids.child,'mother');
 check('Familia solo consulta al niño elegido',(await as(ids.owner,()=>q('select id from students'),sid)).rows.every(r=>r.id===ids.child));
 check('Familia no entrega tareas',await denied(ids.owner,()=>q('select save_assignment_submission($1,$2,true)',[ids.task,'Intento no permitido']),sid));
 check('Familia consulta la revisión',(await as(ids.owner,()=>q('select score from assignment_submissions where id=$1',[sub]),sid)).rows.some(r=>Number(r.score)===18));
 check('No se crean cuentas o vínculos para el docente ficticio',(await q('select user_id from teachers where id=$1',[ids.teacher])).rows[0].user_id===null);
 check('Una sesión no se presta a otra cuenta',await denied(ids.outsider,()=>q('select workspace_identity()'),sid));
 await as(ids.owner,()=>q('select set_test_institution($1,false)',[ids.school]));check('Desactivar pruebas revoca las sesiones',await denied(ids.owner,()=>q('select workspace_identity()'),sid));
 await q('rollback');check('No quedan usuarios ni datos de la verificación',(await q('select id from auth.users where id=$1',[ids.owner])).rowCount===0);
 console.log(JSON.stringify({ok:true,rolledBack:true,checks,notificationsSent:false,secretsPrinted:false}));
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
