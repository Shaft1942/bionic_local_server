// Real browser and companion APIs; all projects, files, model and images are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_PROJECT, PROTOTYPE_MODEL, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({headless:true,channel:process.env.BIONIC_BROWSER_CHANNEL||'chrome'}), results=[];
const captures=process.env.BIONIC_BROWSER_CAPTURES;if(captures)await fs.mkdir(captures,{recursive:true});
const until=async(predicate,label)=>{const deadline=Date.now()+30000;while(Date.now()<deadline){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Timed out: '+label);};
try{
 for(const width of [1280,390]){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'llama-conservation-'));
  const fixture=await createPrototype({root,port:0,publicDirectory:process.env.BIONIC_BROWSER_PUBLIC_DIR,modelDelayMs:2500,imageDelayMs:600});
  const historyId='web-'+randomUUID();
  await fixture.app.persistChat({id:historyId,projectId:PROTOTYPE_PROJECT,name:'Historique long synthétique',source:'web',model:PROTOTYPE_MODEL,updatedAt:1,queue:[],messages:Array.from({length:205},(_,index)=>({id:'history-'+index,role:index%2?'assistant':'user',text:'Message historique synthétique '+index,createdAt:index+1}))});
  const context=await browser.newContext({locale:'fr-FR',viewport:{width,height:900}}),page=await context.newPage(),errors=[],posts=[];
  page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname==='/api/chat')posts.push(request.postDataJSON());});
  const navigation=()=>page.getByRole('navigation',{name:'Espace du projet',exact:true});
  const openSidebar=async()=>{if(await page.locator('dialog[open]').count())await page.getByRole('button',{name:'Fermer la fenêtre',exact:true}).click();const button=page.getByRole('button',{name:'Ouvrir la navigation',exact:true});if(await button.isVisible())await button.click();};
  const closeSidebar=async()=>{if(width<760){const button=page.getByRole('button',{name:'Fermer la navigation',exact:true});if(await button.isVisible())try{await button.click({timeout:1000});}catch(error){if(await button.isVisible())throw error;}}};
  const tools=page.locator('#chat-tools-options');
  const openMenu=async name=>{const panel=page.locator(name==='files'?'#chat-file-options':'#chat-tools-options');if(!await panel.evaluate(element=>element.matches(':popover-open')))await page.locator('[data-composer-menu="'+name+'"]').click();await panel.waitFor({state:'visible'});};
  const projectChats=page.locator('.project-group[data-project-id="'+PROTOTYPE_PROJECT+'"] .project-conversations');
  try{
   await page.goto(fixture.baseUrl);await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);await page.getByRole('button',{name:'Se connecter',exact:true}).click();await navigation().waitFor();await closeSidebar();
   await openSidebar();await projectChats.getByRole('button',{name:'Historique long synthétique',exact:true}).click();
   await page.getByRole('button',{name:'Charger les messages précédents',exact:true}).waitFor();assert.equal(await page.locator('.chat-message').count(),100);
   await page.getByRole('button',{name:'Charger les messages précédents',exact:true}).click();await until(async()=>await page.locator('.chat-message').count()===200,'older history');
   await page.getByRole('button',{name:'Charger les messages précédents',exact:true}).click();await until(async()=>await page.locator('.chat-message').count()===205,'oldest history');
   assert.equal(await page.locator('#message-history-0').count(),1);
   await openSidebar();await page.getByRole('button',{name:'Replier le projet Atelier de démonstration',exact:true}).click();assert.equal(await projectChats.isVisible(),false);
   assert.equal(await page.getByRole('navigation',{name:'Conversations sans projet',exact:true}).isVisible(),true,'Collapsing a project does not hide unassigned conversations');
   await page.getByRole('button',{name:'Nouveau chat dans Atelier de démonstration',exact:true}).click();await closeSidebar();
   await openMenu('tools');assert.equal(await tools.getByLabel('Recherche web',{exact:true}).isChecked(),true);assert.equal(await tools.getByLabel('Génération d’images',{exact:true}).isChecked(),true);
   await openMenu('files');await page.getByRole('combobox',{name:'Droits sur les fichiers',exact:true}).selectOption('none');await openMenu('tools');await tools.getByLabel('Génération d’images',{exact:true}).uncheck();
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('Premier message de la file '+width);await page.getByRole('button',{name:'Envoyer',exact:true}).click();await page.getByRole('article',{name:'Votre message',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('Second message de la file '+width);await openMenu('tools');await tools.getByLabel('Recherche web',{exact:true}).uncheck();await page.getByRole('button',{name:'Envoyer',exact:true}).click();
   await until(()=>posts.length===2,'two accepted submissions');assert.equal(posts[0].webAccess,true);assert.equal(posts[1].webAccess,false);assert.equal(posts[1].sessionId,posts[0].sessionId||((await fixture.app.webChats(PROTOTYPE_PROJECT)).find(chat=>chat.name.startsWith('Premier message'))?.id));
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('Brouillon conservé '+width);await openMenu('tools');await tools.getByLabel('Scripts avec approbation',{exact:true}).check();
   await openSidebar();await page.getByRole('button',{name:'Nouveau chat dans Second projet',exact:true}).click();await closeSidebar();
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('Brouillon second projet');
   await openSidebar();await page.locator('.project-list').getByRole('button',{name:'Atelier de démonstration',exact:true}).click();await projectChats.waitFor();
   await projectChats.getByRole('button',{name:'Premier message de la file '+width,exact:true}).click();
   await until(async()=>await page.getByRole('textbox',{name:'Message',exact:true}).inputValue()==='Brouillon conservé '+width,'draft restored after conversation load');
   await openMenu('tools');assert.equal(await tools.getByLabel('Recherche web',{exact:true}).isChecked(),false);assert.equal(await tools.getByLabel('Scripts avec approbation',{exact:true}).isChecked(),true);
   await page.reload();await navigation().waitFor();await closeSidebar();await until(async()=>await page.getByRole('textbox',{name:'Message',exact:true}).inputValue()==='Brouillon conservé '+width,'draft restored after reload');
   await until(async()=>{const chats=await fixture.app.webChats(PROTOTYPE_PROJECT),chat=chats.find(item=>item.name.startsWith('Premier message'));return chat&&(await fixture.app.readWeb(chat.id)).messages.length===4&&!fixture.app.chatStates.get(chat.id)?.running;},'FIFO completed');
   assert.equal(posts.length,2,'navigation/reload never resubmits');assert.equal(fixture.stats.modelCalls,2);
   await openSidebar();await page.getByRole('button',{name:'Nouveau chat dans Atelier de démonstration',exact:true}).click();await closeSidebar();
   await openMenu('tools');await tools.getByLabel('Génération d’images',{exact:true}).check();await tools.getByRole('spinbutton',{name:'Nombre d’images',exact:true}).fill('5');await tools.getByRole('combobox',{name:'Politique mémoire des images',exact:true}).selectOption('keep');
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('IMAGE_FIXTURE série de cinq images '+width);await page.getByRole('button',{name:'Envoyer',exact:true}).click();
   await until(()=>fixture.stats.promptPosts===5,'five image jobs');assert.equal(posts.length,3);assert.equal(posts[2].imageCount,5);assert.equal(posts[2].imageAccess,true);
   await page.reload();await navigation().waitFor();await closeSidebar();await navigation().getByRole('button',{name:'Images',exact:true}).click();
   await until(async()=>await page.locator('.gallery-item').count()===5,'gallery five');await until(async()=>await page.locator('.job').count()===5,'tracking retains all five');
   assert.equal(fixture.stats.promptPosts,5);assert.equal(fixture.stats.toolCalls.filter(name=>name==='generate_comfy_image_series').length,1);
   const zipLink=page.locator('a[download][href^="/api/comfy/images.zip?"]'),zipURL=await zipLink.getAttribute('href');const zipResponse=await context.request.get(fixture.baseUrl+zipURL);assert.equal(zipResponse.status(),200,zipResponse.status()===200?'ZIP ready':await zipResponse.text());assert((await zipResponse.body()).length>5000);
   const download=await Promise.all([page.waitForEvent('download'),zipLink.click()]);const downloaded=await download[0].path();assert((await fs.stat(downloaded)).size>5000);
   await openSidebar();await page.getByRole('button',{name:'Nouveau chat dans Atelier de démonstration',exact:true}).click();await closeSidebar();
   await page.route('**/api/chat',route=>route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Admission synthétique refusée avant acceptation.'})}));
   await page.getByRole('textbox',{name:'Message',exact:true}).fill('Refus avant acceptation');await page.getByRole('button',{name:'Envoyer',exact:true}).click();
   await page.getByRole('alert').getByText('Admission synthétique refusée avant acceptation.',{exact:true}).waitFor();
   await until(async()=>await page.getByRole('textbox',{name:'Message',exact:true}).inputValue()==='Refus avant acceptation','409 restores draft');assert.equal(await page.getByRole('button',{name:'Envoyer',exact:true}).isEnabled(),true);await page.unroute('**/api/chat');
   const modelCallsBeforeCancel=fixture.stats.modelCalls;await page.getByRole('textbox',{name:'Message',exact:true}).fill('Annulation synthétique');await page.getByRole('button',{name:'Envoyer',exact:true}).click();await page.getByRole('article',{name:'Votre message',exact:true}).waitFor();await page.getByRole('button',{name:'Arrêter la demande',exact:true}).click();
   await until(async()=>{const sessions=await fixture.app.webChats(PROTOTYPE_PROJECT),target=sessions.find(item=>item.name==='Annulation synthétique');if(!target)return false;const value=await fixture.app.readWeb(target.id);return value.messages.some(item=>item.role==='assistant'&&item.outcome==='stopped');},'explicit cancellation');assert.equal(fixture.stats.modelCalls,modelCallsBeforeCancel+1);
   const interruptedRequest=randomUUID().replaceAll('-',''),ping=await (await context.request.get(fixture.baseUrl+'/api/ping')).json();
   await page.route('**/api/chat-request?**',async route=>{if(new URL(route.request().url()).searchParams.get('requestId')!==interruptedRequest)return route.continue();await route.fulfill({contentType:'application/json',body:JSON.stringify({id:historyId,status:'interrupted',message:'Interrompu après reprise synthétique.'})});});
   await page.evaluate(({key,job,id})=>{const saved=JSON.parse(localStorage.getItem(key)||'{}');saved.jobs=[job];saved.chatId=id;localStorage.setItem(key,JSON.stringify(saved));},{key:'bionic:llama-prototype:'+ping.instanceId,job:{requestId:interruptedRequest,projectId:PROTOTYPE_PROJECT,id:historyId,status:'queued'},id:historyId});
   const countBeforeReload=posts.length;await page.reload();await navigation().waitFor();await closeSidebar();await until(async()=>await page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'{}').jobs?.length===0,'bionic:llama-prototype:'+ping.instanceId),'interrupted receipt releases tracking');assert.equal(posts.length,countBeforeReload);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal overflow');assert.deepEqual(errors,[]);
   if(captures)await page.screenshot({path:path.join(captures,width+'-five-images.png')});
   results.push({width,historyMessages:205,fifoRequests:2,draftAndPermissionsRestored:true,projectShortcut:true,collapsedProject:true,imageCount:5,imageToolCalls:1,zipDownloaded:true,rejectedBeforeAcceptance:true,cancelled:true,interruptedRecovered:true,postCount:posts.length,pageErrors:errors.length});
  }catch(error){if(captures)await page.screenshot({path:path.join(captures,width+'-conservation-failure.png')});throw error;}
  finally{await context.close();await fixture.app.close();assert(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('llama-conservation-'));await fs.rm(root,{recursive:true,force:true});}
 }
 console.log(JSON.stringify({mode:'real-browser-real-http-synthetic-engines',results},null,2));
}finally{await browser.close();}
