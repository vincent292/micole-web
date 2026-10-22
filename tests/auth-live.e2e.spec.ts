import { test, expect } from "@playwright/test";
test.use({baseURL:"http://localhost:4174",reducedMotion:"reduce"});
test('Google inicia OAuth con el retorno de la app y selección de cuenta',async({page})=>{
 await page.route('**/auth/v1/settings',route=>route.fulfill({json:{external:{email:true,google:true}}}));
 await page.route('**/auth/v1/authorize?**',route=>route.fulfill({contentType:'text/html',body:'<p>Proveedor de prueba</p>'}));
 await page.goto('/login');await expect(page.getByRole('button',{name:'Continuar con Google'})).toBeVisible();
 const request=page.waitForRequest(r=>r.url().includes('/auth/v1/authorize?'));
 await page.getByRole('button',{name:'Continuar con Google'}).click();
 const url=new URL((await request).url());expect(url.searchParams.get('provider')).toBe('google');
 expect(url.searchParams.get('redirect_to')).toBe('http://localhost:4174/auth/callback');
 expect(url.searchParams.get('prompt')).toBe('select_account');
});
test('un enlace vencido explica cómo volver a ingresar y limpia el error del retorno',async({page})=>{
 await page.route('**/auth/v1/settings',route=>route.fulfill({json:{external:{email:true,google:true}}}));
 await page.goto('/auth/callback#error=access_denied&error_code=otp_expired&error_description=DESCRIPCION_PRIVADA');
 await expect(page.getByRole('alert')).toContainText('venció');await expect(page.getByRole('alert')).not.toContainText('DESCRIPCION_PRIVADA');
 await expect(page).toHaveURL('http://localhost:4174/auth/callback');
 await expect(page.getByRole('button',{name:'Continuar con Google'})).toBeVisible();
});
test('una cuenta confirmada sin vínculo escolar recibe indicaciones de acceso',async({page})=>{
 const seconds=Math.floor(Date.now()/1000), id='ab000000-0000-4000-8000-000000000099';
 const user={id,email:'unlinked@example.invalid',aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
 const token=`${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,exp:seconds+3600,iat:seconds,aud:'authenticated',role:'authenticated'})).toString('base64url')}.test`;
 await page.addInitScript(({user,token,seconds})=>localStorage.setItem('sb-micole-test-auth-token',JSON.stringify({access_token:token,refresh_token:'test',expires_at:seconds+3600,expires_in:3600,token_type:'bearer',user})),{user,token,seconds});
 await page.route('**/auth/v1/**',r=>r.fulfill({json:r.request().url().includes('/settings')?{external:{email:true,google:true}}:user}));
 await page.route('**/rest/v1/**',r=>r.fulfill({json:r.request().url().includes('/finance_register')?{receipts:[],invoices:[]}:r.request().url().includes('/workspace_identity')?{id,email:user.email,name:'Cuenta nueva',roles:[],memberships:[],guardianStudentIds:[],teacherIds:[],studentIds:[]}:[]}));
 await page.goto('/login');await expect(page.getByRole('heading',{name:'Tu acceso está por vincularse'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Comprobar mi acceso'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Solicitar incorporación'})).toHaveCount(0);
 await page.getByRole('button',{name:'Quiero incorporar mi institución'}).click();await expect(page.getByRole('button',{name:'Solicitar incorporación'})).toBeVisible();
});

for(const scenario of ['enlace','correo'])test(`el acceso ${scenario} abre la demo sin enviar OTP`,async({page})=>{
 const otp:string[]=[];page.on('request',r=>{if(r.url().includes('/auth/v1/otp'))otp.push(r.url());});
 await page.route('**/auth/v1/settings',r=>r.fulfill({json:{external:{email:true,google:true}}}));
 await page.route('https://micole-demo.vercel.app/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Acceso local a la demo</h1>'}));
 await page.goto('/login');
 if(scenario==='enlace')await page.getByRole('link',{name:'Entrar a la demo'}).click();
 else{await page.getByRole('button',{name:'Recibir enlace',exact:true}).click();await page.getByLabel('Tu correo',{exact:true}).fill('direccion@micole.test');await page.getByRole('button',{name:'Enviar enlace de acceso',exact:true}).click();}
 await expect(page).toHaveURL(scenario==='correo'?'https://micole-demo.vercel.app/?perfil=director':'https://micole-demo.vercel.app/');expect(otp).toEqual([]);
});

test('contraseña entra directamente con la cuenta confirmada y no envía OTP',async({page})=>{
 const id='ab000000-0000-4000-8000-000000000098',email='direccion@pruebas.micole.test',user={id,email,aud:'authenticated',role:'authenticated',user_metadata:{full_name:'Dirección de pruebas'},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
 const seconds=Math.floor(Date.now()/1000),encode=(v:unknown)=>Buffer.from(JSON.stringify(v)).toString('base64url'),token=`${encode({alg:'HS256'})}.${encode({sub:id,exp:seconds+3600,iat:seconds,aud:'authenticated',role:'authenticated'})}.test`;
 const otp:string[]=[];page.on('request',r=>{if(r.url().includes('/auth/v1/otp'))otp.push(r.url());});
 await page.route('**/auth/v1/settings',r=>r.fulfill({json:{external:{email:true,google:true}}}));
 await page.route('**/auth/v1/user',r=>r.fulfill({json:user}));
 await page.route('**/auth/v1/token?grant_type=password',r=>{
  expect(r.request().postDataJSON()).toMatchObject({email,password:'SoloParaElTest!'});
  return r.fulfill({json:{access_token:token,refresh_token:'test-password',expires_in:3600,token_type:'bearer',user}});
 });
 await page.route('**/rest/v1/**',r=>r.fulfill({json:r.request().url().includes('/finance_register')?{receipts:[],invoices:[]}:r.request().url().includes('/workspace_identity')?{id,email,name:'Dirección de pruebas',testing:true,roles:[],memberships:[],guardianStudentIds:[],teacherIds:[],studentIds:[]}:[]}));
 await page.goto('/login');await page.getByLabel('Tu correo',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('SoloParaElTest!');
 await page.getByRole('button',{name:'Ingresar con contraseña',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Tu acceso está por vincularse'})).toBeVisible();expect(otp).toEqual([]);
});
test('contraseña errónea no crea ni confirma cuentas y muestra un mensaje claro',async({page})=>{
 await page.route('**/auth/v1/settings',r=>r.fulfill({json:{external:{email:true,google:true}}}));
 await page.route('**/auth/v1/token?grant_type=password',r=>r.fulfill({status:400,json:{code:'invalid_credentials',msg:'Invalid login credentials'}}));
 await page.goto('/login');await page.getByLabel('Tu correo',{exact:true}).fill('docente@pruebas.micole.test');await page.getByLabel('Contraseña',{exact:true}).fill('incorrecta');await page.getByRole('button',{name:'Ingresar con contraseña',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('El correo o la contraseña no son correctos.');await expect(page).toHaveURL(/\/login$/);
});
