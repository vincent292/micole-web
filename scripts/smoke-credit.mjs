import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),keys=['owner','director','mother','outsider','school','room','child','charge','charge2','receipt'],ids=Object.fromEntries(keys.map(k=>[k,randomUUID()])),suffix=randomUUID().slice(0,8),checks=[];
const q=(text,values=[])=>db.query({text,values,query_timeout:30000});db.on('error',()=>{});let serial=0;
function check(name,value){if(!value)throw new Error('Falló: '+name);checks.push(name);}
async function as(user,task,sid){const point=`test_scope_${++serial}`;await q(`savepoint ${point}`);await q('set local role authenticated');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[user,JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify(sid?{'x-micole-support':sid}:{})]);try{const r=await task();await q('reset role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true)");await q(`release savepoint ${point}`);return r;}catch(e){await q(`rollback to savepoint ${point}`);await q(`release savepoint ${point}`);throw e;}}
async function denied(user,task,sid){try{await as(user,task,sid);return false;}catch{return true;}}

async function server(task){const point=`bank_server_${++serial}`;await q(`savepoint ${point}`);await q('set local role service_role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true)");try{const result=await task();await q(`reset role;release savepoint ${point}`);return result;}catch(e){await q(`rollback to savepoint ${point};release savepoint ${point}`);throw e;}}
async function connection(school,actor){
 await as(actor,()=>q("select save_baneco_connection($1,'Verificación temporal','production','A1',$2::jsonb)",[school,JSON.stringify({userName:'FICTICIO',password:'FICTICIA',aesKey:'FICTICIA',accountCredit:'FICTICIA',encryptionMode:'bank_api'})]));
 const version=(await as(actor,()=>q('select bank_management_context($1) as value',[school]))).rows[0].value;
 await server(()=>q('select bank_finish_connection_check($1,true,null)',[version]));await as(actor,()=>q('select set_baneco_enabled($1,true)',[school]));return version;
}
try{
 await db.connect();await q("set statement_timeout='25s'");await q('begin');
 if(process.argv.includes('--preview'))for(const file of ['202610190001_platform_credit.sql','202610190002_pickup_identity.sql','202610190003_demo_requests.sql'])await q(fs.readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 for(const k of ['owner','director','mother','outsider'])await q("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),jsonb_build_object('full_name','Verificación temporal de crédito'))",[ids[k],`${k}-${suffix}@example.invalid`]);
 await q('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[`owner-${suffix}@example.invalid`]);await q('insert into platform_admins(user_id) values($1)',[ids.owner]);
 await q("insert into schools(id,name,slug,status) values($1,'Verificación temporal de crédito',$2,'active')",[ids.school,`credit-${suffix}`]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director')",[ids.school,ids.director]);
 await q("insert into classrooms(id,school_id,name,capacity) values($1,$2,'Aula temporal',40)",[ids.room,ids.school]);
 await q('insert into school_operation_settings(school_id,require_annual_materials) values($1,false)',[ids.school]);
 await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email) values($1,$2,$3,'Alumno','Temporal','active',true,'Madre',$4)",[ids.child,ids.school,ids.room,`mother-${suffix}@example.invalid`]);await as(ids.mother,()=>q('select workspace_identity()'));
 const account=async()=>(await as(ids.director,()=>q('select platform_credit_account($1) as value',[ids.school]))).rows[0].value;
 check('Crédito inicial obligatorio',(await account()).initialPaid===false&&(await account()).balance===0);
 check('Uso académico pendiente bloqueado',await denied(ids.director,()=>q('select school_workspace($1,current_date,current_date)',[ids.school])));
 check('Activación efectiva apagada',(await as(ids.owner,()=>q('select platform_tariffs(null) as value'))).rows[0].value.activationFee===0);
 const charge=(await q("select id from platform_charges where school_id=$1 and kind='credit_topup'",[ids.school])).rows[0].id;
 check('Nadie registra el adelanto manualmente',await denied(ids.owner,()=>q("select record_platform_payment($1,'cash','NO-PERMITIDO')",[charge])));
 await connection(null,ids.owner);
 const r=(await as(ids.director,()=>q("select reserve_baneco_payment('platform',$1,null,$2::jsonb,'{}') as value",[ids.school,JSON.stringify([{chargeId:charge,amount:500}])]))).rows[0].value;
 await server(()=>q('select bank_finish_generation($1,$2,$3,$4,null,false)',[r.id,r.operationToken,`TEMP-${suffix}`,'data:image/png;base64,iVBORw0KGgo=']));
 const job=(await server(()=>q('select bank_claim_reconciliation($1,false) as value',[r.id]))).rows[0].value;
 await server(()=>q("select bank_finish_reconciliation($1,$2,'paid',$3,null)",[r.id,job.operationToken,`TEMPORAL-CREDITO-${suffix}`]));
 let a=await account();check('Banco confirmado habilita y descuenta primera licencia',a.initialPaid&&a.balance===471);
 await q('select aulanexo_private.apply_baneco_payment($1)',[r.id]);check('Confirmación repetida no duplica crédito',(await account()).balance===471);
 for(let i=0;i<16;i++)await q("insert into students(school_id,classroom_id,first_name,last_name,status,enrolled_at) values($1,$2,'Licencia','Temporal','active',current_date)",[ids.school,ids.room]);
 check('17 licencias dejan siete bolivianos',(await account()).balance===7);
 await q("insert into students(school_id,classroom_id,first_name,last_name,status,enrolled_at) values($1,$2,'Licencia 18','Temporal','active',current_date)",[ids.school,ids.room]);
 check('Crédito parcial conserva cuota y saldo',(await q("select amount,credit_applied from platform_charges where school_id=$1 and kind='license' and credit_applied=7",[ids.school])).rows.some(c=>c.amount==='29.00'&&c.credit_applied==='7.00'));
 check('Historial cifrado con pgcrypto',(await q("select bool_and(position(encode(convert_to('balanceCents','UTF8'),'hex') in encode(payload,'hex'))=0) as ok from aulanexo_private.platform_credit_ledger where school_id=$1",[ids.school])).rows[0].ok);
 check('Cliente no puede editar registros privados',await denied(ids.owner,()=>q('update aulanexo_private.platform_credit_accounts set initial_paid_at=null where school_id=$1',[ids.school])));
 const requestId=randomUUID();const prepared=(await as(ids.mother,()=>q("select reserve_pickup_identity($1,$2,'ci-ficticio.jpg','image/jpeg',50) as value",[requestId,ids.child]))).rows[0].value;
 const file=(await q('select * from pickup_identity_files where id=$1',[prepared.id])).rows[0];
 await server(()=>q("select finish_pickup_identity($1,50,'image/jpeg',$2)",[file.id,`${ids.school}/pickups/${requestId}/${file.id}/snapshot.jpg`]));
 await as(ids.mother,()=>q("insert into family_requests(id,school_id,student_id,type,request_date,reason,pickup_name,pickup_id,pickup_file_id) values($1,$2,$3,'pickup',current_date,'Autorización temporal','Persona Ficticia','1234567',$4)",[requestId,ids.school,ids.child,file.id]));
 check('CI restringido a familia y personal autorizado',(await as(ids.director,()=>q('select may_read_pickup_identity($1) as ok',[file.id]))).rows[0].ok&&!(await as(ids.outsider,()=>q('select may_read_pickup_identity($1) as ok',[file.id]))).rows[0].ok);
 await as(ids.director,()=>q("update family_requests set status='approved',response='Revisado' where id=$1",[requestId]));await as(ids.director,()=>q("select confirm_pickup_identity($1,'Documento comparado presencialmente')",[requestId]));
 check('Entrega registra al personal real',(await q('select pickup_verified_by from family_requests where id=$1',[requestId])).rows[0].pickup_verified_by===ids.director);
 const lead=(await server(()=>q('select submit_demo_request($1,$2::jsonb,$3) as id',[randomUUID(),JSON.stringify({schoolName:'Institución Temporal',contactName:'Contacto Ficticio',email:'temporal@example.invalid',phone:'70000000',city:'La Paz',consent:true}),'c'.repeat(64)]))).rows[0].id;
 check('Solicitud comercial llega solo al propietario',(await as(ids.owner,()=>q('select id from demo_requests where id=$1',[lead]))).rowCount===1&&(await as(ids.director,()=>q('select id from demo_requests where id=$1',[lead]))).rowCount===0);
 await q('rollback');check('Todo lo temporal quedó revertido',(await q('select id from auth.users where id=$1',[ids.owner])).rowCount===0);
 console.log(JSON.stringify({ok:true,rolledBack:true,checks,bankCalls:false,paymentsMade:false,secretsPrinted:false}));
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
