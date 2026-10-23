import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as wait} from 'node:timers/promises';
import {createCompanion} from '../server.mjs';
import {createComfyImages} from '../lib/comfy-images.mjs';

async function until(condition,label='synthetic integration state',timeout=5000){
  const end=Date.now()+timeout;
  while(!await condition()){assert(Date.now()<end,label);await wait(10);}
}
async function bounded(promise,label,timeout=1000){
  let timer;
  try{return await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error(label)),timeout);})]);}
  finally{clearTimeout(timer);}
}
function ndjson(response){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',ended=false;
  return{async next(){
    for(;;){
      const newline=buffer.indexOf('\n');
      if(newline>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(line.trim())return JSON.parse(line);continue;}
      if(ended){if(!buffer.trim())return null;const line=buffer;buffer='';return JSON.parse(line);}
      const result=await reader.read();ended=result.done;buffer+=decoder.decode(result.value,{stream:!ended});
    }
  },async remaining(){const events=[];for(;;){const event=await this.next();if(event===null)return events;events.push(event);}}};
}
async function completeSeries(f,count=3,offset=0){
  for(let index=offset;index<offset+count;index++){
    await until(()=>f.state.posts.length>index);f.state.completed.add(f.state.posts[index].id);
    if(index<offset+count-1)await until(()=>f.state.posts.length>index+1);
  }
  await until(()=>f.app.gpuScheduler.snapshot().activeImages===0);
}
const scenes=(label,count=3)=>[
  {prompt:label+' red bicycle beside a stone wall',seed:201,format:'square'},
  {prompt:label+' yellow tram in an empty street',seed:202,format:'square'},
  {prompt:label+' wooden sailboat at dawn',seed:203,format:'square'},
  {prompt:label+' green forest in morning mist',seed:204,format:'square'},
  {prompt:label+' orange cat beside a window',seed:205,format:'square'},
].slice(0,count);
const publicModel={id:'synthetic-series',name:'Synthetic series model',type:'llm',tools:true,contextLength:8192,reasoning:{allowedOptions:[]}};

async function fixture(t,{builtInComfy=false,forceSeries=false,controlledText=false,seriesCountOverride,holdImageModel=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-series-http-test-'));
  const state={loaded:true,inferences:[],posts:[],completed:new Set(),unloads:[],modelAdmissions:[],textStreams:new Map()};
  const inFlight=()=>state.posts.filter(post=>!state.completed.has(post.id)).length;
  const modelService={
    async list(){return[{...publicModel,loaded:state.loaded,loadedInstances:state.loaded?[{id:'synthetic-loaded-instance'}]:[]}];},
    async forInference(){state.modelAdmissions.push({activeImages:inFlight()});state.loaded=true;return publicModel;},
    async unload(id){assert.equal(id,'synthetic-loaded-instance');state.unloads.push({id,activeImages:inFlight()});state.loaded=false;return{unloaded:true};},
  };
  const fetchImpl=async(url,options)=>{
    assert.equal(String(url),'http://127.0.0.1:1235/v1/chat/completions');
    const body=JSON.parse(options.body),last=body.messages.at(-1);
    const user=body.messages.filter(message=>message.role==='user').at(-1);
    const userText=typeof user?.content==='string'?user.content:JSON.stringify(user?.content);
    const label=/SCENARIO-[A-Z]+/.exec(userText)?.[0]??'SCENARIO-DEFAULT';
    state.inferences.push({body,label,activeImages:inFlight()});
    if(controlledText&&userText.includes('HOLD-TEXT')){
      const control={aborted:false,finished:false};
      const stream=new ReadableStream({start(controller){
        const packet=event=>controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(event)+'\n\n'));
        const abort=()=>{if(control.finished||control.aborted)return;control.aborted=true;controller.error(Object.assign(new Error('Synthetic aborted stream'),{name:'AbortError'}));};
        control.finish=()=>{
          if(control.finished||control.aborted)return;
          control.finished=true;options.signal.removeEventListener('abort',abort);
          packet({choices:[{delta:{content:' Suite finale complète.'},finish_reason:'stop'}]});
          packet({choices:[],usage:{prompt_tokens:80,completion_tokens:128}});
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));controller.close();
        };
        options.signal.addEventListener('abort',abort,{once:true});
        state.textStreams.set(label,control);
        if(options.signal.aborted)abort();else packet({choices:[{delta:{content:'Début de réponse contrôlée.'}}]});
      }});
      return new Response(stream);
    }
    let choices;
    if(last.role==='tool'||userText.includes('TEXT-ONLY'))choices=[{delta:{content:'Réponse synthétique disponible.'},finish_reason:'stop'}];
    else{
      const series=forceSeries||body.tools?.some(tool=>tool.function.name==='generate_comfy_image_series');
      const name=series?'generate_comfy_image_series':'generate_comfy_image';
      const selectedCount=body.tools?.find(tool=>tool.function.name==='generate_comfy_image_series')?.function.parameters.properties.images.minItems??3;
      const args=series?{images:scenes(label,seriesCountOverride??selectedCount)}:scenes(label)[0];
      if(holdImageModel)await new Promise(resolve=>{state.finishImagePreparation=resolve;});
      choices=[{delta:{tool_calls:[{index:0,id:randomUUID(),type:'function',function:{name,arguments:JSON.stringify(args)}}]},finish_reason:'tool_calls'}];
    }
    return new Response('data: '+JSON.stringify({choices})+'\n\ndata: [DONE]\n\n');
  };
  const comfyFetchImpl=async(url,options={})=>{
    assert(String(url).startsWith('http://127.0.0.1:8188/'));assert.equal(options.redirect,'error');
    if(url.endsWith('/prompt')){
      const id='synthetic-http-'+(state.posts.length+1),body=JSON.parse(options.body),priorRunning=inFlight();
      state.posts.push({id,body,loaded:state.loaded,priorRunning});
      return Response.json({prompt_id:id});
    }
    if(url.endsWith('/queue'))return Response.json({queue_running:state.posts.filter(post=>!state.completed.has(post.id)).map(post=>[0,post.id]),queue_pending:[]});
    if(url.includes('/history/')){
      const id=url.slice(url.lastIndexOf('/')+1);
      return Response.json(state.completed.has(id)?{[id]:{status:{status_str:'success',completed:true},outputs:{'9':{images:[{filename:id+'.png',subfolder:'Synthetic',type:'output'}]}}}}:{});
    }
    if(url.includes('/view?')){
      const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1024,20);
      return new Response(bytes);
    }
    throw Error('Unexpected synthetic ComfyUI route '+url);
  };
  const comfyService=builtInComfy?undefined:await createComfyImages({directory:path.join(root,'data','comfy-generations'),settingsFile:path.join(root,'data','comfy-settings.json'),enabled:true,fetchImpl:comfyFetchImpl,pollMs:5});
  const app=await createCompanion({root,modelService,fetchImpl,comfyService,comfyFetchImpl,
    nativeStore:{listProjects:async()=>[{id:'p1',name:'Synthetic project',sessionsCount:0},{id:'p2',name:'Synthetic other project',sessionsCount:0}],listSessions:async()=>[]},
    settings:{port:0,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',comfyEnabled:true,comfyWorkflowId:'krea2_turbo',comfyUrl:'http://127.0.0.1:8188'},
  });
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  t.after(async()=>{await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('comfy-series-http-test-'));await fs.rm(root,{recursive:true,force:true});});
  const code=/Code d’accès : (.+)/.exec(await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'))[1].trim();
  const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const request=(route,body)=>fetch(base+route,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{cookie,'Content-Type':'application/json'}});
  const send=async(label='SCENARIO-A',overrides={})=>{
    const response=await request('/api/chat',{projectId:'p1',model:publicModel.id,requestId:randomUUID(),text:'Génère trois images différentes '+label,imageAccess:true,imageCount:3,fileProfile:'none',...overrides});
    assert.equal(response.status,200);
    const events=(await response.text()).trim().split('\n').map(JSON.parse);
    assert(events.some(event=>event.type==='done'),JSON.stringify(events));assert(!events.some(event=>event.type==='error'),JSON.stringify(events));
    return {events,start:events.find(event=>event.type==='start'),actions:events.filter(event=>event.type==='action').map(event=>event.action)};
  };
  const params=(turn,job)=>new URLSearchParams({projectId:'p1',chatId:turn.start.id,messageId:turn.start.replyId,jobId:job.id});
  return{root,state,app,request,send,params};
}

test('HTTP series mode saves three cards with per-image cleanup and needs only one model call',async t=>{
  const f=await fixture(t,{builtInComfy:true});
  const updated=await f.request('/api/comfy/settings',{memoryCleanup:true});assert.equal(updated.status,200);assert.equal((await updated.json()).memoryCleanup,true);
  const turn=await f.send();
  assert.equal(f.state.inferences.length,1);
  assert.deepEqual(f.state.inferences[0].body.tools.map(tool=>tool.function.name),['generate_comfy_image_series']);
  assert.match(f.state.inferences[0].body.messages[0].content,/exactement trois descriptions différentes/);
  assert.equal(turn.actions.length,1);assert.equal(turn.actions[0].ok,true);
  const jobs=turn.actions[0].imageGenerations;assert.equal(jobs.length,3);assert.deepEqual(jobs.map(job=>job.seriesIndex),[1,2,3]);
  const chat=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();
  assert.equal(chat.imageCount,3);assert.equal(chat.messages.at(-1).completionSource,'image-status');
  assert.deepEqual(chat.messages.at(-1).imageGenerations.map(job=>job.id),jobs.map(job=>job.id));
  for(let index=0;index<3;index++){
    await until(()=>f.state.posts.length>index);f.state.completed.add(f.state.posts[index].id);
    await until(async()=>{const result=await f.request('/api/comfy/generation?'+f.params(turn,jobs[index]));return(await result.json()).status==='succeeded';},'saved image was not ready',7000);
    const image=await f.request('/api/comfy/image?'+f.params(turn,jobs[index]));assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');assert.equal((await image.arrayBuffer()).byteLength,24);
  }
  assert.equal(f.state.posts.length,3);assert.equal(f.state.inferences.length,1);
  assert(f.state.posts.every(post=>Object.hasOwn(post.body.prompt,'99')),'the HTTP cleanup preference applies after every image, including the first two');
  const wrong=f.params(turn,jobs[0]);wrong.set('messageId','not-the-owner');assert.equal((await f.request('/api/comfy/generation?'+wrong)).status,404);
  wrong.set('projectId','p2');assert.equal((await f.request('/api/comfy/image?'+wrong)).status,404);
});

test('invalid image counts are refused before inference, graph submission or chat persistence',async t=>{
  const f=await fixture(t);
  for(const imageCount of [0,-1,6,1.5,'3',null,false,{}]){
    const response=await f.request('/api/chat',{projectId:'p1',model:publicModel.id,requestId:randomUUID(),text:'SCENARIO-A',imageAccess:true,imageCount,fileProfile:'none'});
    assert.equal(response.status,400);await response.arrayBuffer();
  }
  assert.equal(f.state.inferences.length,0);assert.equal(f.state.posts.length,0);
  assert.deepEqual(await fs.readdir(path.join(f.root,'data','chats')),[]);
});

test('single-image mode refuses an unexpected series tool without creating any image',async t=>{
  const f=await fixture(t,{forceSeries:true}),turn=await f.send('SCENARIO-A',{imageCount:1});
  assert(!f.state.inferences[0].body.tools.some(tool=>tool.function.name==='generate_comfy_image_series'));
  assert.equal(turn.actions.length,1);assert.equal(turn.actions[0].ok,false);assert.match(turn.actions[0].message,/pas autorisé/);
  assert.equal(f.state.posts.length,0);
  const chat=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();assert.equal(chat.messages.at(-1).imageGenerations,undefined);
});

test('three conversations can submit concurrently and their images stay in FIFO groups and in their owner chat',async t=>{
  const f=await fixture(t);
  const turns=await Promise.all(['SCENARIO-A','SCENARIO-B','SCENARIO-C'].map(label=>f.send(label)));
  assert.equal(new Set(turns.map(turn=>turn.start.id)).size,3);assert.equal(f.state.inferences.length,3);
  await until(()=>f.state.posts.length===1);await wait(30);assert.equal(f.state.posts.length,1);
  for(let index=0;index<9;index++){
    await until(()=>f.state.posts.length>index);f.state.completed.add(f.state.posts[index].id);
    if(index<8)await until(()=>f.state.posts.length>index+1);
  }
  await until(()=>f.app.gpuScheduler.snapshot().activeImages===0);
  assert.equal(f.state.posts.length,9);assert(f.state.posts.every(post=>post.priorRunning===0));
  const ordered=f.state.posts.map(post=>/SCENARIO-[A-Z]+/.exec(post.body.prompt['6'].inputs.text)[0]);
  for(let index=0;index<9;index+=3)assert.equal(new Set(ordered.slice(index,index+3)).size,1);
  assert.equal(new Set([ordered[0],ordered[3],ordered[6]]).size,3);
  for(const turn of turns){
    const chat=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();
    assert.equal(chat.messages.at(-1).imageGenerations.length,3);assert(chat.messages.at(-1).imageGenerations.every(job=>job.status==='succeeded'));
  }
  const foreign=f.params(turns[1],turns[0].actions[0].imageGenerations[0]);assert.equal((await f.request('/api/comfy/image?'+foreign)).status,404);
});

for(const policy of ['keep','unload'])test(`HTTP ${policy} policy ${policy==='keep'?'permits':'defers'} another conversation during the image series`,async t=>{
  const f=await fixture(t);
  const setting=await f.request('/api/comfy/settings',{modelPolicy:policy});assert.equal(setting.status,200);
  const turn=await f.send('SCENARIO-A');assert.equal(turn.actions[0].imageGenerations.length,3);
  await until(()=>f.state.posts.length===1);
  const pendingText=f.send('SCENARIO-TEXT',{text:'TEXT-ONLY SCENARIO-TEXT',imageAccess:false,imageCount:1});
  if(policy==='keep'){
    await pendingText;assert.equal(f.state.unloads.length,0);assert.equal(f.state.inferences.at(-1).activeImages,1);
  }else{
    await wait(60);assert.equal(f.state.inferences.length,1);assert.equal(f.state.unloads.length,1);assert.equal(f.state.unloads[0].activeImages,0);
    assert.equal(f.state.posts[0].loaded,false);
  }
  for(let index=0;index<3;index++){
    await until(()=>f.state.posts.length>index);f.state.completed.add(f.state.posts[index].id);
    if(index<2)await until(()=>f.state.posts.length>index+1);
  }
  await until(()=>f.app.gpuScheduler.snapshot().activeImages===0);
  await pendingText;assert.equal(f.state.inferences.length,2);
  if(policy==='unload'){assert(f.state.posts.every(post=>post.loaded===false));assert.equal(f.state.inferences.at(-1).activeImages,0);assert.equal(f.state.loaded,true);}
});

for(const policy of ['unload','alternate'])test(`a text conversation awaiting ${policy} images receives queued headers immediately and measured admission time`,async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:policy})).status,200);
  await f.send('SCENARIO-A');await until(()=>f.state.posts.length===1);
  const requestId=randomUUID();
  const response=await bounded(f.request('/api/chat',{projectId:'p1',model:publicModel.id,requestId,text:'TEXT-ONLY SCENARIO-TEXT',imageAccess:false,imageCount:1,fileProfile:'none'}),'waiting conversation did not send HTTP headers before image completion');
  assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/application\/x-ndjson/);
  const stream=ndjson(response),queued=await bounded(stream.next(),'waiting conversation did not acknowledge its queued state');
  assert.equal(queued.type,'queued');assert.equal(queued.requestId,requestId);assert.equal(queued.phase,'waiting-model');assert.match(queued.id,/^web-/);assert.equal(typeof queued.name,'string');
  await wait(100);assert.equal(f.state.inferences.length,1);assert.equal(f.state.posts.length,1);assert.equal(f.app.gpuScheduler.snapshot().activeImages,1);
  await completeSeries(f);
  const events=await bounded(stream.remaining(),'waiting conversation did not finish after the images');
  assert.equal(events[0].type,'start');assert.equal(events[0].id,queued.id);assert.equal(events[0].requestId,requestId);
  const metrics=events.find(event=>event.type==='done')?.metrics;
  assert(metrics.queueSeconds>=0.09,'the deliberate blocked admission is measured');
  assert(metrics.totalSeconds>=metrics.queueSeconds);assert(metrics.totalSeconds>metrics.responseSeconds,'total includes admission, engine timing stays separate');
  const saved=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:queued.id}))).json();
  assert.deepEqual(saved.messages.at(-1).metrics,metrics);
  assert(events.some(event=>event.type==='done'));assert(!events.some(event=>event.type==='error'));assert.equal(f.state.inferences.length,2);assert.equal(f.state.inferences.at(-1).activeImages,0);
});

for(const policy of ['unload','alternate'])test(`Stop while waiting behind ${policy} images ends the queued stream without starting another inference`,async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:policy})).status,200);
  await f.send('SCENARIO-A');await until(()=>f.state.posts.length===1);
  const requestId=randomUUID();
  const response=await bounded(f.request('/api/chat',{projectId:'p1',model:publicModel.id,requestId,text:'TEXT-ONLY SCENARIO-TEXT',imageAccess:false,imageCount:1,fileProfile:'none'}),'waiting conversation did not send HTTP headers');
  const stream=ndjson(response),queued=await bounded(stream.next(),'waiting conversation did not acknowledge its queued state');
  assert.equal(queued.type,'queued');assert.equal(queued.requestId,requestId);assert.equal(queued.phase,'waiting-model');
  const stopped=await f.request('/api/cancel',{projectId:'p1',requestId});assert.equal(stopped.status,200);
  const events=await bounded(stream.remaining(),'Stop did not close the waiting conversation stream');
  assert(events.some(event=>event.type==='error'));assert(!events.some(event=>event.type==='start'||event.type==='done'));
  assert.equal(f.state.inferences.length,1);assert.equal(f.app.gpuScheduler.snapshot().activeImages,1);
  await completeSeries(f);await wait(30);assert.equal(f.state.inferences.length,1);
});

for(const ending of ['complete','stop'])test(`HTTP alternate preserves an active text stream between images until ${ending} and later text stays behind the next image`,async t=>{
  const f=await fixture(t,{controlledText:true});
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:'alternate'})).status,200);
  const turn=await f.send('SCENARIO-A');await until(()=>f.state.posts.length===1);
  const requestId=randomUUID();
  const response=await bounded(f.request('/api/chat',{
    projectId:'p1',model:publicModel.id,requestId,text:'TEXT-ONLY HOLD-TEXT SCENARIO-LONG',imageAccess:false,imageCount:1,fileProfile:'none',
    outputPreferences:{maxOutputTokens:512,applyToAllSessions:false},
  }),'long text request must acknowledge admission waiting');
  const long=ndjson(response),queued=await bounded(long.next(),'long text must report queued before the image boundary');
  assert.equal(queued.type,'queued');assert.equal(f.state.inferences.length,1);
  f.state.completed.add(f.state.posts[0].id);
  await until(()=>f.state.textStreams.has('SCENARIO-LONG'),'long text must start after the first image');
  const initial=[];
  while(!initial.some(event=>event.type==='delta'))initial.push(await bounded(long.next(),'long text must stream its first fragment'));
  const started=initial.find(event=>event.type==='start');assert.equal(started.id,queued.id);
  assert.equal(f.state.inferences[1].body.max_tokens,512,'the selected output preference must remain unchanged');
  assert.equal(f.state.inferences[1].activeImages,0);
  await until(()=>f.app.gpuScheduler.snapshot().queuedImages===1,'the next image must reserve its place while text is active');
  const laterRequestId=randomUUID();
  const laterResponse=await bounded(f.request('/api/chat',{
    projectId:'p1',model:publicModel.id,requestId:laterRequestId,text:'TEXT-ONLY SCENARIO-LATER',imageAccess:false,imageCount:1,fileProfile:'none',
  }),'later text must acknowledge waiting behind the next reserved image');
  const later=ndjson(laterResponse),laterQueued=await bounded(later.next(),'later text must receive its queue receipt');
  assert.equal(laterQueued.type,'queued');
  await wait(70);
  assert.equal(f.state.posts.length,1,'a long open stream must not be cut short to advance the second image');
  assert.equal(f.state.inferences.length,2,'later text must not jump ahead of the reserved second image');
  assert.equal(f.app.gpuScheduler.snapshot().activeModels,1);
  const control=f.state.textStreams.get('SCENARIO-LONG');
  assert.equal(control.finished,false);assert.equal(control.aborted,false);
  if(ending==='stop')assert.equal((await f.request('/api/cancel',{projectId:'p1',requestId})).status,200);
  else control.finish();
  const remaining=await bounded(long.remaining(),'finishing or stopping the active stream must release the image');
  if(ending==='stop'){
    assert.equal(control.aborted,true);assert(remaining.some(event=>event.type==='error'&&event.outcome==='stopped'));
    assert(!remaining.some(event=>event.type==='done'));
  }else{
    assert.equal(control.finished,true);assert(remaining.some(event=>event.type==='done'));
    assert(remaining.some(event=>event.type==='delta'&&event.text.includes('Suite finale complète.')));
  }
  await until(()=>f.state.posts.length===2,'the second image must start once text releases its lease');
  assert.equal(f.state.inferences.length,2,'the second image must precede the later conversation');
  f.state.completed.add(f.state.posts[1].id);
  const laterEvents=await bounded(later.remaining(),'later text must get its turn after the second image');
  assert(laterEvents.some(event=>event.type==='start'));assert(laterEvents.some(event=>event.type==='done'));
  assert.equal(f.state.inferences[2].label,'SCENARIO-LATER');assert.equal(f.state.inferences[2].activeImages,0);
  await until(()=>f.state.posts.length===3,'the third image must not be starved by later text');
  f.state.completed.add(f.state.posts[2].id);
  await until(()=>f.app.gpuScheduler.snapshot().activeImages===0,'the completed series must release its image lease');
  assert.equal(f.state.posts.length,3);assert(f.state.posts.every(post=>post.priorRunning===0));assert.equal(f.state.unloads.length,0);
  const textChat=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:queued.id}))).json();
  const reply=textChat.messages.at(-1);assert(reply.text.startsWith('Début de réponse contrôlée.'));
  assert.equal(reply.outcome,ending==='stop'?'stopped':'completed');
  const imageChat=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();
  assert(imageChat.messages.at(-1).imageGenerations.every(job=>job.status==='succeeded'));
});


for(const count of [1,2,4,5])test(`HTTP accepts ${count} images with exact model schema and owner cards`,async t=>{
  const f=await fixture(t),turn=await f.send('SCENARIO-COUNT',{imageCount:count});
  const action=turn.actions[0],jobs=action.imageGenerations||(action.imageGeneration?[action.imageGeneration]:[]);
  assert.equal(action.ok,true);assert.equal(jobs.length,count);assert.equal(turn.start.imageCount,count);
  if(count>1){
    const tool=f.state.inferences[0].body.tools.find(tool=>tool.function.name==='generate_comfy_image_series');
    assert.equal(tool.function.parameters.properties.images.minItems,count);assert.equal(tool.function.parameters.properties.images.maxItems,count);
    assert.deepEqual(jobs.map(job=>job.seriesIndex),Array.from({length:count},(_,i)=>i+1));assert(jobs.every(job=>job.seriesTotal===count));
  }else assert(!f.state.inferences[0].body.tools.some(tool=>tool.function.name==='generate_comfy_image_series'));
  await completeSeries(f,count);assert.equal(f.state.posts.length,count);assert(f.state.posts.every(post=>post.priorRunning===0));
  const saved=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();
  assert.equal(saved.imageCount,count);assert.equal(saved.messages.at(-1).imageGenerations.length,count);
  assert(saved.messages.at(-1).imageGenerations.every(job=>job.status==='succeeded'));
});

for(const actualCount of [2,4])test(`model returning ${actualCount} images for a selected five creates no jobs`,async t=>{
  const f=await fixture(t,{seriesCountOverride:actualCount}),turn=await f.send('SCENARIO-WRONG',{imageCount:5});
  assert.equal(turn.actions[0].ok,false);assert.equal(f.state.posts.length,0);
  const saved=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:turn.start.id}))).json();
  assert.equal(saved.messages.at(-1).imageGenerations,undefined);
});

test('invalid per-message model policies are refused before model, image or chat effects',async t=>{
  const f=await fixture(t);
  for(const imageModelPolicy of ['',false,0,'KEEP','other',{}]){
    const response=await f.request('/api/chat',{projectId:'p1',model:publicModel.id,requestId:randomUUID(),text:'SCENARIO-A',imageAccess:true,imageCount:2,imageModelPolicy,fileProfile:'none'});
    assert.equal(response.status,400);await response.arrayBuffer();
  }
  assert.equal(f.state.inferences.length,0);assert.equal(f.state.posts.length,0);
  assert.deepEqual(await fs.readdir(path.join(f.root,'data','chats')),[]);
});

test('quick unload applies only to its image lot and clearing the exception restores global keep in the same chat',async t=>{
  const f=await fixture(t);
  const first=await f.send('SCENARIO-QUICK',{imageCount:2,imageModelPolicy:'unload'}),jobs=first.actions[0].imageGenerations;
  assert.equal(first.start.imageModelPolicy,'unload');assert(jobs.every(job=>job.modelPolicy==='unload'));
  assert.equal(f.state.unloads.length,1);assert.equal(f.state.posts[0].loaded,false);
  assert.equal((await(await f.request('/api/comfy/settings')).json()).modelPolicy,'keep');
  await completeSeries(f,2);
  const second=await f.send('SCENARIO-DEFAULT',{sessionId:first.start.id,imageCount:1});
  const next=second.actions[0].imageGeneration||second.actions[0].imageGenerations?.[0];
  assert.equal(second.start.id,first.start.id);assert.equal(second.start.imageModelPolicy,null);assert.equal(next.modelPolicy,'keep');assert.equal(f.state.unloads.length,1);
  await completeSeries(f,1,2);
  const saved=await(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:second.start.id}))).json();
  assert.equal(saved.imageModelPolicy,null);assert.equal(saved.imageCount,1);assert.equal(saved.messages.at(-1).imageGenerations[0].modelPolicy,'keep');
  assert.equal((await(await f.request('/api/comfy/settings')).json()).modelPolicy,'keep');
});

test('global policy is captured before model preparation and cannot change a previously accepted image request',async t=>{
  const f=await fixture(t,{holdImageModel:true});
  const pending=f.send('SCENARIO-FROZEN',{imageCount:4});
  await until(()=>typeof f.state.finishImagePreparation==='function');
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:'unload'})).status,200);
  f.state.finishImagePreparation();
  const turn=await pending;assert.equal(turn.start.imageModelPolicy,null);
  assert(turn.actions[0].imageGenerations.every(job=>job.modelPolicy==='keep'));assert.equal(f.state.unloads.length,0);
  await completeSeries(f,4);
  assert.equal((await(await f.request('/api/comfy/settings')).json()).modelPolicy,'unload');
});
