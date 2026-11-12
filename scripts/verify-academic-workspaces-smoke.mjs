import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {session,qa,url} from './qa-session.mjs';
const fixture=JSON.parse(await fs.readFile('tmp/academic-workspaces-fixture.json','utf8')),origin=process.env.MICOLE_ACADEMIC_TEST_URL||'http://localhost:5173',folder=process.env.MICOLE_ACADEMIC_QA_FOLDER||'output/qa/2026-11-12-academic-workspaces';
const browser=await chromium.launch(),errors=[],report=[];
for(const [key,role,school,heading] of [['directorb','director',fixture.schoolId,'Tablero de Dirección'],['teacherc','teacher',fixture.schoolId,'Mi jornada docente'],['scheduler','scheduler',qa.schoolId,'Gestión de Secretaría'],['familyc','guardian',fixture.schoolId,null]]){
 const client=await session(key),stored=(await client.auth.getSession()).data.session,context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 await context.addInitScript(({key,value,user,school,role})=>{localStorage.setItem(key,value);sessionStorage.setItem(`micole_selected_site:${user}:${role}`,school);},{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored),user:stored.user.id,school,role});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(origin+'/app/overview',{waitUntil:'domcontentloaded'});
  if(heading)await page.getByRole('heading',{name:heading,exact:true}).waitFor();else await page.getByRole('heading',{name:'Tu día, de un vistazo',exact:true}).waitFor();
  if(role==='director')await page.locator('.institution-indicator').first().waitFor();
  if(role==='teacher')await page.getByRole('heading',{name:'Mis materias',exact:true}).waitFor();
  await page.screenshot({path:`${folder}/${key}-home.png`});
  if(role!=='guardian'){
   await page.goto(origin+'/app/classrooms',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:school===fixture.schoolId?'Grados y paralelos':'Grupos y aulas del kínder',exact:true}).waitFor();await page.screenshot({path:`${folder}/${key}-structure.png`});
  }
  if(role==='director'||role==='teacher'){
   await page.goto(origin+`/app/classrooms?classroom=${fixture.roomIds[0]}&tab=records&student=${fixture.children[0]}`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Consolidado de notas',exact:true}).waitFor();await page.locator('.academic-summary-table tbody tr').first().waitFor();assert.ok(await page.locator('.academic-failed').count());await page.screenshot({path:`${folder}/${key}-consolidated.png`});
   if(role==='director'){const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar PDF',exact:true}).click();await(await download).saveAs('tmp/academic-consolidated.pdf');}
   await page.goto(origin+`/app/classrooms?classroom=${fixture.roomIds[0]}&tab=subject&subject=${fixture.subjects.math}&section=attendance`,{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Asistencia de la materia',exact:true}).waitFor();await page.screenshot({path:`${folder}/${key}-subject.png`});
  }
  if(role==='scheduler'){assert.equal(await page.getByRole('button',{name:'Caja y cobros',exact:true}).count(),0);await page.goto(origin+'/app/enrollment',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Inscripciones',level:2,exact:true}).waitFor();await page.locator('.registration-list').waitFor();}
  report.push({role,status:'passed'});
 }catch(error){await page.screenshot({path:`${folder}/${key}-smoke-failed.png`});throw Error(`${key}: ${String(error.message).slice(0,1300)}`);}finally{await context.close();await client.auth.signOut({scope:'local'});}
}
await browser.close();assert.deepEqual(errors,[]);await fs.writeFile(folder+'/smoke.json',JSON.stringify({origin,roles:report,browserErrors:errors},null,2));console.log(JSON.stringify({ok:true,origin,roles:report,browserErrors:errors}));
