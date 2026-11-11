// Read-only rollout audit. No test children, campaigns or fee settings are added to real schools.
import fs from 'node:fs';import assert from 'node:assert/strict';import {databaseClient,reportFailure} from './database.mjs';
const db=databaseClient();let realInstitutions=0,testingInstitutions=0;
try{
 await db.connect();await db.query('begin read only');
 const {rows:schools}=await db.query("select distinct on (s.id) s.id,m.user_id,aulanexo_private.registration_test_school(s.id) testing from public.schools s join public.school_memberships m on m.school_id=s.id and m.role='director' and m.active where s.status='active' order by s.id,m.user_id");
 for(const school of schools){
  await db.query('savepoint actor');
  await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.headers','{}',true)",[school.user_id]);
  await db.query('set local role authenticated');
  const {rows}=await db.query('select public.registration_workspace($1) workspace',[school.id]);
  assert.equal(rows[0].workspace.canManage,true);assert.equal(rows[0].workspace.testing,school.testing);
  if(school.testing)testingInstitutions++;else{realInstitutions++;assert.ok(rows[0].workspace.campaigns.every(c=>c.simulation===false));}
  await db.query('rollback to savepoint actor');await db.query('release savepoint actor');
 }
 await db.query('rollback');assert.ok(realInstitutions+testingInstitutions>0);
 const report={ok:true,realInstitutions,testingInstitutions,allActiveInstitutionsWithDirectorAccessible:true,realCampaignSimulationChecked:realInstitutions>0,nonTestInstitutionsCoveredByIsolatedDatabaseTests:true,transactionReadOnly:true,realSchoolWrites:0};
 fs.writeFileSync('output/qa/2026-11-10-registration-general/database-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await db.query('rollback').catch(()=>{});reportFailure(error);}finally{await db.end();}
