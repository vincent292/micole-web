import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {PDFDocument,StandardFonts} from 'pdf-lib';import {session,qa} from './qa-session.mjs';
const folder='output/qa/2026-11-09-registration';await fs.mkdir('tmp/registration-downloads',{recursive:true});
const doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica),page=doc.addPage([595,400]);
for(const [i,text] of ['LISTA FICTICIA PARA PRUEBA DE IMPORTACION','Nombres | Apellidos | RUDE | CI','Jazmin | Lista Prueba | VREG-PDF-001 | QA-PDF-001','Leon | Lista Prueba | VREG-PDF-002 | QA-PDF-002'].entries())page.drawText(text,{x:35,y:350-i*36,font,size:i===0?14:11});
const bytes=await doc.save();await fs.writeFile('tmp/registration-downloads/source-roster.pdf',bytes);
const c=await session('director');try{
 const {data,error}=await c.functions.invoke('document-analyze',{body:{schoolId:qa.schoolId,year:new Date().getUTCFullYear(),kind:'roster',rosterProcessingConfirmed:true,files:[{name:'lista-ficticia.pdf',mimeType:'application/pdf',data:Buffer.from(bytes).toString('base64')}]}});
 if(error){let message='No se completó el análisis con IA.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}
 assert.equal(data.rows.length,2);assert.deepEqual(data.rows.map(r=>r.rude).sort(),['VREG-PDF-001','VREG-PDF-002']);assert.ok(data.rows.every(r=>!r.motherEmail&&!r.fatherEmail));
 await fs.writeFile('tmp/registration-analysis-result.json',JSON.stringify(data,null,2));
 const result={status:'passed',source:'synthetic PDF',rows:2,identifiersPreserved:true,missingContactsNotInvented:true,model:data.modelUsed,storedStudents:0};await fs.writeFile(folder+'/ai-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){console.error(JSON.stringify({ok:false,stage:'roster-analysis',message:e.message}));process.exitCode=1;}finally{await c.auth.signOut({scope:'local'});}
