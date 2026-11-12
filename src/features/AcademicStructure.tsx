import {useState} from 'react';
import {ArrowRight, Plus, Settings2} from 'lucide-react';
import {Button, Empty, Field, Modal, SectionTitle} from '../components/UI';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import {rpc} from '../lib/repository';
import {isAcademicAdministrator, type SchoolGrade} from '../lib/academicWorkspace';
import {isKinderWorkspace} from '../lib/kinder';
import type {Classroom} from '../lib/types';
import type {PageProps} from './Pages';
import '../styles/academic-workspace.css';

type Structure = {grades: SchoolGrade[]; settings: {pass_mark: number; revision: number}};
export function AcademicStructure(p: PageProps) {
  const workspace = useAcademicPlanning<Structure>('academic_structure', {p_school: p.school?.id}, p.school?.id);
  const administrator = isAcademicAdministrator(p.role, p.identity, p.school?.id);
  const [gradeId, setGradeId] = useState(''), [year, setYear] = useState(new Date().getFullYear());
  const [creating, setCreating] = useState(false), [parallel, setParallel] = useState<SchoolGrade>();
  const [editing, setEditing] = useState<Classroom>();
  const grades = workspace.data?.grades.filter(g => g.academic_year === year) || [];
  const selected = grades.find(g => g.id === gradeId);
  const rooms = p.store.data.classrooms.filter(r => r.schoolId === p.school?.id && r.academicYear === year &&
    (p.role !== 'teacher' || r.teacherIds.some(id => p.identity.teacherIds.includes(id))));
  const refresh = () => {workspace.refresh(); void p.store.refresh();};
  return <section>
    <SectionTitle title={isKinderWorkspace(p.school) ? 'Grupos y aulas del kínder' : 'Grados y paralelos'}
      subtitle="Abre un paralelo para consultar sus alumnos, materias, horarios y seguimiento."
      action={administrator ? <Button icon={Plus} onClick={() => setCreating(true)}>Crear grado o grupo</Button> : undefined}/>
    {workspace.error && <p className="message error" role="alert">{workspace.error}</p>}
    <div className="academic-structure-filters"><Field label="Gestión" name="structureYear"><select value={year} onChange={e => {setYear(Number(e.target.value)); setGradeId('');}}>
      {[...new Set([new Date().getFullYear(), new Date().getFullYear() + 1, ...(workspace.data?.grades.map(g => g.academic_year) || [])])].sort((a,b) => b-a).map(y => <option key={y}>{y}</option>)}
    </select></Field><Field label="Grado o grupo" name="structureGrade"><select value={gradeId} onChange={e => setGradeId(e.target.value)}><option value="">Todos los grados</option>{grades.map(g => <option value={g.id} key={g.id}>{g.level} · {g.name}</option>)}</select></Field></div>
    {workspace.loading ? <p>Cargando organización académica…</p> : (selected ? [selected] : grades).map(grade => {
      const parallels = rooms.filter(r => r.gradeId === grade.id);
      return <section className="academic-grade" key={grade.id}>
        <header><div><small>{grade.level} · Gestión {grade.academic_year}</small><h2>{grade.name}</h2></div>
          {administrator && <Button variant="secondary" icon={Plus} onClick={() => {setEditing(undefined);setParallel(grade);}}>Agregar paralelo</Button>}
        </header>
        <div className="academic-parallel-grid">{parallels.map(room => <article className="panel academic-parallel" key={room.id}>
          <h3>{room.parallelName || room.name}</h3><p>{room.schedule} · {p.students.filter(s => s.classroomId === room.id && s.status === 'active').length} alumnos activos</p>
          <p>Tutoría · {p.store.data.teachers.find(t => t.id === room.tutorTeacherId)?.name || 'Pendiente de asignar'}</p>
          <p>{p.store.data.classSubjects.filter(s => s.classroomId === room.id && s.active).length} materias</p>
          <div className="focus-actions"><Button icon={ArrowRight} onClick={() => p.go(`classrooms?classroom=${room.id}`)}>Abrir paralelo</Button>
            {administrator && <Button variant="ghost" icon={Settings2} onClick={() => {setEditing(room);setParallel(grade);}}>Organizar</Button>}
          </div>
        </article>)}</div>
        {!parallels.length && <Empty title="Este grado todavía no tiene paralelos"/>}
      </section>;
    })}
    {!workspace.loading && !grades.length && <Empty title="Prepara los grados de esta gestión"/>}
    {rooms.some(r => !r.gradeId) && <section className="panel"><h3>Paralelos por organizar</h3>{rooms.filter(r => !r.gradeId).map(room => <UnassignedParallel key={room.id} room={room} grades={grades} administrator={administrator} onSaved={refresh} go={p.go}/>)}</section>}
    {creating && <GradeEditor schoolId={p.school!.id} year={year} onClose={() => setCreating(false)} onSaved={id => {setCreating(false);setGradeId(id);refresh();}}/>}
    {parallel && <ParallelEditor {...p} grade={parallel} existing={editing} onClose={() => {setParallel(undefined);setEditing(undefined);}} onSaved={() => {setParallel(undefined);setEditing(undefined);refresh();}}/>}
  </section>;
}
function GradeEditor({schoolId,year,onClose,onSaved}: {schoolId:string;year:number;onClose:()=>void;onSaved:(id:string)=>void}) {
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const [id] = useState(() => crypto.randomUUID());
  const [level,setLevel]=useState('Inicial');
  return <Modal title="Crear grado o grupo" onClose={onClose} busy={busy} error={error} submitLabel="Guardar grado" onSubmit={event => {
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
    void rpc<string>('save_school_grade',{p_school:schoolId,p_id:id,p_year:year,p_name:form.get('name'),p_level:form.get('level'),p_code:form.get('code') || null})
      .then(onSaved).catch(e=>setError(e.message)).finally(()=>setBusy(false));
  }}><Field label="Nombre del grado o grupo" name="name" required maxLength={100} placeholder="6.º de Primaria o Sala de 4 años"/>
    <Field label="Nivel" name="level"><select name="level" value={level} onChange={event=>setLevel(event.target.value)}><option>Inicial</option><option>Primaria</option><option>Secundaria</option><option>Guardería</option><option>Otro</option></select></Field>
    <Field label="Grado académico" name="code"><select name="code" onChange={event=>{if(event.target.value.startsWith('primary'))setLevel('Primaria');else if(event.target.value.startsWith('secondary'))setLevel('Secundaria');else if(event.target.value==='initial')setLevel('Inicial');}}><option value="">Grupo propio de la institución</option><option value="initial">Inicial</option>{['primary','secondary'].flatMap(level => Array.from({length:6},(_,i)=><option key={level+i} value={level+(i+1)}>{i+1}.º de {level==='primary'?'Primaria':'Secundaria'}</option>))}</select></Field>
  </Modal>;
}
function ParallelEditor(p: PageProps & {grade: SchoolGrade; existing?:Classroom;onClose:()=>void;onSaved:()=>void}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [id]=useState(()=>p.existing?.id || crypto.randomUUID());
  return <Modal title={`Paralelo de ${p.grade.name}`} busy={busy} error={error} onClose={p.onClose} submitLabel="Guardar paralelo" onSubmit={event=>{
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError('');
    void rpc('save_academic_parallel',{p_grade:p.grade.id,p_id:id,p_name:form.get('name'),p_tutor:form.get('tutor')||null,p_capacity:Number(form.get('capacity')),p_schedule:form.get('schedule')})
      .then(p.onSaved).catch(e=>setError(e.message)).finally(()=>setBusy(false));
  }}><Field label="Nombre del paralelo" name="name" required maxLength={100} placeholder="A, B, Blanco, Rojo…" defaultValue={p.existing?.parallelName || ''}/>
    <Field label="Tutor o tutora" name="tutor"><select name="tutor" defaultValue={p.existing?.tutorTeacherId||''}><option value="">Pendiente de asignar</option>{p.store.data.teachers.filter(t=>t.schoolId===p.school?.id&&t.status==='active').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    <Field label="Turno" name="schedule" required defaultValue={p.existing?.schedule || 'Mañana'}/>
    <Field label="Capacidad" name="capacity" type="number" min={1} max={1000} required defaultValue={p.existing?.capacity || 30}/>
  </Modal>;
}
function UnassignedParallel({room,grades,administrator,onSaved,go}:{room:Classroom;grades:SchoolGrade[];administrator:boolean;onSaved:()=>void;go:(path:string)=>void}) {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <form className="academic-unassigned" onSubmit={event=>{
    event.preventDefault();const data=new FormData(event.currentTarget);setBusy(true);setError('');
    void rpc('assign_parallel_grade',{p_room:room.id,p_grade:data.get('grade'),p_name:room.name}).then(onSaved).catch(e=>setError(e.message)).finally(()=>setBusy(false));
  }}><span>{room.name}</span><Button variant="ghost" onClick={()=>go(`classrooms?classroom=${room.id}`)}>Abrir</Button>
    {administrator && <><select name="grade" required aria-label={`Grado de ${room.name}`}><option value="">Selecciona grado</option>{grades.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><Button type="submit" disabled={busy}>Asignar</Button></>}
    {error&&<p role="alert" className="message error">{error}</p>}
  </form>;
}
