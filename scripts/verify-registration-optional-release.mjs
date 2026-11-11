import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';
const folder='output/qa/2026-11-10-registration-optional',file=folder+'/release.json';
const prepared=JSON.parse(fs.readFileSync(folder+'/release-preparado.json'));
const deployment=process.argv[2];assert.ok(/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(deployment||''),'Provide the candidate Vercel URL');
const cli='/Users/vincentariassaavedra/.npm/_npx/69f9afb961c37556/node_modules/vercel/dist/vc.js';
const report={deployment,staticOnly:true,sourceFilesUploaded:false,promoted:false,checks:[]};
for(let i=0;i<prepared.checks.length;i++){
 const item=prepared.checks[i],temp=path.resolve(`tmp/release-check-${i}.bin`);
 execFileSync(process.execPath,[cli,'curl',item.path,'--deployment',deployment,'--','--silent','--show-error','--fail','--output',temp],{cwd:path.resolve(prepared.root),stdio:['ignore','pipe','pipe']});
 const digest=createHash('sha256').update(fs.readFileSync(temp)).digest('hex');assert.equal(digest,item.sha256,item.path);
 report.checks.push({...item,matchesCompiled:true});
}
fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:true,checks:report.checks.length,deployment,promoted:false}));
