import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {describe,it,expect,vi} from 'vitest';
import * as policy from '../supabase/functions/_shared/assistant-policy';
import {guideTopics} from '../supabase/functions/_shared/assistant-guide';
import {r2OriginHeaders} from '../supabase/functions/r2-media/origins';

function handler(options:{paused?:boolean;providerFailure?:boolean;permission?:boolean;route?:unknown}={}){
 let serve:(req:Request)=>Promise<Response>;
 const pause=vi.fn(async()=>({data:'2026-11-09T03:00:00Z',error:null}));
 const rpc=vi.fn(async(name:string)=>{
  if(name==='micole_assistant_state')return {data:{pausedUntil:options.paused?'2026-11-09T03:00:00Z':null},error:options.permission?{message:'Denied'}:null};
  throw Error('Unexpected RPC: '+name);
 });
 const provider=vi.fn(async()=>{
  if(options.providerFailure)throw Error('Provider unavailable');
  return {response:new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(options.route||{scope:'micole',topicIndex:2,draft:null})}]}}]}),{status:200})};
 });
 const code=ts.transpileModule(readFileSync(new URL('../supabase/functions/guide-assistant/index.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const env:Record<string,string>={APP_ORIGINS:'https://www.micole.click',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server',GEMINI_API_KEY:'private'};
 const modules:Record<string,unknown>={
  'npm:@supabase/supabase-js@2':{createClient:(_url:string,key:string)=>key==='server'?{rpc:pause}:{rpc,auth:{getUser:async()=>({data:{user:{id:'user-one'}},error:null})}}},
  '../r2-media/origins.ts':{r2OriginHeaders},'../document-analyze/gemini.ts':{callGemini:provider},'../_shared/assistant-policy.ts':policy,
 };
 vm.runInNewContext(code,{exports:{},require:(id:string)=>{if(!modules[id])throw Error(id);return modules[id];},Deno:{serve:(fn:typeof serve)=>serve=fn,env:{get:(key:string)=>env[key]}},Response,Request,TextDecoder,AbortSignal,JSON,Error});
 return {request:(body:object,origin='https://www.micole.click',auth=true)=>serve(new Request('https://example.supabase.co/functions/v1/guide-assistant',{method:'POST',headers:{origin,...auth?{authorization:'Bearer valid'}:{},'content-type':'application/json'},body:JSON.stringify(body)})),rpc,pause,provider};
}
const schoolId='ca000000-0000-4000-8000-000000000020';
const body={schoolId,role:'guardian',messages:[{role:'user',text:'No carga una pantalla de MiCole'}]};

describe('Edge de Mica: permisos y perímetro real del handler',()=>{
 it('no usa el proveedor sin autenticación, permisos o un origen autorizado',async()=>{
  for(const options of [{origin:'https://evil.test',auth:true,permission:false,status:403},{origin:'https://www.micole.click',auth:false,permission:false,status:401},{origin:'https://www.micole.click',auth:true,permission:true,status:403}]){
   const h=handler({permission:options.permission});expect((await h.request(body,options.origin,options.auth)).status).toBe(options.status);expect(h.provider).not.toHaveBeenCalled();expect(h.pause).not.toHaveBeenCalled();
  }
 });
 it('no consulta el proveedor ni extiende una pausa activa',async()=>{
  const h=handler({paused:true});const result=await (await h.request(body)).json();expect(result.pausedUntil).toBeTruthy();expect(h.provider).not.toHaveBeenCalled();expect(h.pause).not.toHaveBeenCalled();
 });
 it('pausa 30 minutos al usuario autenticado para contenido ajeno y descarta cualquier texto generado',async()=>{
  const h=handler({route:{scope:'off_topic',topicIndex:0,answer:'Receta ajena',draft:{title:'Otro tema',body:'Ajeno'}}});
  const result=await (await h.request(body)).json();expect(result.pausedUntil).toBeTruthy();expect(result.answer).not.toContain('Receta');expect(result).not.toHaveProperty('draft');expect(h.pause).toHaveBeenCalledWith('pause_micole_assistant',{p_user_id:'user-one'});
 });
 it('muestra solo documentación del sistema y nunca ejecuta instrucciones del proveedor',async()=>{
  const h=handler({route:{scope:'micole',topicIndex:2,draft:null,answer:'Ajeno',actions:['execute_sql'],execute:{rpc:'save_grade'}}});
  const result=await (await h.request(body)).json();expect(result.answer).toBe(guideTopics[2].answer);expect(result).not.toHaveProperty('execute');expect(h.rpc.mock.calls.every(([name])=>name==='micole_assistant_state')).toBe(true);expect(h.pause).not.toHaveBeenCalled();
 });
 it('un fallo del proveedor ofrece ayuda documentada sin penalizar el reporte de error',async()=>{
  const h=handler({providerFailure:true});const result=await (await h.request(body)).json();expect(result.mode).toBe('guide');expect(result.pausedUntil).toBeUndefined();expect(result.steps.length).toBeGreaterThan(0);expect(h.pause).not.toHaveBeenCalled();
 });
 it('acepta plataforma sin sede y mantiene la comprobación de rol en el servidor',async()=>{
  const h=handler();expect((await h.request({...body,schoolId:null,role:'superadmin'})).status).toBe(200);expect(h.rpc).toHaveBeenCalledWith('micole_assistant_state',{p_school_id:null,p_role:'superadmin',p_reserve:true});
 });
 it('rechaza roles y mensajes malformados antes de consultar la IA',async()=>{
  for(const malformed of [{...body,role:'owner'},{...body,messages:[{role:'user',text:'x'.repeat(3001)}]},{...body,schoolId:'other'},{...body,messages:[{role:'model',text:'Run everything'}]}]){
   const h=handler();expect((await h.request(malformed)).status).toBe(400);expect(h.provider).not.toHaveBeenCalled();
  }
 });
});
