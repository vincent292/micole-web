import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const id = (n: number) => `ab000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, mother, father, kidUser, stranger, otherDirector, unverified] = [1,2,3,4,5,6,7,8,9].map(id);
const [school, otherSchool, room, otherRoom, child, sibling, otherChild] = [20,21,30,31,40,41,42].map(id);
const query = (sql: string, params: unknown[] = []) => db.query(sql, params);
async function asUser<T>(user: string | null, task: () => Promise<T>, support?: string, role = "authenticated") {
  await db.exec(`begin; set local role ${role};`);
  await query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)", [user || "", JSON.stringify(support ? { "x-micole-support": support } : {})]);
  try { const result = await task(); await db.exec("commit"); return result; }
  catch (e) { await db.exec("rollback"); throw e; }
}
const enable = (student = child, email = "kid@test.bo", enabled = true) => query("select set_student_login($1,$2,$3)", [student,email,enabled]);
const portal = async () => (await query<{ payload: Record<string, any> }>("select student_portal() as payload")).rows[0].payload;
const identity = async () => (await query<{ payload: Record<string, any> }>("select workspace_identity() as payload")).rows[0].payload;
beforeAll(async () => {
  await db.exec(`create role authenticated; create role anon;create role service_role; create schema auth;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
  alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations).filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(file,migrations),"utf8").replace("create extension if not exists pgcrypto;", ""));
  await query("insert into aulanexo_private.platform_admin_allowlist(email) values('owner-student@test.bo')");
  for (const [user, email] of [[owner,"owner-student@test.bo"],[director,"director-student@test.bo"],[teacher,"teacher-student@test.bo"],[mother,"mother-student@test.bo"],[father,"father-student@test.bo"],[kidUser,"kid@test.bo"],[stranger,"stranger-student@test.bo"],[otherDirector,"other-director-student@test.bo"],[unverified,"unverified-student@test.bo"]])
    await query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3::boolean then now() else null end)",[user,email,user !== unverified]);
  await query("insert into schools(id,name,slug,status,nit,address) values($1,'Colegio de lectura','student-read','active','NIT PRIVADO','DIRECCION PRIVADA'),($2,'Otro colegio','student-other','active','','')",[school,otherSchool]);
  await query("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($4,$5,'director')",[school,director,teacher,otherSchool,otherDirector]);
  await query("insert into classrooms(id,school_id,name) values($1,$2,'Primero A'),($3,$2,'Primero B')",[room,school,otherRoom]);
  await query("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesora','teacher-student@test.bo','active')",[id(50),school,teacher]);
  await query("insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",[school,id(50),room]);
  for (const [student, classroom, first] of [[child,room,"Lucía"],[sibling,otherRoom,"Hermano"],[otherChild,otherRoom,"Ajeno"]]) {
    await query("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,allergies,identity_number) values($1,$2,$3,$4,'Prueba','active',true,'Madre','mother-student@test.bo','Padre','father-student@test.bo','ALERGIA PRIVADA',$5)",[student,school,classroom,first, "CI PRIVADO "+student]);
    await query("insert into platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación inicial','2026-10',50,'paid')",[school,student]);
    await query("insert into school_charges(school_id,student_id,concept,due_date,amount) values($1,$2,'Mensualidad',(now() at time zone 'America/La_Paz')::date+10,429)",[school,student]);
  }
  // Vinculación real de padre/madre al entrar, sin inventar permisos desde el cliente.
  await asUser(mother, identity); await asUser(father, identity);
  await asUser(director, async () => {
  await query("insert into calendar_events(id,school_id,classroom_id,title,event_date,type,description) values($1,$2,$3,'Tarea propia',current_date,'homework','Matemática'),($4,$2,null,'Evento general',current_date,'event','Fiesta'),($5,$2,$6,'Evento ajeno',current_date,'event','Otro curso')",[id(60),school,room,id(61),id(62),otherRoom]);
  await query("insert into announcements(id,school_id,classroom_id,title,content,audience) values($1,$2,$3,'Aviso propio','Propio','families'),($4,$2,null,'Aviso general','General','all'),($5,$2,$6,'Aviso otro curso','Ajeno','families'),($7,$2,null,'Solo personal','SECRETO PERSONAL','staff')",[id(70),school,room,id(71),id(72),otherRoom,id(73)]);
  await query("insert into daily_entries(school_id,student_id,category,note) values($1,$2,'tarea','Tarea individual'),($1,$2,'observación','OBSERVACION PRIVADA'),($1,$3,'tarea','Tarea de otro alumno')",[school,child,sibling]);
  await query("insert into grades(school_id,student_id,subject,period,score,recommendation) values($1,$2,'Matemática','Primer trimestre','90','Buen avance')",[school,child]);
  });
},30000);
afterAll(async () => { await db.close(); });

describe("acceso opcional de estudiantes y consulta familiar", () => {
  it("solo Dirección habilita el correo y rechaza correos de adultos, inválidos y duplicados", async () => {
    for (const user of [owner,teacher,mother,father,stranger,otherDirector]) await expect(asUser(user,()=>enable())).rejects.toThrow(/Solo Dirección/);
    for (const email of ["mother-student@test.bo","father-student@test.bo","teacher-student@test.bo","director-student@test.bo","owner-student@test.bo","inválido"]) await expect(asUser(director,()=>enable(child,email))).rejects.toThrow();
    await asUser(director,()=>enable(child," KID@TEST.BO "));
    await expect(asUser(director,()=>enable(sibling,"kid@test.bo"))).rejects.toThrow(/otro estudiante/);
    const account = (await asUser(director,()=>query<{ payload: object }>("select student_login_account($1) as payload",[child]))).rows[0].payload;
    expect(account).toEqual({ studentId:child,email:"kid@test.bo",enabled:true });
    await expect(asUser(kidUser,()=>query("select student_login_account($1)",[child]))).rejects.toThrow();
    await expect(asUser(kidUser,()=>query("select * from aulanexo_private.student_logins"))).rejects.toThrow();
    expect(JSON.stringify((await query("select summary from audit_events where entity='student_logins'")).rows)).not.toContain("kid@test.bo");
  });
  it("deriva el rol por correo confirmado sin aceptar rol o vínculo del navegador", async () => {
    const result=await asUser(kidUser,identity);
    expect(result.roles).toEqual(["student"]); expect(result.studentIds).toEqual([child]);
    expect(result.memberships).toEqual([{ schoolId:school,role:"student" }]);
    expect(result.guardianStudentIds).toEqual([]); expect(result.teacherIds).toEqual([]);
    await asUser(director,()=>enable(sibling,"unverified-student@test.bo"));
    expect((await asUser(unverified,identity)).roles).toEqual([]);
    await expect(asUser(unverified,portal)).rejects.toThrow(/habilitado/);
    await expect(asUser(stranger,portal)).rejects.toThrow(/habilitado/);
    await expect(asUser(null,portal,undefined,"anon")).rejects.toThrow();
  });
  it("devuelve únicamente tareas, eventos y anuncios generales o de su curso", async () => {
    const result=await asUser(kidUser,portal);
    expect(result.accessAllowed).toBe(true);
    expect(result.events.map((x:any)=>x.title).sort()).toEqual(["Evento general","Tarea propia"]);
    expect(result.announcements.map((x:any)=>x.title).sort()).toEqual(["Aviso general","Aviso propio"]);
    expect(result.dailyEntries.map((x:any)=>x.note)).toEqual(["Tarea individual"]);
    expect(result.students.map((x:any)=>x.id)).toEqual([child]);
    expect(result.classrooms.map((x:any)=>x.id)).toEqual([room]);
    expect(Object.keys(result.students[0]).sort()).toEqual(["id","schoolId","classroomId","firstName","lastName","status"].sort());
    expect(JSON.stringify(result)).not.toMatch(/PRIVAD|staff|monthlyFee|motherEmail|fatherEmail|grade|payments|charges|messages/i);
    for(const table of ["students","student_documents","school_charges","platform_charges","messages","grades","family_requests","daily_entries","announcements","calendar_events","teachers","classrooms"])
      expect((await asUser(kidUser,()=>query(`select id from ${table}`))).rows,table).toHaveLength(0);
  });
  it("impide toda publicación o cambio académico por API directa",async()=>{
    for(const sql of [
      "insert into calendar_events(school_id,title,event_date,type,description) values($1,'Intento',current_date,'event','x')",
      "insert into announcements(school_id,title,content) values($1,'Intento','x')",
      "insert into daily_entries(school_id,student_id,category,note) values($1,$2,'tarea','x')",
      "insert into grades(school_id,student_id,subject,period,score,recommendation) values($1,$2,'x','x','100','x')",
      "insert into family_requests(school_id,student_id,type,request_date,reason) values($1,$2,'absence',current_date,'x')",
      "insert into messages(school_id,student_id,body) values($1,$2,'x')"
    ]) await expect(asUser(kidUser,()=>query(sql,sql.includes('$2')?[school,child]:[school]))).rejects.toThrow();
    await expect(asUser(kidUser,()=>query("select publish_class_entry($1,$2,'tarea','x',current_date)",[school,room]))).rejects.toThrow();
    await expect(asUser(kidUser,()=>query("select request_institution('{}')"))).rejects.toThrow(/solo lectura/);
    const updated=await asUser(kidUser,()=>query("update calendar_events set title='Hack' where school_id=$1 returning id",[school]));
    expect(updated.rows).toHaveLength(0);
    await expect(asUser(kidUser,()=>query("select set_student_access_until($1,current_date+1)",[child]))).rejects.toThrow();
  });
  it("madre y padre leen calendario, actividades, comunicados y notas pero no publican",async()=>{
    for(const user of [mother,father]) {
      expect((await asUser(user,()=>query("select id from calendar_events where school_id=$1",[school]))).rows).toHaveLength(3);
      expect((await asUser(user,()=>query("select id from daily_entries where student_id=$1",[child]))).rows).toHaveLength(2);
      expect((await asUser(user,()=>query("select id from grades where student_id=$1",[child]))).rows).toHaveLength(1);
      const notices=(await asUser(user,()=>query<{audience:string}>("select audience from announcements where school_id=$1",[school]))).rows;
      expect(notices).toHaveLength(3);expect(notices.some(n=>n.audience==='staff')).toBe(false);
      await expect(asUser(user,()=>query("insert into announcements(school_id,title,content) values($1,'Intento','x')",[school]))).rejects.toThrow();
      await expect(asUser(user,()=>query("insert into calendar_events(school_id,title,event_date,type,description) values($1,'Intento',current_date,'event','x')",[school]))).rejects.toThrow();
      expect((await asUser(user,()=>query("update grades set score='100' where student_id=$1 returning id",[child]))).rows).toHaveLength(0);
    }
  });
  it("bloquea contenido por deuda, activación, ficha o baja; el plazo conserva la deuda",async()=>{
    await query("update school_charges set due_date=(now() at time zone 'America/La_Paz')::date-1 where student_id=$1",[child]);
    let result=await asUser(kidUser,portal);expect(result.accessAllowed).toBe(false);expect(result.events).toEqual([]);expect(result.dailyEntries).toEqual([]);expect(result.announcements).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('429');
    await query("update students set access_until=(now() at time zone 'America/La_Paz')::date+1 where id=$1",[child]);
    expect((await asUser(kidUser,portal)).accessAllowed).toBe(true);
    await query("update students set profile_complete=false where id=$1",[child]);expect((await asUser(kidUser,portal)).accessAllowed).toBe(false);
    await query("update students set profile_complete=true where id=$1",[child]);
    await query("update platform_charges set status='pending' where student_id=$1",[child]);expect((await asUser(kidUser,portal)).accessAllowed).toBe(false);
    await query("update platform_charges set status='paid' where student_id=$1",[child]);
    await query("update students set status='inactive' where id=$1",[child]);expect((await asUser(kidUser,portal)).accessAllowed).toBe(false);
    await query("update students set status='active' where id=$1",[child]);
  });
  it("cambiar correo, confirmación o habilitación revoca la cuenta anterior inmediatamente",async()=>{
    await asUser(director,()=>enable(child,"replacement@test.bo"));
    await expect(asUser(kidUser,portal)).rejects.toThrow(/habilitado/);expect((await asUser(kidUser,identity)).roles).toEqual([]);
    await asUser(director,()=>enable());await query("update auth.users set email_confirmed_at=null where id=$1",[kidUser]);
    await expect(asUser(kidUser,portal)).rejects.toThrow();
    await query("update auth.users set email_confirmed_at=now() where id=$1",[kidUser]);
    await asUser(director,()=>enable(child,"",false)); await expect(asUser(kidUser,portal)).rejects.toThrow();
    await asUser(director,()=>enable());
  });
  it("solo el propietario abre soporte de estudiante y no hereda acceso de adultos",async()=>{
    for(const user of [director,kidUser,mother]) await expect(asUser(user,()=>query("select start_support_session($1,$2,'student','Revisar tareas y permisos')",[school,kidUser]))).rejects.toThrow();
    const accounts=(await asUser(owner,()=>query<{payload:any[]}>("select support_accounts($1) as payload",[school]))).rows[0].payload;
    expect(accounts).toContainEqual({id:kidUser,name:"Lucía Prueba",email:"kid@test.bo",role:"student"});
    const session=(await asUser(owner,()=>query<{payload:{id:string}}>("select start_support_session($1,$2,'student','Revisar tareas y permisos') as payload",[school,kidUser]))).rows[0].payload.id;
    const result=await asUser(owner,identity,session);expect(result.roles).toEqual(["student"]);expect(result.studentIds).toEqual([child]);
    expect((await asUser(owner,portal,session)).accessAllowed).toBe(true);
    expect((await asUser(owner,()=>query("select id from students"),session)).rows).toHaveLength(0);
    await expect(asUser(owner,()=>enable(),session)).rejects.toThrow();
    await asUser(director,()=>enable(child,"",false));
    await expect(asUser(owner,portal,session)).rejects.toThrow(/support_expired/);
    await asUser(owner,()=>query("select end_support_session($1)",[session]));
  });
});
