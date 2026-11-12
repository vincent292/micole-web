import {useEffect,useState} from 'react';
import {Button, Field, SectionTitle} from '../components/UI';
import {useAcademicPlanning} from '../lib/useAcademicPlanning';
import {rpc} from '../lib/repository';
import type {PageProps} from './Pages';
interface SecretaryAccess {email:string;active:boolean;canCollect:boolean}
export function AcademicAdministration(p: PageProps) {
  const secretaries=useAcademicPlanning<SecretaryAccess[]>('secretary_access_workspace',{p_school:p.school?.id},p.school?.id);
  const structure=useAcademicPlanning<{settings:{pass_mark:number;revision:number}}>('academic_structure',{p_school:p.school?.id},p.school?.id);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [pending,setPending]=useState<Record<string,Partial<SecretaryAccess>>>({});
  useEffect(()=>{setPending({});},[secretaries.data]);
  function updateAccess(secretary:SecretaryAccess,change:Partial<SecretaryAccess>){
    const next={...secretary,...pending[secretary.email],...change};
    setPending(values=>({...values,[secretary.email]:next}));
    void save(()=>rpc('save_secretary_access',{p_school:p.school!.id,p_email:secretary.email,p_active:next.active,p_collect:next.canCollect}));
  }
  async function save(task:()=>Promise<unknown>){setBusy(true);setError('');setNotice('');try{await task();secretaries.refresh();structure.refresh();setNotice('Configuración guardada.');}catch(e){setPending({});setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="panel academic-administration">
    <SectionTitle title="Secretaría y configuración académica" subtitle="Dirección administra el acceso a la institución y el permiso de recibir cobros."/>
    {(error||secretaries.error||structure.error)&&<p className="message error" role="alert">{error||secretaries.error||structure.error}</p>}{notice&&<p className="message success" role="status">{notice}</p>}
    <form onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void save(()=>rpc('save_secretary_access',{p_school:p.school!.id,p_email:form.get('email'),p_active:true,p_collect:form.get('collect')==='on'}));}}>
      <Field label="Correo de Secretaría" name="email" type="email" required/>
      <label className="check-field"><input type="checkbox" name="collect"/>Habilitar caja y recepción de cobros</label>
      <p className="registration-help">La cuenta debe ingresar con este correo verificado. Podrá organizar grados, paralelos, docentes, horarios e inscripciones.</p>
      <Button type="submit" disabled={busy}>Habilitar Secretaría</Button>
    </form>
    <div className="secretary-access-list">{secretaries.data?.map(secretary=><article key={secretary.email}>
      <b>{secretary.email}</b><label><input type="checkbox" disabled={busy} checked={pending[secretary.email]?.active??secretary.active} onChange={e=>updateAccess(secretary,{active:e.target.checked})}/>Acceso activo</label>
      <label><input type="checkbox" disabled={busy||!secretary.active} checked={pending[secretary.email]?.canCollect??secretary.canCollect} onChange={e=>updateAccess(secretary,{canCollect:e.target.checked})}/>Recibir cobros</label>
    </article>)}</div>
    {structure.data&&<form key={structure.data.settings.revision} onSubmit={event=>{event.preventDefault();const form=new FormData(event.currentTarget);void save(()=>rpc('save_institution_pass_mark',{p_school:p.school!.id,p_mark:Number(form.get('mark')),p_revision:structure.data!.settings.revision}));}}>
      <h3>Nota mínima de aprobación</h3><Field label="Mínimo sobre 100" name="mark" type="number" min={0} max={100} step="0.01" required defaultValue={structure.data.settings.pass_mark}/>
      <p className="registration-help">Los resultados completos inferiores a este valor se destacan en rojo en el consolidado y el tablero.</p><Button type="submit" variant="secondary" disabled={busy}>Guardar nota mínima</Button>
    </form>}
  </section>;
}
