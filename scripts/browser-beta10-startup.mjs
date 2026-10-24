// Held synthetic session reads must never expose a composer that restoration can overwrite.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createPrototype,PROTOTYPE_CODE} from '../lib/llama-ui-prototype.mjs';
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
try{
 for(const width of [1280,390]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'beta10-startup-'));
  const fixture=await createPrototype({root,port:0});
  const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  let release;const gate=new Promise(resolve=>release=resolve);
  try{
   await page.route('**/api/sessions?**',async route=>{await gate;await route.continue();});
   const reading=page.waitForRequest(request=>new URL(request.url()).pathname==='/api/sessions');
   await page.goto(fixture.baseUrl);
   await page.locator('#access-code').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await reading;
   const composer=page.getByRole('textbox',{name:'Message',exact:true});
   assert.equal(await composer.count(),0,'No editable composer is mounted before its draft is restored');
   await page.getByRole('status').filter({hasText:'Connexion au compagnon…'}).waitFor();
   release();await composer.waitFor();assert.equal(await composer.isEditable(),true);
   const draft='Brouillon saisi après restauration — été 🌿 '+width;await composer.fill(draft);
   const navigation=page.getByRole('button',{name:'Ouvrir la navigation',exact:true});if(await navigation.isVisible())await navigation.click();
   await page.getByRole('button',{name:'Modèles chargés',exact:true}).click();
   await page.getByRole('region',{name:'Modèles chargés',exact:true}).getByRole('button',{name:'Choisir le moteur et le modèle',exact:true}).click();
   assert.equal(await composer.inputValue(),draft,'Management navigation preserves the initialized draft');
   await page.reload();await composer.waitFor();assert.equal(await composer.inputValue(),draft,'Reload preserves the same draft');assert.deepEqual(errors,[]);
   results.push({width,heldReads:true,composerUnavailableUntilRestored:true,draftAfterManagement:true,draftAfterReload:true,errors:0});
  }finally{release();await context.close();await fixture.app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('beta10-startup-'));await fs.rm(root,{recursive:true,force:true});}
 }
}finally{await browser.close();}
console.log(JSON.stringify({ok:true,synthetic:true,results},null,2));
