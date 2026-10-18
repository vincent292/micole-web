import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient();let temporary;
async function cli(args){
 const binary=process.env.MICOLE_SUPABASE_CLI;
 return new Promise((resolve,reject)=>{const child=spawn(binary||'npx',[...(binary?[]:['--yes','supabase']),...args],{stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});let output='';child.stdout.on('data',b=>{output+=b.toString();});child.stderr.on('data',b=>{output+=b.toString();});const timer=setTimeout(()=>{try{process.kill(process.platform==='win32'?child.pid:-child.pid,'SIGKILL');}catch{}reject(new Error('La CLI de Supabase agotó el tiempo; no se imprimieron credenciales.'));},120000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('CLI: '+output.split('\n').map(line=>line.includes('private_key')?'[detalle secreto omitido]':line.replace(/sbp_[A-Za-z0-9_]+/g,'[token omitido]').replace(/[A-Za-z0-9+_\/=-]{40,}/g,'[valor omitido]')).slice(-8).join(' ').slice(0,1200)));});});
}
try{
 if(!process.argv.includes('--apply'))throw new Error('Ejecuta con --apply después de aplicar las migraciones Baneco.');
 const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
 const projectUrl=`https://${ref}.supabase.co`;
 await db.connect();
 if(!(await db.query("select 1 from supabase_migrations.schema_migrations where version='202610170008'")).rowCount)throw new Error('Primero aplica las migraciones de Baneco.');
 const previous=await db.query("select decrypted_secret from vault.decrypted_secrets where name='micole_bank_worker_key'");
 const workerKey=previous.rows[0]?.decrypted_secret||crypto.randomBytes(32).toString('hex');
 temporary=fs.mkdtempSync(path.join(os.tmpdir(),'micole-bank-worker-'));fs.chmodSync(temporary,0o700);
 const envFile=path.join(temporary,'server.env');fs.writeFileSync(envFile,`BANK_QR_WORKER_KEY=${workerKey}\n`,{mode:0o600});
 console.log(JSON.stringify({phase:'guardando_clave_privada_worker'}));
 await cli(['secrets','set','--env-file',envFile,'--project-ref',ref]);
 console.log(JSON.stringify({phase:'desplegando_bank_qr'}));
 await cli(['functions','deploy','bank-qr','--project-ref',ref,'--use-api','--no-verify-jwt','--yes']);
 await db.query('begin');
 for(const [name,value] of [['micole_bank_worker_key',workerKey],['micole_bank_project_url',projectUrl]]){
  const result=await db.query('select id from vault.secrets where name=$1',[name]);
  if(result.rowCount)await db.query('select vault.update_secret($1,$2,$3)',[result.rows[0].id,value,name]);else await db.query('select vault.create_secret($1,$2)',[value,name]);
 }
 if(!(await db.query("select 1 from pg_extension where extname='pg_net'")).rowCount)await db.query('create extension pg_net with schema extensions');
 if(!(await db.query("select 1 from pg_extension where extname='pg_cron'")).rowCount)await db.query('create extension pg_cron with schema pg_catalog');
 await db.query('select cron.schedule($1,$2,$3)',['micole-bank-qr-dispatch','* * * * *','select aulanexo_private.dispatch_bank_qr_worker();']);
 await db.query('commit');
 const response=await fetch(`${projectUrl}/functions/v1/bank-qr/worker`,{method:'POST',headers:{'Content-Type':'application/json','x-micole-bank-worker-key':workerKey},body:'{}',signal:AbortSignal.timeout(60000)});
 const report=await response.json();if(!response.ok||report.ok!==true)throw new Error('El worker bancario requiere revisión.');
 console.log(JSON.stringify({ok:true,worker:report,jobs:(await db.query("select jobname,schedule,active from cron.job where jobname='micole-bank-qr-dispatch'")).rows,secretsPrinted:false}));
}catch(e){await db.query('rollback').catch(()=>{});reportFailure(e);}finally{if(temporary)fs.rmSync(temporary,{recursive:true,force:true});await db.end();}
