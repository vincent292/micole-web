// Server-only QA preparation. No credentials or tokens are printed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient(),apply=process.argv.includes('--apply');
const dir=path.join(os.homedir(),'.config/micole');
const base=JSON.parse(fs.readFileSync(path.join(dir,'cuentas-pruebas.json'),'utf8'));
const file=path.join(dir,'cuentas-pruebas-ampliadas.json');
const marker='micole-expanded-qa-v1';
let qa;
const save=()=>{fs.writeFileSync(file,JSON.stringify(qa,null,2)+'\n',{mode:0o600});fs.chmodSync(file,0o600);};
const q=(sql,args=[])=>db.query(sql,args);
async function acting(user,sql,args=[]){
 await q('savepoint qa_actor');await q('set local role authenticated');
 await q("select set_config('request.jwt.claim.sub',$1,true)",[user]);
 try{const r=await q(sql,args);await q('reset role');await q("select set_config('request.jwt.claim.sub','',true)");await q('release savepoint qa_actor');return r;}
 catch(e){await q('rollback to savepoint qa_actor');await q('release savepoint qa_actor');throw e;}
}
try{
 await db.connect();
 const project=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
 if(project!==base.project||base.marker!=='micole-persisted-test-v1')throw Error('El entorno QA base no coincide.');
 const owner=(await q("select a.user_id from public.platform_admins a join auth.users u on u.id=a.user_id where lower(u.email)='ariasvincent292@gmail.com' and u.email_confirmed_at is not null")).rows[0]?.user_id;
 if(!owner)throw Error('No se verificó al propietario.');
 if(!apply){console.log(JSON.stringify({ok:true,dryRun:true,newAccounts:9,newSchools:1,newClassrooms:3,newChildren:5,emailsSent:false}));}
 else{
  if(!(await q("select 1 from supabase_migrations.schema_migrations where version='202610270002'")).rowCount)throw Error('Aplica antes scheduler_testing_scope.');
  if(fs.existsSync(file))qa=JSON.parse(fs.readFileSync(file,'utf8'));
  else{
   const b=randomUUID();
   qa={marker,project,password:base.password,schoolId:base.schoolId,otherSchoolId:b,
    accounts:base.accounts.map(a=>({...a,key:a.role})),
    resources:{...base.resources,...Object.fromEntries(['kinderA','kinderB','mateo','emma','sofia','bruno','teacherB','otherYear','otherRoom','otherChild','teacherC'].map(k=>[k,randomUUID()]))}};
   for(const [key,role,name,label,schoolId] of [
    ['father','guardian','padre','Padre QA',base.schoolId],
    ['familyb','guardian','familiaotra','Familia B QA',base.schoolId],
    ['teacherb','teacher','docenteotro','Docente B QA',base.schoolId],
    ['studentb','student','alumnootro','Mateo QA',base.schoolId],
    ['directorb','director','direccionotra','Dirección sede B QA',b],
    ['familyc','guardian','familiaexterna','Familia sede B QA',b],
    ['teacherc','teacher','docenteexterno','Docente sede B QA',b],
    ['studentc','student','alumnoexterno','Niño sede B QA',b],
    ['scheduler','scheduler','secretaria','Secretaría QA',base.schoolId],
   ])qa.accounts.push({key,role,email:`${name}@pruebas.micole.test`,label,schoolId});
   save();
  }
  if(qa.marker!==marker||qa.project!==project||qa.schoolId!==base.schoolId)throw Error('Archivo QA ampliado ajeno al proyecto.');
  const cli=process.env.MICOLE_SUPABASE_CLI;if(!cli)throw Error('Indica MICOLE_SUPABASE_CLI.');
  const keys=JSON.parse(execFileSync(cli,['projects','api-keys','--project-ref',project,'--reveal','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:30000}));
  const key=keys.find(k=>k.name==='service_role')?.api_key;if(!key)throw Error('Clave administrativa no disponible.');
  const admin=createClient(`https://${project}.supabase.co`,key,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const a of qa.accounts.filter(a=>a.schoolId)){
   const existing=(await q('select id,raw_app_meta_data from auth.users where lower(email)=$1',[a.email])).rows[0];
   if(existing){
    if(existing.raw_app_meta_data?.micole_test_marker!=='micole-persisted-test-v1'||existing.raw_app_meta_data?.micole_test_school!==a.schoolId)throw Error('Una dirección QA pertenece a otro entorno.');
    a.id=existing.id;
   }else{
    const {data,error}=await admin.auth.admin.createUser({email:a.email,password:qa.password,email_confirm:true,user_metadata:{full_name:a.label},app_metadata:{micole_test_marker:'micole-persisted-test-v1',micole_test_school:a.schoolId}});
    if(error||!data.user)throw Error('No se pudo crear una cuenta QA. El archivo permite reanudar sin cambiar credenciales.');
    a.id=data.user.id;
   }save();
  }
  const a=Object.fromEntries(qa.accounts.map(a=>[a.key,a])),r=qa.resources;
  await q('begin');await q("select pg_advisory_xact_lock(hashtext('micole-expanded-qa'))");
  const original=(await q('select school_id from aulanexo_private.persisted_test_workspaces where school_id=$1',[qa.schoolId])).rows[0];
  if(!original)throw Error('La sede original no está registrada como sandbox.');
  const slug='micole-pruebas-aislamiento';const existing=(await q('select id from schools where slug=$1',[slug])).rows[0];
  if(existing&&existing.id!==qa.otherSchoolId)throw Error('La sede B existente no coincide con el archivo QA.');
  await q("insert into schools(id,name,slug,status,city,director_name,show_on_landing,education_levels,workspace_mode) values($1,'MiCole · Sede B de pruebas',$2,'active','Cochabamba','Dirección B QA',false,array['Inicial'],'kinder') on conflict(id) do nothing",[qa.otherSchoolId,slug]);
  await q('insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values($1,true,$2) on conflict do nothing',[qa.otherSchoolId,owner]);
  await q('insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2) on conflict do nothing',[qa.otherSchoolId,owner]);
  await q("update platform_charges set status='cancelled' where school_id=$1 and kind='credit_topup' and status='pending'",[qa.otherSchoolId]);
  for(const u of qa.accounts.filter(u=>u.schoolId)){
   await q('insert into aulanexo_private.persisted_test_accounts(user_id,school_id,email,role) values($1,$2,$3,$4) on conflict(user_id) do nothing',[u.id,u.schoolId,u.email,u.role]);
   if(['director','teacher'].includes(u.role))await q('insert into school_memberships(school_id,user_id,role) values($1,$2,$3) on conflict do nothing',[u.schoolId,u.id,u.role]);
  }
  await q("update schools set workspace_mode='kinder' where id=$1",[qa.schoolId]);
  const year=Number((await q("select extract(year from now() at time zone 'America/La_Paz') as n")).rows[0].n);
  await q("insert into academic_years(id,school_id,year,name,starts_on,ends_on) values($1,$2,$3,'Gestión QA B',make_date($3,1,1),make_date($3,12,31)) on conflict(id) do nothing",[r.otherYear,qa.otherSchoolId,year]);
  for(const [id,school,name] of [[r.kinderA,qa.schoolId,'Inicial A · QA'],[r.kinderB,qa.schoolId,'Inicial B · QA'],[r.otherRoom,qa.otherSchoolId,'Inicial C · Sede B QA']])await q("insert into classrooms(id,school_id,name,level,academic_year,subjects_enabled,monthly_fee,active) values($1,$2,$3,'Inicial',$4,true,0,true) on conflict(id) do nothing",[id,school,name,year]);
  for(const [id,u] of [[r.teacherB,a.teacherb],[r.teacherC,a.teacherc]])await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,$4,$5,'active') on conflict(id) do nothing",[id,u.schoolId,u.id,u.label,u.email]);
  for(const [school,teacher,room] of [[qa.schoolId,r.teacher,r.kinderA],[qa.schoolId,r.teacherB,r.kinderB],[qa.otherSchoolId,r.teacherC,r.otherRoom]])await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3) on conflict do nothing',[school,teacher,room]);
  for(const [id,school,room,first,mother,father,yearId] of [
   [r.mateo,qa.schoolId,r.kinderA,'Mateo',a.guardian,a.father,r.year],
   [r.emma,qa.schoolId,r.kinderA,'Emma',a.guardian,a.father,r.year],
   [r.sofia,qa.schoolId,r.kinderA,'Sofia',a.familyb,null,r.year],
   [r.bruno,qa.schoolId,r.kinderB,'Bruno',a.familyb,null,r.year],
   [r.otherChild,qa.otherSchoolId,r.otherRoom,'Nico',a.familyc,null,r.otherYear],
  ]){
   await q("insert into students(id,school_id,classroom_id,first_name,last_name,birth_date,identity_number,status,profile_complete,mother_name,mother_email,mother_phone,father_name,father_email,father_phone,monthly_fee,emergency_contact,emergency_phone) values($1,$2,$3,$4,'QA','2022-05-10',$5,'active',true,$6,$7,'70001001',$8,$9,'70001002',0,'Contacto ficticio QA','70001003') on conflict(id) do nothing",[id,school,room,first,'QA-'+id.slice(0,8),mother.label,mother.email,father?.label||'',father?.email||'']);
   await q("insert into enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,level,started_on,status,monthly_fee) select $1,$2,$3,$4,$5,c.name,'Inicial',(now() at time zone 'America/La_Paz')::date,'enrolled',0 from classrooms c where c.id=$3 and not exists(select 1 from enrollment_history where student_id=$2)",[school,id,room,yearId,first+' QA']);
  }
  await acting(a.director.id,'select set_student_login($1,$2,true)',[r.mateo,a.studentb.email]);
  await acting(a.directorb.id,'select set_student_login($1,$2,true)',[r.otherChild,a.studentc.email]);
  await acting(a.director.id,'select save_timetable_delegate($1,$2,true,false)',[qa.schoolId,a.scheduler.email]);
  for(const u of qa.accounts)await acting(u.id,'select workspace_identity()');
  await q('commit');
  const manifest={marker,schoolId:qa.schoolId,otherSchoolId:qa.otherSchoolId,resources:r,accounts:qa.accounts.map(({key,role,label,email,id,schoolId})=>({key,role,label,email,id,schoolId:schoolId||qa.schoolId})),credentialsPrinted:false};
  fs.writeFileSync('output/qa/2026-10-27-completa/fixture.json',JSON.stringify(manifest,null,2)+'\n');
  console.log(JSON.stringify({ok:true,accounts:qa.accounts.length,qaSchools:2,newChildren:5,credentialsPrinted:false,emailsSent:false}));
 }
}catch(e){await q('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
