import fs from 'node:fs';
import {databaseClient,reportFailure} from './database.mjs';
const names=['202610150002_school_operations.sql','202610150003_collections_invoices.sql','202610150004_realtime_notices.sql'];
const directory=new URL('../supabase/migrations/',import.meta.url);const db=databaseClient();
try {
 await db.connect();await db.query('begin');await db.query("select pg_advisory_xact_lock(hashtext('micole-schema-migrations'))");
 const history=(await db.query('select version from supabase_migrations.schema_migrations')).rows.map(r=>r.version);
 const previous=fs.readdirSync(directory).filter(n=>n.endsWith('.sql')&&n.split('_')[0]<'202610150002').map(n=>n.split('_')[0]);
 if(previous.some(v=>!history.includes(v)))throw new Error('Falta una migración anterior. No se modificó el esquema.');
 const pending=names.filter(n=>!history.includes(n.split('_')[0]));
 if(process.argv.includes('--apply'))for(const file of pending){const source=fs.readFileSync(new URL(file,directory),'utf8');const [version,...parts]=file.replace('.sql','').split('_');await db.query(source);await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3::text[])',[version,parts.join('_'),[source]]);}
 if(process.argv.includes('--apply')){await db.query("notify pgrst,'reload schema'");await db.query('commit');}else await db.query('rollback');
 console.log(JSON.stringify({ok:true,applied:process.argv.includes('--apply'),migrations:pending}));
}catch(e){await db.query('rollback').catch(()=>{});reportFailure(e);}finally{await db.end();}
