// Real HTTP + server CSP. All projects, engines, ComfyUI and effects are owned fixtures.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE, PROTOTYPE_PROJECT } from '../lib/llama-ui-prototype.mjs';

const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'});
const captures=process.env.BIONIC_SMOKE_SCREENSHOTS,diagnose=process.argv.includes('--diagnose-only'),results=[];
if(captures)await fs.mkdir(captures,{recursive:true});
const computed=checkbox=>checkbox.evaluate(element=>{const css=getComputedStyle(element);return {checked:element.checked,appearance:css.appearance,backgroundImage:css.backgroundImage.startsWith('url(')?'url present':css.backgroundImage,backgroundColor:css.backgroundColor,color:css.color,borderColor:css.borderColor,accentColor:css.accentColor,pointerEvents:css.pointerEvents,width:css.width,height:css.height};});
async function imageSettings(page){await page.getByRole('navigation',{name:'Catégories des paramètres',exact:true}).getByRole('button',{name:'Serveurs du PC',exact:true}).click();await page.getByRole('navigation',{name:'Types de serveurs',exact:true}).getByRole('button',{name:'Génération d’images',exact:true}).click();}
async function openImages(page){await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Paramètres',exact:true}).click();await imageSettings(page);}
async function readyChat(page){await page.waitForFunction(()=>document.querySelector('.workspace-title')?.textContent?.includes('Atelier de démonstration'));}
async function openTools(page){const tools=page.locator('details.tool-options');if(await tools.getAttribute('open')===null)await tools.locator('summary').click();return tools;}
function watchErrors(page,errors,csp){page.on('pageerror',error=>errors.push(error.message));page.on('console',entry=>{if(/content.security.policy|violates the following|refused to (?:apply|load|execute)/i.test(entry.text()))csp.push(entry.text());});}
try{for(const width of [1280,390]){
  const fixtureRoot=await fs.mkdtemp(path.join(os.tmpdir(),'canae-controls-fixture-'));
  const fixture=await createPrototype({root:fixtureRoot,port:0});
  const colorScheme=width===390?'dark':'light';
  const context=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce',colorScheme}),page=await context.newPage(),errors=[],csp=[],writes=[];
  watchErrors(page,errors,csp);
  page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/comfy/settings')writes.push(request.postDataJSON());});
  try{
    const response=await page.goto(fixture.baseUrl+'/');const policy=response.headers()['content-security-policy'];
    const html=await response.text(),asset=html.match(/\/llama-ui\/assets\/[^"']+\.js/)?.[0],cssAsset=html.match(/\/llama-ui\/assets\/[^"']+\.css/)?.[0];
    assert.ok(policy.includes("style-src 'self'"));assert.equal(policy.includes("script-src 'unsafe-inline'"),false);
    await page.locator('#access-code').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await readyChat(page);
    let defaultsProof;
    if(!diagnose){
      const initial=await(await page.request.get(fixture.baseUrl+'/api/comfy/settings')).json();assert.equal(initial.enabled,true);assert.equal(initial.available,true);
      await openTools(page);const web=page.getByLabel('Recherche web',{exact:true}),images=page.getByLabel('Génération d’images',{exact:true});
      assert.equal(await web.isChecked(),true,'Fresh chat enables web search');assert.equal(await images.isChecked(),true,'Fresh chat enables available image tools');assert.equal(await images.isEnabled(),true);
      assert.notEqual((await computed(web)).appearance,'none');assert.notEqual((await computed(images)).appearance,'none');
      if(captures)await page.screenshot({path:path.join(captures,`${width}-chat-default-tools.png`)});
      await page.getByRole('textbox',{name:'Message',exact:true}).fill('Brouillon synthétique conservé sans envoi');await web.uncheck();await images.uncheck();
      await page.reload();await readyChat(page);await openTools(page);
      assert.equal(await web.isChecked(),false,'Explicit false web draft survives reload');assert.equal(await images.isChecked(),false,'Explicit false image draft survives reload');assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Brouillon synthétique conservé sans envoi');
      defaultsProof={freshWebEnabled:true,freshAvailableImagesEnabled:true,explicitFalseWebReload:true,explicitFalseImagesReload:true};
    }
    let workflowId;
    if(!diagnose){const initial=await(await page.request.get(fixture.baseUrl+'/api/comfy/settings')).json();workflowId=initial.workflowId;const configured=await page.request.post(fixture.baseUrl+'/api/comfy/settings',{data:{enabled:true,url:initial.url,workflowId,memoryCleanup:false,modelPolicy:'keep',loraProfiles:{...initial.loraProfiles,[workflowId]:[{name:'fixture-a.safetensors',strength:0.333333333},{name:'fixture-b.safetensors',strength:3.5}]}}});assert.equal(configured.ok(),true);}
    await openImages(page);const enabled=page.getByLabel('Activer ComfyUI',{exact:true});await enabled.waitFor();
    const before=await computed(enabled);
    if(captures&&!diagnose)await page.screenshot({path:path.join(captures,`${width}-controls-native-checked.png`)});
    await enabled.focus();await enabled.press('Space');assert.equal(await enabled.isChecked(),!before.checked,'Space toggles the real checkbox');
    const changed=await computed(enabled);
    if(captures)await page.screenshot({path:path.join(captures,`${width}-controls-${diagnose?'before':'after'}.png`)});
    await page.getByRole('button',{name:'Enregistrer les réglages images',exact:true}).click();await page.getByText('Réglages ComfyUI enregistrés.',{exact:true}).waitFor();assert.equal(writes.at(-1)?.enabled,!before.checked);
    const stored=await (await page.request.get(fixture.baseUrl+'/api/comfy/settings')).json();assert.equal(stored.enabled,!before.checked,'Server persisted the checked value');
    await page.reload();await openImages(page);assert.equal(await page.getByLabel('Activer ComfyUI',{exact:true}).isChecked(),!before.checked,'Reload restores persisted checked value');
    let sliderProof;
    if(!diagnose){
      assert.notEqual(changed.appearance,'none','Checkbox uses a native visible tick');assert.equal(changed.backgroundImage,'none','Checkbox has no data SVG image dependency');
      const first=page.getByLabel('Force 1',{exact:true}),second=page.getByLabel('Force 2',{exact:true});assert.equal(await first.inputValue(),'0.333333333','Initial precision is preserved');
      const slider=page.getByRole('slider',{name:'Curseur pour Force 1',exact:true});await slider.focus();await slider.press('Home');assert.equal(await first.inputValue(),'-2');await slider.press('ArrowRight');assert.equal(await first.inputValue(),'-1.95');await slider.press('End');assert.equal(await first.inputValue(),'20');
      await first.fill('0.333333333');await second.fill('3.5');await page.getByRole('button',{name:'Enregistrer les réglages images',exact:true}).click();await page.getByText('Réglages ComfyUI enregistrés.',{exact:true}).waitFor();
      const loraStored=await(await page.request.get(fixture.baseUrl+'/api/comfy/settings')).json();assert.equal(loraStored.loraProfiles[workflowId][0].strength,0.333333333);assert.equal(loraStored.loraProfiles[workflowId][1].strength,3.5);
      const count=writes.length;await second.fill('20.05');await page.getByRole('button',{name:'Enregistrer les réglages images',exact:true}).click();assert.equal(await second.evaluate(element=>element.validity.rangeOverflow),true);assert.equal(writes.length,count,'Invalid numeric value is refused before POST');await second.fill('3.5');
      if(captures)await page.screenshot({path:path.join(captures,`${width}-controls-lora-sliders.png`)});
      await page.reload();await openImages(page);assert.equal(await page.getByLabel('Force 1',{exact:true}).inputValue(),'0.333333333');assert.equal(await page.getByLabel('Force 2',{exact:true}).inputValue(),'3.5');
      await page.getByRole('navigation',{name:'Catégories des paramètres',exact:true}).getByRole('button',{name:'Conversation',exact:true}).click();await page.getByLabel('Plafond automatique',{exact:true}).uncheck();
      const budget=page.getByLabel('Maximum de tokens en sortie',{exact:true}),budgetSlider=page.getByRole('slider',{name:'Curseur pour Maximum de tokens en sortie',exact:true});
      assert.equal(await budgetSlider.getAttribute('max'),'1000','A five million token budget is not a five million step linear slider');assert.equal(await budgetSlider.getAttribute('aria-valuemax'),'5000000');
      await budgetSlider.focus();await budgetSlider.press('Home');assert.equal(await budget.inputValue(),'1');await budgetSlider.press('End');assert.equal(await budget.inputValue(),'5000000');await budget.fill('12345');await budgetSlider.focus();await budgetSlider.press('ArrowRight');const moved=Number(await budget.inputValue());assert.ok(moved>12345&&moved<14000,'One keyboard step provides useful precision at a common budget');await budget.fill('12345');
      await page.getByRole('button',{name:'Enregistrer le plafond',exact:true}).click();await page.getByText('Plafond de réponse enregistré.',{exact:true}).waitFor();const model=await page.getByLabel('Modèle à régler').inputValue();const output=await(await page.request.get(fixture.baseUrl+'/api/model-preferences?'+new URLSearchParams({model,projectId:PROTOTYPE_PROJECT}))).json();assert.equal(output.maxOutputTokens,12345);
      if(captures)await page.screenshot({path:path.join(captures,`${width}-controls-budget-slider.png`)});
      await page.reload();await page.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Paramètres',exact:true}).click();assert.equal(await page.getByLabel('Maximum de tokens en sortie',{exact:true}).inputValue(),'12345');
      const modal=page.getByRole('dialog',{name:'Paramètres',exact:true});await modal.waitFor();
      await imageSettings(modal);
      const address=modal.getByLabel('Adresse de ComfyUI',{exact:true});await address.fill('http://127.0.0.1:19996');
      await modal.getByRole('navigation',{name:'Catégories des paramètres',exact:true}).getByRole('button',{name:'Conversation',exact:true}).click();await imageSettings(modal);assert.equal(await address.inputValue(),'http://127.0.0.1:19996','Internal navigation keeps an unsaved settings draft');
      await modal.getByRole('navigation',{name:'Espace du projet',exact:true}).getByRole('button',{name:'Chat',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog[open]')),true,'Tab moves within the modal');await page.getByRole('textbox',{name:'Message',exact:true}).evaluate(element=>element.focus());assert.equal(await page.evaluate(()=>!!document.activeElement?.closest('dialog[open]')),true,'Native modal prevents background composer focus');
      await page.keyboard.press('Escape');await modal.waitFor({state:'hidden'});
      const focusReturned=await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')==='Paramètres'&&!document.activeElement.closest('dialog'));
      assert.equal(focusReturned,true,'Closing the native modal returns focus to its opener');
      assert.equal(await page.getByRole('textbox',{name:'Message',exact:true}).inputValue(),'Brouillon synthétique conservé sans envoi','Closing settings preserves the chat draft');
      await openImages(page);assert.equal(await address.inputValue(),'http://127.0.0.1:19996','Closing and reopening preserves an unsaved settings draft');await modal.getByRole('button',{name:'Annuler les modifications',exact:true}).click();
      const unavailable=await page.request.post(fixture.baseUrl+'/api/comfy/settings',{data:{enabled:true,url:'http://127.0.0.1:19997'}});assert.equal(unavailable.ok(),true);const unavailableSettings=await(await page.request.get(fixture.baseUrl+'/api/comfy/settings')).json();assert.equal(unavailableSettings.enabled,true);assert.equal(unavailableSettings.available,false,'Fixture transport rejects every non-synthetic endpoint without a network call');
      const freshContext=await browser.newContext({viewport:{width,height:900},locale:'fr-FR',reducedMotion:'reduce',colorScheme});try{const fresh=await freshContext.newPage();watchErrors(fresh,errors,csp);await fresh.goto(fixture.baseUrl+'/');await fresh.locator('#access-code').fill(PROTOTYPE_CODE);await fresh.getByRole('button',{name:'Se connecter',exact:true}).click();await readyChat(fresh);await openTools(fresh);assert.equal(await fresh.getByLabel('Recherche web',{exact:true}).isChecked(),true);assert.equal(await fresh.getByLabel('Génération d’images',{exact:true}).isChecked(),false,'Fresh chat does not activate unavailable image tools');assert.equal(await fresh.getByLabel('Génération d’images',{exact:true}).isDisabled(),true);if(captures)await fresh.screenshot({path:path.join(captures,`${width}-chat-unavailable-images.png`)});}finally{await freshContext.close();}
      defaultsProof={...defaultsProof,unavailableImagesDisabled:true,modalFocusContained:true,modalFocusReturned:true,chatDraftPreserved:true,settingsDraftPreserved:true};
      assert.equal(fixture.stats.modelCalls,0);assert.equal(fixture.stats.promptPosts,0);sliderProof={loraKeyboard:true,loraExactPrecision:true,loraOutsideRangeRefused:true,budgetLogScale:true,budgetKeyboard:true,budgetExactReload:true};
    }
    assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);results.push({width,colorScheme,asset,cssAsset,policy,before,changed,persisted:stored.enabled,...sliderProof,...defaultsProof,modelCalls:fixture.stats.modelCalls,promptPosts:fixture.stats.promptPosts,errors:errors.length,csp:csp.length});
  }finally{await context.close();await fixture.app.close();}
}}finally{await browser.close();}
console.log(JSON.stringify({ok:true,diagnose,realHTTP:true,syntheticServices:true,results},null,2));
