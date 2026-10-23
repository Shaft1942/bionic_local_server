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
async function completeSeries(f){
  for(let index=0;index<3;index++){
    await until(()=>f.state.posts.length>index);f.state.completed.add(f.state.posts[index].id);
    if(index<2)await until(()=>f.state.posts.length>index+1);
  }
  await until(()=>f.app.gpuScheduler.snapshot().activeImages===0);
}
const scenes=label=>[
  {prompt:label+' red bicycle beside a stone wall',seed:201,format:'square'},
  {prompt:label+' yellow tram in an empty street',seed:202,format:'square'},
  {prompt:label+' wooden sailboat at dawn',seed:203,format:'square'},
];
const publicModel={id:'synthetic-series',name:'Synthetic series model',type:'llm',tools:true,contextLength:8192,reasoning:{allowedOptions:[]}};

async function fixture(t,{builtInComfy=false,forceSeries=false}={}){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-series-http-test-'));
  const state={loaded:true,inferences:[],posts:[],completed:new Set(),unloads:[],modelAdmissions:[]};
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
    let choices;
    if(last.role==='tool'||userText.includes('TEXT-ONLY'))choices=[{delta:{content:'Réponse synthétique disponible.'},finish_reason:'stop'}];
    else{
      const series=forceSeries||body.tools?.some(tool=>tool.function.name==='generate_comfy_image_series');
      const name=series?'generate_comfy_image_series':'generate_comfy_image';
      const args=series?{images:scenes(label)}:scenes(label)[0];
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
  for(const imageCount of [0,2,4,'3',false,{}]){
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

test('a text conversation awaiting an unload image lot receives queued headers immediately and starts after the lot',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:'unload'})).status,200);
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
  assert(events.some(event=>event.type==='done'));assert(!events.some(event=>event.type==='error'));assert.equal(f.state.inferences.length,2);assert.equal(f.state.inferences.at(-1).activeImages,0);
});

test('Stop while waiting behind an unload image lot ends the queued stream without starting another inference',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/comfy/settings',{modelPolicy:'unload'})).status,200);
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
