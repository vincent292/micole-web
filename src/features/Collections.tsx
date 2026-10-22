import {AccountStatementButton,PaymentEvidencePanel,InvoiceAttachments} from './FinancialRecords';
import {recordView} from '../lib/financialApi';
import {publicDemo} from '../lib/demo-config';
import { BankQrDialog, BankRegister } from "./BankQr";
import { useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Check, Copy, Download, Link as LinkIcon, ReceiptText, Send } from "lucide-react";
import { Badge, Button, Empty, Field, Modal, SectionTitle, StatCard } from "../components/UI";
import { dateLabel, money, uid } from "../lib/format";
import { today } from "../lib/billing";
import { chargeAccessMinimum, chargeBalance, whatsappLink } from "../lib/operations";
import { csvContent } from "../lib/reports";
import { liveMode } from "../lib/supabase";
import { rpc } from "../lib/repository";
import type { InvoiceRequest } from "../lib/types";
import { fullName, type PageProps } from "./Pages";
const methodNames={cash:'Efectivo',qr:'QR corroborado',transfer:'Transferencia',deposit:'Depósito bancario'};
function exportCsv(name:string,headers:string[],rows:(string|number)[][]) {
 const url=URL.createObjectURL(new Blob([csvContent(headers,rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
type Selection={chargeId:string;amount:number}[];
export function Collections({store,school,role,students,student}:PageProps) {
 const location=useLocation(),params=new URLSearchParams(location.search);
 const [chosenStudent,setChosenStudent]=useState(params.get('student')||student?.id||students[0]?.id||'');
 const selectedChild=students.find(s=>s.id===(role==='guardian'?student?.id:chosenStudent));
 const childId=selectedChild?.id||'';
 const [selected,setSelected]=useState<Record<string,string>>(()=>params.get('charge')?{[params.get('charge')!]:'__balance'}:{});
 const [dialog,setDialog]=useState<{type:'record';id:string;items:Selection}|{type:'link';items:Selection}|{type:'optout';requestId:string}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[paymentLink,setPaymentLink]=useState('');
 const [wantsInvoice,setWantsInvoice]=useState(false),[method,setMethod]=useState<'cash'|'qr'|'transfer'|'deposit'>('cash');
 const [receiptPreview,setReceiptPreview]=useState('');
 const [qr,setQr]=useState<Selection|null>(null);
 const [recipient,setRecipient]=useState('');const [methodFilter,setMethodFilter]=useState('all');
 const visible=store.data.charges.filter(c=>c.schoolId===school?.id&&c.studentId===childId&&c.status!=='cancelled'&&(role!=='teacher'||!!c.academicRequestId)&&(!params.get('activity')||c.academicRequestId===params.get('activity'))).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
 const available=visible.filter(c=>chargeBalance(c)>0);
 const items=available.filter(c=>selected[c.id]!==undefined).map(c=>({chargeId:c.id,amount:selected[c.id]==='__balance'?chargeBalance(c):Number(selected[c.id])}));
 const total=items.reduce((sum,item)=>sum+Math.round(item.amount*100),0)/100;
 const receipts=store.data.schoolReceipts.filter(r=>r.schoolId===school?.id&&(role==='guardian'?r.studentId===student?.id:(!childId||r.studentId===childId))&&(methodFilter==='all'||r.paymentMethod===methodFilter)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const canConfirm=role==='director'||role==='teacher';
 const selectedInvoiceCharge=visible.find(c=>selected[c.id]!==undefined&&c.invoiceName);
 function prepare(type:'record'|'link') {
  setError('');setNotice('');setPaymentLink('');
  if(!items.length||items.some(i=>!Number.isFinite(i.amount)||i.amount<=0||i.amount>chargeBalance(available.find(c=>c.id===i.chargeId)!))){setError('Selecciona las cuotas y revisa sus abonos.');return;}
  setWantsInvoice(!!selectedInvoiceCharge);setMethod('cash');
  setRecipient(selectedChild?.motherPhone||selectedChild?.fatherPhone||'');
  setDialog(type==='record'?{type,id:uid(),items}:{type,items});
 }
 return <>
  <SectionTitle title={canConfirm?'Caja y cobros':'Pagar mis cuotas'} subtitle={role==='teacher'?'Corrobora únicamente los cobros de actividades aprobadas de tus aulas.':'Selecciona una o varias cuotas, registra anticipos y conserva cada abono con su recibo.'}/>
  {(error||notice)&&<div className={`message ${error?'error':'info'}`} role={error?'alert':'status'}>{error||notice}</div>}
  <div className="toolbar">
   {role!=='guardian'&&<Field label="Estudiante para el cobro" name="collectionStudent"><select value={childId} onChange={e=>{setChosenStudent(e.target.value);setSelected({});setError('');}}><option value="">Selecciona estudiante</option>{students.map(s=><option key={s.id} value={s.id}>{fullName(s)}</option>)}</select></Field>}
   {selectedChild&&<span className="course-tag">{fullName(selectedChild)}</span>}
  </div>
  <div className="stats-grid"><StatCard label="Saldo pendiente" value={money(available.reduce((sum,c)=>sum+chargeBalance(c),0))} icon={ReceiptText} tone="amber"/><StatCard label="Total seleccionado" value={money(Number.isFinite(total)?total:0)} icon={Check} tone="blue"/></div>
  <section className="panel table-panel"><div className="table-header"><b>Cuotas y cobros específicos</b><label className="check-field"><input type="checkbox" checked={!!available.length&&available.every(c=>selected[c.id]!==undefined)} onChange={e=>setSelected(e.target.checked?Object.fromEntries(available.map(c=>[c.id,String(chargeBalance(c))])):{})}/> Seleccionar pendientes</label></div>
   <div className="responsive-table"><table><thead><tr><th>Elegir</th><th>Concepto</th><th>Vence</th><th>Total</th><th>Abonado</th><th>Saldo</th><th>Abonar ahora</th></tr></thead><tbody>
    {visible.map(charge=>{const balance=chargeBalance(charge);return <tr key={charge.id}>
     <td><input type="checkbox" aria-label={`Seleccionar ${charge.concept}`} disabled={!balance} checked={selected[charge.id]!==undefined} onChange={e=>setSelected(previous=>{const next={...previous};if(e.target.checked)next[charge.id]=String(balance);else delete next[charge.id];return next;})}/></td>
     <td><b>{charge.concept}</b>{charge.status!=='paid'&&<small className="block">Mínimo acumulado para acceso: {money(chargeAccessMinimum(charge))} ({Math.round((charge.minimumAccessRatio??1)*100)}%)</small>}{charge.academicRequestId&&balance>0&&!charge.paidAmount&&<Button variant="ghost" onClick={()=>{setError('');setDialog({type:'optout',requestId:charge.academicRequestId!});}}>No participará</Button>}</td>
     <td>{dateLabel(charge.dueDate)}</td><td>{money(charge.amount)}</td><td>{money(charge.paidAmount??(charge.status==='paid'?charge.amount:0))}</td><td>{money(balance)}</td>
     <td>{balance>0?<input className="amount-input" type="number" aria-label={`Abono para ${charge.concept}`} min="0.01" step="0.01" max={balance} disabled={selected[charge.id]===undefined} value={selected[charge.id]===undefined?'':selected[charge.id]==='__balance'?balance:selected[charge.id]} onChange={e=>setSelected({...selected,[charge.id]:e.target.value})}/>:<Badge status="paid"/>}</td>
    </tr>;})}
   </tbody></table></div>
   {!visible.length&&<Empty title="No hay cuotas disponibles" subtitle="Selecciona un estudiante o crea su plan desde la inscripción."/>}
  </section>
  {["guardian","director"].includes(role)&&childId&&<AccountStatementButton studentId={childId}/>}
  <div className="collection-actions"><Button disabled={!items.length} onClick={()=>{try{if(!items.length||items.some(i=>!Number.isFinite(i.amount)||i.amount<=0||i.amount>chargeBalance(available.find(c=>c.id===i.chargeId)!)))throw new Error('Selecciona las cuotas y revisa sus abonos.');setQr(items.map(i=>({...i})));}catch(e){setError((e as Error).message);}}}>Generar QR bancario</Button>{canConfirm&&<Button icon={ReceiptText} disabled={!items.length} onClick={()=>prepare('record')}>Registrar cobro · {money(Number.isFinite(total)?total:0)}</Button>}<Button icon={LinkIcon} variant="secondary" disabled={!items.length} onClick={()=>prepare('link')}>Crear enlace para WhatsApp</Button></div>
  <section className="panel table-panel"><SectionTitle title="Recibos de cobro" subtitle="Cada recibo corresponde a dinero registrado; un abono conserva el saldo de la cuota." action={<Button variant="secondary" icon={Download} onClick={()=>exportCsv(`micole-recibos-${today()}.csv`,['Fecha','Recibo','Estudiante','Método','Referencia','Importe Bs'],receipts.map(r=>[r.createdAt,r.id,fullName(students.find(s=>s.id===r.studentId)),methodNames[r.paymentMethod],r.reference,r.total]))}>Exportar recibos</Button>}/>
   <label className="collection-filter">Método <select value={methodFilter} onChange={e=>setMethodFilter(e.target.value)}><option value="all">Todos</option>{Object.entries(methodNames).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
   <div className="responsive-table"><table><thead><tr><th>Fecha</th><th>Recibo</th><th>Método</th><th>Referencia</th><th>Importe</th><th>Recibo</th></tr></thead><tbody>{receipts.map(r=><tr key={r.id}><td>{dateLabel(r.createdAt)}</td><td>{r.id.slice(0,8).toUpperCase()}</td><td>{methodNames[r.paymentMethod]}{r.paymentMethod==='qr'&&r.verificationSource==='manual'&&<small className="block">Verificado manualmente</small>}</td><td>{r.reference}</td><td>{money(r.total)}</td><td><Button variant="ghost" onClick={()=>{if(receiptPreview===r.id)setReceiptPreview('');else void recordView('receipt',r.id).then(()=>setReceiptPreview(r.id)).catch(e=>setError(e.message));}}>Ver recibo</Button></td></tr>)}</tbody></table></div>
   {!receipts.length&&<Empty title="Todavía no hay recibos"/>}
  </section>
  {receiptPreview&&receipts.filter(r=>r.id===receiptPreview).map(receipt=><section className="panel receipt-preview" key={receipt.id}><SectionTitle title="Recibo de cobro" action={<Button variant="ghost" onClick={()=>setReceiptPreview('')}>Cerrar recibo</Button>}/><h3>{school?.name}</h3><p>Recibo {receipt.id}</p><p>{fullName(students.find(s=>s.id===receipt.studentId))} · {dateLabel(receipt.createdAt)}</p><p>{methodNames[receipt.paymentMethod]} · {receipt.reference}</p>{receipt.items?.map((item,index)=><div className="preview-total" key={index}><span>{item.concept}</span><b>{money(item.amount)}</b></div>)}<div className="preview-total"><span>Total recibido</span><b>{money(receipt.total)}</b></div><p className="muted">Comprobante de cobro de la institución. La solicitud de factura se gestiona por separado.</p></section>)}
  <PaymentEvidencePanel schoolId={school?.id} studentId={childId} role={role} items={items} revision={store.data.schoolReceipts} onChanged={()=>void store.refresh()}/>
  <BankRegister schoolId={school?.id} studentId={childId} canReview={role==='director'}/>
  {qr&&<BankQrDialog request={{kind:"school",schoolId:school?.id,studentId:childId,items:qr}} onChanged={()=>void store.refresh()} onClose={()=>{setQr(null);void store.refresh();}}/>}
  {dialog&&<Modal title={dialog.type==='record'?'Confirmar cobro':dialog.type==='link'?'Compartir enlace de pago':'No participación'} onClose={()=>setDialog(null)} busy={busy} error={error} submitLabel={dialog.type==='record'?'Confirmar y generar recibo':dialog.type==='link'?'Generar enlace':'Guardar motivo'} submitDisabled={dialog.type==='link'&&!!paymentLink} onSubmit={async event=>{
   event.preventDefault();if(busy)return;const f=new FormData(event.currentTarget),text=(name:string)=>String(f.get(name)||'').trim();setBusy(true);setError('');
   try{
    if(dialog.type==='record'){
     const invoice=wantsInvoice?{invoiceName:text('invoiceName'),invoiceNit:text('invoiceNit'),invoicePhone:text('invoicePhone')}:{};
     if(liveMode)await rpc('checkout_school_payment',{p_receipt_id:dialog.id,p_student_id:childId,p_items:dialog.items,p_method:method,p_reference:text('reference'),p_invoice:invoice,p_qr_reviewed:f.get('qrReviewed')==='on'});
     else{
      for(const item of dialog.items){const charge=visible.find(c=>c.id===item.chargeId)!;const paidAmount=Math.round(((charge.paidAmount||0)+item.amount)*100)/100;await store.save('charges',{...charge,paidAmount,status:paidAmount>=charge.amount?'paid':'pending',paidAt:paidAmount>=charge.amount?today():undefined});}
      await store.save('schoolReceipts',{id:dialog.id,schoolId:school!.id,studentId:childId,total:dialog.items.reduce((n,i)=>n+i.amount,0),paymentMethod:method,reference:text('reference'),verificationSource:'manual',recordedBy:'demo-director',createdAt:new Date().toISOString(),items:dialog.items.map(i=>({...i,concept:visible.find(c=>c.id===i.chargeId)!.concept}))});
      if(wantsInvoice)await store.save('invoiceRequests',{id:uid(),schoolId:school!.id,studentId:childId,receiptId:dialog.id,legalName:text('invoiceName'),nitCi:text('invoiceNit'),phone:text('invoicePhone'),amount:dialog.items.reduce((n,i)=>n+i.amount,0),status:'pending',invoiceNumber:'',createdAt:today()});
     }
     await store.refresh();setSelected({});setNotice('Cobro registrado y recibo generado. Los saldos se actualizaron.');setDialog(null);
    }else if(dialog.type==='link'){
     if(!liveMode&&!publicDemo)throw new Error('Los enlaces compartidos requieren el entorno conectado de Supabase.');
     const token=await rpc<string>('create_payment_link',{p_student_id:childId,p_items:dialog.items});setPaymentLink(`${locationOrigin()}/pago/${token}`);
    }else{
     if(liveMode)await rpc('set_activity_participation',{p_request_id:dialog.requestId,p_student_id:childId,p_participating:false,p_reason:text('reason')});else{for(const charge of visible.filter(c=>c.academicRequestId===dialog.requestId))await store.save('charges',{...charge,status:'cancelled'});}
     await store.refresh();setSelected({});setDialog(null);setNotice('No participación registrada con su motivo.');
    }
   }catch(e){setError(e instanceof Error?e.message:'No se pudo completar la operación.');}finally{setBusy(false);}
  }}>
   {dialog.type==='optout'?<Field label="Motivo de no participación" name="reason"><textarea name="reason" required minLength={5} maxLength={500} rows={3}/></Field>:<>
    <p><b>{fullName(selectedChild)}</b> · {dialog.items.length} cuotas · <b>{money(dialog.items.reduce((n,i)=>n+i.amount,0))}</b></p>
    {dialog.type==='record'?<>
     <Field label="Método de pago" name="method"><select name="method" value={method} onChange={e=>setMethod(e.target.value as typeof method)}>{Object.entries(methodNames).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></Field>
     <Field label="Referencia o número de recibo" name="reference" required defaultValue={`REC-${dialog.id.slice(0,8).toUpperCase()}`}/>
     {(method==='qr'||method==='deposit')&&<label className="check-field"><input name="qrReviewed" type="checkbox" required/> Verifiqué el ingreso de este importe en la cuenta de la institución</label>}
     {role==='director'&&<><label className="check-field"><input type="checkbox" checked={wantsInvoice} onChange={e=>setWantsInvoice(e.target.checked)}/> Solicita factura</label>{wantsInvoice&&<InvoiceFields defaults={selectedInvoiceCharge}/>}</>}
     <p className="soft-note">Se registrará el importe recibido y se generará un recibo. Las facturas se preparan para emisión manual por Dirección.</p>
    </>:<>
     <p>{publicDemo?'El enlace de demo solo funciona en este navegador. No lo envíes a familias reales.':'El enlace vence en 48 horas. Compartir por WhatsApp abre el mensaje para que tú lo envíes.'}</p>
     {paymentLink&&<><Field label="Enlace para compartir" name="paymentLink"><input value={paymentLink} readOnly/></Field><Button variant="secondary" icon={Copy} onClick={()=>{void navigator.clipboard.writeText(paymentLink).then(()=>setNotice('Enlace copiado.')).catch(()=>setError('No pudimos copiar. Selecciona el enlace y cópialo.'));}}>Copiar enlace</Button><Field label="Celular destinatario" name="recipient"><input type="tel" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="+591 70000000"/></Field><Button disabled={publicDemo} icon={Send} onClick={()=>{try{window.open(whatsappLink(recipient,`Pago de ${school?.name}: ${money(dialog.items.reduce((n,i)=>n+i.amount,0))}. Revisa las cuotas aquí: ${paymentLink}`),'_blank','noopener,noreferrer');}catch(e){setError((e as Error).message);}}}>Abrir WhatsApp para enviar</Button><p className="message info">Este enlace permite generar el QR con la cuenta Baneco de la institución. El banco confirma el pago y se actualizan los saldos automáticamente.</p></>}
    </>}
   </>}
  </Modal>}
 </>;
}
function locationOrigin(){return window.location.origin;}
function InvoiceFields({defaults}:{defaults?:{invoiceName?:string;invoiceNit?:string;invoicePhone?:string}}){return <><Field label="Nombre o razón social" name="invoiceName" required defaultValue={defaults?.invoiceName}/><div className="form-grid"><Field label="NIT o CI" name="invoiceNit" required defaultValue={defaults?.invoiceNit}/><Field label="Celular para la factura" name="invoicePhone" type="tel" required defaultValue={defaults?.invoicePhone}/></div></>;}

export function Invoices({store,school,role,student,students}:PageProps){
 const [status,setStatus]=useState(role==='guardian'?'all':'pending'),[selected,setSelected]=useState<InvoiceRequest|null>(null),[issue,setIssue]=useState<InvoiceRequest|null>(null),[requestReceipt,setRequestReceipt]=useState('');
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);const previewRef=useRef<HTMLDivElement>(null);
 const invoices=store.data.invoiceRequests.filter(i=>i.schoolId===school?.id&&(role!=='guardian'||i.studentId===student?.id)&&(status==='all'||i.status===status)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 const receipts=store.data.schoolReceipts.filter(r=>r.schoolId===school?.id&&(role!=='guardian'||r.studentId===student?.id)&&!store.data.invoiceRequests.some(i=>i.receiptId===r.id));
 return <><SectionTitle title="Facturas" subtitle="Solicitudes por cobros recibidos, preparadas para emisión manual." action={<Button variant="secondary" icon={Download} onClick={()=>exportCsv(`micole-facturas-${today()}.csv`,['Fecha','Nombre o razón social','NIT/CI','Celular','Importe Bs','Recibo','Estado','Número de factura'],invoices.map(i=>[i.createdAt,i.legalName,i.nitCi,i.phone,i.amount,i.receiptId,i.status,i.invoiceNumber]))}>Exportar lista</Button>}/>
  <div className="toolbar"><select aria-label="Estado de facturas" value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Por emitir</option><option value="issued">Emitidas</option><option value="all">Todas</option></select>{receipts.length>0&&<Field label="Solicitar factura de un recibo" name="receipt"><select value="" onChange={e=>{setRequestReceipt(e.target.value);setError('');}}><option value="">Selecciona un recibo</option>{receipts.map(r=><option key={r.id} value={r.id}>{r.id.slice(0,8)} · {money(r.total)} · {dateLabel(r.createdAt)}</option>)}</select></Field>}</div>
  <section className="panel table-panel"><div className="responsive-table"><table><thead><tr><th>Fecha</th><th>Nombre / NIT</th><th>Estudiante</th><th>Importe</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>{invoices.map(i=><tr key={i.id}><td>{dateLabel(i.createdAt)}</td><td><b>{i.legalName}</b><small className="block">{i.nitCi} · {i.phone}</small></td><td>{fullName(students.find(s=>s.id===i.studentId))}</td><td>{money(i.amount)}</td><td>{i.status==='pending'?'Por emitir':`Emitida · ${i.invoiceNumber}`}</td><td><div className="table-actions"><Button variant="ghost" onClick={()=>setSelected(i)}>Ver solicitud</Button><InvoiceAttachments invoiceId={i.id} files={i.files} canUpload={role==='director'} onChanged={()=>void store.refresh()}/>{role==='director'&&i.status==='pending'&&<Button variant="secondary" onClick={()=>{setIssue(i);setError('');}}>Registrar emisión</Button>}</div></td></tr>)}</tbody></table></div>{!invoices.length&&<Empty title="Sin solicitudes en este estado"/>}</section>
  {selected&&<section className="panel invoice-preview" ref={previewRef}><SectionTitle title="Solicitud para emisión manual" action={<Button variant="ghost" onClick={()=>setSelected(null)}>Cerrar vista</Button>}/><p className="message warn">Vista de solicitud · Sin validez fiscal. La factura se emite manualmente por la institución.</p><h2>{school?.name}</h2><p>{school?.nit&&`NIT institución: ${school.nit}`}</p><p>Recibo: {selected.receiptId}</p><p>Nombre o razón social: <b>{selected.legalName}</b></p><p>NIT/CI: {selected.nitCi}</p><p>Celular: {selected.phone}</p><p>Importe efectivamente recibido: <b>{money(selected.amount)}</b></p><p>Estado: {selected.status==='issued'?`Emitida manualmente · ${selected.invoiceNumber}`:'Pendiente de emisión'}</p></section>}
  {(issue||requestReceipt)&&<Modal title={issue?'Registrar factura emitida':'Solicitar factura del recibo'} onClose={()=>{setIssue(null);setRequestReceipt('');}} busy={busy} error={error} onSubmit={async event=>{
   event.preventDefault();const f=new FormData(event.currentTarget);setBusy(true);setError('');try{
    if(issue){if(liveMode)await rpc('mark_invoice_issued',{p_id:issue.id,p_number:String(f.get('invoiceNumber'))});else await store.save('invoiceRequests',{...issue,status:'issued',invoiceNumber:String(f.get('invoiceNumber')),issuedAt:new Date().toISOString()});}
    else{const receipt=receipts.find(r=>r.id===requestReceipt)!;const details={invoiceName:String(f.get('invoiceName')),invoiceNit:String(f.get('invoiceNit')),invoicePhone:String(f.get('invoicePhone'))};if(liveMode)await rpc('request_receipt_invoice',{p_receipt_id:requestReceipt,p_details:details});else await store.save('invoiceRequests',{id:uid(),schoolId:school!.id,studentId:receipt.studentId,receiptId:receipt.id,legalName:details.invoiceName,nitCi:details.invoiceNit,phone:details.invoicePhone,amount:receipt.total,status:'pending',invoiceNumber:'',createdAt:today()});}
    await store.refresh();setIssue(null);setRequestReceipt('');
   }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }}>{issue?<><p>Registra el número de la factura que ya emitiste por el importe recibido. Esta acción no emite una factura fiscal automáticamente.</p><Field label="Número de factura emitida" name="invoiceNumber" required/></>:<InvoiceFields/>}</Modal>}
 </>;
}
