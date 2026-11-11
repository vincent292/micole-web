// Real QA-only REST/RPC circuits. UI evidence is recorded separately.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {qa,r,url,key,day,session,rpc,rows} from './qa-session.mjs';
const output='output/qa/2026-10-27-completa/circuitos-api.json';
const report=fs.existsSync(output)?JSON.parse(fs.readFileSync(output)):{day,mode:'normal QA Auth, live server',cases:[],resources:{}};
const clients=[];
function save(){fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
function pass(id,detail){report.cases=report.cases.filter(c=>c.id!==id);report.cases.push({id,status:'passed',detail});save();}
async function login(k){const c=await session(k);clients.push(c);return c;}
async function media(c,body){const {data}=await c.auth.getSession();const res=await fetch(url+'/functions/v1/r2-media',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+data.session.access_token,apikey:key,Origin:'https://www.micole.click'},body:JSON.stringify(body)});const value=await res.json();return {status:res.status,value,cors:res.headers.get('access-control-allow-origin')};}
try{
 const director=await login('director'),teacher=await login('teacher'),mother=await login('guardian'),father=await login('father'),other=await login('familyb'),teacherB=await login('teacherb'),scheduler=await login('scheduler');
 const getCare=c=>rows(c.from('care_records').select('id,student_id,kind,food,amount,note,occurred_at,ended_at').eq('school_id',qa.schoolId).eq('entry_date',day));
 const all=await getCare(director),group=all.filter(c=>c.food==='QA2810-GRUPO-FRUTA');
 assert.equal(group.length,2);assert.deepEqual(group.map(c=>c.student_id).sort(),[r.mateo,r.sofia].sort());
 assert.equal(group.find(c=>c.student_id===r.mateo).amount,'all');assert.equal(group.find(c=>c.student_id===r.sofia).amount,'half');
 for(const [c,child,note,hidden] of [[mother,r.mateo,'QA-MATEO-PRIVADO',r.sofia],[father,r.mateo,'QA-MATEO-PRIVADO',r.sofia],[other,r.sofia,'QA-SOFIA-PRIVADO',r.mateo]]){const visible=await getCare(c);assert.equal(visible.find(v=>v.student_id===child&&v.food==='QA2810-GRUPO-FRUTA')?.note,note);assert.ok(!visible.some(v=>v.student_id===hidden));assert.ok(!visible.some(v=>v.student_id===r.emma&&v.food==='QA2810-GRUPO-FRUTA'));}
 assert.equal((await getCare(teacherB)).filter(c=>c.food==='QA2810-GRUPO-FRUTA').length,0);
 pass('group-web-persisted-and-private','Lote real de la web: Mateo todo, Sofia mitad; madre/padre/otra familia ven solo la observación propia. Emma y otro docente no reciben el lote.');
 report.resources.careRequest??=randomUUID();save();
 const records=[{student_id:r.mateo,kind:'rest',occurred_at:'09:00',ended_at:'09:30',note:'QA2810-REST'},{student_id:r.mateo,kind:'hygiene',occurred_at:'09:45',hygiene:'toilet',note:'QA2810-HYGIENE'},{student_id:r.mateo,kind:'mood',occurred_at:'10:00',mood:'happy',note:'QA2810-MOOD'}];
 // One batch has one care type: test each independently with stable requests.
 for(const record of records){const request=report.resources['care-'+record.kind]??=randomUUID();save();const p={p_school_id:qa.schoolId,p_classroom_id:r.kinderA,p_day:day,p_request_id:request,p_records:[record]};assert.equal((await rpc(teacher,'save_care_batch',p)).saved,1);assert.equal((await rpc(teacher,'save_care_batch',p)).saved,1);assert.equal((await getCare(mother)).filter(v=>v.note===record.note).length,1);}
 pass('care-kinds-retry','Docente guarda descanso, higiene y ánimo; cada reintento conserva un registro y la madre los consulta.');
 const invalid={p_school_id:qa.schoolId,p_classroom_id:r.kinderA,p_day:day,p_request_id:randomUUID(),p_records:[{student_id:r.mateo,kind:'meal',occurred_at:'10:00',food:'QA2810-ATOMIC-REJECT',amount:'all'},{student_id:r.sofia,kind:'meal',occurred_at:'10:00',food:'QA2810-ATOMIC-REJECT',amount:'INVALID'}]};assert.ok((await teacher.rpc('save_care_batch',invalid)).error);assert.equal((await getCare(director)).filter(v=>v.food==='QA2810-ATOMIC-REJECT').length,0);
 pass('care-invalid-atomic','Un niño inválido rechaza todo el lote; no queda el registro válido parcial.');
 for(const [k,room,title] of [['agenda-a',r.kinderA,'QA2810-AGENDA-A'],['agenda-b',r.kinderB,'QA2810-AGENDA-B'],['agenda-school',null,'QA2810-AGENDA-SEDE']]){if(!report.resources[k]){const id=randomUUID();await rows(director.from('calendar_events').insert({id,school_id:qa.schoolId,classroom_id:room,title,description:'Actividad ficticia para comprobar el alcance de la agenda.',event_date:day,type:'event'}).select('id'));report.resources[k]=id;save();}}
 for(const [c,allowed] of [[mother,['agenda-a','agenda-school']],[other,['agenda-a','agenda-b','agenda-school']],[teacherB,['agenda-b','agenda-school']]]){const events=await rows(c.from('calendar_events').select('id').in('id',['agenda-a','agenda-b','agenda-school'].map(k=>report.resources[k])));assert.deepEqual(events.map(e=>e.id).sort(),allowed.map(k=>report.resources[k]).sort());}
 pass('agenda-room-and-school','Agenda de aula A, B y sede: cada familia y docente recibe solo sus aulas y el evento general.');
 if(!report.resources.notebook){const id=randomUUID();await rows(teacher.from('daily_entries').insert({id,school_id:qa.schoolId,student_id:r.mateo,category:'observación',note:'QA2810-CUADERNO: Hoy practicamos colores con bloques ficticios.',entry_date:day}).select('id'));report.resources.notebook=id;save();}
 assert.equal((await rows(mother.from('daily_entries').select('id').eq('id',report.resources.notebook))).length,1);assert.equal((await rows(other.from('daily_entries').select('id').eq('id',report.resources.notebook))).length,0);
 pass('notebook-private','Novedad creada por docente; madre la consulta y otra familia no obtiene el identificador.');
 const image=fs.readFileSync('output/qa/2026-10-27-apk-web/qa-documento-ficticio.png');
 for(const body of [{mimeType:'text/html',size:100},{mimeType:'image/png',size:5242881}]){const bad=await media(teacher,{action:'upload',schoolId:qa.schoolId,studentId:r.mateo,...body});assert.equal(bad.status,400);assert.ok(!bad.value.url);}
 pass('file-invalid-size-type','El servidor rechaza HTML y archivos mayores de 5 MB antes de emitir una URL de carga.');
 if(!report.resources.asset){const prepared=await media(teacher,{action:'upload',schoolId:qa.schoolId,studentId:r.mateo,mimeType:'image/png',size:image.length});assert.equal(prepared.status,200);assert.equal(prepared.cors,'https://www.micole.click');const put=await fetch(prepared.value.url,{method:'PUT',headers:{'Content-Type':'image/png',Origin:'https://www.micole.click'},body:image});assert.equal(put.status,200);assert.equal(put.headers.get('access-control-allow-origin'),'https://www.micole.click');const finished=await media(teacher,{action:'finalize',schoolId:qa.schoolId,studentId:r.mateo,objectKey:prepared.value.objectKey,caption:'QA2810-GALERIA-MATEO: imagen sintetica de pruebas.'});assert.equal(finished.status,200);assert.ok(finished.value.id);report.resources.asset=finished.value.id;save();}
 const download=await media(mother,{action:'download',assetId:report.resources.asset});assert.equal(download.status,200);const bytes=await fetch(download.value.url);assert.equal(bytes.status,200);assert.deepEqual(Buffer.from(await bytes.arrayBuffer()),image);assert.equal((await media(other,{action:'download',assetId:report.resources.asset})).status,403);
 pass('file-private-cross-family','PNG ficticio: carga y descarga R2 con CORS de la web publicada; madre obtiene bytes idénticos, otra familia recibe 403. URLs privadas omitidas.');
 const planning=await rpc(scheduler,'timetable_workspace',{p_school_id:qa.schoolId,p_year_id:r.year});assert.equal(planning.canManage,true);assert.equal(planning.canApprove,false);
 if(!report.resources.timetable){const js=ts.transpileModule(fs.readFileSync('src/lib/timetable.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const {generateTimetable}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));const config={days:[3],start:480,end:600,periodMinutes:40,breaks:[],unavailable:[],loads:planning.subjects.map(s=>({classSubjectId:s.id,classroomId:s.classroomId,teacherId:s.teacherIds[0],periods:1,blockSize:1}))};const solution=generateTimetable(config);assert.equal(solution.status,'solved');report.resources.timetable=await rpc(scheduler,'save_timetable',{p_version:{year_id:r.year,name:'QA2810-HORARIO-SECRETARIA',config,lessons:solution.lessons}});save();}
 const draft=(await rpc(scheduler,'timetable_workspace',{p_school_id:qa.schoolId,p_year_id:r.year})).versions.find(v=>v.id===report.resources.timetable);
 if(draft.status==='draft'){const denied=await scheduler.rpc('publish_timetable',{p_id:draft.id,p_revision:draft.revision});assert.ok(denied.error);assert.match(denied.error.message,/Solo Dirección|autorizada/);await rpc(director,'publish_timetable',{p_id:draft.id,p_revision:draft.revision});}
 const familySchedule=await rpc(mother,'timetable_workspace',{p_school_id:qa.schoolId,p_year_id:r.year});const published=familySchedule.versions.find(v=>v.id===report.resources.timetable);assert.equal(published.status,'published');assert.ok(published.lessons.every(l=>[r.room,r.kinderA].includes(l.classroomId)));assert.ok(!('loads' in published.config));
 pass('scheduler-draft-director-publish','Secretaría guarda un horario real y no puede publicarlo; Dirección lo publica y la familia consulta únicamente sus aulas.');
 report.status='passed';delete report.failure;save();console.log(JSON.stringify({ok:true,cases:report.cases.length,output,secretsPrinted:false}));
}catch(e){report.status='failed';report.failure={message:e.message};save();console.error(JSON.stringify({ok:false,message:e.message,output}));process.exitCode=1;}
finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
