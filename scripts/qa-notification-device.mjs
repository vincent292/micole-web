// Fresh QA notices after the phone is registered to the intended recipient.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {qa,r,session,rpc,rows} from './qa-session.mjs';import {databaseClient} from './database.mjs';
const recipient=process.argv[2];assert.ok(['father','studentb'].includes(recipient));
const author=recipient==='father'?'teacher':'director',folder='output/qa/2026-10-28-avisos',file=`${folder}/${recipient}-aviso-nuevo.json`;
const who=qa.accounts.find(a=>a.key===recipient),db=databaseClient();let c;
try{
 await db.connect();await db.query('begin read only');
 const active=(await db.query('select count(*)::int as n from aulanexo_private.push_devices where user_id=$1 and enabled and expires_at>now() and aulanexo_private.push_session_active(session_id)',[who.id])).rows[0].n;
 assert.ok(active>0,'El teléfono aún no está registrado al destinatario QA');await db.query('rollback');
 const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{id:randomUUID(),recipient,author,title:recipient==='father'?'QA2810-PAPA-DOCENTE':'QA2810-ALUMNO-DIRECCION',activeDeviceBeforeCreate:true};fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 c=await session(author);await rpc(c,'save_announcement',{p_notice:{id:report.id,school_id:qa.schoolId,classroom_id:r.kinderA,title:report.title,content:report.title+': Simulacro ficticio para verificar la llegada Android y apertura exacta con la cuenta '+recipient+'.',audience:'families',category:'general',target_student_ids:[r.mateo],requires_acknowledgment:false,remind_hourly:false,urgent:false}});
 report.created=true;report.notifications=(await db.query('select n.id,n.user_id,n.kind,n.created_at from public.notifications n where n.school_id=$1 and n.source_id=$2 order by n.user_id',[qa.schoolId,report.id])).rows;
 assert.equal(report.notifications.length,3);report.targetNotificationId=report.notifications.find(n=>n.user_id===who.id).id;
 fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({created:true,recipient,author,title:report.title,notificationId:report.targetNotificationId}));
}catch(e){console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}
finally{if(c)await c.auth.signOut({scope:'local'});await db.end();}
