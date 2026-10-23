// Synthetic browser verification. Every request is intercepted; no listener, real endpoint or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const output=process.env.BIONIC_SMOKE_SCREENSHOTS||fileURLToPath(new URL('../../captures/',import.meta.url)),root=fileURLToPath(new URL('../public/',import.meta.url));
await fs.mkdir(output,{recursive:true});
const origin='http://bionic.test',projectId='synthetic-actions',chatId='web-11111111-1111-4111-8111-111111111111',messageId='images-message';
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{for(const width of [1280,390]){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<400}),page=await context.newPage(),errors=[],calls=[];
 page.setDefaultTimeout(7000);page.on('pageerror',error=>errors.push(error.message));
 const model={id:'synthetic-gemma',name:'Gemma synthétique',tools:true,type:'llm',loaded:true,loadedInstances:[],contextLength:8192,reasoning:{allowedOptions:['on','off'],default:'off'}};
 const base={width:832,height:1216,workflowId:'krea2_turbo',modelPolicy:'keep',seed:4242,prompt:'A blue bicycle beside a stone wall.',createdAt:Date.now()};
 const jobs=[{...base,id:'local-queued',status:'queued',queuedLocally:true,promptId:null,seriesId:'series',seriesIndex:3,seriesTotal:3,queuePosition:2},{...base,id:'submitted',status:'running',queuedLocally:false,promptId:'comfy-submitted',seriesId:'series',seriesIndex:2,seriesTotal:3},{...base,id:'ready',status:'succeeded',image:{width:832,height:1216},executionDurationMs:22000,seriesId:'series',seriesIndex:1,seriesTotal:3}];
 const chat={id:chatId,projectId,name:'Série vélo synthétique',source:'web',model:model.id,imageAccess:true,imageCount:3,imageModelPolicy:null,updatedAt:Date.now(),messages:[{id:messageId,role:'assistant',text:'La série est suivie dans la file commune.',imageGenerations:jobs}]};
 const catalogue=Array.from({length:22},(_,i)=>({...base,id:'catalogue-'+i,status:'succeeded',image:{width:832,height:1216},prompt:'Synthetic neutral image '+(i+1),seed:100+i,owner:{projectId,chatId:i%2?'deleted-source-chat':chatId,messageId:'source-'+i}}));
 const accepted=new Map();let lostReply=true;
 async function respond(url,input){
  calls.push({path:url.pathname,query:url.search,input});
  if(url.pathname==='/api/status')return {ok:true,models:[model],addresses:[]};
  if(url.pathname==='/api/ping')return {app:'bionic-mobile-local',version:'2.5.0-beta.1',instanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
  if(url.pathname==='/api/updates')return {currentVersion:'2.5.0-beta.1',enabled:true,candidate:null,installation:{status:'idle'}};
  if(url.pathname==='/api/projects')return {projects:[{id:projectId,name:'Projet synthétique actions images',sessionsCount:1}]};
  if(url.pathname==='/api/sessions')return {sessions:[Object.fromEntries(Object.entries(chat).filter(([key])=>key!=='messages'))],warnings:[],partial:false};
  if(url.pathname==='/api/conversation'){assert.equal(url.searchParams.get('id'),chatId);return chat;}
  if(url.pathname==='/api/activity')return {events:[],warnings:[]};
  if(url.pathname==='/api/comfy/settings')return {enabled:true,url:'http://comfy.test',workflowId:'krea2_turbo',modelPolicy:'keep',memoryCleanup:true,loraProfiles:{krea2_turbo:[]},workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};
  if(url.pathname==='/api/comfy/loras')return {loras:[]};
  if(url.pathname==='/api/model-preferences')return {source:'auto',automatic:true,maxOutputTokens:2048,contextLength:8192};
  if(url.pathname==='/api/capabilities')return {items:[]};
  if(url.pathname==='/api/deliverables')return {deliverables:[]};
  if(url.pathname==='/api/comfy/generation')return chat.messages.flatMap(message=>message.imageGenerations||[]).find(job=>job.id===url.searchParams.get('jobId'));
  if(url.pathname==='/api/comfy/generation/cancel'){
   assert.deepEqual(input,{projectId,chatId,messageId,jobId:'local-queued'});Object.assign(jobs[0],{status:'cancelled',queuedLocally:false});return jobs[0];
  }
  if(url.pathname==='/api/comfy/generation/retry'){
   assert.equal(input.projectId,projectId);assert.equal(input.chatId,chatId);assert.equal(input.messageId,messageId);assert.equal(input.jobId,'ready');assert.match(input.requestId,/^[0-9a-f-]{36}$/i);assert(['same','new'].includes(input.seedMode));
   let result=accepted.get(input.requestId);if(!result){const serial=accepted.size+1,job={...base,id:'retry-'+serial,status:'queued',queuedLocally:true,seed:input.seedMode==='same'?4242:9000+serial},message={id:'retry-message-'+serial,role:'assistant',text:'Image relancée.',imageGenerations:[job]};result={job,chatId,messageId:message.id,message};accepted.set(input.requestId,result);chat.messages.push(message);}
   if(lostReply){lostReply=false;return {httpError:502,error:'Réponse perdue après admission synthétique'};}return result;
  }
  if(url.pathname==='/api/comfy/generations'){assert.equal(url.searchParams.get('projectId'),projectId);const second=url.searchParams.get('cursor')==='page-2';return {images:second?catalogue.slice(12):catalogue.slice(0,12),total:22,nextCursor:second?null:'page-2'};}
  throw Error('Unexpected synthetic API route '+url.pathname);
 }
 await context.route('**/*',async route=>{try{
  const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin,'Every request must remain synthetic');
  if(['/api/comfy/image','/api/comfy/generation-image'].includes(url.pathname))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1216"><rect width="832" height="1216" fill="#dce4ea"/><circle cx="275" cy="810" r="125" fill="none" stroke="#2869aa" stroke-width="18"/><circle cx="570" cy="810" r="125" fill="none" stroke="#2869aa" stroke-width="18"/><path d="M275 810L410 570 570 810 350 810 470 650" fill="none" stroke="#2869aa" stroke-width="16"/></svg>'});
  if(url.pathname.startsWith('/api/')){const value=await respond(url,request.postData()?JSON.parse(request.postData()):null);return route.fulfill({status:value?.httpError||200,contentType:'application/json',body:JSON.stringify(value?.httpError?{error:value.error}:value??{})});}
  const file=url.pathname==='/'?'index.html':url.pathname.slice(1);assert.match(file,/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components)\.js|[a-z0-9.-]+)$/i);return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html',body:await fs.readFile(path.join(root,file))});
 }catch(error){errors.push(error.message);await route.abort();}});
 await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});await page.locator('.session[data-session-id="'+chatId+'"]').click();
 const source=page.locator('[data-image-job-id="ready"]');await source.waitFor();assert.equal(await page.locator('.generated-image').count(),3);assert.equal(await page.getByRole('button',{name:'Annuler cette image',exact:true}).count(),1);assert.equal(await page.locator('[data-image-job-id="submitted"]').getByRole('button',{name:'Annuler cette image'}).count(),0);
 const seriesZip=page.getByRole('link',{name:'Télécharger les images disponibles (ZIP)',exact:true}).first();assert.deepEqual(new URL(await seriesZip.getAttribute('href'),origin).searchParams.getAll('jobId'),['ready']);
 await page.getByRole('button',{name:'Annuler cette image',exact:true}).click();await page.locator('[data-image-job-id="local-queued"] .generated-image-status').filter({hasText:'annulée'}).waitFor();assert.equal(calls.filter(call=>call.path.endsWith('/cancel')).length,1);
 await source.getByRole('button',{name:'Relancer · même seed',exact:true}).click();await source.getByText(/Réessayer conservera le même identifiant/).waitFor();await source.getByRole('button',{name:'Relancer · même seed',exact:true}).click();await page.locator('[data-image-job-id="retry-1"]').waitFor();
 let retries=calls.filter(call=>call.path.endsWith('/retry'));assert.equal(retries.length,2);assert.equal(retries[0].input.requestId,retries[1].input.requestId);assert.equal(accepted.size,1);assert.equal(await page.locator('[data-message-id="retry-message-1"]').count(),1);assert.equal(jobs[2].status,'succeeded');assert.equal(jobs[2].seed,4242);
 await source.getByRole('button',{name:'Relancer · nouvelle seed',exact:true}).click();await page.locator('[data-image-job-id="retry-2"]').waitFor();retries=calls.filter(call=>call.path.endsWith('/retry'));assert.equal(retries[2].input.seedMode,'new');assert.notEqual(retries[2].input.requestId,retries[0].input.requestId);assert.equal(accepted.size,2);assert.notEqual(accepted.get(retries[2].input.requestId).job.seed,4242);
 const preview=source.getByRole('button',{name:'Voir en grand',exact:true});await preview.click();await page.locator('#generated-image-preview').waitFor({state:'visible'});assert.equal(await page.locator('#generated-image-preview-close').evaluate(el=>el===document.activeElement),true);await page.screenshot({path:path.join(output,width+'-preview.png')});await page.keyboard.press('Escape');assert.equal(await page.locator('#generated-image-preview').isVisible(),false);assert.equal(await preview.evaluate(el=>el===document.activeElement),true);
 await source.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,width+'-conversation-actions.png')});
 if(width<400)await page.locator('#back').click();await page.locator('#deliverables-open-sidebar').click();await page.locator('#workspace-generations').click();await page.locator('#workspace-list .generated-image').first().waitFor();assert.equal(await page.locator('#workspace-list .generated-image').count(),12);assert.equal(await page.locator('#workspace-list').getByRole('button',{name:/Relancer|Annuler cette image/}).count(),0);
 let checkboxes=page.locator('#workspace-list .generated-image-select input');for(let index=0;index<3;index++)await checkboxes.nth(index).check();await page.locator('#workspace-images-more').click();await page.waitForFunction(()=>document.querySelectorAll('#workspace-list .generated-image').length===22);assert.equal(await page.locator('#workspace-images-more').count(),0);checkboxes=page.locator('#workspace-list .generated-image-select input');for(let index=0;index<3;index++)assert.equal(await checkboxes.nth(index).isChecked(),true);for(let index=3;index<20;index++)await checkboxes.nth(index).check();
 await checkboxes.nth(20).click();assert.equal(await checkboxes.nth(20).isChecked(),false);assert.match(await page.locator('#workspace-list .generated-image-error').textContent(),/20 images maximum/);const zip=page.getByRole('link',{name:'Télécharger la sélection ZIP',exact:true});assert.equal(new URL(await zip.getAttribute('href'),origin).searchParams.getAll('jobId').length,20);await checkboxes.nth(0).uncheck();await checkboxes.nth(20).check();assert.equal(new URL(await zip.getAttribute('href'),origin).searchParams.getAll('jobId').length,20);assert(new URL(await zip.getAttribute('href'),origin).searchParams.getAll('jobId').includes('catalogue-20'));
 const projectImage=page.locator('[data-image-job-id="catalogue-1"] img');assert.equal(new URL(await projectImage.getAttribute('src'),origin).pathname,'/api/comfy/generation-image');assert.equal(catalogue[1].owner.chatId,'deleted-source-chat');assert.equal(calls.filter(call=>call.path==='/api/conversation').length,1);
 await page.locator('#workspace-list').evaluate(el=>el.scrollIntoView());await page.locator('#workspace-view').evaluate(el=>el.scrollTop=0);await page.screenshot({path:path.join(output,width+'-project-generation.png')});
 await page.evaluate(()=>BionicI18n.setLanguage('en'));
 await page.getByRole('link',{name:'Download selected images as ZIP',exact:true}).waitFor();
 assert.equal(await page.locator('#workspace-list .generated-image').count(),22);
 assert.equal(new URL(await page.getByRole('link',{name:'Download selected images as ZIP',exact:true}).getAttribute('href'),origin).searchParams.getAll('jobId').length,20);
 assert.match(await page.locator('[data-image-job-id="catalogue-1"]').textContent(),/Prompt used/);
 await page.evaluate(()=>BionicI18n.setLanguage('fr'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.equal(calls.filter(call=>call.path==='/api/chat').length,0);
 results.push({width,strictLocalCancel:true,retryStableAfterLostReply:true,sourceUnchanged:true,newSeedExplicit:true,retryAssistantInserted:true,seriesZipReadyOnly:true,previewEscapeFocus:true,projectGalleryAcrossConversations:true,deletedSourceImageIndependent:true,paginationAll22:true,selectionPersistsPagination:true,zipLimit20:true,externalRequests:0,realEngineCalls:0,errors});await context.close();
}}finally{await browser.close();}
await fs.writeFile(path.join(output,'browser-actions-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
