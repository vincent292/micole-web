// Live notification routing with normal QA accounts. SQL is evidence-only.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {qa,r,day,session,rpc,rows} from './qa-session.mjs';
import {databaseClient} from './database.mjs';

const folder='output/qa/2026-10-28-avisos';fs.mkdirSync(folder,{recursive:true});
const file=folder+'/matriz-api.json';
const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{day,mode:'normal independent QA Auth; read-only SQL evidence',resources:{},cases:[]};
const clients=new Map();let db;
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const account=k=>qa.accounts.find(a=>a.key===k);
const check=(id,detail)=>{report.cases=report.cases.filter(c=>c.id!==id);report.cases.push({id,status:'passed',detail});save();};
const resource=k=>{report.resources[k]??=randomUUID();save();return report.resources[k];};
async function publish(k,author,extra={}){
 const id=resource(k),notice={id,school_id:qa.schoolId,classroom_id:r.kinderA,title:'QA2810-NOTI-'+k.toUpperCase(),content:'Simulacro ficticio de notificaciones: '+k+'. Solo destinatarios QA autorizados.',audience:'families',category:'academic',requires_acknowledgment:false,remind_hourly:false,urgent:false,target_student_ids:[r.mateo],...extra};
 assert.equal(await rpc(clients.get(author),'save_announcement',{p_notice:notice}),id);
 assert.equal(await rpc(clients.get(author),'save_announcement',{p_notice:notice}),id);
 return id;
}
async function verify(k,source,expected,kind='announcement'){
 const records=(await db.query('select n.id,n.user_id,n.kind from public.notifications n where n.school_id=$1 and n.source_id=$2 order by n.user_id,n.kind',[qa.schoolId,source])).rows;
 const expectedIds=expected.map(k=>account(k).id).sort();
 assert.deepEqual(records.map(n=>n.user_id).sort(),expectedIds,k+': exact server recipients');
 assert.ok(records.every(n=>n.kind===kind),k+': notification kind');
 const inbox=[];
 for(const [key,c] of clients){
  const visible=await rows(c.from('notifications').select('id,source_id,kind').eq('source_id',source));
  assert.equal(visible.length,expected.includes(key)?1:0,k+': inbox '+key);
  if(account(key).role==='student' && kind==='announcement'){
   const portal=await rpc(c,'student_portal',{});
   assert.equal(portal.announcements.some(n=>n.id===source),expected.includes(key),k+': student portal '+key);
  }
  inbox.push({account:key,received:visible.length===1});
 }
 report.routing??={};report.routing[k]={source,kind,expected,inbox,serverRecipients:records.map(n=>({account:qa.accounts.find(a=>a.id===n.user_id)?.key||'UNEXPECTED',id:n.id}))};
 check(k,{exactRecipients:true,normalAccountInboxChecks:inbox.length,noDuplicates:true});
}
try {
 for(const a of qa.accounts)clients.set(a.key,await session(a.key));
 db=databaseClient();await db.connect();await db.query('begin read only');
 const parentAndChild=['guardian','father','studentb'];
 const existing=JSON.parse(fs.readFileSync(folder+'/direccion-web-publicado.json')).id;
 await verify('director-web-form',existing,parentAndChild);
 await verify('teacher-target',await publish('teacher-target','teacher'),parentAndChild);
 await verify('teacher-class',await publish('teacher-class','teacher',{target_student_ids:[]}),[...parentAndChild,'familyb']);
 await verify('director-school',await publish('director-school','director',{classroom_id:null,target_student_ids:[],audience:'all'}),['teacher','teacherb','guardian','father','familyb','student','studentb']);
 await verify('director-staff',await publish('director-staff','director',{audience:'staff',target_student_ids:[]}),['teacher']);
 await verify('teacher-health',await publish('teacher-health','teacher',{category:'health'}),['guardian','father']);
 await verify('director-required',await publish('director-required','director',{requires_acknowledgment:true,category:'general'}),['guardian','father']);
 await verify('other-class',await publish('other-class','teacherb',{classroom_id:r.kinderB,target_student_ids:[r.bruno]}),['familyb']);
 for(const [k,category,recipients] of [['teacher-private-note','observación',['guardian','father']],['teacher-task','tarea',parentAndChild]]){
  const id=resource(k);const exists=await rows(clients.get('director').from('daily_entries').select('id').eq('id',id));
  if(!exists.length)await rows(clients.get('teacher').from('daily_entries').insert({id,school_id:qa.schoolId,student_id:r.mateo,category,note:'QA2810-NOTI-'+k.toUpperCase()+': contenido ficticio para comprobar destinatarios.',entry_date:day}).select('id'));
  await verify(k,id,recipients,category==='tarea'?'daily_task':'daily');
 }
 const cid=resource('director-calendar');
 if(!(await rows(clients.get('director').from('calendar_events').select('id').eq('id',cid))).length)await rows(clients.get('director').from('calendar_events').insert({id:cid,school_id:qa.schoolId,classroom_id:r.kinderA,title:'QA2810-NOTI-CALENDAR',description:'Actividad ficticia de aula.',event_date:day,type:'event'}).select('id'));
 await verify('director-calendar',cid,[...parentAndChild,'familyb'],'calendar');
 for(const [k,who,extra] of [['teacher-foreign-class','teacherb',{classroom_id:r.kinderA}],['teacher-foreign-school','teacher',{school_id:qa.otherSchoolId,classroom_id:r.otherRoom}],['parent-cannot-publish','guardian',{}],['student-cannot-publish','studentb',{}]]){
  const denied=await clients.get(who).rpc('save_announcement',{p_notice:{id:resource(k),school_id:qa.schoolId,classroom_id:r.kinderA,title:'QA2810-NOTI-DENIED',content:'Este intento debe ser rechazado.',audience:'families',category:'general',target_student_ids:[],...extra}});assert.ok(denied.error,k);check(k,{rejected:true});
 }
 const required=report.resources['director-required'];
 const first=await rpc(clients.get('guardian'),'read_announcement',{p_id:required,p_agree:false});assert.ok(first.readAt);assert.equal(first.acknowledgedAt,null);
 const agreed=await rpc(clients.get('guardian'),'read_announcement',{p_id:required,p_agree:true});assert.ok(agreed.acknowledgedAt);
 const father=await rpc(clients.get('father'),'announcement_view',{p_id:required});assert.equal(father.acknowledgedAt,null);
 assert.ok((await clients.get('studentb').rpc('read_announcement',{p_id:required,p_agree:true})).error);
 check('personal-read-and-ack',{openDoesNotAgree:true,motherConfirmed:true,fatherStillPending:true,studentCannotAgree:true});
 report.status='passed';delete report.failure;save();console.log(JSON.stringify({ok:true,cases:report.cases.length,routingCases:Object.keys(report.routing).length,normalAccounts:clients.size,output:file,secretsPrinted:false}));
}catch(e){report.status='failed';report.failure={message:e.message};save();console.error(JSON.stringify({ok:false,message:e.message,output:file}));process.exitCode=1;}
finally{if(db){await db.query('rollback').catch(()=>{});await db.end();}await Promise.allSettled([...clients.values()].map(c=>c.auth.signOut({scope:'local'})));}
