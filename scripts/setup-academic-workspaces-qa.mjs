import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {session,qa,rpc,rows} from './qa-session.mjs';import {databaseClient,reportFailure} from './database.mjs';
const metadata=JSON.parse(fs.readFileSync('tmp/academic-qa-context.json'));
const director=await session('directorb'),mainDirector=await session('director'),db=databaseClient();
const schoolId=metadata.directorb.schools[0],year=new Date().getUTCFullYear();
assert.ok(metadata.teacherc.schools.includes(schoolId));assert.ok(metadata.familyc.schools.includes(schoolId));
try{
 await db.connect();assert.equal((await db.query('select aulanexo_private.persisted_testing($1) testing',[schoolId])).rows[0].testing,true);
 const secretary=qa.accounts.find(a=>a.key==='scheduler');assert.ok(secretary);
 await rpc(mainDirector,'save_secretary_access',{p_school:qa.schoolId,p_email:secretary.email,p_active:true,p_collect:false});
 await db.query("update schools set workspace_mode='school',education_levels=array['Primaria','Secundaria'] where id=$1 and aulanexo_private.persisted_testing(id)",[schoolId]);
 const catalog=await rpc(director,'academic_structure',{p_school:schoolId});
 let grade=catalog.grades.find(g=>g.name==='6.º de Primaria · Demostración'&&g.academic_year===year);
 if(!grade){grade={id:randomUUID()};await rpc(director,'save_school_grade',{p_school:schoolId,p_id:grade.id,p_year:year,p_name:'6.º de Primaria · Demostración',p_level:'Primaria',p_code:'primary6'});}
 const teacherId=metadata.teacherc.teacherIds[0];
 const roomIds=[];
 for(const name of ['Blanco','Rojo']){
  let room=(await rows(director.from('classrooms').select('id').eq('grade_id',grade.id).eq('parallel_name',name)))[0];
  if(!room){room={id:randomUUID()};await rpc(director,'save_academic_parallel',{p_grade:grade.id,p_id:room.id,p_name:name,p_tutor:teacherId,p_capacity:30,p_schedule:'Mañana'});}
  roomIds.push(room.id);
 }
 const math=await rpc(director,'configure_class_subject',{p_classroom_id:roomIds[0],p_name:'Matemática',p_teacher_ids:[teacherId],p_active:true});
 // A second subject has an independent teacher record, with no external account invited.
 let secondTeacher=(await db.query("select id from teachers where school_id=$1 and email='docente.academico.ficticio@demo.example'",[schoolId])).rows[0];
 if(!secondTeacher){secondTeacher={id:randomUUID()};await rpc(director,'save_teacher_with_classrooms',{p_teacher:{id:secondTeacher.id,school_id:schoolId,name:'Docente de ejemplo · Ciencias Sociales',email:'docente.academico.ficticio@demo.example',specialty:'Ciencias Sociales',status:'active'},p_classroom_ids:[roomIds[0]]});}
 const social=await rpc(director,'configure_class_subject',{p_classroom_id:roomIds[0],p_name:'Ciencias Sociales',p_teacher_ids:[secondTeacher.id],p_active:true});
 const children=[];
 await db.query('begin');
 for(const firstName of ['Alma Académica','Bruno Académico']){
  let child=(await db.query('select id from students where school_id=$1 and classroom_id=$2 and first_name=$3 and last_name=$4',[schoolId,roomIds[0],firstName,'Prueba MiCole'])).rows[0];
  if(!child){child={id:randomUUID()};await db.query("insert into students(id,school_id,classroom_id,first_name,last_name,birth_date,status,monthly_fee,profile_complete,primary_guardian_name,primary_guardian_email,mother_name,mother_email,mother_phone,father_name,father_email,father_phone) values($1,$2,$3,$4,'Prueba MiCole','2014-01-10','active',0,true,'Familia de prueba',$5,'Madre de prueba',$5,'70000001','Padre de prueba','padre.ficticio@demo.example','70000002')",[child.id,schoolId,roomIds[0],firstName,qa.accounts.find(a=>a.key==='familyc').email]);}
  await db.query("insert into student_guardians(student_id,user_id,relationship,verified_at,can_view) values($1,$2,'mother',now(),true) on conflict(student_id,user_id) do update set verified_at=now(),can_view=true",[child.id,metadata.familyc.id]);children.push(child.id);
 }
 const yearId=(await db.query('select id from academic_years where school_id=$1 and year=$2',[schoolId,year])).rows[0].id;
 let term=(await db.query("select id from academic_terms where year_id=$1 and name='Período de demostración'",[yearId])).rows[0];
 if(!term){term={id:randomUUID()};await db.query("insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) values($1,$2,$3,'Período de demostración',$4,$5)",[term.id,schoolId,yearId,year+'-01-01',year+'-12-31']);}
 for(const subject of [math,social]){
  for(const [dimension,score] of [['ser',40],['saber',40],['hacer',40],['self',40]]){
   let assessment=(await db.query('select id from assessments where classroom_id=$1 and class_subject_id=$2 and term_id=$3 and dimension=$4',[roomIds[0],subject,term.id,dimension])).rows[0];
   if(!assessment){assessment={id:randomUUID()};await db.query("insert into assessments(id,school_id,term_id,classroom_id,class_subject_id,title,assessment_date,max_score,weight,created_by,dimension) values($1,$2,$3,$4,$5,$6,$7,100,1,$8,$9)",[assessment.id,schoolId,term.id,roomIds[0],subject,'Evaluación de ejemplo · '+dimension,year+'-11-01',metadata.directorb.id,dimension]);}
   for(const [index,child] of children.entries())await db.query('insert into assessment_scores(school_id,assessment_id,student_id,score,updated_by) values($1,$2,$3,$4,$5) on conflict(assessment_id,student_id) do nothing',[schoolId,assessment.id,child,index===0?score:85,metadata.directorb.id]);
  }
 }
 await db.query('commit');
 const result={schoolId,mainSchoolId:qa.schoolId,gradeId:grade.id,roomIds,teacherId,subjects:{math,social},children,termId:term.id,year};
 fs.writeFileSync('tmp/academic-workspaces-fixture.json',JSON.stringify(result),{mode:0o600});
 console.log(JSON.stringify({ok:true,testingOnly:true,grade:'6.º Primaria',parallels:2,subjects:2,students:children.length,productionBankCalls:0,realSchoolWrites:0}));
}catch(error){await db.query('rollback').catch(()=>{});reportFailure(error);}finally{await db.end();await director.auth.signOut({scope:'local'});await mainDirector.auth.signOut({scope:'local'});}
