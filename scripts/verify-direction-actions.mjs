import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {session,url,rpc} from './qa-session.mjs';
const origin=process.env.MICOLE_DIRECTION_ORIGIN||'http://127.0.0.1:5194',folder='output/qa/2026-11-12-direction';
const client=await session('directorb'),stored=(await client.auth.getSession()).data.session,identity=await rpc(client,'workspace_identity',{}),school=identity.memberships.find(m=>m.role==='director').schoolId;
const real=await rpc(client,'bolivia_workspace',{p_school_id:school,p_year_id:null});assert.ok(real.canManage&&real.rooms.length);
const room=real.rooms[0].id,term='fixture-term';
const cards=[55,86,null].map((score,index)=>({id:'fixture-card-'+index,student_id:'fixture-student-'+index,classroom_id:room,term_id:term,content:{studentName:'Alumno de ejemplo '+(index+1),classroomName:real.rooms[0].name,year:real.year.year,termName:'Período de demostración',complete:score!==null,subjects:[{subject:'Matemática',score,missing:score===null?1:0}]}}));
const browser=await chromium.launch(),context=await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
await context.addInitScript(({key,value})=>localStorage.setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored)});
let calendar,official;
await page.route('**/rest/v1/rpc/bolivia_workspace',route=>route.fulfill({json:{...real,cards}}));
await page.route('**/rest/v1/rpc/academic_structure',route=>route.fulfill({json:{settings:{pass_mark:70,revision:0},grades:[]}}));
await page.route('**/rest/v1/rpc/add_school_calendar_period',route=>{calendar=route.request().postDataJSON();return route.fulfill({json:{added:5,preserved:0,institutionWide:true}});});
await page.route('**/rest/v1/rpc/save_school',route=>{official=route.request().postDataJSON();return route.fulfill({json:null});});
try{
 await page.goto(origin+'/app/centralizers');await page.locator('.centralizer-table table').waitFor();await page.locator('.grade-below-minimum').waitFor();
 assert.equal(await page.locator('.grade-below-minimum').innerText(),'55.0');assert.equal(await page.getByRole('cell',{name:'Pendiente',exact:true}).count(),1);
 assert.equal(await page.locator('.centralizer-table tbody tr').count(),3);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await page.screenshot({path:folder+'/centralizer-demo-mobile.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar centralizador CSV',exact:true}).click();await(await download).saveAs(folder+'/centralizer-demo.csv');
 await page.goto(origin+'/app/schoolCalendar');await page.getByRole('button',{name:'Agregar feriado o descanso',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Fecha',{exact:true}).fill('2026-07-06');await dialog.getByLabel('Hasta (opcional, para descansos de varios días)',{exact:true}).fill('2026-07-10');await dialog.getByLabel('Motivo o nombre del día',{exact:true}).fill('Descanso de demostración');await dialog.getByRole('combobox',{name:'Actividad del día',exact:true}).selectOption('suspension');await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(calendar.p_school_id,school);assert.equal(calendar.p_from,'2026-07-06');assert.equal(calendar.p_to,'2026-07-10');assert.ok(!calendar.p_classroom_id);
 await page.goto(origin+'/app/settings');await page.getByRole('button',{name:'Editar identidad',exact:true}).click();
 const nav=dialog.getByRole('navigation',{name:'Secciones del formulario'}),officialStep=nav.getByRole('button',{name:/Datos oficiales de la institución$/});for(let i=0;await officialStep.isDisabled()&&i<12;i++)await dialog.getByRole('button',{name:'Siguiente',exact:true}).click();await officialStep.click();
 for(const [label,value] of [['Código de unidad educativa','123456'],['Distrito educativo','Distrito de demostración'],['Departamento','La Paz'],['Resolución / autorización de funcionamiento','Resolución de ejemplo'],['Normativa de referencia','Normativa registrada por la institución']])await dialog.getByLabel(label,{exact:true}).fill(value);
 while(await dialog.getByRole('button',{name:'Siguiente',exact:true}).count())await dialog.getByRole('button',{name:'Siguiente',exact:true}).click();await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(official.p_school.official_info.unitCode,'123456');assert.deepEqual(official.p_school.education_levels,['Primaria','Secundaria']);assert.equal(official.p_school.workspace_mode,'school');assert.deepEqual(errors,[]);
 const result={ok:true,centralizerVisible:true,configuredThreshold:70,pendingPreserved:true,csv:true,calendarOneRequest:true,officialFieldsPayload:true,mockedGradeData:true,mockedCalendarWrite:true,mockedIdentityWrite:true,realSchoolWrites:0,browserErrors:errors};await fs.writeFile(folder+'/actions.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page.screenshot({path:folder+'/actions-failed.png'});await fs.writeFile(folder+'/actions-failed.json',JSON.stringify({message:e.message,errors,text:await page.locator('body').innerText()},null,2));throw e;}
finally{await context.close();await browser.close();await client.auth.signOut({scope:'local'});}
