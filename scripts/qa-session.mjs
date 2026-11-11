// Private persisted fixtures; normal password Auth only. Never serialize sessions.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {environment} from './database.mjs';
environment();
export const qa=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/micole/cuentas-pruebas-ampliadas.json')));
export const r=qa.resources;
export const url=process.env.VITE_SUPABASE_URL;
export const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY;
assert.equal(qa.marker,'micole-expanded-qa-v1');
assert.equal(new URL(url).hostname,qa.project+'.supabase.co');
export const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function session(accountKey){
 const a=qa.accounts.find(a=>a.key===accountKey);assert.ok(a,'Cuenta QA no registrada');
 const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {error}=await c.auth.signInWithPassword({email:a.email,password:qa.password});
 if(error)throw Error('No se pudo iniciar sesión QA: '+accountKey);
 const identity=await rpc(c,'workspace_identity',{});
 assert.equal(identity.testing,true);assert.ok(!identity.support);assert.deepEqual(identity.roles,[a.role]);
 return c;
}
export async function rpc(c,name,args){const {data,error}=await c.rpc(name,args);if(error)throw Error(name+': '+error.message);return data;}
export async function rows(query){const {data,error}=await query;if(error)throw Error(error.message);return data;}
