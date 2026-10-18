import { test, expect, type Page } from "@playwright/test";
const base = "https://micole-test.supabase.co";
const uid = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const [userId, schoolId, studentId, siblingId, roomId, otherRoomId] = [1,20,40,41,30,31].map(uid);
const date = new Intl.DateTimeFormat("en-CA",{timeZone:"America/La_Paz",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
test.use({baseURL:"http://localhost:4174",reducedMotion:"reduce"});
async function fixture(page: Page, role: "student"|"guardian"|"director", options: {locked?:boolean;loadFailure?:boolean} = {}) {
 const calls:{name:string;method:string;body:any}[]=[];
 const seconds=Math.floor(Date.now()/1000);
 const user={id:userId,email:`${role}@example.invalid`,aud:"authenticated",role:"authenticated",user_metadata:{full_name:"Cuenta Prueba"},app_metadata:{provider:"email"},created_at:new Date().toISOString()};
 const token=`${Buffer.from('{"alg":"HS256"}').toString("base64url")}.${Buffer.from(JSON.stringify({sub:userId,exp:seconds+3600,iat:seconds,aud:"authenticated",role:"authenticated"})).toString("base64url")}.test`;
 await page.addInitScript(({user,token,seconds})=>localStorage.setItem("sb-micole-test-auth-token",JSON.stringify({access_token:token,refresh_token:"test",expires_at:seconds+3600,expires_in:3600,token_type:"bearer",user})),{user,token,seconds});
 await page.route("**/auth/v1/**",r=>r.fulfill({json:r.request().url().includes("/settings")?{external:{email:true,google:true}}:user}));
 let account={studentId,email:"",enabled:false};
 const school={id:schoolId,name:"Colegio Prueba",slug:"prueba",status:"active",city:"La Paz",brand_color:"#3D6EF7"};
 const students=[{id:studentId,school_id:schoolId,classroom_id:roomId,first_name:"Lucía",last_name:"Prueba",birth_date:"2017-01-01",status:"active",profile_complete:true,monthly_fee:400,primary_guardian_name:"Madre",primary_guardian_email:"guardian@example.invalid",enrolled_at:date},{id:siblingId,school_id:schoolId,classroom_id:otherRoomId,first_name:"Mateo",last_name:"Prueba",status:"active",profile_complete:true,monthly_fee:400,enrolled_at:date}];
 const events=[{id:uid(60),school_id:schoolId,classroom_id:roomId,title:"Evaluación de lectura",event_date:date,type:"homework",description:"Leer el cuento"},{id:uid(61),school_id:schoolId,classroom_id:otherRoomId,title:"Evento otro curso",event_date:date,type:"event",description:"Segundo curso"}];
 const notices=[{id:uid(70),school_id:schoolId,classroom_id:roomId,title:"Salida del curso",content:"Traer gorra",audience:"families",created_at:date},{id:uid(71),school_id:schoolId,classroom_id:otherRoomId,title:"Aviso del hermano",content:"Otro curso",audience:"families",created_at:date}];
 const tasks=[{id:uid(80),school_id:schoolId,student_id:studentId,category:"tarea",note:"Resolver la ficha de números",entry_date:date}];
 await page.route("**/rest/v1/**",async route=>{
  const request=route.request();const name=new URL(request.url()).pathname.split('/').at(-1)!;
  let body;try{body=request.postDataJSON();}catch{body=null;}
  calls.push({name,method:request.method(),body});
  let json:unknown=name==='finance_register'?{receipts:[],invoices:[]}:[];
  if(name==='platform_tariffs')json={activationFee:50,monthlyLicenseFee:29,inherited:true};else if(name==='workspace_identity')json={id:userId,email:user.email,name:"Cuenta Prueba",roles:[role],memberships:[{schoolId,role}],teacherIds:[],guardianStudentIds:role==='guardian'?[studentId,siblingId]:[],studentIds:role==='student'?[studentId]:[],canSupport:false};
  else if(name==='student_portal') json={accessAllowed:!options.locked,accessMessage:options.locked?"Tu acceso está en pausa. Pide a tu familia que revise tu inscripción y los pagos.":"",schools:[{...school,color:school.brand_color}],students:[{id:studentId,schoolId,classroomId:roomId,firstName:"Lucía",lastName:"Prueba",status:"active"}],classrooms:[{id:roomId,schoolId,name:"Primero A",level:"Primaria",schedule:"Mañana",teacherIds:[]}],events:options.locked?[]:[{id:uid(60),schoolId,classroomId:roomId,title:events[0].title,date,type:"homework",description:events[0].description}],announcements:options.locked?[]:[{id:uid(70),schoolId,classroomId:roomId,title:notices[0].title,content:notices[0].content,audience:"families",createdAt:date}],dailyEntries:options.locked?[]:[{id:uid(80),schoolId,studentId,category:"tarea",note:tasks[0].note,date}]};
  else if(name==='schools')json=[school];else if(name==='students')json=students;
  else if(name==='classrooms')json=[{id:roomId,school_id:schoolId,name:"Primero A"},{id:otherRoomId,school_id:schoolId,name:"Primero B"}];
  else if(name==='school_charges')json=students.map((s,i)=>({id:uid(100+i),school_id:schoolId,student_id:s.id,status:"paid",amount:429,due_date:date,concept:"Cuota"}));
  else if(name==='platform_charges')json=students.map((s,i)=>({id:uid(110+i),school_id:schoolId,student_id:s.id,status:"paid",amount:50,period:date.slice(0,7),concept:"Activación inicial"}));
  else if(name==='calendar_events')json=events;
  else if(name==='announcements')json=notices;
  else if(name==='daily_entries')json=tasks;
  else if(name==='grades')json=[{id:uid(90),school_id:schoolId,student_id:studentId,subject:"Matemática",period:"Primer trimestre",score:"90",recommendation:"Buen avance",created_at:date}];
  else if(name==='student_login_account'){
    if(options.loadFailure){await route.fulfill({status:403,json:{message:"No pudimos consultar el acceso."}});return;}
    json=account;
  }else if(name==='set_student_login'){
    account={studentId,email:body.p_enabled?body.p_email:account.email,enabled:body.p_enabled};json=null;
  }
  await route.fulfill({json});
 });
 return calls;
}
for(const width of [1440,768,390])test(`estudiante ${width}px: consulta publicaciones y no carga tablas privadas`,async({page})=>{
 await page.setViewportSize({width,height:1000});const calls=await fixture(page,'student');
 await page.goto('/app/overview');await expect(page.getByRole('heading',{name:'Hola, Lucía'})).toBeVisible();
 await page.goto('/app/journal');await expect(page.getByText('Resolver la ficha de números')).toBeVisible();
 await expect(page.getByRole('button',{name:'Nueva entrada'})).toHaveCount(0);
 await page.goto('/app/calendar');await expect(page.getByRole('region',{name:'Calendario mensual'})).toBeVisible();
 await expect(page.getByText('Evaluación de lectura')).toBeVisible();await expect(page.getByRole('button',{name:'Agregar evento'})).toHaveCount(0);
 await page.getByRole('button',{name:new RegExp(`^${Number(date.slice(8))} de .*1 actividades`)}).click();
 await expect(page.getByRole('button',{name:'Ver todo el mes'})).toBeVisible();
 await page.getByRole('button',{name:'Mes siguiente'}).click();await expect(page.getByText('Evaluación de lectura')).toHaveCount(0);
 await page.getByRole('button',{name:'Mes anterior'}).click();await expect(page.getByText('Evaluación de lectura')).toBeVisible();
 await page.goto('/app/announcements');await expect(page.getByText('Salida del curso')).toBeVisible();await expect(page.getByRole('button',{name:'Nuevo comunicado'})).toHaveCount(0);
 for(const path of ['payments','family','messages','requests','grades','students','settings']) {await page.goto(`/app/${path}`);await expect(page).toHaveURL(/\/app\/overview/);}
 expect(calls.filter(c=>!['workspace_identity','student_portal','subject_catalog','school_subjects','class_subjects','subject_teachers','assignments','assignment_submissions','assignment_files','notifications'].includes(c.name))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('estudiante bloqueado no recibe ni muestra contenido',async({page})=>{
 await fixture(page,'student',{locked:true});await page.goto('/app/overview');
 await expect(page.getByRole('heading',{name:'Tu espacio está en pausa'})).toBeVisible();
 await page.goto('/app/calendar');await expect(page.getByText('Evaluación de lectura')).toHaveCount(0);
 await expect(page.getByRole('status').filter({hasText:'Tu acceso está en pausa'})).toBeVisible();
});
test('madre o padre consulta calendario, actividades, avisos y notas sin acciones de edición',async({page})=>{
 await fixture(page,'guardian');await page.goto('/app/calendar');
 await expect(page.getByText('Evaluación de lectura')).toBeVisible();await expect(page.getByText('Evento otro curso')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Agregar evento'})).toHaveCount(0);
 await page.goto('/app/journal');await expect(page.getByText('Resolver la ficha de números')).toBeVisible();await expect(page.getByRole('button',{name:'Nueva entrada'})).toHaveCount(0);
 await page.goto('/app/announcements');await expect(page.getByText('Salida del curso')).toBeVisible();await expect(page.getByText('Aviso del hermano')).toHaveCount(0);
 await page.getByLabel('Mi hijo').selectOption(siblingId);await expect(page.getByText('Aviso del hermano')).toBeVisible();await expect(page.getByText('Salida del curso')).toHaveCount(0);
 await page.getByLabel('Mi hijo').selectOption(studentId);await page.goto('/app/grades');await expect(page.getByText('Buen avance')).toBeVisible();await expect(page.getByRole('button',{name:'Registrar evaluación'})).toHaveCount(0);
});
test('Dirección habilita, recarga y revoca el acceso opcional del estudiante',async({page})=>{
 const calls=await fixture(page,'director');await page.goto('/app/students');
 await page.getByTitle('Acceso del estudiante',{exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'Acceso del estudiante'});
 await dialog.getByLabel('Habilitar acceso de estudiante').check();await dialog.locator('input[type=email]').fill('lucia@example.invalid');
 await dialog.getByRole('button',{name:'Guardar acceso'}).click();await expect(dialog.getByRole('status')).toContainText('Acceso habilitado');
 await dialog.getByRole('button',{name:'Cancelar'}).click();await page.getByTitle('Acceso del estudiante',{exact:true}).first().click();
 await expect(dialog.locator('input[type=email]')).toHaveValue('lucia@example.invalid');await expect(dialog.getByLabel('Habilitar acceso de estudiante')).toBeChecked();
 await dialog.getByLabel('Habilitar acceso de estudiante').uncheck();await dialog.getByRole('button',{name:'Guardar acceso'}).click();await expect(dialog.getByRole('status')).toContainText('deshabilitado');
 expect(calls.filter(c=>c.name==='set_student_login').map(c=>c.body)).toEqual([{p_student_id:studentId,p_email:'lucia@example.invalid',p_enabled:true},{p_student_id:studentId,p_email:'lucia@example.invalid',p_enabled:false}]);
});
test('una consulta fallida del acceso no permite sobrescribir su configuración',async({page})=>{
 const calls=await fixture(page,'director',{loadFailure:true});await page.goto('/app/students');await page.getByTitle('Acceso del estudiante',{exact:true}).first().click();
 await expect(page.getByRole('alert')).toContainText('No pudimos consultar');await expect(page.getByRole('button',{name:'Guardar acceso'})).toBeDisabled();
 await page.getByRole('button',{name:'Cancelar'}).click();expect(calls.some(c=>c.name==='set_student_login')).toBe(false);
});
