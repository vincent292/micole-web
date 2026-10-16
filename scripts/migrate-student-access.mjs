import fs from "node:fs";
import { databaseClient, reportFailure } from "./database.mjs";
const version="202610150001", name="student_access";
const sql=fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),"utf8");
const db=databaseClient();
try {
 await db.connect();
 await db.query("begin");
 await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
 const applied=(await db.query("select version from supabase_migrations.schema_migrations order by version")).rows.map(row=>row.version);
 const expected=fs.readdirSync(new URL("../supabase/migrations/",import.meta.url)).filter(file=>file.endsWith('.sql')&&file.split('_')[0]<version).map(file=>file.split('_')[0]);
 if(expected.some(v=>!applied.includes(v)))throw new Error("Falta una migración previa; no se modificará el esquema.");
 const present=(await db.query("select to_regprocedure('public.student_portal()') is not null as present")).rows[0].present;
 if(applied.includes(version)!==present)throw new Error("Existe una migración parcial; revisa el esquema antes de continuar.");
 if(!process.argv.includes('--apply'))console.log(JSON.stringify({ok:true,version,alreadyApplied:present,action:"Crear acceso opcional de estudiantes, portal académico de solo lectura y soporte del propietario."}));
 else if(present)console.log(JSON.stringify({ok:true,version,alreadyApplied:true}));
 else{
  await db.query(sql);
  await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])",[version,name,[sql]]);
  await db.query("notify pgrst, 'reload schema'");
  console.log(JSON.stringify({ok:true,version,applied:true}));
 }
 await db.query(process.argv.includes('--apply')?"commit":"rollback");
} catch(error) {await db.query("rollback").catch(()=>{});reportFailure(error);}finally{await db.end();}
