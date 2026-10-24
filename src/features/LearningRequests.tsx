import { authorizationCounts, authorizationLabels, authorizationState } from "../lib/activityAuthorization";
import { exportTable } from "../lib/financialApi";
import { useState } from "react";
import { BookOpen, Check, Plus, Users } from "lucide-react";
import { Badge, Button, Empty, Field, Modal, SectionTitle } from "../components/UI";
import { dateLabel, money, uid } from "../lib/format";
import { today } from "../lib/billing";
import { chargeBalance } from "../lib/operations";
import { liveMode } from "../lib/supabase";
import { rpc, toRow } from "../lib/repository";
import type { AcademicRequest } from "../lib/types";
import { fullName, type PageProps } from "./Pages";
const kinds = { annual_materials: "Materiales anuales", monthly_materials: "Pedido mensual", specific_materials: "Pedido específico", activity: "Actividad o salida" };
type Dialog = { type: "create"; id: string } | { type: "review"; request: AcademicRequest; approve: boolean } | { type: "participation"; request: AcademicRequest; studentId: string; participating: boolean; authorization?: boolean };
export function LearningRequests({ page, store, school, role, students, student, identity, go }: PageProps & { page: "materials" | "activities" }) {
 const [dialog,setDialog]=useState<Dialog|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selected,setSelected]=useState("");
 const rooms=store.data.classrooms.filter(room=>room.schoolId===school?.id && (role!=="teacher" || room.teacherIds.some(id=>identity.teacherIds.includes(id))));
 const requests=store.data.academicRequests.filter(request=>request.schoolId===school?.id && (page==='activities'?request.kind==='activity':request.kind!=='activity') && (role!=='guardian'||(!request.classroomId||request.classroomId===student?.classroomId))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const canWrite=role==='director'||role==='teacher';
 const open=(value:Dialog)=>{setDialog(value);setError("");};
 const current=requests.find(request=>request.id===selected);
 const participantChildren=(request:AcademicRequest)=>students.filter(s=>s.classroomId===request.classroomId && (role!=='guardian'||s.id===student?.id));
 const participationFor=(requestId:string,studentId:string)=>store.data.activityParticipations.find(p=>p.requestId===requestId&&p.studentId===studentId);
 const responseCounts=current?authorizationCounts(participantChildren(current).map(child=>participationFor(current.id,child.id))):null;
 async function updateParticipation(request:AcademicRequest, studentId:string,participating:boolean,reason:string,authorization=false) {
  if(liveMode) await rpc('set_activity_participation',{p_request_id:request.id,p_student_id:studentId,p_participating:participating,p_reason:reason,p_authorization:authorization});
  else {
   if(!participating&&reason.trim().length<5)throw new Error('Escribe el motivo de no participación.');
   if(authorization&&(role!=='guardian'||request.kind!=='activity'))throw new Error('La autorización debe registrarla la familia.');
   if(!authorization&&store.data.charges.some(c=>c.academicRequestId===request.id&&c.studentId===studentId&&(c.status==='paid'||!!c.paidAmount)))throw new Error('Ya hay un pago registrado. Dirección debe revisar el cobro antes de cambiar la participación.');
   const previous=participationFor(request.id,studentId);
   await store.save('activityParticipations',{...previous,id:`${request.id}:${studentId}`,requestId:request.id,studentId,schoolId:request.schoolId,participating:authorization?(previous?.participating??true):participating,reason,...(authorization?{authorizationResponse:participating,authorizationReason:reason,authorizationBy:identity.id,authorizationAt:new Date().toISOString()}:previous?.participating!==participating?{authorizationResponse:undefined,authorizationBy:undefined,authorizationAt:undefined}:{})});
   if(!authorization)for(const charge of store.data.charges.filter(c=>c.academicRequestId===request.id&&c.studentId===studentId)) await store.save('charges',{...charge,status:participating?'pending':'cancelled'});
  }
 }
 return <>
  <SectionTitle title={page==='materials'?'Materiales y pedidos del aula':'Actividades y salidas'} subtitle={page==='materials'?'Publica la lista anual antes de inscribir. Los pedidos docentes requieren aprobación de Dirección.':'Participación, autorización y cobros de actividades aprobadas.'} action={canWrite&&<Button icon={Plus} onClick={()=>open({type:'create',id:uid()})}>{page==='materials'?'Solicitar materiales':'Crear actividad'}</Button>} />
  <div className="card-grid">
   {requests.map(request=><article className="entity-card" key={request.id}>
    <div className="entity-top"><span className="row-icon"><BookOpen size={22}/></span><Badge status={request.status}/></div>
    <span className="course-tag">{rooms.find(r=>r.id===request.classroomId)?.name || store.data.classrooms.find(r=>r.id===request.classroomId)?.name} · {request.academicYear}</span>
    <h3>{request.title}</h3><small>{kinds[request.kind]} · {dateLabel(request.eventDate)}</small><p className="preserve-lines">{request.details}</p>
    {request.amount>0&&<p><b>{money(request.amount)} por participante</b> · vence {dateLabel(request.dueDate || request.eventDate)}{request.blocksAccess?' · Requiere pago para acceso':''}</p>}
    {request.reviewNote&&<p>Dirección: {request.reviewNote}</p>}
    <div className="entity-footer request-actions">
     {role==='director'&&request.status==='pending'&&<><Button icon={Check} onClick={()=>open({type:'review',request,approve:true})}>Aprobar y publicar</Button><Button variant="ghost" onClick={()=>open({type:'review',request,approve:false})}>Rechazar</Button></>}
     {request.status==='approved'&&(request.kind==='activity'||request.amount>0)&&<Button variant="secondary" icon={Users} onClick={()=>setSelected(selected===request.id?'':request.id)}>{request.kind==='activity'?'Ver autorizaciones y cobros':'Ver participantes y cobros'}</Button>}
    </div>
   </article>)}
  </div>
  {!requests.length&&<section className="panel"><Empty title={page==='materials'?'Aún no hay listas publicadas':'Aún no hay actividades'} subtitle={canWrite?'Crea una solicitud y Dirección podrá aprobarla para las familias.':'Las solicitudes aprobadas para el curso aparecerán aquí.'}/></section>}
  {current&&<section className="panel table-panel"><SectionTitle title={current.title} subtitle={current.kind==='activity'?"La lectura de un comunicado y el pago no registran autorización. La respuesta corresponde a la familia.":"La no participación requiere un motivo y conserva el historial."}/>
   {current.kind==='activity'&&responseCounts&&<><p>{responseCounts.pending} pendientes · {responseCounts.responded} respondidos · {responseCounts.authorized} autorizados · {responseCounts.declined} no autorizados</p><Button variant="secondary" onClick={()=>exportTable('autorizaciones-actividad.csv',['Estudiante','Respuesta de la familia','Fecha de respuesta','Cuenta que respondió','Motivo'],participantChildren(current).map(child=>{const p=participationFor(current.id,child.id);return [fullName(child),authorizationLabels[authorizationState(p)],p?.authorizationAt||'',p?.authorizationBy||'',p?.authorizationReason||p?.reason||''];}))}>Exportar respuestas CSV</Button></>}
   <div className="responsive-table"><table><thead><tr><th>Estudiante</th><th>{current.kind==='activity'?'Autorización':'Participación'}</th><th>Saldo</th><th>Acciones</th></tr></thead><tbody>
    {participantChildren(current).map(child=>{
     const participation=store.data.activityParticipations.find(p=>p.requestId===current.id&&p.studentId===child.id);
     const charge=store.data.charges.find(c=>c.academicRequestId===current.id&&c.studentId===child.id);
     return <tr key={child.id}><td>{fullName(child)}</td><td>{current.kind==='activity'?authorizationLabels[authorizationState(participation)]:participation?.participating===false?'No participa':'Participa'}{participation?.authorizationAt&&<small className="block">Respondió: {new Date(participation.authorizationAt).toLocaleString('es-BO')}</small>}{(participation?.authorizationReason||participation?.reason)&&<small className="block">{participation?.authorizationReason||participation?.reason}</small>}</td><td>{charge?money(chargeBalance(charge)):'Sin cuota'}</td><td><div className="table-actions">
      {charge&&charge.status!=='paid'&&charge.status!=='cancelled'&&<Button variant="secondary" onClick={()=>go(`${role==='guardian'?'payments':'cash'}?student=${child.id}&activity=${current.id}`)}>Ver cobro</Button>}
      {(current.kind==='activity'&&role==='guardian')||(!charge?.paidAmount&&charge?.status!=='paid')?(current.kind==='activity'&&role==='guardian'?<><Button onClick={()=>open({type:'participation',request:current,studentId:child.id,participating:true,authorization:true})}>Autorizo</Button><Button variant="secondary" onClick={()=>open({type:'participation',request:current,studentId:child.id,participating:false,authorization:true})}>No autorizo</Button></>:<Button variant="ghost" onClick={()=>open({type:'participation',request:current,studentId:child.id,participating:participation?.participating===false})}>{participation?.participating===false?'Volver a participar':'No participará'}</Button>):null}
      {current.kind==='activity'&&(!!charge?.paidAmount||charge?.status==='paid')&&<small>Hay un pago registrado. Dirección debe revisar el cobro antes de cambiar la participación.</small>}
     </div></td></tr>;
    })}
   </tbody></table></div>
  </section>}
  {dialog&&<Modal title={dialog.type==='create'?(page==='materials'?'Nueva solicitud de materiales':'Nueva actividad'):dialog.type==='review'?(dialog.approve?'Aprobar solicitud':'Rechazar solicitud'):dialog.authorization?(dialog.participating?'Autorizar actividad':'No autorizar actividad'):'Participación en actividad'} onClose={()=>setDialog(null)} busy={busy} error={error} submitLabel={dialog.type==='create'?'Enviar a revisión':dialog.type==='review'?(dialog.approve?'Aprobar y publicar':'Rechazar'):dialog.authorization?(dialog.participating?'Autorizo':'No autorizo'):'Guardar participación'} onSubmit={async event=>{
   event.preventDefault();if(busy)return;const f=new FormData(event.currentTarget),text=(name:string)=>String(f.get(name)||'').trim();setBusy(true);setError('');
   try {
    if(dialog.type==='create'){
     const room=rooms.find(r=>r.id===text('classroomId'));if(!room)throw new Error('Selecciona un aula.');
     const request:AcademicRequest={id:dialog.id,schoolId:school!.id,classroomId:room.id,kind:text('kind') as AcademicRequest['kind'],academicYear:Number(text('academicYear')),title:text('title'),details:text('details'),eventDate:text('eventDate'),amount:Number(text('amount')||0),dueDate:text('dueDate'),blocksAccess:f.get('blocksAccess')==='on',status:'pending',createdBy:identity.id,reviewNote:'',createdAt:today()};
     if(liveMode)await rpc('save_academic_request',{p_request:toRow('academicRequests',request)});else await store.save('academicRequests',request);
    }else if(dialog.type==='review'){
     if(liveMode)await rpc('review_academic_request',{p_id:dialog.request.id,p_approve:dialog.approve,p_note:text('reviewNote')});
     else{
      await store.save('academicRequests',{...dialog.request,status:dialog.approve?'approved':'rejected',reviewNote:text('reviewNote')});
      if(dialog.approve){
       await store.save('events',{id:dialog.request.id,schoolId:school!.id,classroomId:dialog.request.classroomId,title:dialog.request.title,description:dialog.request.details,date:dialog.request.eventDate,type:page==='activities'?'event':'materials'});
       if(dialog.request.amount>0)for(const child of students.filter(s=>s.classroomId===dialog.request.classroomId&&s.status!=='inactive'))await store.save('charges',{id:uid(),schoolId:school!.id,studentId:child.id,concept:dialog.request.title,dueDate:dialog.request.dueDate!,amount:dialog.request.amount,status:'pending',paidAmount:0,minimumAccessRatio:1,academicRequestId:dialog.request.id});
      }
     }
    }else await updateParticipation(dialog.request,dialog.studentId,dialog.participating,text('reason'),dialog.authorization);
    await store.refresh();setDialog(null);
   }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}
  }}>
   {dialog.type==='create'?<>
    <div className="form-grid"><Field label="Aula" name="classroomId" required><select name="classroomId" required><option value="">Selecciona el aula</option>{rooms.map(room=><option key={room.id} value={room.id}>{room.name}</option>)}</select></Field><Field label="Gestión" name="academicYear" type="number" required min={2020} max={2100} defaultValue={Number(today().slice(0,4))}/></div>
    <Field label="Tipo de solicitud" name="kind"><select name="kind" defaultValue={page==='materials'?'annual_materials':'activity'}>{Object.entries(kinds).filter(([key])=>page==='materials'?key!=='activity':key==='activity').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
    <Field label="Título" name="title" required/><Field label="Lista o descripción" name="details"><textarea name="details" rows={6} minLength={3} maxLength={12000} required placeholder="Escribe los materiales, cantidades o detalles de la actividad."/></Field>
    <div className="form-grid"><Field label="Fecha de entrega o actividad" name="eventDate" type="date" required defaultValue={today()}/><Field label="Costo por participante · Bs (0 si no aplica)" name="amount" type="number" min={0} step="0.01" defaultValue={0}/><Field label="Vencimiento del cobro" name="dueDate" type="date" defaultValue={today()}/></div>
    <label className="check-field"><input name="blocksAccess" type="checkbox" defaultChecked/> Requerir el pago completo de participantes cuando venza</label>
    <p className="soft-note">Dirección revisará y aprobará la solicitud. Al aprobar se publica en agenda y comunicados y se generan los cobros cuando correspondan.</p>
   </>:dialog.type==='review'?<><h3>{dialog.request.title}</h3><p>{dialog.approve?'La aprobación publica la solicitud para el curso y genera sus cobros.':'La solicitud no se publicará para las familias.'}</p><Field label={dialog.approve?'Observación de Dirección (opcional)':'Motivo de rechazo'} name="reviewNote"><textarea name="reviewNote" required={!dialog.approve} minLength={dialog.approve?undefined:5} maxLength={500}/></Field></>:<><p>{dialog.request.title} · {fullName(students.find(s=>s.id===dialog.studentId))}</p>{dialog.authorization&&<p>Esta respuesta registra tu decisión sobre la actividad para este estudiante. El pago y la participación administrativa se gestionan por separado.</p>}<Field label={dialog.participating?'Observación (opcional)':dialog.authorization?'Motivo de no autorización':'Motivo de no participación'} name="reason"><textarea name="reason" required={!dialog.participating} minLength={dialog.participating?undefined:5} maxLength={500}/></Field></>}
  </Modal>}
 </>;
}
