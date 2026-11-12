import {useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Download, Plus} from 'lucide-react';
import {Button, Empty, Field, Modal, SectionTitle} from '../components/UI';
import {rpc} from '../lib/repository';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import {observationPhoto, percentage, type AcademicSummary, type Observation} from '../lib/academicWorkspace';
import {subjectOptions} from '../lib/learning';
import {isClassroomTutor} from '../lib/tutoring';
import {downloadRegistrationBlob} from '../lib/registration';
import {totalLabel, gradeMethods} from '../lib/gradeSheet';
import type {PageProps} from './Pages';
import '../styles/academic-workspace.css';

export function AcademicFollowup(p: PageProps & {roomId?: string; childId?: string; subjectId?: string}) {
  const params = new URLSearchParams(useLocation().search);
  const roomId = p.roomId || params.get('classroom') || null;
  const childId = p.childId || params.get('student') || (p.role === 'guardian' ? p.student?.id : null) || null;
  const subjectId = p.subjectId || params.get('subject') || null;
  const feed = useAcademicPlanning<Observation[]>('student_observation_workspace', {
    p_room: roomId, p_student: childId, p_subject: subjectId,
  }, p.school?.id);
  const [creating, setCreating] = useState(false);
  const canWrite = p.role === 'director' || p.role === 'teacher';
  return <section>
    <SectionTitle title="Seguimiento del alumno" subtitle="Reconocimientos y observaciones compartidos con tutoría, Dirección y la familia."
      action={canWrite && roomId ? <Button icon={Plus} onClick={() => setCreating(true)}>Agregar observación</Button> : undefined}/>
    {feed.error && <p className="message error" role="alert">{feed.error}</p>}
    {feed.loading ? <p>Cargando seguimiento…</p> : !feed.data?.length ? <Empty title="Sin observaciones registradas"/> :
      <div className="observation-list">{feed.data.map(item => <article className={`panel observation observation-${item.kind}`} key={item.id}>
        <header><span className="observation-kind">{item.kind === 'positive' ? 'Reconocimiento' : 'Incidencia'}</span><time>{new Date(item.created_at).toLocaleString('es-BO')}</time></header>
        <h3>{item.studentName}</h3><p className="muted">{item.subjectName} · {item.authorName}</p><p className="observation-body">{item.body}</p>
        {item.photo && <img src={item.photo} alt="Foto adjunta a la observación" loading="lazy"/>}
      </article>)}</div>}
    {creating && roomId && <ObservationEditor {...p} roomId={roomId} childId={childId || undefined} subjectId={subjectId || undefined}
      onClose={() => setCreating(false)} onSaved={() => {setCreating(false); feed.refresh();}}/>}
  </section>;
}
function ObservationEditor(p: PageProps & {roomId: string; childId?: string; subjectId?: string; onClose: () => void; onSaved: () => void}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const subjects = subjectOptions(p.store.data, p.roomId, p.identity, p.role);
  const general = p.role === 'director' || isClassroomTutor(p.store.data, p.identity, p.role, p.roomId);
  return <Modal title="Registrar seguimiento" onClose={p.onClose} busy={busy} error={error} submitLabel="Compartir observación" onSubmit={event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError('');
    void (async () => {
      const file = form.get('photo') as File;
      const photo = file?.size ? await observationPhoto(file) : null;
      await rpc('save_student_observation', {p_id: requestId, p_student: form.get('student'), p_subject: form.get('subject') || null,
        p_kind: form.get('kind'), p_body: form.get('body'), p_photo: photo});
      p.onSaved();
    })().catch(e => setError(e.message)).finally(() => setBusy(false));
  }}>
    <Field label="Alumno" name="student"><select name="student" required defaultValue={p.childId || ''}><option value="" disabled>Selecciona un alumno</option>
      {p.students.filter(s => s.classroomId === p.roomId).map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
    </select></Field>
    <Field label="Materia" name="subject"><select name="subject" required={!general} defaultValue={p.subjectId || (general ? '' : subjects[0]?.value || '')}>
      {general && <option value="">Seguimiento del paralelo</option>}{subjects.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select></Field>
    <Field label="Tipo de observación" name="kind"><select name="kind"><option value="positive">Reconocimiento</option><option value="incident">Incidencia</option></select></Field>
    <Field label="Descripción" name="body"><textarea name="body" required minLength={3} maxLength={4000}/></Field>
    <Field label="Foto opcional" name="photo"><input type="file" name="photo" accept="image/jpeg,image/png,image/webp"/></Field>
    <p className="registration-help">Al guardar, la observación estará disponible para la familia del alumno, tutoría y Dirección.</p>
  </Modal>;
}

export function ConsolidatedGrades(p: PageProps & {roomId: string}) {
  const params = new URLSearchParams(useLocation().search);
  const children = p.students.filter(s => s.classroomId === p.roomId);
  const [studentId, setStudentId] = useState(params.get('student') || children[0]?.id || '');
  const result = useAcademicPlanning<AcademicSummary>('student_academic_summary', {p_student: studentId}, studentId ? p.school?.id : undefined);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const data = result.data;
  return <section>
    <SectionTitle title="Consolidado de notas" subtitle="Consulta por alumno las materias, los períodos y la forma de evaluación."/>
    <Field label="Alumno" name="summaryStudent"><select value={studentId} onChange={e => setStudentId(e.target.value)}>{children.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></Field>
    {(result.error || error) && <p className="message error" role="alert">{result.error || error}</p>}
    {result.loading ? <p>Cargando notas…</p> : data && <>
      <div className="academic-summary-heading"><p>Nota mínima de aprobación {data.passMark} / 100</p><Button icon={Download} disabled={busy} onClick={() => {
        setBusy(true); setError(''); void import('../lib/institutionPdf').then(api => api.academicSummaryPdf(p.school!, data))
          .then(bytes => downloadRegistrationBlob(bytes as BlobPart, `notas-${studentId}.pdf`, 'application/pdf'))
          .catch(e => setError(e.message)).finally(() => setBusy(false));
      }}>Descargar PDF</Button></div>
      <div className="table-scroll"><table className="academic-summary-table"><thead><tr><th>Materia</th>{data.terms?.map(t => <th key={t.id}>{t.name}</th>)}</tr></thead>
        <tbody>{data.subjects?.map(subject => <tr key={subject.id}><th>{subject.name}</th>{subject.periods.map(period => {
          const normalized = percentage(period.total);
          return <td key={period.termId} className={normalized != null && normalized < data.passMark ? 'academic-failed' : ''}>
            <b>{totalLabel(period.total)}</b>{period.total.missing > 0 && <small>{period.total.missing} notas pendientes</small>}
            <small>{gradeMethods[period.method as keyof typeof gradeMethods] || period.method}</small>
            {period.assessments?.length ? <details><summary>Ver evaluaciones y pesos</summary>{period.assessments.map((assessment,index)=><p key={index}>{assessment.title} · {assessment.exempt?'Exento':assessment.qualitative || `${assessment.score ?? 'Pendiente'} / ${assessment.maxScore}`} · Peso {assessment.weight}</p>)}</details> : null}
            {period.total.dimensions?.map(d => <small key={d.code}>{d.code} {d.score ?? 'Pendiente'} / {d.max}</small>)}
          </td>;
        })}</tr>)}</tbody></table></div>
      {!data.subjects?.length && <Empty title="Todavía no hay materias para consolidar"/>}
    </>}
  </section>;
}
