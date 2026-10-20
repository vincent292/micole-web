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

const branch=id(70),second=id(71);
const createSite=(sid=branch)=>acting(director,()=>q('select save_institution_site($1,$2::jsonb) as id',[school,JSON.stringify({id:sid,siteName:'Sede Norte',city:'Cochabamba',address:'Av. Demo',educationLevels:['Guardería','Inicial']})]));
describe('sedes, permisos e integración del asistente',()=>{
 it('crea una sucursal dentro de la institución con crédito y cobro inicial independientes',async()=>{
  await createSite();const row=(await q('select institution_id,site_name,education_levels,platform_enabled from schools where id=$1',[branch])).rows[0];expect(row).toMatchObject({institution_id:school,site_name:'Sede Norte',education_levels:['Guardería','Inicial'],platform_enabled:false});
  expect((await q("select count(*)::int as n from platform_charges where school_id=$1 and kind='credit_topup' and amount=500",[branch])).rows[0].n).toBe(1);
  expect((await q('select initial_paid_at from aulanexo_private.platform_credit_accounts where school_id=$1',[branch])).rows[0].initial_paid_at).toBeNull();
  const directory=(await as(director,()=>q('select institution_sites($1) as value',[school]))).rows[0].value;expect(directory.billing).toBe('per_site');expect(directory.sites).toHaveLength(2);
 });
 it('una responsable de sucursal no ve ni escribe en la sede principal, otras sucursales u otra institución',async()=>{
  await createSite();await createSite(second);
  await acting(director,()=>q('select set_site_director($1,$2,true)',[branch,'ops-stranger@test.bo']));
  const own=(await as(stranger,()=>q('select id from schools'))).rows;expect(own.map(v=>v.id)).toEqual([branch]);
  const directory=(await as(stranger,()=>q('select institution_sites($1) as value',[branch]))).rows[0].value;expect(directory.canManage).toBe(false);expect(directory.sites).toHaveLength(1);
  await expect(as(stranger,()=>q('select save_institution_site($1,$2::jsonb)',[branch,JSON.stringify({siteName:'Ajena',educationLevels:['Primaria']})]))).rejects.toThrow('Dirección de la institución');
  await expect(as(stranger,()=>q('select reserve_document_analysis($1)',[school]))).rejects.toThrow('Solo Dirección');
  await expect(as(stranger,()=>q('select reserve_assistant_request($1)',[second]))).rejects.toThrow('Solo Dirección');
  await expect(as(stranger,()=>q('select set_site_director($1,$2,true)',[second,'ops-stranger@test.bo']))).rejects.toThrow('Dirección de la institución');
 });
 it('sincroniza la Dirección principal y permite revocar el acceso exclusivo de una sucursal',async()=>{
  await createSite();await acting(director,()=>q('select set_site_director($1,$2,true)',[branch,'ops-stranger@test.bo']));
  await acting(director,()=>q('select set_site_director($1,$2,false)',[branch,'ops-stranger@test.bo']));expect((await as(stranger,()=>q('select id from schools'))).rows).toHaveLength(0);
  await q("update school_memberships set active=false where school_id=$1 and user_id=$2 and role='director'",[school,director]);
  expect((await q('select active,institution_inherited from school_memberships where school_id=$1 and user_id=$2',[branch,director])).rows[0]).toMatchObject({active:false,institution_inherited:true});
 });
 it('genera invitación para una responsable sin cuenta y bloquea reasignaciones a otra institución',async()=>{
  await createSite();const result=(await acting(director,()=>q('select set_site_director($1,$2,true) as value',[branch,'nueva-sede@example.invalid']))).rows[0].value;expect(result.token).toMatch(/^[a-f0-9]{64}$/);
  expect((await q('select role,school_id,email from invitations where email=$1',['nueva-sede@example.invalid'])).rows[0]).toMatchObject({role:'director',school_id:branch});
  await expect(acting(director,()=>q('select save_institution_site($1,$2::jsonb)',[school,JSON.stringify({id:otherSchool,siteName:'Otra',educationLevels:['Primaria']})]))).rejects.toThrow('otra institución');
 });
 it('autoriza el asistente solo para Dirección de la sede y aplica un límite',async()=>{
  for(const user of [teacher,mother,kid,owner,stranger])await expect(as(user,()=>q('select reserve_assistant_request($1)',[school]))).rejects.toThrow();
  for(let i=0;i<30;i++)await acting(director,()=>q('select reserve_assistant_request($1)',[school]));
  await expect(as(director,()=>q('select reserve_assistant_request($1)',[school]))).rejects.toThrow('límite');
  expect((await q('select count(*)::int as n from aulanexo_private.assistant_usage')).rows[0].n).toBe(30);
 });
 it('permite cambiar de sede en pruebas del propietario solo dentro de la misma institución',async()=>{
  await acting(owner,()=>q('select set_test_institution($1,true)',[school]));
  await acting(owner,()=>q('select set_test_institution($1,true)',[otherSchool]));
  const session=(await acting(owner,()=>q("select start_test_session($1,'director') as value",[school]))).rows[0].value.id;
  await acting(owner,()=>q('select save_institution_site($1,$2::jsonb)',[school,JSON.stringify({id:branch,siteName:'Sede de prueba',educationLevels:['Primaria']})]),session);
  await acting(owner,()=>q('select switch_test_site($1)',[branch]),session);
  const identity=(await as(owner,()=>q('select workspace_identity() as value'),session)).rows[0].value;
  expect(identity.support.schoolId).toBe(branch);
  await expect(as(owner,()=>q('select switch_test_site($1)',[otherSchool]),session)).rejects.toThrow('no pertenece');
 });
 it('un calendario de una sucursal solo se publica allí',async()=>{
  await createSite();await fundInstitutionFixtures(db);await acting(director,()=>q('select set_site_director($1,$2,true)',[branch,'ops-stranger@test.bo']));
  await acting(stranger,()=>q('select confirm_calendar_import($1,$2,2026,null,$3,$4::jsonb)',[id(80),branch,'a'.repeat(64),JSON.stringify([{title:'Solo sucursal',date:'2026-10-25',endDate:'',description:'Ejemplo',source:'PDF'}])]));
  expect((await q('select school_id from calendar_events where title=$1',['Solo sucursal'])).rows.map(r=>r.school_id)).toEqual([branch]);
  await expect(as(stranger,()=>q('select confirm_calendar_import($1,$2,2026,null,$3,$4::jsonb)',[id(81),school,'b'.repeat(64),JSON.stringify([{title:'Ajeno',date:'2026-10-25',endDate:'',description:'Ejemplo',source:'PDF'}])]))).rejects.toThrow();
 });
});
