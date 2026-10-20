import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient();
try{
 await db.connect();
 const migrated=(await db.query("select exists(select 1 from supabase_migrations.schema_migrations where version='202610200002') as applied")).rows[0].applied;
 const permissions=(await db.query("select has_function_privilege('authenticated','public.read_announcement(uuid,boolean)','execute') as personal_confirmation,not has_table_privilege('authenticated','public.announcement_receipts','update') as receipts_protected,not has_function_privilege('authenticated','public.claim_push_deliveries(integer)','execute') as worker_protected,not has_function_privilege('anon','public.pending_announcements(uuid)','execute') as private_notices")).rows[0];
 const cron=(await db.query("select exists(select 1 from cron.job where jobname='micole-push-dispatch' and active and schedule='* * * * *') as active")).rows[0].active;
 const settings=(await db.query('select quiet_hours,critical_when_unpaid from aulanexo_private.announcement_settings')).rows[0];
 const values=(await db.query("select name,decrypted_secret from vault.decrypted_secrets where name in ('micole_push_project_url','micole_push_worker_key')")).rows;
 const get=name=>values.find(value=>value.name===name)?.decrypted_secret;
 let firebase=false;
 if(get('micole_push_project_url')&&get('micole_push_worker_key')){
  const response=await fetch(`${get('micole_push_project_url')}/functions/v1/push-dispatch`,{method:'POST',headers:{'Content-Type':'application/json','x-micole-worker-key':get('micole_push_worker_key')},body:JSON.stringify({health:true}),signal:AbortSignal.timeout(30000)});
  const result=await response.json();firebase=response.ok&&result.ok===true&&result.firebaseAuthenticated===true;
 }
 const ok=migrated&&Object.values(permissions).every(Boolean)&&cron&&settings.quiet_hours&&settings.critical_when_unpaid&&firebase;
 console.log(JSON.stringify({ok,migrated,permissions,minuteWorkerActive:cron,quietHoursEnabled:settings.quiet_hours,criticalNoticesWithDebt:settings.critical_when_unpaid,firebaseAuthenticated:firebase,testNotificationsSent:0,secretsPrinted:false}));
 if(!ok)process.exitCode=1;
}catch(e){reportFailure(e);}finally{await db.end();}
