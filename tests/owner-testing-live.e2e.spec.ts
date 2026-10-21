import {test,expect} from '@playwright/test';
const owner='bb000000-0000-4000-8000-000000000001',school='bb000000-0000-4000-8000-000000000020',teacher='bb000000-0000-4000-8000-000000000050',child='bb000000-0000-4000-8000-000000000040',sid='bb000000-0000-4000-8000-000000000080';
test.use({baseURL:'http://localhost:4174',reducedMotion:'reduce'});
for(const width of [390,1024])test(`propietario prueba roles sin correos confirmados a ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const now=Math.floor(Date.now()/1000),user={id:owner,email:'owner@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:{full_name:'Propietario'},app_metadata:{provider:'google'},created_at:new Date().toISOString()};
 const jwt=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp:now+3600,iat:now,aud:'authenticated',role:'authenticated'})).toString('base64url')}.test`;
 await page.addInitScript(({user,jwt,now})=>localStorage.setItem('sb-micole-test-auth-token',JSON.stringify({user,access_token:jwt,refresh_token:'test',expires_at:now+3600,expires_in:3600,token_type:'bearer'})),{user,jwt,now});
 await page.route('**/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/settings')?{external:{google:true,email:true}}:user}));
 let enabled=false,currentRole='director';const calls:any[]=[];
 await page.route('**/rest/v1/**',async r=>{
  const req=r.request(),name=new URL(req.url()).pathname.split('/').pop(),header=req.headers()['x-micole-support'];let body:any={};try{body=req.postDataJSON()||{};}catch{}
  calls.push({name,header,body});let json:any=[];
  if(name==='platform_tariffs')json={activationFee:50,monthlyLicenseFee:29,inherited:true};else if(name==='workspace_identity')json={id:owner,name:'Propietario',email:user.email,canSupport:true,roles:header?[currentRole]:['superadmin'],memberships:header?[{schoolId:school,role:currentRole}]:[],teacherIds:currentRole==='teacher'?[teacher]:[],guardianStudentIds:currentRole==='guardian'?[child]:[],studentIds:currentRole==='student'?[child]:[],support:header?{id:sid,schoolId:school,role:currentRole,paymentBypass:true,mode:'test',reason:'Pruebas del propietario',expiresAt:new Date(Date.now()+7200000).toISOString(),adminId:owner}:null};
  else if(name==='schools')json=[{id:school,name:'Institución ficticia',slug:'ficcion',status:'active',platform_enabled:false,city:'La Paz',brand_color:'#3D6EF7'}];
  else if(name==='students')json=[{id:child,school_id:school,classroom_id:'room',first_name:'Niño',last_name:'de prueba',status:'active',profile_complete:false,monthly_fee:420}];
  else if(name==='student_portal')json={accessAllowed:false,accessMessage:'Pagos pendientes',schools:[{id:school,name:'Institución ficticia',status:'active'}],students:[{id:child,schoolId:school,classroomId:'room',firstName:'Niño',lastName:'de prueba',status:'active'}],classrooms:[],events:[],announcements:[],dailyEntries:[]};
  else if(name==='finance_register')json={receipts:[],invoices:[]};
  else if(name==='test_workspace_options')json={enabled,accounts:[{id:owner,role:'director',name:'Dirección',email:''},{id:teacher,role:'teacher',name:'Docente ficticio',email:'no-existe@example.invalid'},{id:child,role:'guardian',relationship:'mother',name:'Niño de prueba',email:''},{id:child,role:'student',name:'Niño de prueba',email:''}]};
  else if(name==='set_test_institution'){enabled=body.p_enabled;json=null;}
  else if(name==='start_test_session'){expect(header).toBeUndefined();currentRole=body.p_role;json={id:sid};}
  else if(name==='end_support_session'){expect(header).toBe(sid);json=null;}
  await r.fulfill({json});
 });
 await page.goto('/app/support');await page.getByRole('button',{name:'Usar esta institución para pruebas'}).click();
 await page.getByRole('combobox',{name:'Rol de prueba',exact:true}).selectOption('teacher');
 await expect(page.getByLabel('Docente para probar')).toHaveValue(teacher);
 await expect(page.getByLabel('Motivo de soporte')).toHaveCount(0);
 await page.screenshot({path:`/private/tmp/micole-owner-testing-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Entrar en modo de pruebas'}).click();
 const banner=page.getByRole('region',{name:'Sesión de pruebas'});await expect(banner).toContainText('Pruebas · Docente');
 await banner.getByRole('button',{name:'Cambiar rol'}).click();
 await expect(page.getByRole('heading',{name:'Probar roles',exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Rol de prueba',exact:true}).selectOption('mother');
 await page.getByRole('button',{name:'Entrar en modo de pruebas'}).click();
 await expect(banner).toContainText('Pruebas · Familia');
 await page.goto('/app/calendar');await expect(page.locator('main h1').first()).toHaveText('Agenda');
 await expect(page.locator('.access-banner')).toHaveCount(0);await expect(banner).toContainText('sin bloqueo por pagos');
 await banner.getByRole('button',{name:'Cambiar rol'}).click();
 await page.getByRole('combobox',{name:'Rol de prueba',exact:true}).selectOption('student');
 await page.getByRole('button',{name:'Entrar en modo de pruebas'}).click();
 await expect(banner).toContainText('Pruebas · Estudiante');
 await page.goto('/app/calendar');await expect(page.locator('main h1').first()).toHaveText('Agenda');
 await expect(page.locator('.access-banner')).toHaveCount(0);
 await banner.getByRole('button',{name:'Volver a superadmin'}).click();
 await expect(page.getByRole('heading',{name:'Resumen de plataforma'})).toBeVisible();
 expect(calls.filter(c=>c.name==='start_test_session').map(c=>c.body)).toEqual([{p_school_id:school,p_role:'teacher',p_target_id:teacher,p_relationship:null},{p_school_id:school,p_role:'guardian',p_target_id:child,p_relationship:'mother'},{p_school_id:school,p_role:'student',p_target_id:child,p_relationship:null}]);
 expect(calls.some(c=>c.name==='start_support_session')).toBe(false);
});
