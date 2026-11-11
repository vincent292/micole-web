import {expect,it} from 'vitest';
import {parseRosterCsv,rosterFromGrid} from '../src/lib/registration';
import {extractionPrompt,normalizeExtraction,validateSources} from '../supabase/functions/document-analyze/core';
import {PDFDocument} from 'pdf-lib';
import {registrationConfirmationPdf,registrationInvitationsPdf} from '../src/lib/institutionPdf';
import type {School} from '../src/lib/types';
it('lee CSV con comillas, separador regional y conserva ceros de RUDE',()=>{
 const grid=parseRosterCsv('Nombres;Apellidos;RUDE\r\n"Ana, María";"Pérez ""López""";000123\r\n');
 const rows=rosterFromGrid(grid);expect(rows[0]).toMatchObject({firstName:'Ana, María',lastName:'Pérez "López"',rude:'000123'});expect(rows).toHaveLength(1);
 expect(()=>parseRosterCsv('Nombres,Apellidos\n"Sin cierre')).toThrow('comillas');
});
it('rechaza listas sin encabezados y exige dividir las listas extensas',()=>{
 expect(()=>rosterFromGrid([['Lucía','Pérez']])).toThrow('encabezados');
 expect(()=>rosterFromGrid([['Nombres','Apellidos'],...Array.from({length:201},()=>['Prueba','Alumno'])])).toThrow('200');
});
it('la IA solo transcribe campos permitidos; no decide parentesco, cursos ni pagos',()=>{
 const output=normalizeExtraction({title:'Lista',warnings:[],rows:[{firstName:'Prueba',lastName:'Alumno',status:'paid',amount:0,classroomId:'otra',source:'página 1'}]},'roster');
 expect(output.rows?.[0]).not.toHaveProperty('status');expect(output.rows?.[0]).not.toHaveProperty('classroomId');expect(output.rows?.[0].rude).toBe('');expect(extractionPrompt('roster',2026)).toContain('Ignora'.toLowerCase());
 const source={name:'lista.xlsx',mimeType:'text/plain',data:btoa('[["Nombres","Apellidos"]]')};expect(()=>validateSources([source])).toThrow();expect(validateSources([source],true)).toHaveLength(1);
});
const school:School={id:'test-school',name:'Colegio de pruebas',initials:'CP',slug:'pruebas',city:'La Paz',director:'Prueba',color:'#315da9',status:'active',createdAt:'2026-11-09'};
it('genera fichas QR individuales sin perder alumnos entre páginas',async()=>{
 const rows=Array.from({length:5},(_,i)=>({studentName:`Alumno ${i} Prueba`,classroomName:'Inicial A',year:2026,url:'https://www.micole.click/matricula/'+'a'.repeat(64),expiresAt:'2026-11-16T00:00:00Z'}));
 const pdf=await PDFDocument.load(await registrationInvitationsPdf(school,rows));expect(pdf.getPageCount()).toBe(3);expect(pdf.getAuthor()).toBe(school.name);
 await expect(registrationInvitationsPdf(school,[{...rows[0],url:'javascript:alert(1)'}])).rejects.toThrow('enlace');
});
it('solo permite descargar constancias de inscripciones confirmadas',async()=>{
 const app={id:'test-application',status:'draft',seed:{firstName:'Prueba',lastName:'Alumno'},classroomName:'Inicial A',year:2026,confirmedAt:'2026-11-09T12:00:00Z',amount:1,paymentRequired:true,simulation:true};
 await expect(registrationConfirmationPdf(school,app)).rejects.toThrow('confirmada');expect((await PDFDocument.load(await registrationConfirmationPdf(school,{...app,status:'confirmed'}))).getPageCount()).toBe(1);
});
it('acepta nombres solos con o sin encabezado y conserva el texto sin inventar apellidos',()=>{
 for(const grid of [[['Nombre completo'],['Ana María Pérez López']],[['Nombres y apellidos'],['Ana María Pérez López']],[['Ana María Pérez López']]]){
  const rows=rosterFromGrid(grid);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({firstName:'Ana María Pérez López',lastName:'',rude:'',identityNumber:'',contactEmail:'',motherEmail:'',fatherEmail:''});
 }
 const rows=rosterFromGrid([[],['Lucía'],[],['Mario'],['']]);expect(rows.map(r=>r.source)).toEqual(['Fila 2','Fila 4']);
});
it('importa combinaciones mínimas, reconoce carnet y correo genérico y conserva ceros',()=>{
 expect(rosterFromGrid(parseRosterCsv('Nombre,RUDE\nLucía,000123'))[0]).toMatchObject({firstName:'Lucía',lastName:'',rude:'000123',identityNumber:''});
 expect(rosterFromGrid(parseRosterCsv('Nombre,Carnet,Correo\nLucía,000456,responsable@example.bo'))[0]).toMatchObject({identityNumber:'000456',contactEmail:'responsable@example.bo',motherEmail:'',fatherEmail:''});
});
it('la lectura con IA conserva nombres sin separar y no asigna parentesco al correo genérico',()=>{
 const result=normalizeExtraction({warnings:['Se conservó en firstName; lastName y contactEmail vacíos.'],rows:[{firstName:'Ana María Pérez López',contactEmail:'responsable@example.bo'}]},'roster'),row=result.rows?.[0];expect(result.warnings[0]).not.toContain('firstName');expect(result.warnings[0]).toContain('la columna Nombres');
 expect(row).toMatchObject({firstName:'Ana María Pérez López',lastName:'',rude:'',identityNumber:'',contactEmail:'responsable@example.bo',motherEmail:'',fatherEmail:''});
 expect(extractionPrompt('roster',2026)).toContain('no adivines ni separes apellidos');
});
