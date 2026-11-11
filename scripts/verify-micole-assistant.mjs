// Only persisted sandbox accounts. No messages are published or emailed.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {session,qa,rpc} from './qa-session.mjs';
import {databaseClient} from './database.mjs';
const db=databaseClient();await db.connect();
const checks=[];let priorPause,userId,pausedDuringTest;
async function ask(c,text){const {data,error}=await c.functions.invoke('guide-assistant',{headers:{Origin:'https://www.micole.click'},body:{schoolId:qa.schoolId,role:'director',page:'overview',messages:[{role:'user',text}]}});if(error)throw Error('No se pudo consultar Mica: '+(await error.context?.json().catch(()=>null))?.error);assert.ok(data?.answer);return data;}
try{
 for(const key of ['director','teacher','guardian','student','scheduler']){
  const c=await session(key);const account=qa.accounts.find(a=>a.key===key);const state=await rpc(c,'micole_assistant_state',{p_school_id:qa.schoolId,p_role:account.role});assert.ok(Object.hasOwn(state,'pausedUntil'));checks.push({check:'authorized_panel',role:account.role,passed:true});await c.auth.signOut({scope:'local'});
 }
 const c=await session('director');userId=(await c.auth.getUser()).data.user.id;
 priorPause=(await db.query('select paused_until from aulanexo_private.assistant_pauses where user_id=$1',[userId])).rows[0]?.paused_until;
 assert.ok(!priorPause||new Date(priorPause)<=new Date(),'La cuenta QA ya está en pausa; no alterar una pausa preexistente.');
 const help=await ask(c,'No carga una pantalla de MiCole, ¿qué puedo revisar?');
 assert.ok(help.steps.length>0);assert.equal(help.pausedUntil,undefined);checks.push({check:'live_assistant_reply',mode:help.mode,passed:true});
 const offTopic=await ask(c,'¿Cuál es la capital de Francia?');assert.ok(offTopic.pausedUntil);assert.ok(!/Par[ií]s/i.test(offTopic.answer));pausedDuringTest=offTopic.pausedUntil;const seconds=(Date.parse(pausedDuringTest)-Date.now())/1000;assert.ok(seconds>1700&&seconds<=1805);checks.push({check:'off_topic_pauses_30_minutes',passed:true});
 const blocked=await ask(c,'Ahora sí, ayúdame con la asistencia de MiCole.');assert.equal(blocked.pausedUntil,pausedDuringTest);checks.push({check:'pause_persists_without_extension',passed:true});
 await c.auth.signOut({scope:'local'});
 const result={status:'passed',checks,realSchoolWrites:false,publishedMessages:0,emailsSent:0,qaPauseRestored:true};
 await fs.mkdir('output/qa/2026-11-08-micole-ia',{recursive:true});await fs.writeFile('output/qa/2026-11-08-micole-ia/remote-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{
 if(userId&&pausedDuringTest){
  if(priorPause)await db.query('update aulanexo_private.assistant_pauses set paused_until=$3 where user_id=$1 and paused_until=$2::timestamptz',[userId,pausedDuringTest,priorPause]);
  else await db.query('delete from aulanexo_private.assistant_pauses where user_id=$1 and paused_until=$2::timestamptz',[userId,pausedDuringTest]);
 }
 await db.end();
}
