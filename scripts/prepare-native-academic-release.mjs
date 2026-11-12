// Snapshot the reviewed shared sources without credentials or generated native projects.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),source=path.join(root,'tmp/native-academic-workspaces');
const origin='/Users/vincentariassaavedra/Desktop/micole-android/micole-android';
const output=path.join(root,'output/mobile/2026-11-12-academic-workspaces');
await fs.mkdir(output,{recursive:true});
const files=[];
async function walk(base,rel){for(const entry of await fs.readdir(path.join(base,rel),{withFileTypes:true})){const file=path.join(rel,entry.name);if(entry.isDirectory())await walk(base,file);else if(entry.isFile())files.push(file);}}
await walk(source,'src');await walk(source,'tests');await walk(source,'scripts');
files.push('app.json','package.json','package-lock.json','tsconfig.json');
const manifest=[];
for(const file of files.sort()){
 const content=await fs.readFile(path.join(source,file));
 let before=null;try{before=await fs.readFile(path.join(origin,file));}catch{}
 const sha256=createHash('sha256').update(content).digest('hex');
 const baseline=before?createHash('sha256').update(before).digest('hex'):null;
 await fs.mkdir(path.dirname(path.join(output,'source',file)),{recursive:true});
 await fs.writeFile(path.join(output,'source',file),content);
 manifest.push({file,sha256,baselineSha256:baseline,changed:sha256!==baseline});
}
await fs.writeFile(path.join(output,'source-manifest.json'),JSON.stringify({source:origin,sharedFor:['android','ios'],files:manifest},null,2)+'\n');
let patch='';
for(const item of manifest.filter(f=>f.changed)){
 const before=item.baselineSha256?path.join(origin,item.file):'/dev/null';
 try{execFileSync('diff',['-u','--label',`a/${item.file}`,'--label',`b/${item.file}`,before,path.join(source,item.file)],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;patch+=e.stdout;}
}
await fs.writeFile(path.join(output,'native-academic-workspaces.patch'),patch);
console.log(JSON.stringify({sourceSnapshot:path.relative(root,output),files:manifest.length,changed:manifest.filter(f=>f.changed).length,credentialsIncluded:false}));
