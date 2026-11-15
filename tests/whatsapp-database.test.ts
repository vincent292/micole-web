import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
const db = new PGlite(), id = (n: number) => `aa000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [director, secretary, teacher, guardian, outsider, school, branch, other] = [1,2,3,4,5,20,21,22].map(id);
const q = (sql: string, args: any[] = []) => db.query<any>(sql, args);
async function as(user: string | null, role: string, name: string, args: any[]) {
 await db.exec('savepoint actor'); await q("select set_config('request.jwt.claim.sub',$1,true)",[user || '']); await db.exec(`set local role ${role}`);
 try { const result = await q(`select ${name}(${args.map((_, i) => '$'+(i+1)).join(',')}) value`, args); await db.exec('reset role;release savepoint actor'); return result.rows[0].value; }
 catch(error) { await db.exec('rollback to savepoint actor;release savepoint actor'); throw error; }
}
const manage = async(action: string, data: object = {}, user = director, sid = school) => {
 if(action==='settings'&&!('revision' in data))data={...data,revision:(await q('select revision from aulanexo_private.whatsapp_settings where school_id=$1',[sid])).rows[0]?.revision||0};
 return as(user,'authenticated','whatsapp_manage',[sid,action,JSON.stringify(data)]);
};
const service = (action: string, data: object = {}) => as(null,'service_role','whatsapp_service',[action,JSON.stringify(data)]);
const event = (providerId = 'wamid.1', extra: object = {}) => ({phoneNumberId:'10001',wabaId:'20001',providerId,contactKey:'59170000000',contactName:'Consulta de prueba',body:'Hola',timestamp:new Date().toISOString(),echo:false,...extra});
const settings = {mode:'automatic',hours:'Lunes a viernes, 08:00 a 12:00',admissions:'Solicita una visita',greeting:'Hola de {institucion}',fallback:'Te atenderá nuestro equipo',quick_replies:[]};
beforeAll(async () => {
 await db.exec("create role authenticated;create role anon;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;");
 const root = new URL('../supabase/migrations/', import.meta.url);
 for (const file of readdirSync(root).filter(f=>f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(file,root),'utf8').replace('create extension if not exists pgcrypto;',''));
 for (const [user,email] of [[director,'dir@wa.test'],[secretary,'sec@wa.test'],[teacher,'teacher@wa.test'],[guardian,'family@wa.test'],[outsider,'other@wa.test']]) await q('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,email]);
 await q("insert into schools(id,name,slug,status) values($1,'Piccolini test','wa-test','active'),($2,'Sucursal de prueba','wa-branch','active'),($3,'Pinitos montessori','same-name-not-entitled','active')",[school,branch,other]);
 await q('update schools set institution_id=$1 where id=$2',[school,branch]);
 await q('insert into aulanexo_private.whatsapp_pilot_schools(school_id) values($1),($2)',[school,branch]);
 await q("insert into school_memberships(school_id,user_id,role) values($1,$2,'director'),($1,$3,'teacher'),($1,$4,'guardian'),($5,$6,'director')",[school,director,teacher,guardian,other,outsider]);
 await q("insert into timetable_delegates(school_id,email,active,can_administer,can_collect,updated_by) values($1,'sec@wa.test',true,true,false,$2)",[school,director]);
},30000);
beforeEach(async()=>{ await db.exec('begin'); await as(director,'authenticated','whatsapp_workspace',[school,null]); await service('save_connection',{schoolId:school,userId:director,phoneNumberId:'10001',wabaId:'20001',displayPhone:'59170000000',ciphertext:'encrypted'}); await service('connection_status',{schoolId:school,ciphertext:'encrypted',status:'connected'}); });
afterEach(()=>db.exec('rollback'));afterAll(()=>db.close());
it('limita el piloto por ID y no por nombres; habilita únicamente las sedes autorizadas',async()=>{
 expect((await as(director,'authenticated','whatsapp_access',[school])).enabled).toBe(true);
 expect((await as(outsider,'authenticated','whatsapp_access',[other])).enabled).toBe(false);
 expect((await as(teacher,'authenticated','whatsapp_access',[school])).enabled).toBe(false);
 expect((await as(guardian,'authenticated','whatsapp_access',[school])).enabled).toBe(false);
 expect((await as(outsider,'authenticated','whatsapp_access',[school])).enabled).toBe(false);
 expect((await q('select aulanexo_private.whatsapp_enabled($1) v',[branch])).rows[0].v).toBe(true);
});
it('permite atender a Secretaría pero reserva conexión y automatización a Dirección',async()=>{
 const access=await as(secretary,'authenticated','whatsapp_access',[school]); expect(access).toEqual({enabled:true,canConnect:false});
 await expect(manage('settings',settings,secretary)).rejects.toThrow('permiso');
 await expect(manage('prepare',{},secretary)).rejects.toThrow('permiso');
 expect((await as(secretary,'authenticated','whatsapp_workspace',[school,null])).canConnect).toBe(false);
});
it('no expone credenciales ni permite RPC internas desde usuarios o anónimos',async()=>{
 const data=await as(director,'authenticated','whatsapp_workspace',[school,null]);expect(JSON.stringify(data)).not.toContain('encrypted');expect(data.settings.mode).toBe('manual');
 await expect(as(director,'authenticated','whatsapp_service',['connection',JSON.stringify({schoolId:school})])).rejects.toThrow();
 await expect(as(null,'anon','whatsapp_workspace',[school,null])).rejects.toThrow();
});
it('consume cada nonce una vez, con institución y usuario exactos',async()=>{
 const prepared=await manage('prepare');await expect(manage('consume',{sessionId:prepared.sessionId},outsider)).rejects.toThrow();
 await manage('consume',{sessionId:prepared.sessionId});await expect(manage('consume',{sessionId:prepared.sessionId})).rejects.toThrow('venció');
});
it('deduplica webhooks y rechaza eventos de otra cuenta o número',async()=>{
 const first=await service('ingest',event()),duplicate=await service('ingest',event());expect(first.messageId).toBe(duplicate.messageId);
 expect((await q('select unread from aulanexo_private.whatsapp_conversations')).rows[0].unread).toBe(1);
 expect(await service('ingest',event('wrong',{wabaId:'29999'}))).toBeNull();expect(await service('ingest',event('wrong',{phoneNumberId:'19999'}))).toBeNull();
});
it('los ecos humanos pausan el bot y no amplían la ventana de 24 horas',async()=>{
 await manage('settings',settings);const incoming=await service('ingest',event());
 await service('queue_auto',{inReplyTo:incoming.messageId,body:'Respuesta única'});
 const before=(await q('select last_customer_at from aulanexo_private.whatsapp_conversations')).rows[0].last_customer_at;
 await service('ingest',event('echo.1',{echo:true,body:'Te atiendo personalmente'}));
 const t=(await q('select * from aulanexo_private.whatsapp_conversations')).rows[0];expect(t.human).toBe(true);expect(t.last_customer_at).toEqual(before);
 expect((await q("select status from aulanexo_private.whatsapp_messages where source='bot'")).rows[0].status).toBe('cancelled');
});
it('cancela pendientes al apagar respuestas automáticas y deduplica respuestas del bot',async()=>{
 await manage('settings',settings);const incoming=await service('ingest',event());const job=await service('queue_auto',{inReplyTo:incoming.messageId,body:'Respuesta'});
 await service('queue_auto',{inReplyTo:incoming.messageId,body:'Respuesta repetida'});
 expect((await q("select count(*)::int n from aulanexo_private.whatsapp_messages where source='bot'")).rows[0].n).toBe(1);
 await manage('settings',{...settings,mode:'manual'});expect(await service('claim',{messageId:job})).toBeNull();
});
it('una respuesta de derivación se envía una vez y luego queda atención humana',async()=>{
 await manage('settings',settings);const incoming=await service('ingest',event());const job=await service('queue_auto',{inReplyTo:incoming.messageId,body:'Te atenderá una persona',handoff:true});
 expect((await service('claim',{messageId:job})).body).toBe('Te atenderá una persona');expect(await service('claim',{messageId:job})).toBeNull();
 expect((await q('select human from aulanexo_private.whatsapp_conversations')).rows[0].human).toBe(true);
});
it('un envío manual es idempotente y bloquea el texto libre fuera de ventana',async()=>{
 const incoming=await service('ingest',event());const input={conversationId:incoming.conversationId,body:'Respuesta manual',requestId:id(90)};
 await manage('send',input,secretary);await manage('send',input,secretary);
 expect((await q("select count(*)::int n from aulanexo_private.whatsapp_messages where source='staff'")).rows[0].n).toBe(1);
 await q("update aulanexo_private.whatsapp_conversations set last_customer_at=now()-interval '25 hours'");
 await expect(manage('send',{...input,requestId:id(91)})).rejects.toThrow('24 horas');
 expect(await service('claim',{messageId:id(90)})).toBeNull();
});
it('no permite transferir números entre sedes y desconectar conserva los historiales',async()=>{
 await service('ingest',event());await expect(service('save_connection',{schoolId:school,userId:director,phoneNumberId:'10002',wabaId:'20001',displayPhone:'59170000001',ciphertext:'new'})).rejects.toThrow('otro número');
 await manage('disconnect');const c=await service('connection',{schoolId:school});expect(c.token_ciphertext).toBeNull();
 expect((await q('select count(*)::int n from aulanexo_private.whatsapp_messages')).rows[0].n).toBe(1);
 expect(await service('ingest',event('after.disconnect'))).toBeNull();
});
it('un mensaje antiguo no reabre la ventana y las confirmaciones no retroceden',async()=>{
 const incoming=await service('ingest',event('old',{timestamp:new Date(Date.now()-26*3600000).toISOString()}));
 await expect(manage('send',{conversationId:incoming.conversationId,body:'No',requestId:id(92)})).rejects.toThrow('24 horas');
});
it('detecta conflictos al editar respuestas sin perder silenciosamente otra configuración',async()=>{
 const before=await as(director,'authenticated','whatsapp_workspace',[school,null]);
 const result=await manage('settings',{...settings,revision:before.settings.revision});expect(result.revision).toBe(before.settings.revision+1);
 await expect(manage('settings',{...settings,mode:'manual',revision:before.settings.revision})).rejects.toThrow('cambió');
});
it('bloquea el cambio de etapa de una conversación de otra institución',async()=>{
 const incoming=await service('ingest',event());
 await expect(manage('conversation',{conversationId:incoming.conversationId,stage:'closed'},outsider,other)).rejects.toThrow('permiso');
 await expect(manage('conversation',{conversationId:id(500),stage:'closed'})).rejects.toThrow('no disponible');
});
it('conserva confirmaciones tempranas y no retrocede de leído a enviado o fallido',async()=>{
 const incoming=await service('ingest',event());await manage('send',{conversationId:incoming.conversationId,body:'Respuesta',requestId:id(95)});
 await service('claim',{messageId:id(95)});
 const status={phoneNumberId:'10001',wabaId:'20001',providerId:'outgoing-1'};
 await service('status',{...status,status:'read'});await service('sent',{messageId:id(95),providerId:'outgoing-1'});
 expect((await q('select status from aulanexo_private.whatsapp_messages where id=$1',[id(95)])).rows[0].status).toBe('read');
 await service('status',{...status,status:'failed'});await service('status',{...status,status:'sent'});
 expect((await q('select status from aulanexo_private.whatsapp_messages where id=$1',[id(95)])).rows[0].status).toBe('read');
});
it('muestra errores posteriores de Meta en vez de conservar incorrectamente enviado',async()=>{
 const incoming=await service('ingest',event());await manage('send',{conversationId:incoming.conversationId,body:'Respuesta',requestId:id(96)});await service('claim',{messageId:id(96)});await service('sent',{messageId:id(96),providerId:'outgoing-2'});
 await service('status',{phoneNumberId:'10001',wabaId:'20001',providerId:'outgoing-2',status:'failed'});
 expect((await q('select status from aulanexo_private.whatsapp_messages where id=$1',[id(96)])).rows[0].status).toBe('failed');
});
it('mantiene los contratos públicos sin elevación de privilegios y la implementación privada',async()=>{
 const rows=(await q("select n.nspname schema,p.proname name,p.prosecdef elevated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('whatsapp_access','whatsapp_workspace','whatsapp_manage','whatsapp_service') order by n.nspname,p.proname")).rows;
 expect(rows.filter(r=>r.schema==='public')).toHaveLength(4);expect(rows.filter(r=>r.schema==='public').every(r=>!r.elevated)).toBe(true);expect(rows.filter(r=>r.schema==='aulanexo_private').every(r=>r.elevated)).toBe(true);
});
