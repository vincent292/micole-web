import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {chromium} from '@playwright/test';import {session,qa,url} from './qa-session.mjs';
const folder='output/qa/2026-11-10-registration-general',origin=process.env.MICOLE_REGISTRATION_TEST_URL||'http://localhost:5173';
const client=await session('director'),stored=(await client.auth.getSession()).data.session,browser=await chromium.launch(),ctx=await browser.newContext({viewport:{width:1440,height:1050}}),errors=[];let mockedWorkspace=false,writeAttempts=0;
await ctx.addInitScript(({key,value,user,school})=>{localStorage.setItem(key,value);sessionStorage.setItem(`micole_selected_site:${user}:director`,school);},{key:'sb-'+new URL(url).hostname.split('.')[0]+'-auth-token',value:JSON.stringify(stored),user:stored.user.id,school:qa.schoolId});
// UI-only scenario: keep the authenticated QA session and render responses without trial branding.
// General real-tenant authorization and payments run against all migrations in the database suite.
await ctx.route('**/rest/v1/**',async route=>{
 const req=route.request(),pathname=new URL(req.url()).pathname;
 if(req.method()==='POST'&&!pathname.includes('/rpc/')){writeAttempts++;await route.abort();return;}
 if(pathname.endsWith('/registration_workspace')){const response=await route.fetch(),body=await response.json();mockedWorkspace=true;await route.fulfill({response,json:{...body,testing:false,campaigns:[],applications:[],pools:[],delegates:[],canCollect:[]}});return;}
 if(pathname.endsWith('/workspace_identity')){const response=await route.fetch(),body=await response.json();await route.fulfill({response,json:{...body,testing:false}});return;}
 if(req.method()==='GET'&&pathname.endsWith('/schools')){const response=await route.fetch(),body=await response.json();await route.fulfill({response,json:body.map(s=>({...s,appearance:null}))});return;}
 await route.continue();
});
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(origin+'/app/enrollment',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'Preparar campaña de inscripciones',exact:true}).waitFor();
 assert.ok(mockedWorkspace);assert.equal(await page.locator('.registration-pilot').count(),0);assert.equal(await page.locator('input[name=simulation]').count(),0);assert.equal(await page.locator('[data-institution-template]').count(),0);
 assert.ok(await page.getByRole('button',{name:'Inscripciones',exact:true}).count());await page.screenshot({path:folder+'/general-desktop.png'});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:folder+'/general-mobile.png'});
 // Verify the public portal still uses institution colors without a pilot appearance template.
 const anon=await browser.newContext({viewport:{width:390,height:844}}),parent=await anon.newPage();await anon.route('**/rest/v1/rpc/registration_context',route=>route.fulfill({json:{school:{id:'ui-scenario',name:'Colegio institucional',color:'#23614F',logoUrl:'/branding/book-logo.svg'},requiresVerification:true}}));
 await parent.goto(origin+'/matricula/'+'a'.repeat(64),{waitUntil:'domcontentloaded'});await parent.getByRole('heading',{name:'Verifica tu acceso a la ficha',exact:true}).waitFor();assert.equal(await parent.locator('.public-registration').evaluate(el=>getComputedStyle(el).getPropertyValue('--institution-primary').trim()),'#23614F');assert.equal(await parent.locator('.registration-editor').count(),0);await parent.screenshot({path:folder+'/general-family-brand.png'});await anon.close();
 assert.equal(writeAttempts,0);assert.deepEqual(errors,[]);const report={ok:true,origin,scenario:'UI without appearance or trial flag; QA responses adapted locally',navigationVisibleWithoutAppearance:true,configurationAvailable:true,testBannerHidden:true,simulatedPaymentControlHidden:true,institutionBrandWithoutTemplate:true,mobileNoOverflow:true,realSchoolWrites:0,browserErrors:errors};await fs.writeFile(folder+'/general-ui-verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:folder+'/general-ui-failed.png'});throw Error(String(error.message).replace(/Bearer [A-Za-z0-9._-]+/g,'Bearer [oculto]').slice(0,1500));}finally{await ctx.close();await browser.close();await client.auth.signOut({scope:'local'});}
