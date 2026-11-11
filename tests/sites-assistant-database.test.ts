import { fundInstitutionFixtures } from "./funded-institution-fixture";
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
  await db.exec(
    `create schema vault;create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text,name text);create view vault.decrypted_secrets as select id,secret as decrypted_secret,name from vault.secrets;create function vault.create_secret(p_secret text,p_name text,p_desc text) returns uuid language plpgsql security definer as $$declare result uuid;begin insert into vault.secrets(secret,name) values(p_secret,p_name) returning id into result;return result;end $$;`,
  );
  await db.exec(`create schema if not exists extensions;
create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$select decode(repeat('ab',n),'hex')$$;
create function extensions.pgp_sym_encrypt(value text,key text,options text) returns bytea language sql as $$select convert_to(reverse(value),'UTF8')$$;
create function extensions.pgp_sym_decrypt(value bytea,key text) returns text language sql as $$select reverse(convert_from(value,'UTF8'))$$;
create function extensions.hmac(value bytea,key bytea,algorithm text) returns bytea language sql as $$select sha256(value||key)$$;`);
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

const branch = id(70),
  second = id(71);
const createSite = (sid = branch) =>
  acting(director, () =>
    q("select save_institution_site($1,$2::jsonb) as id", [
      school,
      JSON.stringify({
        id: sid,
        siteName: "Sede Norte",
        city: "Cochabamba",
        address: "Av. Demo",
        educationLevels: ["Guardería", "Inicial"],
      }),
    ]),
  );
describe("sedes, permisos e integración del asistente", () => {
  it("crea una sucursal dentro de la institución con crédito y cobro inicial independientes", async () => {
    await createSite();
    const row = (
      await q(
        "select institution_id,site_name,education_levels,platform_enabled from schools where id=$1",
        [branch],
      )
    ).rows[0];
    expect(row).toMatchObject({
      institution_id: school,
      site_name: "Sede Norte",
      education_levels: ["Guardería", "Inicial"],
      platform_enabled: false,
    });
    expect(
      (
        await q(
          "select count(*)::int as n from platform_charges where school_id=$1 and kind='credit_topup' and amount=500",
          [branch],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (
        await q(
          "select initial_paid_at from aulanexo_private.platform_credit_accounts where school_id=$1",
          [branch],
        )
      ).rows[0].initial_paid_at,
    ).toBeNull();
    const directory = (
      await as(director, () =>
        q("select institution_sites($1) as value", [school]),
      )
    ).rows[0].value;
    expect(directory.billing).toBe("per_site");
    expect(directory.sites).toHaveLength(2);
  });
  it("una responsable de sucursal no ve ni escribe en la sede principal, otras sucursales u otra institución", async () => {
    await createSite();
    await createSite(second);
    await acting(director, () =>
      q("select set_site_director($1,$2,true)", [
        branch,
        "ops-stranger@test.bo",
      ]),
    );
    const own = (await as(stranger, () => q("select id from schools"))).rows;
    expect(own.map((v) => v.id)).toEqual([branch]);
    const directory = (
      await as(stranger, () =>
        q("select institution_sites($1) as value", [branch]),
      )
    ).rows[0].value;
    expect(directory.canManage).toBe(false);
    expect(directory.sites).toHaveLength(1);
    await expect(
      as(stranger, () =>
        q("select save_institution_site($1,$2::jsonb)", [
          branch,
          JSON.stringify({ siteName: "Ajena", educationLevels: ["Primaria"] }),
        ]),
      ),
    ).rejects.toThrow("Dirección de la institución");
    await expect(
      as(stranger, () => q("select reserve_document_analysis($1)", [school])),
    ).rejects.toThrow("Solo Dirección");
    await expect(
      as(stranger, () => q("select reserve_assistant_request($1)", [second])),
    ).rejects.toThrow("Solo Dirección");
    await expect(
      as(stranger, () =>
        q("select set_site_director($1,$2,true)", [
          second,
          "ops-stranger@test.bo",
        ]),
      ),
    ).rejects.toThrow("Dirección de la institución");
  });
  it("sincroniza la Dirección principal y permite revocar el acceso exclusivo de una sucursal", async () => {
    await createSite();
    await acting(director, () =>
      q("select set_site_director($1,$2,true)", [
        branch,
        "ops-stranger@test.bo",
      ]),
    );
    await acting(director, () =>
      q("select set_site_director($1,$2,false)", [
        branch,
        "ops-stranger@test.bo",
      ]),
    );
    expect(
      (await as(stranger, () => q("select id from schools"))).rows,
    ).toHaveLength(0);
    await q(
      "update school_memberships set active=false where school_id=$1 and user_id=$2 and role='director'",
      [school, director],
    );
    expect(
      (
        await q(
          "select active,institution_inherited from school_memberships where school_id=$1 and user_id=$2",
          [branch, director],
        )
      ).rows[0],
    ).toMatchObject({ active: false, institution_inherited: true });
  });
  it("genera invitación para una responsable sin cuenta y bloquea reasignaciones a otra institución", async () => {
    await createSite();
    const result = (
      await acting(director, () =>
        q("select set_site_director($1,$2,true) as value", [
          branch,
          "nueva-sede@example.invalid",
        ]),
      )
    ).rows[0].value;
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    expect(
      (
        await q("select role,school_id,email from invitations where email=$1", [
          "nueva-sede@example.invalid",
        ])
      ).rows[0],
    ).toMatchObject({ role: "director", school_id: branch });
    await expect(
      acting(director, () =>
        q("select save_institution_site($1,$2::jsonb)", [
          school,
          JSON.stringify({
            id: otherSchool,
            siteName: "Otra",
            educationLevels: ["Primaria"],
          }),
        ]),
      ),
    ).rejects.toThrow("otra institución");
  });
  it("autoriza el asistente solo para Dirección de la sede y aplica un límite", async () => {
    for (const user of [teacher, mother, kid, owner, stranger])
      await expect(
        as(user, () => q("select reserve_assistant_request($1)", [school])),
      ).rejects.toThrow();
    for (let i = 0; i < 30; i++)
      await acting(director, () =>
        q("select reserve_assistant_request($1)", [school]),
      );
    await expect(
      as(director, () => q("select reserve_assistant_request($1)", [school])),
    ).rejects.toThrow("límite");
    expect(
      (
        await q(
          "select count(*)::int as n from aulanexo_private.assistant_usage",
        )
      ).rows[0].n,
    ).toBe(30);
  });
  it("permite cambiar de sede en pruebas del propietario solo dentro de la misma institución", async () => {
    await acting(owner, () =>
      q("select set_test_institution($1,true)", [school]),
    );
    await acting(owner, () =>
      q("select set_test_institution($1,true)", [otherSchool]),
    );
    const session = (
      await acting(owner, () =>
        q("select start_test_session($1,'director') as value", [school]),
      )
    ).rows[0].value.id;
    await acting(
      owner,
      () =>
        q("select save_institution_site($1,$2::jsonb)", [
          school,
          JSON.stringify({
            id: branch,
            siteName: "Sede de prueba",
            educationLevels: ["Primaria"],
          }),
        ]),
      session,
    );
    await acting(
      owner,
      () => q("select switch_test_site($1)", [branch]),
      session,
    );
    const identity = (
      await as(owner, () => q("select workspace_identity() as value"), session)
    ).rows[0].value;
    expect(identity.support.schoolId).toBe(branch);
    await expect(
      as(owner, () => q("select switch_test_site($1)", [otherSchool]), session),
    ).rejects.toThrow("no pertenece");
  });
  it("un calendario de una sucursal solo se publica allí", async () => {
    await createSite();
    await fundInstitutionFixtures(db);
    await acting(director, () =>
      q("select set_site_director($1,$2,true)", [
        branch,
        "ops-stranger@test.bo",
      ]),
    );
    await acting(stranger, () =>
      q("select confirm_calendar_import($1,$2,2026,null,$3,$4::jsonb)", [
        id(80),
        branch,
        "a".repeat(64),
        JSON.stringify([
          {
            title: "Solo sucursal",
            date: "2026-10-25",
            endDate: "",
            description: "Ejemplo",
            source: "PDF",
          },
        ]),
      ]),
    );
    expect(
      (
        await q("select school_id from calendar_events where title=$1", [
          "Solo sucursal",
        ])
      ).rows.map((r) => r.school_id),
    ).toEqual([branch]);
    await expect(
      as(stranger, () =>
        q("select confirm_calendar_import($1,$2,2026,null,$3,$4::jsonb)", [
          id(81),
          school,
          "b".repeat(64),
          JSON.stringify([
            {
              title: "Ajeno",
              date: "2026-10-25",
              endDate: "",
              description: "Ejemplo",
              source: "PDF",
            },
          ]),
        ]),
      ),
    ).rejects.toThrow();
  });
});

describe("Mica: todos los paneles, pausa y acciones confirmadas",()=>{
 it("autoriza cada rol vinculado y plataforma, sin permitir suplantar roles ni sedes",async()=>{
  for(const [user,role] of [[director,"director"],[teacher,"teacher"],[mother,"guardian"],[kid,"student"]]){
   const state=(await as(user,()=>q("select micole_assistant_state($1,$2,true) as value",[school,role]))).rows[0].value;
   expect(state.pausedUntil).toBeNull();expect(state.canPublish).toBe(role==="director");
  }
  expect((await as(owner,()=>q("select micole_assistant_state(null,'superadmin') as value"))).rows[0].value.pausedUntil).toBeNull();
  for(const [user,sid,role] of [[teacher,school,"director"],[stranger,school,"guardian"],[director,otherSchool,"director"],[owner,school,"superadmin"]])await expect(as(user,()=>q("select micole_assistant_state($1,$2)",[sid,role]))).rejects.toThrow();
 });
 it("mantiene la pausa por usuario aunque cambie de sede, rol o conversación, sin extenderla al consultar",async()=>{
  await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($3,$2,'teacher')",[otherSchool,director,school]);
  await expect(as(director,()=>q("select pause_micole_assistant($1)",[director]))).rejects.toThrow();
  const until=(await q("select pause_micole_assistant($1) as value",[director])).rows[0].value;
  for(const [sid,role] of [[school,"director"],[otherSchool,"director"],[school,"teacher"]])expect(new Date((await acting(director,()=>q("select micole_assistant_state($1,$2,true) as value",[sid,role]))).rows[0].value.pausedUntil).getTime()).toBe(new Date(until).getTime());
  expect((await q("select count(*)::int as n from aulanexo_private.assistant_usage")).rows[0].n).toBe(0);
  await expect(acting(director,()=>q("select prepare_assistant_announcement($1,'Título','Contenido de prueba','staff')",[school]))).rejects.toThrow("pausa");
  await q("update aulanexo_private.assistant_pauses set paused_until=now()-interval '1 second'");
  expect((await acting(director,()=>q("select micole_assistant_state($1,'director',true) as value",[school]))).rows[0].value.pausedUntil).toBeNull();
 });
 it("prepara sin publicar y ejecuta solo después del sí, con idempotencia y auditoría",async()=>{
  const before=(await q("select count(*)::int as n from announcements")).rows[0].n;
  const prepare=(await acting(director,()=>q("select prepare_assistant_announcement($1,'Reunión de prueba','Revisaremos el funcionamiento de MiCole.','staff') as value",[school]))).rows[0].value;
  expect(prepare.schoolId).toBe(school);expect(prepare.payload.audience).toBe("staff");
  expect((await q("select count(*)::int as n from announcements")).rows[0].n).toBe(before);
  await expect(as(teacher,()=>q("select confirm_assistant_proposal($1,true)",[prepare.id]))).rejects.toThrow("sesión");
  await expect(as(director,()=>q("update aulanexo_private.assistant_proposals set payload='{}' where id=$1",[prepare.id]))).rejects.toThrow();
  for(let i=0;i<2;i++)expect((await acting(director,()=>q("select confirm_assistant_proposal($1,true) as value",[prepare.id]))).rows[0].value).toEqual({status:"executed",id:prepare.id});
  expect((await q("select count(*)::int as n from announcements")).rows[0].n).toBe(before+1);
  expect((await q("select count(*)::int as n from audit_events where entity='assistant_proposals' and entity_id=$1",[prepare.id])).rows[0].n).toBe(1);
 });
 it("rechaza propuestas sin destinatarios, con datos incompletos y de roles no autorizados",async()=>{
  for(const audience of [null,"","external"])await expect(as(director,()=>q("select prepare_assistant_announcement($1,'Prueba','Contenido',$2)",[school,audience]))).rejects.toThrow("destinatarios");
  await expect(as(director,()=>q("select prepare_assistant_announcement($1,'Reunión','Será el [fecha].','staff')",[school]))).rejects.toThrow("corchetes");
  await expect(as(teacher,()=>q("select prepare_assistant_announcement($1,'Prueba','Contenido','all')",[school]))).rejects.toThrow();
 });
 it.each(["cancelled","expired","revoked","paused"])("vuelve a comprobar la propuesta y el acceso antes de ejecutar: %s",async mode=>{
  const proposal=(await acting(director,()=>q("select prepare_assistant_announcement($1,'Prueba','Contenido de ejemplo','staff') as value",[school]))).rows[0].value;
  if(mode==="cancelled")await acting(director,()=>q("select confirm_assistant_proposal($1,false)",[proposal.id]));
  if(mode==="expired")await q("update aulanexo_private.assistant_proposals set expires_at=now()-interval '1 second' where id=$1",[proposal.id]);
  if(mode==="revoked")await q("update school_memberships set active=false where school_id=$1 and user_id=$2",[school,director]);
  if(mode==="paused")await q("select pause_micole_assistant($1)",[director]);
  await expect(as(director,()=>q("select confirm_assistant_proposal($1,true)",[proposal.id]))).rejects.toThrow();
  expect((await q("select count(*)::int as n from announcements where id=$1",[proposal.id])).rows[0].n).toBe(0);
 });
});

describe('identidad institucional piloto y carnets únicos',()=>{
 const config={version:1,template:'bosque',primary:'#23614f',accent:'#A76D31',welcome:'Bienvenida de prueba',tagline:'Nuestra comunidad'};
 async function sandbox(){await q('insert into aulanexo_private.test_institutions(school_id,updated_by) values($1,$2)',[school,owner]);await q('insert into aulanexo_private.persisted_test_workspaces(school_id,created_by) values($1,$2)',[school,owner]);}
 it('rechaza personalizar instituciones reales incluso con Dirección y permite solo la sede de pruebas',async()=>{
  await expect(as(director,()=>q('select save_school_appearance($1,$2)',[school,JSON.stringify(config)]))).rejects.toThrow('pruebas');
  await sandbox();
  for(const who of [teacher,mother,kid,stranger])await expect(as(who,()=>q('select save_school_appearance($1,$2)',[school,JSON.stringify(config)]))).rejects.toThrow();
  const result=(await acting(director,()=>q('select save_school_appearance($1,$2) as value',[school,JSON.stringify(config)]))).rows[0].value;expect(result.primary).toBe('#23614F');
  await expect(as(director,()=>q("update schools set appearance=$2 where id=$1",[otherSchool,JSON.stringify(config)]))).rejects.toThrow();
  expect((await q('select appearance from schools where id=$1',[otherSchool])).rows[0].appearance).toBeNull();
 });
 it('valida plantillas, longitudes y colores, y no permite CSS ni propiedades arbitrarias',async()=>{
  await sandbox();for(const bad of [{...config,primary:'url(https://evil.test)'},{...config,template:'custom'},{...config,welcome:'x'.repeat(141)}])await expect(as(director,()=>q('select save_school_appearance($1,$2)',[school,JSON.stringify(bad)]))).rejects.toThrow('Revisa');
  const result=(await acting(director,()=>q('select save_school_appearance($1,$2) as value',[school,JSON.stringify({...config,script:'alert(1)',css:'body{}'})]))).rows[0].value;expect(result).not.toHaveProperty('css');expect(result).not.toHaveProperty('script');
 });
 it('emite un solo carnet por estudiante y gestión, conserva el historial y revoca el anterior al reemitir',async()=>{
  await sandbox();const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/La_Paz',year:'numeric'}).format(new Date()));
  const issue=async(replace:string|null=null)=>(await acting(director,()=>q('select issue_school_credential($1,$2,$3,$4) as value',[school,child,year,replace]))).rows[0].value;
  const first=await issue();expect(first.code).toMatch(/^MC-[A-F0-9]{32}$/);expect((await issue()).id).toBe(first.id);
  const next=await issue(first.id);expect(next.code).not.toBe(first.code);expect(next.status).toBe('active');
  const old=(await as(director,()=>q('select verify_school_credential($1,$2) as value',[school,first.code]))).rows[0].value;expect(old.status).toBe('revoked');
  await expect(as(director,()=>q('select issue_school_credential($1,$2,$3,$4)',[school,child,year,first.id]))).rejects.toThrow('cambió');
  expect((await q('select count(*)::int as n from aulanexo_private.school_credentials where student_id=$1',[child])).rows[0].n).toBe(2);
 });
 it('no permite emitir carnets para otro colegio ni leer sus datos desde una cuenta ajena o anónima',async()=>{
  await sandbox();const year=new Date().getUTCFullYear();const card=(await acting(director,()=>q('select issue_school_credential($1,$2,$3) as value',[school,child,year]))).rows[0].value;
  for(const who of [teacher,mother,kid,stranger])await expect(as(who,()=>q('select issue_school_credential($1,$2,$3)',[school,child,year]))).rejects.toThrow();
  await expect(as(director,()=>q('select issue_school_credential($1,$2,$3)',[otherSchool,child,year]))).rejects.toThrow();
  await expect(as(stranger,()=>q('select verify_school_credential($1,$2)',[school,card.code]))).rejects.toThrow();
  await expect(as(null,()=>q('select verify_school_credential($1,$2)',[school,card.code]),undefined,'anon')).rejects.toThrow();
  await expect(as(mother,()=>q('select * from aulanexo_private.school_credentials'))).rejects.toThrow();
 });
});
