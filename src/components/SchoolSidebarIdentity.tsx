import {useId,useState} from 'react';
import {MapPin,ShieldCheck} from 'lucide-react';
import type {School,SupportSession} from '../lib/types';
import {schoolGroup,siteLabel} from '../lib/sites';
import '../styles/school-sidebar-identity.css';

export function SchoolSidebarIdentity({school,schools,support,kinderMode,onHome,onChoose}:{school:School;schools:School[];support?:SupportSession|null;kinderMode:boolean;onHome:()=>void;onChoose:(id:string)=>void}){
 const [failedLogo,setFailedLogo]=useState(''),selectId=useId();
 const groups=[...new Set(schools.map(schoolGroup))],multipleInstitutions=groups.length>1;
 return <section className="school-identity" aria-label="Identidad de la institución">
  <a className="school-identity-home" href="/app/overview" aria-label={`Ir al inicio de ${school.name}`} onClick={e=>{e.preventDefault();onHome();}}>
   <span className="school-identity-logo">{school.logoUrl&&school.logoUrl!==failedLogo?<img src={school.logoUrl} alt={`Logo de ${school.name}`} onError={()=>setFailedLogo(school.logoUrl||'')}/>:<span className="school-identity-initials" aria-label={`Iniciales de ${school.name}`}>{school.initials||'IE'}</span>}</span>
   <span className="school-identity-copy"><small>PORTAL INSTITUCIONAL</small><strong>{school.name}</strong></span>
  </a>
  {(kinderMode||support)&&<div className="school-identity-meta">{kinderMode&&<span className="school-identity-level">Modo kínder</span>}{support&&<span className="school-identity-support"><ShieldCheck size={12}/>{support.mode==='test'?'Sesión de pruebas':'Soporte activo'}</span>}</div>}
  <div className="school-identity-site"><MapPin size={15} aria-hidden="true"/><div><label htmlFor={selectId}>{multipleInstitutions?'Institución y sede':'Sede actual'}</label><select id={selectId} aria-label="Institución" title={siteLabel(school)} value={school.id} disabled={!!support||schools.length<2} onChange={e=>onChoose(e.target.value)}>
   {groups.map(root=><optgroup key={root} label={schools.find(s=>s.id===root)?.name||schools.find(s=>schoolGroup(s)===root)?.name}>{schools.filter(s=>schoolGroup(s)===root).map(s=><option key={s.id} value={s.id}>{multipleInstitutions?siteLabel(s):s.siteName||'Sede principal'}</option>)}</optgroup>)}
  </select></div></div>
 </section>;
}
