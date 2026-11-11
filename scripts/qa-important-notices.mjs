// Dedicated QA notices only. No secrets, impersonation or real institution writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {qa,r,day,session,rpc,rows} from './qa-session.mjs';
const mode=process.argv[2]||'verify',folder='output/qa/2026-10-29-avisos-importantes',file=folder+'/api.json';
fs.mkdirSync(folder,{recursive:true});
const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{day,status:'preparing',resources:{},cases:[]};
const clients=new Map();
const login=async key=>{if(!clients.has(key))clients.set(key,await session(key));return clients.get(key);};
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const scenarios=[
  {key:'director-family',author:'director',room:r.room,children:[r.child],audience:'families',category:'general',required:true,expected:['guardian','father']},
  {key:'teacher-family',author:'teacher',room:r.kinderA,children:[r.mateo],audience:'families',category:'general',required:true,expected:['guardian','father']},
  {key:'director-staff',author:'director',room:r.room,children:[],audience:'staff',category:'general',required:true,expected:['teacher']},
  {key:'teacher-director',author:'teacher',room:r.room,children:[],audience:'staff',category:'general',required:true,expected:['director']},
  {key:'health-read',author:'teacher',room:r.room,children:[r.child],audience:'families',category:'health',required:false,expected:['guardian','father']},
  {key:'academic-child',author:'director',room:r.kinderA,children:[r.mateo],audience:'families',category:'academic',required:false,expected:['guardian','father','studentb']},
];
try{
  if(mode==='prepare'){
    for(const s of scenarios){
      const c=await login(s.author);report.resources[s.key]??=randomUUID();save();
      const id=report.resources[s.key];
      await rpc(c,'save_announcement',{p_notice:{id,school_id:qa.schoolId,classroom_id:s.room,title:'QA2910-IMPORTANTE-'+s.key.toUpperCase(),content:'SIMULACRO FICTICIO. Aviso de '+(s.author==='director'?'Dirección':'Docente')+' para comprobar la lectura al abrir MiCole. No es una emergencia, autorización ni actividad real.',audience:s.audience,category:s.category,requires_acknowledgment:s.required,remind_hourly:false,urgent:false,target_student_ids:s.children}});
    }
    report.status='prepared';save();
  }else if(mode==='verify'){
    report.cases=[];
    for(const a of qa.accounts)await login(a.key);
    for(const s of scenarios){
      const id=report.resources[s.key];assert.ok(id);
      for(const [key,c] of clients){
        const notices=await rows(c.from('notifications').select('id').eq('source_id',id));
        assert.equal(notices.length,s.expected.includes(key)?1:0,s.key+': '+key);
        if(s.expected.includes(key)&&s.required){
          const first=await rpc(c,'announcement_view',{p_id:id});
          assert.equal(first.acknowledgedAt,null);assert.equal(first.readAt,null);
          const pending=await rpc(c,'pending_announcements',{p_school_id:qa.schoolId});
          assert.ok(pending.some(n=>n.id===id),s.key+': pendiente al entrar '+key);
          const again=await rpc(c,'announcement_view',{p_id:id});
          assert.equal(again.readAt,null);assert.equal(again.acknowledgedAt,null);
        }
        if(!s.expected.includes(key)&&aRole(key)==='student'){
          const denied=await c.rpc('announcement_view',{p_id:id});assert.ok(denied.error);
        }
      }
      report.cases.push({scenario:s.key,expected:s.expected,accountsChecked:clients.size,passed:true});
    }
    const c=await login('guardian'),id=report.resources['health-read'];
    const n=await rpc(c,'announcement_view',{p_id:id});assert.equal(n.readAt,null);assert.equal(n.acknowledgedAt,null);
    report.status='verified-before-ui';report.normalAccounts=clients.size;report.routingChecks=scenarios.length*clients.size;save();
  }else if(mode==='state'){
    const state={};
    for(const key of ['guardian','father','teacher','director']){
      const c=await login(key);state[key]=[];
      for(const s of scenarios.filter(s=>s.expected.includes(key))){
        const n=await rpc(c,'announcement_view',{p_id:report.resources[s.key]});
        state[key].push({scenario:s.key,read:!!n.readAt,confirmed:!!n.acknowledgedAt,required:n.requiresAcknowledgment});
      }
    }
    report.physicalReadStates=state;save();console.log(JSON.stringify(state));
  }else if(mode==='withdraw'){
    for(const s of scenarios)await rpc(await login(s.author),'withdraw_announcement',{p_id:report.resources[s.key]});
    report.withdrawnAfterTesting=true;save();
  }else throw Error('Unsupported QA stage');
  console.log(JSON.stringify({ok:true,mode,file,scenarios:scenarios.length}));
}finally{await Promise.allSettled([...clients.values()].map(c=>c.auth.signOut({scope:'local'})));}
function aRole(key){return qa.accounts.find(a=>a.key===key)?.role;}
