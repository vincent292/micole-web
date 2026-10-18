import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `ca000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [owner, director, teacher, mother, father, kid, stranger] = [
  1, 2, 3, 4, 5, 6, 7,
].map(id);
const [school, otherSchool, room, otherRoom, child, otherChild] = [
  20, 21, 30, 31, 40, 41,
].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
let serial = 0;
async function as<T>(
  user: string | null,
  task: () => Promise<T>,
  support?: string,
  role = "authenticated",
) {
  const save = `auth_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role ${role};`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [
      user || "",
      JSON.stringify(support ? { "x-micole-support": support } : {}),
    ],
  );
  try {
    const result = await task();
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save}; release savepoint ${save};`);
    throw e;
  }
}
// Para las mutaciones que sí deben persistir dentro de la transacción del caso.
async function acting<T>(user: string, task: () => Promise<T>, support?: string) {
  const save = `mutation_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role authenticated;`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers',$2,true)",
    [user, JSON.stringify(support ? { "x-micole-support": support } : {})],
  );
  try {
    const result = await task();
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await db.exec(`release savepoint ${save}`);
    return result;
  } catch (e) {
    await db.exec(`rollback to savepoint ${save};release savepoint ${save}`);
    throw e;
  }
}
const request = async (kind = "annual_materials", amount = 0) => {
  const payload = {
    id: id(60),
    school_id: school,
    classroom_id: room,
    kind,
    academic_year: 2026,
    title: "Lista para el aula",
    details: "Cuaderno y lápices para aprender",
    event_date: "2026-10-15",
    amount,
    due_date: "2026-10-01",
    blocks_access: true,
  };
  await acting(teacher, () =>
    q("select save_academic_request($1::jsonb)", [JSON.stringify(payload)]),
  );
  return payload.id;
};
const approve = (requestId: string) =>
  acting(director, () =>
    q("select review_academic_request($1,true,'Aprobado')", [requestId]),
  );
const checkout = (
  items: any[],
  receipt = id(90),
  method = "cash",
  invoice: any = {},
  reviewed = false,
  user = director,
) =>
  acting(user, () =>
    q("select checkout_school_payment($1,$2,$3::jsonb,$4,$5,$6::jsonb,$7)", [
      receipt,
      child,
      JSON.stringify(items),
      method,
      "REC-TEST",
      JSON.stringify(invoice),
      reviewed,
    ]),
  );
beforeAll(async () => {
  await db.exec(
    `create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;`,
  );
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const file of readdirSync(migrations)
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(
      readFileSync(new URL(file, migrations), "utf8").replace(
        "create extension if not exists pgcrypto;",
        "",
      ),
    );
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('ops-owner@test.bo')",
  );
  for (const [user, email] of [
    [owner, "ops-owner@test.bo"],
    [director, "ops-director@test.bo"],
    [teacher, "ops-teacher@test.bo"],
    [mother, "ops-mother@test.bo"],
    [father, "ops-father@test.bo"],
    [kid, "ops-kid@test.bo"],
    [stranger, "ops-stranger@test.bo"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into schools(id,name,slug,status) values($1,'Colegio Operaciones','ops-one','active'),($2,'Otro colegio','ops-two','active')",
    [school, otherSchool],
  );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [school, director, teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name,capacity) values($1,$2,'Primero A',2),($3,$2,'Primero B',30)",
    [room, school, otherRoom],
  );
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesora','ops-teacher@test.bo','active')",
    [id(50), school, teacher],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [school, id(50), room],
  );
  for (const [student, classroom] of [
    [child, room],
    [otherChild, otherRoom],
  ]) {
    await q(
      "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email,father_name,father_email,birth_date) values($1,$2,$3,'Lucía','Prueba','active',true,'Madre','ops-mother@test.bo','Padre','ops-father@test.bo',(now() at time zone 'America/La_Paz')::date+1-interval '5 years')",
      [student, school, classroom],
    );
    await q(
      "insert into platform_charges(school_id,student_id,concept,period,amount,status) values($1,$2,'Activación','2026-10',50,'paid')",
      [school, student],
    );
  }
}, 30000);
beforeEach(async () => {
  await db.exec("begin");
  await q("insert into platform_admins(user_id) values($1) on conflict do nothing",[owner]);
  await acting(director, () =>
    q("select set_student_login($1,$2,true)", [child, "ops-kid@test.bo"]),
  );
  await acting(mother, () => q("select workspace_identity()"));
  await acting(father, () => q("select workspace_identity()"));
});
afterEach(async () => {
  await db.exec("rollback");
});
afterAll(async () => {
  await db.close();
});

const start = async (role: string, target: string | null = null, relationship: string | null = null) => {
 await acting(owner,()=>q("select set_test_institution($1,true)",[school]));
 const r=await acting(owner,()=>q("select start_test_session($1,$2,$3,$4) as value",[school,role,target,relationship]));
 return r.rows[0].value.id as string;
};
describe("pruebas reales de roles reservadas al propietario",()=>{
 it("rechaza a directores, docentes y familias aunque alteren el cliente",async()=>{
  for(const user of [director,teacher,mother,kid,stranger]){
   await expect(as(user,()=>q("select set_test_institution($1,true)",[school]))).rejects.toThrow(/propietario/);
   await expect(as(user,()=>q("select test_workspace_options($1)",[school]))).rejects.toThrow(/propietario/);
   await expect(as(user,()=>q("select start_test_session($1,'director',null,null)",[school]))).rejects.toThrow(/propietario/);
  }
 });
 it("exige marcar una institución antes de entrar",async()=>{
  await expect(as(owner,()=>q("select start_test_session($1,'director',null,null)",[school]))).rejects.toThrow(/Marca primero/);
 });
 it("lista registros ficticios sin confirmar correos ni crear usuarios o vínculos",async()=>{
  await q("update teachers set user_id=null,email='ficticio@example.invalid' where id=$1",[id(50)]);
  const users=(await q("select count(*) as n from auth.users")).rows[0].n;
  await acting(owner,()=>q("select set_test_institution($1,true)",[school]));
  const r=await as(owner,()=>q("select test_workspace_options($1) as value",[school]));
  expect(r.rows[0].value.accounts.filter((a:any)=>a.role==='teacher')).toHaveLength(1);
  expect(r.rows[0].value.accounts.filter((a:any)=>a.role==='guardian')).toHaveLength(4);
  await start('teacher',id(50));
  expect((await q("select count(*) as n from auth.users")).rows[0].n).toBe(users);
  expect((await q("select user_id from teachers where id=$1",[id(50)])).rows[0].user_id).toBeNull();
 });
 it("Dirección de pruebas puede preparar sus aulas sin acceso a otra institución",async()=>{
  const sid=await start('director');
  const result=await as(owner,()=>q("select workspace_identity() as value"),sid);
  expect(result.rows[0].value.roles).toEqual(['director']);expect(result.rows[0].value.support.mode).toBe('test');
  expect((await as(owner,()=>q("select has_school_role($1,array['director']) as yes,has_school_role($2,array['director']) as no",[school,otherSchool]),sid)).rows[0]).toEqual({yes:true,no:false});
  await acting(owner,()=>q("select save_classroom($1::jsonb,array[]::uuid[])",[JSON.stringify({id:id(35),school_id:school,name:'Aula prueba',level:'Primaria',teacherIds:[]})]),sid);
  expect((await q("select count(*) as n from classrooms where id=$1",[id(35)])).rows[0].n).toBe(1);
 });
 it("el docente usa su registro aunque tenga correo ficticio y solo ve sus estudiantes",async()=>{
  await q("update teachers set user_id=null where id=$1",[id(50)]);
  const sid=await start('teacher',id(50));
  const r=await as(owner,()=>q("select workspace_identity() as value"),sid);expect(r.rows[0].value.teacherIds).toEqual([id(50)]);
  const visible=await as(owner,()=>q("select id from students order by id"),sid);expect(visible.rows.map((r:any)=>r.id)).toEqual([child]);
  expect((await as(owner,()=>q("select learning_can_manage($1,null) as yes,learning_can_manage($2,null) as no",[room,otherRoom]),sid)).rows[0]).toEqual({yes:true,no:false});
  await expect(as(owner,()=>q("select set_test_institution($1,false)",[school]),sid)).rejects.toThrow(/propietario/);
 });
 it("madre y padre consultan el niño elegido sin vínculos ni escritura académica",async()=>{
  for(const relationship of ['mother','father']){
   const sid=await start('guardian',child,relationship);
   const r=await as(owner,()=>q("select workspace_identity() as value"),sid);expect(r.rows[0].value.guardianStudentIds).toEqual([child]);
   const visible=await as(owner,()=>q("select id from students"),sid);expect(visible.rows.map((r:any)=>r.id)).toEqual([child]);
   expect((await as(owner,()=>q("select family_access($1) as yes,family_access($2) as no,learning_can_manage($3,null) as write",[child,otherChild,room]),sid)).rows[0]).toEqual({yes:true,no:false,write:false});
  }
 });
 it("el estudiante consulta su portal sin exponer fichas ni contactos",async()=>{
  const sid=await start('student',child);
  const r=await as(owner,()=>q("select workspace_identity() as value,student_portal() as portal"),sid);
  expect(r.rows[0].value.studentIds).toEqual([child]);expect(r.rows[0].portal).not.toHaveProperty('motherEmail');
  expect((await as(owner,()=>q("select id from students"),sid)).rows).toEqual([]);
 });
 it("mantiene el bloqueo académico por pagos para familias y estudiantes de prueba",async()=>{
  await q("update platform_charges set status='pending' where student_id=$1",[child]);
  let sid=await start('guardian',child,'mother');
  expect((await as(owner,()=>q("select family_access($1) as access",[child]),sid)).rows[0].access).toBe(false);
  sid=await start('student',child);
  const r=await as(owner,()=>q("select student_portal() as value"),sid);expect(r.rows[0].value.accessAllowed).toBe(false);
 });
 it("publica, entrega y revisa una tarea con roles de prueba y asignación de materia",async()=>{
  const cs=(await acting(director,()=>q("select configure_class_subject($1,'Matemáticas',array[$2]::uuid[],true) as value",[room,id(50)]))).rows[0].value;
  await q("update teachers set user_id=null where id=$1",[id(50)]);
  let sid=await start('teacher',id(50));
  await acting(owner,()=>q("select save_assignment($1::jsonb)",[JSON.stringify({id:id(100),classroom_id:room,class_subject_id:cs,title:'Tarea de prueba',instructions:'Responder al ejercicio',max_score:20,status:'published',allow_late:true})]),sid);
  sid=await start('student',child);
  const sub=(await acting(owner,()=>q("select save_assignment_submission($1,'Respuesta de prueba',true) as value",[id(100)]),sid)).rows[0].value;
  sid=await start('guardian',child,'mother');
  await expect(as(owner,()=>q("select save_assignment_submission($1,'No permitido',true)",[id(100)]),sid)).rejects.toThrow();
  sid=await start('teacher',id(50));
  await acting(owner,()=>q("select review_assignment_submission($1,'reviewed','Correcto',18)",[sub]),sid);
  expect((await q("select status,score from assignment_submissions where id=$1",[sub])).rows[0]).toMatchObject({status:'reviewed',score:'18.00'});
 });
 it("rechaza objetivos de otra institución y roles inválidos",async()=>{
  await acting(owner,()=>q("select set_test_institution($1,true)",[otherSchool]));
  await expect(as(owner,()=>q("select start_test_session($1,'student',$2,null)",[otherSchool,child]))).rejects.toThrow(/estudiante/);
  await expect(as(owner,()=>q("select start_test_session($1,'teacher',$2,null)",[otherSchool,id(50)]))).rejects.toThrow(/docente/);
  await expect(as(owner,()=>q("select start_test_session($1,'superadmin',null,null)",[otherSchool]))).rejects.toThrow(/rol válido/);
 });
 it("no permite reutilizar la sesión de pruebas de otro usuario",async()=>{
  const sid=await start('director');
  await expect(as(stranger,()=>q("select workspace_identity()"),sid)).rejects.toThrow(/support_expired/);
 });
 it("desactivar, caducar o cerrar una prueba revoca el contexto inmediatamente",async()=>{
  let sid=await start('director');
  await acting(owner,()=>q("select set_test_institution($1,false)",[school]));
  await expect(as(owner,()=>q("select workspace_identity()"),sid)).rejects.toThrow(/support_expired/);
  sid=await start('director');await q("update aulanexo_private.support_sessions set expires_at=now()-interval '1 minute' where id=$1",[sid]);
  await expect(as(owner,()=>q("select workspace_identity()"),sid)).rejects.toThrow(/support_expired/);
  sid=await start('director');await acting(owner,()=>q("select end_support_session($1)",[sid]),sid);
  await expect(as(owner,()=>q("select workspace_identity()"),sid)).rejects.toThrow(/support_expired/);
  expect((await as(owner,()=>q("select workspace_identity() as value"))).rows[0].value.roles).toContain('superadmin');
 });
});
