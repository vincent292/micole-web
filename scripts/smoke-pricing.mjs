import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),keys=['owner','director','mother','outsider','school','room','child','charge','charge2','receipt'],ids=Object.fromEntries(keys.map(k=>[k,randomUUID()])),suffix=randomUUID().slice(0,8),checks=[];
const q=(text,values=[])=>db.query({text,values,query_timeout:30000});db.on('error',()=>{});let serial=0;
function check(name,value){if(!value)throw new Error('Falló: '+name);checks.push(name);}
async function as(user,task,sid){const point=`test_scope_${++serial}`;await q(`savepoint ${point}`);await q('set local role authenticated');await q("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.headers',$3,true)",[user,JSON.stringify({sub:user,role:'authenticated'}),JSON.stringify(sid?{'x-micole-support':sid}:{})]);try{const r=await task();await q('reset role');await q("select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),set_config('request.headers','{}',true)");await q(`release savepoint ${point}`);return r;}catch(e){await q(`rollback to savepoint ${point}`);await q(`release savepoint ${point}`);throw e;}}
async function denied(user,task,sid){try{await as(user,task,sid);return false;}catch{return true;}}


try{
 await db.connect();await q("set statement_timeout='25s'");await q('begin');
 for(const k of ['owner','director','mother','outsider'])await q("insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),jsonb_build_object('full_name','Verificación temporal de precios'))",[ids[k],`${k}-${suffix}@example.invalid`]);
 await q('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[`owner-${suffix}@example.invalid`]);await q('insert into platform_admins(user_id) values($1)',[ids.owner]);
 await q("insert into schools(id,name,slug,status) values($1,'Verificación temporal de precios',$2,'active')",[ids.school,`price-${suffix}`]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director')",[ids.school,ids.director]);
 await q("insert into classrooms(id,school_id,name) values($1,$2,'Aula temporal')",[ids.room,ids.school]);
 await q('insert into school_operation_settings(school_id,require_annual_materials) values($1,false)',[ids.school]);
 check('Dirección no modifica tarifas de MiCole',await denied(ids.director,()=>q("select save_platform_tariffs($1,60,35,'Cambio sin permiso',false)",[ids.school])));
 await as(ids.owner,()=>q("select save_platform_tariffs($1,60,35,'Acuerdo temporal de prueba',false)",[ids.school]));
 const fees=(await as(ids.director,()=>q('select platform_tariffs($1) as value',[ids.school]))).rows[0].value;check('Tarifas específicas de institución',fees.activationFee===60&&fees.monthlyLicenseFee===35&&!fees.inherited);
 const student={id:ids.child,school_id:ids.school,classroom_id:ids.room,first_name:'Alumno',last_name:'Temporal',birth_date:'2017-01-01',identity_number:'7654321',mother_name:'Madre',mother_email:`mother-${suffix}@example.invalid`,father_name:'Padre',father_email:`father-${suffix}@example.invalid`,monthly_fee:400,activation_fee_quote:60};
 const plan={id:ids.receipt,school_id:ids.school,student_id:ids.child,start_date:'2030-01-01',months:3,monthly_fee:400,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false,license_fee:35};
 await as(ids.director,()=>q('select enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(student),JSON.stringify(plan)]));
 check('Activación emitida según tarifa',(await q('select amount from platform_charges where student_id=$1',[ids.child])).rows[0].amount==='60.00');
 const charges=(await q('select id,amount,license_amount from school_charges where student_id=$1 order by due_date',[ids.child])).rows;check('Mensualidades con licencia vigente',charges.length===3&&charges.every(c=>c.amount==='435.00'&&c.license_amount==='35.00'));
 await as(ids.owner,()=>q("select save_platform_tariffs($1,40,15,'Nueva tarifa solo para emisiones futuras',false)",[ids.school]));
 await as(ids.director,()=>q("select adjust_plan_discount($1,100,'2030-01-01','2030-12-31')",[ids.receipt]));
 await as(ids.director,()=>q("select set_student_fees($1,200,10,0,'Acuerdo para siguientes cuotas')",[ids.child]));
 check('Precios y descuentos no reducen cuotas emitidas',(await q('select amount from school_charges where student_id=$1',[ids.child])).rows.every(c=>c.amount==='435.00'));
 check('Rebaja de cuota rechazada',await denied(ids.director,()=>q("select increase_issued_charge('school',$1,300,'Solicitud de rebaja')",[charges[0].id])));
 await as(ids.director,()=>q("select checkout_school_payment($1,$2,$3::jsonb,'cash','TEMPORAL-PRECIOS','{}',false)",[ids.charge,ids.child,JSON.stringify([{chargeId:charges[0].id,amount:200}])]));
 const partial=(await q('select amount,paid_amount,status from school_charges where id=$1',[charges[0].id])).rows[0];check('Abono conserva importe y saldo',partial.amount==='435.00'&&partial.paid_amount==='200.00'&&partial.status==='pending');
 await as(ids.director,()=>q("select increase_issued_charge('school',$1,450,'Corrección acordada de importe')",[charges[0].id]));
 check('Incremento con motivo conserva abonos',(await q('select amount,paid_amount from school_charges where id=$1',[charges[0].id])).rows.some(c=>c.amount==='450.00'&&c.paid_amount==='200.00'));
 const activation=(await q('select id from platform_charges where student_id=$1',[ids.child])).rows[0].id;check('Dirección no edita cobros de MiCole',await denied(ids.director,()=>q("select increase_issued_charge('platform',$1,65,'Cambio no autorizado')",[activation])));
 await q('rollback');check('Registros temporales revertidos',(await q('select id from auth.users where id=$1',[ids.owner])).rowCount===0);
 console.log(JSON.stringify({ok:true,rolledBack:true,checks,bankCalls:false,realPricesChanged:false}));
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
