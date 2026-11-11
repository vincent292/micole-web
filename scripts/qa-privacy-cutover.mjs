// Read-only regression of the final column privacy cutover, using normal QA accounts.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {qa,r,day,session,rpc,rows} from './qa-session.mjs';
const dir='output/qa/2026-10-28-privacidad';fs.mkdirSync(dir,{recursive:true});
const expected={director:[r.child,r.mateo,r.emma,r.sofia,r.bruno],teacher:[r.child,r.mateo,r.emma,r.sofia],guardian:[r.child,r.mateo,r.emma],father:[r.child,r.mateo,r.emma],familyb:[r.sofia,r.bruno],teacherb:[r.bruno],directorb:[r.otherChild],familyc:[r.otherChild],teacherc:[r.otherChild],student:[r.child],studentb:[r.mateo],studentc:[r.otherChild],scheduler:[]};
const enrollment=JSON.parse(fs.readFileSync('output/qa/2026-10-27-completa/inscripcion-api.json'));for(const k of ['directorb','familyc','teacherc'])expected[k].push(enrollment.studentId);
const report={date:day,mode:'normal independent QA Auth; read-only',before:{legacyTeacherPrivateColumnReadAllowed:true,valuesPrinted:false},cases:[],accounts:[]};
const pass=(id,detail)=>report.cases.push({id,status:'passed',detail});
try{
 for(const a of qa.accounts){
  const c=await session(a.key);
  try{
   const direct=await c.from('students').select('id,identity_number,mother_email,father_email').eq('id',expected[a.key][0]||r.mateo);assert.ok(direct.error,a.key+' private API unexpectedly allowed');assert.equal(direct.error.code,'42501');pass(a.key+'-private-api',{blocked:true,code:direct.error.code});
   if(a.role==='student'){
    const p=await rpc(c,'student_portal',{});assert.equal(p.accessAllowed,true);assert.deepEqual(p.students.map(s=>s.id).sort(),expected[a.key].slice().sort());pass(a.key+'-portal',{ownStudentOnly:true});
   }else{
    const list=await rpc(c,'student_directory',{});assert.deepEqual(list.map(s=>s.id).sort(),expected[a.key].slice().sort());
    if(a.role==='teacher')assert.ok(list.every(s=>['identity_number','mother_email','father_email','rude','insurance_number','admission_details'].every(k=>!(k in s))));
    if(['director','guardian'].includes(a.role))assert.ok(list.every(s=>'identity_number'in s&&'mother_email'in s));
    pass(a.key+'-directory',{expectedStudents:list.length,privateFieldsOnlyViaAuthorizedProjection:true});
   }
   const schoolId=a.schoolId||qa.schoolId;
   const w=await rpc(c,'school_workspace',{p_school_id:schoolId,p_from:day,p_to:day});assert.ok(Array.isArray(w.care));pass(a.key+'-workspace',{loads:true});
   if(a.role==='scheduler'){const w=await rpc(c,'timetable_workspace',{p_school_id:schoolId,p_year_id:r.year});assert.equal(w.canManage,true);assert.equal(w.canApprove,false);pass(a.key+'-planning',{loads:true,publicationStillDenied:true});}
   if(['director','teacher','guardian'].includes(a.role)){const f=await rpc(c,'finance_register',{});assert.ok(Array.isArray(f.receipts)&&Array.isArray(f.invoices));pass(a.key+'-finance',{authorizedRegisterLoads:true});}
   report.accounts.push({key:a.key,role:a.role,passed:true});
  }finally{await c.auth.signOut({scope:'local'});}
 }
 report.status='passed';fs.writeFileSync(dir+'/resultados-api.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,accounts:report.accounts.length,cases:report.cases.length,valuesPrinted:false}));
}catch(e){report.status='failed';report.failure=e.message;fs.writeFileSync(dir+'/resultados-api.json',JSON.stringify(report,null,2)+'\n');console.error(JSON.stringify({status:report.status,message:e.message}));process.exitCode=1;}
