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
type Dialog = { type: "create"; id: string } | { type: "review"; request: AcademicRequest; approve: boolean } | { type: "participation"; request: AcademicRequest; studentId: string; participating: boolean };
export function LearningRequests({ page, store, school, role, students, student, identity, go }: PageProps & { page: "materials" | "activities" }) {
 const [dialog,setDialog]=useState<Dialog|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [selected,setSelected]=useState("");
 const rooms=store.data.classrooms.filter(room=>room.schoolId===school?.id && (role!=="teacher" || room.teacherIds.some(id=>identity.teacherIds.includes(id))));
 const requests=store.data.academicRequests.filter(request=>request.schoolId===school?.id && (page==='activities'?request.kind==='activity':request.kind!=='activity') && (role!=='guardian'||(!request.classroomId||request.classroomId===student?.classroomId))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const canWrite=role==='director'||role==='teacher';
 const open=(value:Dialog)=>{setDialog(value);setError("");};
 const current=requests.find(request=>request.id===selected);
 async function updateParticipation(request:AcademicRequest, studentId:string,participating:boolean,reason:string) {
  if(liveMode) await rpc('set_activity_participation',{p_request_id:request.id,p_student_id:studentId,p_participating:participating,p_reason:reason});
  else {
   await store.save('activityParticipations',{id:`${request.id}:${studentId}`,requestId:request.id,studentId,schoolId:request.schoolId,participating,reason});
   for(const charge of store.data.charges.filter(c=>c.academicRequestId===request.id&&c.studentId===studentId)) await store.save('charges',{...charge,status:participating?'pending':'cancelled'});
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
     {request.status==='approved'&&request.amount>0&&<Button variant="secondary" icon={Users} onClick={()=>setSelected(selected===request.id?'':request.id)}>Ver participantes y cobros</Button>}
    </div>
   </article>)}
  </div>
  {!requests.length&&<section className="panel"><Empty title={page==='materials'?'Aún no hay listas publicadas':'Aún no hay actividades'} subtitle={canWrite?'Crea una solicitud y Dirección podrá aprobarla para las familias.':'Las solicitudes aprobadas para el curso aparecerán aquí.'}/></section>}
  {current&&<section className="panel table-panel"><SectionTitle title={current.title} subtitle="La no participación requiere un motivo y conserva el historial."/>
   <div className="responsive-table"><table><thead><tr><th>Estudiante</th><th>Participación</th><th>Saldo</th><th>Acciones</th></tr></thead><tbody>
    {students.filter(s=>s.classroomId===current.classroomId && (role!=='guardian'||s.id===student?.id)).map(child=>{
     const participation=store.data.activityParticipations.find(p=>p.requestId===current.id&&p.studentId===child.id);
     const charge=store.data.charges.find(c=>c.academicRequestId===current.id&&c.studentId===child.id);
     return <tr key={child.id}><td>{fullName(child)}</td><td>{participation?.participating===false?'No participa':'Participa'}{participation?.reason&&<small className="block">{participation.reason}</small>}</td><td>{charge?money(chargeBalance(charge)):'Sin cuota'}</td><td><div className="table-actions">
      {charge&&charge.status!=='paid'&&charge.status!=='cancelled'&&<Button variant="secondary" onClick={()=>go(`${role==='guardian'?'payments':'cash'}?student=${child.id}&activity=${current.id}`)}>Ver cobro</Button>}
      {!charge?.paidAmount&&charge?.status!=='paid'&&<Button variant="ghost" onClick={()=>open({type:'participation',request:current,studentId:child.id,participating:participation?.participating===false})}>{participation?.participating===false?'Volver a participar':'No participará'}</Button>}
     </div></td></tr>;
    })}
   </tbody></table></div>
  </section>}
  {dialog&&<Modal title={dialog.type==='create'?(page==='materials'?'Nueva solicitud de materiales':'Nueva actividad'):dialog.type==='review'?(dialog.approve?'Aprobar solicitud':'Rechazar solicitud'):'Participación en actividad'} onClose={()=>setDialog(null)} busy={busy} error={error} submitLabel={dialog.type==='create'?'Enviar a revisión':dialog.type==='review'?(dialog.approve?'Aprobar y publicar':'Rechazar'):'Guardar participación'} onSubmit={async event=>{
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
    }else await updateParticipation(dialog.request,dialog.studentId,dialog.participating,text('reason'));
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
   </>:dialog.type==='review'?<><h3>{dialog.request.title}</h3><p>{dialog.approve?'La aprobación publica la solicitud para el curso y genera sus cobros.':'La solicitud no se publicará para las familias.'}</p><Field label={dialog.approve?'Observación de Dirección (opcional)':'Motivo de rechazo'} name="reviewNote"><textarea name="reviewNote" required={!dialog.approve} minLength={dialog.approve?undefined:5} maxLength={500}/></Field></>:<><p>{dialog.request.title} · {fullName(students.find(s=>s.id===dialog.studentId))}</p><Field label={dialog.participating?'Observación (opcional)':'Motivo de no participación'} name="reason"><textarea name="reason" required={!dialog.participating} minLength={dialog.participating?undefined:5} maxLength={500}/></Field></>}
  </Modal>}
 </>;
}
