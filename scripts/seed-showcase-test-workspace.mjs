// Demonstration fixtures for the existing persisted sandbox only.
// No Auth provisioning, outbound messaging, bank calls or real-school writes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';

const marker='micole-showcase-20261105-v1';
const school='76c0a7f0-7348-4a8f-b5f7-4c6acbbf6570';
const apply=process.argv.includes('--apply');
const out='output/qa/2026-11-05-demo-completa';
const qa=JSON.parse(await fs.readFile(path.join(os.homedir(),'.config/micole/cuentas-pruebas-ampliadas.json'),'utf8'));
assert.equal(qa.marker,'micole-expanded-qa-v1');assert.equal(qa.schoolId,school);
const accounts=Object.fromEntries(qa.accounts.map(a=>[a.key,a]));
const uid=key=>{const h=createHash('sha256').update(marker+':'+key).digest('hex').slice(0,32);return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
const rooms=[
 {id:uid('room0'),name:'Inicial 3 años · Demostración',level:'Inicial',fee:620},
 {id:uid('room1'),name:'Inicial 4 años · Demostración',level:'Inicial',fee:680},
 {id:uid('room2'),name:'Primero B · Demostración',level:'Primaria',fee:850},
];
const teacherNames=['Valeria Docente Prueba','Camila Docente Prueba','Gabriel Docente Prueba','Andrés Docente Prueba'];
const teachers=teacherNames.map((name,i)=>({id:uid('teacher'+i),name,email:`docente.demo${i+1}@example.invalid`,roomIds:i<2?[rooms[i].id]:[rooms[2].id],salary:2800+i*200}));
const names=['Lucía','Mateo','Emma','Sofía','Bruno','Valentina','Thiago','Isabella','Martina','Nicolás','Camila','Gabriel','Daniela','Samuel','Antonia','Benjamín','Victoria','Tomás','Renata','Santiago','Julieta','Daniel','Mía','Lucas'];
const surnames=['Rojas','Flores','Vargas','Molina','Salazar','Suárez','Pérez','Rivera'];
const students=names.map((first,i)=>{
 const room=Math.floor(i/8),family=i<2||i===16||i===17?'guardian':i===2||i===3?'familyb':null;
 return {id:uid('student'+i),index:i,first,last:surnames[i%8]+' Prueba',room:rooms[room],family,motherEmail:family?accounts[family].email:`familia.demo${i+1}@example.invalid`,fatherEmail:family==='guardian'?accounts.father.email:`padre.demo${i+1}@example.invalid`,planId:uid('plan'+i)};
});
const historicRoom=uid('historic-room');
const historicYear=uid('historic-year');
const historicTerm=uid('historic-term');
const db=databaseClient();let stage='Preparación';
const q=(sql,args=[])=>db.query({text:sql,values:args,query_timeout:60000});
async function acting(key,fn){
 await q("select set_config('role','authenticated',true),set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers','{}',true)",[accounts[key].id,JSON.stringify({sub:accounts[key].id,role:'authenticated'})]);
 try{return await fn();}finally{await q('reset role').catch(()=>{});}
}
async function rpc(key,name,args){return (await acting(key,()=>q(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args))).rows[0].value;}
async function exists(table,id){return (await q(`select 1 from public.${table} where id=$1`,[id])).rowCount>0;}
const log=label=>{stage=label;console.log(JSON.stringify({stage:label}));};
try{
 await db.connect();await q('begin');await q("select pg_advisory_xact_lock(hashtext($1))",[marker]);
 const target=(await q("select s.id,s.name,s.show_on_landing,t.enabled from public.schools s join aulanexo_private.persisted_test_workspaces p on p.school_id=s.id join aulanexo_private.test_institutions t on t.school_id=s.id where s.id=$1",[school])).rows[0];
 assert.ok(target?.enabled&&!target.show_on_landing,'La institución debe ser un sandbox persistente privado.');
 for(const key of ['director','teacher','guardian','familyb','father'])assert.equal((await q('select 1 from aulanexo_private.persisted_test_accounts where user_id=$1 and school_id=$2',[accounts[key].id,school])).rowCount,1);
 const oldNotifications=(await q('select id from public.notifications where school_id=$1',[school])).rows.map(r=>r.id);
 const currentTerm=(await q("select t.id from public.academic_terms t join public.academic_years y on y.id=t.year_id where t.school_id=$1 and y.year=2026 and t.status='open' order by t.starts_on limit 1",[school])).rows[0]?.id;assert.ok(currentTerm);
 const date=(await q("select to_char(now() at time zone 'America/La_Paz','YYYY-MM-DD') as current_day")).rows[0].current_day;
 assert.ok(date>='2026-11-05','La demostración usa fechas hasta el 5 de noviembre.');
 const teacherQA=qa.resources.teacher;
 const tarif=(await rpc('director','platform_tariffs',[school])).monthlyLicenseFee;assert.equal(tarif,25);

 log('Aulas y docentes ficticios');
 for(const room of rooms){if(!await exists('classrooms',room.id))await rpc('director','save_classroom',[JSON.stringify({id:room.id,school_id:school,name:room.name,level:room.level,academic_year:2026,capacity:25,active:true,monthly_fee:room.fee,start_time:'08:00',end_time:'12:00',weekdays:[1,2,3,4,5],subjects_enabled:false,schedule:'Lunes a viernes, 08:00 a 12:00'}),[teacherQA]]);}
 for(const t of teachers){if(!await exists('teachers',t.id))await rpc('director','save_teacher_with_classrooms',[JSON.stringify({id:t.id,school_id:school,name:t.name,email:t.email,specialty:'Docente ficticio para demostración',status:'active'}),t.roomIds]);}
 for(const [i,room] of rooms.entries())await rpc('director','save_classroom',[JSON.stringify({id:room.id,school_id:school,name:room.name,level:room.level,academic_year:2026,capacity:25,active:true,monthly_fee:room.fee,start_time:'08:00',end_time:'12:00',weekdays:[1,2,3,4,5],subjects_enabled:false,schedule:'Lunes a viernes, 08:00 a 12:00'}),[teacherQA,...teachers.filter(t=>t.roomIds.includes(room.id)).map(t=>t.id)]]);
 for(const room of rooms){const id=uid('materials-'+room.id);if(!await exists('academic_requests',id)){
  await rpc('director','save_academic_request',[JSON.stringify({id,school_id:school,classroom_id:room.id,kind:'annual_materials',academic_year:2026,title:'Materiales del aula · Demostración',details:'Lista ficticia: cuaderno, colores, bloques y papel. Sin costo.',event_date:'2026-10-01',amount:0,blocks_access:false})]);
  await rpc('director','review_academic_request',[id,true,'Lista ficticia aprobada para la demostración, sin cobro.']);
 }}

 log('24 alumnos, familias y planes de ejemplo');
 for(const s of students){if(await exists('students',s.id))continue;
  const row={id:s.id,school_id:school,classroom_id:s.room.id,first_name:s.first,last_name:s.last,birth_date:`${s.room.level==='Primaria'?2019:s.index<8?2023:2022}-03-${String(10+s.index%15).padStart(2,'0')}`,identity_number:'DEMO-'+String(s.index+1).padStart(4,'0'),mother_name:s.family?accounts[s.family].label:`Madre ficticia ${s.first}`,mother_email:s.motherEmail,mother_phone:'',father_name:'Padre ficticio '+s.first,father_email:s.fatherEmail,father_phone:'',allergies:'Sin alergias en este ejemplo ficticio',monthly_fee:s.room.fee,snack_fee:s.room.level==='Primaria'?0:40,enrollment_fee:150,activation_fee_quote:0};
  const plan={id:s.planId,school_id:school,student_id:s.id,start_date:'2026-10-01',months:3,monthly_fee:s.room.fee,snack_fee:s.room.level==='Primaria'?0:40,enrollment_fee:150,license_fee:tarif,due_day:1,discount:s.index%6===0?50:0,discount_from:'2026-10-01',discount_to:'2026-12-31',prorate:false};
  await rpc('director','enroll_student_with_plan',[JSON.stringify(row),JSON.stringify(plan)]);
  // Backdated enrollment and completed care profile are fixtures, restricted to
  // this batch's new sandbox students. They do not claim a real historical action.
  await q("update public.students set status='active',profile_complete=true,enrolled_at='2026-10-01',emergency_contact='Contacto ficticio de demostración',emergency_phone='00000000',medical_conditions='Sin condiciones en el ejemplo',care_instructions='Datos ficticios para mostrar MiCole',has_insurance=false where id=$1 and school_id=$2",[s.id,school]);
  await q("update public.enrollment_history set started_on='2026-10-01',reason='Inscripción ficticia preparada para la demostración' where student_id=$1 and school_id=$2 and status='enrolled'",[s.id,school]);
 }

 log('Cuotas, abonos y recibos ficticios para reportes');
 for(const s of students){
  const charges=(await q('select id,amount,period,concept from public.school_charges where student_id=$1 order by due_date,concept',[s.id])).rows;
  const selected=charges.filter(c=>s.family||c.concept==='Matrícula'||(c.period==='2026-10'&&s.index%4!==0)||(c.period==='2026-11'&&s.index%4===1));
  const rid=uid('receipt-'+s.index);if(selected.length&&!await exists('school_receipts',rid))await rpc('director','checkout_school_payment',[rid,s.id,JSON.stringify(selected.map(c=>({chargeId:c.id,amount:!s.family&&c.period==='2026-11'?Math.round(Number(c.amount)/2*100)/100:Number(c.amount)}))),s.index%2===0?'cash':'transfer',`DEMO-FICTICIO-20261105-${s.index+1}`,JSON.stringify(s.index<2?{invoiceName:'Familia ficticia '+s.first,invoiceNit:'00000000',invoicePhone:'00000000'}:{}),false]);
 }

 log('Materias, tareas y planillas de notas');
 const subjectIds={};
 for(const [i,room] of rooms.entries()){
  const labels=i===2?['Lenguaje · Demostración','Matemáticas · Demostración']:['Desarrollo del lenguaje · Demostración','Psicomotricidad · Demostración'];
  subjectIds[room.id]=[];
  for(const name of labels)subjectIds[room.id].push(await rpc('director','configure_class_subject',[room.id,name,[teacherQA,...teachers.filter(t=>t.roomIds.includes(room.id)).map(t=>t.id)],true]));
  const group=students.filter(s=>s.room.id===room.id);
  const columns=i===2?subjectIds[room.id].flatMap(subject=>['ser','saber','hacer','self'].map(dimension=>({subject,dimension,kind:'numeric',title:{ser:'Participación y convivencia',saber:'Comprensión de contenidos',hacer:'Trabajo práctico',self:'Autoevaluación'}[dimension]}))):[
   {subject:subjectIds[room.id][0],kind:'qualitative',title:'Expresión y vocabulario'},
   {subject:subjectIds[room.id][1],kind:'qualitative',title:'Coordinación y autonomía'},
   {subject:subjectIds[room.id][0],kind:'numeric',title:'Actividad de reconocimiento'},
  ];
  for(const [j,c] of columns.entries()){
   const aid=uid(`assessment-${i}-${j}`);if(await exists('assessments',aid))continue;
   await rpc('teacher','save_assessment',[JSON.stringify({id:aid,term_id:currentTerm,classroom_id:room.id,class_subject_id:c.subject,title:c.title+' · Demostración',assessment_date:'2026-11-03',max_score:100,weight:1,grading_type:c.kind,dimension:c.dimension,qualitative_options:['Destacado','Logrado','En proceso','Necesita apoyo']})]);
   await rpc('teacher','save_assessment_scores',[aid,JSON.stringify(group.map((s,k)=>({student_id:s.id,...(c.kind==='qualitative'?{qualitative_score:['Logrado','Destacado','En proceso','Logrado'][k%4]}:{score:65+((s.index*7+j*3)%35)}),comment:'Valoración ficticia para demostración. '+(k%3===0?'Puede practicar con acompañamiento.':'Participa y completa las actividades.'),revision:0})))]);
  }
  for(let j=0;j<2;j++){
   const aid=uid(`assignment-${i}-${j}`);if(!await exists('assignments',aid))await rpc('teacher','save_assignment',[JSON.stringify({id:aid,classroom_id:room.id,class_subject_id:subjectIds[room.id][j],title:(j===0?'Actividad para casa':'Propuesta de actividad')+' · Demostración',instructions:i===2?'Ejemplo ficticio: leer un cuento breve y escribir tres ideas.':'Ejemplo ficticio: reconocer colores y formas con objetos del hogar.',due_at:'2026-11-10T18:00:00-04:00',allow_late:true,max_score:100,status:j===0?'published':'draft'})]);
  }
  const published=uid(`assignment-${i}-0`);
  for(const [j,s] of group.slice(0,4).entries()){
   const sid=uid(`submission-${i}-${j}`);if(await exists('assignment_submissions',sid))continue;
   await q("insert into public.assignment_submissions(id,school_id,assignment_id,student_id,body,status,submitted_by,submitted_at) values($1,$2,$3,$4,$5,'submitted',$6,now())",[sid,school,published,s.id,'Respuesta ficticia preparada por el propietario para mostrar una entrega.',accounts.director.id]);
   if(j<2)await rpc('teacher','review_assignment_submission',[sid,'reviewed','Revisión ficticia: buen trabajo, continúa practicando.',85+j*5]);
  }
 }

 log('Libretas históricas publicadas de ejemplo');
 if(!await exists('academic_years',historicYear))await rpc('director','save_academic_year',[JSON.stringify({id:historicYear,school_id:school,year:2025,name:'Gestión histórica 2025 · Demostración',starts_on:'2025-01-01',ends_on:'2025-12-31'})]);
 if(!await exists('classrooms',historicRoom))await rpc('director','save_classroom',[JSON.stringify({id:historicRoom,school_id:school,name:'Inicial histórico 2025 · Demostración',level:'Inicial',academic_year:2025,capacity:25,active:true,monthly_fee:0,start_time:'08:00',end_time:'12:00',weekdays:[1,2,3,4,5],schedule:'Histórico ficticio 2025'}),[teacherQA]]);
 if(!await exists('academic_terms',historicTerm))await rpc('director','save_academic_term',[JSON.stringify({id:historicTerm,year_id:historicYear,name:'Cierre de gestión · Demostración',starts_on:'2025-01-01',ends_on:'2025-12-31',weight:1})]);
 for(const s of students.slice(16))await q("insert into public.enrollment_history(id,school_id,student_id,classroom_id,year_id,student_name,classroom_name,level,started_on,ended_on,status,reason,monthly_fee) values($1,$2,$3,$4,$5,$6,'Inicial histórico 2025 · Demostración','Inicial','2025-02-01','2025-12-15','completed','Historia académica ficticia para demostración',0) on conflict(id) do nothing",[uid('history-'+s.index),school,s.id,historicRoom,historicYear,s.first+' '+s.last]);
 const histSubject=await rpc('director','configure_class_subject',[historicRoom,'Desarrollo integral · Demostración',[teacherQA],true]);
 if((await q('select status from public.academic_terms where id=$1',[historicTerm])).rows[0].status==='open'){
  for(let j=0;j<2;j++){
   const aid=uid('historic-assessment-'+j);await rpc('teacher','save_assessment',[JSON.stringify({id:aid,term_id:historicTerm,classroom_id:historicRoom,class_subject_id:histSubject,title:(j===0?'Autonomía y convivencia':'Lenguaje y expresión')+' · Demostración',assessment_date:'2025-11-20',max_score:100,weight:1,grading_type:'qualitative'})]);
   await rpc('teacher','save_assessment_scores',[aid,JSON.stringify(students.slice(16).map((s,k)=>({student_id:s.id,qualitative_score:k%3===0?'Destacado':'Logrado',comment:'Libreta ficticia de una gestión anterior.',revision:0})))]);
  }
  assert.equal(await rpc('director','close_academic_term',[historicTerm]),8);
 }

 log('Asistencia escolar de tres semanas');
 const dates=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-03','2026-11-04','2026-11-05'];
 let confirmed=0;
 for(const room of rooms)for(const [d,day] of dates.entries()){
  const prior=(await q('select status from public.student_attendance_sessions where classroom_id=$1 and attendance_date=$2',[room.id,day])).rows[0];if(prior?.status==='confirmed')continue;
  const workspace=await rpc('teacher','student_attendance_workspace',[room.id,day,day.slice(0,7)+'-01',null]);
  if(workspace.schoolDay?.isSchoolDay===false)continue;
  const records=students.filter(s=>s.room.id===room.id).map((s,k)=>({studentId:s.id,status:(k+d)%13===0?'absent':(k+d)%9===0?'late':'present',note:(k+d)%13===0?'Ausencia ficticia de demostración':(k+d)%9===0?'Tardanza ficticia de demostración':''}));
  await rpc('teacher','save_student_attendance',[room.id,day,JSON.stringify(records),workspace.session?.revision||0,true,'Lista ficticia preparada para demostración',uid('attendance-'+room.id+'-'+day),workspace.permissionRevision]);confirmed++;
 }

 log('Cuidados, cuaderno, recomendaciones y agenda');
 for(const room of rooms.slice(0,2))for(const day of ['2026-11-03','2026-11-04','2026-11-05'])for(const kind of ['meal','rest','hygiene','mood']){
  const records=students.filter(s=>s.room.id===room.id).map((s,k)=>({student_id:s.id,kind,occurred_at:kind==='meal'?'10:00':kind==='rest'?'11:00':kind==='hygiene'?'09:45':'08:30',...(kind==='meal'?{food:'Merienda de ejemplo: fruta y cereal',amount:['all','most','half'][k%3]}:kind==='rest'?{ended_at:'11:30'}:kind==='hygiene'?{hygiene:k%2?'toilet':'diaper'}:{mood:k%3?'happy':'calm'}),note:'Registro ficticio para mostrar el resumen diario de cada niño.'}));
  await rpc('teacher','save_care_batch',[school,room.id,day,uid('care-'+room.id+day+kind),JSON.stringify(records)]);
 }
 for(const s of students){
  const id=uid('journal-'+s.index);if(!await exists('daily_entries',id))await acting('teacher',()=>q("insert into public.daily_entries(id,school_id,student_id,category,note,entry_date) values($1,$2,$3,'observación',$4,'2026-11-05')",[id,school,s.id,'Demostración ficticia: '+s.first+' participó en la actividad del aula y compartió materiales.']));
  const gid=uid('grade-note-'+s.index);if(!await exists('grades',gid))await acting('teacher',()=>q("insert into public.grades(id,school_id,student_id,subject,period,score,recommendation,class_subject_id) values($1,$2,$3,$4,'Demostración noviembre 2026',$5,$6,$7)",[gid,school,s.id,s.room.level==='Primaria'?'Lenguaje · Demostración':'Desarrollo del lenguaje · Demostración',s.index%3===0?'En proceso':'Logrado','Recomendación ficticia: dedicar unos minutos a la lectura y al juego compartido.',subjectIds[s.room.id][0]]));
 }
 for(const [i,day,title] of [[0,'2026-11-06','Encuentro de familias'],[1,'2026-11-10','Taller de colores y formas'],[2,'2026-11-12','Lectura compartida']]){
  const id=uid('event-'+i);if(!await exists('calendar_events',id))await acting('director',()=>q("insert into public.calendar_events(id,school_id,classroom_id,title,description,event_date,type) values($1,$2,$3,$4,$5,$6,'event')",[id,school,rooms[i].id,title+' · Demostración','Actividad ficticia para mostrar la agenda escolar.',day]));
 }
 const notice=uid('announcement');if(!await exists('announcements',notice))await acting('director',()=>q("insert into public.announcements(id,school_id,title,content,audience,requires_acknowledgment,remind_hourly) values($1,$2,$3,$4,'all',false,false)",[notice,school,'Semana de actividades · Demostración','Comunicado ficticio: esta semana mostraremos asistencia, cuidados y actividades en MiCole. No requiere ninguna acción real.']));

 log('Asistencia docente y boletas ficticias');
 const staffDays=['2026-10-19','2026-10-20','2026-10-21','2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-11-03','2026-11-04'];
 for(const [i,t] of teachers.entries()){
  await rpc('director','save_staff_profile',[school,JSON.stringify({teacherId:t.id,payType:'monthly',monthlySalary:t.salary,hourlyRate:30+i*5,active:true,schedule:[1,2,3,4,5].map(weekday=>({weekday,start:'08:00',end:'12:00',breakMinutes:0}))})]);
  for(const [d,day] of staffDays.entries()){
   const aid=uid('staff-'+i+'-'+day);if(await exists('staff_attendance_records',aid))continue;
   await rpc('director','correct_staff_attendance',[school,JSON.stringify({id:aid,teacherId:t.id,checkIn:day+'T08:'+((d+i)%5===0?'12':'00')+':00-04:00',checkOut:day+'T12:00:00-04:00',shiftStart:'08:00'}),'Registro de asistencia docente ficticio preparado para demostración.']);
  }
  const found=(await q("select id,status from public.staff_payrolls where teacher_id=$1 and period='2026-10-01'",[t.id])).rows[0];
  if(!found){
   const pid=await rpc('director','prepare_staff_payroll',[t.id,'2026-10-01']);
   await rpc('director','edit_staff_payroll',[pid,JSON.stringify(i===0?[{label:'Bono ficticio de ejemplo',amount:100,kind:'earning'}]:[]),'Boleta ficticia de octubre para mostrar el flujo, sin valor laboral ni transferencia real.']);
   if(i<3)await rpc('director','approve_staff_payroll',[pid]);
   if(i<2)await rpc('director','record_staff_payroll_payment',[pid,'cash','DEMO-PAGO-FICTICIO-'+(i+1)]);
  }
 }

 log('Comprobaciones de alcance y cierre');
 const newNotices=(await q('select id,user_id from public.notifications where school_id=$1 and not(id=any($2::uuid[]))',[school,oldNotifications])).rows;
 const allowed=new Set((await q('select user_id from aulanexo_private.persisted_test_accounts where school_id=$1',[school])).rows.map(r=>r.user_id));assert.ok(newNotices.every(n=>allowed.has(n.user_id)),'Destinatario fuera de las cuentas ficticias');
 const suppressed=await q("update aulanexo_private.push_deliveries set status='discarded',last_error='Preparación de datos ficticios de demostración: sin envío externo' where notification_id=any($1::uuid[]) and status='pending' returning id",[newNotices.map(n=>n.id)]);
 assert.equal((await q('select count(*)::int n from public.students where school_id=$1 and id=any($2::uuid[])',[school,students.map(s=>s.id)])).rows[0].n,24);
 const report=await rpc('director','financial_report',[school,'2026-10-01','2026-12-31',null,null]);assert.ok(report);
 const counts=(await q("select (select count(*) from public.student_attendance_records r join public.student_attendance_sessions s on s.id=r.session_id where s.classroom_id=any($1::uuid[]))::int attendance,(select count(*) from public.assessment_scores where student_id=any($2::uuid[]))::int assessmentScores,(select count(*) from public.care_records where student_id=any($2::uuid[]))::int careRecords,(select count(*) from public.school_receipts where student_id=any($2::uuid[]))::int receipts,(select count(*) from public.report_cards where term_id=$3)::int publishedReportCards,(select count(*) from public.staff_attendance_records where teacher_id=any($4::uuid[]))::int staffAttendance,(select count(*) from public.staff_payrolls where teacher_id=any($4::uuid[]))::int payrolls",[rooms.map(r=>r.id),students.map(s=>s.id),historicTerm,teachers.map(t=>t.id)])).rows[0];
 assert.equal(counts.publishedreportcards,8);assert.equal(counts.payrolls,4);
 await q(apply?'commit':'rollback');
 await fs.mkdir(out,{recursive:true});
 const manifest={marker,status:apply?'created':'preview_rolled_back',schoolId:school,schoolName:target.name,date,rooms,teachers,students:students.map(({planId,motherEmail,fatherEmail,...s})=>({...s,planId})),historicRoom,historicYear,historicTerm,currentTerm,counts,confirmedListsCreated:confirmed,suppressedPushDeliveries:suppressed.rowCount,externalMessagesSent:0,realBankCalls:0,realSchoolsModified:0};
 await fs.writeFile(out+'/'+(apply?'manifest.json':'preview.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({status:manifest.status,school:target.name,counts,suppressedPushDeliveries:suppressed.rowCount}));
}catch(e){await q('rollback').catch(()=>{});console.error(JSON.stringify({stage}));reportFailure(e);}finally{await db.end();}
