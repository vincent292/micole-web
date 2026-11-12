import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const id = (n: number) =>
  `ef000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [
  owner,
  director,
  teacher,
  mother,
  kid,
  stranger,
  school,
  other,
  room,
  child,
  teacherId,
] = [1, 2, 3, 4, 5, 6, 20, 21, 30, 40, 50].map(id);
const q = (sql: string, args: unknown[] = []) => db.query<any>(sql, args);
async function as(user: string, sql: string, args: unknown[] = []) {
  await db.exec("savepoint actor;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    await q("select workspace_identity()");
    return await q(sql, args);
  } finally {
    await db.exec("rollback to savepoint actor;release savepoint actor");
  }
}
let yearKey = id(60);
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

  for (const [user, email] of [
    [owner, "ariasvincent292@gmail.com"],
    [director, "direccion@pruebas.micole.test"],
    [teacher, "docente@pruebas.micole.test"],
    [mother, "familia@pruebas.micole.test"],
    [kid, "estudiante@pruebas.micole.test"],
    [stranger, "outside@example.invalid"],
  ])
    await q(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [user, email],
    );
  await q(
    "insert into aulanexo_private.platform_admin_allowlist(email) values('ariasvincent292@gmail.com') on conflict do nothing",
  );
  await q(
    "insert into platform_admins(user_id) values($1) on conflict do nothing",
    [owner],
  );
  await q(
    "insert into schools(id,name,slug,status) values($1,'MiCole pruebas','test-persisted','active'),($2,'Colegio real','real-persisted','active')",
    [school, other],
  );
  await q(
    "insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)",
    [school, owner],
  );
  await q(
    "insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)",
    [school, owner],
  );
  for (const [user, email, role] of [
    [director, "direccion@pruebas.micole.test", "director"],
    [teacher, "docente@pruebas.micole.test", "teacher"],
    [mother, "familia@pruebas.micole.test", "guardian"],
    [kid, "estudiante@pruebas.micole.test", "student"],
  ])
    await q(
      "insert into aulanexo_private.persisted_test_accounts(user_id,school_id,email,role) values($1,$2,$3,$4)",
      [user, school, email, role],
    );
  await q(
    "insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher')",
    [school, director, teacher],
  );
  await q(
    "insert into classrooms(id,school_id,name) values($1,$2,'Primero A')",
    [room, school],
  );
  await q(
    "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente de pruebas','docente@pruebas.micole.test','active')",
    [teacherId, school, teacher],
  );
  await q(
    "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)",
    [school, teacherId, room],
  );
  await q(
    "insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email) values($1,$2,$3,'Lucía','Ficticia','active',true,'Madre de prueba','familia@pruebas.micole.test')",
    [child, school, room],
  );
  await q(
    "insert into aulanexo_private.student_logins(student_id,school_id,email,enabled,updated_by) values($1,$2,'estudiante@pruebas.micole.test',true,$3)",
    [child, school, owner],
  );
  await q(
    "insert into academic_years(id,school_id,year,name,starts_on,ends_on) values($1,$2,2026,'Gestión 2026','2026-01-01','2026-12-31') on conflict(school_id,year) do nothing",
    [id(60), school],
  );
  yearKey = (
    await q("select id from academic_years where school_id=$1 and year=2026", [
      school,
    ])
  ).rows[0].id;
  await q(
    "insert into enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,started_on,status) select $1,$2,$3,$4,'Lucía Ficticia','Primero A','2026-01-01','enrolled' where not exists(select 1 from enrollment_history where student_id=$2)",
    [school, child, room, yearKey],
  );
  await q(
    "insert into academic_terms(id,school_id,year_id,name,starts_on,ends_on) values($1,$2,$3,'Periodo 2026','2026-01-01','2026-12-31')",
    [id(61), school, yearKey],
  );
}, 30000);
afterAll(() => db.close());
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
async function mutate(user: string, sql: string, args: unknown[] = []) {
  await db.exec("savepoint mutation;set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const result = await q(sql, args);
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await db.exec("release savepoint mutation");
    return result;
  } catch (e) {
    await db.exec("rollback to savepoint mutation;release savepoint mutation");
    throw e;
  }
}

async function subjectFixture() {
  await q("update classrooms set subjects_enabled=true where id=$1", [room]);
  return (
    await mutate(
      director,
      "select configure_class_subject($1,'Matemáticas',$2::uuid[],true) id",
      [room, [teacherId]],
    )
  ).rows[0].id as string;
}
async function policy(code = "primary6", scheme = "bolivia2026") {
  await mutate(director, "select save_academic_policy($1,$2,$3,'best')", [
    room,
    code,
    scheme,
  ]);
}
async function fillTerm(term: string, subject: string, value = 80) {
  for (const [j, dimension] of ["ser", "saber", "hacer", "self"].entries()) {
    const payload = {
      term_id: term,
      classroom_id: room,
      class_subject_id: subject,
      title: `Evidencia ${dimension}`,
      assessment_date:
        term === id(61)
          ? "2026-03-01"
          : term === id(62)
            ? "2026-06-01"
            : "2026-10-01",
      max_score: 100,
      weight: 1,
      dimension,
    };
    const column = (
      await mutate(teacher, "select save_assessment($1::jsonb) id", [
        JSON.stringify(payload),
      ])
    ).rows[0].id;
    await mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
      column,
      JSON.stringify([{ student_id: child, score: value, revision: 0 }]),
    ]);
  }
}
const config = (subject: string) => ({
  days: [1, 2, 3, 4, 5],
  start: 450,
  end: 800,
  periodMinutes: 40,
  breaks: [{ start: 610, end: 640 }],
  loads: [
    {
      classSubjectId: subject,
      classroomId: room,
      teacherId,
      periods: 2,
      blockSize: 1,
    },
  ],
  unavailable: [],
});
const lessons = (subject: string) =>
  [0, 1].map((i) => ({
    classSubjectId: subject,
    classroomId: room,
    teacherId,
    day: 1,
    start: 450 + i * 40,
    end: 490 + i * 40,
  }));
it("keeps historical enrollment and future profile changes in a paginated, scoped kardex",async()=>{
 const first=(await as(director,"select student_kardex($1,null,null,'all',null,1) data",[child])).rows[0].data;
 expect(first.studentName).toContain('Lucía');expect(first.events).toHaveLength(1);expect(first.hasMore).toBe(true);
 const next=(await as(director,"select student_kardex($1,null,null,'all',$2,1) data",[child,first.next])).rows[0].data;
 expect(next.events[0].key).not.toBe(first.events[0].key);
 await q("update students set first_name='Lucía Actualizada' where id=$1",[child]);
 const history=(await as(director,"select student_kardex($1,null,null,'administrative') data",[child])).rows[0].data;
 expect(history.events.some((e:any)=>e.title==='Ficha del estudiante actualizada')).toBe(true);
 expect(JSON.stringify(history)).not.toContain('mother_email');
 await expect(as(stranger,"select student_kardex($1)",[child])).rejects.toThrow(/acceso/);
 await expect(as(owner,"select student_kardex($1)",[child])).rejects.toThrow(/acceso/);
 await expect(as(mother,"select student_kardex($1)",[id(999)])).rejects.toThrow(/acceso/);
});
it("does not expose private finances or unpublished academic results to another teacher or a family",async()=>{
 await q("insert into school_receipts(id,school_id,student_id,total,payment_method,reference,request_hash,recorded_by) values($1,$2,$3,100,'cash','SOLO CAJA','kardex-fixture',$4)",[id(998),school,child,director]);
 const subject=await subjectFixture();await fillTerm(id(61),subject,40);
 const staff=(await as(teacher,"select student_kardex($1,null,null,'academic') data",[child])).rows[0].data;
 expect(staff.events.length).toBeGreaterThan(0);expect(staff.financialAvailable).toBe(false);
 const money=(await as(teacher,"select student_kardex($1,null,null,'payments') data",[child])).rows[0].data;expect(money.events).toEqual([]);
 const own=(await as(mother,"select student_kardex($1,null,null,'payments') data",[child])).rows[0].data;expect(own.events[0].body).toBe('SOLO CAJA');
 const family=(await as(mother,"select student_kardex($1,null,null,'academic') data",[child])).rows[0].data;
 expect(family.events).toEqual([]);
 const cols=(await as(director,"select student_kardex($1,'2020-01-01','2020-12-31','all') data",[child])).rows[0].data;expect(cols.events).toEqual([]);
 await expect(as(director,"select student_kardex($1,null,null,'all',null,101)",[child])).rejects.toThrow(/filtros/);
});
it("records confirmed attendance as a single checked batch, with deduplicated notices on retries",async()=>{
 const day=new Date().toISOString().slice(0,10),records=[{studentId:child,status:'absent',note:'Falta de prueba'}],request=id(990);
 const result=(await mutate(teacher,"select save_student_attendance($1,$2,$3,0,true,'',$4,null) data",[room,day,JSON.stringify(records),request])).rows[0].data;
 expect(result.confirmed).toBe(true);
 const notices=Number((await q("select count(*) n from notifications where student_id=$1 and kind='attendance_absent'",[child])).rows[0].n);
 const retry=(await mutate(teacher,"select save_student_attendance($1,$2,$3,0,true,'',$4,null) data",[room,day,JSON.stringify(records),request])).rows[0].data;expect(retry).toEqual(result);
 expect(Number((await q("select count(*) n from notifications where student_id=$1 and kind='attendance_absent'",[child])).rows[0].n)).toBe(notices);
 const history=(await as(mother,"select student_kardex($1,null,null,'attendance') data",[child])).rows[0].data;
 expect(history.events.some((e:any)=>e.details.status==='absent')).toBe(true);
 await expect(mutate(director,"select save_student_attendance($1,$2,$3,0,true,'',$4,null)",[room,day,JSON.stringify(records),id(991)])).rejects.toThrow(/docentes/);
});

it("confirms a full classroom with one write batch and one notification invalidation",async()=>{
 for(let i=0;i<30;i++)await q("insert into students(id,school_id,classroom_id,first_name,last_name,status,profile_complete,mother_name,mother_email) values($1,$2,$3,'Alumno lote',$4,'active',true,'Madre','familia@pruebas.micole.test')",[id(500+i),school,room,String(i)]);
 await mutate(mother,"select workspace_identity()");
 const day=new Date().toISOString().slice(0,10),records=(await q("select id from students where classroom_id=$1",[room])).rows.map((s:any)=>({studentId:s.id,status:'absent',note:''}));
 const revision=Number((await q("select revision from workspace_signals where school_id=$1",[school])).rows[0].revision);
 const saved=(await mutate(teacher,"select save_student_attendance($1,$2,$3,0,true,'',$4,null) data",[room,day,JSON.stringify(records),id(995)])).rows[0].data;
 expect(saved.notifications).toBe(records.length);
 expect(Number((await q("select count(*) n from student_attendance_records where school_id=$1",[school])).rows[0].n)).toBe(records.length);
 const after=Number((await q("select revision from workspace_signals where school_id=$1",[school])).rows[0].revision);
 expect(after-revision).toBe(3); // Session creation, confirmation and one batched notice invalidation.
});
it("preserves enrollment history on transfer and revokes the former teacher access",async()=>{
 await q("insert into school_operation_settings(school_id,require_annual_materials) values($1,false) on conflict(school_id) do update set require_annual_materials=false",[school]);
 const nextRoom=id(901);await q("insert into classrooms(id,school_id,name) values($1,$2,'Segundo B')",[nextRoom,school]);
 await mutate(director,"select move_student_year($1,$2,'Traslado de prueba')",[child,nextRoom]);
 const data=(await as(director,"select student_kardex($1,null,null,'enrollment') data",[child])).rows[0].data;
 expect(data.events.some((e:any)=>e.title==='Traslado de paralelo')).toBe(true);
 expect(data.events.some((e:any)=>e.title.includes('Segundo B'))).toBe(true);
 await expect(as(teacher,"select student_kardex($1)",[child])).rejects.toThrow(/acceso/);
});

it("keeps correction justifications private from families in the unified history",async()=>{
 const day=new Date().toISOString().slice(0,10);await mutate(teacher,"select save_student_attendance($1,$2,$3,0,true,'',$4,null)",[room,day,JSON.stringify([{studentId:child,status:'absent',note:''}]),id(997)]);
 const record=(await q("select id from student_attendance_records where student_id=$1",[child])).rows[0].id;
 await q("insert into student_attendance_corrections(id,school_id,record_id,previous_status,previous_note,proposed_status,proposed_note,reason,status,requested_by,reviewed_by,reviewed_at,review_note) values($1,$2,$3,'absent','','present','','JUSTIFICACION INTERNA','approved',$4,$5,now(),'Revision interna')",[id(996),school,record,teacher,director]);
 const own=(await as(mother,"select student_kardex($1,null,null,'attendance') data",[child])).rows[0].data;
 expect(JSON.stringify(own)).not.toContain('JUSTIFICACION INTERNA');expect(own.events.some((e:any)=>e.details.status==='present')).toBe(true);
 const staff=(await as(director,"select student_kardex($1,null,null,'attendance') data",[child])).rows[0].data;
 expect(JSON.stringify(staff)).toContain('JUSTIFICACION INTERNA');
});
