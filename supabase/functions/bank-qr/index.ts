import { createClient } from "supabase";
import { BanecoError, createBanecoClient, readCredentials, verifyBankStatus } from "./baneco.ts";
const base=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,publicKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const db=createClient(base,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info,x-micole-support','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
async function call<T>(client:typeof db,name:string,params:object):Promise<T>{const {data,error}=await client.rpc(name,params);if(error)throw new Error(error.message);return data as T;}
const safeError=(e:unknown)=>e instanceof BanecoError?e.code:'bank-operation-failed';
async function connection(version:string){const c=await call<{environment:'test'|'production';branchCode:string;credentials:unknown}>(db,'bank_private_connection',{p_version:version});return {bank:createBanecoClient(c.environment==='test'?'certification':'production',readCredentials(c.credentials)),branchCode:c.branchCode};}
async function generate(reservation:{id:string;generate:boolean;operationToken?:string}){
 if(!reservation.generate)return;
 const p={p_id:reservation.id,p_token:reservation.operationToken!};let qrId:string|null=null,image:string|null=null,attempted=false;
 // A losing/replayed claim must never finish or release another invocation’s reservation.
 const row=await call<{id:string;connectionId:string;transactionId:string;amount:number;currency:'BOB';dueDate:string;description:string}>(db,'bank_generation_context',p);
 try{
  const {bank,branchCode}=await connection(row.connectionId);
  attempted=true;
  const qr=await bank.generate({transactionId:row.transactionId,amount:Number(row.amount),currency:'BOB',dueDate:row.dueDate,description:row.description,branchCode});qrId=qr.qrId;image=qr.image;
  if(!await call<boolean>(db,'bank_finish_generation',{...p,p_qr_id:qrId,p_image:image}))throw new Error('bank-storage-unavailable');
 }catch(e){
  const before=!attempted||(e instanceof BanecoError && ['password-encryption','authentication','account-encryption'].includes(e.stage||''));
  const known=qrId||(e instanceof BanecoError?e.qrId:null)||null;
  await call(db,'bank_finish_generation',{...p,p_qr_id:known,p_image:image,p_error:safeError(e),p_before_generation:before}).catch(()=>{});
 }
}
type Claim={id:string;operationToken:string;connectionId:string;qrId:string;amount:number;currency:string;dueDate:string};
async function reconcile(row:Claim,cancel=false){
 const p={p_id:row.id,p_token:row.operationToken};
 try{
  const {bank,branchCode}=await connection(row.connectionId),expected={qrId:row.qrId,amount:Number(row.amount),currency:row.currency,branchCode,dueDate:row.dueDate};
  let response=await bank.status(row.qrId),status=verifyBankStatus(response,expected);
  if(cancel&&['pending','expired'].includes(status)){await bank.cancel(row.qrId);response=await bank.status(row.qrId);status=verifyBankStatus(response,expected);}
  const payment=Array.isArray(response.payment)?response.payment[0]:response.payment;
  await call(db,'bank_finish_reconciliation',{...p,p_status:status,p_transaction:status==='paid'?String((payment as Record<string,unknown>).transactionId):null});
 }catch(e){await call(db,'bank_finish_reconciliation',{...p,p_status:null,p_error:safeError(e)}).catch(()=>{});}
}
async function worker(id?:string,cancel=false){
 if(id){const row=await call<Claim|null>(db,'bank_claim_reconciliation',{p_id:id,p_cancel:cancel});if(row)await reconcile(row,cancel);return;}
 let n=0;const deadline=Date.now()+45000;
 await Promise.all(Array.from({length:3},async()=>{while(n<9&&Date.now()<deadline){n++;const row=await call<Claim|null>(db,'bank_claim_reconciliation',{});if(!row)return;await reconcile(row);}}));
}
async function equal(a:string|null,b:string|undefined){if(!a||!b)return false;const encode=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(a)),crypto.subtle.digest('SHA-256',encode.encode(b))]);return new Uint8Array(x).reduce((v,c,i)=>v|(c^new Uint8Array(y)[i]),0)===0;}
async function payload(req:Request,limit=24000){const reader=req.body?.getReader();if(!reader)throw new Error('invalid-input');const chunks:Uint8Array[]=[];let total=0;try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw new Error('invalid-input');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length;}return JSON.parse(new TextDecoder().decode(bytes));}
Deno.serve(async(req:Request)=>{
 const reply=(value:object,status=200)=>new Response(JSON.stringify(value),{status,headers:cors});
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return reply({error:'method-not-allowed'},405);
 const path=new URL(req.url).pathname;
 try{
  if(path.endsWith('/worker')){if(!await equal(req.headers.get('x-micole-bank-worker-key'),Deno.env.get('BANK_QR_WORKER_KEY')))return reply({error:'unauthorized'},401);await worker();return reply({ok:true});}
  if(path.endsWith('/notify')){let qr:string;try{const v=await payload(req,8192);qr=String(v?.payment?.qrId||'');}catch{return reply({ok:true});}await call(db,'bank_notify_hint',{p_qr_id:qr});return reply({ok:true});}
  const body=await payload(req);
  if(body.action==='link_generate'){
   const result=await call<{id:string;generate:boolean;operationToken?:string}>(db,'reserve_baneco_link',{p_token:String(body.token||''),p_invoice:body.invoice||{}});
   await generate(result);
   const c=await call<Record<string,unknown>>(db,'payment_link_context',{p_token:body.token});return reply({payment:c.bankPayment});
  }
  if(body.action==='link_refresh'||body.action==='link_cancel'){
   const c=await call<{bankPayment?:{id:string}}>(db,'payment_link_context',{p_token:body.token});
   if(c.bankPayment?.id)await worker(c.bankPayment.id,body.action==='link_cancel');
   const latest=await call<Record<string,unknown>>(db,'payment_link_context',{p_token:body.token});return reply({payment:latest.bankPayment});
  }
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply({error:'unauthorized'},401);
  const user=createClient(base,publicKey,{global:{headers:{Authorization:authorization,...(req.headers.get('x-micole-support')?{'x-micole-support':req.headers.get('x-micole-support')!}:{})}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error}=await user.auth.getUser(authorization.slice(7));if(error||!identity.user)return reply({error:'unauthorized'},401);
  if(body.action==='check_connection'){
   const version=await call<string>(user,'bank_management_context',{p_school_id:body.schoolId||null});
   try{const {bank}=await connection(version);await bank.checkConnection();await call(db,'bank_finish_connection_check',{p_version:version,p_ok:true});}
   catch(e){await call(db,'bank_finish_connection_check',{p_version:version,p_ok:false,p_error:safeError(e)});return reply({error:safeError(e)},400);}
   return reply({ok:true});
  }
  if(body.action==='generate'){
   const r=await call<{id:string;generate:boolean;operationToken?:string}>(user,'reserve_baneco_payment',{p_kind:body.kind,p_school_id:body.schoolId||null,p_student_id:body.studentId||null,p_items:body.items,p_invoice:body.invoice||{}});await generate(r);return reply({payment:await call<object>(user,'baneco_payment_context',{p_id:r.id})});
  }
  if(body.action==='refresh'||body.action==='cancel'){
   await call(user,'baneco_payment_context',{p_id:body.id});await worker(body.id,body.action==='cancel');return reply({payment:await call<object>(user,'baneco_payment_context',{p_id:body.id})});
  }
  return reply({error:'invalid-action'},400);
 }catch(e){
  // SQL messages here are deliberately curated; bank URLs, tokens, responses and
  // payer personal data never enter a response or a log.
  const message=e instanceof Error?e.message:'';
  const allowed=/^(Selecciona|No tienes|La cuenta Baneco|Los saldos|Revisa|Hay un QR|El enlace|Enlace de pago|En modo|En el modo|Completa|No repitas|El importe|Los docentes|Inicia sesión)/.test(message);
  return reply({error:allowed?message:safeError(e)},400);
 }
});
