import type {AdmissionTemplate} from './admission';
import type {CareProfile,School} from './types';
import {supabase} from './supabase';
import {sourceFromFile} from './documentApi';
export interface RegistrationSeed{[key:string]:string;firstName:string;lastName:string;rude:string;identityNumber:string;birthDate:string;contactEmail:string;motherName:string;motherEmail:string;motherPhone:string;fatherName:string;fatherEmail:string;fatherPhone:string}
export interface RegistrationApplication{id:string;campaignId:string;classroomId:string;classroomName:string;year:number;status:'draft'|'payment_pending'|'confirmed'|'cancelled';seed:RegistrationSeed;profile?:Partial<CareProfile>&Record<string,unknown>;expectedEmail:string;recipient:'mother'|'father';familyPolicy:'both'|'mother'|'father';childCiRequired:boolean;revision:number;reservationUntil:string;expiresAt?:string;newStudent:boolean;studentId?:string;confirmedAt?:string;paymentRequired:boolean;amount:number;concept:string;simulation:boolean;testing:boolean;paymentToken?:string;receiptId?:string;template?:AdmissionTemplate}
export interface RegistrationCampaign{id:string;school_id:string;year:number;title:string;status:'open'|'closed';payment_required:boolean;amount:number;concept:string;simulation:boolean;revision:number}
export interface RegistrationRoom{id:string;name:string;year:number;level:string;schedule:string;capacity:number;occupied:number;grade?:string;regular:boolean}
export interface RegistrationWorkspace{canManage:boolean;testing:boolean;campaigns:RegistrationCampaign[];rooms:RegistrationRoom[];pools:{campaignId:string;classroomId:string;groupKey:string}[];applications:RegistrationApplication[];teachers:{id:string;name:string}[];delegates:{campaign_id:string;user_id:string;can_register:boolean;can_collect:boolean}[];canCollect:string[]}
export interface RegistrationContext{school:Pick<School,'id'|'name'|'logoUrl'|'color'|'appearance'>;requiresVerification:boolean;application?:RegistrationApplication;canCollect?:boolean}
export interface RosterRow extends RegistrationSeed{id:string;source:string}
export interface RosterReview{row:RosterRow;existingStudentId?:string;warning:string;blocked:boolean}
export const registrationLabels={draft:'Por completar',payment_pending:'Pendiente de pago',confirmed:'Confirmada',cancelled:'Cancelada'};
export const seedFields=[['firstName','Nombres'],['lastName','Apellidos'],['rude','RUDE'],['identityNumber','CI del alumno'],['contactEmail','Correo del responsable'],['birthDate','Nacimiento'],['motherName','Nombre de la madre'],['motherEmail','Correo de la madre'],['motherPhone','Celular de la madre'],['fatherName','Nombre del padre'],['fatherEmail','Correo del padre'],['fatherPhone','Celular del padre']] as const;
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string[]>={firstName:['nombres','nombre','nombrecompleto','nombresyapellidos','apellidosynombres','nombreyapellido','alumno','estudiante','nombredelalumno','firstName'],lastName:['apellidos','apellido','lastName'],rude:['rude','codigorude'],identityNumber:['ci','cidelalumno','carnet','carnetdeidentidad','cedula','identityNumber','documento'],contactEmail:['correo','email','correoelectronico','correodelresponsable','correoresponsable','contactEmail'],birthDate:['nacimiento','fechadenacimiento','birthDate'],motherName:['nombredelamadre','madre','motherName'],motherEmail:['correodelamadre','correomadre','emailmadre','motherEmail'],motherPhone:['celulardelamadre','celularmadre','motherPhone'],fatherName:['nombredelpadre','padre','fatherName'],fatherEmail:['correodelpadre','correopadre','emailpadre','fatherEmail'],fatherPhone:['celulardelpadre','celularpadre','fatherPhone']};
export function blankRegistrationSeed():RegistrationSeed{return Object.fromEntries(seedFields.map(([k])=>[k,''])) as RegistrationSeed;}
export function rosterFromGrid(grid:unknown[][]):RosterRow[]{
 const header=grid.findIndex(row=>row.some(cell=>aliases.firstName.some(a=>normalize(String(cell||''))===normalize(a))));
 const nonempty=grid.filter(row=>row.some(v=>v!==null&&v!==undefined&&String(v).trim()!==''));
 const namesOnly=header<0&&nonempty.length>0&&nonempty.every(row=>row.slice(1).every(v=>v==null||String(v).trim()===''));
 if(header<0&&!namesOnly)throw Error('No encontramos encabezados. Para varias columnas usa Nombre, RUDE, Carnet o Correo; también puedes leer la lista con IA.');
 const columns=namesOnly?['nombre']:grid[header].map(v=>normalize(String(v||'')));
 const rows=(namesOnly?grid:grid.slice(header+1)).map((row,i)=>({row,line:namesOnly?i+1:header+i+2})).filter(({row})=>row.some(v=>v!==null&&v!==undefined&&String(v).trim()!==''));
 if(rows.length>200)throw Error('Divide la lista en archivos de hasta 200 alumnos.');
 return rows.map(({row,line})=>{
  const seed=blankRegistrationSeed();for(const [key] of seedFields){const col=columns.findIndex(h=>aliases[key]?.some(a=>normalize(a)===h));const value=col<0?'':row[col];seed[key]=value instanceof Date?value.toISOString().slice(0,10):String(value??'').trim().slice(0,160);}
  return {...seed,id:crypto.randomUUID(),source:`Fila ${line}`};
 });
}
export function parseRosterCsv(text:string):unknown[][]{
 const delimiter=text.split(/\r?\n/,1)[0].includes(';')?';':',';const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=ch;}
 if(quoted)throw Error('Revisa las comillas del archivo CSV.');if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
export async function readRegistrationRoster(file:File):Promise<RosterRow[]>{
 if(file.size>5*1024*1024||!file.size)throw Error('Usa un archivo de hasta 5 MB.');
 if(/\.csv$/i.test(file.name))return rosterFromGrid(parseRosterCsv(await file.text()));
 if(/\.xlsx$/i.test(file.name)){const {readSheet}=await import('read-excel-file/browser');return rosterFromGrid(await readSheet(file));}
 throw Error('Usa Excel XLSX, CSV o la lectura de PDF con IA.');
}
export async function analyzeRegistrationRoster(schoolId:string,year:number,file:File,consent:boolean):Promise<{rows:RosterRow[];warnings:string[]}>{
 if(!consent)throw Error('Confirma que estás autorizado a procesar esta lista para la inscripción.');
 if(!supabase)throw Error('Conecta la institución para leer documentos.');
 if(!file.size||file.size>5*1024*1024)throw Error('Usa un archivo de hasta 5 MB.');
 let source;
 if(/\.(xlsx|csv)$/i.test(file.name)){
  const grid=/\.csv$/i.test(file.name)?parseRosterCsv(await file.text()):await (await import('read-excel-file/browser')).readSheet(file);
  if(grid.length>205||grid.some(row=>row.length>60))throw Error('Usa una hoja con hasta 200 alumnos y 60 columnas.');
  const bytes=new TextEncoder().encode(JSON.stringify(grid));if(bytes.length>500000)throw Error('La tabla contiene demasiados datos. Usa la plantilla de inscripción.');
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);source={name:file.name,mimeType:'text/plain',data:btoa(binary)};
 }else source=await sourceFromFile(file);
 const {data,error}=await supabase.functions.invoke('document-analyze',{body:{schoolId,year,kind:'roster',files:[source],rosterProcessingConfirmed:true}});
 if(error){let message='No se pudo leer la lista. Puedes usar la plantilla CSV.';try{message=(await error.context.json()).error||message;}catch{}throw Error(message);}
 if(!Array.isArray(data?.rows))throw Error('No recibimos filas válidas. Revisa el archivo.');
 return {rows:data.rows.map((r:Partial<RosterRow>)=>({...blankRegistrationSeed(),source:'',...r,id:crypto.randomUUID()})),warnings:data.warnings||[]};
}
export function registrationUrl(token:string){return `${window.location.origin}/matricula/${token}`;}
export function downloadRegistrationBlob(bytes:BlobPart,name:string,type:string){const url=URL.createObjectURL(new Blob([bytes],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
