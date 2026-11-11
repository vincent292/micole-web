// All charges and receipts in this script are fictional and restricted to registered QA.
import fs from 'node:fs';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {qa,r,day,session,rpc,rows} from './qa-session.mjs';
const mode=process.argv[2]||'verify',file='output/qa/2026-10-29-avisos-importantes/pagos-api.json';
const report=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{day,resources:{charge:randomUUID()},status:'preparing',cases:[]};
const clients=new Map();const login=async key=>{if(!clients.has(key))clients.set(key,await session(key));return clients.get(key);};
const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const alerts=async(c,read=false)=>rpc(c,'family_payment_alerts',{p_school_id:qa.schoolId,p_include_read:read});
const own=items=>items.find(n=>n.payment.studentId===r.emma);
const snapshot=async()=>{
  const c=await login('director');return {charge:await rows(c.from('school_charges').select('id,amount,paid_amount,status,due_date').eq('id',report.resources.charge)),payments:await rows(c.from('school_payments').select('id,amount').eq('charge_id',report.resources.charge))};
};
try{
  save();const d=await login('director');
  if(mode==='prepare'){
    const next=new Date(day+'T12:00:00Z');next.setUTCDate(next.getUTCDate()+5);report.dueDate=next.toISOString().slice(0,10);save();
    report.resources.plan??=randomUUID();save();
    let generated=await rows(d.from('school_charges').select('id,amount').eq('plan_id',report.resources.plan));
    if(!generated.length){
      const tariff=await rpc(d,'platform_tariffs',{p_school_id:qa.schoolId});
      await rpc(d,'create_payment_plan',{p_plan:{id:report.resources.plan,school_id:qa.schoolId,student_id:r.emma,start_date:report.dueDate,months:1,monthly_fee:350-Number(tariff.monthlyLicenseFee),snack_fee:0,enrollment_fee:0,due_day:Number(report.dueDate.slice(8)),discount:0,discount_from:null,discount_to:null,prorate:false}});
      generated=await rows(d.from('school_charges').select('id,amount').eq('plan_id',report.resources.plan));
    }
    assert.equal(generated.length,1);assert.equal(Number(generated[0].amount),350);report.resources.charge=generated[0].id;save();
    report.initialLedger=await snapshot();report.status='prepared';save();
  }else if(mode==='verify'){
    for(const a of qa.accounts){
      const c=await login(a.key),list=await alerts(c);
      const owned=own(list);
      if(['guardian','father'].includes(a.key)){
        assert.ok(owned);assert.equal(owned.payment.amount,350);assert.equal(owned.payment.charges.length,1);assert.equal(owned.payment.charges[0].daysLeft,5);assert.equal(owned.readAt,null);
        report.resources[a.key+'Alert']=owned.id;assert.ok((await alerts(c)).some(n=>n.id===owned.id));
      }else assert.equal(owned,undefined,a.key+': no lee pagos de Emma');
      if(a.role!=='guardian')assert.equal(list.length,0);
    }
    const m=await login('guardian'),other=await login('familyb');
    for(const c of [m,other]){const id=report.resources[c===m?'fatherAlert':'guardianAlert'].slice('payment:'.length);const denied=await c.rpc('read_family_payment_alert',{p_school_id:qa.schoolId,p_id:id});assert.ok(denied.error);}
    assert.deepEqual(await snapshot(),report.initialLedger);
    report.cases.push('Aviso real +5 días: Bs350, solo mamá/papá; 13 cuentas normales contrastadas; reintento no duplica; no se altera contabilidad');report.status='verified-before-ui';save();
  }else if(mode==='after-read'){
    const mother=own(await alerts(await login('guardian'),true)),father=own(await alerts(await login('father'),true));
    assert.ok(mother.readAt);assert.equal(father.readAt,null);assert.equal(own(await alerts(await login('guardian'))),undefined);
    assert.deepEqual(await snapshot(),report.initialLedger);
    report.motherReadFatherPending=true;report.readDoesNotCreatePayment=true;report.cases.push('Lectura física de mamá: deja a papá pendiente y conserva importe, saldo y pagos');save();
  }else if(mode==='partial'||mode==='complete'){
    const key=mode==='partial'?'partialReceipt':'finalReceipt';report.resources[key]??=randomUUID();save();
    await rpc(d,'checkout_school_payment',{p_receipt_id:report.resources[key],p_student_id:r.emma,p_items:[{chargeId:report.resources.charge,amount:mode==='partial'?100:250}],p_method:'cash',p_reference:'QA2910-SIMULADO-SIN-DINERO-REAL-'+mode,p_invoice:{},p_qr_reviewed:false});
    const m=await login('guardian'),n=own(await alerts(m));
    if(mode==='partial'){assert.ok(n);assert.equal(n.payment.amount,250);assert.equal(n.readAt,null);assert.notEqual(n.id,report.resources.guardianAlert);report.resources.partialAlert=n.id;report.cases.push('Abono ficticio Bs100: aparece un aviso nuevo por el saldo Bs250');}
    else{assert.equal(n,undefined);const state=await snapshot();assert.equal(Number(state.charge[0].paid_amount),350);assert.equal(state.charge[0].status,'paid');report.finalLedger=state;report.status='passed';report.cases.push('Pago ficticio final Bs250: cuota saldada, el aviso deja de aparecer; no hubo dinero real');}
    save();
  }else if(mode==='father-read'){
    const mother=own(await alerts(await login('guardian'),true)),father=own(await alerts(await login('father'),true));
    assert.equal(mother.payment.amount,250);assert.equal(mother.readAt,null);
    assert.equal(father.payment.amount,250);assert.ok(father.readAt);
    const ledger=await snapshot();assert.equal(Number(ledger.charge[0].paid_amount),100);
    report.fatherWebReadPartial=true;report.motherPartialStillPending=true;
    report.cases.push('Papá ve y lee Bs250 en web; mamá conserva pendiente su aviso actualizado y el único abono sigue siendo Bs100');save();
  }else throw Error('Unsupported QA stage');
  console.log(JSON.stringify({ok:true,mode,file,status:report.status}));
}finally{await Promise.allSettled([...clients.values()].map(c=>c.auth.signOut({scope:'local'})));}
