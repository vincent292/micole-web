import {PDFDocument,StandardFonts,rgb,type PDFFont,type PDFPage,type PDFImage} from 'pdf-lib';
import QRCode from 'qrcode';
import type {School,Announcement,SchoolReceipt} from './types';
import type {ReportCard} from './school';
import {parseAppearance,letterheadSchool,readableInk} from './schoolAppearance';
export interface SchoolCredential {id:string;schoolId:string;studentId:string;studentName:string;classroomName:string;year:number;code:string;issuedAt:string;expiresOn:string;status:'active'|'revoked'|'expired'}
export interface RegistrationInvitation {studentName:string;classroomName:string;year:number;url:string;expiresAt:string}
export async function registrationInvitationsPdf(school:School,invitations:RegistrationInvitation[]){
 if(!invitations.length||invitations.length>200)throw Error('Selecciona entre 1 y 200 fichas.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),logo=await image(pdf,school.logoUrl),primary=hex(school.appearance?.primary||school.color);
 pdf.setTitle('Fichas individuales de inscripción - '+school.name);pdf.setAuthor(school.name);
 for(let i=0;i<invitations.length;i++){
  const invitation=invitations[i],url=new URL(invitation.url);
  if(!['https:','http:'].includes(url.protocol)||!/^\/matricula\/[a-f0-9]{64}$/.test(url.pathname))throw Error('El enlace de inscripción no es válido.');
  const page=i%2===0?pdf.addPage([595.28,841.89]):pdf.getPage(pdf.getPageCount()-1),top=i%2===0?805:405;
  page.drawRectangle({x:32,y:top-355,width:531,height:355,borderColor:rule,borderWidth:1});page.drawRectangle({x:32,y:top-7,width:531,height:7,color:primary});
  if(logo)fitLogo(page,logo,53,top-87,58);else page.drawText(safe(school.initials||'IE',bold),{x:55,y:top-59,size:21,font:bold,color:primary});
  let schoolSize=15;while(lines(school.name,bold,schoolSize,398).length>2&&schoolSize>10)schoolSize--;
  lines(school.name,bold,schoolSize,398).slice(0,2).forEach((line,n)=>page.drawText(line,{x:124,y:top-38-n*(schoolSize+3),size:schoolSize,font:bold,color:ink}));
  page.drawText(`INSCRIPCIÓN ${invitation.year}`,{x:124,y:top-85,size:10,font:bold,color:muted});
  let studentSize=19;while(lines(invitation.studentName,bold,studentSize,465).length>2&&studentSize>10)studentSize--;
  lines(invitation.studentName,bold,studentSize,465).slice(0,4).forEach((line,n)=>page.drawText(line,{x:54,y:top-123-n*(studentSize+2),size:studentSize,font:bold,color:ink}));
  lines(`${invitation.classroomName} - ${school.siteName||'Sede principal'}`,font,11,465).slice(0,2).forEach((line,n)=>page.drawText(line,{x:54,y:top-174-n*15,size:11,font,color:muted}));
  const qr=await pdf.embedPng(await QRCode.toDataURL(invitation.url,{width:500,margin:4,errorCorrectionLevel:'M'}));fitLogo(page,qr,62,top-330,126);
  lines('Escanea para revisar y completar tu inscripción.',bold,13,300).forEach((line,n)=>page.drawText(line,{x:214,y:top-226-n*18,size:13,font:bold,color:ink}));
  lines('Acceso personal para el responsable autorizado. Comparte esta ficha únicamente con la familia correspondiente.',font,10,300).forEach((line,n)=>page.drawText(line,{x:214,y:top-271-n*14,size:10,font,color:muted}));
  page.drawText(safe('Vence: '+new Date(invitation.expiresAt).toLocaleDateString('es-BO'),font),{x:214,y:top-324,size:9,font,color:muted});
 }
 return pdf.save();
}
export async function registrationConfirmationPdf(school:School,application:{id:string;status:string;seed:{firstName:string;lastName:string};classroomName:string;year:number;confirmedAt?:string;amount:number;paymentRequired:boolean;simulation:boolean;testing?:boolean}){
 if(application.status!=='confirmed')throw Error('La inscripción todavía no está confirmada.');
 const d=await letterhead(school,'Constancia de inscripción',application.id);d.row('Estudiante',application.seed.firstName+' '+application.seed.lastName);d.row('Curso y gestión',application.classroomName+' - '+application.year);d.row('Confirmada el',new Date(application.confirmedAt||'').toLocaleString('es-BO',{timeZone:'America/La_Paz'}));
 d.paragraph(application.paymentRequired?`Pago registrado: Bs ${Number(application.amount).toFixed(2)}`:'Inscripción confirmada sin cobro adicional.');
 if(application.testing||application.simulation)d.paragraph('ENTORNO DE PRUEBAS - Datos y pagos ficticios. Esta constancia no acredita una inscripción real.',{strong:true,size:10});
 d.paragraph('Constancia interna de la institución. El registro oficial correspondiente se gestiona por Dirección.',{size:9});return d.save();
}
const hex=(value:string)=>{const h=/^#[\da-f]{6}$/i.test(value)?value:'#254EBB';return rgb(...[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255) as [number,number,number]);};
const ink=rgb(.10,.17,.22),muted=rgb(.34,.40,.45),rule=rgb(.85,.88,.90);
const safe=(text:unknown,font:PDFFont)=>Array.from(String(text??'').replace(/[\u0000-\u001f]/g,' ').replace(/[\u2010-\u2015]/g,'-')).filter(c=>{try{font.encodeText(c);return true;}catch{return false;}}).join('');
function lines(text:string,font:PDFFont,size:number,width:number){
 const result:string[]=[];let line='';
 for(const raw of safe(text,font).split(/\s+/)){
  let word=raw;while(font.widthOfTextAtSize(word,size)>width){let split=1;while(split<word.length&&font.widthOfTextAtSize(word.slice(0,split+1),size)<=width)split++;if(line){result.push(line);line='';}result.push(word.slice(0,split));word=word.slice(split);}
  if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){result.push(line);line=word;}else line+=(line?' ':'')+word;
 }
 if(line)result.push(line);return result.length?result:[''];
}
async function image(pdf:PDFDocument,source?:string):Promise<PDFImage|undefined>{
 if(!source)return;
 try{
  if(!/^data:image\/(png|jpeg|webp);base64,/i.test(source)&&!/^https:\/\//i.test(source))return;
  const response=await fetch(source,{credentials:'omit',signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error();const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>5000000)return;
  if(bytes[0]===137&&bytes[1]===80)return await pdf.embedPng(bytes);
  if(bytes[0]===255&&bytes[1]===216)return await pdf.embedJpg(bytes);
  if(typeof document==='undefined')return;
  const url=URL.createObjectURL(new Blob([bytes])),img=new Image();try{img.src=url;await img.decode();const canvas=document.createElement('canvas');const ratio=Math.min(1,800/img.width,800/img.height);canvas.width=img.width*ratio;canvas.height=img.height*ratio;canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);return await pdf.embedPng(canvas.toDataURL('image/png'));}finally{URL.revokeObjectURL(url);}
 }catch{return;}
}
function fitLogo(page:PDFPage,logo:PDFImage,x:number,y:number,size:number){const s=logo.scaleToFit(size,size);page.drawImage(logo,{x:x+(size-s.width)/2,y:y+(size-s.height)/2,width:s.width,height:s.height});}
async function letterhead(school:School,title:string,reference:string){
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),a=parseAppearance(school.appearance),primary=hex(a?.primary||school.color),logo=await image(pdf,school.logoUrl);
 pdf.setTitle(title+' · '+school.name);pdf.setAuthor(school.name);pdf.setCreator('MiCole · documentos institucionales');pdf.setLanguage('es-BO');
 let page:PDFPage,y=0;
 const pages:PDFPage[]=[];
 function addPage(){
  page=pdf.addPage([595.28,841.89]);pages.push(page);page.drawRectangle({x:0,y:831.89,width:595.28,height:10,color:primary});
  if(logo)fitLogo(page,logo,44,743,62);else{page.drawRectangle({x:44,y:748,width:56,height:56,color:primary});page.drawText(safe(school.initials||'IE',bold).slice(0,4),{x:52,y:769,size:17,font:bold,color:hex(readableInk(a?.primary||school.color))});}
  let nameSize=16;while(lines(school.name,bold,nameSize,425).length>2&&nameSize>10)nameSize--;const names=lines(school.name,bold,nameSize,425);names.forEach((l,i)=>page.drawText(l,{x:120,y:793-i*(nameSize+3),size:nameSize,font:bold,color:readableInk(a?.primary||school.color)!=='#FFFFFF'?ink:primary}));
  const contact=[school.siteName,school.address,school.phone].filter(Boolean).join(' · ');lines(contact,font,9,425).slice(0,2).forEach((l,i)=>page.drawText(l,{x:120,y:749-i*12,size:9,font,color:muted}));
  page.drawLine({start:{x:44,y:720},end:{x:551,y:720},color:rule,thickness:1});y=689;
 }
 function ensure(height:number){if(y-height<78)addPage();}
 function paragraph(text:unknown,options:{size?:number;strong?:boolean;color?:ReturnType<typeof rgb>;gap?:number}={}){
  const size=options.size||11,f=options.strong?bold:font;for(const raw of String(text??'').split('\n'))for(const l of lines(raw,f,size,507)){ensure(size*1.6);page.drawText(l,{x:44,y,size,font:f,color:options.color||ink});y-=size*1.5;}y-=options.gap??7;
 }
 function row(label:string,value:unknown){paragraph(label.toUpperCase(),{size:8,strong:true,color:muted,gap:0});paragraph(value,{size:11,gap:10});}
 function table(headers:string[],rows:(string|number|null)[][],widths:number[]){
  const header=()=>{ensure(35);page.drawRectangle({x:44,y:y-12,width:507,height:26,color:rgb(.95,.96,.97)});let x=52;headers.forEach((h,i)=>{page.drawText(safe(h,bold),{x,y:y-2,size:9,font:bold,color:readableInk(a?.primary||school.color)!=='#FFFFFF'?ink:primary});x+=widths[i];});y-=35;};header();
  rows.forEach(values=>{const cells=values.map((v,i)=>lines(String(v??'—'),font,10,widths[i]-15));const height=Math.max(...cells.map(c=>c.length))*14+16;if(y-height<78){addPage();header();}let x=52;cells.forEach((cell,i)=>{cell.forEach((l,n)=>page.drawText(l,{x,y:y-n*14,size:10,font,color:ink}));x+=widths[i];});y-=height;page.drawLine({start:{x:44,y:y+18},end:{x:551,y:y+18},color:rule,thickness:.5});});y-=12;
 }
 async function qr(source:string,label:string){const qrImage=await image(pdf,source);if(!qrImage)throw Error('No se pudo preparar la imagen QR. Reintenta la descarga.');ensure(205);fitLogo(page,qrImage,205,y-165,165);y-=182;paragraph(label,{size:10,strong:true});}
 async function save(){pages.forEach((p,i)=>{p.drawLine({start:{x:44,y:57},end:{x:551,y:57},color:rule,thickness:.7});p.drawText(safe(reference,font).slice(0,85),{x:44,y:41,size:7,font,color:muted});p.drawText(`${i+1} / ${pages.length}`,{x:518,y:41,size:8,font,color:muted});p.drawText(school.appearance?'PRUEBA INSTITUCIONAL · Tecnología MiCole':'Documento de la institución · Tecnología MiCole',{x:44,y:29,size:7,font,color:muted});});return pdf.save();}
 addPage();paragraph(title,{size:22,strong:true,color:readableInk(a?.primary||school.color)!=='#FFFFFF'?ink:primary,gap:15});
 return {pdf,font,bold,paragraph,row,table,qr,save};
}
export async function reportCardsPdf(school:School,cards:ReportCard[]){
 if(!cards.length||cards.some(c=>!c.publishedAt||c.revokedAt))throw Error('Selecciona libretas publicadas vigentes.');
 const first=cards[0];if(cards.some(c=>c.studentId!==first.studentId||c.classroomId!==first.classroomId||c.content.yearId!==first.content.yearId))throw Error('Las libretas deben pertenecer al mismo estudiante, aula y gestión.');
 const d=await letterhead(school,'Informe de calificaciones',cards.map(c=>c.id).join(' · '));
 d.row('Estudiante',first.content.studentName);d.row('Curso y gestión',`${first.content.classroomName} · ${first.content.year}`);
 for(const card of cards){d.paragraph(card.content.termName,{size:15,strong:true});d.table(['Materia / área','Resultado','Observaciones'],card.content.subjects.map(s=>[s.subject,s.score!=null?`${s.score} / ${s.maxScore||card.content.scale||100}`:s.qualitative?.map(q=>`${q.title}: ${q.value||'Pendiente'}`).join('\n')||'Sin nota publicada',s.qualitative?.map(q=>q.comment).filter(Boolean).join('\n')||(s.missing?`${s.missing} evaluaciones pendientes`:'')]),[200,160,147]);d.paragraph(`Publicado: ${new Date(card.publishedAt).toLocaleDateString('es-BO',{timeZone:'America/La_Paz'})} · Revisión ${card.revision}`,{size:9,color:muted});}
 d.paragraph('Informe académico interno de la institución. No sustituye la Libreta Escolar Electrónica oficial del SIE.',{size:9,color:muted});d.paragraph('Dirección ____________________        Docente ____________________',{size:10});return d.save();
}
export async function announcementPdf(school:School,notice:Announcement){
 if(notice.schoolId!==school.id||notice.revokedAt)throw Error('Este comunicado no está disponible.');
 const d=await letterhead(school,'Comunicado institucional',notice.id);d.paragraph(notice.title,{size:16,strong:true});d.row('Fecha',new Date(notice.createdAt).toLocaleDateString('es-BO',{timeZone:'America/La_Paz'}));d.row('Dirigido a',{all:'Toda la comunidad',staff:'Personal de la institución',families:'Familias'}[notice.audience]);d.paragraph(notice.content);
 if(notice.requiresAcknowledgment)d.paragraph('La confirmación de lectura se registra dentro de MiCole. Este PDF no registra una respuesta.',{size:9,color:muted});return d.save();
}
export async function citationPdf(school:School,citation:{studentName:string;classroomName:string;date:string;time:string;reason:string;location:string;reference:string;scheduled?:boolean}){
 const d=await letterhead(school,'Citación a la familia',citation.reference);d.row('Estudiante',citation.studentName);d.row('Curso',citation.classroomName);d.row('Fecha y hora',citation.date+' · '+citation.time);d.row('Lugar',citation.location);d.paragraph('Estimada familia:',{strong:true});d.paragraph(citation.reason);d.paragraph('Agradecemos su acompañamiento y participación en este encuentro.');d.paragraph(citation.scheduled?'Citación asociada a una entrevista registrada. Las respuestas se consultan en el sistema.':'Documento preparado para entregar a la familia. La descarga no envía mensajes ni registra una entrevista.',{size:9,color:muted});d.paragraph('Dirección ____________________        Recibido por ____________________');return d.save();
}
export async function receiptPdf(school:School,receipt:SchoolReceipt,studentName:string){
 if(receipt.schoolId!==school.id)throw Error('El recibo pertenece a otra institución.');const d=await letterhead(school,'Recibo de pago',receipt.id);d.row('Estudiante',studentName);d.row('Fecha',new Date(receipt.createdAt).toLocaleDateString('es-BO',{timeZone:'America/La_Paz'}));d.row('Forma de pago',{cash:'Efectivo',qr:'QR',transfer:'Transferencia',deposit:'Depósito'}[receipt.paymentMethod]);d.table(['Concepto','Importe Bs'],receipt.items?.length?receipt.items.map(i=>[i.concept,i.amount.toFixed(2)]):[['Abono registrado',receipt.total.toFixed(2)]],[390,117]);d.paragraph(`Total registrado: Bs ${receipt.total.toFixed(2)}`,{strong:true,size:17});d.row('Referencia',receipt.reference||'Sin referencia');d.paragraph('Comprobante interno de abono. No constituye una factura fiscal.',{size:9,color:muted});return d.save();
}
export async function paymentQrPdf(school:School,payment:{id:string;amount:number;image:string;dueDate:string;description:string;simulation:boolean;status?:string}){
 if(!payment.simulation&&payment.status!=='pending')throw Error('Solo puedes descargar un QR bancario pendiente. Actualiza su estado.');if(!Number.isFinite(payment.amount)||payment.amount<=0)throw Error('Revisa el importe.');const d=await letterhead(school,payment.simulation?'QR de demostración':'Solicitud de pago QR',payment.id);d.paragraph(payment.simulation?'SIMULACIÓN · SIN VALOR DE COBRO':'PAGO A LA INSTITUCIÓN',{strong:true,size:13});d.row('Concepto',payment.description);d.row('Importe',`Bs ${payment.amount.toFixed(2)}`);d.row('Vigencia',payment.dueDate);await d.qr(payment.image,payment.simulation?'Ejemplo visual; no efectúes pagos con este QR.':'Comprueba el beneficiario y el importe en tu aplicación bancaria.');d.paragraph(payment.simulation?'Este QR contiene únicamente una referencia ficticia. No genera deuda ni realiza una operación bancaria.':'La descarga no confirma un pago. Su estado y vigencia deben consultarse en el sistema; un PDF guardado puede haber vencido.',{size:10,color:muted});return d.save();
}
export async function credentialPdf(original:School,card:SchoolCredential){
 const school=letterheadSchool(original);if(card.schoolId!==school.id||card.status!=='active')throw Error('Solo puedes descargar un carnet vigente de esta sede.');
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),page=pdf.addPage([595.28,841.89]),primary=hex(school.color),logo=await image(pdf,school.logoUrl);
 const x=55,w=242.65,h=153.07,y=570;
 page.drawText('Carnet escolar · impresión al 100 %',{x,y:790,font:bold,size:18,color:ink});page.drawText('Formato 85.6 x 54 mm · frente y reverso',{x,y:767,font,size:11,color:muted});
 page.drawRectangle({x,y,width:w,height:h,color:rgb(1,1,1),borderColor:rule,borderWidth:1});page.drawRectangle({x,y:y+h-48,width:w,height:48,color:primary});
 if(logo)fitLogo(page,logo,x+12,y+h-40,31);
 const schoolLines=lines(school.name,bold,10,w-(logo?67:25)).slice(0,2);schoolLines.forEach((s,i)=>page.drawText(s,{x:x+(logo?55:13),y:y+h-20-i*12,font:bold,size:10,color:hex(readableInk(school.color))}));
 page.drawText(`GESTIÓN ${card.year} · PRUEBAS`,{x:x+13,y:y+h-66,font,size:8,color:muted});
 lines(card.studentName,bold,13,w-26).slice(0,2).forEach((s,i)=>page.drawText(s,{x:x+13,y:y+h-89-i*15,font:bold,size:13,color:ink}));
 page.drawText(lines(card.classroomName,font,9,w-26)[0],{x:x+13,y:y+30,font,size:9,color:muted});page.drawText(`ID ${card.code.slice(-12)}  ·  Vence ${card.expiresOn}`,{x:x+13,y:y+13,font,size:7,color:muted});
 const backY=345;page.drawRectangle({x,y:backY,width:w,height:h,color:rgb(1,1,1),borderColor:rule,borderWidth:1});page.drawRectangle({x,y:backY+h-8,width:w,height:8,color:primary});
 const verify=`https://www.micole.click/app/credentials?school=${encodeURIComponent(card.schoolId)}&code=${encodeURIComponent(card.code)}`;
 const qr=await pdf.embedPng(await QRCode.toDataURL(verify,{width:320,margin:4,errorCorrectionLevel:'M'}));fitLogo(page,qr,x+12,backY+25,100);
 page.drawText('VALIDACIÓN EN DIRECCIÓN',{x:x+120,y:backY+116,font:bold,size:7,color:ink});
 lines('Requiere una cuenta autorizada de la institución. Escanea después de iniciar sesión.',font,8,106).forEach((s,i)=>page.drawText(s,{x:x+120,y:backY+100-i*11,font,size:8,color:muted}));
 lines(card.code,font,6.5,106).forEach((s,i)=>page.drawText(s,{x:x+120,y:backY+42-i*9,font,size:6.5,color:ink}));page.drawText('Tecnología MiCole · Carnet interno de pruebas',{x:x+12,y:backY+12,font,size:6.5,color:muted});
 page.drawText('Identificación escolar interna. No sustituye un documento oficial ni autoriza recogidas.',{x,y:305,font,size:9,color:muted});pdf.setTitle('Carnet escolar · '+school.name);pdf.setAuthor(school.name);return pdf.save();
}
export function downloadPdf(bytes:Uint8Array,name:string){const blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name.replace(/[^a-zA-Z0-9._-]/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
