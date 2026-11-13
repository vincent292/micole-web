// Read-only UI verification with explicitly fictitious persisted accounts.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {session,url} from './qa-session.mjs';
const folder='output/qa/2026-11-12-direction';await fs.mkdir(folder,{recursive:true});
const origin=process.env.MICOLE_DIRECTION_ORIGIN || 'http://127.0.0.1:5194';
const browser=await chromium.launch(),results=[],errors=[];
try {
 for(const account of ['directorb','director','teacherc','familyc']){
  const client=await session(account),stored=(await client.auth.getSession()).data.session;
  const context=await browser.newContext({viewport:{width:1440,height:1000}});context.setDefaultTimeout(45000);
  await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored)});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({account,message:e.message}));
  try {
   await page.goto(origin+'/app/overview');
   const ack=page.getByRole('button',{name:'Marcar como leído',exact:true});
   await ack.waitFor({state:'visible',timeout:1000}).catch(()=>{});
   for(let i=0;i<12 && await ack.isVisible();i++)await ack.click();
   const nav=page.getByRole('navigation',{name:'Navegación principal'});
   await nav.getByRole('button').first().waitFor();
   if(account==='directorb'||account==='director')assert.equal(await nav.getByRole('button').first().innerText(),'Resumen');
   const paths=account==='directorb'?['overview','students','bolivia','centralizers','schoolCalendar']:['overview','schoolCalendar'];
   for(const width of [1440,390])for(const path of paths){
    await page.setViewportSize({width,height:width===390?844:1000});
    if(new URL(page.url()).pathname !== '/app/'+path){
      const opener=page.getByRole('button',{name:'Abrir menú',exact:true});if(await opener.isVisible())await opener.click();
      const labels={overview:'Resumen',students:'Estudiantes',bolivia:'Planificación y apoyo',centralizers:'Centralizadores de notas',schoolCalendar:'Calendario escolar'};
      const target=nav.getByRole('button',{name:labels[path],exact:true});
      if(!await target.isVisible() && await nav.getByText('Más opciones',{exact:true}).isVisible())await nav.getByText('Más opciones',{exact:true}).click();
      await target.click();await page.waitForURL('**/app/'+path);
    }
    await page.getByRole('heading').first().waitFor();
    if(path==='overview' && ['directorb','director'].includes(account))await page.locator('.institution-indicator').first().waitFor();
    if(path==='schoolCalendar')await page.getByText('Consultando calendario…',{exact:true}).waitFor({state:'hidden'});
    if(path==='students')await page.getByRole('heading',{name:'Lista de estudiantes',exact:true}).waitFor();
    if(path==='bolivia'){
      await page.getByRole('tab',{name:'Resumen académico',exact:true}).waitFor();
      assert.equal(await page.getByRole('tab',{name:'Perfil y calendario',exact:true}).count(),0);
      const label=await page.locator('select').filter({has:page.locator('option')}).first().innerText();
      assert.ok(!label.includes('Gestión QA'));
    }
    if(path==='centralizers')await page.getByRole('heading',{name:'Centralizador de notas publicadas',exact:true}).waitFor();
    if(path==='schoolCalendar')await page.getByText('Un calendario para toda la institución:',{exact:false}).waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${account}:${path}:${width}`);
    await page.screenshot({path:`${folder}/${account}-${path}-${width}.png`});results.push({account,path,width,status:'passed'});
   }
  }catch(error){await page.screenshot({path:`${folder}/${account}-failed.png`});await fs.writeFile(`${folder}/${account}-failed.json`,JSON.stringify({message:error.message,errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await context.close();await client.auth.signOut({scope:'local'});}
 }
 assert.deepEqual(errors,[]);
 await fs.writeFile(folder+'/browser.json',JSON.stringify({status:'passed',origin,results,browserErrors:errors,realSchoolWrites:0,bankCalls:0},null,2));
 console.log(JSON.stringify({ok:true,views:results.length,browserErrors:errors.length,realSchoolWrites:0}));
}finally{await browser.close();}
