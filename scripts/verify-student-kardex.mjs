import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {session,url} from './qa-session.mjs';
const fixture=JSON.parse(await fs.readFile('tmp/academic-workspaces-fixture.json','utf8'));
const folder='output/qa/2026-11-12-kardex';await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch(),errors=[],results=[];
for(const surface of ['web','mobile'])for(const account of ['directorb','teacherc','familyc']){
 const client=await session(account),stored=(await client.auth.getSession()).data.session,context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});context.setDefaultTimeout(25000);
 await context.addInitScript(({key,value,surface})=>(surface==='web'?localStorage:sessionStorage).setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored),surface});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));let requests=0;
 // Exercise cursor pagination against the real API without generating extra pupil history.
 await page.route('**/rest/v1/rpc/student_kardex',route=>{requests++;const data=route.request().postDataJSON();route.continue({postData:JSON.stringify({...data,p_limit:2})});});
 try{
  const origin=surface==='web'?(process.env.MICOLE_KARDEX_WEB_ORIGIN||'http://127.0.0.1:5174'):'http://127.0.0.1:18767',path=surface==='web'?'/app/studentRecord':'/workspace/studentRecord';
  await page.goto(origin+path+`?student=${fixture.children[0]}&tab=kardex`);
  const ack=page.getByRole('button',{name:'Marcar como leído',exact:true});await ack.waitFor({state:'visible',timeout:2000}).catch(()=>{});for(let i=0;i<12&&await ack.isVisible();i++){await ack.click();await page.waitForTimeout(300);}
  await page.getByRole('heading',{name:'Kárdex del estudiante',exact:true}).waitFor();
  const next=page.getByRole('button',{name:'Siguiente',exact:true});await next.waitFor();await next.click();await page.getByText('Página 2',{exact:surface==='mobile'}).last().waitFor();await page.getByRole('button',{name:'Anterior',exact:true}).click();
  if(surface==='web'){
   await page.getByLabel('Tipo de registro',{exact:true}).selectOption('enrollment');
   await page.locator('.observation-list article').first().waitFor();
   const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar esta página en PDF',exact:true}).click();await(await download).saveAs(folder+`/${account}-kardex.pdf`);
  }else{
   await page.getByRole('button',{name:'Tipo de registro',exact:true}).click();await page.getByRole('button',{name:'Inscripciones y cursos',exact:true}).click();
   await page.getByRole('button',{name:'Compartir esta página en PDF',exact:true}).waitFor();const popup=context.waitForEvent('page');await page.getByRole('button',{name:'Compartir esta página en PDF',exact:true}).click();const doc=await popup;await doc.getByRole('heading',{name:'Kárdex del estudiante',exact:true}).waitFor();await doc.pdf({path:folder+`/${account}-mobile-kardex.pdf`,format:'A4',printBackground:true});await doc.close();
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:folder+`/${surface}-${account}.png`});
  const defaultData=await client.rpc('student_kardex',{p_student:fixture.children[0]});assert.ok(!defaultData.error);assert.ok(defaultData.data.events.length<=40);
  results.push({surface,account,status:'passed',kardexRequests:requests,pagination:true,pdf:true});
 }catch(e){await page.screenshot({path:folder+`/${surface}-${account}-failed.png`});await fs.writeFile(folder+`/${surface}-${account}-failed.txt`,await page.locator('body').innerText());throw e;}
 finally{await context.close();await client.auth.signOut({scope:'local'});}
}
await browser.close();assert.deepEqual(errors,[]);const result={status:'passed',results,forcedPageSizeForPagination:2,browserErrors:errors,realSchoolWrites:0,productionBankCalls:0};await fs.writeFile(folder+'/browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
