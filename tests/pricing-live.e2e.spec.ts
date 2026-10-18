import {test,expect,type Page,type WebSocketRoute} from '@playwright/test';
const id=(n:number)=>`ca000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [userId,schoolId,roomId,otherRoomId,studentId,otherStudentId,teacherId]=[1,20,30,31,40,41,50].map(id);
const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
test.use({baseURL:'http://localhost:4174',reducedMotion:'reduce'});
async function setup(page:Page,role='director'){
 const calls:{name:string;body:any}[]=[];const state={
 school:{id:schoolId,name:'Colegio Operaciones',slug:'operaciones',city:'La Paz',status:'active',brand_color:'#3D6EF7',director_name:'Directora',address:'Av. Arce',banner_url:'',maps_url:''},
 rooms:[{id:roomId,school_id:schoolId,name:'Primero A',level:'Primaria',academic_year:2026,schedule:'08:00 – 12:00',start_time:'08:00:00',end_time:'12:00:00',weekdays:[1,2,3,4,5],capacity:20,monthly_fee:400,active:true},{id:otherRoomId,school_id:schoolId,name:'Primero B',level:'Primaria',academic_year:2026,schedule:'08:00 – 12:00',start_time:'08:00:00',end_time:'12:00:00',weekdays:[1,2,3,4,5],capacity:20,monthly_fee:450,active:true}],
 students:[{id:studentId,school_id:schoolId,classroom_id:roomId,first_name:'Lucía',last_name:'Prueba',birth_date:'2020-01-01',status:'active',enrolled_at:date,profile_complete:true,monthly_fee:400,mother_name:'Madre',mother_email:'madre@example.invalid',mother_phone:'70000000',father_name:'Padre',father_email:'padre@example.invalid'},{id:otherStudentId,school_id:schoolId,classroom_id:otherRoomId,first_name:'Mateo',last_name:'Prueba',birth_date:'2020-01-01',status:'active',enrolled_at:date,profile_complete:true,monthly_fee:450,mother_name:'Madre',mother_email:'madre@example.invalid',father_name:'Padre',father_email:'padre@example.invalid'}],
 charges:[{id:id(100),school_id:schoolId,student_id:studentId,concept:'Mensualidad octubre',due_date:date,period:date.slice(0,7),amount:100,paid_amount:0,minimum_access_ratio:.5,status:'pending'},{id:id(101),school_id:schoolId,student_id:studentId,concept:'Mensualidad noviembre',due_date:'2026-11-10',period:'2026-11',amount:100,paid_amount:0,minimum_access_ratio:1,status:'pending'}] as any[],
 receipts:[]as any[],invoices:[]as any[],requests:[]as any[],events:[]as any[],notices:[]as any[],contact:{directorIdentity:'1234567 LP',directorPhone:'70000000'},
 };
 const user={id:userId,email:`${role}@example.invalid`,aud:'authenticated',role:'authenticated',user_metadata:{full_name:'Cuenta Operaciones'},app_metadata:{provider:'email'},created_at:new Date().toISOString()};const seconds=Math.floor(Date.now()/1000);const jwt=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,exp:seconds+3600,iat:seconds,aud:'authenticated',role:'authenticated'})).toString('base64url')}.test`;
 await page.addInitScript(({user,jwt,seconds})=>localStorage.setItem('sb-micole-test-auth-token',JSON.stringify({access_token:jwt,refresh_token:'test',expires_at:seconds+3600,expires_in:3600,token_type:'bearer',user})),{user,jwt,seconds});
 let socket:WebSocketRoute|undefined,topic='',joinRef='';
 await page.routeWebSocket('**/realtime/v1/websocket*',ws=>{socket=ws;ws.onMessage(raw=>{
  const frame=JSON.parse(String(raw));
  const message=Array.isArray(frame)?{join_ref:frame[0],ref:frame[1],topic:frame[2],event:frame[3],payload:frame[4]}:frame;
  if(message.event==='phx_join'){topic=message.topic;joinRef=message.join_ref;ws.send(JSON.stringify([message.join_ref,message.ref,topic,'phx_reply',{status:'ok',response:{postgres_changes:[{id:1,event:'*',schema:'public',table:'workspace_signals'}]}}]));}
  if(message.event==='heartbeat')ws.send(JSON.stringify([message.join_ref,message.ref,message.topic,'phx_reply',{status:'ok',response:{}}]));
 });});
 const signal=(changedTable='students')=>socket?.send(JSON.stringify([joinRef,null,topic,'postgres_changes',{ids:[1],data:{schema:'public',table:'workspace_signals',type:'UPDATE',columns:[{name:'school_id',type:'uuid'},{name:'revision',type:'int8'},{name:'changed_at',type:'timestamptz'}],commit_timestamp:new Date().toISOString(),record:{school_id:schoolId,revision:2,changed_table:changedTable,changed_at:new Date().toISOString()},old_record:{school_id:schoolId},errors:null}}]));
 await page.route('**/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/settings')?{external:{email:true,google:true}}:user}));
 await page.route('**/rest/v1/**',async route=>{
 const req=route.request(),name=new URL(req.url()).pathname.split('/').at(-1)!;let body:any;try{body=req.postDataJSON();}catch{body=null;}calls.push({name,body});let json:unknown=[];
 if(name==='platform_tariffs')json={activationFee:50,monthlyLicenseFee:29,inherited:true};else if(name==='workspace_identity')json={id:userId,email:user.email,name:'Cuenta Operaciones',roles:[role],memberships:[{schoolId,role}],teacherIds:role==='teacher'?[teacherId]:[],guardianStudentIds:role==='guardian'?[studentId]:[]};
 else if(name==='schools')json=[state.school];else if(name==='students')json=state.students;else if(name==='classrooms')json=state.rooms;
 else if(name==='teachers')json=[{id:teacherId,school_id:schoolId,name:'Profesora Prueba',email:'profesora@example.invalid',status:'active',specialty:'Titular'}];
 else if(name==='teacher_classrooms')json=[{classroom_id:roomId,teacher_id:teacherId}];else if(name==='school_charges')json=state.charges;
 else if(name==='platform_charges')json=state.students.map((s,i)=>({id:id(120+i),school_id:schoolId,student_id:s.id,concept:'Activación',period:date.slice(0,7),amount:50,status:'paid'}));
 else if(name==='finance_register')json={receipts:state.receipts,invoices:state.invoices};
 else if(name==='academic_requests')json=state.requests;else if(name==='calendar_events')json=state.events;else if(name==='announcements')json=state.notices;
 else if(name==='institution_private_contact')json=state.contact;
 else if(name==='payment_connection_status')json={provider:'',accountReference:'',environment:'test',credentialsStored:false,integrationReady:false};
 else if(name==='save_school'){Object.assign(state.school,Object.fromEntries(Object.entries(body.p_school).filter(([key])=>!['director_identity','director_phone'].includes(key))));state.contact={directorIdentity:body.p_school.director_identity,directorPhone:body.p_school.director_phone};json=null;}
 else if(name==='save_classroom'){Object.assign(state.rooms.find(r=>r.id===body.p_room.id)!,body.p_room);json=null;}
 else if(name==='enroll_student_with_plan'){state.students.push(body.p_student);json=null;}
 else if(name==='save_academic_request'){state.requests.push({...body.p_request,status:'pending',created_at:date,review_note:''});json=body.p_request.id;}
 else if(name==='review_academic_request'){const request=state.requests.find(r=>r.id===body.p_id)!;request.status=body.p_approve?'approved':'rejected';if(body.p_approve){state.events.push({id:request.id,school_id:schoolId,classroom_id:request.classroom_id,title:request.title,description:request.details,event_date:request.event_date,type:'materials'});state.notices.push({id:request.id,school_id:schoolId,classroom_id:request.classroom_id,title:request.title,content:request.details,audience:'families',created_at:date});}json=null;}
 else if(name==='checkout_school_payment'){
  if(!state.receipts.some(r=>r.id===body.p_receipt_id)){
   let total=0;for(const item of body.p_items){const charge=state.charges.find(c=>c.id===item.chargeId)!;charge.paid_amount+=item.amount;if(charge.paid_amount>=charge.amount)charge.status='paid';total+=item.amount;}
   state.receipts.push({id:body.p_receipt_id,school_id:schoolId,student_id:body.p_student_id,total,payment_method:body.p_method,reference:body.p_reference,verification_source:'manual',recorded_by:userId,created_at:new Date().toISOString()});
   if(body.p_invoice?.invoiceName)state.invoices.push({id:id(200),school_id:schoolId,student_id:studentId,receipt_id:body.p_receipt_id,legal_name:body.p_invoice.invoiceName,nit_ci:body.p_invoice.invoiceNit,phone:body.p_invoice.invoicePhone,amount:total,status:'pending',invoice_number:'',created_at:new Date().toISOString()});
  }json=body.p_receipt_id;
 }
 else if(name==='mark_invoice_issued'){Object.assign(state.invoices.find(i=>i.id===body.p_id),{status:'issued',invoice_number:body.p_number});json=null;}
 else if(name==='create_payment_link')json='a'.repeat(64);
 else if(name==='withdraw_student'){Object.assign(state.students.find(s=>s.id===body.p_student_id)!,{status:'inactive',withdrawal_reason:body.p_reason});json=null;}
 await route.fulfill({json});
 });
 return {state,calls,signal,ready:()=>!!topic};
}


test('el propietario cambia tarifas futuras y conserva los importes emitidos',async({page})=>{
 const {calls}=await setup(page,'superadmin');let fees:any={activationFee:50,monthlyLicenseFee:29,inherited:true};
 await page.route('**/rpc/platform_tariffs',r=>r.fulfill({json:fees}));
 await page.route('**/rpc/save_platform_tariffs',r=>{const body=r.request().postDataJSON();calls.push({name:'save_platform_tariffs',body});fees={activationFee:body.p_activation_fee,monthlyLicenseFee:body.p_monthly_license_fee,inherited:false};return r.fulfill({json:null});});
 await page.goto('/app/platform');await page.getByRole('button',{name:'Modificar tarifas MiCole'}).click();const d=page.getByRole('dialog');await d.getByLabel('Activación MiCole · Bs',{exact:true}).fill('60');await d.getByLabel('Licencia mensual MiCole · Bs',{exact:true}).fill('35');await d.getByLabel('Motivo del cambio',{exact:true}).fill('Nueva tarifa para próximas inscripciones');await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);await expect(page.getByText('Tarifas guardadas para nuevos cobros. Los importes emitidos siguen intactos.')).toBeVisible();expect(calls.find(c=>c.name==='save_platform_tariffs')?.body).toMatchObject({p_school_id:null,p_activation_fee:60,p_monthly_license_fee:35,p_use_global:false});
});
test('Dirección cambia precios futuros sin modificar las cuotas y aumenta una cuota con motivo',async({page})=>{
 const {calls,state}=await setup(page);state.charges[0].plan_id=id(900);
 await page.route('**/rest/v1/payment_plans*',r=>r.fulfill({json:[{id:id(900),school_id:schoolId,student_id:studentId,start_date:date,months:2,monthly_fee:400,snack_fee:0,enrollment_fee:0,due_day:10,discount:0,discount_from:null,discount_to:null,created_at:date}]}));
 await page.route('**/rpc/set_student_fees',r=>{const body=r.request().postDataJSON();calls.push({name:'set_student_fees',body});return r.fulfill({json:null});});
 await page.route('**/rpc/increase_issued_charge',r=>{const body=r.request().postDataJSON();calls.push({name:'increase_issued_charge',body});state.charges.find(c=>c.id===body.p_charge_id)!.amount=body.p_amount;return r.fulfill({json:null});});
 await page.goto('/app/payments');await page.getByRole('button',{name:'Precios para nuevas cuotas',exact:true}).click();let d=page.getByRole('dialog');await expect(d).toContainText('Todas las cuotas ya creadas');await d.getByLabel(/Nueva mensualidad base/).fill('300');await d.getByLabel('Motivo del cambio',{exact:true}).fill('Nuevo acuerdo para siguientes meses');await d.getByRole('button',{name:'Guardar',exact:true}).click();expect(state.charges[0].amount).toBe(100);expect(calls.find(c=>c.name==='set_student_fees')?.body.p_monthly_fee).toBe(300);
 await page.getByRole('button',{name:'Aumentar importe',exact:true}).first().click();d=page.getByRole('dialog');await expect(d.getByLabel(/Nuevo importe total/)).toHaveAttribute('min','100');await d.getByLabel(/Nuevo importe total/).fill('120');await d.getByLabel('Motivo del ajuste',{exact:true}).fill('Corrección acordada de mensualidad');await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);expect(calls.find(c=>c.name==='increase_issued_charge')?.body).toMatchObject({p_kind:'school',p_amount:120});
});
test('la vista previa de inscripción usa la licencia vigente del colegio',async({page})=>{
 await setup(page);await page.route('**/rpc/platform_tariffs',r=>r.fulfill({json:{activationFee:60,monthlyLicenseFee:35,inherited:false}}));await page.goto('/app/students');await page.getByRole('button',{name:'Inscribir estudiante',exact:true}).click();await page.getByRole('navigation',{name:'Secciones del formulario'}).getByRole('button',{name:/Plan de pagos/}).click();await expect(page.getByRole('dialog')).toContainText('Bs 35 de licencia');
});
