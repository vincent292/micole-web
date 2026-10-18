import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button, Field, SectionTitle } from "../components/UI";
import { rpc } from "../lib/repository";
import { liveMode } from "../lib/supabase";
import type { SupportAccount } from "../lib/types";
import type { PageProps } from "./Pages";
export type TestAccount = SupportAccount & { relationship?: "mother" | "father" };
export type TestOptions = { enabled: boolean; accounts: TestAccount[] };
export function TestWorkspace({ store, identity, initialSchoolId, onTest }: PageProps & {
 initialSchoolId?: string;
 onTest: (schoolId: string, account: TestAccount) => Promise<void>;
}) {
 const [schoolId,setSchoolId]=useState(initialSchoolId || sessionStorage.getItem('micole_test_school') || store.data.schools[0]?.id || '');
 const [result,setResult]=useState<{schoolId:string;value:TestOptions}|null>(null);
 const [role,setRole]=useState('director'),[selected,setSelected]=useState('');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const options=result?.schoolId===schoolId?result.value:undefined;
 useEffect(()=>{
  let active=true;setError('');setSelected('');
  if(!schoolId || !identity.canSupport)return;
  setLoading(true);
  void (liveMode?rpc<TestOptions>('test_workspace_options',{p_school_id:schoolId}):Promise.resolve({enabled:false,accounts:[]}))
   .then(value=>{if(active)setResult({schoolId,value});})
   .catch(e=>{if(active)setError(e.message);})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[schoolId,identity.canSupport,revision]);
 const eligible=(options?.accounts||[]).filter(a=>a.role===(role==='mother'||role==='father'?'guardian':role) && (a.role!=='guardian'||a.relationship===role));
 const account=eligible.find(a=>a.id===selected)||eligible[0];
 async function configure(enabled:boolean){
  if(busy)return;setBusy(true);setError('');
  try{await rpc('set_test_institution',{p_school_id:schoolId,p_enabled:enabled});setResult(null);setRevision(v=>v+1);}
  catch(e){setError(e instanceof Error?e.message:'No se pudo cambiar el modo de pruebas.');}finally{setBusy(false);}
 }
 return <section className="panel test-workspace">
  <SectionTitle title="Probar roles" subtitle="Solo tu cuenta puede entrar aquí. No necesitas confirmar los correos de prueba." />
  <Field label="Institución de pruebas" name="test-school"><select value={schoolId} disabled={busy} onChange={e=>setSchoolId(e.target.value)}>
   <option value="" disabled>Seleccionar institución</option>{store.data.schools.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
  </select></Field>
  <p className="soft-note">Los cambios se guardan en la institución seleccionada. Los roles conservan sus permisos y los bloqueos por pagos o ficha incompleta.</p>
  {loading?<p role="status">Consultando institución…</p>:null}
  {!loading&&options&&!options.enabled?<Button icon={FlaskConical} disabled={busy||!liveMode} onClick={()=>void configure(true)}>Usar esta institución para pruebas</Button>:null}
  {options?.enabled?<>
   <p className="message">Institución habilitada para pruebas del propietario.</p>
   <form className="support-form" onSubmit={async e=>{e.preventDefault();if(!account||busy||loading)return;setBusy(true);setError('');try{sessionStorage.setItem('micole_test_school',schoolId);await onTest(schoolId,account);}catch(e){setError(e instanceof Error?e.message:'No se pudo iniciar la prueba.');}finally{setBusy(false);}}}>
    <Field label="Rol de prueba" name="test-role"><select value={role} disabled={busy} onChange={e=>{setRole(e.target.value);setSelected('');}}>
     <option value="director">Dirección</option><option value="teacher">Docente</option><option value="mother">Madre</option><option value="father">Padre</option><option value="student">Estudiante</option>
    </select></Field>
    {role!=='director'?<Field label={role==='teacher'?'Docente para probar':'Niño o estudiante para probar'} name="test-account"><select required value={account?.id||''} disabled={busy||loading||!eligible.length} onChange={e=>setSelected(e.target.value)}>
     <option value="" disabled>Sin registros disponibles</option>{eligible.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}
    </select></Field>:null}
    {!eligible.length?<p className="soft-note">Primero entra como Dirección para registrar {role==='teacher'?'docentes y asignarles sus aulas':'niños en sus aulas'}. Luego podrás probar este rol.</p>:null}
    <Button icon={FlaskConical} type="submit" disabled={busy||loading||!account}>{busy?'Entrando…':'Entrar en modo de pruebas'}</Button>
   </form>
   <Button variant="ghost" disabled={busy} onClick={()=>void configure(false)}>Desactivar pruebas en esta institución</Button>
  </>:null}
  {error?<p className="message error" role="alert">{error}</p>:null}
 </section>;
}
