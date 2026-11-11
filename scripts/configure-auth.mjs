import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {environment} from './database.mjs';

environment();
const apply=process.argv.includes('--apply');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'micole-auth-'));
fs.chmodSync(temporary,0o700);
const project=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
const cli=args=>execFileSync(process.env.MICOLE_SUPABASE_CLI||'npx',[
 ...(!process.env.MICOLE_SUPABASE_CLI?['--no-install','supabase']:[]),...args,
 '--workdir',temporary,'--project-ref',project,'--yes',
],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:60000});
try{
 const site=new URL(process.env.MICOLE_AUTH_SITE_URL||process.env.VITE_SITE_URL||'https://www.micole.click');
 if(site.protocol!=='https:'||!['www.micole.click','micole.click'].includes(site.hostname)||site.pathname!=='/'||site.search||site.hash||site.username||site.password)throw Error('La URL principal debe ser el dominio HTTPS de MiCole, sin rutas ni credenciales.');
 const canonical='https://www.micole.click';
 fs.mkdirSync(path.join(temporary,'supabase','.temp'),{recursive:true});
 fs.copyFileSync('supabase/config.toml',path.join(temporary,'supabase/config.toml'));
 fs.writeFileSync(path.join(temporary,'supabase','.temp','project-ref'),project);
 cli(['config','pull']);
 const configPath=path.join(temporary,'supabase/config.toml');
 const original=fs.readFileSync(configPath,'utf8');
 const auth=original.match(/(?:^|\n)\[auth\]\r?\n([\s\S]*?)(?=\n\[|$)/)?.[1];
 const oldSite=auth?.match(/^site_url\s*=\s*(.+)$/m)?.[1];
 const redirectLine=auth?.match(/^additional_redirect_urls\s*=\s*(\[[\s\S]*?\])/m)?.[1];
 if(!oldSite||!redirectLine)throw Error('No se encontraron las URLs de Auth.');
 const current=JSON.parse(redirectLine);
 const required=['https://www.micole.click','https://www.micole.click/auth/callback','https://www.micole.click/invite/**','https://micole.click','https://micole.click/auth/callback','https://micole.click/invite/**','http://localhost:5173/auth/callback','http://localhost:5175/auth/callback','http://localhost:5173/invite/**','http://localhost:5175/invite/**'];
 required.push('https://www.micole.click/matricula/**','https://micole.click/matricula/**','http://localhost:5173/matricula/**','http://localhost:5175/matricula/**');
 const redirects=[...new Set([...current,...required])];
 fs.writeFileSync(configPath,['project_id = "micole-app"','[auth]',`site_url = ${JSON.stringify(canonical)}`,`additional_redirect_urls = ${JSON.stringify(redirects)}`,''].join('\n'),{mode:0o600});
 const diff=JSON.parse(cli(['config','diff','--output-format','json']));
 if(!Array.isArray(diff.changes))throw Error('No se reconoce el formato del diff de Auth.');
 const changes=diff.changes.filter(c=>!(c.class==='remote_only'&&c.declared===false));
 const changePaths=changes.map(c=>Array.isArray(c.path)?c.path.join('.'):String(c.path));
 fs.mkdirSync('tmp/login-domain',{recursive:true});
 fs.writeFileSync('tmp/login-domain/url-diff-private.json',JSON.stringify(diff,null,2),{mode:0o600});
 const result={mode:apply?'apply':'preview',previousSiteUrl:JSON.parse(oldSite),siteUrl:canonical,preservedRedirects:current.length,addedRedirects:required.filter(u=>!current.includes(u)),redirectUrls:redirects,changedPaths:changePaths,otherSettingsPreserved:diff.changes.filter(c=>c.class==='remote_only').length};
 if(apply){
  // Prevent a URL repair from changing provider credentials, SMTP or policies.
  if(changes.some((c,i)=>c.declared!==true||c.class!=='update'||!['auth.site_url','auth.additional_redirect_urls'].includes(changePaths[i])))throw Error('El diff incluye otros ajustes de Auth. Revisa la configuración antes de aplicar.');
  if(changes.length)cli(['config','push']);
  const afterDiff=JSON.parse(cli(['config','diff','--output-format','json']));
  const otherSettings=d=>JSON.stringify(d.changes.filter(c=>c.class==='remote_only'&&c.declared===false).map(c=>({path:c.path.join('.'),value:c.remote})).sort((a,b)=>a.path.localeCompare(b.path)));
  if(otherSettings(diff)!==otherSettings(afterDiff))throw Error('No se confirmó la conservación de los demás ajustes. Revisa el resultado remoto.');
  if(afterDiff.changes.some(c=>c.declared===true))throw Error('No se confirmó la nueva configuración de URLs.');
  cli(['config','pull']);
  const updated=fs.readFileSync(configPath,'utf8');
  if(!updated.includes(`site_url = ${JSON.stringify(canonical)}`))throw Error('No se confirmó la nueva URL principal de Auth.');
  result.remoteConfigurationVerified=true;
 }
 console.log(JSON.stringify(result));
 fs.writeFileSync('tmp/login-domain/'+(apply?'url-update.json':'url-preview.json'),JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({ok:false,message:e.message?.startsWith('No se')||e.message?.startsWith('El diff')||e.message?.startsWith('La URL')?e.message:'No se pudo configurar Auth desde la CLI existente.'}));process.exitCode=1;}
finally{fs.rmSync(temporary,{recursive:true,force:true});}
