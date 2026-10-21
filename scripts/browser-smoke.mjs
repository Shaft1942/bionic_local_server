// Development-only: two synthetic journeys, no Bionic, model, port or real project.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
let playwright;
try { playwright=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright'); }
catch { throw Error('Dépendance de développement manquante : npm install --include=dev puis npx playwright install chromium. Aucun navigateur requis pour utiliser l’application.'); }
const browser=await playwright.chromium.launch({headless:true,...(process.env.BIONIC_BROWSER_CHANNEL?{channel:process.env.BIONIC_BROWSER_CHANNEL}:{})});
const captures=process.env.BIONIC_SMOKE_SCREENSHOTS;if(captures)await fs.mkdir(captures,{recursive:true});
const results=[];const origin='http://bionic.test', projectId='synthetic-project';
const model={id:'synthetic-model',name:'Modèle de test',type:'llm',tools:true,loaded:true,loadedInstances:[],reasoning:{allowedOptions:['low','medium','high'],default:'medium'}};
function fixture(approval=false) {
 const chats=new Map(),requests=new Map();let counter=0,decisions=0;const now=Date.now();
 if(approval)chats.set('web-11111111-1111-4111-8111-111111111111',{id:'web-11111111-1111-4111-8111-111111111111',projectId,name:'Validation synthétique',source:'web',updatedAt:now,fileProfile:'none',scriptAccess:true,generation:{status:'running',replyId:'22222222-2222-4222-8222-222222222222',requestId:'synthetic-approval-request',awaitingApproval:true},messages:[{id:'22222222-2222-4222-8222-222222222222',role:'assistant',text:'Script proposé.',approvals:[{id:'33333333-3333-4333-8333-333333333333',projectId,chatId:'web-11111111-1111-4111-8111-111111111111',kind:'script',runtime:'python',code:'print("synthetic only")',directory:'',status:'pending',createdAt:now,expiresAt:now+600000}]}]});
 async function respond(url,method,input) {
  if(url.pathname==='/api/ping')return {app:'bionic-mobile-local',version:'1.8.0',instanceId:'44444444-4444-4444-8444-444444444444'};
  if(url.pathname==='/api/status')return {ok:true,models:[model],addresses:[]};
  if(url.pathname==='/api/projects')return {projects:[{id:projectId,name:'Projet fictif',sessionsCount:chats.size}]};
  if(url.pathname==='/api/sessions')return {sessions:[...chats.values()].map(({messages,...chat})=>chat),warnings:[],partial:false};
  if(url.pathname==='/api/conversation')return chats.get(url.searchParams.get('id'))||{error:'Conversation inconnue.'};
  if(url.pathname==='/api/activity')return {events:[],truncated:false,warnings:[]};
  if(url.pathname==='/api/chat-request')return requests.get(url.searchParams.get('requestId'))||{id:'web-11111111-1111-4111-8111-111111111111',status:chats.get('web-11111111-1111-4111-8111-111111111111')?.generation?.status||'running',projectId};
  if(url.pathname==='/api/chat'){
   counter++;if(counter===1){assert.equal(input.fileProfile,'read');assert.equal(input.webAccess,true);assert.equal(input.webApproval,true);}const id=input.sessionId||'web-aaaaaaaa-aaaa-4aaa-8aaa-'+String(counter).padStart(12,'0');let chat=chats.get(id);
   if(!chat){chat={id,projectId,name:input.text,source:'web',updatedAt:Date.now(),fileProfile:input.fileProfile,messages:[],queue:[],generation:{status:'running',requestId:input.requestId,replyId:'reply-'+counter}};chats.set(id,chat);chat.messages.push({id:'user-'+counter,role:'user',text:input.text,requestId:input.requestId},{id:'reply-'+counter,role:'assistant',text:'Réponse synthétique en cours.',requestId:input.requestId});requests.set(input.requestId,{id,projectId,status:'running'});return {ndjson:[{type:'start',id,name:chat.name,requestId:input.requestId,replyId:'reply-'+counter,fileProfile:input.fileProfile},{type:'delta',text:'Réponse synthétique en cours.'}]};}
   chat.queue.push({...input,status:'queued'});requests.set(input.requestId,{id,projectId,status:'queued',position:chat.queue.length});return {ndjson:[{type:'queued',id,requestId:input.requestId,status:'queued',position:chat.queue.length}]};
  }
  if(url.pathname==='/api/tool-approval'){assert.equal(input.decision,'deny');decisions++;const chat=chats.get(input.chatId);chat.messages[0].approvals[0].status='denied';chat.generation={...chat.generation,status:'completed',awaitingApproval:false};return {id:input.id,status:'denied'};}
  if(url.pathname==='/api/logout')return {ok:true};
  return {error:'Route de fixture absente : '+url.pathname};
 }
 return {respond,get sends(){return counter;},get decisions(){return decisions;}};
}
try {
 for(const width of [1280,320])for(const journey of ['queue-draft','approval-denial']){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();page.setDefaultTimeout(4000);const api=fixture(journey==='approval-denial'),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{const request=route.request(),url=new URL(request.url());if(url.origin!==origin)return route.abort();if(url.pathname.startsWith('/api/')){const input=request.postData()?JSON.parse(request.postData()):null;const result=await api.respond(url,request.method(),input);return route.fulfill({status:result.error?404:200,contentType:result.ndjson?'application/x-ndjson':'application/json',body:result.ndjson?result.ndjson.map(x=>JSON.stringify(x)+'\n').join(''):JSON.stringify(result)});}const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!/^[a-z0-9.-]+$/i.test(relative))return route.abort();let source=await fs.readFile(path.join(root,'public',relative));if(process.env.BIONIC_SMOKE_BREAK_SEND==='1'&&relative==='app.js')source=Buffer.from(source.toString().replace("$('composer').addEventListener('submit', send);","$('composer').addEventListener('submit', event=>event.preventDefault());"));return route.fulfill({contentType:relative.endsWith('.js')?'text/javascript':relative.endsWith('.css')?'text/css':relative.endsWith('.html')?'text/html':relative.endsWith('.svg')?'image/svg+xml':'application/json',body:source});});
  const start=performance.now();await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});
  if(journey==='queue-draft'){
   await page.locator('#new-chat').click();await page.locator('#prompt').fill('Premier message fictif');
   assert.equal(await page.locator('#composer-files').getAttribute('open'),null);
   await page.locator('#files-menu-toggle').click();if(captures)await page.screenshot({path:path.join(captures,width+'-tools-open.png')});await page.locator('#agent-files').selectOption('read');await page.locator('#agent-web').check();await page.locator('#agent-web-approval').check();await page.locator('#agent-web-approval').press('Escape');
   assert.equal(await page.locator('#composer-files').getAttribute('open'),null);assert.equal(await page.evaluate(()=>document.activeElement.id),'files-menu-toggle');assert.equal(await page.locator('#prompt').inputValue(),'Premier message fictif');
   await page.locator('#files-menu-toggle').click();await page.locator('#prompt').click();assert.equal(await page.locator('#composer-files').getAttribute('open'),null);
   if(width===1280){await page.locator('#files-menu-toggle').click();await page.locator('#agent-files').focus();await page.setViewportSize({width:700,height:900});await page.waitForFunction(()=>!document.querySelector('#composer-files').open&&document.activeElement.id==='files-menu-toggle');await page.setViewportSize({width,height:900});}
   await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#send').getAttribute('aria-label')==='Ajouter à la file');assert.equal(api.sends,1);
   await page.locator('#prompt').fill('Deuxième message fictif');await page.locator('#send').click();await page.waitForFunction(()=>document.querySelector('#messages').textContent.includes('Deuxième message fictif'));assert.equal(api.sends,2);
   if(width===320)await page.locator('#back').click();await page.locator('#new-chat').click();await page.locator('#prompt').fill('Brouillon indépendant');
   if(width===320)await page.locator('#back').click();const session=page.locator('.session').first();await session.focus();await page.evaluate(()=>renderSessions());assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('session')),true);await session.click();
   assert.equal(await page.locator('#prompt').inputValue(),'');if(width===320)await page.locator('#back').click();await page.locator('#new-chat').click();assert.equal(await page.locator('#prompt').inputValue(),'Brouillon indépendant');assert.equal(api.sends,2);
   await page.locator('#conversation-options-toggle').click();await page.getByText('Brouillons sur cet appareil',{exact:true}).click();await page.locator('#draft-duration').selectOption('3600000');
   const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(origin);await other.locator('#app').waitFor({state:'visible'});await other.waitForFunction(()=>document.querySelector('#project').options.length>0);if(width===320&&await other.locator('#back').isVisible())await other.locator('#back').click();await other.locator('#new-chat').click();await other.waitForFunction(()=>document.querySelector('#prompt').value==='Brouillon indépendant');
   await page.locator('#draft-clear').click();await other.waitForFunction(()=>document.querySelector('#prompt').value==='');await other.locator('#prompt').fill('Nouveau brouillon éphémère');assert.equal(await other.locator('#prompt').inputValue(),'Nouveau brouillon éphémère');assert.equal(await other.evaluate(()=>JSON.stringify([...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i)))).includes('Nouveau brouillon éphémère')),false);await other.close();await page.locator('#conversation-options-toggle').click();await page.locator('#prompt').fill('Brouillon après effacement');
  }else{
   const session=page.locator('.session').first();await session.waitFor();assert((await session.textContent()).includes('À valider'));await session.click();await page.locator('.tool-approval').waitFor();assert((await page.locator('.tool-approval').textContent()).includes('droits de ton compte'));
   assert.equal(await page.evaluate(()=>{const observer=new MutationObserver(()=>{});observer.observe(document.querySelector('#composer-activity'),{childList:true,subtree:true,characterData:true});setSending();setSending();setSending();const changes=observer.takeRecords().length;observer.disconnect();return changes;}),0,'identical approval polling must not mutate the live region');
   await page.getByRole('button',{name:'Refuser',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.tool-approval')?.textContent.includes('Refusé'));assert.equal(api.decisions,1);assert.equal(api.sends,0);
   const extras=page.locator('.message.assistant>.message-extras');assert.equal(await extras.getAttribute('open'),null);await page.locator('.tool-approval').waitFor({state:'visible'});assert.equal(await page.locator('.context-receipt').isVisible(),false);
   await extras.locator('>summary').click();await page.getByText('Contexte utilisé',{exact:true}).click();await page.getByText('Conserver comme livrable',{exact:true}).click();const title=page.getByLabel('Titre dans les livrables');await title.fill('Titre synthétique conservé');await page.evaluate(()=>renderChat());assert.equal(await title.inputValue(),'Titre synthétique conservé');assert.equal(await extras.getAttribute('open'),'');assert.equal(await page.locator('.context-receipt').getAttribute('open'),'');await title.press('Escape');assert.equal(await extras.getAttribute('open'),null);assert.equal(await page.evaluate(()=>document.activeElement?.parentElement?.className),'message-extras');
  }
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+journey+' '+width);assert.deepEqual(errors,[]);
  if(captures)await page.screenshot({path:path.join(captures,width+'-'+journey+'.png')});results.push({journey,width,passed:true,durationMs:Math.round(performance.now()-start)});await context.close();
 }
 console.log(JSON.stringify({mode:'synthetic browser only',results,limitations:['Viewport simulé : pas un téléphone, lecteur d’écran ou réseau Wi-Fi réel.','Pas de validation de modèle, scripts PC ou compatibilité Bionic réelle.']},null,2));
}finally{await browser.close();}
