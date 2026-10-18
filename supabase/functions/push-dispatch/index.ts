import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {deliveryResult,equalSecret,firebaseMessage,type Delivery} from './core.ts';
type ServiceAccount={project_id:string;client_email:string;private_key:string;type:string};
const bytesToBase64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const base64url=(value:string)=>btoa(value).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let cached:{token:string;expires:number}|null=null;
async function firebaseAccess(account:ServiceAccount){
 if(cached&&cached.expires>Date.now()+60000)return cached.token;
 const now=Math.floor(Date.now()/1000),encoder=new TextEncoder();
 const header=base64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
 const claims=base64url(JSON.stringify({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
 const pem=account.private_key.replace(/-----[^-]+-----/g,'').replace(/\s/g,'');
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(pem),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(`${header}.${claims}`));
 const jwt=`${header}.${claims}.${bytesToBase64(new Uint8Array(signature)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}`;
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt}),signal:AbortSignal.timeout(15000)});
 const data=await response.json();if(!response.ok||!data.access_token)throw new Error('firebase_auth_unavailable');
 cached={token:data.access_token,expires:Date.now()+Math.min(Number(data.expires_in)||3600,3600)*1000};return cached.token;
}
Deno.serve(async(req:Request)=>{
 const reply=(body:object,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 const key=Deno.env.get('PUSH_WORKER_KEY');
 if(req.method!=='POST')return reply({error:'method_not_allowed'},405);
 if(!key||!await equalSecret(req.headers.get('x-micole-worker-key'),key))return reply({error:'unauthorized'},401);
 let account:ServiceAccount;
 try{account=JSON.parse(Deno.env.get('FIREBASE_SERVICE_ACCOUNT')||'');if(account.type!=='service_account'||!account.project_id||!account.private_key||!account.client_email)throw Error();}catch{return reply({error:'firebase_not_configured'},503);}
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const call=async<T>(name:string,params:object):Promise<T>=>{const {data,error}=await db.rpc(name,params);if(error)throw new Error('push_database_unavailable');return data as T;};
 try{
  const request=await req.json().catch(()=>({}));
  if(request.health===true){await firebaseAccess(account);return reply({ok:true,firebaseAuthenticated:true});}
  const jobs=await call<Array<{id:string;lease:string}>>('claim_push_deliveries',{p_limit:40});
  const counts={claimed:jobs.length,sent:0,discarded:0,retried:0,failed:0};
  if(jobs.length===0)return reply({ok:true,...counts});
  let token:string;try{token=await firebaseAccess(account);}catch{for(const job of jobs)await call('finish_push_delivery',{p_id:job.id,p_lease:job.lease,p_result:'retry',p_error:'firebase_auth_unavailable'});return reply({error:'firebase_auth_unavailable'},503);}
  for(let index=0;index<jobs.length;index+=5)await Promise.all(jobs.slice(index,index+5).map(async job=>{
   const item=await call<Delivery|null>('prepare_push_delivery',{p_id:job.id,p_lease:job.lease});if(!item){counts.discarded++;return;}
   let outcome:{result:'sent'|'retry'|'invalid'|'failed';code:string};
   try{const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(firebaseMessage(item)),signal:AbortSignal.timeout(10000)});let payload:unknown;try{payload=await response.json();}catch{payload={};}outcome=deliveryResult(response.status,payload);}
   catch{outcome={result:'retry',code:'network_timeout'};}
   await call('finish_push_delivery',{p_id:job.id,p_lease:job.lease,p_result:outcome.result,p_error:outcome.code||null});
   if(outcome.result==='sent')counts.sent++;else if(outcome.result==='retry')counts.retried++;else counts.failed++;
  }));
  return reply({ok:true,...counts});
 }catch(e){const error=e instanceof Error&&['firebase_auth_unavailable','push_database_unavailable'].includes(e.message)?e.message:'push_worker_unavailable';return reply({error},503);}
});
