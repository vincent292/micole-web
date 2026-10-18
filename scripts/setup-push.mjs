import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {databaseClient,reportFailure} from './database.mjs';
const apply=process.argv.includes('--apply'),db=databaseClient();
const accountPath=process.env.MICOLE_FIREBASE_SERVICE_ACCOUNT||path.join(os.homedir(),'.config/micole/firebase-service-account.json');
const migrations=[['202610160001','android_push'],['202610160002','push_device_test']];
let temporary;
async function cli(args){
 const binary=process.env.MICOLE_SUPABASE_CLI;
 return new Promise((resolve,reject)=>{const child=spawn(binary||'npx',[...(binary?[]:['--yes','supabase']),...args],{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});let output='';child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{output+=b.toString();});const timer=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}reject(new Error('La CLI de Supabase agotó el tiempo; no se imprimieron credenciales.'));},120000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('CLI: '+output.split('\n').map(line=>line.includes('private_key')?'[detalle secreto omitido]':line.replace(/sbp_[A-Za-z0-9_]+/g,'[token omitido]').replace(/[A-Za-z0-9+_\/=-]{40,}/g,'[valor omitido]')).slice(-8).join(' ').slice(0,1200)));});});
}
try{
 const service=JSON.parse(fs.readFileSync(accountPath,'utf8'));
 if(service.type!=='service_account'||!service.private_key||!service.client_email||service.project_id!=='micolegio-c0290')throw new Error('La cuenta de servicio no coincide con Firebase MiCole.');
 const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
 const projectUrl=`https://${ref}.supabase.co`;
 await db.connect();
 await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
 for(const [version,name] of migrations){
  const applied=(await db.query('select 1 from supabase_migrations.schema_migrations where version=$1',[version])).rowCount>0;
  if(!applied){const sql=fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');await db.query(sql);await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,name,[sql]]);}
 }
 if(!apply){await db.query('rollback');console.log(JSON.stringify({ok:true,applied:false,migrationValid:true,firebaseProject:service.project_id}));}
 else{
  await db.query('commit');await db.query("notify pgrst,'reload schema'");
  const previous=await db.query("select decrypted_secret from vault.decrypted_secrets where name='micole_push_worker_key'");
  const workerKey=previous.rows[0]?.decrypted_secret||crypto.randomBytes(32).toString('hex');
  temporary=fs.mkdtempSync(path.join(os.tmpdir(),'micole-push-secrets-'));fs.chmodSync(temporary,0o700);
  const envFile=path.join(temporary,'server.env');fs.writeFileSync(envFile,`FIREBASE_SERVICE_ACCOUNT=${JSON.stringify(service)}\nPUSH_WORKER_KEY=${workerKey}\n`,{mode:0o600});
  console.log(JSON.stringify({phase:'guardando_secretos_firebase'}));
  await cli(['secrets','set','--env-file',envFile,'--project-ref',ref]);
  console.log(JSON.stringify({phase:'desplegando_push_dispatch'}));
  await cli(['functions','deploy','push-dispatch','--project-ref',ref,'--use-api','--no-verify-jwt','--yes']);
  console.log(JSON.stringify({phase:'programando_recordatorios'}));
  await db.query('begin');
  for(const [name,value] of [['micole_push_worker_key',workerKey],['micole_push_project_url',projectUrl]]){
   const result=await db.query('select id from vault.secrets where name=$1',[name]);
   if(result.rowCount)await db.query('select vault.update_secret($1,$2,$3)',[result.rows[0].id,value,name]);else await db.query('select vault.create_secret($1,$2)',[value,name]);
  }
  if(!(await db.query("select 1 from pg_extension where extname='pg_net'")).rowCount)await db.query('create extension pg_net with schema extensions');
  if(!(await db.query("select 1 from pg_extension where extname='pg_cron'")).rowCount)await db.query('create extension pg_cron with schema pg_catalog');
  await db.query('select cron.schedule($1,$2,$3)',['micole-push-dispatch','* * * * *','select aulanexo_private.dispatch_push_worker();']);
  await db.query('select cron.schedule($1,$2,$3)',['micole-push-reminders','0 12 * * *','select aulanexo_private.send_birthday_reminders(); select aulanexo_private.send_payment_reminders();']);
  await db.query('select cron.schedule($1,$2,$3)',['micole-push-cleanup','25 4 * * *','select aulanexo_private.prune_push_history();']);
  await db.query('commit');
  const response=await fetch(`${projectUrl}/functions/v1/push-dispatch`,{method:'POST',headers:{'Content-Type':'application/json','x-micole-worker-key':workerKey},body:JSON.stringify({health:true}),signal:AbortSignal.timeout(100000)});const report=await response.json();
  if(!response.ok||report.ok!==true)throw new Error(`El worker requiere revisión: ${report.error||response.status}`);
  console.log(JSON.stringify({ok:true,applied:true,firebaseProject:service.project_id,worker:report,jobs:(await db.query("select jobname,schedule,active from cron.job where jobname like 'micole-push-%'")).rows,secretsPrinted:false}));
 }
}catch(e){await db.query('rollback').catch(()=>{});reportFailure(e);}finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});await db.end();}
