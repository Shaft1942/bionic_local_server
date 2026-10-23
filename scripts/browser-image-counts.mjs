// Entirely synthetic UI verification. No listener, real endpoint, engine or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=process.env.PLAYWRIGHT_MODULE_PATH?await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH,'index.mjs')).href):await import('playwright');
const output=process.env.BIONIC_SMOKE_SCREENSHOTS||fileURLToPath(new URL('../../captures/',import.meta.url)),root=fileURLToPath(new URL('../public/',import.meta.url));
await fs.mkdir(output,{recursive:true});
const origin='http://bionic.test',projectId='synthetic-image-counts',secondProject='synthetic-other-project',legacy='web-11111111-1111-4111-8111-111111111111',other='web-22222222-2222-4222-8222-222222222222';
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
try{
 for(const width of [1280,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<400}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(6000);page.on('pageerror',error=>errors.push(error.message));
  const model={id:'synthetic-qwen',name:'Qwen synthétique',tools:true,type:'llm',loaded:true,loadedInstances:[],contextLength:8192,reasoning:{allowedOptions:['on','off'],default:'on'}};
  let globalPolicy='keep',serial=0;const sends=[],requests=new Map();
  function images(amount,policy,seriesId){return Array.from({length:amount},(_,i)=>({id:seriesId+'-'+i,status:'succeeded',image:{width:832,height:1216},prompt:'A neutral scene number '+(i+1)+'.',seed:i+42,width:832,height:1216,workflowId:'krea2_turbo',modelPolicy:policy,...(amount>1?{seriesId,seriesTotal:amount,seriesIndex:i+1}:{})}));}
  const chats=new Map([[legacy,{id:legacy,projectId,name:'Historique trois images',source:'web',model:model.id,imageAccess:true,imageCount:3,updatedAt:Date.now(),messages:[{id:'historical-reply',role:'assistant',text:'Ancienne série conservée.',imageGenerations:images(3,'keep','historical')}]}],[other,{id:other,projectId,name:'Autre conversation',source:'web',model:model.id,imageAccess:true,imageCount:2,imageModelPolicy:'keep',updatedAt:Date.now(),messages:[]}]]);
  function comfy(){return {enabled:true,url:'http://comfy.test',workflowId:'krea2_turbo',modelPolicy:globalPolicy,memoryCleanup:true,loraProfiles:{krea2_turbo:[]},workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};}
  async function respond(url,input){
   if(url.pathname==='/api/status')return {ok:true,models:[model],addresses:[]};
   if(url.pathname==='/api/ping')return {app:'bionic-mobile-local',version:'2.5.0-beta.1',instanceId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'};
   if(url.pathname==='/api/updates')return {currentVersion:'2.4.1',enabled:true,candidate:null,installation:{status:'idle'}};
   if(url.pathname==='/api/projects')return {projects:[{id:projectId,name:'Projet synthétique images 1 à 5',sessionsCount:chats.size},{id:secondProject,name:'Autre projet synthétique',sessionsCount:0}]};
   if(url.pathname==='/api/sessions')return {sessions:[...chats.values()].filter(chat=>chat.projectId===url.searchParams.get('projectId')).map(({messages,...chat})=>chat),warnings:[],partial:false};
   if(url.pathname==='/api/conversation')return chats.get(url.searchParams.get('id'));
   if(url.pathname==='/api/chat-request')return requests.get(url.searchParams.get('requestId'));
   if(url.pathname==='/api/activity')return {events:[],warnings:[]};
   if(url.pathname==='/api/comfy/settings')return comfy();
   if(url.pathname==='/api/comfy/loras')return {loras:[]};
   if(url.pathname==='/api/model-preferences')return {source:'auto',automatic:true,maxOutputTokens:2048,contextLength:8192};
   if(url.pathname==='/api/capabilities')return {items:[]};
   if(url.pathname==='/api/chat'){
    sends.push(input);assert.equal(input.imageAccess,true);assert(Number.isInteger(input.imageCount)&&input.imageCount>=1&&input.imageCount<=5);
    assert(!Object.hasOwn(input,'imageModelPolicy')||['keep','unload','alternate'].includes(input.imageModelPolicy));
    const chat=chats.get(input.sessionId);assert(chat,'This fixture sends only in its owned existing conversation');
    const replyId='synthetic-reply-'+(++serial),jobs=images(input.imageCount,input.imageModelPolicy||globalPolicy,'generated-'+serial);
    Object.assign(chat,{imageCount:input.imageCount,imageModelPolicy:input.imageModelPolicy??null,imageAccess:true,updatedAt:Date.now(),generation:{status:'completed',requestId:input.requestId,replyId}});
    chat.messages.push({id:'user-'+serial,role:'user',text:input.text,requestId:input.requestId},{id:replyId,role:'assistant',text:'Images synthétiques disponibles.',requestId:input.requestId,imageGenerations:jobs});
    requests.set(input.requestId,{projectId,id:chat.id,status:'completed'});
    return {ndjson:[{type:'start',id:chat.id,name:chat.name,requestId:input.requestId,replyId,imageCount:input.imageCount,imageAccess:true,imageModelPolicy:input.imageModelPolicy??null},{type:'action',action:{id:'action-'+serial,name:input.imageCount===1?'generate_comfy_image':'generate_comfy_image_series',...(input.imageCount===1?{imageGeneration:jobs[0]}:{imageGenerations:jobs})}},{type:'delta',text:'Images synthétiques disponibles.'},{type:'done',id:chat.id,replyId}]};
   }
   throw Error('Unexpected synthetic route '+url.pathname);
  }
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());assert.equal(url.origin,origin,'No real or external network is permitted');
   if(url.pathname==='/api/comfy/image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="832" height="1216"><rect width="832" height="1216" fill="#dce4ea"/></svg>'});
   if(url.pathname.startsWith('/api/')){const value=await respond(url,request.postData()?JSON.parse(request.postData()):null);return route.fulfill({contentType:value?.ndjson?'application/x-ndjson':'application/json',body:value?.ndjson?value.ndjson.map(event=>JSON.stringify(event)+'\n').join(''):JSON.stringify(value??{})});}
   const file=url.pathname==='/'?'index.html':url.pathname.slice(1);assert.match(file,/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js|[a-z0-9.-]+)$/i);return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html',body:await fs.readFile(path.join(root,file))});
  });
  async function openChat(id){if(width<400&&await page.locator('#back').isVisible())await page.locator('#back').click();await page.locator('.session[data-session-id="'+id+'"]').click();await page.waitForFunction(id=>state.chat?.id===id&&document.getElementById('thread-title').textContent===state.chat.name,id);}
  async function tools(){if(!(await page.locator('#composer-files').getAttribute('open')!==null))await page.locator('#files-menu-toggle').click();}
  async function newChat(){if(width<400&&await page.locator('#back').isVisible())await page.locator('#back').click();await page.locator('#new-chat').click();}
  async function switchProject(id){if(width<400&&await page.locator('#back').isVisible())await page.locator('#back').click();await page.locator('#project').selectOption(id);await page.waitForFunction(id=>document.querySelector('#project').value===id,id);await newChat();}
  async function setCount(count){await tools();const slider=page.getByRole('slider',{name:'Images par demande',exact:true});await slider.focus();await slider.press('Home');for(let i=1;i<count;i++)await slider.press('ArrowRight');assert.equal(await slider.inputValue(),String(count));assert.equal(await slider.getAttribute('aria-valuetext'),count+' image'+(count>1?'s':''));}
  await page.goto(origin);await page.locator('#app').waitFor({state:'visible'});await openChat(legacy);
  assert.equal(await page.locator('.generated-image').count(),3);assert.match(await page.locator('.generated-image').last().textContent(),/image 3\/3/);
  await tools();const slider=page.getByRole('slider',{name:'Images par demande',exact:true});assert.equal(await slider.getAttribute('type'),'range');assert.equal(await slider.getAttribute('min'),'1');assert.equal(await slider.getAttribute('max'),'5');assert.equal(await slider.getAttribute('step'),'1');assert.equal(await slider.inputValue(),'3');
  assert.equal(await page.locator('#image-model-policy').inputValue(),'');await setCount(5);await page.locator('#image-model-policy').selectOption('alternate');await page.locator('#prompt').fill('Brouillon cinq images.');
  await newChat();await tools();assert.equal(await slider.isDisabled(),true);assert.equal(await page.locator('#image-model-policy').isDisabled(),true);assert.match(await page.locator('#image-count-value').textContent(),/0 image/);
  await page.locator('#agent-images').check();await setCount(2);await page.locator('#image-model-policy').selectOption('unload');await page.locator('#prompt').fill('Autre brouillon.');
  await switchProject(secondProject);await tools();assert.equal(await slider.inputValue(),'1');assert.equal(await page.locator('#image-model-policy').inputValue(),'');await page.locator('#agent-images').check();await setCount(4);await page.locator('#image-model-policy').selectOption('keep');await page.locator('#prompt').fill('Brouillon du second projet.');
  await switchProject(projectId);await tools();assert.equal(await slider.inputValue(),'2');assert.equal(await page.locator('#image-model-policy').inputValue(),'unload');
  await openChat(legacy);await tools();assert.equal(await slider.inputValue(),'5');assert.equal(await page.locator('#image-model-policy').inputValue(),'alternate');
  await newChat();await tools();assert.equal(await slider.inputValue(),'2');assert.equal(await page.locator('#image-model-policy').inputValue(),'unload');
  await openChat(other);await tools();assert.equal(await slider.inputValue(),'2');assert.equal(await page.locator('#image-model-policy').inputValue(),'keep');
  globalPolicy='unload';await page.locator('#prompt').click();await page.locator('#conversation-options-toggle').click();await page.locator('#draft-settings-open').click();await page.locator('#settings-close').click();await tools();
  assert.equal(await page.locator('#image-model-policy').inputValue(),'keep');await page.locator('#image-model-policy').selectOption('');assert.match(await page.locator('#image-settings-help').textContent(),/Paramètres globaux.*déchargé/s);
  if(width<400){await slider.scrollIntoViewIfNeeded();const box=await slider.boundingBox();await slider.tap({position:{x:box.width/2,y:box.height/2}});assert.equal(await slider.inputValue(),'3');assert.equal(await page.locator('#image-count-value').textContent(),'3 images');}
  await setCount(5);await page.locator('#image-model-policy').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,width+'-tools-count-and-policy.png')});
  const policies=['','keep','unload','alternate',''];
  for(let count=1;count<=5;count++){
   await setCount(count);await page.locator('#image-model-policy').selectOption(policies[count-1]);await page.locator('#prompt').fill('Génère '+count+' image(s) synthétique(s).');await page.locator('#send').click();
   await page.waitForFunction(amount=>document.querySelectorAll('.message.assistant:last-of-type .generated-image').length===amount,count).catch(async()=>{await page.waitForFunction(amount=>[...document.querySelectorAll('.message.assistant')].at(-1)?.querySelectorAll('.generated-image').length===amount,count);});
   const latest=page.locator('.message.assistant').last();assert.equal(await latest.locator('.generated-image').count(),count);
   if(count>1)assert.match(await latest.locator('.generated-image-status').last().textContent(),new RegExp('image '+count+'/'+count));
   assert.equal(sends.at(-1).imageCount,count);assert.equal(sends.at(-1).imageModelPolicy,policies[count-1]||undefined);assert.equal(chats.get(other).imageModelPolicy,policies[count-1]||null);
  }
  assert.equal(sends.length,5);await tools();assert.equal(await slider.inputValue(),'5');assert.equal(await page.locator('#image-model-policy').inputValue(),'');
  assert.equal(await page.evaluate(()=>state.chat.imageModelPolicy),null,'start null must clear an earlier policy override');
  await page.locator('#image-model-policy').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,width+'-restored-default.png')});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert.equal(overflow,false);assert.deepEqual(errors,[]);
  results.push({width,nativeSlider:true,keyAndTouch:width<400?'keyboard and synthesized touch':'keyboard',countsSent:sends.map(send=>send.imageCount),policiesSent:sends.map(send=>send.imageModelPolicy??null),legacyThreeCards:true,separateDrafts:true,separateProjectDrafts:true,globalChangePreservesOverride:true,startNullClearsOverride:true,disabledZero:true,overflow,errors,externalRequests:0});await context.close();
 }
}finally{await browser.close();}
await fs.writeFile(path.join(output,'browser-images-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
