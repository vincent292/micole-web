import {useState} from 'react';
import {Button,Empty,Field,SectionTitle} from '../components/UI';
import {useStudentKardex} from '../lib/useStudentKardex';
import {kardexKinds,kardexDetail,type KardexKind} from '../lib/studentKardex';
import {downloadRegistrationBlob} from '../lib/registration';
import type {PageProps} from './Pages';
export function StudentKardex(p:PageProps){
 const feed=useStudentKardex(p.student!.id,p.school?.id),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <section><SectionTitle title="Kárdex del estudiante" subtitle="Su trayectoria por gestión, inscripciones, asistencia, aprendizaje y seguimiento."/>
  <div className="academic-date-filters"><Field label="Gestión" name="kardexYear"><select id="kardexYear" name="kardexYear" aria-label="Gestión" value={feed.year} onChange={e=>feed.setYear(e.target.value)}><option value="">Todas las gestiones</option>{feed.data?.years.map(y=><option key={y} value={y}>{y}</option>)}</select></Field><Field label="Tipo de registro" name="kardexKind"><select id="kardexKind" name="kardexKind" aria-label="Tipo de registro" value={feed.kind} onChange={e=>feed.setKind(e.target.value as KardexKind)}>{Object.entries(kardexKinds).filter(([key])=>key!=='payments'||feed.data?.financialAvailable).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field><Button variant="secondary" onClick={feed.reload}>Actualizar historial</Button></div>
  {feed.error||error?<p role="alert" className="message error">{feed.error||error}</p>:null}{feed.loading?<p>Cargando kárdex…</p>:null}
  {feed.data&&<><p className="muted">{feed.data.studentName} · Página {feed.page} · {feed.data.events.length} registros. El historial muestra los datos conservados por la institución.</p>
   {!feed.data.academicAvailable&&<p className="message info">Los registros académicos se mostrarán cuando se habilite el acceso. El seguimiento y la información administrativa autorizada siguen disponibles.</p>}
   <Button variant="secondary" disabled={busy||!feed.data.events.length} onClick={()=>{setBusy(true);setError('');void import('../lib/institutionPdf').then(api=>api.studentKardexPdf(p.school!,feed.data!,feed.page)).then(bytes=>downloadRegistrationBlob(bytes as BlobPart,`kardex-${p.student!.id}-pagina-${feed.page}.pdf`,'application/pdf')).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}>Descargar esta página en PDF</Button>
   <div className="observation-list">{feed.data.events.map(e=><article key={e.key} className={'panel observation '+(e.details.kind==='incident'?'observation-incident':e.details.kind==='positive'?'observation-positive':'')}><header><small>{kardexKinds[e.kind]}</small><time>{new Date(e.at).toLocaleString('es-BO',{timeZone:'America/La_Paz'})}</time></header><h3>{e.title}</h3>{e.classroom&&<p className="muted">{e.classroom} · Gestión {e.year}</p>}<p className="observation-body">{e.body}</p><b>{kardexDetail(e)}</b>{e.kind==='followup'&&<Button variant="ghost" onClick={()=>p.go(`studentRecord?student=${p.student!.id}&tab=followup`)}>Abrir seguimiento</Button>}</article>)}</div>
   {!feed.data.events.length&&<Empty title="Sin registros para estos filtros"/>}<div className="focus-actions"><Button variant="secondary" disabled={feed.page===1} onClick={feed.previous}>Anterior</Button><span>Página {feed.page}</span><Button disabled={!feed.data.hasMore} onClick={feed.next}>Siguiente</Button></div>
  </>}
 </section>;
}
