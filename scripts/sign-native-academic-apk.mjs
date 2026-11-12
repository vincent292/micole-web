// Uses the explicitly authorized private local key. Passwords never enter command text or logs.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
const version=23;
const directory=path.join(os.homedir(),'.config/micole/android-signing');
const file=path.join(directory,'credentials.json');
const signing=JSON.parse(fs.readFileSync(file)).android.keystore;
const key=path.resolve(directory,signing.keystorePath);
assert.ok(key.startsWith(directory+path.sep));
for(const p of [file,key])assert.equal(fs.statSync(p).mode&0o077,0);
const root=process.cwd(),input=path.join(root,'tmp/android-attendance-build/android/app/build/outputs/apk/release/app-release.apk');
const output=path.join(root,version===23?'output/apk/micole-organizacion-academica-v23.apk':version===22?'output/apk/micole-asistencia-comoda-v22.apk':version===21?'output/apk/micole-asistencia-semanal-v21.apk':version===20?'output/apk/micole-identidad-personal-v20.apk':version===19?'output/apk/micole-metricas-superadmin-v19.apk':version===18?'output/apk/micole-avisos-importantes-v18.apk':'output/apk/micole-asistencia-permisos-v17.apk');
const sdk='/Users/vincentariassaavedra/Library/Android/sdk/build-tools/36.0.0';
const env={...process.env,JAVA_HOME:'/opt/homebrew/Cellar/openjdk@17/17.0.20.1/libexec/openjdk.jdk/Contents/Home',MICOLE_LOCAL_STORE_PASSWORD:signing.keystorePassword,MICOLE_LOCAL_KEY_PASSWORD:signing.keyPassword||signing.keystorePassword};
function run(executable,args){const result=spawnSync(executable,args,{env,encoding:'utf8',maxBuffer:8*1024*1024});if(result.status!==0){fs.writeFileSync('/private/tmp/micole-signing-failure.log',String(result.stderr||''),{mode:0o600});throw Error('La herramienta de firma no terminó correctamente; registro privado conservado.');}return result.stdout;}
const packageInfo=run(path.join(sdk,'aapt'),['dump','badging',input]);assert.ok(packageInfo.includes("name='com.micole.android' versionCode='"+version+"'"));
const entries=run('/usr/bin/unzip',['-Z1',input]).split('\n');assert.ok(!entries.some(n=>/\.env|credentials\.json|\.jks$|\.keystore$/.test(n)));
run(path.join(sdk,'apksigner'),['sign','--ks',key,'--ks-key-alias',signing.keyAlias,'--ks-pass','env:MICOLE_LOCAL_STORE_PASSWORD','--key-pass','env:MICOLE_LOCAL_KEY_PASSWORD','--out',output,input]);
const details=run(path.join(sdk,'apksigner'),['verify','--print-certs',output]);
const digest=details.match(/certificate SHA-256 digest: ([a-f0-9]+)/i)?.[1]?.toLowerCase();
assert.equal(digest,'adac9a95a0705cfdafa7768df033a75352975f76b3c5651a3c96d74db1b7d557');
const previous=run(path.join(sdk,'apksigner'),['verify','--print-certs',path.join(root,'output/apk/micole-kinder-verificada.apk')]);assert.ok(previous.includes(digest));
run(path.join(sdk,'zipalign'),['-c','-p','4',output]);
const report={package:'com.micole.android',versionCode:version,localBuild:true,cloudBuildsUsed:0,path:path.relative(root,output),sha256:createHash('sha256').update(fs.readFileSync(output)).digest('hex'),bytes:fs.statSync(output).size,signatureSha256:digest,signatureMatchesApk16:true,privateMaterialIncluded:false,installed:false};
fs.writeFileSync(version===23?'output/qa/2026-11-12-native-academic-workspaces/apk23.json':version===22?'output/qa/2026-11-03-asistencia-responsive/apk22.json':version===21?'output/qa/2026-11-03-hoja-semanal/apk21.json':version===20?'output/qa/2026-11-03-identidad/apk20.json':version===19?'output/qa/2026-10-29-metricas-superadmin/apk19.json':version===18?'output/qa/2026-10-29-avisos-importantes/apk18.json':'output/qa/2026-10-29-asistencia/apk17.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:true,path:report.path,versionCode:version,sameCertificate:true,cloudBuildsUsed:0,privateValuesPrinted:false}));
