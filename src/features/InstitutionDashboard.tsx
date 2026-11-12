import {useState} from 'react';
import {Button, Empty, Field, SectionTitle} from '../components/UI';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import {money} from '../lib/format';
import {today} from '../lib/billing';
import type {SchoolMetrics} from '../lib/schoolMetrics';
import type {PageProps} from './Pages';
import '../styles/academic-workspace.css';

export function InstitutionDashboard(p: PageProps) {
  const [from,setFrom]=useState(today().slice(0,7)+'-01'),[to,setTo]=useState(today());
  const report=useAcademicPlanning<SchoolMetrics & {subjectAttendance:{present:number;late:number;absent:number;excused:number};summary: SchoolMetrics['summary'] & {withdrawnStudents:number}}>('institution_dashboard',{
    p_from:from,p_to:to,p_group:'month',p_school_id:p.school?.id,p_classroom_id:null,p_environment:'all',
  },p.school?.id);
  const data=report.data;
  const cards=data?[
    {label:'Alumnos activos',value:String(data.summary.activeStudents),detail:'Matrícula vigente',page:'students'},
    {label:'Alumnos retirados',value:String(data.summary.withdrawnStudents),detail:'Retiros en el período',page:'students'},
    {label:'Cobrado',value:money(data.summary.collected),detail:'Pagos verificados en el período',page:'cash'},
    {label:'Saldo pendiente',value:money(data.summary.outstanding),detail:'Cuotas con vencimiento en el período',page:'cash'},
    {label:'Faltas registradas',value:String(data.summary.absent),detail:'Asistencias confirmadas',page:'classrooms'},
    {label:'Alumnos con notas bajas',value:String(data.summary.studentsAtRisk),detail:'Resultados completos bajo la nota mínima',page:'classrooms'},
  ]:[];
  const ranked=[...(data?.subjects||[])].filter(s=>s.average!=null).sort((a,b)=>Number(a.average)-Number(b.average));
  return <section className="institution-dashboard">
    <SectionTitle title="Indicadores de la institución" subtitle="Matrícula, asistencia, rendimiento académico y situación de cobros de tu institución."/>
    <div className="academic-date-filters"><Field label="Desde" name="dashboardFrom" type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/>
      <Field label="Hasta" name="dashboardTo" type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/><Button variant="secondary" onClick={report.refresh}>Actualizar</Button></div>
    {report.error&&<p className="message error" role="alert">{report.error}</p>}
    {report.loading?<p>Cargando indicadores…</p>:data&&<>
      <div className="institution-indicators">{cards.map(card=><button className="panel institution-indicator" key={card.label} onClick={()=>p.go(card.page)}>
        <span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small>
      </button>)}</div>
      <div className="institution-dashboard-grid"><section className="panel"><h2>Materias que requieren atención</h2>
        <p className="muted">Promedios por paralelo y período. Las evaluaciones incompletas se muestran como pendientes.</p>
        {ranked.length?<div className="academic-ranking">{ranked.slice(0,10).map((subject,index)=><button key={`${subject.class_subject_id}:${subject.term_id}:${index}`} onClick={()=>p.go(`classrooms?classroom=${subject.classroom_id}&tab=gradebook&subject=${subject.class_subject_id||''}`)}>
          <span><b>{subject.subject}</b><small>{subject.classroom} · {subject.term_name}</small></span><strong>{Number(subject.average).toFixed(1)} / 100</strong>
          <span className="academic-bar"><i style={{width:`${Math.max(0,Math.min(100,Number(subject.average)))}%`}}/></span><small>{subject.below_minimum} resultados bajo el mínimo · {subject.incomplete} pendientes</small>
        </button>)}</div>:<Empty title="Todavía no hay resultados completos para comparar"/>}
      </section><section className="panel"><h2>Asistencia diaria del paralelo</h2>
        <div className="attendance-indicators">{[['Presentes',data.summary.present],['Tardanzas',data.summary.late],['Faltas',data.summary.absent],['Justificadas',data.summary.excused]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <h2>Asistencia por materia</h2>
        <div className="attendance-indicators">{[['Presentes',data.subjectAttendance?.present||0],['Tardanzas',data.subjectAttendance?.late||0],['Faltas en clases',data.subjectAttendance?.absent||0],['Justificadas',data.subjectAttendance?.excused||0]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <h2>Cobros por mes</h2>{data.trend.map(item=><div className="academic-trend" key={item.from}><span>{item.from.slice(0,7)}</span><b>{money(item.collected)}</b><small>{item.studentsPaid} alumnos con pagos</small></div>)}
        <Button variant="secondary" onClick={()=>p.go('cash')}>Abrir caja y cobros</Button>
      </section></div>
    </>}
  </section>;
}
