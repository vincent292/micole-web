import {randomUUID} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),ids=Object.fromEntries(['director','teacher','mother','father','kid','outsider','school','room','otherRoom','student','teacherRecord','task'].map(k=>[k,randomUUID()])),suffix=randomUUID().slice(0,8),email=k=>`micole-learning-${k}-${suffix}@example.invalid`,checks=[];
db.on('error',()=>{});
const q=(sql,args=[])=>db.query({text:sql,values:args,query_timeout:30000});
function check(name,value){if(!value)throw new Error('Falló: '+name);checks.push(name);}
let serial=0;
async function as(user,task){const point=`scope_${++serial}`;await q(`savepoint ${point}`);await q('set local role authenticated');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers','{}',true)",[user,JSON.stringify({sub:user,role:'authenticated'})]);try{const result=await task();await q('reset role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true)");await q(`release savepoint ${point}`);return result;}catch(e){await q(`rollback to savepoint ${point}`);await q(`release savepoint ${point}`);throw e;}}
async function denied(user,task){try{await as(user,task);return false;}catch{return true;}}
try{
 await db.connect();await q("set statement_timeout='25s'");await q('begin');
 for(const user of ['director','teacher','mother','father','kid','outsider'])await q("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),'{\"full_name\":\"Prueba temporal académica\"}')",[ids[user],email(user)]);
 await q("insert into schools(id,name,slug,status) values($1,'Prueba temporal académica',$2,'active')",[ids.school,`learning-${suffix}`]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[ids.school,ids.director,ids.teacher]);
 await q("insert into classrooms(id,school_id,name) values($1,$2,'Aula temporal'),($3,$2,'Otra aula temporal')",[ids.room,ids.school,ids.otherRoom]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente temporal',$4,'active')",[ids.teacherRecord,ids.school,ids.teacher,email('teacher')]);
 await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[ids.school,ids.teacherRecord,ids.room]);
 await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,identity_number,birth_date) values($1,$2,$3,'Estudiante','Temporal','active',true,'Madre temporal',$4,'Padre temporal',$5,$6,'2017-01-01')",[ids.student,ids.school,ids.room,email('mother'),email('father'),`TEMP-${suffix}`]);
 await q("update platform_charges set status='paid' where student_id=$1",[ids.student]);
 await as(ids.mother,()=>q('select workspace_identity()'));await as(ids.father,()=>q('select workspace_identity()'));
 await as(ids.director,()=>q('select set_student_login($1,$2,true)',[ids.student,email('kid')]));
 const cs=(await as(ids.director,()=>q('select configure_class_subject($1,$2,$3::uuid[],true) as value',[ids.room,'Matemáticas',[ids.teacherRecord]]))).rows[0].value;
 const portal=(await as(ids.kid,()=>q('select student_portal() as value'))).rows[0].value;
 check('Portal infantil activo con materias y sin datos privados',portal.accessAllowed&&portal.classrooms[0].subjectsEnabled===true&&!JSON.stringify(portal).includes('identityNumber'));
 const task={id:ids.task,classroom_id:ids.room,class_subject_id:cs,title:'Tarea temporal de validación',instructions:'Respuesta de comprobación sin datos reales',status:'published',max_score:100,allow_late:true,due_at:new Date(Date.now()+86400000).toISOString()};
 await as(ids.teacher,()=>q('select save_assignment($1::jsonb)',[JSON.stringify(task)]));
 const grade=(await as(ids.teacher,()=>q("insert into grades(school_id,student_id,class_subject_id,subject,period,score,recommendation) values($1,$2,$3,'Nombre libre no confiable','Gestión actual','90','Validación temporal') returning subject",[ids.school,ids.student,cs]))).rows[0];
 check('La nota utiliza la materia canónica del aula',grade.subject==='Matemáticas');
 check('No se permite omitir materia en un aula que trabaja por materias',await denied(ids.teacher,()=>q("insert into grades(school_id,student_id,subject,period,score,recommendation) values($1,$2,'Otra','Gestión actual','90','Validación temporal')",[ids.school,ids.student])));

 check('Docente publica solo en su aula',await denied(ids.teacher,()=>q('select save_assignment($1::jsonb)',[JSON.stringify({...task,id:randomUUID(),classroom_id:ids.otherRoom})])));
 check('Familia no entrega por el estudiante',await denied(ids.mother,()=>q('select save_assignment_submission($1,$2,true)',[ids.task,'Intento inválido'])));
 const sub=(await as(ids.kid,()=>q('select save_assignment_submission($1,$2,true) as value',[ids.task,'Respuesta temporal']))).rows[0].value;
 check('Entrega propia visible al estudiante',(await as(ids.kid,()=>q('select id from assignment_submissions where id=$1',[sub]))).rowCount===1);
 check('Entrega invisible a una cuenta ajena',(await as(ids.outsider,()=>q('select id from assignment_submissions where id=$1',[sub]))).rowCount===0);
 await as(ids.teacher,()=>q('select review_assignment_submission($1,$2,$3,null)',[sub,'returned','Explica el razonamiento']));
 await as(ids.kid,()=>q('select save_assignment_submission($1,$2,true)',[ids.task,'Respuesta temporal corregida']));
 await as(ids.teacher,()=>q('select review_assignment_submission($1,$2,$3,85)',[sub,'reviewed','Revisión temporal']));
 const result=(await as(ids.mother,()=>q('select score,status,revision from assignment_submissions where id=$1',[sub]))).rows[0];
 check('Familia consulta la revisión de su hijo',result?.status==='reviewed'&&Number(result.score)===85&&result.revision===2);
 check('Estudiante no modifica una entrega revisada',await denied(ids.kid,()=>q('select save_assignment_submission($1,$2,true)',[ids.task,'Cambio no autorizado'])));
 const notice=(await q("select id from notifications where user_id=$1 and kind='assignment_reviewed_2_reviewed' limit 1",[ids.kid])).rows[0];
 check('El worker puede resolver el aviso académico autorizado',!!notice&&(await q('select aulanexo_private.push_notice_visible($1) as value',[notice.id])).rows[0].value===true);
 check('Confirmar archivos está reservado al servidor',(await q("select has_function_privilege('authenticated','public.finish_assignment_file(uuid,integer,text)','execute') as value")).rows[0].value===false);
 await q('rollback');
 check('Las pruebas no dejan usuarios ni registros temporales',(await q('select id from auth.users where id=$1',[ids.kid])).rowCount===0);
 console.log(JSON.stringify({ok:true,rolledBack:true,checks,notificationsSent:false,secretsPrinted:false}));
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
