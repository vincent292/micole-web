import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {session,rpc,rows,qa,r,day} from './qa-session.mjs';
const file='output/qa/2026-10-27-completa/inscripcion-api.json';const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{studentId:randomUUID(),planId:randomUUID(),cases:[]};const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');save();const clients=[];
try{
 const d=await session('directorb');clients.push(d);const rates=await rpc(d,'platform_tariffs',{p_school_id:qa.otherSchoolId});
 report.materialsId??=randomUUID();save();
 const materials=await rows(d.from('academic_requests').select('id,status').eq('id',report.materialsId));
 if(materials[0]?.status!=='approved'){
  const t=await session('teacherc');clients.push(t);
  if(!materials.length)await rpc(t,'save_academic_request',{p_request:{id:report.materialsId,school_id:qa.otherSchoolId,classroom_id:r.otherRoom,kind:'annual_materials',academic_year:2026,title:'QA2810-MATERIALES-ANUALES',details:'Lista ficticia: bloques, papel y colores. Sin cobro.',event_date:day,amount:0,blocks_access:false}});
  assert.ok((await t.rpc('review_academic_request',{p_id:report.materialsId,p_approve:true,p_note:'QA'})).error);
  await rpc(d,'review_academic_request',{p_id:report.materialsId,p_approve:true,p_note:'QA2810-DIRECCION: materiales ficticios aprobados sin cobro.'});
 }
 report.cases=report.cases.filter(c=>c.id!=='materials-approval');report.cases.push({id:'materials-approval',status:'passed',detail:'Docente propone la lista anual; solo Dirección puede aprobarla. No se cobra.'});save();
 const s={id:report.studentId,school_id:qa.otherSchoolId,classroom_id:r.otherRoom,first_name:'Vera',last_name:'Inscripcion QA',birth_date:'2022-02-02',identity_number:'QA2810-'+report.studentId.slice(0,8),mother_name:'Familia sede B QA',mother_email:qa.accounts.find(a=>a.key==='familyc').email,mother_phone:'70001003',father_name:'Padre ficticio QA',father_email:'padreexterno@pruebas.micole.test',father_phone:'70001004',monthly_fee:0,snack_fee:0,enrollment_fee:0,activation_fee_quote:rates.activationFee};
 const plan={id:report.planId,school_id:qa.otherSchoolId,student_id:s.id,start_date:'2026-11-01',months:1,monthly_fee:0,snack_fee:0,enrollment_fee:0,license_fee:rates.monthlyLicenseFee,due_day:10,discount:0,prorate:false};
 await rpc(d,'enroll_student_with_plan',{p_student:s,p_plan:plan});await rpc(d,'enroll_student_with_plan',{p_student:s,p_plan:plan});assert.equal((await rows(d.from('payment_plans').select('id').eq('student_id',s.id))).length,1);report.cases.push({id:'enrollment-retry',status:'passed',detail:'Inscripción con plan mediante Dirección QA; reintento conserva un solo alumno y un solo plan.'});save();
 const f=await session('familyc');clients.push(f);const directory=await rpc(f,'student_directory',{});assert.ok(directory.some(x=>x.id===s.id));const other=await session('familyb');clients.push(other);assert.ok(!(await rpc(other,'student_directory',{})).some(x=>x.id===s.id));
 report.cases.push({id:'new-family-link',status:'passed',detail:'La familia de sede B obtiene el nuevo niño por su correo verificado; otra familia no puede consultarlo.'});save();
 // Leave this new profile incomplete for the real APK completion circuit.
 const child=await rows(d.from('students').select('id,profile_complete,status').eq('id',s.id));report.profileComplete=child[0].profile_complete;delete report.failure;report.status='prepared-for-apk-profile';save();console.log(JSON.stringify({ok:true,studentId:s.id,profileComplete:report.profileComplete,output:file}));
}catch(e){report.status='failed';report.failure=e.message;save();console.error(JSON.stringify({ok:false,message:e.message}));process.exitCode=1;}finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
