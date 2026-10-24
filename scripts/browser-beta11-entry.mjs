// Real installer, installed application HTTP and browser; synthetic 2.5-shaped data only.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrate25, fixtureCode, oldMarker } from '../test/fixtures/canae-entry.mjs';
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
try{
  for(const width of [1280,390]){
    const f=await migrate25(),context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce'}),page=await context.newPage(),errors=[],posts=[],csp=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('console',item=>{if(/content.security.policy|violates the following/i.test(item.text()))csp.push(item.text());});page.on('request',request=>{assert.equal(new URL(request.url()).origin,f.baseUrl);if(request.method()==='POST')posts.push(new URL(request.url()).pathname);});
    try{
      await page.goto(f.baseUrl+'/legacy/?old=discarded');assert.equal(page.url(),f.baseUrl+'/');assert.equal(await page.title(),'Canaé · compagnon local');assert(!await page.locator('body').innerText().then(value=>value.includes(oldMarker)));
      await page.getByLabel('Code d’accès du prototype').fill(fixtureCode);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
      const composer=page.getByRole('textbox',{name:'Message',exact:true});await composer.waitFor();await page.locator('.companion-shell').waitFor();assert.equal((await page.locator('.inference-controls').boundingBox()).height,44);
      const draft='Brouillon après migration 2.5 — conservé';await composer.fill(draft);await page.reload();await composer.waitFor();assert.equal(await composer.inputValue(),draft);
      for(const route of ['/prototype/','/llama-ui/index.html']){await page.goto(f.baseUrl+route);await composer.waitFor();assert.equal(page.url(),f.baseUrl+'/');assert.equal(await composer.inputValue(),draft);}
      const forbidden=await context.request.get(f.baseUrl+'/retained-legacy.html');assert.equal(forbidden.status(),404);assert.equal((await context.request.get(f.baseUrl+'/app.js')).status(),404);
      await f.assertPrivate();assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);assert.deepEqual(posts,['/api/login']);
      results.push({width,fromVersion:'2.5.0',toVersion:f.version,archiveSha256:f.archiveHash,canonicalCanae:true,legacyHtmlNotServed:true,historicalModeMigrated:true,identityAndPrivateBytesPreserved:true,draftAfterReload:true,aliases:true,chatPosts:0,errors:0,csp:0});
    }finally{await context.close();await f.close();}
  }
  console.log(JSON.stringify({ok:true,installedRuntimeAndBrowser:true,syntheticOnly:true,results,limitations:['The old fixture reproduces the 2.5 extracted installation layout; it does not run the 2.5 executable.','Restart executes the installed factory with synthetic stores/transports; no personal instance, engine or GPU is used.']},null,2));
}finally{await browser.close();}
