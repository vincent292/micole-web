import {
  enableActivationFixture,
  fundInstitutionFixtures,
} from "./funded-institution-fixture";
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
async function acting<T>(
  user: string,
  task: () => Promise<T>,
  support?: string,
) {
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
  await db.exec("begin");
  await fundInstitutionFixtures(db);
  await q("update classrooms set weekdays=array[1,2,3,4,5,6,7]");
  await q(
    "insert into platform_admins(user_id) values($1) on conflict do nothing",
    [owner],
  );
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

const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/La_Paz",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const marks = (status: string | null = "present") => [
  { studentId: child, status, note: "Observación familiar" },
];
const save = (
  values = marks(),
  revision = 0,
  confirm = false,
  reason = "",
  classroom = room,
  date = day,
) =>
  q("select save_student_attendance($1,$2,$3::jsonb,$4,$5,$6) as result", [
    classroom,
    date,
    JSON.stringify(values),
    revision,
    confirm,
    reason,
  ]);
const workspace = (classroom = room, student: string | null = null) =>
  q("select student_attendance_workspace($1,$2,$3,$4) as result", [
    classroom,
    day,
    day.slice(0, 7) + "-01",
    student,
  ]);
const notices = () =>
  q("select * from notifications where kind like 'attendance_%'");

describe("hoja semanal y días sin clases", () => {
  const calendar = (user=director) => as(user,()=>q("select school_calendar_workspace($1,2026) value",[school]));
  const special = (values: Record<string,unknown>={},user=director) => acting(user,()=>q("select save_school_calendar_day($1,$2::jsonb) value",[school,JSON.stringify({date:day,label:'Feriado de prueba',kind:'holiday',active:true,sourceUrl:'',...values})]));
  it("un feriado queda sin faltas ni notificaciones y solo un día de clases explícito permite pasar lista",async()=>{
    const holiday=(await special()).rows[0].value;
    expect((await as(teacher,()=>workspace())).rows[0].result).toMatchObject({canMark:false,schoolDay:{isSchoolDay:false,label:'Feriado de prueba'}});
    await expect(as(teacher,()=>save(marks('absent'),0,true))).rejects.toThrow(/no tiene clases/);
    expect((await notices()).rows).toHaveLength(0);expect((await q("select * from student_attendance_sessions")).rows).toHaveLength(0);
    await special({revision:1,kind:'school_day',label:'Jornada especial'});
    expect((await q("select actor_id,summary from audit_events where entity='school_calendar_days' and action='UPDATE'")).rows[0]).toMatchObject({actor_id:director,summary:{previous:{label:'Feriado de prueba',kind:'holiday'},current:{label:'Jornada especial',kind:'school_day'},revision:2}});
    await acting(teacher,()=>save(marks('present'),0,true));
    expect((await notices()).rows).toHaveLength(0);
    await expect(special({revision:1,label:'Cambio desactualizado'})).rejects.toThrow(/calendario cambió/);
    expect((await calendar()).rows[0].value.days[0].id).toBe(holiday);
  });
  it("importa únicamente Bolivia, no duplica fechas ni reemplaza ajustes manuales y no envía comunicados",async()=>{
    await special();
    const rows=[{date:day,label:'API nacional',countryCode:'BO',sourceUrl:'https://date.nager.at/api/v3/PublicHolidays/2026/BO'}];
    const run=(value=rows)=>acting(director,()=>q("select import_bolivia_holidays($1,2026,$2::jsonb) value",[school,JSON.stringify(value)]));
    expect((await run()).rows[0].value.manualPreserved).toBe(1);
    expect((await run()).rows[0].value.added).toBe(0);
    expect((await calendar()).rows[0].value.days[0].label).toBe('Feriado de prueba');
    await expect(run([{...rows[0],countryCode:'PE'}])).rejects.toThrow(/Bolivia/);
    await expect(run([rows[0],rows[0]])).rejects.toThrow(/duplicadas/);
    expect((await q("select id from announcements")).rows).toHaveLength(0);expect((await notices()).rows).toHaveLength(0);
    for(const user of [teacher,mother,kid,owner]) await expect(special({},user)).rejects.toThrow(/Secretaría/);
    await expect(as(director,()=>q("select school_calendar_workspace($1,2026)",[otherSchool]))).rejects.toThrow(/acceso/);
  });
  it("Secretaría mantiene el calendario y publica solo con delegación, una vez por versión",async()=>{
    await acting(director,()=>q("select save_timetable_delegate($1,'ops-stranger@test.bo',true,false)",[school]));
    const holiday=(await special({},stranger)).rows[0].value;
    const publish=(user=stranger)=>acting(user,()=>q("select publish_school_calendar_notice($1,1,'No habrá clases en la fecha indicada por la institución.') value",[holiday]));
    await expect(publish()).rejects.toThrow(/autorizar/);
    await expect(as(stranger,()=>save(marks('absent'),0,true))).rejects.toThrow(/docentes/);
    await expect(as(stranger,()=>q("select student_attendance_week($1,$2,null)",[room,day]))).rejects.toThrow(/acceso/);
    await acting(director,()=>q("select save_timetable_delegate($1,'ops-stranger@test.bo',true,true)",[school]));
    await q("update platform_charges set status='pending' where student_id=$1",[child]);
    const notice=(await publish()).rows[0].value;
    expect((await publish()).rows[0].value).toBe(notice);
    expect((await q("select id from announcements")).rows).toHaveLength(1);
    expect((await q("select count(*)::int n from notifications where kind='announcement' and source_id=$1",[notice])).rows[0].n).toBeGreaterThan(0);
    expect((await as(mother,()=>q("select may_view_announcement($1) visible,family_access($2) academic",[notice,child]))).rows[0]).toEqual({visible:true,academic:false});
    await expect(publish(teacher)).rejects.toThrow(/autorizar/);
    expect((await notices()).rows).toHaveLength(0);
  });
  it("una semana conserva registros de dos meses y la siguiente queda vacía sin avisos nuevos",async()=>{
    await q("update enrollment_history set started_on='2026-01-01' where student_id=$1",[child]);
    await q("update classrooms set weekdays=array[1,2,3,4,5] where id=$1",[room]);
    await special({date:'2026-11-01',kind:'school_day',label:'Jornada especial de domingo'});
    await acting(teacher,()=>save(marks('absent'),0,true,'',room,'2026-10-30'));
    await acting(teacher,()=>save(marks('present'),0,true,'',room,'2026-11-01'));
    const readWeek=(date:string)=>as(teacher,()=>q("select student_attendance_week($1,$2,null) value",[room,date]));
    const previous=(await readWeek('2026-11-01')).rows[0].value;
    expect(previous.start).toBe('2026-10-26');expect(previous.records.map((r:any)=>[r.date,r.status])).toEqual([['2026-10-30','absent'],['2026-11-01','present']]);
    const count=(await notices()).rows.length;
    const next=(await readWeek('2026-11-03')).rows[0].value;
    expect(next.start).toBe('2026-11-02');expect(next.records).toEqual([]);expect(next.days[6].isSchoolDay).toBe(false);
    expect((await notices()).rows.length).toBe(count);
  });
  it("la hoja devuelve siete fechas reales, nombres completos y solo los registros autorizados",async()=>{
    const result=(await as(teacher,()=>q("select student_attendance_week($1,'2026-04-01',null) value",[room]))).rows[0].value;
    expect(result.start).toBe('2026-03-30');expect(result.days.map((d:any)=>d.date)).toEqual(['2026-03-30','2026-03-31','2026-04-01','2026-04-02','2026-04-03','2026-04-04','2026-04-05']);
    expect(result.records).toHaveLength(0);expect((await notices()).rows).toHaveLength(0);
    const current=(await as(teacher,()=>q("select student_attendance_week($1,$2,null) value",[room,day]))).rows[0].value;
    expect(current.roster[0]).toHaveProperty('first_name');expect(current.roster[0]).toHaveProperty('last_name');
    await expect(as(teacher,()=>q("select student_attendance_week($1,$2,null)",[otherRoom,day]))).rejects.toThrow();
    await expect(as(stranger,()=>q("select student_attendance_week($1,$2,$3)",[room,day,child]))).rejects.toThrow();
  });
});

describe("Asistencia de alumnos: acceso, confirmación, avisos y respaldo", () => {
  it("limita escritura al docente del aula y deja Dirección solo en consulta", async () => {
    expect(
      (await as(teacher, () => workspace())).rows[0].result.canManage,
    ).toBe(true);
    await expect(
      as(teacher, () => save([], 0, false, "", otherRoom)),
    ).rejects.toThrow("docentes asignados");
    await expect(as(mother, () => save())).rejects.toThrow(
      "docentes asignados",
    );
    await expect(as(stranger, () => workspace(room, child))).rejects.toThrow(
      "acceso",
    );
    await expect(
      as(null, () => workspace(), undefined, "anon"),
    ).rejects.toThrow("permission denied");
    await expect(
      as(director, () => q("delete from student_attendance_records")),
    ).rejects.toThrow("permission denied");
    const direction = (await as(director, () => workspace())).rows[0].result;
    expect(direction.canManage).toBe(true);
    expect(direction.canMark).toBe(false);
    expect(direction.canCorrect).toBe(false);
    expect(direction.canReview).toBe(false);
    await expect(as(director, () => save())).rejects.toThrow("consulta");
    await acting(teacher, () => save());
  });
  it("un borrador o un día sin lista no generan faltas ni avisos y no son visibles para la familia", async () => {
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records,
    ).toEqual([]);
    await acting(teacher, () => save(marks(null)));
    expect((await notices()).rows).toHaveLength(0);
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records,
    ).toEqual([]);
    await expect(as(teacher, () => save(marks(null), 1, true))).rejects.toThrow(
      "Marca a cada estudiante",
    );
    expect(
      (await q("select status from student_attendance_sessions")).rows[0]
        .status,
    ).toBe("draft");
  });
  it("al confirmar una falta notifica solo a madre y padre vinculados; guardar de nuevo no duplica avisos", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    const rows = (await notices()).rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((n) => n.user_id).sort()).toEqual([mother, father].sort());
    expect(
      rows.every(
        (n) =>
          n.target === "studentAttendance" && n.alert_type === "attendance",
      ),
    ).toBe(true);
    await expect(
      as(teacher, () => save(marks("absent"), 0, true)),
    ).rejects.toThrow("no puede modificarse");
    await expect(
      as(teacher, () =>
        save(marks("absent"), 1, true, "Confirmación revisada"),
      ),
    ).rejects.toThrow("no puede modificarse");
    expect((await notices()).rows).toHaveLength(2);
    expect(
      (await q("select * from student_attendance_changes")).rows,
    ).toHaveLength(0);
  });
  it("bloquea correcciones posteriores incluso para Dirección y conserva la falta original", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    await expect(
      as(director, () =>
        save(marks("late"), 1, true, "El estudiante llegó más tarde"),
      ),
    ).rejects.toThrow("consulta");
    expect(
      (await q("select status from student_attendance_records")).rows[0].status,
    ).toBe("absent");
    expect(
      (await q("select * from student_attendance_changes")).rows,
    ).toHaveLength(0);
    expect(
      (await notices()).rows.filter((n) => n.kind === "attendance_corrected"),
    ).toHaveLength(0);
  });
  it("la familia ve solo los registros confirmados del hijo incluso con deuda y no obtiene motivos internos", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    await q(
      "insert into school_charges(school_id,student_id,concept,due_date,amount,status) values($1,$2,'Cuota pendiente',$3,400,'overdue')",
      [school, child, day],
    );
    const result = (await as(mother, () => workspace(room, child))).rows[0]
      .result;
    expect(result.canManage).toBe(false);
    expect(result.session).toBeNull();
    expect(result.roster).toEqual([]);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].studentId).toBe(child);
    expect(result.records[0].status).toBe("absent");
    expect(JSON.stringify(result)).not.toContain("previous");
    expect(
      (
        await as(mother, () =>
          q("select * from notifications where kind='attendance_absent'"),
        )
      ).rows,
    ).toHaveLength(1);
    await q(
      "update student_guardians set can_view=false where student_id=$1 and user_id=$2",
      [child, mother],
    );
    await expect(as(mother, () => workspace(room, child))).rejects.toThrow(
      "acceso",
    );
    expect(
      (
        await as(mother, () =>
          q("select * from notifications where kind='attendance_absent'"),
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("rechaza estudiantes de otra aula, listas incompletas, repetidos, estados inválidos y fechas futuras", async () => {
    await expect(
      as(teacher, () =>
        save([{ studentId: otherChild, status: "absent", note: "" }]),
      ),
    ).rejects.toThrow("inválidos");
    await expect(as(teacher, () => save([]))).rejects.toThrow("matrícula");
    await expect(
      as(teacher, () => save([...marks(), ...marks()])),
    ).rejects.toThrow("inválidos");
    await expect(as(teacher, () => save(marks("missing")))).rejects.toThrow(
      "inválidos",
    );
    await expect(
      as(teacher, () => save(marks(), 0, true, "", room, "2099-01-01")),
    ).rejects.toThrow("últimos");
    expect(
      (await q("select * from student_attendance_sessions")).rows,
    ).toHaveLength(0);
  });
  it("conserva historial si el estudiante cambia de aula y no duplica el padrón al cambiar su nombre", async () => {
    await acting(teacher, () => save(marks("present"), 0, true));
    await q(
      "update students set classroom_id=$1,first_name='Nombre cambiado' where id=$2",
      [otherRoom, child],
    );
    const history = (await as(mother, () => workspace(otherRoom, child)))
      .rows[0].result;
    expect(history.records).toHaveLength(1);
    expect(history.records[0].status).toBe("present");
    const own = (await as(teacher, () => workspace())).rows[0].result;
    expect(own.roster).toHaveLength(1);
  });
  it("encola push de asistencia con presentación propia, sin datos privados y respeta la revocación familiar", async () => {
    await acting(mother, () =>
      q("select register_push_device($1,$2,true,array['alerts'])", [
        id(900),
        "fcm-attendance-test-device-1234567890",
      ]),
    );
    await acting(teacher, () => save(marks("absent"), 0, true));
    const delivery = (
      await q(
        "select * from aulanexo_private.push_deliveries where notification_id in (select id from notifications where kind='attendance_absent')",
      )
    ).rows[0];
    expect(delivery).toBeDefined();
    expect(delivery.category).toBe("alerts");
    await q(
      "update aulanexo_private.push_deliveries set status='processing',lease_id=$2,locked_until=now()+interval '3 minutes' where id=$1",
      [delivery.id, id(901)],
    );
    const prepared = (
      await q("select prepare_push_delivery($1,$2) as result", [
        delivery.id,
        id(901),
      ])
    ).rows[0].result;
    expect(prepared.alertType).toBe("attendance");
    expect(prepared.kind).toBe("attendance_absent");
    expect(JSON.stringify(prepared)).not.toContain("Lucía");
    await q(
      "update school_memberships set active=false where user_id=$1 and school_id=$2",
      [mother, school],
    );
    const n = (await notices()).rows.find((n) => n.user_id === mother);
    expect(
      (
        await q("select aulanexo_private.push_notice_visible($1) as visible", [
          n.id,
        ])
      ).rows[0].visible,
    ).toBe(false);
  });
  it("bloquea gestiones cerradas y no permite al superadmin acceder sin contexto de soporte", async () => {
    await q("update academic_years set status='closed' where school_id=$1", [
      school,
    ]);
    await expect(as(teacher, () => save())).rejects.toThrow(
      "gestión está cerrada",
    );
    await expect(as(owner, () => workspace())).rejects.toThrow("acceso");
  });
});

describe("correcciones exclusivas del docente y reintentos", () => {
  it("solo docente corrige con justificativo, conserva original y notifica una vez", async () => {
    await acting(teacher, () => save(marks("absent"), 0, true));
    const record = (
      await q("select id from student_attendance_records where student_id=$1", [
        child,
      ])
    ).rows[0].id;
    const request = () =>
      q("select request_attendance_correction($1,$2,$3,$4,$5)", [
        id(950),
        record,
        "present",
        "Llegó a tiempo",
        "Error al marcar la casilla",
      ]);
    await expect(as(director, request)).rejects.toThrow(/consulta/);
    await expect(as(stranger, request)).rejects.toThrow(/docente/);
    await expect(
      as(teacher, () =>
        q("select request_attendance_correction($1,$2,$3,$4,$5)", [
          id(951),
          record,
          "present",
          "",
          "",
        ]),
      ),
    ).rejects.toThrow(/justificativo/);
    await acting(teacher, request);
    await acting(teacher, request);
    for (const actor of [teacher, director])
      await expect(
        as(actor, () =>
          q("select review_attendance_correction($1,true,$2)", [
            id(950),
            "No se permite esta decisión",
          ]),
        ),
      ).rejects.toThrow(/Dirección no puede cambiar/);
    expect(
      (
        await q("select status from student_attendance_records where id=$1", [
          record,
        ])
      ).rows[0].status,
    ).toBe("absent");
    const family = (await as(mother, () => workspace(room, child))).rows[0]
      .result;
    expect(family.records[0].status).toBe("present");
    expect(family.corrections).toEqual([]);
    expect(
      (
        await q(
          "select count(*)::int n from notifications where kind='attendance_corrected' and source_id=$1 and user_id=$2",
          [id(950), mother],
        )
      ).rows[0].n,
    ).toBe(1);
    const original = (
      await q(
        "select id from notifications where kind='attendance_absent' and student_id=$1 limit 1",
        [child],
      )
    ).rows[0].id;
    expect(
      (
        await q("select aulanexo_private.push_notice_visible($1) visible", [
          original,
        ])
      ).rows[0].visible,
    ).toBe(false);
    expect(
      (await as(director, () => workspace())).rows[0].result.corrections[0]
        .reason,
    ).toBe("Error al marcar la casilla");
    await expect(
      as(director, () =>
        q("update student_attendance_corrections set proposed_status='absent'"),
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("reintentar confirmación no duplica lista ni avisos", async () => {
    const args = [
      room,
      day,
      JSON.stringify(marks("absent")),
      0,
      true,
      "",
      id(952),
    ];
    const send = () =>
      q(
        "select save_student_attendance($1,$2,$3::jsonb,$4,$5,$6,$7) result",
        args,
      );
    const first = (await acting(teacher, send)).rows[0].result;
    expect((await acting(teacher, send)).rows[0].result).toEqual(first);
    expect(
      (await q("select count(*)::int n from student_attendance_sessions"))
        .rows[0].n,
    ).toBe(1);
    expect((await notices()).rows).toHaveLength(2);
  });
});

it('rechaza correcciones de una pestaña desactualizada y conserva dos justificaciones encadenadas',async()=>{
 await acting(teacher,()=>save(marks('absent'),0,true));
 const record=(await q('select id from student_attendance_records where student_id=$1',[child])).rows[0].id;
 const correct=(requestId:string,status:string,base:string|null)=>q('select request_attendance_correction($1,$2,$3,$4,$5,$6)',[requestId,record,status,'','Justificativo verificado por el docente',base]);
 await acting(teacher,()=>correct(id(960),'present',null));
 await expect(as(teacher,()=>correct(id(961),'late',null))).rejects.toThrow(/asistencia cambió/);
 await acting(teacher,()=>correct(id(961),'late',id(960)));
 await acting(teacher,()=>correct(id(961),'late',id(960)));
 await expect(as(teacher,()=>correct(id(962),'excused',id(960)))).rejects.toThrow(/asistencia cambió/);
 expect((await q('select count(*)::int n from student_attendance_corrections where record_id=$1',[record])).rows[0].n).toBe(2);
 expect((await as(mother,()=>workspace(room,child))).rows[0].result.records[0].status).toBe('late');
 expect((await q('select status from student_attendance_records where id=$1',[record])).rows[0].status).toBe('absent');
});

describe("permisos familiares antes de confirmar asistencia", () => {
  const request = async (n = 970) =>
    acting(mother, () =>
      q(
        "insert into family_requests(id,school_id,student_id,type,request_date,reason) values($1,$2,$3,'absence',$4,'Cita médica ficticia de QA')",
        [id(n), school, child, day],
      ),
    );
  const confirm = (revision: string, status = "excused", n = 980) =>
    q("select save_student_attendance($1,$2,$3::jsonb,$4,$5,$6,$7,$8)", [
      room,
      day,
      JSON.stringify(marks(status)),
      0,
      true,
      "",
      id(n),
      revision,
    ]);
  it("muestra permiso al docente y Dirección, excluye familia ajena y bloquea pendientes, versiones antiguas y faltas con permiso aceptado", async () => {
    await request();
    let w = (await as(teacher, () => workspace())).rows[0].result;
    expect(w.permissions).toHaveLength(1);
    expect(w.permissions[0].reason).toBe("Cita médica ficticia de QA");
    expect(
      (await as(director, () => workspace())).rows[0].result.permissions,
    ).toHaveLength(1);
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result
        .permissions,
    ).toEqual([]);
    await expect(
      as(teacher, () => confirm(w.permissionRevision)),
    ).rejects.toThrow(/pendientes/);
    await expect(
      as(teacher, () => save(marks("absent"), 0, true)),
    ).rejects.toThrow(/permisos de la familia/);
    for (const actor of [director, mother, stranger])
      await expect(
        as(actor, () =>
          q("select review_attendance_permission($1,true,$2)", [
            id(970),
            "Permiso recibido y aceptado",
          ]),
        ),
      ).rejects.toThrow(/docente asignado/);
    await expect(
      as(teacher, () =>
        q("select review_attendance_permission($1,true,$2)", [id(970), ""]),
      ),
    ).rejects.toThrow(/respuesta/);
    await acting(teacher, () =>
      q("select review_attendance_permission($1,true,$2)", [
        id(970),
        "Permiso recibido y aceptado",
      ]),
    );
    await expect(
      as(teacher, () => confirm(w.permissionRevision)),
    ).rejects.toThrow(/cambiaron/);
    w = (await as(teacher, () => workspace())).rows[0].result;
    await expect(
      as(teacher, () => confirm(w.permissionRevision, "absent")),
    ).rejects.toThrow(/permiso aceptado/);
    await acting(teacher, () => confirm(w.permissionRevision));
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records[0]
        .status,
    ).toBe("excused");
    expect(
      (
        await q(
          "select count(*)::int n from notifications where kind='attendance_absent'",
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it("permiso rechazado permite marcar falta y una solicitud nueva invalida una revisión anterior", async () => {
    let w = (await as(teacher, () => workspace())).rows[0].result;
    await request(971);
    await expect(
      as(teacher, () => confirm(w.permissionRevision, "absent", 981)),
    ).rejects.toThrow(/cambiaron/);
    await acting(teacher, () =>
      q("select review_attendance_permission($1,false,$2)", [
        id(971),
        "No corresponde permiso para esta fecha",
      ]),
    );
    w = (await as(teacher, () => workspace())).rows[0].result;
    await acting(teacher, () => confirm(w.permissionRevision, "absent", 981));
    expect(
      (await as(mother, () => workspace(room, child))).rows[0].result.records[0]
        .status,
    ).toBe("absent");
    expect(
      (await notices()).rows.filter((n: any) => n.kind === "attendance_absent"),
    ).toHaveLength(2);
  });
});

describe("privacidad del directorio docente", () => {
  it("oculta campos privados en servidor y conserva cuidados operativos en su aula", async () => {
    await q(
      "update students set identity_number='CI-PRIVADO',insurance_number='SEGURO-PRIVADO',allergies='Alergia importante',admission_details='{\"extra\":\"dato privado\"}' where id=$1",
      [child],
    );
    const rows = (
      await as(teacher, () => q("select student_directory() result"))
    ).rows[0].result;
    const pupil = rows.find((s: any) => s.id === child);
    expect(pupil.allergies).toBe("Alergia importante");
    expect(pupil).not.toHaveProperty("identity_number");
    expect(pupil).not.toHaveProperty("insurance_number");
    expect(pupil).not.toHaveProperty("mother_email");
    expect(pupil).not.toHaveProperty("admission_details");
    expect(rows.some((s: any) => s.id === otherChild)).toBe(false);
    await expect(
      as(teacher, () => q("select identity_number from students")),
    ).rejects.toThrow(/permission denied/);
    expect(
      (
        await as(director, () => q("select student_directory() result"))
      ).rows[0].result.find((s: any) => s.id === child).identity_number,
    ).toBe("CI-PRIVADO");
    expect(
      (
        await as(mother, () => q("select student_directory() result"))
      ).rows[0].result.find((s: any) => s.id === child).insurance_number,
    ).toBe("SEGURO-PRIVADO");
    expect(
      (await as(owner, () => q("select student_directory() result"))).rows[0]
        .result,
    ).toEqual([]);
  });
});
