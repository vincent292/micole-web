import {useEffect,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {LockKeyhole,ShieldCheck} from 'lucide-react';
import {Brand} from '../../components/Brand';
import {Button,Field} from '../../components/UI';
import {RegistrationForm} from '../../components/RegistrationForm';
import {supabase} from '../../lib/supabase';
import {rpc} from '../../lib/repository';
import {readableInk,schoolAppearanceStyle} from '../../lib/schoolAppearance';
import type {School} from '../../lib/types';
import type {RegistrationContext} from '../../lib/registration';
import '../../styles/registration.css';

export function RegistrationPage(){
 const token=useLocation().pathname.split('/')[2]||'',[context,setContext]=useState<RegistrationContext>(),[error,setError]=useState(''),[email,setEmail]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[account,setAccount]=useState('');
 useEffect(()=>{let active=true;void supabase?.auth.getSession().then(({data})=>{if(active){setAccount(data.session?.user.email||'');setRevision(v=>v+1);}});const subscription=supabase?.auth.onAuthStateChange((_event,session)=>{if(active){setAccount(session?.user.email||'');setRevision(v=>v+1);}}).data.subscription;return()=>{active=false;subscription?.unsubscribe();};},[]);
 useEffect(()=>{let active=true;if(!/^[a-f0-9]{64}$/.test(token)){setError('El enlace de inscripción no es válido.');return;}setError('');void rpc<RegistrationContext>('registration_context',{p_token:token,p_id:null,p_staff:false}).then(value=>{if(active)setContext(value);}).catch(e=>{if(active){setError(e.message);setContext(undefined);}});return()=>{active=false;};},[token,revision]);
 const school=context?.school as School|undefined;
 const brandColor=school?.color&&/^#[\da-f]{6}$/i.test(school.color)?school.color:'#2563EB';
 return <main className="public-registration" style={{'--institution-primary':brandColor,'--institution-ink':readableInk(brandColor),...schoolAppearanceStyle(school)} as React.CSSProperties}>
  <header className="public-registration-header">{school?.logoUrl?<img src={school.logoUrl} alt={`Logo de ${school.name}`}/>:<ShieldCheck size={38}/>}<div><span>PORTAL DE INSCRIPCIONES</span><h1>{school?.name||'Inscripción de la institución'}</h1></div></header>
  <div className="public-registration-container"><div className="registration-online-notice"><ShieldCheck size={20}/><p><b>Inscripción en línea</b><br/>Cuando corresponda un pago, esta modalidad utiliza QR bancario. Para atención presencial o pago en efectivo, acude al colegio.</p></div>
   {error&&<p className="message error" role="alert">{error}</p>}
   {context?.requiresVerification?<section className="panel registration-verify"><LockKeyhole size={32}/><h2>Verifica tu acceso a la ficha</h2><p>Utiliza el correo del responsable autorizado por el colegio. Los datos del alumno se mostrarán después de verificarlo.</p>{account?<><p>Ingresaste como <b>{account}</b>. Si no ves la ficha, solicita a Dirección que revise el contacto autorizado.</p><Button variant="secondary" onClick={()=>{void supabase?.auth.signOut({scope:'local'});}}>Usar otra cuenta</Button><Button variant="ghost" onClick={()=>setRevision(v=>v+1)}>Comprobar acceso</Button></>:<form onSubmit={e=>{e.preventDefault();if(!supabase)return;setBusy(true);setError('');void supabase.auth.signInWithOtp({email:email.trim().toLowerCase(),options:{shouldCreateUser:true,emailRedirectTo:window.location.origin+'/matricula/'+token}}).then(({error})=>{if(error)throw Error('No pudimos enviar el acceso. Verifica el correo o inténtalo más tarde.');setSent(true);}).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><Field label="Correo autorizado" name="guardianEmail" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/><Button type="submit" disabled={busy}>{busy?'Enviando…':'Recibir enlace para verificar mi correo'}</Button>{sent&&<p className="message info" role="status">Revisa tu correo y abre el enlace para continuar con esta ficha.</p>}</form>}</section>:context?.application&&school?<RegistrationForm key={context.application.id} application={context.application} school={school} token={token} onChanged={app=>setContext(c=>c?{...c,application:app}:c)}/>:!error?<p>Preparando la ficha…</p>:<p>Solicita un enlace vigente a Dirección.</p>}
  </div><footer className="public-registration-footer"><span>Con tecnología de</span><Brand linked={false}/><Link to="/login">Ingresar a MiCole</Link></footer>
 </main>;
}
