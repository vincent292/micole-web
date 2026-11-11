// Live REST/RPC checks using independent QA password sessions, never admin tokens.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {environment} from './database.mjs';
environment();
const qa=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/micole/cuentas-pruebas-ampliadas.json'),'utf8'));
const r=qa.resources,schoolA=qa.schoolId,schoolB=qa.otherSchoolId;
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
const output='output/qa/2026-10-27-completa/aislamiento-api.json';
const expected={director:[r.child,r.mateo,r.emma,r.sofia,r.bruno],teacher:[r.child,r.mateo,r.emma,r.sofia],guardian:[r.child,r.mateo,r.emma],father:[r.child,r.mateo,r.emma],familyb:[r.sofia,r.bruno],teacherb:[r.bruno],directorb:[r.otherChild],familyc:[r.otherChild],teacherc:[r.otherChild],student:[r.child],studentb:[r.mateo],studentc:[r.otherChild],scheduler:[]};
const enrollmentFile='output/qa/2026-10-27-completa/inscripcion-api.json';
if(fs.existsSync(enrollmentFile)){const enrollment=JSON.parse(fs.readFileSync(enrollmentFile));if(enrollment.status!=='failed')for(const k of ['directorb','familyc','teacherc'])expected[k].push(enrollment.studentId);}
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const report={day,mode:'normal QA Auth + live REST/RPC',accounts:[],cases:[],secretsPrinted:false};
const record=(id,detail)=>{report.cases.push({id,status:'passed',detail});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');};
try{
 assert.equal(qa.marker,'micole-expanded-qa-v1');assert.equal(new URL(url).hostname,qa.project+'.supabase.co');
 for(const account of qa.accounts){
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error:authError}=await client.auth.signInWithPassword({email:account.email,password:qa.password});if(authError)throw Error('Login QA falló: '+account.key);
  const {data:identity,error:idError}=await client.rpc('workspace_identity');if(idError)throw Error(idError.message);
  assert.deepEqual(identity.roles,[account.role],account.key+' rol');assert.equal(identity.testing,true);assert.ok(!identity.support);assert.ok(!identity.roles.includes('superadmin'));
  const school=account.schoolId||schoolA,foreignSchool=school===schoolA?schoolB:schoolA;
  assert.ok(identity.memberships.every(m=>m.schoolId===school));
  report.accounts.push({key:account.key,role:account.role,schoolId:school,login:'passed',support:false});
  const {data:schools,error:schoolError}=await client.from('schools').select('id').eq('id',foreignSchool);assert.ifError(schoolError);assert.deepEqual(schools,[]);
  record(account.key+'-school-isolation','Otra sede QA no devuelve filas.');
  const allowed=expected[account.key];
  if(account.role==='student'){
   const {data:portal,error}=await client.rpc('student_portal');assert.ifError(error);assert.equal(portal.accessAllowed,true);assert.deepEqual(portal.students.map(s=>s.id).sort(),allowed.slice().sort());
   assert.ok(portal.classrooms.every(c=>c.schoolId===school||c.school_id===school));
   record(account.key+'-portal','El portal devuelve únicamente su alumno y aula de su sede.');
  }else{
   const {data:directory,error}=await client.rpc('student_directory');assert.ifError(error);assert.deepEqual(directory.map(c=>c.id).sort(),allowed.slice().sort(),account.key+' directorio');
   record(account.key+'-student-isolation','Directorio coincide exactamente con los alumnos autorizados.');
  }
  for(const targetSchool of [school,foreignSchool]){
   const {data:workspace,error}=await client.rpc('school_workspace',{p_school_id:targetSchool,p_from:day,p_to:day});assert.ifError(error);
   for(const field of ['care','enrollments','scores','cards'])for(const row of workspace[field]||[])assert.ok(allowed.includes(row.student_id),account.key+' '+field+' ajeno');
   if(targetSchool===foreignSchool)for(const field of ['care','enrollments','scores','cards'])assert.equal(workspace[field].length,0,account.key+' otra sede '+field);
  }
  record(account.key+'-workspace-isolation','Cuidados, matrículas y resultados no contienen alumnos ajenos ni datos de otra sede.');
  const foreignChild=[r.child,r.mateo,r.emma,r.sofia,r.bruno,r.otherChild].find(c=>!allowed.includes(c));
  const {data:rows,error:readError}=await client.from('care_records').select('id').eq('student_id',foreignChild);assert.ifError(readError);assert.deepEqual(rows,[]);
  record(account.key+'-direct-id-read','Consultar directamente un identificador ajeno no devuelve cuidados.');
  const deniedTarget=account.role==='director'?(school===schoolA?r.otherChild:r.mateo):account.key==='teacher'?r.bruno:account.key==='teacherb'?r.mateo:account.key==='teacherc'?r.mateo:(allowed[0]||r.mateo);
  const deniedSchool=deniedTarget===r.otherChild?schoolB:schoolA;
  const deniedRoom=deniedTarget===r.otherChild?r.otherRoom:deniedTarget===r.bruno?r.kinderB:deniedTarget===r.child?r.room:r.kinderA;
  const {data:unexpected,error:denied}=await client.rpc('save_care_batch',{p_school_id:deniedSchool,p_classroom_id:deniedRoom,p_day:day,p_request_id:randomUUID(),p_records:[{student_id:deniedTarget,kind:'mood',occurred_at:'08:00',mood:'happy',note:'QA-ISOLATION-MUST-NOT-SAVE'}]});
  assert.ok(denied,account.key+' escritura no autorizada fue aceptada '+JSON.stringify(unexpected));assert.match(denied.message,/Solo Dirección|docente del aula|permiso|acceso/i);
  record(account.key+'-denied-write','El servidor rechaza la escritura de familia/estudiante o en aula/sede no autorizada.');
  await client.auth.signOut({scope:'local'});
 }
 report.status='passed';fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,accounts:report.accounts.length,cases:report.cases.length,output,secretsPrinted:false}));
}catch(e){report.status='failed';report.failure={message:e.message};fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.error(JSON.stringify({ok:false,message:e.message,output,secretsPrinted:false}));process.exitCode=1;}
