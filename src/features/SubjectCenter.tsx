import {useState} from 'react';
import {useLocation} from 'react-router-dom';
import {ArrowLeft, Plus} from 'lucide-react';
import {Button, Empty, Field, Modal, SectionTitle} from '../components/UI';
import {subjectName} from '../lib/learning';
import {classroomWork} from '../lib/classroomWork';
import {today} from '../lib/billing';
import {rpc} from '../lib/repository';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import {Assignments} from './Academics';
import {Gradebook} from './GradeSheet';
import {AcademicFollowup} from './AcademicFollowup';
import type {PageProps} from './Pages';

export function SubjectCenter(p: PageProps & {roomId:string;subjectId:string}) {
  const params=new URLSearchParams(useLocation().search),section=params.get('section')||'assignments';
  const room=p.store.data.classrooms.find(r=>r.id===p.roomId);
  const subject=room&&classroomWork(p.store.data,room,p.identity,p.role).find(s=>s.id===p.subjectId);
  if(!subject)return <Empty title="Materia no disponible"/>;
  const sections=[['assignments','Tareas y entregas'],['gradebook','Notas'],['attendance','Asistencia'],['followup','Seguimiento'],['notice','Comunicados'],['event','Calendario'],['message','Mensajes']];
  return <section>
    <Button variant="ghost" icon={ArrowLeft} onClick={()=>p.go(`classrooms?classroom=${p.roomId}`)}>Volver al paralelo</Button>
    <SectionTitle title={subjectName(p.store.data,p.subjectId)} subtitle={`${room?.name} · ${subject.canWrite?'Materia a tu cargo':'Consulta de tutoría'}`}/>
    <nav className="subject-center-nav" aria-label="Herramientas de la materia">{sections.map(([key,label])=><button key={key} aria-current={section===key?'page':undefined} onClick={()=>p.go(`classrooms?classroom=${p.roomId}&tab=subject&subject=${p.subjectId}&section=${key}`)}>{label}</button>)}</nav>
    {section==='assignments'&&<Assignments {...p}/>}{section==='gradebook'&&<Gradebook {...p}/>}
    {section==='attendance'&&<SubjectAttendance {...p}/>}
    {section==='followup'&&<AcademicFollowup {...p}/>}
    {['notice','message','event'].includes(section)&&<SubjectPosts {...p} kind={section as 'notice'|'message'|'event'}/>}
  </section>;
}
interface Post {id:string;title:string;body:string;kind:string;event_date?:string;created_at:string;authorName:string;student_id?:string}
export function SubjectPosts(p:PageProps&{roomId:string;subjectId:string;kind:'notice'|'message'|'event'}) {
  const [student,setStudent]=useState(p.role==='guardian'?p.student?.id||'':''),[creating,setCreating]=useState(false);
  const feed=useAcademicPlanning<{canWrite:boolean;posts:Post[]}>('subject_feed_workspace',{p_subject:p.subjectId,p_student:student||null},p.school?.id);
  const students=p.students.filter(s=>s.classroomId===p.roomId);
  return <section>
    <SectionTitle title={p.kind==='notice'?'Comunicados de la materia':p.kind==='event'?'Calendario de la materia':'Mensajes por alumno'} action={feed.data?.canWrite||p.role==='guardian'&&p.kind==='message'?<Button icon={Plus} onClick={()=>setCreating(true)}>Agregar {p.kind==='notice'?'comunicado':p.kind==='event'?'actividad':'mensaje'}</Button>:undefined}/>
    {p.kind==='message'&&p.role!=='guardian'&&<Field label="Alumno" name="subjectMessageStudent"><select value={student} onChange={e=>setStudent(e.target.value)}><option value="">Todos mis alumnos</option>{students.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field>}
    {feed.error&&<p className="message error" role="alert">{feed.error}</p>}
    {feed.data?.posts.filter(post=>post.kind===p.kind).map(post=><article key={post.id} className="panel"><h3>{post.title}</h3><small>{post.authorName} · {post.event_date||new Date(post.created_at).toLocaleDateString('es-BO')}</small><p className="observation-body">{post.body}</p></article>)}
    {!feed.loading&&!feed.data?.posts.some(post=>post.kind===p.kind)&&<Empty title="Sin publicaciones en esta vista"/>}
    {creating&&<SubjectPostEditor {...p} students={students} initialStudent={student} onClose={()=>setCreating(false)} onSaved={()=>{setCreating(false);feed.refresh();}}/>}
  </section>;
}
function SubjectPostEditor(p:PageProps&{subjectId:string;kind:string;initialStudent:string;onClose:()=>void;onSaved:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[id]=useState(()=>crypto.randomUUID());
  return <Modal title="Publicar en la materia" busy={busy} error={error} onClose={p.onClose} submitLabel="Publicar" onSubmit={event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
    void rpc('save_subject_post',{p_id:id,p_subject:p.subjectId,p_student:form.get('student')||null,p_kind:p.kind,p_title:form.get('title'),p_body:form.get('body'),p_date:form.get('date')||null}).then(p.onSaved).catch(e=>setError(e.message)).finally(()=>setBusy(false));
  }}>
    {p.kind==='message'&&<Field label="Alumno del mensaje" name="student"><select required name="student" defaultValue={p.initialStudent}><option value="" disabled>Selecciona alumno</option>{p.students.map(s=><option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field>}
    <Field label="Título" name="title" required maxLength={160}/><Field label="Contenido" name="body"><textarea name="body" required maxLength={6000}/></Field>
    {p.kind==='event'&&<Field label="Fecha" name="date" type="date" required/>}
  </Modal>;
}
interface AttendanceRow {studentId:string;status:string;note:string}
interface AttendanceData {canWrite:boolean;revision:number;status:string|null;roster:{student_id:string;student_name:string}[];records:AttendanceRow[]}
export function SubjectAttendance(p:PageProps&{subjectId:string}) {
  const [day,setDay]=useState(today()),[lesson,setLesson]=useState('08:00');
  const feed=useAcademicPlanning<AttendanceData>('subject_attendance_workspace',{p_subject:p.subjectId,p_day:day,p_lesson:lesson,p_student:p.role==='guardian'?p.student?.id||null:null},p.school?.id);
  return <section><SectionTitle title="Asistencia de la materia" subtitle="Cada clase conserva su propia lista, fecha y hora."/>
    <div className="academic-date-filters"><Field label="Fecha" name="subjectAttendanceDate" type="date" max={today()} value={day} onChange={e=>setDay(e.target.value)}/><Field label="Hora de la clase" name="subjectAttendanceLesson" type="time" value={lesson} onChange={e=>setLesson(e.target.value)}/></div>
    {feed.error&&<p className="message error" role="alert">{feed.error}</p>}
    {feed.data&&<AttendanceEditor key={`${p.subjectId}:${day}:${lesson}:${feed.data.revision}`} data={feed.data} subjectId={p.subjectId} day={day} lesson={lesson} refresh={feed.refresh}/>}
  </section>;
}
function AttendanceEditor({data,subjectId,day,lesson,refresh}:{data:AttendanceData;subjectId:string;day:string;lesson:string;refresh:()=>void}) {
  const [records,setRecords]=useState<Record<string,AttendanceRow>>(()=>Object.fromEntries(data.records.map(row=>[row.studentId,row])));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[reason,setReason]=useState('');
  async function save(confirm:boolean){setBusy(true);setError('');try{await rpc('save_subject_attendance',{p_subject:subjectId,p_day:day,p_lesson:lesson,p_records:Object.values(records),p_revision:data.revision,p_confirm:confirm,p_reason:reason});refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const writable=data.canWrite;
  return <><p>{data.status==='confirmed'?'Asistencia confirmada':`${Object.keys(records).length} de ${data.roster.length} alumnos registrados`}</p>
    {error&&<p className="message error" role="alert">{error}</p>}
    {!data.roster.length&&data.records.map(row=><p key={row.studentId}>Asistencia confirmada · {{present:'Presente',late:'Tardanza',absent:'Falta',excused:'Justificada'}[row.status]} {row.note}</p>)}
    <div className="table-scroll"><table className="academic-summary-table"><thead><tr><th>Alumno</th><th>Asistencia</th><th>Observación</th></tr></thead><tbody>{data.roster.map(student=><tr key={student.student_id}><th>{student.student_name}</th><td><select aria-label={`Asistencia de ${student.student_name}`} disabled={!writable} value={records[student.student_id]?.status||''} onChange={e=>setRecords(rows=>({...rows,[student.student_id]:{studentId:student.student_id,status:e.target.value,note:rows[student.student_id]?.note||''}}))}>
      <option value="" disabled>Sin registrar</option><option value="present">Presente</option><option value="late">Tardanza</option><option value="absent">Falta</option><option value="excused">Justificada</option>
    </select></td><td><input aria-label={`Observación de ${student.student_name}`} disabled={!writable||!records[student.student_id]} maxLength={500} value={records[student.student_id]?.note||''} onChange={e=>setRecords(rows=>({...rows,[student.student_id]:{...rows[student.student_id],note:e.target.value}}))}/></td></tr>)}</tbody></table></div>
    {writable&&<>
      {data.status==='confirmed'&&<Field label="Motivo de la corrección" name="attendanceCorrection" value={reason} onChange={event=>setReason(event.target.value)} minLength={5} maxLength={1000}/>}
      <div className="focus-actions">{data.status!=='confirmed'&&<Button variant="secondary" disabled={busy} onClick={()=>void save(false)}>Guardar borrador</Button>}<Button disabled={busy||data.roster.length!==Object.keys(records).length} onClick={()=>void save(true)}>{data.status==='confirmed'?'Guardar corrección':'Confirmar asistencia'}</Button></div>
    </>}
  </>;
}

export function FamilySubjects(p:PageProps){
 const [subject,setSubject]=useState(''),[section,setSection]=useState('notice');
 const roomId=p.student?.classroomId||'';
 const subjects=p.store.data.classSubjects.filter(cs=>cs.classroomId===roomId&&cs.active);
 const selected=subjects.find(cs=>cs.id===subject);
 return <section><SectionTitle title="Materias de mi hijo"/>
  {selected?<><Button variant="ghost" onClick={()=>setSubject('')}>Volver a materias</Button><h2>{subjectName(p.store.data,selected.id)}</h2>
  <nav className="subject-center-nav" aria-label="Información de la materia">{[['notice','Comunicados'],['event','Calendario'],['message','Mensajes'],['attendance','Asistencia']].map(([key,label])=><button key={key} aria-current={section===key?'page':undefined} onClick={()=>setSection(key)}>{label}</button>)}</nav>
  {section==='attendance'?<SubjectAttendance {...p} subjectId={selected.id}/>:<SubjectPosts key={selected.id+section} {...p} roomId={roomId} subjectId={selected.id} kind={section as 'notice'|'event'|'message'}/>}
  </>:<div className="academic-parallel-grid">{subjects.map(cs=><article className="panel" key={cs.id}><h3>{subjectName(p.store.data,cs.id)}</h3><Button onClick={()=>setSubject(cs.id)}>Abrir materia</Button></article>)}</div>}
 </section>;
}
