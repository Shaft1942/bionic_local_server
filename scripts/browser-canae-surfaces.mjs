// Native modal/focus and draft continuity, on owned HTTP fixtures only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href) : await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const captures=process.env.BIONIC_BROWSER_CAPTURES;
if(captures)await fs.mkdir(captures,{recursive:true});
try{for(const width of [1280,390]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'canae-surfaces-')),fixture=await createPrototype({root,port:0});
  const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR'}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const nav=()=>page.getByRole('navigation',{name:'Espace du projet',exact:true});
  try{
    await page.goto(fixture.baseUrl+'/prototype/');assert.equal((await page.locator('body').innerText()).includes('llama-ui'),false,'home describes Canaé without implementation branding');await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await nav().waitFor();
    assert.equal(await page.locator('.navigation-footer').getByRole('button',{name:'Paramètres',exact:true}).count(),0);
    await page.getByRole('textbox',{name:'Message',exact:true}).fill('Brouillon conservé pendant les fenêtres');
    for(const name of ['Fichiers','Images','Activité','Paramètres']){
      await nav().getByRole('button',{name,exact:true}).click();const dialog=page.getByRole('dialog',{name,exact:true});await dialog.waitFor();
      // Let the optional 140ms entry animation finish before geometry/focus checks.
      await page.waitForTimeout(170);const box=await dialog.boundingBox();assert(box);assert(Math.abs(box.x+box.width/2-width/2)<2,'horizontal centering');assert(Math.abs(box.y+box.height/2-450)<2,'vertical centering');
      for(let at=0;at<24;at++){await page.keyboard.press(at%3===0?'Shift+Tab':'Tab');assert(await page.evaluate(()=>document.activeElement===document.body||document.querySelector('dialog[open]')?.contains(document.activeElement)),'native focus never reaches background controls');}
      await page.locator('#prompt').evaluate(element=>element.focus());assert.equal(await page.locator('#prompt').evaluate(element=>element===document.activeElement),false,'background composer is inert');
      if(name==='Paramètres'&&captures)await page.screenshot({path:path.join(captures,width+'-canae-settings.png')});
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Brouillon conservé pendant les fenêtres');
      assert.equal(await nav().getByRole('button',{name,exact:true}).evaluate(element=>element===document.activeElement),true,'focus returns to opener');
      await nav().getByRole('button',{name,exact:true}).click();await dialog.waitFor();await page.waitForTimeout(170);
      const bounds=await dialog.boundingBox();assert(bounds);const inside={x:bounds.x+bounds.width/2,y:bounds.y+2};
      await page.mouse.click(inside.x,inside.y);assert.equal(await dialog.isVisible(),true,'inside click keeps popup open');
      await page.mouse.move(inside.x,inside.y);await page.mouse.down();await page.mouse.move(2,2);await page.mouse.up();assert.equal(await dialog.isVisible(),true,'drag from inside to outside keeps popup open');
      await page.mouse.click(2,2);await dialog.waitFor({state:'hidden'});assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Brouillon conservé pendant les fenêtres','outside click preserves draft');
    }
    assert.deepEqual(errors,[]);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push({width,centeredPopups:4,focusTrap:true,escapeAndFocusReturn:true,outsideClickCloses:true,insideAndDragPreserved:true,composerDraftPreserved:true,homeBranding:true,duplicateSettingsRemoved:true,pageErrors:0});
  }finally{await context.close();await fixture.app.close();assert(path.dirname(root)===path.resolve(os.tmpdir())&&path.basename(root).startsWith('canae-surfaces-'));await fs.rm(root,{recursive:true,force:true});}
}console.log(JSON.stringify({mode:'real-http-native-dialog-synthetic-services',results},null,2));}finally{await browser.close();}
