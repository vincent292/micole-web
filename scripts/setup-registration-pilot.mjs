import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {session,qa,rpc,rows} from './qa-session.mjs';
const c=await session('director'),year=new Date().getUTCFullYear(),folder='output/qa/2026-11-09-registration';await fs.mkdir(folder,{recursive:true});
try{
 const school=(await rows(c.from('schools').select('id,name,appearance').eq('id',qa.schoolId)))[0];assert.ok(school.appearance);
 const teacher=qa.accounts.find(a=>a.key==='teacher');assert.ok(teacher);
 const teachers=await rows(c.from('teachers').select('id,user_id').eq('school_id',qa.schoolId).eq('email',teacher.email));assert.ok(teachers[0]?.user_id);
 const roomIds=[];
 for(const parallel of ['A','B']){
  const name=`Inscripciones ${parallel} · Pruebas`;
  let room=(await rows(c.from('classrooms').select('id').eq('school_id',qa.schoolId).eq('name',name).eq('academic_year',year)))[0];
  if(!room){room={id:randomUUID()};await rpc(c,'save_classroom',{p_room:{id:room.id,school_id:qa.schoolId,name,level:'Inicial',schedule:'Mañana',academic_year:year,capacity:30,monthly_fee:200,active:true,start_time:'08:00',end_time:'12:00',weekdays:[1,2,3,4,5]},p_teacher_ids:[teachers[0].id]});}
  roomIds.push(room.id);
 }
 let workspace=await rpc(c,'registration_workspace',{p_school_id:qa.schoolId}),campaign=workspace.campaigns.find(c=>c.year===year);
 if(!campaign){const id=await rpc(c,'save_registration_campaign',{p_school_id:qa.schoolId,p_config:{year,title:`Inscripciones ${year} · Pruebas`,paymentRequired:true,amount:1,concept:'Cuota ficticia para probar la inscripción',simulation:true},p_rooms:roomIds.map(id=>({classroomId:id,groupKey:'inicial-demo'})),p_revision:0});campaign={id};}
 await rpc(c,'set_registration_delegate',{p_campaign:campaign.id,p_user:teachers[0].user_id,p_register:true,p_collect:true});
 workspace=await rpc(c,'registration_workspace',{p_school_id:qa.schoolId});assert.equal(workspace.campaigns.find(c=>c.id===campaign.id).simulation,true);
 const result={schoolId:qa.schoolId,campaignId:campaign.id,roomIds,year,simulation:true,amount:1,otherInstitutionsChanged:0};
 await fs.writeFile('tmp/registration-pilot.json',JSON.stringify(result,null,2));await fs.writeFile(folder+'/setup.json',JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,year,rooms:roomIds.length,simulation:true,otherInstitutionsChanged:0}));
}finally{await c.auth.signOut({scope:'local'});}
