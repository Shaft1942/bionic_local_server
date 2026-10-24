// Real HTTP, browser and synthetic model; no actual weights, GPU or user data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import { createPrototype,PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const browser=await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}),results=[];
const draft='  Brouillon exact — 中文 🌿\n\nDeuxième ligne.  \n';
try{for(const width of [1280,390,320])for(const language of ['fr','en']){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'beta10-toolbar-'));
  const fixture=await createPrototype({root,port:0,modelDelayMs:120000,publicDirectory:process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(source,'public')});
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<760,reducedMotion:'reduce',acceptDownloads:true});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  const text=(fr,en)=>language==='fr'?fr:en,button=(fr,en)=>page.getByRole('button',{name:text(fr,en),exact:true});
  const errors=[],csp=[],posts=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',item=>{if(/content.security.policy|violates the following/i.test(item.text()))csp.push(item.text());});
  page.on('request',request=>{if(request.method()==='POST')posts.push({path:new URL(request.url()).pathname,body:request.postDataJSON()});});
  const menu=(kind)=>page.locator(`[data-composer-menu="${kind}"]`),panel=(kind)=>page.locator(kind==='files'?'#chat-file-options':'#chat-tools-options');
  const open=async kind=>{if(!await panel(kind).evaluate(element=>element.matches(':popover-open')))await menu(kind).click();await page.waitForFunction(selector=>document.querySelector(selector)?.matches(':popover-open'),kind==='files'?'#chat-file-options':'#chat-tools-options');};
  const closed=async kind=>page.waitForFunction(selector=>!document.querySelector(selector)?.matches(':popover-open'),kind==='files'?'#chat-file-options':'#chat-tools-options');
  const geometry=async()=>{
    const first=await page.locator('.inference-controls').boundingBox(),second=await page.locator('.composer-toolbar').boundingBox();assert(first.height<=44&&second.height<=44,'Commands occupy exactly two 44px rows');
    assert(second.y>=first.y+first.height&&second.y-first.y-first.height<=1,'Rows remain adjacent');
    for(const control of [page.locator('#chat-engine'),page.getByRole('combobox',{name:text('Modèle','Model'),exact:true}),page.locator('#chat-reasoning'),...await page.locator('.composer-toolbar button').filter({visible:true}).all()]){
      const box=await control.boundingBox();assert(box.height>=44&&box.width>=44,'Every direct control retains a 44px target');assert(box.x>=second.x-1&&box.x+box.width<=second.x+second.width+1,'Direct controls stay within composer width');
    }
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    return{first:first.height,second:second.height};
  };
  try{
    await page.goto(fixture.baseUrl);await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();
    await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();
    const ping=await(await context.request.get(fixture.baseUrl+'/api/ping')).json();await page.evaluate(({instanceId,language})=>localStorage.setItem('bionic:llama-preferences:'+instanceId,JSON.stringify({language})),{instanceId:ping.instanceId,language});await page.reload();
    const prompt=page.getByRole('textbox',{name:'Message',exact:true});await prompt.waitFor();const baseline=await prompt.boundingBox();assert(baseline.height>=68,'Writing area keeps its original minimum height');
    const multiline=Array.from({length:8},(_,index)=>'Ligne de rédaction '+index+' — texte conservé.').join('\n');await prompt.fill(multiline);await page.waitForFunction(height=>document.querySelector('#prompt')?.getBoundingClientRect().height>height,baseline.height);const grown=await prompt.boundingBox();assert(grown.height>baseline.height);assert.equal(await prompt.inputValue(),multiline);await prompt.fill('');await page.waitForFunction(height=>document.querySelector('#prompt')?.getBoundingClientRect().height===height,baseline.height);
    const rows=await geometry(),chatCount=()=>posts.filter(item=>item.path==='/api/chat').length;
    await open('files');const permissions=page.getByRole('combobox',{name:text('Droits sur les fichiers','File permissions'),exact:true});assert.deepEqual(await permissions.locator('option').evaluateAll(options=>options.map(item=>item.value)),['none','read','write']);await permissions.selectOption('write');await page.keyboard.press('Escape');await closed('files');assert(await menu('files').evaluate(element=>element===document.activeElement));
    await open('files');await button('Joindre un fichier','Attach a file').click();await page.locator('.workspace-dialog[open]').waitFor();await closed('files');await page.keyboard.press('Escape');await page.locator('.workspace-dialog[open]').waitFor({state:'detached'});assert(await menu('files').evaluate(element=>element===document.activeElement));
    await open('tools');await page.getByRole('checkbox',{name:text('Recherche web','Web search'),exact:true}).uncheck();await page.getByRole('checkbox',{name:text('Scripts avec approbation','Scripts with approval'),exact:true}).uncheck();
    await page.getByRole('checkbox',{name:text('Génération d’images','Image generation'),exact:true}).check();
    for(const label of await panel('tools').locator('.tool-grid > label').all())assert((await label.boundingBox()).height>=44,'Tool option labels retain a 44px touch target');
    const toolsBox=await panel('tools').boundingBox(),writingBox=await prompt.boundingBox();assert(toolsBox.y+toolsBox.height<=writingBox.y-2,'The tools panel leaves the writing area uncovered');
    const workflow=page.getByRole('combobox',{name:text('Workflow du chat','Chat workflow'),exact:true}),policy=page.getByRole('combobox',{name:text('Politique mémoire des images','Image memory policy'),exact:true}),count=page.getByRole('spinbutton',{name:text('Nombre d’images','Image count'),exact:true});
    assert.equal(await workflow.locator('option').count(),2);assert.deepEqual(await policy.locator('option').evaluateAll(options=>options.map(item=>item.value)),['','keep','unload','alternate']);await policy.selectOption('keep');await count.fill('5');await page.keyboard.press('Escape');await closed('tools');assert(await menu('tools').evaluate(element=>element===document.activeElement));
    await prompt.fill(draft);await open('tools');assert.equal(await count.inputValue(),'5');await prompt.click();await closed('tools');assert(await prompt.evaluate(element=>element===document.activeElement));assert.equal(await prompt.inputValue(),draft);assert.equal(chatCount(),0,'Menus, focus and choices never submit a chat');
    const downloadWait=page.waitForEvent('download');await button('Télécharger le brouillon','Download draft').click();const download=await downloadWait;const filename=path.join(root,'downloaded-draft.txt');await download.saveAs(filename);assert.equal(await fs.readFile(filename,'utf8'),draft,'Draft download preserves Unicode, spaces and newlines');
    for(const value of ['0','6']){await open('tools');await count.fill(value);await page.keyboard.press('Escape');await closed('tools');await button('Envoyer','Send').click();await page.waitForFunction(()=>document.querySelector('#chat-tools-options')?.matches(':popover-open')&&document.activeElement?.id==='chat-image-count');assert.equal(chatCount(),0,'A hidden invalid image count reopens and blocks the send');}
    await count.fill('3');await page.keyboard.press('Escape');await closed('tools');await button('Envoyer','Send').click();const stop=button('Arrêter la demande','Stop request'),disconnect=button('Déconnecter le flux sans arrêter la demande','Disconnect stream without stopping request');await stop.waitFor();await disconnect.waitFor();assert.equal(chatCount(),1);assert.equal(posts.find(item=>item.path==='/api/chat').body.imageCount,3);assert.equal(posts.find(item=>item.path==='/api/chat').body.fileProfile,'write');
    const streamingRows=await geometry();assert.equal(await page.locator('.composer-toolbar button:visible').count(),6,'All six controls remain direct while streaming');
    await prompt.fill('Seconde demande conservée dans la file.');await button('Envoyer','Send').click();await page.waitForFunction(()=>document.querySelector('#prompt')?.value==='');assert.equal(chatCount(),2,'A second message can join the queue');assert.equal(fixture.stats.modelCalls,1,'The queued message has not started a second model concurrently');
    const cancels=posts.filter(item=>item.path==='/api/cancel').length;await disconnect.click();assert.equal(posts.filter(item=>item.path==='/api/cancel').length,cancels,'Disconnect is independent of cancellation');const stopped=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/cancel'&&response.request().method()==='POST');await stop.click();assert((await stopped).ok(),'The direct stop action is accepted by the server');assert.equal(posts.filter(item=>item.path==='/api/cancel').length,cancels+1);assert.equal(posts.at(-1).body.requestId,posts.find(item=>item.path==='/api/chat').body.requestId,'Stop targets the active request, not the queued message');
    assert.equal(fixture.stats.externalCalls,0);assert.deepEqual(errors,[]);assert.deepEqual(csp,[]);
    results.push({width,language,rows,streamingRows,textareaHeight:baseline.height,textareaGrownHeight:grown.height,autogrowPreserved:true,touchToolLabels:true,allOptions:true,menuFocusEscapeOutside:true,invalidCountClosedMenuBlocked:true,draftExact:true,queueSend:true,directStopAndDisconnect:true});
  }catch(error){console.error(JSON.stringify({width,language,posts,errors,csp,text:(await page.locator('body').innerText()).slice(-3500)}));throw error;}finally{await context.close();await fixture.app.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('beta10-toolbar-'));await fs.rm(root,{recursive:true,force:true});}
}console.log(JSON.stringify({ok:true,syntheticOnly:true,results},null,2));}finally{await browser.close();}
