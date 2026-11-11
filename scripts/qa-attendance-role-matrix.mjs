// Final normal-account checks; denied writes use invalid/empty data and cannot create a roll call.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {qa,r,day,session,rpc,rows} from './qa-session.mjs';
const file='output/qa/2026-10-29-asistencia/aislamiento-roles.json',fixture=JSON.parse(fs.readFileSync('output/qa/2026-10-29-asistencia/alumnos-api.json'));
const permissionIds=['mateoPermission','emmaPermission','sofiaPermission'].map(k=>fixture.resources[k]);
const expected={director:permissionIds,teacher:permissionIds,guardian:permissionIds.slice(0,2),father:permissionIds.slice(0,2),familyb:[permissionIds[2]]};
const result={day,status:'running',normalAuthAccounts:qa.accounts.length,accounts:[]};
for(const account of qa.accounts){const c=await session(account.key);try{
 const canRead=['director','teacher','guardian','father','familyb'].includes(account.key);
 const child=account.key==='familyb'?r.sofia:r.mateo;
 const request={p_classroom_id:r.kinderA,p_day:day,p_month:day.slice(0,7)+'-01',p_student_id:account.role==='guardian'||account.role==='student'?child:null};
 const {data,error}=await c.rpc('student_attendance_workspace',request);
 if(canRead){assert.ok(!error);assert.equal(data.canMark,account.key==='teacher');assert.equal(data.canCorrect,account.key==='teacher');assert.equal(data.canReview,false);if(account.role==='guardian'){assert.equal(data.canManage,false);assert.equal(data.permissions.length,0);assert.ok(data.records.every(v=>v.studentId===child));}}
 else assert.match(error?.message||'',/acceso/);
 const visible=await rows(c.from('family_requests').select('id').in('id',permissionIds));assert.deepEqual(visible.map(v=>v.id).sort(),(expected[account.key]||[]).slice().sort());
 if(account.key!=='teacher'){
  const denied=await c.rpc('save_student_attendance',{p_classroom_id:r.kinderA,p_day:day,p_records:[],p_revision:0,p_confirm:false,p_reason:'',p_request_id:randomUUID(),p_permission_revision:null});assert.match(denied.error?.message||'',/docentes asignados/);
 }
 result.accounts.push({key:account.key,role:account.role,workspaceAllowed:canRead,canMark:account.key==='teacher',canCorrect:account.key==='teacher',visiblePermissionCount:visible.length,status:'passed'});
}finally{await c.auth.signOut({scope:'local'});}}
result.status='passed';fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({ok:true,accounts:result.accounts.length,file}));
