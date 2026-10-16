import { randomUUID } from "node:crypto";
import { databaseClient, reportFailure } from "./database.mjs";
const db=databaseClient();
const ids=Object.fromEntries(['owner','director','teacher','mother','father','student','stranger','school','room','otherRoom','child','otherChild','event','notice','staffNotice','task','observation','grade'].map(key=>[key,randomUUID()]));
const suffix=randomUUID().slice(0,8), email=who=>`micole-reader-${who}-${suffix}@example.invalid`;
const passed=[];
let transaction=false;
const check=(label,condition)=>{if(!condition)throw new Error(`Falló: ${label}`);passed.push(label);};
async function asUser(user,task,session=null,role='authenticated') {
 await db.query(`set local role ${role}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",[user||'',JSON.stringify(session?{'x-micole-support':session}:{})]);
 const result=await task();
 await db.query('reset role');
 await db.query("select set_config('request.jwt.claim.sub','',true),set_config('request.headers','{}',true)");
 return result;
}
async function denied(task) {
 await db.query('savepoint expected_reader_denial');
 try {await task();await db.query('release savepoint expected_reader_denial');return false;}
 catch(error){await db.query('rollback to savepoint expected_reader_denial');await db.query('release savepoint expected_reader_denial');return ['42501','P0001','22023'].includes(error.code);}
}
const identity=async()=> (await db.query('select public.workspace_identity() as value')).rows[0].value;
const portal=async()=> (await db.query('select public.student_portal() as value')).rows[0].value;
const enable=(enabled=true,address=email('student'))=>db.query('select public.set_student_login($1,$2,$3)',[ids.child,address,enabled]);
try {
 await db.connect();await db.query('begin');transaction=true;
 await db.query('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[email('owner')]);
 for(const who of ['owner','director','teacher','mother','father','student','stranger']) await db.query("insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),'{}')",[ids[who],email(who)]);
 await db.query("insert into public.schools(id,name,slug,status,show_on_landing) values($1,'Colegio temporal de lectura',$2,'active',false)",[ids.school,`readers-${suffix}`]);
 await db.query("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[ids.school,ids.director,ids.teacher]);
 await db.query("insert into public.classrooms(id,school_id,name) values($1,$2,'Primero A'),($3,$2,'Primero B')",[ids.room,ids.school,ids.otherRoom]);
 await db.query("insert into public.teachers(school_id,user_id,name,email,status) values($1,$2,'Profesora temporal',$3,'active')",[ids.school,ids.teacher,email('teacher')]);
 await db.query("insert into public.students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,allergies) values($1,$2,$3,'Estudiante','Temporal','active',true,'Madre',$4,'Padre',$5,'SALUD PRIVADA'),($6,$2,$7,'Otro','Temporal','active',true,'Madre ajena','otra@example.invalid','Padre ajeno','otro@example.invalid','')",[ids.child,ids.school,ids.room,email('mother'),email('father'),ids.otherChild,ids.otherRoom]);
 await db.query("insert into public.platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación inicial','2026-10',50,'paid')",[ids.school,ids.child]);
 await db.query("insert into public.school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Cuota temporal',(now() at time zone 'America/La_Paz')::date+1,429)",[ids.school,ids.child]);
 await asUser(ids.director,async()=>{
  await db.query("insert into public.calendar_events(id,school_id,classroom_id,title,event_date,type,description) values($1,$2,$3,'Tarea del curso',current_date,'homework','Leer un cuento')",[ids.event,ids.school,ids.room]);
  await db.query("insert into public.announcements(id,school_id,classroom_id,title,content,audience) values($1,$2,$3,'Aviso del curso','Consulta','families'),($4,$2,null,'Personal','SECRETO PERSONAL','staff')",[ids.notice,ids.school,ids.room,ids.staffNotice]);
  await db.query("insert into public.daily_entries(id,school_id,student_id,category,note) values($1,$2,$3,'tarea','Tarea propia'),($4,$2,$3,'observación','OBSERVACION PRIVADA')",[ids.task,ids.school,ids.child,ids.observation]);
  await db.query("insert into public.grades(id,school_id,student_id,subject,period,score,recommendation) values($1,$2,$3,'Lectura','Trimestre','90','Buen avance')",[ids.grade,ids.school,ids.child]);
 });
 for(const who of ['teacher','mother','student','stranger','owner']) check(`${who} no puede habilitar acceso`,await asUser(ids[who],()=>denied(()=>enable())));
 check('El correo de un padre no puede ser infantil',await asUser(ids.director,()=>denied(()=>enable(true,email('mother')))));
 await asUser(ids.director,()=>enable());
 const access=await asUser(ids.student,identity);
 check('Rol de estudiante derivado del correo confirmado',access.roles.join(',')==='student'&&access.studentIds[0]===ids.child&&access.guardianStudentIds.length===0);
 const data=await asUser(ids.student,portal);
 check('Portal académico autorizado y mínimo',data.accessAllowed&&data.events.length===1&&data.announcements.length===1&&data.dailyEntries.length===1&&data.dailyEntries[0].id===ids.task);
 check('El portal no contiene pagos, salud ni observaciones',!JSON.stringify(data).match(/SALUD PRIVADA|OBSERVACION PRIVADA|SECRETO PERSONAL|monthlyFee|motherEmail|charges|payments|messages|grades/));
 for(const table of ['students','school_charges','messages','student_documents','grades'])check(`Estudiante no lee tabla ${table}`,(await asUser(ids.student,()=>db.query(`select id from public.${table}`))).rows.length===0);
 check('Estudiante no publica eventos',await asUser(ids.student,()=>denied(()=>db.query("insert into public.calendar_events(school_id,title,event_date,type,description) values($1,'No permitido',current_date,'event','Intento')",[ids.school]))));
 check('Estudiante no registra instituciones',await asUser(ids.student,()=>denied(()=>db.query("select public.request_institution('{}')"))));
 for(const who of ['mother','father']) {
  const parent=await asUser(ids[who],identity);check(`${who} vinculado a su hijo`,parent.guardianStudentIds.includes(ids.child));
  const results=await asUser(ids[who],async()=>{
   const rows=[];for(const table of ['calendar_events','daily_entries','grades','announcements'])rows.push((await db.query(`select id from public.${table} where school_id=$1`,[ids.school])).rows.length);return rows;
  });check(`${who} lee agenda, actividades, notas y avisos`,results.join(',')==='1,2,1,1');
  check(`${who} no publica avisos`,await asUser(ids[who],()=>denied(()=>db.query("insert into public.announcements(school_id,title,content) values($1,'No permitido','x')",[ids.school]))));
 }
 await db.query("update public.school_charges set due_date=(now() at time zone 'America/La_Paz')::date-1 where student_id=$1",[ids.child]);
 const locked=await asUser(ids.student,portal);check('Deuda bloquea contenido sin mostrar montos',!locked.accessAllowed&&locked.events.length===0&&locked.announcements.length===0&&locked.dailyEntries.length===0&&!JSON.stringify(locked).includes('429'));
 await db.query("update public.students set access_until=(now() at time zone 'America/La_Paz')::date+1 where id=$1",[ids.child]);check('El plazo de Dirección habilita el acceso', (await asUser(ids.student,portal)).accessAllowed);
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[ids.student]);check('Correo sin confirmar no accede',await asUser(ids.student,()=>denied(portal)));await db.query('update auth.users set email_confirmed_at=now() where id=$1',[ids.student]);
 const session=(await asUser(ids.owner,()=>db.query("select public.start_support_session($1,$2,'student','Revisar acceso de consulta') as value",[ids.school,ids.student]))).rows[0].value.id;
 check('Soporte del propietario reproduce el portal', (await asUser(ids.owner,portal,session)).students[0].id===ids.child);
 check('Soporte infantil no puede habilitar accesos',await asUser(ids.owner,()=>denied(()=>enable()),session));
 await asUser(ids.director,()=>enable(false,''));check('Revocación invalida soporte inmediatamente',await asUser(ids.owner,()=>denied(portal),session));check('Revocación invalida acceso del alumno',await asUser(ids.student,()=>denied(portal)));
 await asUser(ids.owner,()=>db.query('select public.end_support_session($1)',[session]));
 check('Anon no accede al portal',await asUser(null,()=>denied(portal),null,'anon'));
 await db.query('rollback');transaction=false;console.log(JSON.stringify({ok:true,checks:passed.length,passed,rolledBack:true}));
} catch(error){if(transaction)await db.query('rollback').catch(()=>{});reportFailure(error);}finally{await db.end();}
