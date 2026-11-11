import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {session,rpc,rows,url,qa} from './qa-session.mjs';
import {databaseClient} from './database.mjs';
const dir='output/qa/2026-11-05-demo-completa';
const m=JSON.parse(await fs.readFile(dir+'/manifest.json','utf8'));
assert.equal(m.status,'created');assert.equal(m.schoolId,qa.schoolId);
const ids=m.students.map(s=>s.id),roomIds=m.rooms.map(r=>r.id),clients=[],checks=[];
const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
async function login(key){const c=await session(key);clients.push(c);return c;}
let browser;
try{
 const director=await login('director'),teacher=await login('teacher'),mother=await login('guardian'),otherFamily=await login('familyb'),outside=await login('directorb');
 for(const [c,key,count] of [[director,'Dirección',24],[teacher,'Docente',24],[mother,'Familia principal',4],[otherFamily,'Otra familia',2],[outside,'Otra institución',0]]){
  const directory=await rpc(c,'student_directory',{});check(key+': padrón autorizado',directory.filter(s=>ids.includes(s.id)).length===count);
 }
 const financial=await rpc(director,'financial_report',{p_school_id:m.schoolId,p_from:'2026-10-01',p_to:'2026-12-31',p_classroom_id:null,p_student_id:null});
 const charges=financial.charges.filter(c=>ids.includes(c.studentId));
 const payments=financial.payments.filter(p=>ids.includes(p.studentId));
 check('96 cuotas de ejemplo en reportes',charges.length===96);
 check('Reportes con cuotas pagadas y deuda',charges.some(c=>c.status==='paid')&&charges.some(c=>c.status==='overdue'||c.status==='pending'));
 check('Cobros ficticios incluidos en el reporte',payments.length>0);
 const sum=values=>Math.round(values.reduce((n,v)=>n+Number(v),0)*100)/100;
 const totals={issued:sum(charges.map(c=>c.amount)),paid:sum(payments.map(p=>p.amount)),remaining:sum(charges.map(c=>Math.max(0,Number(c.amount)-Number(c.paidAmount||0))))};
 check('Importes, abonos y saldos consistentes',Math.abs(totals.issued-totals.paid-totals.remaining)<0.02);
 for(const room of m.rooms){
  const params={p_classroom_id:room.id,p_day:'2026-11-05',p_month:'2026-11-01',p_student_id:null};
  const tw=await rpc(teacher,'student_attendance_workspace',params),dw=await rpc(director,'student_attendance_workspace',params);
  check(room.name+': docente marca y Dirección consulta',tw.canMark===true&&dw.canMark===false);
  check(room.name+': ocho registros confirmados de hoy',tw.records.filter(r=>r.date==='2026-11-05'&&r.confirmed).length===8);
 }
 const first=m.students[0];
 const fw=await rpc(mother,'student_attendance_workspace',{p_classroom_id:first.room.id,p_day:'2026-11-05',p_month:'2026-11-01',p_student_id:first.id});
 check('Asistencia familiar limitada a su hijo',fw.records.length>0&&fw.records.every(r=>r.studentId===first.id));
 const school=await rpc(director,'school_workspace',{p_school_id:m.schoolId,p_from:'2026-11-01',p_to:'2026-11-30'});
 check('Ocho libretas históricas publicadas',school.cards.filter(c=>c.term_id===m.historicTerm&&!c.revoked_at).length===8);
 check('Cuidados y notas disponibles',school.care.some(c=>ids.includes(c.student_id))&&school.scores.length>=128);
 const teacherProfiles=await rows(director.from('teachers').select('id,name').in('id',m.teachers.map(t=>t.id)));
 check('Cuatro docentes ficticios disponibles',teacherProfiles.length===4);
 const staff=await rpc(director,'staff_workspace',{p_school_id:m.schoolId,p_month:'2026-10-01'});
 const payrolls=staff.payrolls.filter(p=>m.teachers.some(t=>t.id===p.teacher_id));
 check('Boletas en tres estados',payrolls.filter(p=>p.status==='paid').length===2&&payrolls.filter(p=>p.status==='approved').length===1&&payrolls.filter(p=>p.status==='draft').length===1);
 check('Asistencia laboral histórica',staff.records.filter(r=>m.teachers.some(t=>t.id===r.teacher_id)).length===40);
 const outsiderStudents=await rows(outside.from('students').select('id').in('id',ids));check('Otra institución no ve los alumnos nuevos',outsiderStudents.length===0);
 const exposed=await rows(otherFamily.from('students').select('id').in('id',m.students.filter(s=>s.family==='guardian').map(s=>s.id)));check('Otra familia no ve los alumnos ajenos',exposed.length===0);
 const publicList=await rpc(director,'landing_institutions',{});check('La institución de pruebas sigue fuera del directorio público',!publicList.some(s=>s.id===m.schoolId));
 const adminDb=databaseClient();
 try{
  await adminDb.connect();await adminDb.query('begin read only');
  const owner=(await adminDb.query('select user_id from public.platform_admins')).rows[0].user_id;
  await adminDb.query('set local role authenticated');
  await adminDb.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",[owner]);
  const options=(await adminDb.query('select public.test_workspace_options($1) value',[m.schoolId])).rows[0].value;
  check('Docentes nuevos seleccionables por el propietario',options.accounts.filter(a=>a.role==='teacher'&&m.teachers.some(t=>t.id===a.id)).length===4);
  check('Niños nuevos seleccionables en pruebas de Familia y Estudiante',options.accounts.filter(a=>a.role==='student'&&ids.includes(a.id)).length===24&&options.accounts.filter(a=>a.role==='guardian'&&ids.includes(a.id)).length===48);
  await adminDb.query('rollback');
 }finally{await adminDb.end();}

 browser=await chromium.launch({headless:true});
 const {data}=await director.auth.getSession();assert.ok(data.session);
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
 await context.addInitScript(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));},{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:data.session});
 const page=await context.newPage();
 for(const [name,route] of [['aulas','/app/classrooms'],['alumnos','/app/students'],['reportes','/app/reports'],['asistencia','/app/classrooms?classroom='+roomIds[0]+'&tab=studentAttendance'],['notas','/app/classrooms?classroom='+roomIds[2]+'&tab=gradebook'],['boletas','/app/staffPayroll']]){
  await page.goto('https://www.micole.click'+route,{waitUntil:'networkidle',timeout:60000});
  await page.locator('.workspace-page').waitFor({timeout:30000});
  if(name==='boletas'){
   await page.locator('input[type="month"]').fill('2026-10');
   await page.locator('.staff-roster').getByText('Valeria Docente Prueba',{exact:true}).first().waitFor({timeout:30000});
  }
  await page.screenshot({path:dir+'/'+name+'.png',fullPage:false});
  const body=await page.locator('body').innerText();
  check('Pantalla '+name+' cargada',!body.includes('Necesitamos volver a cargar MiCole')&&!body.includes('No pudimos cargar tu espacio'));
 }
 await context.close();
 await fs.writeFile(dir+'/verification.json',JSON.stringify({status:'passed',checks,totals,screenshots:['aulas','alumnos','reportes','asistencia','notas','boletas'],normalAuth:true,credentialsPrinted:false},null,2));
 console.log(JSON.stringify({status:'passed',checks:checks.length,totals,normalAuth:true,screenshots:6}));
}finally{if(browser)await browser.close();await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
