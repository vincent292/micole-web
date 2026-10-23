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
const column = async (n: number, kind = "numeric", max = 100) => {
  const payload = {
    id: id(n),
    term_id: id(61),
    classroom_id: room,
    title: "Evaluación " + n,
    assessment_date: "2026-10-22",
    max_score: max,
    weight: 1,
    grading_type: kind,
  };
  await mutate(teacher, "select save_assessment($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  return id(n);
};
const mark = (a: string, value: any) =>
  mutate(teacher, "select save_assessment_scores($1,$2::jsonb)", [
    a,
    JSON.stringify([{ student_id: child, ...value }]),
  ]);
it("Dirección configura el límite, las correcciones se auditan y las notas iguales no consumen intentos", async () => {
  await mutate(director, "select save_gradebook_settings($1,1,$2)", [
    school,
    ["Destacado", "Logrado"],
  ]);
  await expect(
    mutate(teacher, "select save_gradebook_settings($1,5,$2)", [
      school,
      ["Uno", "Dos"],
    ]),
  ).rejects.toThrow(/Dirección/);
  const a = await column(70);
  await mark(a, { score: 50, revision: 0 });
  await mark(a, { score: 60, revision: 1 });
  await mark(a, { score: 60, revision: 2 });
  await expect(mark(a, { score: 70, revision: 2 })).rejects.toThrow(/límite/);
  await expect(mark(a, { score: 80, revision: 1 })).rejects.toThrow(
    /otro dispositivo/,
  );
  expect(
    (
      await q(
        "select corrections,revision from assessment_scores where assessment_id=$1",
        [a],
      )
    ).rows[0],
  ).toMatchObject({ corrections: 1, revision: 2 });
  expect((await q("select * from assessment_score_changes")).rows).toHaveLength(
    1,
  );
});
it("cualitativas conservan etiquetas, sin convertirlas a números ni alterar la escala con notas", async () => {
  const a = await column(71, "qualitative");
  await mark(a, { qualitative_score: "Logrado", revision: 0 });
  await expect(
    mark(a, { qualitative_score: "Inventado", revision: 1 }),
  ).rejects.toThrow(/etiquetas/);
  await expect(mark(a, { score: 20, revision: 1 })).rejects.toThrow(
    /etiquetas/,
  );
  const payload = {
    id: a,
    term_id: id(61),
    classroom_id: room,
    title: "Cambio de escala",
    assessment_date: "2026-10-22",
    max_score: 100,
    weight: 1,
    grading_type: "qualitative",
    qualitative_options: ["Otro", "Distinto"],
  };
  await expect(
    mutate(teacher, "select save_assessment($1::jsonb)", [
      JSON.stringify(payload),
    ]),
  ).rejects.toThrow(/conserva/);
  const workspace = (
    await as(mother, "select gradebook_workspace($1,null,$2,$3) as value", [
      room,
      id(61),
      child,
    ])
  ).rows[0].value;
  expect(workspace.canManage).toBe(false);
  expect(workspace.scores[0].qualitative_score).toBe("Logrado");
  expect(workspace.roster[0].total.score).toBeNull();
});
it("calcula suma, promedio y ponderación sin convertir pendientes en cero", async () => {
  const a = await column(72, "numeric", 10),
    b = await column(73, "numeric", 20);
  await mark(a, { score: 5 });
  await mark(b, { score: 20 });
  const total = async () =>
    (
      await q("select aulanexo_private.grade_total($1,$2,$3,null) as value", [
        id(61),
        child,
        room,
      ])
    ).rows[0].value;
  expect((await total()).score).toBe(75);
  await mutate(teacher, "select save_gradebook_rule($1,$2,null,$3)", [
    id(61),
    room,
    "sum",
  ]);
  expect(await total()).toMatchObject({ score: 25, max_score: 30, missing: 0 });
  await mutate(teacher, "select save_gradebook_rule($1,$2,null,$3)", [
    id(61),
    room,
    "average",
  ]);
  expect((await total()).score).toBe(75);
  await column(74, "numeric", 100);
  expect(await total()).toMatchObject({ score: 75, missing: 1 });
});
it("familias consultan solo al propio hijo y con pagos habilitados", async () => {
  const a = await column(75);
  await mark(a, { score: 80 });
  await expect(
    as(stranger, "select gradebook_workspace($1,null,$2,$3)", [
      room,
      id(61),
      child,
    ]),
  ).rejects.toThrow(/familia/);
  await q(
    "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota vencida',current_date-2,100,'overdue')",
    [school, child],
  );
  await expect(
    as(mother, "select gradebook_workspace($1,null,$2,$3)", [
      room,
      id(61),
      child,
    ]),
  ).rejects.toThrow(/familia/);
  await expect(
    as(mother, "select save_assessment_scores($1,$2::jsonb)", [
      a,
      JSON.stringify([{ student_id: child, score: 100 }]),
    ]),
  ).rejects.toThrow();
});
it("tarea puntuable crea columna y la revisión se guarda también en notas de forma atómica", async () => {
  const task = id(80),
    sub = id(81),
    payload = {
      id: task,
      classroom_id: room,
      title: "Tarea puntuable",
      instructions: "Resolver y entregar",
      max_score: 20,
      status: "published",
      gradeable: true,
      term_id: id(61),
      assessment_date: "2026-10-22",
    };
  await mutate(teacher, "select save_assignment($1::jsonb)", [
    JSON.stringify(payload),
  ]);
  const a = (
    await q("select id from assessments where assignment_id=$1", [task])
  ).rows[0].id;
  expect(a).toBeTruthy();
  await q(
    "insert into assignment_submissions(id,school_id,assignment_id,student_id,body,status,submitted_by) values($1,$2,$3,$4,'Respuesta','submitted',$5)",
    [sub, school, task, child, kid],
  );
  await mutate(
    teacher,
    "select review_assignment_submission($1,'reviewed','Buen avance',18)",
    [sub],
  );
  expect(
    (await q("select score from assessment_scores where assessment_id=$1", [a]))
      .rows[0].score,
  ).toBe("18.00");
  await mutate(director, "select save_gradebook_settings($1,0,$2)", [
    school,
    ["Uno", "Dos"],
  ]);
  await expect(
    mutate(
      teacher,
      "select review_assignment_submission($1,'reviewed','Cambio',19)",
      [sub],
    ),
  ).rejects.toThrow(/límite/);
  expect(
    (await q("select score from assignment_submissions where id=$1", [sub]))
      .rows[0].score,
  ).toBe("18.00");
});
it("la asistencia confirmada bloquea API, SQL y borrado, sin excepciones de rol", async () => {
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
    records = JSON.stringify([
      { studentId: child, status: "present", note: "" },
    ]);
  await mutate(
    teacher,
    "select save_student_attendance($1,$2,$3::jsonb,0,true,'')",
    [room, day, records],
  );
  await expect(
    mutate(
      director,
      "select save_student_attendance($1,$2,$3::jsonb,1,true,'Corregir')",
      [room, day, records],
    ),
  ).rejects.toThrow(/no puede modificarse/);
  await db.exec("savepoint imm");
  await expect(
    q("update student_attendance_records set status='absent'"),
  ).rejects.toThrow(/no pueden modificarse/);
  await db.exec("rollback to savepoint imm");
  await expect(q("delete from student_attendance_sessions")).rejects.toThrow(
    /definitiva/,
  );
});
async function tutoringFixture(){
 const mathUser=id(170),mathTeacher=id(171),father=id(172);
 await q("insert into auth.users(id,email,email_confirmed_at) values($1,'math@school.test',now()),($2,'father@school.test',now())",[mathUser,father]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'teacher')",[school,mathUser]);
 await q("insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Profesor de Matemáticas','math@school.test','active')",[mathTeacher,school,mathUser]);
 await q('insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3)',[school,mathTeacher,room]);
 await q("update students set father_name='Padre de prueba',father_email='father@school.test' where id=$1",[child]);
 await mutate(father,'select workspace_identity()');
 await mutate(director,'select set_classroom_tutor($1,$2)',[room,teacherId]);
 const subject=(await mutate(director,"select configure_class_subject($1,'Matemáticas',$2::uuid[],true) id",[room,[mathTeacher]])).rows[0].id;
 const assessment=id(173);
 await mutate(mathUser,'select save_assessment($1::jsonb)',[JSON.stringify({id:assessment,term_id:id(61),classroom_id:room,class_subject_id:subject,title:'Matemáticas del periodo',assessment_date:'2026-10-22',max_score:100,weight:1})]);
 await mutate(mathUser,'select save_assessment_scores($1,$2::jsonb)',[assessment,JSON.stringify([{student_id:child,score:42,comment:'Necesita practicar fracciones',revision:0}])]);
 return {mathUser,mathTeacher,father,subject,assessment};
}
const interviewPayload=(f:{subject:string;mathTeacher:string})=>({id:id(180),classroom_id:room,student_id:child,class_subject_id:f.subject,teacher_id:f.mathTeacher,title:'Apoyo en Matemáticas',reason:'Revisar las tareas y coordinar el apoyo.',starts_at:new Date(Date.now()+86400000).toISOString(),ends_at:new Date(Date.now()+88200000).toISOString(),location:'Sala de reuniones'});
it('la tutora consulta todas las notas sin obtener permiso para calificar otra materia',async()=>{
 const f=await tutoringFixture();
 const sheet=(await as(teacher,'select gradebook_workspace($1,$2,$3,null) value',[room,f.subject,id(61)])).rows[0].value;
 expect(sheet.canManage).toBe(false);expect(sheet.roster).toHaveLength(1);expect(Number(sheet.scores[0].score)).toBe(42);
 expect((await as(teacher,'select learning_can_manage($1,$2) value',[room,f.subject])).rows[0].value).toBe(false);
 await expect(mutate(teacher,'select save_assessment_scores($1,$2::jsonb)',[f.assessment,JSON.stringify([{student_id:child,score:100,revision:1}])])).rejects.toThrow();
 await expect(mutate(teacher,'select set_classroom_tutor($1,$2)',[room,teacherId])).rejects.toThrow(/Dirección/);
 const overview=(await as(teacher,'select classroom_tutor_overview($1,$2) value',[room,child])).rows[0].value;
 expect(overview.subjects[0].name).toBe('Matemáticas');expect(overview.feedback[0].comment).toBe('Necesita practicar fracciones');
 await expect(as(f.mathUser,'select classroom_tutor_overview($1,null)',[room])).rejects.toThrow(/tutora/);
 await expect(as(stranger,'select gradebook_workspace($1,$2,$3,null)',[room,f.subject,id(61)])).rejects.toThrow();
});
it('entrevistas avisan solo a familia y docentes participantes, incluso con deuda, sin eventos públicos',async()=>{
 const f=await tutoringFixture(),p=interviewPayload(f);
 await q("insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota pendiente',current_date-3,100,'overdue')",[school,child]);
 await mutate(teacher,'select save_classroom_interview($1::jsonb)',[JSON.stringify(p)]);
 const recipients=(await q("select user_id from notifications where source_id=$1 and kind='interview_1' order by user_id",[p.id])).rows.map(r=>r.user_id);
 expect(recipients.sort()).toEqual([mother,f.father,teacher,f.mathUser].sort());
 expect((await q('select count(*)::int n from calendar_events where id=$1',[p.id])).rows[0].n).toBe(0);
 expect((await as(mother,'select classroom_coordination_workspace($1,null,$2) value',[school,child])).rows[0].value.interviews).toHaveLength(1);
 const notice=(await q("select id from notifications where source_id=$1 and user_id=$2 and kind='interview_1'",[p.id,mother])).rows[0].id;
 expect((await q('select aulanexo_private.push_notice_visible($1) value',[notice])).rows[0].value).toBe(true);
 expect((await as(mother,'select resolve_push_notification($1) value',[notice])).rows[0].value.target).toBe('interviews');
 await expect(as(stranger,'select classroom_coordination_workspace($1,null,null)',[school])).rejects.toThrow();
 await expect(mutate(mother,'select save_classroom_interview($1::jsonb)',[JSON.stringify({...p,id:id(181)})])).rejects.toThrow();
 await expect(mutate(mother,"update classroom_interviews set title='Alterado' where id=$1",[p.id])).rejects.toThrow();
});
it('las confirmaciones son personales y una reprogramación exige confirmar la nueva revisión',async()=>{
 const f=await tutoringFixture(),p=interviewPayload(f);
 await mutate(teacher,'select save_classroom_interview($1::jsonb)',[JSON.stringify(p)]);
 await mutate(teacher,'select save_classroom_interview($1::jsonb)',[JSON.stringify(p)]);
 expect((await q('select revision from classroom_interviews where id=$1',[p.id])).rows[0].revision).toBe(1);
 await mutate(mother,"select respond_classroom_interview($1,1,'confirmed','')",[p.id]);
 expect((await q('select user_id from interview_responses where interview_id=$1',[p.id])).rows.map(r=>r.user_id)).toEqual([mother]);
 await expect(mutate(f.father,"select respond_classroom_interview($1,1,'request_change','')",[p.id])).rejects.toThrow(/motivo/);
 const updated={...p,revision:1,starts_at:new Date(Date.now()+172800000).toISOString(),ends_at:new Date(Date.now()+174600000).toISOString()};
 await mutate(teacher,'select save_classroom_interview($1::jsonb)',[JSON.stringify(updated)]);
 await expect(mutate(mother,"select respond_classroom_interview($1,1,'confirmed','')",[p.id])).rejects.toThrow(/cambió/);
 const inbox=(await as(mother,'select classroom_coordination_workspace($1,null,$2) value',[school,child])).rows[0].value;
 expect(inbox.interviews[0].revision).toBe(2);expect(inbox.interviews[0].responses).toHaveLength(0);
 await expect(mutate(mother,"select close_classroom_interview($1,2,'cancelled')",[p.id])).rejects.toThrow();
 await mutate(teacher,"select close_classroom_interview($1,2,'cancelled')",[p.id]);
 expect((await q('select status from classroom_interviews where id=$1',[p.id])).rows[0].status).toBe('cancelled');
});
it('la coordinación interna no expone los mensajes a las familias ni permite suplantar al emisor',async()=>{
 const f=await tutoringFixture(),msg={id:id(190),classroom_id:room,student_id:child,class_subject_id:f.subject,recipient_teacher_id:f.mathTeacher,body:'Revisemos las tareas pendientes de fracciones.'};
 await mutate(teacher,'select send_classroom_staff_message($1::jsonb)',[JSON.stringify(msg)]);
 await mutate(teacher,'select send_classroom_staff_message($1::jsonb)',[JSON.stringify(msg)]);
 expect((await q('select count(*)::int n from classroom_staff_messages')).rows[0].n).toBe(1);
 expect((await as(mother,'select * from classroom_staff_messages')).rows).toHaveLength(0);
 expect((await as(f.mathUser,'select * from classroom_staff_messages')).rows).toHaveLength(1);
 await expect(mutate(mother,'select send_classroom_staff_message($1::jsonb)',[JSON.stringify({...msg,id:id(191)})])).rejects.toThrow();
 await expect(mutate(teacher,'select send_classroom_staff_message($1::jsonb)',[JSON.stringify({...msg,body:'Alterado'})])).rejects.toThrow(/identificador/);
 const reply={...msg,id:id(192),recipient_teacher_id:teacherId,body:'Coordinemos una entrevista con la familia.'};
 await mutate(f.mathUser,'select send_classroom_staff_message($1::jsonb)',[JSON.stringify(reply)]);
 expect((await as(teacher,'select * from classroom_staff_messages')).rows).toHaveLength(2);
});
it('editar el aula conserva las materias y quitar a un docente revoca su tutoría',async()=>{
 const f=await tutoringFixture(),payload={id:room,school_id:school,name:'Primero A',level:'Primaria'};
 await mutate(director,'select save_classroom($1::jsonb,$2::uuid[])',[JSON.stringify(payload),[teacherId,f.mathTeacher]]);
 expect((await q('select tutor_teacher_id from classrooms where id=$1',[room])).rows[0].tutor_teacher_id).toBe(teacherId);
 expect((await q('select teacher_id from subject_teachers where class_subject_id=$1',[f.subject])).rows.map(r=>r.teacher_id)).toEqual([f.mathTeacher]);
 await mutate(director,'select save_classroom($1::jsonb,$2::uuid[])',[JSON.stringify(payload),[f.mathTeacher]]);
 expect((await q('select tutor_teacher_id from classrooms where id=$1',[room])).rows[0].tutor_teacher_id).toBeNull();
 await expect(as(teacher,'select classroom_tutor_overview($1,null)',[room])).rejects.toThrow();
});
it('la tutora lee cuidados pero no puede editar actividades de Matemáticas ni cuidados de otro docente',async()=>{
 const f=await tutoringFixture(),event=id(195),care=id(196),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await mutate(f.mathUser,"insert into calendar_events(id,school_id,classroom_id,class_subject_id,title,description,event_date,type) values($1,$2,$3,$4,'Evaluación de fracciones','Preparar ejercicios',current_date,'homework')",[event,school,room,f.subject]);
 await expect(mutate(teacher,"update calendar_events set title='Cambio no autorizado' where id=$1",[event])).rejects.toThrow(/docente/);
 await mutate(f.mathUser,"update calendar_events set title='Fracciones del periodo' where id=$1",[event]);
 await mutate(f.mathUser,'select save_care_record($1::jsonb)',[JSON.stringify({id:care,student_id:child,entry_date:day,kind:'mood',occurred_at:'09:00',mood:'tired',note:'Llegó con sueño a la clase.'})]);
 const overview=(await as(teacher,'select classroom_tutor_overview($1,$2) value',[room,child])).rows[0].value;
 expect(overview.care[0].note).toBe('Llegó con sueño a la clase.');
 await expect(mutate(teacher,'select save_care_record($1::jsonb)',[JSON.stringify({id:care,student_id:child,entry_date:day,kind:'mood',occurred_at:'09:00',mood:'happy',note:'Cambiar comentario ajeno.'})])).rejects.toThrow(/autor/);
});
