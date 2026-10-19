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


const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';
test('la landing recibe una solicitud y conserva el acceso inmediato a la demo',async({page})=>{
 await page.setViewportSize({width:390,height:844});let sent:any;
 await page.route('**/rest/v1/**',r=>r.fulfill({json:r.request().url().includes('platform_tariffs')?{activationFee:0,configuredActivationFee:50,activationEnabled:false,monthlyLicenseFee:29,inherited:true}:[]}));
 await page.route('**/functions/v1/demo-request',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
 await page.goto('/');await page.getByRole('link',{name:'Solicitar demo para mi institución'}).click();
 const form=page.locator('#solicitar-demo');await form.getByLabel('Nombre de la institución').fill('Colegio Interesado');await form.getByLabel('Tu nombre').fill('Contacto Demo');await form.getByLabel('Correo de contacto').fill('contacto@example.test');await form.getByLabel('Celular de contacto').fill('70000000');await form.getByRole('combobox',{name:'Ciudad',exact:true}).selectOption('La Paz');await form.getByRole('checkbox').check();await form.screenshot({path:'/private/tmp/micole-credit-work/landing-demo-mobile.png'});await form.getByRole('button',{name:'Solicitar demostración guiada'}).click();await expect(form.getByText('Recibimos tu solicitud',{exact:true})).toBeVisible();expect(sent).toMatchObject({schoolName:'Colegio Interesado',consent:true});expect(sent.requestKey).toMatch(/^[a-f0-9-]{36}$/);await expect(form.getByRole('link',{name:'Explorar MiCole'})).toHaveAttribute('href','/demo');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Dirección ve el crédito inicial pendiente y el QR solicita Bs 500',async({page})=>{
 const {state}=await setup(page);await page.setViewportSize({width:390,height:844});
 await page.route('**/rest/v1/schools*',r=>r.fulfill({json:[{...state.school,platform_enabled:false,activation_enabled:false}]}));
 await page.route('**/rpc/platform_credit_account',r=>r.fulfill({json:{schoolId,initialAmount:500,initialPaid:false,balance:0,chargeId:id(880),chargeStatus:'pending',history:[]}}));let request:any;
 await page.route('**/rpc/baneco_payment_context',r=>r.fulfill({json:null}));
 await page.route('**/functions/v1/bank-qr',r=>{request=r.request().postDataJSON();return r.fulfill({json:{payment:{id:id(881),kind:'platform',schoolId,amount:500,currency:'BOB',dueDate:date,environment:'production',status:'pending',applicationStatus:'waiting',image:png,createdAt:new Date().toISOString()}}});});
 await page.goto('/app/students');await expect(page.getByRole('heading',{name:'Crédito de licencias MiCole'})).toBeVisible();await expect(page.getByRole('button',{name:'Inscribir estudiante',exact:true})).toHaveCount(0);await page.screenshot({path:'/private/tmp/micole-credit-work/credit-mobile.png',fullPage:true});await page.getByRole('button',{name:'Pagar crédito inicial · Bs 500'}).click();const d=page.getByRole('dialog');await d.getByRole('button',{name:'Generar QR bancario',exact:true}).click();await expect(d.getByAltText('QR Baneco por Bs 500')).toBeVisible();expect(request).toMatchObject({action:'generate',kind:'platform',schoolId,items:[{chargeId:id(880),amount:500}]});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('superadmin revisa la solicitud comercial y el seguimiento se guarda',async({page})=>{
 await setup(page,'superadmin');const row={id:id(882),school_name:'Colegio Interesado',contact_name:'Contacto Demo',email:'contacto@example.test',phone:'70000000',city:'La Paz',message:'Deseamos conocer la agenda',status:'pending',notes:'',created_at:new Date().toISOString()};let body:any;
 await page.route('**/rest/v1/demo_requests*',r=>r.fulfill({json:[row]}));await page.route('**/rpc/review_demo_request',r=>{body=r.request().postDataJSON();row.status=body.p_status;row.notes=body.p_notes;return r.fulfill({json:null});});
 await page.goto('/app/demoRequests');await expect(page.getByRole('heading',{name:'Solicitudes de demostración'})).toBeVisible();await page.getByRole('button',{name:'Registrar seguimiento'}).click();const d=page.getByRole('dialog');await d.getByLabel('Estado',{exact:false}).selectOption('contacted');await d.getByLabel('Notas de seguimiento',{exact:true}).fill('Coordinamos una visita');await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);expect(body).toMatchObject({p_id:row.id,p_status:'contacted',p_notes:'Coordinamos una visita'});await page.getByLabel('Estado de solicitudes').selectOption('contacted');await expect(page.getByText('Seguimiento: Coordinamos una visita')).toBeVisible();
});
test('el QR de una licencia descuenta el crédito sin modificar la cuota',async({page})=>{
 await setup(page,'superadmin');let request:any;await page.route('**/rpc/baneco_payment_context',r=>r.fulfill({json:null}));
 await page.route('**/rest/v1/platform_charges*',r=>r.fulfill({json:[{id:id(883),school_id:schoolId,kind:'license',concept:'Licencia con saldo',period:date.slice(0,7),amount:29,credit_applied:7,status:'pending'}]}));
 await page.route('**/functions/v1/bank-qr',r=>{request=r.request().postDataJSON();return r.fulfill({json:{payment:{id:id(884),kind:'platform',schoolId,amount:22,currency:'BOB',dueDate:date,environment:'production',status:'pending',applicationStatus:'waiting',image:png,createdAt:new Date().toISOString()}}});});
 await page.goto('/app/platform');await expect(page.getByText(/Crédito Bs 7.*Saldo Bs 22/)).toBeVisible();await expect(page.getByRole('button',{name:'Aumentar importe',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Generar QR Baneco',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Generar QR bancario',exact:true}).click();await expect(page.getByAltText('QR Baneco por Bs 22')).toBeVisible();expect(request.items).toEqual([{chargeId:id(883),amount:22}]);
});
test('el personal abre el CI privado y deja constancia de la entrega',async({page})=>{
 await setup(page,'teacher');const row={id:id(885),school_id:schoolId,student_id:studentId,type:'pickup',request_date:date,reason:'Recogerá su familiar',pickup_name:'Persona Autorizada',pickup_id:'1234567',pickup_file_id:id(886),status:'approved',created_at:new Date().toISOString()};let evidence:any;
 await page.route('**/rest/v1/family_requests*',r=>r.fulfill({json:[row]}));await page.route('**/functions/v1/r2-media',r=>{expect(r.request().postDataJSON()).toMatchObject({action:'pickup_download',assetId:id(886)});return r.fulfill({json:{url:png}});});await page.route('**/rpc/confirm_pickup_identity',r=>{evidence=r.request().postDataJSON();Object.assign(row,{pickup_verified_at:new Date().toISOString(),pickup_verification_note:evidence.p_note});return r.fulfill({json:null});});
 await page.goto('/app/requests');await page.getByRole('button',{name:'Ver carnet de quien recoge'}).click();let d=page.getByRole('dialog');await expect(d.getByAltText('Carnet adjunto de Persona Autorizada')).toBeVisible();await d.getByRole('button',{name:'Cerrar',exact:true}).first().click();await page.getByRole('button',{name:'Confirmar identidad y entrega'}).click();d=page.getByRole('dialog');await d.getByRole('checkbox').check();await d.getByLabel('Observación de la entrega',{exact:true}).fill('Comparé presencialmente el documento');await d.getByRole('button',{name:'Confirmar entrega',exact:true}).click();await expect(d).toHaveCount(0);expect(evidence).toMatchObject({p_request_id:id(885),p_note:'Comparé presencialmente el documento'});await expect(page.getByText(/Identidad y entrega confirmadas/)).toBeVisible();
});

test('la familia adjunta y confirma el carnet antes de enviar la autorización',async({page})=>{
 await setup(page,'guardian');const requests:any[]=[],calls:any[]=[];let upload=false;
 await page.route('https://upload.micole.test/object',r=>{upload=true;return r.fulfill({status:200});});
 await page.route('**/functions/v1/r2-media',r=>{const b=r.request().postDataJSON();calls.push(b);return r.fulfill({json:b.action==='pickup_upload'?{id:id(889),url:'https://upload.micole.test/object'}:{ok:true}});});
 await page.route('**/rest/v1/family_requests*',r=>{if(r.request().method()==='POST'){const b=r.request().postDataJSON();requests.push(Array.isArray(b)?b[0]:b);return r.fulfill({json:{id:requests.at(-1).id}});}return r.fulfill({json:requests});});
 await page.goto('/app/requests');await page.getByRole('button',{name:'Autorizar recogida',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Motivo o mensaje').fill('Hoy recoge su familiar autorizado');await d.getByLabel('Nombre de quien recogerá').fill('Persona Ficticia');await d.getByLabel('Documento de identidad').fill('1234567');await d.getByLabel('Foto del carnet de quien recogerá').setInputFiles({name:'ci-ficticio.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});await d.getByRole('button',{name:'Guardar',exact:true}).click();await expect(d).toHaveCount(0);expect(upload).toBe(true);expect(calls.map(c=>c.action)).toEqual(['pickup_upload','pickup_finalize']);expect(requests[0]).toMatchObject({id:calls[0].requestId,student_id:studentId,pickup_file_id:id(889)});await expect(page.getByRole('button',{name:'Ver carnet de quien recoge'})).toBeVisible();
});
