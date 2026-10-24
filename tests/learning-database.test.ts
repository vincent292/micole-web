import {enableActivationFixture,fundInstitutionFixtures} from "./funded-institution-fixture";
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
async function acting<T>(user: string, task: () => Promise<T>) {
  const save = `mutation_scope_${++serial}`;
  await db.exec(`savepoint ${save};set local role authenticated;`);
  await q(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",
    [user],
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
  await enableActivationFixture(db);
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
  await db.exec("begin");await fundInstitutionFixtures(db);
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
describe("materias y entregas privadas", () => {
  const configure = (
    name = "Matemáticas",
    ids = [id(50)],
    classroom = room,
    user = director,
  ) =>
    acting(user, () =>
      q("select configure_class_subject($1,$2,$3::uuid[],true) as value", [
        classroom,
        name,
        ids,
      ]),
    );
  const assignment = async (
    subject: string | null = null,
    extra: any = {},
    user = teacher,
  ) => {
    const value = {
      id: id(100),
      classroom_id: room,
      class_subject_id: subject,
      title: "Práctica de lectura",
      instructions: "Resuelve los ejercicios y explica tu respuesta.",
      due_at: new Date(Date.now() + 86400000).toISOString(),
      max_score: 100,
      status: "published",
      allow_late: true,
      ...extra,
    };
    await acting(user, () =>
      q("select save_assignment($1::jsonb)", [JSON.stringify(value)]),
    );
    return value.id;
  };
  const submit = (
    a = id(100),
    body = "Mi respuesta",
    send = true,
    user = kid,
  ) =>
    acting(user, () =>
      q("select save_assignment_submission($1,$2,$3) as value", [
        a,
        body,
        send,
      ]),
    );
  it("precarga materias, normaliza acentos y reutiliza una materia en varias aulas", async () => {
    expect(
      (await q("select count(*)::int as n from subject_catalog")).rows[0].n,
    ).toBeGreaterThan(15);
    expect(
      (await q("select subjects_enabled from classrooms where id=$1", [room]))
        .rows[0].subjects_enabled,
    ).toBe(false);
    const cs = (await configure()).rows[0].value;
    expect((await as(kid,()=>q('select student_portal() as value'))).rows[0].value.classrooms[0].subjectsEnabled).toBe(true);
    expect((await configure(" MATEMATICAS ")).rows[0].value).toBe(cs);
    await configure("Matemáticas", [], otherRoom);
    expect(
      (await q("select count(*)::int as n from school_subjects")).rows[0].n,
    ).toBe(1);
    expect(
      (await q("select subjects_enabled from classrooms where id=$1", [room]))
        .rows[0].subjects_enabled,
    ).toBe(true);
  });
  it("solo Dirección administra materias y no acepta docentes de otra aula", async () => {
    for (const user of [owner, teacher, mother, kid, stranger])
      await expect(configure("Lenguaje", [], room, user)).rejects.toThrow(
        /Solo Dirección/,
      );
    await expect(configure("Lenguaje", [id(50)], otherRoom)).rejects.toThrow(
      /vinculados/,
    );
    await expect(
      acting(teacher, () =>
        q("select set_class_subjects_enabled($1,true)", [room]),
      ),
    ).rejects.toThrow();
  });
  it("limita la publicación a los docentes asignados a la materia", async () => {
    const cs = (await configure()).rows[0].value;
    await assignment(cs);
    const other = (await configure("Inglés", [])).rows[0].value;
    await expect(assignment(other, { id: id(101) })).rejects.toThrow(
      /No puedes/,
    );
    await expect(assignment(null, { id: id(102) })).rejects.toThrow(
      /Selecciona/,
    );
    await assignment(other, { id: id(101) }, director);
    await expect(
      assignment(cs, { id: id(100), classroom_id: otherRoom }, director),
    ).rejects.toThrow();
  });
  it("oculta borradores y las tareas de otras aulas y mantiene a las familias en lectura", async () => {
    await assignment(null, { status: "draft" });
    expect(
      (await as(kid, () => q("select * from assignments"))).rows,
    ).toHaveLength(0);
    expect(
      (await as(mother, () => q("select * from assignments"))).rows,
    ).toHaveLength(0);
    await assignment();
    expect(
      (await as(kid, () => q("select title from assignments"))).rows,
    ).toHaveLength(1);
    await assignment(null, { id: id(101), classroom_id: otherRoom }, director);
    expect(
      (await as(kid, () => q("select title from assignments"))).rows,
    ).toHaveLength(1);
    for (const user of [kid, mother, teacher])
      await expect(
        as(user, () =>
          q(
            "insert into assignments(school_id,classroom_id,title,instructions,created_by) values($1,$2,'Fraude','x',$3)",
            [school, room, user],
          ),
        ),
      ).rejects.toThrow();
  });
  it("solo permite al estudiante habilitado entregar su propia tarea", async () => {
    await assignment();
    for (const user of [mother, father, teacher, owner, stranger])
      await expect(submit(id(100), "Respuesta", true, user)).rejects.toThrow(
        /Solo el estudiante/,
      );
    const sid = (await submit()).rows[0].value;
    await submit(id(100), "Actualización");
    expect(
      (await q("select count(*)::int as n from assignment_submissions")).rows[0]
        .n,
    ).toBe(1);
    expect(
      (await as(mother, () => q("select body from assignment_submissions")))
        .rows[0].body,
    ).toBe("Actualización");
    await assignment(null, { id: id(101), classroom_id: otherRoom }, director);
    await expect(submit(id(101))).rejects.toThrow();
    await expect(
      as(kid, () =>
        q("update assignment_submissions set score=100 where id=$1", [sid]),
      ),
    ).rejects.toThrow();
  });
  it("aplica plazos, estado y bloqueo de acceso en el servidor", async () => {
    await assignment(null, {
      allow_late: false,
      due_at: new Date(Date.now() - 86400000).toISOString(),
    });
    await expect(submit()).rejects.toThrow(/plazo/);
    await assignment(null, {
      allow_late: true,
      due_at: new Date(Date.now() - 86400000).toISOString(),
    });
    await submit();
    await q("update students set profile_complete=false where id=$1", [child]);
    await expect(submit()).rejects.toThrow(/Solo el estudiante/);
    expect(
      (await as(kid, () => q("select * from assignment_submissions"))).rows,
    ).toHaveLength(0);
  });
  it("revisa, devuelve con comentarios y permite corregir sin alterar la nota desde el alumno", async () => {
    await assignment();
    const sub = (await submit()).rows[0].value;
    const review = (
      decision: string,
      feedback: string,
      score: number | null = null,
      user = teacher,
    ) =>
      acting(user, () =>
        q("select review_assignment_submission($1,$2,$3,$4)", [
          sub,
          decision,
          feedback,
          score,
        ]),
      );
    await expect(review("reviewed", "", 101)).rejects.toThrow(/puntuación/);
    await expect(review("returned", "")).rejects.toThrow(/Explica/);
    await expect(review("reviewed", "", 80, mother)).rejects.toThrow(/docente/);
    await review("reviewed", "Buen trabajo", 90);
    await expect(submit()).rejects.toThrow(/revisada/);
    await review("returned", "Explica el segundo ejercicio");
    await submit(id(100), "Respuesta corregida");
    expect(
      (
        await q(
          "select status,score,feedback,revision from assignment_submissions where id=$1",
          [sub],
        )
      ).rows[0],
    ).toMatchObject({
      status: "submitted",
      score: null,
      feedback: "",
      revision: 2,
    });
  });
  it("prepara archivos privados y reserva la confirmación real de R2 al servidor", async () => {
    await assignment();
    const sub = (await submit(id(100), "", false)).rows[0].value;
    const reserve = (mime = "application/pdf", size = 100, user = kid) =>
      acting(user, () =>
        q("select reserve_assignment_file($1,$2,$3,$4) as value", [
          sub,
          "respuesta.pdf",
          mime,
          size,
        ]),
      );
    await expect(reserve("text/html")).rejects.toThrow(/Usa PDF/);
    await expect(reserve("application/pdf", 6000000)).rejects.toThrow();
    await expect(reserve("application/pdf", 100, mother)).rejects.toThrow();
    const file = (await reserve()).rows[0].value;
    await expect(
      as(kid, () =>
        q("select finish_assignment_file($1,100,$2,$3)", [
          file.id,
          "application/pdf",
          `${school}/assignments/ready/${file.id}/${id(999)}.pdf`,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(submit(id(100), "")).rejects.toThrow(/respuesta o adjunta/);
    await q("select finish_assignment_file($1,100,$2,$3)", [
      file.id,
      "application/pdf",
      `${school}/assignments/ready/${file.id}/${id(999)}.pdf`,
    ]);
    const finalKey=(await q('select object_key from assignment_files where id=$1',[file.id])).rows[0].object_key;
    expect(finalKey).not.toBe(file.objectKey);
    expect(finalKey).toContain('/assignments/ready/');
    await expect(as(kid,()=>q('select assignment_file_for_upload($1)',[file.id]))).rejects.toThrow(/autorizada|caducó/);
    await db.exec('savepoint rejected_finalize');
    await expect(q('select finish_assignment_file($1,100,$2,$3)',[file.id,'application/pdf',`${school}/assignments/ready/${file.id}/${id(998)}.pdf`])).rejects.toThrow(/autorización/);
    await db.exec('rollback to savepoint rejected_finalize;release savepoint rejected_finalize');
    await submit(id(100), "");
    expect(
      (await as(mother, () => q("select file_name from assignment_files")))
        .rows[0].file_name,
    ).toBe("respuesta.pdf");
  });
  it("deja de mostrar entregas si el estudiante cambia de aula y revoca cargas pendientes", async () => {
    await assignment();
    const sub = (await submit()).rows[0].value;
    await q("update students set classroom_id=$2 where id=$1", [
      child,
      otherRoom,
    ]);
    for (const user of [kid, mother, teacher])
      expect(
        (
          await as(user, () =>
            q("select * from assignment_submissions where id=$1", [sub]),
          )
        ).rows,
      ).toHaveLength(0);
    await expect(submit()).rejects.toThrow();
  });
  it("genera avisos propios de publicación, entrega y revisión sin exponer respuestas en el push", async () => {
    await assignment();
    const sub = (await submit()).rows[0].value;
    await acting(teacher, () =>
      q("select review_assignment_submission($1,$2,$3,$4)", [
        sub,
        "reviewed",
        "COMENTARIO PRIVADO",
        80,
      ]),
    );
    expect(
      (
        await q(
          "select kind from notifications where user_id=$1 and kind like 'assignment_%' order by kind",
          [kid],
        )
      ).rows.map((r) => r.kind),
    ).toEqual(["assignment_published", "assignment_reviewed_1_reviewed"]);
    expect(
      JSON.stringify(
        (
          await q(
            "select body from notifications where kind like 'assignment_%'",
          )
        ).rows,
      ),
    ).not.toContain("COMENTARIO PRIVADO");
    expect(
      (
        await as(kid, () =>
          q(
            "select kind from notifications where kind like 'assignment_reviewed_%'",
          ),
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe('notas ligadas a materias del aula',()=>{
 it('usa la materia canónica y rechaza docentes de otra materia o vínculos de otra aula',async()=>{
  const configure=async(name:string,teachers:string[],classroom=room)=>(await acting(director,()=>q('select configure_class_subject($1,$2,$3::uuid[],true) as value',[classroom,name,teachers]))).rows[0].value;
  const math=await configure('Matemáticas',[id(50)]),english=await configure('Inglés',[]),other=await configure('Lenguaje',[],otherRoom);
  const grade=(subject:string|null,user=teacher)=>acting(user,()=>q("insert into grades(school_id,student_id,class_subject_id,subject,period,score,recommendation) values($1,$2,$3,'Nombre manipulado','Primer trimestre','90','Sigue así') returning subject",[school,child,subject]));
  expect((await grade(math)).rows[0].subject).toBe('Matemáticas');
  await expect(grade(english)).rejects.toThrow(/docente de esta materia/);
  await expect(grade(null)).rejects.toThrow(/Selecciona una materia/);
  await expect(grade(other,director)).rejects.toThrow(/no pertenece/);
  expect((await grade(english,director)).rows[0].subject).toBe('Inglés');
  await expect(grade(math,mother)).rejects.toThrow();
 });
 it('conserva las valoraciones generales en las aulas sin materias',async()=>{
  const result=await acting(teacher,()=>q("insert into grades(school_id,student_id,subject,period,score,recommendation) values($1,$2,'Desarrollo integral','Gestión actual','Logro destacado','Buen avance') returning subject",[school,child]));expect(result.rows[0].subject).toBe('Desarrollo integral');
 });
});

describe('avisos de la versión vigente de la entrega',()=>{
 it('descarta una revisión antigua al corregir la entrega y una publicación de tarea cerrada',async()=>{
  const task={id:id(100),classroom_id:room,title:'Tarea de versiones',instructions:'Explica tu solución',status:'published',allow_late:true,max_score:100};
  await acting(teacher,()=>q('select save_assignment($1::jsonb)',[JSON.stringify(task)]));
  const sub=(await acting(kid,()=>q("select save_assignment_submission($1,'Primera versión',true) as value",[id(100)]))).rows[0].value;
  await acting(teacher,()=>q("select review_assignment_submission($1,'returned','Corrige el razonamiento',null)",[sub]));
  const old=(await q("select id from notifications where user_id=$1 and kind='assignment_reviewed_1_returned'",[kid])).rows[0];
  expect((await q('select aulanexo_private.push_notice_visible($1) as value',[old.id])).rows[0].value).toBe(true);
  await acting(kid,()=>q("select save_assignment_submission($1,'Versión corregida',true)",[id(100)]));
  expect((await q('select aulanexo_private.push_notice_visible($1) as value',[old.id])).rows[0].value).toBe(false);
  await acting(teacher,()=>q('select save_assignment($1::jsonb)',[JSON.stringify({...task,status:'closed'})]));
  const published=(await q("select id from notifications where user_id=$1 and kind='assignment_published'",[kid])).rows[0];
  expect((await q('select aulanexo_private.push_notice_visible($1) as value',[published.id])).rows[0].value).toBe(false);
 });
});
