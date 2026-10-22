// Server-only, resumable provisioning. Never import this file from Vite or Expo.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { databaseClient, reportFailure } from "./database.mjs";
const db = databaseClient(),
  apply = process.argv.includes("--apply");
const marker = "micole-persisted-test-v1",
  slug = "micole-pruebas-persistentes";
const credentialFile = path.join(
  os.homedir(),
  ".config/micole/cuentas-pruebas.json",
);
const definitions = [
  ["director", "direccion", "Dirección de pruebas"],
  ["teacher", "docente", "Docente de pruebas"],
  ["guardian", "familia", "Madre de pruebas"],
  ["student", "estudiante", "Lucía Prueba"],
];
let secret,
  phase = "preflight";
const q = (sql, args = []) => db.query(sql, args);
async function acting(user, sql, args = []) {
  await q("savepoint provision_actor");
  await q("set local role authenticated");
  await q("select set_config('request.jwt.claim.sub',$1,true)", [user]);
  try {
    const result = await q(sql, args);
    await q("reset role");
    await q("select set_config('request.jwt.claim.sub','',true)");
    await q("release savepoint provision_actor");
    return result;
  } catch (error) {
    await q("rollback to savepoint provision_actor");
    await q("release savepoint provision_actor");
    throw error;
  }
}
function save() {
  fs.writeFileSync(credentialFile, JSON.stringify(secret, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.chmodSync(credentialFile, 0o600);
}
try {
  await db.connect();
  const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
  const owner = (
    await q(
      "select u.id from auth.users u join public.platform_admins a on a.user_id=u.id where u.email='ariasvincent292@gmail.com' and u.email_confirmed_at is not null",
    )
  ).rows[0]?.id;
  if (!owner) throw new Error("No se pudo verificar al propietario MiCole.");
  if (
    !(
      await q(
        "select 1 from supabase_migrations.schema_migrations where version='202610220002'",
      )
    ).rowCount
  )
    throw new Error("Aplica primero la migración de cuentas de pruebas.");
  if (!apply) {
    console.log(
      JSON.stringify({
        ok: true,
        dryRun: true,
        accounts: 4,
        emailsSent: false,
        credentialsPrinted: false,
      }),
    );
  } else {
    fs.mkdirSync(path.dirname(credentialFile), {
      recursive: true,
      mode: 0o700,
    });
    if (fs.existsSync(credentialFile))
      secret = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
    else {
      secret = {
        marker,
        project: ref,
        url: "https://www.micole.click/login",
        schoolId: randomUUID(),
        password: `MiColePruebas-${randomBytes(15).toString("base64url")}!`,
        accounts: definitions.map(([role, name, label]) => ({
          role,
          email: `${name}@pruebas.micole.test`,
          label,
        })),
        resources: Object.fromEntries(
          [
            "room",
            "teacher",
            "child",
            "year",
            "plan",
            "event",
            "assignment",
            "announcement",
          ].map((k) => [k, randomUUID()]),
        ),
      };
      save();
    }
    if (
      secret.marker !== marker ||
      secret.project !== ref ||
      secret.accounts.length !== 4
    )
      throw new Error("El archivo privado no corresponde a estas pruebas.");
    const cli = process.env.MICOLE_SUPABASE_CLI;
    if (!cli)
      throw new Error(
        "Indica MICOLE_SUPABASE_CLI para obtener la clave administrativa sin imprimirla.",
      );
    const keyData = JSON.parse(
      execFileSync(
        cli,
        [
          "projects",
          "api-keys",
          "--project-ref",
          ref,
          "--reveal",
          "--output",
          "json",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 30000 },
      ),
    );
    const adminKey = keyData.find((k) => k.name === "service_role")?.api_key;
    if (!adminKey)
      throw new Error("No hay una clave administrativa disponible.");
    const admin = createClient(`https://${ref}.supabase.co`, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    // Check all existing addresses before mutation; never take over an existing user.
    phase = "auth-accounts";
    for (const account of secret.accounts) {
      const existing = (
        await q(
          "select id,raw_app_meta_data from auth.users where lower(email)=$1",
          [account.email],
        )
      ).rows[0];
      if (
        existing &&
        (existing.raw_app_meta_data?.micole_test_marker !== marker ||
          existing.raw_app_meta_data?.micole_test_school !== secret.schoolId)
      )
        throw new Error(
          "Una dirección ya pertenece a una cuenta ajena a este entorno.",
        );
      if (existing) {
        account.id = existing.id;
        continue;
      }
      const { data, error } = await admin.auth.admin.createUser({
        email: account.email,
        password: secret.password,
        email_confirm: true,
        user_metadata: { full_name: account.label },
        app_metadata: {
          micole_test_marker: marker,
          micole_test_school: secret.schoolId,
        },
      });
      if (error || !data.user)
        throw new Error(
          "No se pudo aprovisionar una cuenta ficticia en Auth. Reintenta sin cambiar el archivo privado.",
        );
      account.id = data.user.id;
      save();
    }
    save();
    phase = "school-data";
    await q("begin");
    await q(
      "select pg_advisory_xact_lock(hashtext('micole-persisted-test-provision'))",
    );
    const school = secret.schoolId,
      r = secret.resources,
      users = Object.fromEntries(secret.accounts.map((a) => [a.role, a]));
    const existing = (await q("select id from schools where slug=$1", [slug]))
      .rows[0];
    if (existing && existing.id !== school)
      throw new Error(
        "La institución de pruebas existente no coincide con el archivo privado.",
      );
    await q(
      "insert into schools(id,name,slug,status,city,director_name,show_on_landing) values($1,'MiCole · Institución de pruebas',$2,'active','La Paz','Dirección de pruebas',false) on conflict(id) do nothing",
      [school, slug],
    );
    await q(
      "insert into aulanexo_private.test_institutions(school_id,enabled,updated_by) values($1,true,$2) on conflict(school_id) do nothing",
      [school, owner],
    );
    await q(
      "insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2) on conflict do nothing",
      [school, owner],
    );
    for (const a of secret.accounts)
      await q(
        "insert into aulanexo_private.persisted_test_accounts(user_id,school_id,email,role) values($1,$2,$3,$4) on conflict(user_id) do nothing",
        [a.id, school, a.email, a.role],
      );
    // Cancel the automatically created initial invoice; no fake payment or credit.
    await q(
      "update platform_charges set status='cancelled' where school_id=$1 and kind='credit_topup' and status='pending'",
      [school],
    );
    for (const role of ["director", "teacher"])
      await q(
        "insert into school_memberships(school_id,user_id,role) values($1,$2,$3) on conflict(school_id,user_id,role) do nothing",
        [school, users[role].id, role],
      );
    const academicYear = Number(
      (
        await q(
          "select extract(year from now() at time zone 'America/La_Paz') as year",
        )
      ).rows[0].year,
    );
    await q(
      "insert into academic_years(id,school_id,year,name,starts_on,ends_on) values($1,$2,$3,$4,make_date($3,1,1),make_date($3,12,31)) on conflict(id) do nothing",
      [r.year, school, academicYear, `Gestión ${academicYear} · Pruebas`],
    );
    await q(
      "insert into classrooms(id,school_id,name,level,academic_year,subjects_enabled,monthly_fee) values($1,$2,'Primero A · Pruebas','Primaria',$3,true,300) on conflict(id) do nothing",
      [r.room, school, academicYear],
    );
    await q(
      "insert into teachers(id,school_id,user_id,name,email,status) values($1,$2,$3,'Docente de pruebas',$4,'active') on conflict(id) do nothing",
      [r.teacher, school, users.teacher.id, users.teacher.email],
    );
    await q(
      "insert into teacher_classrooms(school_id,teacher_id,classroom_id) values($1,$2,$3) on conflict do nothing",
      [school, r.teacher, r.room],
    );
    await q(
      "insert into students(id,school_id,classroom_id,first_name,last_name,birth_date,identity_number,status,profile_complete,mother_name,mother_email,father_name,father_email,monthly_fee) values($1,$2,$3,'Lucía','Prueba','2018-05-10','PRUEBA-001','active',true,'Madre de pruebas',$4,'Padre de pruebas','padre@pruebas.micole.test',300) on conflict(id) do nothing",
      [r.child, school, r.room, users.guardian.email],
    );
    await q(
      "insert into enrollment_history(school_id,student_id,classroom_id,year_id,student_name,classroom_name,level,started_on,status,monthly_fee) select $1,$2,$3,$4,'Lucía Prueba','Primero A · Pruebas','Primaria',current_date,'enrolled',300 where not exists(select 1 from enrollment_history where student_id=$2)",
      [school, r.child, r.room, r.year],
    );
    await acting(users.guardian.id, "select workspace_identity()");
    await acting(users.director.id, "select set_student_login($1,$2,true)", [
      r.child,
      users.student.email,
    ]);
    for (const subject of ["Lenguaje", "Matemáticas"])
      await acting(
        users.director.id,
        "select configure_class_subject($1,$2,array[$3]::uuid[],true)",
        [r.room, subject, r.teacher],
      );
    phase = "calendar-and-assignments";
    await q("select set_config('request.jwt.claim.sub',$1,true)", [
      users.teacher.id,
    ]);
    await q(
      "insert into calendar_events(id,school_id,classroom_id,title,description,event_date,type,created_by) values($1,$2,$3,'Actividad de prueba','Evento ficticio para recorrer el calendario.',current_date+3,'event',$4) on conflict(id) do nothing",
      [r.event, school, r.room, users.teacher.id],
    );
    await q(
      "insert into assignments(id,school_id,classroom_id,title,instructions,status,due_at,created_by) values($1,$2,$3,'Mi primera tarea de prueba','Escribe una respuesta de ejemplo para probar la entrega y revisión.','published',now()+interval '7 days',$4) on conflict(id) do nothing",
      [r.assignment, school, r.room, users.teacher.id],
    );
    phase = "announcement";
    await q("select set_config('request.jwt.claim.sub',$1,true)", [
      users.director.id,
    ]);
    await q(
      "insert into announcements(id,school_id,title,content,audience,created_by) values($1,$2,'Bienvenidos a las pruebas','Este es un comunicado ficticio. Puedes probar los módulos de tu rol sin afectar instituciones reales.','all',$3) on conflict(id) do nothing",
      [r.announcement, school, users.director.id],
    );
    await q("select set_config('request.jwt.claim.sub','',true)");
    phase = "staff-and-tuition";
    const schedule = Array.from({ length: 7 }, (_, weekday) => ({
      weekday,
      start: "07:00",
      end: "23:00",
      breakMinutes: 0,
    }));
    if (
      !(
        await q("select 1 from staff_work_profiles where teacher_id=$1", [
          r.teacher,
        ])
      ).rowCount
    )
      await acting(
        users.director.id,
        "select save_staff_profile($1,$2::jsonb)",
        [
          school,
          JSON.stringify({
            teacherId: r.teacher,
            payType: "monthly",
            monthlySalary: 1000,
            active: true,
            schedule,
          }),
        ],
      );
    await q(
      "insert into payment_plans(id,school_id,student_id,start_date,months,monthly_fee,due_day) values($1,$2,$3,(date_trunc('month',now() at time zone 'America/La_Paz')+interval '1 month')::date,2,300,10) on conflict(id) do nothing",
      [r.plan, school, r.child],
    );
    await q(
      "insert into school_charges(school_id,student_id,plan_id,concept,period,due_date,amount,base_amount) select $1,$2,p.id,'Mensualidad de prueba · '||to_char(d,'YYYY-MM'),to_char(d,'YYYY-MM'),d::date+9,300,300 from payment_plans p cross join lateral generate_series(p.start_date,p.start_date+interval '1 month',interval '1 month') d where p.id=$3 and not exists(select 1 from school_charges c where c.student_id=$2 and c.period=to_char(d,'YYYY-MM'))",
      [school, r.child, r.plan],
    );
    await q(
      "insert into audit_events(school_id,actor_id,actor_name,entity,entity_id,action,summary) values($1,$2,'Propietario MiCole','persisted_test_workspaces',$1,'INSERT','{\"name\":\"Cuentas ficticias persistentes\",\"realPayments\":false}')",
      [school, owner],
    );
    await q("commit");
    phase = "verify-password-access";
    const checks = [];
    for (const a of secret.accounts) {
      const client = createClient(
        `https://${ref}.supabase.co`,
        process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      const { error } = await client.auth.signInWithPassword({
        email: a.email,
        password: secret.password,
      });
      if (error) throw new Error("No se pudo validar el acceso de " + a.role);
      const { data: identity, error: identityError } =
        await client.rpc("workspace_identity");
      if (
        identityError ||
        JSON.stringify(identity.roles) !== JSON.stringify([a.role]) ||
        identity.canSupport ||
        identity.testing !== true ||
        identity.memberships.some((m) => m.schoolId !== school)
      )
        throw new Error("El acceso no respeta el rol de " + a.role);
      const { data: outsiders, error: readError } = await client
        .from("schools")
        .select("id")
        .neq("id", school)
        .limit(1);
      if (readError || outsiders.length)
        throw new Error("Falló la comprobación de aislamiento.");
      if (a.role === "student") {
        const { data: portal, error: portalError } =
          await client.rpc("student_portal");
        if (portalError || !portal.accessAllowed)
          throw new Error("El portal infantil no quedó habilitado.");
      }
      await client.auth.signOut({ scope: "local" });
      checks.push(a.role);
    }
    console.log(
      JSON.stringify({
        ok: true,
        schoolId: school,
        accountsVerified: checks,
        credentialFile,
        emailsSent: false,
        realPayments: false,
        credentialsPrinted: false,
        gps: "Dirección debe guardar la ubicación real desde Asistencia del personal → Ubicación y reglas.",
      }),
    );
  }
} catch (e) {
  await q("rollback").catch(() => {});
  console.error(JSON.stringify({ phase }));
  reportFailure(e);
} finally {
  await db.end();
}
