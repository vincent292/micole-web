import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {session,rpc,qa,url} from './qa-session.mjs';
const fixture=JSON.parse(await fs.readFile('tmp/academic-workspaces-fixture.json','utf8'));
const folder='output/qa/2026-11-12-native-academic-workspaces',origin='http://127.0.0.1:18766',stamp=Date.now().toString().slice(-8);
const browser=await chromium.launch(),contexts=[],clients=[],errors=[];
async function actor(key){const client=await session(key);clients.push(client);const stored=(await client.auth.getSession()).data.session;const context=await browser.newContext({viewport:{width:390,height:844}});contexts.push(context);context.setDefaultTimeout(25000);await context.addInitScript(({key,value})=>sessionStorage.setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored)});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {page,client,context};}
async function select(page,label,value,multiple=false){await page.getByRole('button',{name:label,exact:true}).click();await page.getByRole('button',{name:value,exact:true}).click();if(multiple)await page.getByRole('button',{name:'Listo',exact:true}).click();}
async function save(page,name='Guardar',method){const pending=method?page.waitForResponse(r=>r.url().endsWith('/rpc/'+method)&&r.request().method()==='POST'):null;await page.getByRole('button',{name,exact:true}).click();if(pending){const response=await pending;const raw=await response.text();const body=raw?JSON.parse(raw):null;assert.ok(response.ok(),JSON.stringify(body));return body;}}
const result={status:'running',productionBankCalls:0,realSchoolWrites:0};
try{
 const secretary=await actor('scheduler'),page=secretary.page;
 await page.goto(origin+'/workspace/classrooms');await page.getByRole('button',{name:'Crear grado o grupo',exact:true}).click();await page.getByLabel('Nombre del grado o grupo',{exact:true}).fill('Grupo nativo QA '+stamp);
 const gradeId=await save(page,'Guardar','save_school_grade');
 await page.getByRole('button',{name:'Agregar paralelo a Grupo nativo QA '+stamp,exact:true}).click();await page.getByLabel('Nombre del paralelo',{exact:true}).fill('Blanco');
 const roomId=await save(page,'Guardar','save_academic_parallel');
 await page.goto(origin+`/workspace/classrooms?room=${roomId}&tab=subjects`);await page.getByRole('button',{name:'Asignar materia',exact:true}).click();await page.getByLabel('Materia',{exact:true}).fill('Lectura nativa QA '+stamp);
 const {data:teachers,error}=await secretary.client.from('teachers').select('id,name').eq('school_id',qa.schoolId).eq('status','active');if(error)throw error;assert.ok(teachers.length);await select(page,'Docentes de la materia',teachers[0].name,true);await save(page,'Guardar','configure_class_subject');
 const structure=await rpc(secretary.client,'academic_structure',{p_school:qa.schoolId});assert.ok(structure.grades.some(g=>g.id===gradeId));
 const {data:links}=await secretary.client.from('teacher_classrooms').select('*').eq('classroom_id',roomId).eq('teacher_id',teachers[0].id);assert.equal(links.length,1);
 await page.screenshot({path:folder+'/secretary-created-parallel.png'});result.secretaryGradeParallelSubjectAndTeacherLink=true;
 const director=await actor('director'),schedulerEmail=qa.accounts.find(a=>a.key==='scheduler').email;
 async function collection(active){await director.page.goto(origin+'/workspace/settings');await director.page.getByRole('button',{name:'Editar permisos de '+schedulerEmail,exact:true}).click();const toggle=director.page.getByRole('switch',{name:'Habilitar caja y recepción de cobros',exact:true});if(await toggle.isChecked()!==active)await toggle.click();await save(director.page,'Guardar','save_secretary_access');await page.goto(origin+'/workspace/cash');if(active)await page.getByRole('heading',{name:'Caja y cobros',exact:true}).waitFor();else await page.getByRole('heading',{name:'Acceso restringido',exact:true}).waitFor();}
 try{await collection(true);await page.screenshot({path:folder+'/secretary-authorized-cash.png'});}finally{await collection(false);}
 result.collectionEnabledAndRevoked=true;
 const directorB=await actor('directorb');await directorB.page.goto(origin+`/workspace/classrooms?room=${fixture.roomIds[0]}&tab=records&student=${fixture.children[0]}`);const popup=directorB.context.waitForEvent('page');await directorB.page.getByRole('button',{name:'Compartir PDF membretado',exact:true}).click();const document=await popup;await document.getByRole('heading',{name:'Consolidado de notas',exact:true}).waitFor();assert.ok(await document.locator('.failed').count());await document.pdf({path:folder+'/consolidated-native.pdf',format:'A4',printBackground:true,preferCSSPageSize:true});await document.close();result.brandedPdfWithFailedMarks=true;
 const teacher=await actor('teacherc');const route=`/workspace/classrooms?room=${fixture.roomIds[0]}&tab=subject&subject=${fixture.subjects.math}`;await teacher.page.goto(origin+route+'&section=followup');await teacher.page.getByRole('button',{name:'Agregar observación',exact:true}).click();
 const {data:pupil}=await teacher.client.from('students').select('first_name,last_name').eq('id',fixture.children[0]).single();await select(teacher.page,'Alumno',pupil.first_name+' '+pupil.last_name);await teacher.page.getByLabel('Descripción',{exact:true}).fill('Reconocimiento desde app nativa QA '+stamp);
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1ioAAAAASUVORK5CYII=','base64');await fs.writeFile('tmp/native-observation-test.png',image);
 const chooser=teacher.page.waitForEvent('filechooser');await teacher.page.getByRole('button',{name:'Elegir foto',exact:true}).click();await(await chooser).setFiles('tmp/native-observation-test.png');await teacher.page.getByRole('button',{name:'Quitar imagen',exact:true}).waitFor();
 await save(teacher.page,'Guardar','save_student_observation');await teacher.page.getByText('Reconocimiento desde app nativa QA '+stamp,{exact:true}).waitFor();result.teacherObservationWithPhoto=true;
 const family=await actor('familyc');await family.page.goto(origin+`/workspace/studentRecord?student=${fixture.children[0]}&tab=followup`);await family.page.getByText('Reconocimiento desde app nativa QA '+stamp,{exact:true}).waitFor();await family.page.getByLabel('Foto adjunta a la observación').first().waitFor();await family.page.screenshot({path:folder+'/family-receives-native-observation.png'});result.correctPupilAndImmediateFamilyVisibility=true;
 assert.deepEqual(errors,[]);result.status='passed';result.browserErrors=errors;
}catch(e){for(let i=0;i<contexts.length;i++){for(const page of contexts[i].pages()){await page.screenshot({path:`${folder}/flow-failed-${i}.png`}).catch(()=>{});await fs.writeFile(`${folder}/flow-failed-${i}.txt`,await page.locator('body').innerText().catch(()=>''));}}throw e;}
finally{for(const context of contexts)await context.close();for(const client of clients)await client.auth.signOut({scope:'local'});await browser.close();await fs.writeFile(folder+'/flows.json',JSON.stringify(result,null,2)+'\n');}
console.log(JSON.stringify(result));
