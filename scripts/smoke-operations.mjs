import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),keys=['owner','director','teacher','mother','father','stranger','school','room','otherRoom','child','newChild','plan','newPlan','teacherRecord','activity','receipt','qrReceipt','invoice','charge'];
const ids=Object.fromEntries(keys.map(k=>[k,randomUUID()]));const suffix=randomUUID().slice(0,8),email=k=>`micole-ops-${k}-${suffix}@example.invalid`;
let transaction=false;const passed=[];let savepoint=0;
function check(name,ok){if(!ok)throw new Error(`Falló: ${name}`);passed.push(name);}
async function as(user,fn,role='authenticated'){
 await db.query(`set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",[user||'']);
 const result=await fn();await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub','',true)");return result;
}
async function denied(fn){const name=`expected_ops_${++savepoint}`;await db.query(`savepoint ${name}`);try{await fn();await db.query(`release savepoint ${name}`);return false;}catch(e){await db.query(`rollback to savepoint ${name}`);await db.query(`release savepoint ${name}`);return ['42501','P0001','22023'].includes(e.code);}}
const q=(sql,args=[])=>db.query(sql,args);
const identity=async()=>(await q('select public.workspace_identity() as value')).rows[0].value;
const checkout=(items,receipt=ids.receipt,method='cash',invoice={},reviewed=false)=>q('select public.checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)',[receipt,ids.child,JSON.stringify(items),method,`TEMP-${receipt}`,JSON.stringify(invoice),reviewed]);
try{
 await db.connect();await q('begin');transaction=true;
 if(process.argv.includes('--pending')){
 const directory=new URL('../supabase/migrations/',import.meta.url);const history=(await q('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version);
 for(const file of ['202610150002_school_operations.sql','202610150003_collections_invoices.sql','202610150004_realtime_notices.sql'])if(!history.includes(file.split('_')[0]))await q(fs.readFileSync(new URL(file,directory),'utf8'));
 }
 await q('insert into aulanexo_private.platform_admin_allowlist(email) values($1)',[email('owner')]);
 for(const who of ['owner','director','teacher','mother','father','stranger'])await q("insert into auth.users(id,email,aud,role,email_confirmed_at,raw_user_meta_data) values($1,$2,'authenticated','authenticated',now(),'{}')",[ids[who],email(who)]);
 await q("insert into public.schools(id,name,slug,status,show_on_landing) values($1,'Colegio temporal de operaciones',$2,'active',false)",[ids.school,`ops-${suffix}`]);
 await q("insert into public.school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",[ids.school,ids.director,ids.teacher]);
 await q("insert into public.classrooms(id,school_id,name,capacity,academic_year) values($1,$2,'Aula temporal A',2,2026),($3,$2,'Aula temporal B',30,2026)",[ids.room,ids.school,ids.otherRoom]);
 await q("insert into public.teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente temporal',$4,'active')",[ids.teacherRecord,ids.school,ids.teacher,email('teacher')]);await q('insert into public.teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[ids.school,ids.teacherRecord,ids.room]);
 await q("insert into public.students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Niña','Temporal','active',true,'Madre',$4,'Padre',$5,(now() at time zone 'America/La_Paz')::date+1-interval '5 years')",[ids.child,ids.school,ids.room,email('mother'),email('father')]);
 await q("insert into public.platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación','2026-10',50,'paid')",[ids.school,ids.child]);
 await as(ids.mother,identity);await as(ids.father,identity);
 const today=(await q("select to_char(now() at time zone 'America/La_Paz','YYYY-MM-DD') as today")).rows[0].today;
 await as(ids.director,()=>q('select public.save_school($1::jsonb)',[JSON.stringify({id:ids.school,director_identity:'1234567 LP',director_phone:'70000000',maps_url:'https://www.google.com/maps?q=LaPaz'})]));
 check('Datos privados de Dirección guardados',(await as(ids.director,()=>q('select public.institution_private_contact($1) as value',[ids.school]))).rows[0].value.directorIdentity==='1234567 LP');
 check('Padres no consultan carnet de Dirección',await as(ids.mother,()=>denied(()=>q('select public.institution_private_contact($1)',[ids.school]))));
 check('La institución pública no contiene el carnet',!JSON.stringify((await as(ids.mother,()=>q('select * from public.schools where id=$1',[ids.school]))).rows).includes('1234567 LP'));
 await as(ids.director,()=>q('select public.save_classroom($1::jsonb,$2::uuid[])',[JSON.stringify({id:ids.room,school_id:ids.school,name:'Aula temporal A',level:'Primaria',schedule:'08:00 – 12:00',start_time:'08:00',end_time:'12:00',weekdays:[1,3,5],capacity:2,academic_year:2026,monthly_fee:71}),[ids.teacherRecord]]));
 check('Horario estructurado y cupos guardados',(await q('select start_time,capacity,weekdays from public.classrooms where id=$1',[ids.room])).rows[0].weekdays.join(',')==='1,3,5');
 const newStudent={id:ids.newChild,school_id:ids.school,classroom_id:ids.room,first_name:'Otro','last_name':'Temporal',birth_date:'2020-01-01',mother_name:'Madre',mother_email:email('mother'),father_name:'Padre',father_email:email('father'),identity_number:`TEMP-${suffix}`,monthly_fee:71};
 check('La inscripción exige lista anual aprobada',await as(ids.director,()=>denied(()=>q('select public.enroll_student($1::jsonb)',[JSON.stringify(newStudent)]))));
 const annual=randomUUID();await as(ids.teacher,()=>q('select public.save_academic_request($1::jsonb)',[JSON.stringify({id:annual,school_id:ids.school,classroom_id:ids.room,kind:'annual_materials',academic_year:2026,title:'Lista anual temporal',details:'Cuaderno y lápices',event_date:today,amount:0})]));
 check('Docente no aprueba su propia solicitud',await as(ids.teacher,()=>denied(()=>q("select public.review_academic_request($1,true,'')",[annual]))));
 await as(ids.director,()=>q("select public.review_academic_request($1,true,'Aprobado')",[annual]));check('Lista aprobada se publica en agenda',(await q('select id from public.calendar_events where id=$1',[annual])).rowCount===1);
 await as(ids.director,()=>q('select public.enroll_student_with_plan($1::jsonb,$2::jsonb)',[JSON.stringify(newStudent),JSON.stringify({id:ids.newPlan,school_id:ids.school,student_id:ids.newChild,start_date:today,months:4,monthly_fee:71,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false})]));
 const created=(await q('select amount,minimum_access_ratio from public.school_charges where student_id=$1 order by period',[ids.newChild])).rows;
 check('Inscripción y cuotas se crean juntas',created.length===4&&created.every(c=>Number(c.amount)===100));check('Las dos últimas cuotas exigen 100%',created.map(c=>Number(c.minimum_access_ratio)).join(',')==='0.5,0.5,1,1');
 check('El cupo máximo se aplica en el servidor',await as(ids.director,()=>denied(()=>q('select public.enroll_student($1::jsonb)',[JSON.stringify({...newStudent,id:randomUUID(),identity_number:`TEMP-2-${suffix}`})]))));
 await as(ids.director,()=>q('select public.create_payment_plan($1::jsonb)',[JSON.stringify({id:ids.plan,school_id:ids.school,student_id:ids.child,start_date:today,months:4,monthly_fee:71,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,prorate:false})]));
 const charges=(await q('select id from public.school_charges where student_id=$1 order by period',[ids.child])).rows;
 const items=[{chargeId:charges[0].id,amount:50},{chargeId:charges[1].id,amount:100}],invoice={invoiceName:'Razón social temporal',invoiceNit:'123456789',invoicePhone:'70000000'};
 check('Familia no confirma sus cobros',await as(ids.mother,()=>denied(()=>checkout(items))));
 await as(ids.director,()=>checkout(items,ids.receipt,'cash',invoice));await as(ids.director,()=>checkout(items,ids.receipt,'cash',invoice));
 check('Reintento no duplica recibos',(await q('select count(*)::int n from public.school_receipts where id=$1',[ids.receipt])).rows[0].n===1);
 const balance=(await q('select paid_amount,status from public.school_charges where id=$1',[charges[0].id])).rows[0];check('El abono conserva saldo y cuota pendiente',Number(balance.paid_amount)===50&&balance.status==='pending');
 check('El 50% habilita el acceso de la familia',(await as(ids.mother,()=>q('select public.family_access($1) as ok',[ids.child]))).rows[0].ok);
 check('No se acepta un abono mayor al saldo',await as(ids.director,()=>denied(()=>checkout([{chargeId:charges[0].id,amount:51}],randomUUID()))));
 const inv=(await q('select id,amount from public.invoice_requests where receipt_id=$1',[ids.receipt])).rows[0];check('La factura usa el total recibido',Number(inv.amount)===150);
 check('Docente no lee datos de facturación',(await as(ids.teacher,()=>q('select id from public.invoice_requests where school_id=$1',[ids.school]))).rowCount===0);
 await as(ids.director,()=>q("select public.mark_invoice_issued($1,'FACTURA-TEMPORAL')",[inv.id]));check('La emisión manual queda registrada',(await q('select status from public.invoice_requests where id=$1',[inv.id])).rows[0].status==='issued');
 const register=(await as(ids.mother,()=>q('select public.finance_register() as value'))).rows[0].value;check('Registro financiero completo respeta RLS',register.receipts.some(r=>r.id===ids.receipt)&&register.invoices.some(i=>i.id===inv.id));check('Recibo incluye sus abonos',register.receipts.find(r=>r.id===ids.receipt).items.length===2);
 const link=(await as(ids.director,()=>q('select public.create_payment_link($1,$2::jsonb) as token',[ids.child,JSON.stringify([{chargeId:charges[0].id,amount:50}])]))).rows[0].token;
 const context=(await as(null,()=>q('select public.payment_link_context($1) as value',[link]),'anon')).rows[0].value;check('Enlace público no expone datos fiscales',context.total===50&&!JSON.stringify(context).includes('123456789')&&context.qrAvailable===false);
 await as(ids.director,()=>checkout([{chargeId:charges[0].id,amount:50}],randomUUID()));check('Enlace reconoce el importe ya abonado',(await as(null,()=>q('select public.payment_link_context($1) as value',[link]),'anon')).rows[0].value.status==='paid');
 await as(ids.teacher,()=>q('select public.save_academic_request($1::jsonb)',[JSON.stringify({id:ids.activity,school_id:ids.school,classroom_id:ids.room,kind:'activity',academic_year:2026,title:'Salida temporal',details:'Actividad educativa temporal',event_date:today,amount:50,due_date:'2026-01-01',blocks_access:true})]));await as(ids.director,()=>q("select public.review_academic_request($1,true,'Aprobado')",[ids.activity]));
 check('Actividad vencida bloquea hasta pagar',(await as(ids.mother,()=>q('select public.family_access($1) as ok',[ids.child]))).rows[0].ok===false);
 check('No participación exige un motivo',await as(ids.mother,()=>denied(()=>q("select public.set_activity_participation($1,$2,false,'')",[ids.activity,ids.child]))));
 await as(ids.mother,()=>q("select public.set_activity_participation($1,$2,false,'No asistirá a esta salida')",[ids.activity,ids.child]));check('No participación exime el cobro sin bloquear',(await as(ids.mother,()=>q('select public.family_access($1) as ok',[ids.child]))).rows[0].ok);
 await as(ids.director,()=>q("select public.set_activity_participation($1,$2,true,'')",[ids.activity,ids.child]));const extra=(await q('select id from public.school_charges where academic_request_id=$1 and student_id=$2',[ids.activity,ids.child])).rows[0].id;
 const teacherCharges=(await as(ids.teacher,()=>q('select public.teacher_activity_charges() as value'))).rows[0].value;check('Docente recibe solo cobros de actividades sin datos fiscales',teacherCharges.some(c=>c.id===extra)&&teacherCharges.every(c=>!('invoice_nit' in c)&&c.academic_request_id));
 check('QR requiere corroboración expresa',await as(ids.teacher,()=>denied(()=>checkout([{chargeId:extra,amount:50}],ids.qrReceipt,'qr',{},false))));await as(ids.teacher,()=>checkout([{chargeId:extra,amount:50}],ids.qrReceipt,'qr',{},true));
 check('Docente corrobora QR de actividad aprobada',(await q('select verification_source from public.school_receipts where id=$1',[ids.qrReceipt])).rows[0].verification_source==='manual');
 await as(ids.director,()=>q('select public.save_payment_connection($1,$2,$3,$4,$5::jsonb)',[ids.school,'Proveedor temporal',`CUENTA-${suffix}`,'test',JSON.stringify({apiKey:'CREDENCIAL-FICTICIA-SIN-VALOR'})]));
 const connection=(await as(ids.director,()=>q('select public.payment_connection_status($1) as value',[ids.school]))).rows[0].value;check('Credenciales se guardan en Vault sin devolverlas',connection.credentialsStored&&!JSON.stringify(connection).includes('CREDENCIAL-FICTICIA'));
 const encrypted=(await q('select v.secret::text,v.decrypted_secret from vault.decrypted_secrets v join aulanexo_private.payment_connections c on c.secret_id=v.id where c.school_id=$1',[ids.school])).rows[0];check('Vault cifra y recupera la credencial de prueba',!encrypted.secret.includes('CREDENCIAL-FICTICIA')&&JSON.parse(encrypted.decrypted_secret).apiKey==='CREDENCIAL-FICTICIA-SIN-VALOR');
 check('Padres no consultan conexiones bancarias',await as(ids.mother,()=>denied(()=>q('select public.payment_connection_status($1)',[ids.school]))));
 check('Cuenta de MiCole solo para el propietario',await as(ids.director,()=>denied(()=>q('select public.payment_connection_status(null)'))));
 const revision=(await q('select * from public.workspace_signals where school_id=$1',[ids.school])).rows[0];check('Realtime usa solo revisión y fecha',Object.keys(revision).sort().join(',')==='changed_at,changed_table,revision,school_id');check('Realtime está publicado',(await q("select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='workspace_signals'")).rowCount===1);
 check('Usuarios ajenos no reciben señales',(await as(ids.stranger,()=>q('select * from public.workspace_signals where school_id=$1',[ids.school]))).rowCount===0);
 await q('select aulanexo_private.send_birthday_reminders()');const reminders=(await q("select count(*)::int n from public.notifications where student_id=$1 and kind like 'birthday_%'",[ids.child])).rows[0].n;await q('select aulanexo_private.send_birthday_reminders()');check('Recordatorios de cumpleaños sin duplicados',reminders>0&&(await q("select count(*)::int n from public.notifications where student_id=$1 and kind like 'birthday_%'",[ids.child])).rows[0].n===reminders);
 await as(ids.director,()=>q("select public.withdraw_student($1,'Cambio de domicilio temporal')",[ids.child]));check('Baja con motivo registrado',(await q('select withdrawal_reason from public.students where id=$1',[ids.child])).rows[0].withdrawal_reason==='Cambio de domicilio temporal');
 await q('rollback');transaction=false;console.log(JSON.stringify({ok:true,checks:passed.length,passed,rolledBack:true}));
}catch(e){if(transaction)await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
