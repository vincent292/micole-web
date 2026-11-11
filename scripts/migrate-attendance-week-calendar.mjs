import fs from 'node:fs';
import assert from 'node:assert/strict';
import { databaseClient, reportFailure } from './database.mjs';
const db=databaseClient(),apply=process.argv.includes('--apply');
const version='202611030002',name='attendance_week_calendar';
const rpcs=['school_calendar_workspace(uuid,integer)','save_school_calendar_day(uuid,jsonb)','import_bolivia_holidays(uuid,integer,jsonb)','publish_school_calendar_notice(uuid,integer,text)','student_attendance_workspace(uuid,date,date,uuid)','student_attendance_week(uuid,date,uuid)'];
try {
 await db.connect(); await db.query('begin');
 await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
 const alreadyApplied=(await db.query('select 1 from supabase_migrations.schema_migrations where version=$1',[version])).rowCount>0;
 const before=(await db.query("select oid::text,prosecdef,proconfig,proacl::text from pg_proc where oid='aulanexo_private.attendance_save_checked(uuid,date,jsonb,integer,boolean,text,uuid,text)'::regprocedure")).rows;
 if(!alreadyApplied){const sql=fs.readFileSync(new URL(`../supabase/migrations/${version}_${name}.sql`,import.meta.url),'utf8');await db.query(sql);if(apply)await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,name,[sql]]);}
 const after=(await db.query("select oid::text,prosecdef,proconfig,proacl::text from pg_proc where oid='aulanexo_private.attendance_save_checked(uuid,date,jsonb,integer,boolean,text,uuid,text)'::regprocedure")).rows;
 assert.deepEqual(after,before,'Roll-call security attributes changed');
 for(const rpc of rpcs){const p=(await db.query("select prosecdef,proconfig,has_function_privilege('authenticated',oid,'EXECUTE') member,has_function_privilege('anon',oid,'EXECUTE') anonymous from pg_proc where oid=$1::regprocedure",['public.'+rpc])).rows[0];assert.ok(p.prosecdef&&p.member&&!p.anonymous);assert.ok(p.proconfig.includes('search_path=""'));}
 for(const table of ['school_calendar_days','school_calendar_announcements']){const t=(await db.query("select relrowsecurity,has_table_privilege('authenticated',oid,'SELECT') readable,has_table_privilege('authenticated',oid,'INSERT,UPDATE,DELETE') writable from pg_class where oid=$1::regclass",['public.'+table])).rows[0];assert.ok(t.relrowsecurity&&t.readable&&!t.writable);}
 const definition=(await db.query("select pg_get_functiondef('aulanexo_private.attendance_save_checked(uuid,date,jsonb,integer,boolean,text,uuid,text)'::regprocedure) value")).rows[0].value;
 assert.ok(definition.includes('pg_advisory_xact_lock_shared'));assert.ok(definition.includes('calendar_class_day'));
 const seeded=(await db.query('select count(*)::integer days from public.school_calendar_days')).rows[0].days;
 await db.query(apply?'commit':'rollback');if(apply)await db.query("notify pgrst,'reload schema'");
 console.log(JSON.stringify({ok:true,migration:version,applied:apply,alreadyApplied,calendarRows:seeded,securityChecked:true,realAttendanceOrNoticesCreated:false}));
} catch(e){await db.query('rollback').catch(()=>{});reportFailure(e);} finally {await db.end();}
