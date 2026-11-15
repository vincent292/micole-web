import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {loadEnv} from 'vite';
import {databaseClient, reportFailure} from './database.mjs';
const apply=process.argv.includes('--apply'),db=databaseClient();
const migrations=[['20261115145142','school_whatsapp_pilot'],['20261115153201','school_whatsapp_rpc_boundary']];
const sourceIndex=process.argv.indexOf('--source');
const source=sourceIndex>=0?loadEnv('production',path.resolve(process.argv[sourceIndex+1]),''):process.env;
const required=['META_APP_ID','META_APP_SECRET','META_WHATSAPP_CONFIG_ID'];
const ready=required.every(k=>!!source[k]);
const cli=process.env.MICOLE_SUPABASE_CLI||'supabase';
let temporary;
function run(args){try{execFileSync(cli,args,{stdio:['ignore','pipe','pipe'],timeout:120000});}catch(error){fs.mkdirSync('tmp/whatsapp',{recursive:true});fs.writeFileSync('tmp/whatsapp/deploy-private.log',String(error.stderr||'')+'\n'+String(error.stdout||''),{mode:0o600});throw Error('La CLI no completó '+args.slice(0,2).join(' ')+'. Revisa el log privado local; no se imprimieron secretos.');}}
async function vault(name,value){const existing=await db.query('select id from vault.secrets where name=$1',[name]);if(existing.rowCount)await db.query('select vault.update_secret($1,$2,$3)',[existing.rows[0].id,value,name]);else await db.query('select vault.create_secret($1,$2)',[value,name]);}
try{
 await db.connect();await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
 const history=new Set((await db.query('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version));
 const previous=fs.readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&f.split('_')[0]<migrations[0][0]).map(f=>f.split('_')[0]);
 if(previous.some(v=>!history.has(v)))throw Error('Hay migraciones anteriores pendientes. Revísalas antes del piloto de WhatsApp.');
 for(const [version,name] of migrations){if(!history.has(version)){const sql=fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');await db.query(sql);if(apply)await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,name,[sql]]);}}
 const pilot=(await db.query("select s.name,s.site_name from schools s where aulanexo_private.whatsapp_enabled(s.id) order by s.name,s.site_name")).rows;
 if(!apply){await db.query('rollback');console.log(JSON.stringify({ok:true,applied:false,metaSetupReady:ready,institutions:pilot,secretsPrinted:false}));}
 else{
  if(!ready)throw Error('Configura META_APP_ID, META_APP_SECRET y META_WHATSAPP_CONFIG_ID, o indica el checkout existente con --source.');
  await db.query('commit');await db.query("notify pgrst,'reload schema'");
  const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
  const values={};
  for(const [key,vaultName] of [['WHATSAPP_CREDENTIALS_KEY','micole_whatsapp_credentials_key'],['WHATSAPP_VERIFY_TOKEN','micole_whatsapp_verify_token'],['WHATSAPP_WORKER_KEY','micole_whatsapp_worker_key']]){
   const existing=await db.query('select decrypted_secret from vault.decrypted_secrets where name=$1',[vaultName]);values[key]=existing.rows[0]?.decrypted_secret||crypto.randomBytes(32).toString(key==='WHATSAPP_CREDENTIALS_KEY'?'base64':'hex');await vault(vaultName,values[key]);
  }
  for(const key of required)values[key]=source[key];
  values.META_GRAPH_API_VERSION=source.META_GRAPH_API_VERSION||'v26.0';
  values.WHATSAPP_FORBIDDEN_PHONE_IDS=source.WHATSAPP_PHONE_NUMBER_ID||'';
  values.WHATSAPP_APP_ORIGINS='https://www.micole.click,https://micole.click,https://micole-web.vercel.app,http://localhost:5173,http://localhost:5175,http://127.0.0.1:5175';
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'micole-whatsapp-'));fs.chmodSync(temporary,0o700);
  const secretFile=path.join(temporary,'server.env');fs.writeFileSync(secretFile,Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
  run(['secrets','set','--env-file',secretFile,`--remote=${ref}`,'--yes']);console.log(JSON.stringify({phase:'server_secrets_ready',secretsPrinted:false}));
  run(['functions','deploy','whatsapp-crm','whatsapp-webhook',`--remote=${ref}`,'--use-api','--yes']);console.log(JSON.stringify({phase:'functions_deployed'}));
  await vault('micole_whatsapp_project_url',`https://${ref}.supabase.co`);
  await db.query('select cron.schedule($1,$2,$3)',['micole-whatsapp-outbox','* * * * *','select aulanexo_private.dispatch_whatsapp_worker();']);
  const health=await fetch(`https://${ref}.supabase.co/functions/v1/whatsapp-crm`,{method:'POST',headers:{'content-type':'application/json','x-micole-worker-key':values.WHATSAPP_WORKER_KEY},body:JSON.stringify({action:'worker',health:true}),signal:AbortSignal.timeout(30000)});
  if(!health.ok||(await health.json()).ok!==true)throw Error('El worker desplegado requiere revisión.');
  const hook=await fetch(`https://${ref}.supabase.co/functions/v1/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(values.WHATSAPP_VERIFY_TOKEN)}&hub.challenge=micole-pilot-ready`,{signal:AbortSignal.timeout(30000)});
  if(!hook.ok||await hook.text()!=='micole-pilot-ready')throw Error('El webhook no confirmó la verificación.');
  console.log(JSON.stringify({ok:true,applied:true,institutions:pilot,workerHealthy:true,webhookVerified:true,automaticDefault:false,secretsPrinted:false}));
 }
}catch(error){await db.query('rollback').catch(()=>{});reportFailure(error);}finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});await db.end();}
