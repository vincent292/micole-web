import {Button, Empty, SectionTitle} from '../components/UI';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import type {PageProps} from './Pages';
interface TeacherDashboard {
  subjects:{id:string;classroomId:string;name:string;classroomName:string;year:number;students:number;pendingSubmissions:number;results:{term:string;average:number|null;missing:number;belowMinimum:number}[]}[];
  tutorRooms:{id:string;name:string;year:number;students:number}[];
}
export function TeacherHome(p:PageProps) {
  const workspace=useAcademicPlanning<TeacherDashboard>('teacher_academic_dashboard',{p_school:p.school?.id},p.school?.id);
  return <section>
    <SectionTitle title="Materias y tutorías" subtitle="Tus materias, entregas por revisar y paralelos de tutoría."/>
    {workspace.error&&<p role="alert" className="message error">{workspace.error}</p>}
    {workspace.loading?<p>Cargando tus materias…</p>:<>
      {!!workspace.data?.tutorRooms.length&&<section><h2>Mis tutorías</h2><div className="academic-parallel-grid">{workspace.data.tutorRooms.map(room=><article key={room.id} className="panel"><h3>{room.name}</h3><p>{room.students} alumnos · Gestión {room.year}</p><div className="focus-actions">
        <Button onClick={()=>p.go(`classrooms?classroom=${room.id}&tab=records`)}>Consolidado de notas</Button><Button variant="secondary" onClick={()=>p.go(`classrooms?classroom=${room.id}&tab=followup`)}>Seguimiento del paralelo</Button>
      </div></article>)}</div></section>}
      <h2>Mis materias</h2><div className="academic-parallel-grid">{workspace.data?.subjects.map(subject=><article key={subject.id} className="panel academic-parallel">
        <h3>{subject.name}</h3><p>{subject.classroomName} · {subject.students} alumnos</p><p><b>{subject.pendingSubmissions}</b> entregas por revisar</p>
        {subject.results.slice(0,1).map(result=><div key={result.term} className="teacher-subject-result"><small>{result.term}</small><p>Promedio {result.average==null?'Pendiente':`${result.average} / 100`}</p><p>{result.belowMinimum} resultados bajo el mínimo · {result.missing} pendientes</p></div>)}
        <Button onClick={()=>p.go(`classrooms?classroom=${subject.classroomId}&tab=subject&subject=${subject.id}`)}>Abrir materia</Button>
      </article>)}</div>
      {!workspace.data?.subjects.length&&<Empty title="Todavía no tienes materias asignadas"/>}
    </>}
  </section>;
}
export function SecretaryHome(p:PageProps) {
  return <section><SectionTitle title="Administración de la institución" subtitle="Organiza la institución y acompaña las inscripciones."/>
    <div className="academic-parallel-grid">{[['enrollment','Inscripciones','Listas oficiales, fichas familiares y seguimiento de solicitudes.'],['classrooms','Grados y paralelos','Organización de cursos, tutorías y materias.'],['teachers','Docentes','Directorio y asignaciones del equipo.'],['timetables','Horarios','Cargas horarias y planificación de clases.']].map(([page,title,detail])=><article className="panel" key={page}><h2>{title}</h2><p>{detail}</p><Button onClick={()=>p.go(page)}>Abrir {title.toLowerCase()}</Button></article>)}</div>
    {p.identity.collectionSchoolIds?.includes(p.school?.id||'')&&<section className="panel"><h2>Caja y cobros</h2><p>Dirección habilitó tu permiso para recibir cobros.</p><Button onClick={()=>p.go('cash')}>Abrir caja</Button></section>}
  </section>;
}
