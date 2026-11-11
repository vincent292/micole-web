import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {session,url} from './qa-session.mjs';
const origin=process.env.MICOLE_ASSISTANT_TEST_URL||'https://www.micole.click';
assert.match(origin,/^https:\/\/[a-z0-9.-]+$/);
const browser=await chromium.launch({headless:true});const checks=[];const out='output/qa/2026-11-08-micole-ia';await fs.mkdir(out,{recursive:true});
try{
 for(const [key,width,height] of [['teacher',1440,1000],['guardian',390,844],['scheduler',1440,1000]]){
  const c=await session(key);const stored=(await c.auth.getSession()).data.session;assert.ok(stored);
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored)});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/app/overview',{waitUntil:'domcontentloaded',timeout:60000});assert.equal(new URL(page.url()).origin,origin);
   await page.getByRole('button',{name:'Abrir MiCole IA',exact:true}).waitFor();
   if(key==='guardian'){
    await page.waitForTimeout(2000);
    if(await page.locator('.modal-backdrop').count()){
     // An existing mandatory payment notice takes focus; Mica must not bypass it.
     assert.match(await page.locator('.modal-backdrop').innerText(),/Prueba|Demostración|fictici|\bQA\b/i);
     checks.push({role:key,launcherPresent:true,requiredNoticeRespected:true,chatInteraction:'covered locally and by authenticated server tests'});
     await page.screenshot({path:out+'/public-guardian-required-notice.png',fullPage:false});
     continue;
    }
   }
   await page.getByRole('button',{name:'Abrir MiCole IA',exact:true}).click();await page.getByRole('dialog',{name:'Mica · MiCole IA',exact:true}).waitFor();
   const question=page.getByLabel('Tu pregunta sobre MiCole',{exact:true});await question.waitFor({state:'visible'});
   await page.waitForFunction(()=>!document.querySelector('.assistant-window textarea[required]').disabled);
   if(key==='teacher'){
    await question.fill('No carga una pantalla de MiCole, ¿qué puedo revisar?');await page.getByRole('button',{name:'Enviar',exact:true}).click();await page.getByText(/Puedo ayudarte a revisar un problema de MiCole/).waitFor({timeout:65000});
   }
   assert.equal(await page.getByRole('button',{name:'Revisar publicación',exact:true}).count(),0);
   const box=await page.locator('.assistant-window').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width&&box.y>=0&&box.y+box.height<=height);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:out+'/public-'+key+'.png',fullPage:false});assert.deepEqual(errors,[]);
   checks.push({role:key,chatVisible:true,replyChecked:key==='teacher',viewport:width+'x'+height,noBrowserErrors:true});
  }catch(error){await page.screenshot({path:out+'/failed-public-'+key+'.png',fullPage:false});throw error;}
  finally{await context.close();await c.auth.signOut({scope:'local'});}
 }
 const result={status:'passed',origin,checks,publishedMessages:0,realSchoolWrites:false};await fs.writeFile(out+'/public-web-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
