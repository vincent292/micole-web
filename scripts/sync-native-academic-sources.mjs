import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const release=path.resolve('output/mobile/2026-11-12-academic-workspaces');
const manifest=JSON.parse(await fs.readFile(path.join(release,'source-manifest.json'),'utf8'));
const origin=await fs.realpath(manifest.source),changes=manifest.files.filter(f=>f.changed);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
// Preflight all paths and hashes before changing the original working copy.
for(const item of changes){
 assert.ok(!path.isAbsolute(item.file)&&!item.file.split(path.sep).includes('..'));
 let current=null;try{current=hash(await fs.readFile(path.join(origin,item.file)));}catch(e){if(e.code!=='ENOENT')throw e;}
 assert.equal(current,item.baselineSha256,'Source changed since review: '+item.file);
 assert.equal(hash(await fs.readFile(path.join(release,'source',item.file))),item.sha256);
}
for(const item of changes){const target=path.join(origin,item.file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.copyFile(path.join(release,'source',item.file),target);}
const env=path.join(origin,'.env.local');let value=await fs.readFile(env,'utf8');value=value.replace(/^EXPO_PUBLIC_WEB_URL=.*$/m,'EXPO_PUBLIC_WEB_URL=https://www.micole.click');await fs.writeFile(env,value,{mode:0o600});
await fs.writeFile(path.join(release,'source-sync.json'),JSON.stringify({synced:true,changedFiles:changes.length,source:origin,baselineHashesChecked:true,publicWebOrigin:'https://www.micole.click'},null,2)+'\n');
console.log(JSON.stringify({synced:true,changedFiles:changes.length,baselineHashesChecked:true,privateValuesPrinted:false}));
