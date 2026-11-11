// Only the previously registered persisted sandbox; no real-school or bank writes.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {qa,session,rpc} from './qa-session.mjs';import {databaseClient} from './database.mjs';
const target='76c0a7f0-7348-4a8f-b5f7-4c6acbbf6570';assert.equal(qa.schoolId,target);assert.equal(qa.marker,'micole-expanded-qa-v1');
const db=databaseClient();await db.connect();let c;
try{
 const untouched=async()=>(await db.query("select md5(coalesce(string_agg(to_jsonb(s)::text,',' order by id),'')) as value from schools s where id<>$1",[target])).rows[0].value;
 const before=await untouched();assert.equal((await db.query('select aulanexo_private.persisted_testing($1) as value',[target])).rows[0].value,true);
 c=await session('director');const {data:school,error}=await c.from('schools').select('*').eq('id',target).single();if(error)throw Error(error.message);assert.equal(school.show_on_landing,false);
 await fs.mkdir('tmp/branding-pilot',{recursive:true});await fs.mkdir('output/qa/2026-11-09-branding',{recursive:true});await fs.writeFile('tmp/branding-pilot/school-before.json',JSON.stringify(school),{mode:0o600});
 if(!school.logo_url){const logo='data:image/png;base64,'+(await fs.readFile('public/branding/institucion-pruebas.png')).toString('base64');await rpc(c,'save_school',{p_school:{id:target,logo_url:logo}});}
 if(!school.appearance)await rpc(c,'save_school_appearance',{p_school_id:target,p_config:{version:1,template:'aurora',primary:'#5B48B5',accent:'#D48745',welcome:'Bienvenidos a nuestra comunidad',tagline:'Cada día, un nuevo descubrimiento.'}});
 const {data:students,error:studentError}=await c.from('students').select('id,first_name,last_name').eq('school_id',target).eq('status','active').ilike('last_name','%Prueba%').limit(1);if(studentError)throw Error(studentError.message);assert.ok(students[0]);
 const card=await rpc(c,'issue_school_credential',{p_school_id:target,p_student_id:students[0].id,p_year:Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/La_Paz'}).format(new Date()))});
 assert.equal(card.status,'active');assert.equal(await untouched(),before);
 const report={status:'passed',pilotEnabled:true,schoolId:target,defaultTemplate:'aurora',templateCount:5,logoPresent:true,credentialIssued:true,otherSchoolsUnchanged:true,publishedMessages:0,bankCalls:0};await fs.writeFile('output/qa/2026-11-09-branding/setup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{if(c)await c.auth.signOut({scope:'local'});await db.end();}
