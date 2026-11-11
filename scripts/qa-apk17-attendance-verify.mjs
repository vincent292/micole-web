// Read-only verification of the cases completed through the physical APK17 UI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {r,day,session,rpc,rows} from './qa-session.mjs';
const file='output/qa/2026-10-29-asistencia/apk17-flujo-verificacion.json';
const fixture=JSON.parse(fs.readFileSync('output/qa/2026-10-29-asistencia/alumnos-api.json'));
const clients=[];
try{
  const login=async key=>{const c=await session(key);clients.push(c);return c;};
  const d=await login('director'),m=await login('guardian'),f=await login('father'),other=await login('familyb');
  const workspace=(c,child=null)=>rpc(c,'student_attendance_workspace',{p_classroom_id:r.room,p_day:day,p_month:day.slice(0,7)+'-01',p_student_id:child});
  const staff=await workspace(d);
  assert.equal(staff.canMark,false);assert.equal(staff.canCorrect,false);assert.equal(staff.session.status,'confirmed');
  const record=staff.records.find(v=>v.studentId===r.child&&v.date===day);
  assert.ok(record);assert.equal(record.status,'present');assert.ok(record.correctionId);
  const raw=await rows(d.from('student_attendance_records').select('status').eq('id',record.id));
  assert.equal(raw[0].status,'excused');
  const correction=staff.corrections.filter(v=>v.id===record.correctionId);
  assert.equal(correction.length,1);assert.ok(correction[0].reason.includes('QA2910 Justificativo ficticio'));
  const permission=staff.permissions.find(v=>v.id===fixture.resources.luciaPermission);
  assert.equal(permission.status,'approved');assert.ok(permission.response.includes('QA2910 Acepto permiso ficticio'));
  const families=[];
  for(const [name,c] of [['mamá',m],['papá',f]]){
    const w=await workspace(c,r.child),own=w.records.find(v=>v.id===record.id);
    assert.equal(own.status,'present');assert.ok(own.note.includes('QA2910 Lucia finalmente asistio'));
    assert.equal(w.corrections.length,0);assert.ok(w.records.every(v=>v.studentId===r.child));
    const response=await rows(c.from('notifications').select('id').eq('kind','request_response').eq('source_id',fixture.resources.luciaPermission));
    const corrected=await rows(c.from('notifications').select('id').eq('kind','attendance_corrected').eq('source_id',record.correctionId));
    const absence=await rows(c.from('notifications').select('id').eq('kind','attendance_absent').eq('student_id',r.child).gte('created_at',day+'T04:00:00Z'));
    assert.equal(response.length,1);assert.equal(corrected.length,1);assert.equal(absence.length,0);
    families.push({role:name,status:own.status,responseNotifications:1,correctionNotifications:1,falseAbsenceNotifications:0,internalJustificationVisible:false});
  }
  for(const [table,id] of [['student_attendance_records',record.id],['family_requests',fixture.resources.luciaPermission]])
    assert.equal((await rows(other.from(table).select('id').eq('id',id))).length,0);
  const report={status:'passed',day,client:'APK17 física en Stratus C7',backend:'Supabase real con cuentas QA normales',permissionId:permission.id,recordId:record.id,correctionId:record.correctionId,original:'excused',effective:'present',director:{canMark:false,canCorrect:false,canReadJustification:true},families,otherFamilyCannotRead:true,physicalCases:['Modal automático antes de lista; continuar bloqueado hasta responder','Aceptar permiso con respuesta; propone Con permiso','Confirmar lista con cero faltas','Guardar corrección bloqueado sin justificativo','Corrección docente Con permiso → Presente guardada desde APK'],notificationScope:'Persistencia y destinatarios comprobados. No demuestra entrega push con app cerrada en este caso.',screenshots:['apk17-modal-permiso.png','apk17-lista-con-permiso.png','apk17-correccion-justificativo.png']};
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({ok:true,file,originalPreserved:true,families:2,otherFamilyCannotRead:true,falseAbsenceNotifications:0}));
}finally{await Promise.allSettled(clients.map(c=>c.auth.signOut({scope:'local'})));}
