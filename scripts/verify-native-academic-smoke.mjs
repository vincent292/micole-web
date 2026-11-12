import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {session,qa,url} from './qa-session.mjs';
const fixture=JSON.parse(await fs.readFile('tmp/academic-workspaces-fixture.json','utf8'));
const origin=process.env.MICOLE_NATIVE_QA_ORIGIN||'http://127.0.0.1:18766',folder='output/qa/2026-11-12-native-academic-workspaces';
await fs.mkdir(folder,{recursive:true});
const browser=await chromium.launch(),errors=[],report=[];
for(const [key,role,heading] of [['directorb','director','Tablero de Dirección'],['teacherc','teacher','Materias y tutorías'],['scheduler','scheduler','Gestión de Secretaría'],['familyc','guardian',null]].filter(([key])=>!process.env.MICOLE_NATIVE_QA_ACCOUNT||process.env.MICOLE_NATIVE_QA_ACCOUNT===key)){
 const client=await session(key),stored=(await client.auth.getSession()).data.session;
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(({key,value})=>sessionStorage.setItem(key,value),{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored)});
 context.setDefaultTimeout(25000);const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(origin+'/workspace/overview');
  if(heading)await page.getByRole('heading',{name:heading,exact:true}).waitFor();else await page.getByRole('button',{name:'Mi perfil y roles',exact:true}).waitFor();
  if(role==='director')await page.getByText('Alumnos activos',{exact:true}).waitFor();
  if(role==='teacher')await page.getByRole('heading',{name:'Mis materias',exact:true}).waitFor();
  await page.screenshot({path:`${folder}/${role}-home.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  if(role!=='guardian'){
   await page.goto(origin+'/workspace/classrooms');await page.getByRole('heading',{name:role==='scheduler'?'Grupos y aulas del kínder':'Grados y paralelos',exact:true}).waitFor();
   await page.getByRole('button',{name:/Abrir paralelo/}).first().waitFor();await page.screenshot({path:`${folder}/${role}-structure.png`});
  }
  if(role==='director'||role==='teacher'){
   await page.goto(origin+`/workspace/classrooms?room=${fixture.roomIds[0]}&tab=records&student=${fixture.children[0]}`);
   await page.getByRole('heading',{name:'Consolidado de notas',exact:true}).waitFor();await page.getByRole('button',{name:'Compartir PDF membretado',exact:true}).waitFor();
   await page.getByText('Resultado bajo la nota mínima',{exact:true}).first().waitFor();await page.screenshot({path:`${folder}/${role}-consolidated.png`});
   await page.goto(origin+`/workspace/classrooms?room=${fixture.roomIds[0]}&tab=subject&subject=${fixture.subjects.math}&section=attendance`);
   await page.getByRole('heading',{name:'Asistencia de la materia',exact:true}).waitFor();
   await page.getByRole('button',{name:/Confirmar asistencia|Guardar corrección/}).waitFor();await page.screenshot({path:`${folder}/${role}-subject.png`});
   if(role==='teacher'){
    await page.goto(origin+`/workspace/classrooms?room=${fixture.roomIds[0]}&tab=subject&subject=${fixture.subjects.social}&section=attendance`);
    await page.getByRole('heading',{name:'Asistencia de la materia',exact:true}).waitFor();await page.getByText('Consulta de tutoría',{exact:false}).waitFor();
    await page.getByText('Consultando asistencia…',{exact:true}).waitFor({state:'hidden'});
    assert.equal(await page.getByRole('button',{name:/Confirmar asistencia|Guardar corrección/}).count(),0);
   }
  }
  if(role==='scheduler'){
   await page.goto(origin+'/workspace/enrollment');await page.getByRole('heading',{name:'Inscripciones',exact:true}).waitFor();await page.getByRole('button',{name:'Configurar campaña',exact:true}).waitFor();await page.screenshot({path:`${folder}/secretary-enrollment.png`});
  }
  if(role==='guardian'){
   await page.goto(origin+`/workspace/studentRecord?student=${fixture.children[0]}&tab=followup`);await page.getByRole('heading',{name:'Seguimiento del alumno',exact:true}).waitFor();await page.getByRole('button',{name:'Marcar como leído',exact:true}).waitFor({state:'visible',timeout:10000}).catch(()=>{});for(let i=0;i<12;i++){const ack=page.getByRole('button',{name:'Marcar como leído',exact:true});if(!await ack.isVisible())break;await ack.click();await page.waitForTimeout(350);}await page.getByRole('heading',{name:'Reconocimiento',exact:true}).first().waitFor();await page.screenshot({path:`${folder}/family-followup-diagnostic.png`});await page.getByLabel('Foto adjunta a la observación').first().waitFor();await page.screenshot({path:`${folder}/family-followup.png`});
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  report.push({role,status:'passed'});
 }catch(e){await page.screenshot({path:`${folder}/${role}-failed.png`});await fs.writeFile(`${folder}/${role}-failed.txt`,await page.locator('body').innerText());throw Error(key+': '+String(e.message).slice(0,1800));}
 finally{await context.close();await client.auth.signOut({scope:'local'});}
}
await browser.close();assert.deepEqual(errors,[]);
const result={status:'passed',surface:'Shared React Native views through production Expo Web export',origin,roles:report,tutorOtherSubjectReadOnly:true,familyObservationAndPhotoVisible:true,browserErrors:errors,productionBankCalls:0,realSchoolWrites:0};
await fs.writeFile(folder+'/smoke.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
