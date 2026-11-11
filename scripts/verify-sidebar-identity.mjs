// Uses the persisted QA account; alternate school metadata exists only in this browser.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {session,qa,url} from './qa-session.mjs';

const origin=process.env.MICOLE_SIDEBAR_TEST_URL||'http://127.0.0.1:4183';
const folder='output/qa/2026-11-09-sidebar-identity';
await fs.mkdir(folder,{recursive:true});
if(origin.startsWith('https:')){
 const report=JSON.parse(await fs.readFile(folder+'/release.json','utf8'));assert.equal(report.promoted,true);
 await Promise.all(report.checks.map(async item=>{
  const response=await fetch(origin+item.path);assert.equal(response.status,200);
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),item.sha256);
 }));
}
const c=await session('director'),stored=(await c.auth.getSession()).data.session;
const {data:school,error}=await c.from('schools').select('id,name,appearance').eq('id',qa.schoolId).single();
if(error)throw Error(error.message);
assert.ok(school.appearance);
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(({key,value,user,school})=>{
 localStorage.setItem(key,value);sessionStorage.setItem(`micole_selected_site:${user}:director`,school);
},{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored),user:stored.user.id,school:qa.schoolId});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
let metadata;
await page.route('**/rest/v1/schools?*',async route=>{
 try{
  const response=await route.fetch(),body=await response.json();
  await route.fulfill({response,json:body.map(row=>row.id===qa.schoolId&&metadata?{...row,...metadata}:row)});
 }catch{
  if(!page.isClosed())errors.push('School metadata preview request did not complete');
 }
});
async function load(){
 await page.goto(origin+'/app/overview',{waitUntil:'domcontentloaded'});
 await page.locator('.school-identity-home').waitFor({state:'attached'});
 await page.locator('.sidebar-platform-credit .micole-logo').waitFor({state:'attached'});
 await page.evaluate(()=>document.fonts.ready);
}
async function screenshot(name){await page.screenshot({path:`${folder}/${name}.png`,fullPage:false});}
async function openMenu(){
 await page.getByRole('button',{name:'Abrir menú',exact:true}).click();
 await page.waitForFunction(()=>Math.abs(document.querySelector('.sidebar').getBoundingClientRect().x)<1);
}
async function assertIdentity(){
 const logo=await page.locator('.school-identity-logo').boundingBox();assert.ok(logo.width>=72&&logo.height>=72);
 const brand=await page.locator('.sidebar-platform-credit .micole-logo').boundingBox();assert.ok(brand.width<=60);
 assert.equal(await page.locator('.sidebar .brand .micole-logo').count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
}
try{
 await load();await assertIdentity();
 assert.equal(await page.locator('.school-identity-copy strong').innerText(),school.name);
 assert.equal(await page.locator('.app-layout').getAttribute('data-template'),school.appearance.template);
 await screenshot('desktop');checks.push('Institution logo >=72px, full name, MiCole secondary at footer');
 await page.goto(origin+'/app/identityStudio',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'Un espacio que se siente de tu colegio.',exact:true}).waitFor();
 assert.equal(await page.locator('.template-choice').count(),5);checks.push('Five existing templates preserved');
 const templates=[['aurora','#5B48B5','#D48745'],['academia','#173B58','#B58A36'],['bosque','#23614F','#A76D31'],['atelier','#A83E5C','#3D699D'],['horizonte','#254EBB','#117E88']];
 for(const [template,primary,accent] of templates){
  metadata={appearance:{...school.appearance,template,primary,accent}};
  await load();await page.waitForFunction(t=>document.querySelector('.app-layout')?.dataset.template===t,template);
  await assertIdentity();await screenshot('template-'+template);
 }
 checks.push('Identity works with all five light and dark templates without saving changes');
 metadata={name:'Pinitos montessori',appearance:null,workspace_mode:'kinder',site_name:'Sede principal'};
 await load();await assertIdentity();assert.equal(await page.locator('.school-identity-copy strong').innerText(),metadata.name);
 await screenshot('non-pilot-kinder');checks.push('Institution has visual priority without pilot appearance');
 await page.setViewportSize({width:390,height:844});await load();
 await openMenu();
 await page.locator('.sidebar.sidebar-open').waitFor();await assertIdentity();
 await screenshot('mobile-menu');
 await page.getByRole('button',{name:'Cerrar menú',exact:true}).click();
 await page.locator('.sidebar.sidebar-open').waitFor({state:'detached'});
 await openMenu();
 await page.locator('.school-identity-home').click();
 await page.locator('.sidebar.sidebar-open').waitFor({state:'detached'});
 assert.equal(new URL(page.url()).pathname,'/app/overview');checks.push('390px drawer opens, closes and institutional home link keeps navigation');
 metadata={name:'Unidad Educativa Montessori de Nuestra Comunidad — Institución de Pruebas',logo_url:origin+'/missing-school-logo.png',appearance:null};
 await load();await openMenu();
 await page.locator('.school-identity-initials').waitFor();await assertIdentity();await screenshot('mobile-long-name-fallback');
 const fits=await page.locator('.school-identity-copy strong').evaluate(e=>e.scrollWidth<=e.clientWidth);assert.equal(fits,true);
 checks.push('Long school names wrap; unavailable logos show institution initials');
 metadata=undefined;await page.setViewportSize({width:1440,height:1000});await load();
 const {data:after,error:afterError}=await c.from('schools').select('id,name,appearance').eq('id',qa.schoolId).single();if(afterError)throw Error(afterError.message);assert.deepEqual(after,school);
 assert.deepEqual(errors,[]);
 const result={status:'passed',origin,checks,institutionWrites:0,browserErrors:errors};
 await fs.writeFile(`${folder}/${origin.startsWith('https:')?'public':'local'}-verification.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await screenshot('failed');throw e;}
finally{await page.unrouteAll({behavior:'wait'});await context.close();await browser.close();await c.auth.signOut({scope:'local'});}
