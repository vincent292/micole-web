import {useEffect,useState} from 'react';
import {Download,RefreshCw,QrCode} from 'lucide-react';
import {Button,Field,Modal,SectionTitle} from '../components/UI';
import {rpc} from '../lib/repository';
import {liveMode} from '../lib/supabase';
import {bankAction,bankError,bankLabels,type BankRequest,type BankPayment} from '../lib/bank';
import {money,dateLabel} from '../lib/format';
export function BankQrPanel({request,linkToken,initialId,initial,onChanged,canGenerate=true}:{canGenerate?:boolean;request?:BankRequest;linkToken?:string;initialId?:string;initial?:BankPayment|null;onChanged?:()=>void}){
 const [payment,setPayment]=useState<BankPayment|null>(initial||null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [invoice,setInvoice]=useState(false),[name,setName]=useState(''),[nit,setNit]=useState(''),[phone,setPhone]=useState('');
 const id=payment?.id||initialId;
 useEffect(()=>{
  if(!id)return;let active=true;let timer:number|undefined;
  const read=async()=>{try{
   let next:BankPayment|null;if(linkToken){const url=import.meta.env.VITE_SUPABASE_URL,key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;const response=await fetch(`${url}/rest/v1/rpc/payment_link_context`,{method:'POST',credentials:'omit',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({p_token:linkToken})});const data=await response.json();if(!response.ok)throw new Error(bankError(data.message));next=data.bankPayment;}else next=await rpc<BankPayment>('baneco_payment_context',{p_id:id});
   if(active&&next){setPayment(next);if(next.status==='paid'&&next.applicationStatus==='applied')onChanged?.();if(!['paid','cancelled','failed'].includes(next.status))timer=window.setTimeout(()=>{if(document.visibilityState==='visible')void read();else timer=window.setTimeout(()=>void read(),10000);},5000);}
  }catch(e){if(active)setError(e instanceof Error?e.message:'No pudimos consultar el QR.');}};
  void read();return()=>{active=false;window.clearTimeout(timer);};
 },[id,linkToken]);
 const total=payment?.amount||request?.items.reduce((n,i)=>n+Math.round(i.amount*100),0)!/100;
 async function action(action:'generate'|'refresh'|'cancel'){
  if(busy)return;setBusy(true);setError('');
  try{const details=invoice?{invoiceName:name.trim(),invoiceNit:nit.trim(),invoicePhone:phone.trim()}:{};
   const body=linkToken?{action:`link_${action}`,token:linkToken,invoice:details}:action==='generate'?{action,...request,invoice:details}:{action,id};
   const result=await bankAction(body,!!linkToken);if(result.payment){setPayment(result.payment);if(result.payment.status==='paid'&&result.payment.applicationStatus==='applied')onChanged?.();}
  }catch(e){setError(e instanceof Error?e.message:'No se pudo completar el pago.');}finally{setBusy(false);}
 }
 return <div className="bank-qr-panel">
  {error&&<p className="message error" role="alert">{error}</p>}
  {Number.isFinite(total)&&<div className="preview-total"><span>{request?.kind==='platform'?'Pago a MiCole':'Importe del QR'}</span><b>{money(total)}</b></div>}
  {payment?<>
   <p className={`message ${payment.status==='paid'?'info':''}`} role="status"><b>{bankLabels[payment.status]}</b></p>
   {payment.environment==='test'&&<p className="message warn">QR de certificación. En instituciones reales no acredita cuotas.</p>}
   {payment.status==='paid'?<p>{payment.applicationStatus==='applied'?'El pago ya se registró y actualizó los saldos.':payment.applicationStatus==='test'?'Pago de prueba verificado, sin acreditar cuotas reales.':'Baneco confirmó el pago. Dirección debe revisar su aplicación; conserva esta referencia.'}</p>:null}
   {payment.image&&payment.status==='pending'&&<><img className="bank-qr-image" src={payment.image} alt={`QR Baneco por ${money(payment.amount)}`}/><a className="btn btn-secondary" href={payment.image} download={`micole-qr-${payment.id.slice(0,8)}.png`}><Download size={17}/>Descargar QR</a><small>Válido hasta {dateLabel(payment.dueDate)} · Importe fijo y un solo uso</small></>}
   {['unknown','review','generating'].includes(payment.status)&&<p className="soft-note">Conservamos esta solicitud para evitar un cobro duplicado. Puedes consultar su estado o contactar a Dirección.</p>}
   <small className="bank-reference">Referencia: {payment.reference||payment.transactionId||payment.id}</small>
   {!['paid','cancelled','failed'].includes(payment.status)&&<div className="request-actions"><Button icon={RefreshCw} variant="secondary" disabled={busy} onClick={()=>void action('refresh')}>Actualizar estado</Button>{payment.qrId&&<Button variant="ghost" disabled={busy} onClick={()=>void action('cancel')}>Cancelar QR</Button>}</div>}
  </>:null}
  {(!payment||['cancelled','failed'].includes(payment.status))&&<>
   {request?.kind!=='platform'&&<><label className="check-field"><input type="checkbox" checked={invoice} onChange={e=>setInvoice(e.target.checked)}/> Necesito factura</label>{invoice&&<><Field label="Nombre o razón social" name="qrInvoiceName"><input value={name} onChange={e=>setName(e.target.value)} maxLength={160}/></Field><div className="form-grid"><Field label="NIT o CI" name="qrInvoiceNit"><input value={nit} onChange={e=>setNit(e.target.value)} maxLength={30}/></Field><Field label="Celular para factura" name="qrInvoicePhone"><input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" maxLength={25}/></Field></div></>}</>}
   <Button icon={QrCode} disabled={busy||!canGenerate||(!request&&!linkToken)} onClick={()=>void action('generate')}>{busy?'Preparando QR…':'Generar QR bancario'}</Button>
  </>}
  <p className="muted">La confirmación llega desde Baneco. La imagen o una captura del pago no acreditan cuotas.</p>
 </div>;
}
export function BankQrDialog({onClose,...props}:Parameters<typeof BankQrPanel>[0]&{onClose:()=>void}){return <Modal title="Pago con QR Baneco" submitLabel="Cerrar" onClose={onClose} onSubmit={e=>{e.preventDefault();onClose();}}><BankQrPanel {...props}/></Modal>;}
export function BankRegister({schoolId,studentId,canReview=false}:{schoolId?:string;studentId?:string;canReview?:boolean}){
 const [rows,setRows]=useState<BankPayment[]>([]),[selected,setSelected]=useState<string|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState('');
 useEffect(()=>{let active=true;if(!liveMode)return;void rpc<BankPayment[]>('baneco_payment_register',{p_school_id:schoolId||null}).then(data=>{if(active)setRows(data.filter(r=>!studentId||r.studentId===studentId));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[schoolId,studentId,revision]);
 return <section className="panel"><SectionTitle title="Pagos QR bancarios" subtitle="Estado confirmado por el banco y aplicación a las cuotas." action={<Button variant="ghost" onClick={()=>setRevision(v=>v+1)}>Actualizar pagos QR</Button>}/>{error&&<p role="alert">{error}</p>}{!rows.length?<p className="muted">Todavía no hay solicitudes QR.</p>:<div className="responsive-table"><table><thead><tr><th>Importe</th><th>Estado</th><th>Aplicación</th><th>Acción</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{money(r.amount)}<small className="block">{r.environment==='test'?'Certificación':r.kind==='platform'?'MiCole':'Institución'}</small></td><td>{bankLabels[r.status]}</td><td>{r.applicationStatus==='applied'?'Registrado':r.applicationStatus==='review'?'Revisión de Dirección':r.applicationStatus==='test'?'Prueba sin acreditar':'Pendiente'}</td><td><Button variant="ghost" onClick={()=>setSelected(r.id)}>Ver pago QR</Button>{canReview&&r.applicationStatus==='review'&&<Button variant="ghost" onClick={()=>{void rpc('bank_retry_application',{p_id:r.id}).then(()=>setRevision(v=>v+1)).catch(e=>setError(e.message));}}>Reintentar aplicación</Button>}</td></tr>)}</tbody></table></div>}{selected&&<BankQrDialog initialId={selected} onClose={()=>{setSelected(null);setRevision(v=>v+1);}}/>}</section>;
}
export function PlatformBankDues({charges,onChanged}:{charges:{id:string;schoolId:string;concept:string;amount:number;status:string}[];onChanged?:()=>void}){
 const [request,setRequest]=useState<BankRequest|null>(null),pending=charges.filter(c=>!['paid','cancelled'].includes(c.status));
 if(!pending.length)return null;
 return <section className="panel"><SectionTitle title="Servicios MiCole" subtitle="Las activaciones y licencias se pagan directamente a MiCole."/>{pending.map(c=><div key={c.id} className="preview-total"><span>{c.concept} · {money(c.amount)}</span><Button variant="secondary" onClick={()=>setRequest({kind:'platform',schoolId:c.schoolId,items:[{chargeId:c.id,amount:c.amount}]})}>Pagar a MiCole con QR</Button></div>)}{request&&<BankQrDialog request={request} onChanged={onChanged} onClose={()=>setRequest(null)}/>}</section>;
}
