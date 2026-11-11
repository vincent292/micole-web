import {test,expect} from '@playwright/test';

test('un fallo al cargar el espacio ofrece recargar y permite recuperar el acceso',async({page})=>{
 let fail=true;
 await page.route('**/src/WorkspaceApp.tsx*',route=>fail?route.abort('failed'):route.continue());
 await page.goto('http://localhost:4174/app/overview');
 await expect(page.getByRole('heading',{name:'Necesitamos volver a cargar MiCole',exact:true})).toBeVisible();
 fail=false;
 await page.getByRole('button',{name:'Recargar MiCole',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Bienvenido a MiCole',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Necesitamos volver a cargar MiCole',exact:true})).toHaveCount(0);
});

test('la campana del estudiante abre sus comunicados sin activar el lector de adultos',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const uuid=(n:number)=>`cd000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const [userId,schoolId,roomId,studentId,sourceId]=[1,2,3,4,5].map(uuid);
 const now=Math.floor(Date.now()/1000),createdAt=new Date().toISOString();
 const user={id:userId,email:'student@example.invalid',aud:'authenticated',role:'authenticated',email_confirmed_at:createdAt,user_metadata:{full_name:'Mateo QA'},app_metadata:{provider:'email'}};
 const jwt=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:userId,exp:now+3600,iat:now,aud:'authenticated',role:'authenticated'})).toString('base64url')}.test`;
 await page.addInitScript(session=>localStorage.setItem('sb-micole-test-auth-token',JSON.stringify(session)),{access_token:jwt,refresh_token:'test-refresh',expires_at:now+3600,expires_in:3600,token_type:'bearer',user});
 await page.route('**/auth/v1/**',route=>route.fulfill({json:route.request().url().includes('/settings')?{external:{email:true}}:user}));
 let read=false;
 await page.route('**/rest/v1/**',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  let json:unknown=[];
  if(name==='workspace_identity')json={id:userId,email:user.email,name:'Mateo QA',roles:['student'],memberships:[{schoolId,role:'student'}],teacherIds:[],guardianStudentIds:[],studentIds:[studentId],support:null};
  else if(name==='student_portal')json={accessAllowed:true,accessMessage:'',schools:[{id:schoolId,name:'Kínder QA',slug:'student-notices',status:'active',city:'Cochabamba',educationLevels:['Inicial'],workspaceMode:'kinder'}],classrooms:[{id:roomId,schoolId,name:'Inicial A',level:'Inicial',active:true,subjectsEnabled:false}],students:[{id:studentId,schoolId,classroomId:roomId,firstName:'Mateo',lastName:'QA',status:'active'}],events:[],dailyEntries:[],announcements:[{id:sourceId,schoolId,classroomId:roomId,title:'Aviso académico para Mateo',content:'Trae un cuento para la actividad del aula.',audience:'families',category:'academic',createdAt}]};
  else if(name==='notifications')json=[...Array.from({length:6},(_,index)=>({id:uuid(30+index),user_id:userId,school_id:schoolId,classroom_id:roomId,kind:'announcement',source_id:uuid(20+index),title:`Aviso anterior ${index}`,body:'Aviso previo del aula.',target:'announcements',alert_type:'academic',created_at:new Date((now-600+index)*1000).toISOString(),read_at:null})),{id:uuid(6),user_id:userId,school_id:schoolId,classroom_id:roomId,kind:'announcement',source_id:sourceId,title:'Aviso académico para Mateo',body:'Trae un cuento para la actividad del aula.',target:'announcements',alert_type:'academic',created_at:createdAt,read_at:read?createdAt:null}];
  else if(name==='mark_notification_read'){read=true;json=null;}
  await route.fulfill({json});
 });
 await page.goto('http://localhost:4174/app/overview');
 await expect(page.getByText('Hola, Mateo',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Notificaciones',exact:true}).click();
 await expect(page.locator('.notifications button.unread').first()).toContainText('Aviso académico para Mateo');
 await page.locator('.notifications').getByRole('button').filter({hasText:'Aviso académico para Mateo'}).click();
 await expect(page).toHaveURL(/\/app\/announcements$/);
 await expect(page.getByRole('heading',{name:'Aviso académico para Mateo',exact:true})).toBeVisible();
 await expect(page.getByText('Trae un cuento para la actividad del aula.',{exact:true})).toBeVisible();
 expect(read).toBe(true);
 await expect(page.getByRole('dialog')).toHaveCount(0);
 let logoutScope='';
 await page.route('**/auth/v1/logout*',async route=>{logoutScope=new URL(route.request().url()).searchParams.get('scope')||'';await route.fulfill({status:204,body:''});});
 await page.getByRole('button',{name:'Menú de perfil',exact:true}).click();
 await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Bienvenido a MiCole',exact:true})).toBeVisible();
 expect(logoutScope).toBe('local');
});
