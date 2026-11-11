import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Download,Save,ShieldCheck,Wallet} from 'lucide-react';
import {Button,Field,FormSection} from './UI';
import {CareFields,readCareProfile} from './CareFields';
import {rpc} from '../lib/repository';
import {money} from '../lib/format';
import {BankQrPanel} from '../features/BankQr';
import type {BankPayment} from '../lib/bank';
import type {School} from '../lib/types';
import {downloadRegistrationBlob,type RegistrationApplication} from '../lib/registration';
import '../styles/registration.css';

export function RegistrationForm({application,school,token,staff=false,canCollect=false,onChanged}:{application:RegistrationApplication;school:School;token?:string;staff?:boolean;canCollect?:boolean;onChanged:(app:RegistrationApplication)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[received,setReceived]=useState(false),formRef=useRef<HTMLFormElement>(null);
 const app=application,values={...app.seed,...app.profile},namePending=app.newStudent&&!app.studentId&&!app.seed.lastName?.trim();
 const run=async(fn:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 const save=(submit:boolean)=>run(async()=>{
  const form=formRef.current!;if(submit&&!form.reportValidity())return;
  const data=new FormData(form),profile:Record<string,unknown>={...readCareProfile(form)};
  for(const key of ['firstName','lastName','birthDate','rude','identityNumber','motherName','motherEmail','motherPhone','fatherName','fatherEmail','fatherPhone'])profile[key]=String(data.get(key)||'').trim();
  profile.consent=data.get('consent')==='on';
  const next=await rpc<RegistrationApplication>('save_registration_form',{p_id:app.id,p_token:token||null,p_profile:profile,p_submit:submit,p_revision:app.revision,p_staff:staff});onChanged(next);setNotice(submit?'Formulario recibido.':'Borrador guardado. Puedes continuar después.');
 });
 const refresh=async()=>{const ctx=await rpc<{application:RegistrationApplication}>('registration_context',{p_id:staff?app.id:null,p_token:token||null,p_staff:staff});onChanged(ctx.application);};
 async function pay(method:'cash'|'test_qr'){await run(async()=>{onChanged(await rpc<RegistrationApplication>('pay_registration',{p_id:app.id,p_method:method,p_token:token||null,p_received:method==='cash'&&received}));});}
 const download=()=>run(async()=>{const {registrationConfirmationPdf}=await import('../lib/institutionPdf');downloadRegistrationBlob(await registrationConfirmationPdf(school,app) as BlobPart,`constancia-${app.id.slice(0,8)}.pdf`,'application/pdf');});
 return <div className="registration-editor">
  <div className="registration-student-summary"><span className="registration-step">{app.year}</span><div><h2>{app.seed.firstName} {app.seed.lastName}</h2><p>{app.classroomName} · {school.siteName||'Sede principal'}</p></div><span className={`registration-status state-${app.status}`}>{app.status==='draft'?'Por completar':app.status==='payment_pending'?'Pendiente de pago':app.status==='confirmed'?'Confirmada':'Cancelada'}</span></div>
  {error&&<p className="message error" role="alert">{error}</p>}{notice&&<p className="message success" role="status">{notice}</p>}
  {app.status==='confirmed'?<section className="registration-success"><CheckCircle2 size={44}/><h2>Inscripción confirmada</h2><p>La ficha de {app.seed.firstName} está completa{app.paymentRequired?' y el pago fue registrado':''}.</p>{(app.testing||app.simulation)&&<p className="registration-test-note">Prueba con datos ficticios. No acredita una inscripción ni un cobro real.</p>}<Button icon={Download} disabled={busy} onClick={()=>void download()}>Descargar constancia PDF</Button></section>:
   app.status==='payment_pending'?<section className="panel registration-payment"><span className="registration-kicker">ÚLTIMO PASO</span><h2>Completar el pago</h2><p>{app.concept}</p><div className="registration-amount">{money(Number(app.amount))}</div>
    {app.simulation?<div className="registration-test-payment"><ShieldCheck size={24}/><h3>Simulación de pago QR</h3><p>Estás en la institución de pruebas. Este botón registra un pago ficticio; no contacta al banco ni mueve dinero.</p><Button disabled={busy} onClick={()=>void pay('test_qr')}>Simular pago QR de prueba</Button></div>:app.paymentToken?<RegistrationBankPayment token={app.paymentToken} onChanged={()=>void refresh().catch(e=>setError(e.message))}/>:<p>Dirección debe revisar el enlace de pago.</p>}
    {staff&&canCollect&&<div className="registration-cash"><h3><Wallet size={19}/> Pago presencial en efectivo</h3><label className="check-field"><input type="checkbox" checked={received} onChange={e=>setReceived(e.target.checked)}/>Confirmo que recibí {money(Number(app.amount))} en efectivo.</label><Button variant="secondary" disabled={busy||!received} onClick={()=>void pay('cash')}>Registrar efectivo recibido</Button></div>}
    {!staff&&<p className="muted">Para pagar en efectivo, acude al colegio. El personal autorizado debe registrar la recepción.</p>}
    <Button variant="ghost" disabled={busy} onClick={()=>void run(refresh)}>Actualizar estado de inscripción</Button>
   </section>:app.status==='cancelled'?<p>Esta solicitud fue cancelada. Contacta a Dirección.</p>:<>
    <div className="registration-flow" aria-label="Pasos de inscripción"><span>1 · Datos del alumno</span><span>2 · Familia y cuidados</span><span>3 · Revisión{app.paymentRequired?' y pago':''}</span></div>
    <form ref={formRef} onSubmit={e=>{e.preventDefault();void save(true);}} onChange={()=>setNotice('')}>
     <FormSection title="Datos del alumno"><div className="form-grid"><Field label="Nombres" name="firstName" required readOnly={!namePending} defaultValue={namePending?String(values.firstName||''):app.seed.firstName}/><Field label="Apellidos" name="lastName" required readOnly={!namePending} defaultValue={namePending?String(values.lastName||''):app.seed.lastName}/><Field label="Fecha de nacimiento" name="birthDate" type="date" required max={new Date().toISOString().slice(0,10)} defaultValue={String(values.birthDate||'')} readOnly={!!app.seed.birthDate}/><Field label="RUDE" name="rude" defaultValue={String(values.rude||'')} readOnly={!!app.seed.rude}/><Field label="CI del alumno" name="identityNumber" required={app.childCiRequired} defaultValue={String(values.identityNumber||'')} readOnly={!!app.seed.identityNumber}/></div><p className="registration-help">{namePending?'La lista solo incluía un nombre sin separar. Revisa y completa los nombres y apellidos antes de enviar.':'La institución define el nombre y el curso. Si encuentras un error, solicita su corrección a Dirección antes de enviar.'}</p></FormSection>
     {(['mother','father'] as const).map(rel=>{const required=app.familyPolicy==='both'||app.familyPolicy===rel||app.recipient===rel;return <FormSection key={rel} title={rel==='mother'?'Datos de la madre':'Datos del padre'}><div className="form-grid"><Field label="Nombre completo" name={rel+'Name'} required={required} defaultValue={String(values[rel+'Name']||'')}/><Field label="Correo" name={rel+'Email'} type="email" required={required} readOnly={!!app.seed[rel+'Email']||!!app.expectedEmail&&app.recipient===rel} defaultValue={app.recipient===rel&&app.expectedEmail?app.expectedEmail:String(values[rel+'Email']||'')}/><Field label="Celular" name={rel+'Phone'} type="tel" required={app.recipient===rel} defaultValue={String(values[rel+'Phone']||'')}/></div></FormSection>;})}
     <CareFields value={values} template={app.template}/>
     <section className="registration-review"><h3>Revisa antes de enviar</h3><p><b>Destino:</b> {app.classroomName} · Gestión {app.year}</p>{app.paymentRequired?<p><b>{app.concept}:</b> {money(Number(app.amount))}. La inscripción se confirmará después del pago registrado.</p>:<p>Esta inscripción no requiere un cobro adicional.</p>}<label className="check-field"><input type="checkbox" name="consent" required defaultChecked={values.consent===true}/>Confirmo que soy responsable autorizado, revisé los datos y acepto las condiciones de la ficha.</label></section>
     <div className="registration-form-actions"><Button type="button" variant="secondary" icon={Save} disabled={busy} onClick={()=>void save(false)}>Guardar y continuar después</Button><Button type="submit" disabled={busy}>{busy?'Guardando…':app.paymentRequired?'Enviar y continuar al pago':'Confirmar inscripción'}</Button></div>
    </form>
   </>}
 </div>;
}
function RegistrationBankPayment({token,onChanged}:{token:string;onChanged:()=>void}){
 const [data,setData]=useState<{qrAvailable:boolean;bankPayment?:BankPayment}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;void rpc<typeof data>('payment_link_context',{p_token:token}).then(v=>{if(active)setData(v);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token]);
 return error?<p className="message error" role="alert">{error}</p>:data?data.qrAvailable||data.bankPayment?<BankQrPanel linkToken={token} initial={data.bankPayment} canGenerate={data.qrAvailable} onChanged={onChanged}/>:<p className="message info">El colegio todavía no habilitó los pagos bancarios en línea. Tu ficha se conserva; contacta a Dirección o completa el pago presencialmente.</p>:<p>Preparando el pago…</p>;
}
