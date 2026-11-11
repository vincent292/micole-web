import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const previous=JSON.parse(fs.readFileSync('output/qa/2026-10-29-landing-refresh/release-preparado.json'));
const report={restored:true,deployment:'https://micole-almsaaybq-vincent292s-projects.vercel.app',deploymentId:'dpl_BwLmXDQHcMD9QRzMiiZSeDucHgDf',scope:'Landing immediately preceding the editorial redesign',checks:[],changedDatabase:false,changedAndroid:false};
for(const item of previous.checks){const response=await fetch('https://www.micole.click'+item.path,{headers:{'Cache-Control':'no-cache'}});assert.equal(response.status,200);assert.equal(response.headers.get('x-frame-options'),'DENY');const bytes=Buffer.from(await response.arrayBuffer());assert.equal(createHash('sha256').update(bytes).digest('hex'),item.sha256,item.path);report.checks.push({...item,matchesPreviousDeployment:true});}
fs.writeFileSync('output/qa/2026-10-29-landing-restaurada/release.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({restored:true,previousDeploymentHashesMatched:report.checks.length}));
