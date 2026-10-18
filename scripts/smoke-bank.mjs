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
 for(const k of ['owner','director','mother','outsider'])await q("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),jsonb_build_object('full_name','Verificación temporal de pagos'))",[ids[k],`${k}-${suffix}@example.invalid`]);
 await q('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[`owner-${suffix}@example.invalid`]);await q('insert into platform_admins(user_id) values($1)',[ids.owner]);
 await q("insert into schools(id,name,slug,status) values($1,'Verificación temporal de cobros',$2,'active')",[ids.school,`bank-${suffix}`]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director')",[ids.school,ids.director]);
 await q("insert into classrooms(id,school_id,name) values($1,$2,'Aula temporal')",[ids.room,ids.school]);
 await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Alumno','Temporal','active',true,'Madre',$4,'Padre','padre@example.invalid','2017-01-01')",[ids.child,ids.school,ids.room,`mother-${suffix}@example.invalid`]);
 await as(ids.mother,()=>q('select workspace_identity()'));
 await q("insert into school_charges(id,school_id,student_id,concept,due_date,amount,status,minimum_access_ratio) values($1,$2,$3,'Cuota temporal',CURRENT_DATE,500,'pending',0.5),($4,$2,$3,'Otra cuota temporal',CURRENT_DATE,500,'pending',1)",[ids.charge,ids.school,ids.child,ids.charge2]);
 const platformVersion=await connection(null,ids.owner),schoolVersion=await connection(ids.school,ids.director);
 check('Cuentas de MiCole e institución independientes',platformVersion!==schoolVersion);
 const status=(await as(ids.director,()=>q('select payment_connection_status($1) as value',[ids.school]))).rows[0].value;
 check('Estado público sin credenciales',status.integrationReady&&!JSON.stringify(status).includes('FICTICIA'));
 check('Familia no administra el banco',await denied(ids.mother,()=>q('select bank_management_context($1)',[ids.school])));
 check('Dirección no extrae secretos por RPC',await denied(ids.director,()=>q('select bank_private_connection($1)',[schoolVersion])));
 const items=JSON.stringify([{chargeId:ids.charge,amount:250}]);
 const r=(await as(ids.mother,()=>q("select reserve_baneco_payment('school',$1,$2,$3::jsonb,$4::jsonb) as value",[ids.school,ids.child,items,JSON.stringify({invoiceName:'Familia temporal',invoiceNit:'1234567',invoicePhone:'70000000'})]))).rows[0].value;
 const context=(await server(()=>q('select bank_generation_context($1,$2) as value',[r.id,r.operationToken]))).rows[0].value;check('Total autorizado calculado en SQL',context.amount===250&&context.connectionId===schoolVersion);
 const again=(await as(ids.mother,()=>q("select reserve_baneco_payment('school',$1,$2,$3::jsonb,$4::jsonb) as value",[ids.school,ids.child,items,JSON.stringify({invoiceName:'Familia temporal',invoiceNit:'1234567',invoicePhone:'70000000'})]))).rows[0].value;
 check('Repetir solicitud conserva QR',again.id===r.id&&!again.generate);
 check('Efectivo no compite con QR activo',await denied(ids.director,()=>q("select checkout_school_payment($1,$2,$3::jsonb,'cash','TEMPORAL','{}',false)",[ids.receipt,ids.child,items])));
 await server(()=>q('select bank_finish_generation($1,$2,$3,$4,null,false)',[r.id,r.operationToken,`TEMP-${suffix}`,'data:image/png;base64,iVBORw0KGgo=']));
 const job=(await server(()=>q('select bank_claim_reconciliation($1,false) as value',[r.id]))).rows[0].value;
 check('Cliente no puede confirmar dinero',await denied(ids.mother,()=>q("select bank_finish_reconciliation($1,$2,'paid','FALSO',null)",[r.id,job.operationToken])));
 await server(()=>q("select bank_finish_reconciliation($1,$2,'paid',$3,null)",[r.id,job.operationToken,`TEMPORAL-${suffix}`]));
 const done=(await as(ids.mother,()=>q('select baneco_payment_context($1) as value',[r.id]))).rows[0].value;check('Aplicación de abono con recibo bancario',done.status==='paid'&&done.applicationStatus==='applied'&&(await q('select paid_amount from school_charges where id=$1',[ids.charge])).rows[0].paid_amount==='250.00');
 check('Factura solicitada por importe recibido',(await q('select amount,requested_by from invoice_requests where receipt_id=$1',[r.id])).rows.some(v=>v.amount==='250.00'&&v.requested_by===ids.mother));
 const token=(await as(ids.director,()=>q('select create_payment_link($1,$2::jsonb) as value',[ids.child,JSON.stringify([{chargeId:ids.charge2,amount:100}])]))).rows[0].value;
 const linked=(await server(()=>q("select reserve_baneco_link($1,'{}') as value",[token]))).rows[0].value;check('Servidor de enlaces autoriza importes ligados al token',linked.generate===true);
 check('No hay funciones bancarias de confirmación públicas',(await q("select has_function_privilege('anon','public.bank_finish_reconciliation(uuid,uuid,text,text,text)','execute') as allowed")).rows[0].allowed===false);
 await q('rollback');check('Datos y credenciales temporales revertidos',(await q('select id from auth.users where id=$1',[ids.owner])).rowCount===0);
 console.log(JSON.stringify({ok:true,rolledBack:true,checks,bankCalls:false,paymentsMade:false,secretsPrinted:false}));
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
