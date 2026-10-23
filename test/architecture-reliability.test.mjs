import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import { createCompanion } from '../server.mjs';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { createJobCoordinator } from '../lib/job-coordinator.mjs';
import { createNDJSONWriter } from '../lib/ndjson-writer.mjs';
import { createModelService } from '../lib/model-service.mjs';

const closeRoots = new Map();
async function folder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'bionic-architecture-test-'));
  t.after(async () => { await closeRoots.get(root)?.();closeRoots.delete(root);assert(path.basename(root).startsWith('bionic-architecture-test-')); await fs.rm(root,{recursive:true,force:true}); });
  return root;
}
async function until(check) { for (let i=0;i<200;i++) { if (await check()) return; await sleep(5); } assert.fail('Synthetic condition did not arrive'); }
const owner = () => ({projectId:'p1',chatId:'web-'+randomUUID(),messageId:randomUUID(),requestId:randomUUID()});
function imageAPI() {
  let posts=0;
  const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1024,20);
  return { get posts(){return posts;}, fetch:async (url) => {
    if(url.endsWith('/prompt')){posts++;return Response.json({prompt_id:'synthetic-'+posts});}
    if(url.includes('/history/')){const id=decodeURIComponent(url.split('/').at(-1));return Response.json({[id]:{status:{completed:true},outputs:{'9':{images:[{filename:'synthetic.png',subfolder:'Bionic',type:'output'}]}}}});}
    if(url.includes('/view?'))return new Response(bytes);
    throw Error('Unexpected synthetic route');
  } };
}

test('resource reservations serialize text/image phases, preserve FIFO and cancel a waiter without a leaked lease', async () => {
  const coordinator=createJobCoordinator({policy:'exclusive',maxText:1});
  const releaseText=await coordinator.acquire('text'), cancel=new AbortController();
  const image=coordinator.acquire('image',cancel.signal), text=coordinator.acquire('text');
  assert.deepEqual(coordinator.status().waiting,{text:1,image:1});
  cancel.abort();await assert.rejects(image,{status:409});releaseText();
  const releaseNext=await text;assert.deepEqual(coordinator.status().active,{text:1,image:0});releaseNext();
  const restored=coordinator.restoreImage();let admitted=false;
  const pending=coordinator.acquire('text').then(release=>{admitted=true;return release;});await sleep(5);assert.equal(admitted,false);
  restored();(await pending)();assert.deepEqual(coordinator.status().active,{text:0,image:0});
  const holding=await coordinator.acquire('image'), rejected=coordinator.acquire('text');coordinator.stop();await assert.rejects(rejected,{status:409});holding();
});

test('independent resource profile permits engines in parallel when explicitly configured',async()=>{
  const coordinator=createJobCoordinator({policy:'independent',maxText:1});
  const text=await coordinator.acquire('text'),textWaiting=coordinator.acquire('text'),image=await coordinator.acquire('image');assert.deepEqual(coordinator.status().active,{text:1,image:1});text();image();(await textWaiting)();
});

test('slow NDJSON consumers have bounded queues and detach without cancelling any job',async()=>{
  class Slow extends EventEmitter { destroyed=false;writableEnded=false;writableLength=0;write(){return false;}destroy(){this.destroyed=true;this.emit('close');} }
  const res=new Slow();let detached=0;const writer=createNDJSONWriter(res,{maxBytes:100,onDetach:()=>detached++});
  writer.emit({text:'first'});for(let i=0;i<20;i++)writer.emit({text:'x'.repeat(20)});
  assert.equal(detached,1);assert.equal(res.destroyed,true);assert.equal(writer.status().bufferedBytes,0);
  const draining=new Slow(), lines=[];draining.write=line=>{lines.push(line);return lines.length>1;};
  const next=createNDJSONWriter(draining);next.emit({id:1});next.emit({id:2});assert.equal(lines.length,1);draining.emit('drain');assert.equal(lines.length,2);next.close();
  const ending=new Slow();let endDetach=0;const last=createNDJSONWriter(ending,{onDetach:()=>endDetach++});last.emit({id:'done'});last.finish();assert.equal(ending.destroyed,true);assert.equal(endDetach,1);
});

test('one corrupt image job is preserved and reported while healthy jobs recover without resubmission',async t=>{
  const directory=await folder(t),api=imageAPI();
  let service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl:api.fetch,pollMs:100000});
  const job=await service.submit({prompt:'Synthetic blue teapot',seed:42},owner());await service.close();
  const badId=randomUUID(),bad=path.join(directory,badId+'.json'),bytes=Buffer.from('{"incomplete":');await fs.writeFile(bad,bytes);
  service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl:api.fetch,pollMs:100000});t.after(()=>service.close());
  assert.equal(service.get(job.id).status,'queued');assert.equal(api.posts,1);assert.equal(service.getSettings().degraded,true);
  assert.equal(service.getSettings().jobIncidents[0].id,badId);assert.deepEqual(await fs.readFile(bad),bytes);
  assert.equal((await service.refresh(job.id)).status,'succeeded');
});

test('image admission waits without submitting and cancellation persists a terminal state',async t=>{
  const directory=await folder(t),api=imageAPI(),coordinator=createJobCoordinator({policy:'exclusive'}),hold=await coordinator.acquire('text');
  const service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl:api.fetch,pollMs:100000,coordinator});t.after(()=>service.close());
  const controller=new AbortController(),pending=service.submit({prompt:'Synthetic image'},owner(),controller.signal);
  await until(()=>coordinator.status().waiting.image===1);assert.equal(api.posts,0);assert.equal(service.getSettings().activeJobs,1);
  const files=(await fs.readdir(directory)).filter(name=>/^[a-f0-9-]{36}\.json$/.test(name));assert.equal(JSON.parse(await fs.readFile(path.join(directory,files[0]),'utf8')).status,'waiting-resource');
  controller.abort();const job=await pending;assert.equal(job.status,'stopped');assert.equal(api.posts,0);hold();
  assert.deepEqual(coordinator.status().active,{text:0,image:0});
});

test('image leases survive a service restart and release only after terminal image persistence',async t=>{
  const directory=await folder(t),api=imageAPI();let coordinator=createJobCoordinator({policy:'exclusive'});
  let service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl:api.fetch,pollMs:100000,coordinator});
  const jobOwner=owner(),job=await service.submit({prompt:'Synthetic image',seed:42},jobOwner);await service.close();
  coordinator=createJobCoordinator({policy:'exclusive'});service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl:api.fetch,pollMs:100000,coordinator});t.after(()=>service.close());
  assert.equal(coordinator.status().active.image,1);let admitted=false;
  assert.equal(service.findForOwner(jobOwner).id,job.id);assert.equal(service.findForOwner({...jobOwner,projectId:'wrong'}),null);
  const pending=coordinator.acquire('text').then(release=>{admitted=true;return release;});await sleep(5);assert.equal(admitted,false);
  const done=await service.refresh(job.id);assert.equal(done.status,'succeeded');(await pending)();assert.equal(api.posts,1);
});

test('failed workflow cleanup retains its image reservation until the recovery request settles',async t=>{
  const directory=await folder(t),api=imageAPI(),coordinator=createJobCoordinator({policy:'exclusive'});let finishCleanup;
  const fetchImpl=async(url,options)=>{
    if(url.includes('/history/'))return Response.json({'synthetic-1':{status:{status_str:'error',messages:[['execution_error',{}]]}}});
    if(url.endsWith('/queue'))return Response.json({queue_running:[],queue_pending:[]});
    if(url.endsWith('/free')){await new Promise(resolve=>{finishCleanup=resolve;});return Response.json({});}
    return api.fetch(url,options);
  };
  const service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,memoryCleanup:true,fetchImpl,pollMs:100000,coordinator});t.after(()=>service.close());
  const job=await service.submit({prompt:'Synthetic failure'},owner()),refresh=service.refresh(job.id);await until(()=>!!finishCleanup);
  let admitted=false;const text=coordinator.acquire('text').then(release=>{admitted=true;return release;});await sleep(5);assert.equal(admitted,false);assert.equal(service.getSettings().activeJobs,1);
  finishCleanup();assert.equal((await refresh).status,'failed');(await text)();
});

class Res extends EventEmitter {
  headers={};parts=[];destroyed=false;writableEnded=false;headersSent=false;statusCode=200;
  setHeader(key,value){this.headers[key.toLowerCase()]=value;}
  writeHead(status,headers={}){this.statusCode=status;this.headersSent=true;for(const[k,v]of Object.entries(headers))this.setHeader(k,v);}
  write(value){this.parts.push(String(value));return true;}
  end(value){if(value)this.parts.push(String(value));this.writableEnded=true;this.emit('finish');}
  json(){return JSON.parse(this.parts.join(''));}
  records(){return this.parts.join('').trim().split('\n').filter(Boolean).map(JSON.parse);}
}
async function appFixture(t,{fetchImpl=async()=>{throw Error('Text engine must not be called');},shutdownTimeoutMs=15000,comfyService,modelService,fsImpl}={}){
  const root=await folder(t),api=imageAPI();
  const app=await createCompanion({root,shutdownTimeoutMs,comfyService,fs:fsImpl,nativeStore:{listProjects:async()=>[{id:'p1',name:'Synthetic'}],listSessions:async()=>[]},
    modelService:modelService||{list:async()=>[{id:'synthetic',type:'llm',tools:'unknown',toolsCapability:'unknown',contextLength:8192,reasoning:{allowedOptions:[]}}]},fetchImpl,comfyFetchImpl:api.fetch,
    settings:{port:8769,apiUrl:'http://127.0.0.1:1235',bionicRoot:root,registryPath:path.join(root,'registry.json'),extraRoots:[],python:'python',comfyEnabled:true,comfyUrl:'http://127.0.0.1:8188'}});
  closeRoots.set(root,()=>app.close().catch(error=>{if(error.code!=='SHUTDOWN_TIMEOUT')throw error;}));
  let cookie='';
  const request=async(route,{method='GET',body,headers={}}={},response=new Res())=>{
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url:route,method,headers:{host:'127.0.0.1:8769',cookie,...headers},socket:{remoteAddress:'127.0.0.1'}});await app.handle(req,response);return response;
  };
  const access=await fs.readFile(path.join(root,'ACCES-PRIVE.txt'),'utf8'),code=/Code d’accès : (.+)/.exec(access)[1].trim();
  const login=await request('/api/login',{method:'POST',body:{code}});assert.equal(login.statusCode,200);cookie=login.headers['set-cookie'].split(';')[0];
  return {root,app,api,request};
}

test('direct images use existing rights/jobs and stable request recovery without a text engine',async t=>{
  const f=await appFixture(t);t.after(()=>f.app.close());const requestId=randomUUID(),body={projectId:'p1',requestId,prompt:'A synthetic blue teapot',workflowId:'krea2_turbo'};
  assert.equal((await f.request('/api/comfy/generate',{method:'POST',body,headers:{cookie:''}})).statusCode,401);
  assert.equal((await f.request('/api/comfy/generate',{method:'POST',body,headers:{origin:'http://other.invalid'}})).statusCode,403);
  const first=await f.request('/api/comfy/generate',{method:'POST',body});assert.equal(first.statusCode,200);const receipt=first.json();assert.equal(receipt.generation.status,'queued');assert.equal(f.api.posts,1);
  const again=await f.request('/api/comfy/generate',{method:'POST',body});assert.equal(again.json().id,receipt.id);assert.equal(f.api.posts,1);
  const status=(await f.request('/api/chat-request?'+new URLSearchParams({projectId:'p1',requestId}))).json();assert.equal(status.id,receipt.id);assert.equal(status.status,'completed');
  const chat=(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:receipt.id}))).json();assert.equal(chat.messages.at(-1).imageGenerations[0].id,receipt.generation.id);
  const interrupted=await f.app.readWeb(receipt.id);interrupted.messages.at(-1).imageGenerations=[];await f.app.persistChat(interrupted);
  const recovered=(await f.request('/api/conversation?'+new URLSearchParams({projectId:'p1',id:receipt.id}))).json();assert.equal(recovered.messages.at(-1).imageGenerations[0].id,receipt.generation.id);assert.equal(f.api.posts,1);
  const bad=await f.request('/api/comfy/image?'+new URLSearchParams({projectId:'p1',chatId:receipt.id,messageId:'wrong',jobId:receipt.generation.id}));assert.equal(bad.statusCode,404);
  const runtime=(await f.request('/api/runtime-status')).json();assert.equal(runtime.resources.active.image,1);assert.equal(JSON.stringify(runtime).includes(body.prompt),false);
});

test('an image submission and text turn cannot concurrently own the same conversation',async t=>{
  let releaseImage,waiting=false,textCalls=0;
  const comfyService={getSettings:()=>({enabled:true,activeJobs:waiting?1:0}),submit:async()=>{waiting=true;await new Promise(resolve=>{releaseImage=resolve;});waiting=false;return{id:randomUUID(),status:'queued'};},close:async()=>{}};
  const fetchImpl=async()=>{textCalls++;return new Response('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic answer'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');};
  const f=await appFixture(t,{comfyService,fetchImpl}),id='web-'+randomUUID();
  await f.app.persistChat({id,projectId:'p1',name:'Synthetic shared conversation',source:'web',messages:[],updatedAt:Date.now()});
  const image=f.request('/api/comfy/generate',{method:'POST',body:{projectId:'p1',sessionId:id,requestId:randomUUID(),prompt:'Synthetic image'}});await until(()=>waiting);
  const text={projectId:'p1',sessionId:id,requestId:randomUUID(),text:'Synthetic text',model:'synthetic',fileProfile:'none'};
  assert.equal((await f.request('/api/chat',{method:'POST',body:text})).statusCode,409);assert.equal(textCalls,0);
  releaseImage();assert.equal((await image).statusCode,200);
  const next=await f.request('/api/chat',{method:'POST',body:{...text,requestId:randomUUID()}});assert(next.records().some(event=>event.type==='done'));assert.equal(textCalls,1);
});

test('a cancelled text waiter retains its resource until the shared model load ends before admitting an image',async t=>{
  let releaseLoad,loadStarted=false,loaded=false,textCalls=0;
  const fetchImpl=async(url)=>{
    if(url.endsWith('/api/v1/models'))return Response.json({models:[{key:'synthetic',type:'llm',loaded_instances:loaded?[{id:'loaded-synthetic',config:{context_length:8192}}]:[]}]});
    if(url.endsWith('/api/v1/models/load')){loadStarted=true;await new Promise(resolve=>{releaseLoad=resolve;});loaded=true;return Response.json({status:'loaded',instance_id:'loaded-synthetic',load_config:{context_length:8192}});}
    textCalls++;throw Error('A cancelled waiter must not send a text prediction');
  };
  const modelService=createModelService({baseUrl:'http://127.0.0.1:1235',fetchImpl}),f=await appFixture(t,{fetchImpl,modelService}),requestId=randomUUID();
  await f.request('/api/comfy/settings',{method:'POST',body:{modelPolicy:'alternate'}});
  const text=f.request('/api/chat',{method:'POST',body:{projectId:'p1',model:'synthetic',requestId,text:'Synthetic cold prompt',fileProfile:'none'}});await until(()=>loadStarted);
  assert.equal((await f.request('/api/cancel',{method:'POST',body:{projectId:'p1',requestId}})).statusCode,200);
  const image=f.request('/api/comfy/generate',{method:'POST',body:{projectId:'p1',requestId:randomUUID(),prompt:'Synthetic image while loading'}});
  await until(()=>f.app.gpuScheduler.snapshot().queuedImages===1);assert.equal(f.api.posts,0);assert.equal(f.app.coordinator.status().active.text,1);
  releaseLoad();await text;assert.equal((await image).statusCode,200);assert.equal(f.api.posts,1);assert.equal(textCalls,0);
});

test('cancelling a direct image during its initial checkpoint prevents any image submission',async t=>{
  let releaseWrite,held=false;
  const fsImpl={...fs,rename:async(source,target)=>{
    if(!held&&/[\\/]chats[\\/]web-[a-f0-9-]{36}\.json$/.test(target)){held=true;await new Promise(resolve=>{releaseWrite=resolve;});}
    return fs.rename(source,target);
  }};
  const f=await appFixture(t,{fsImpl}),requestId=randomUUID();
  const image=f.request('/api/comfy/generate',{method:'POST',body:{projectId:'p1',requestId,prompt:'Synthetic image cancelled before checkpoint'}});await until(()=>held);
  const stopped=await f.request('/api/cancel',{method:'POST',body:{projectId:'p1',requestId}});assert.equal(stopped.statusCode,200);releaseWrite();
  assert.equal((await image).statusCode,409);assert.equal(f.api.posts,0);
  const receipt=(await f.request('/api/chat-request?'+new URLSearchParams({projectId:'p1',requestId}))).json();assert.equal(receipt.status,'stopped');
  const stored=JSON.parse(await fs.readFile(path.join(f.root,'data','chats',receipt.id+'.json'),'utf8'));assert.equal(stored.generation.status,'stopped');assert.equal(stored.messages.at(-1).outcome,'stopped');
});

test('close rejects admission and waits for a delayed text cancellation and its last checkpoint',async t=>{
  const f=await appFixture(t,{fetchImpl:async(url,opt)=>new Response(new ReadableStream({start(controller){controller.enqueue(Buffer.from('data: '+JSON.stringify({choices:[{delta:{content:'Synthetic fragment'}}]})+'\n\n'));opt.signal.addEventListener('abort',()=>setTimeout(()=>controller.error(new Error('Delayed synthetic abort')),80),{once:true});}}))});
  const response=new Res(),pending=f.request('/api/chat',{method:'POST',body:{projectId:'p1',model:'synthetic',requestId:randomUUID(),text:'Synthetic prompt',fileProfile:'none'}},response);
  await until(()=>response.records().some(event=>event.type==='delta'));const id=response.records().find(event=>event.type==='start').id;
  const started=performance.now(),closing=f.app.close();assert.equal((await f.request('/api/chat',{method:'POST',body:{}})).statusCode,503);
  assert.deepEqual(await closing,{stopped:true,terminalCheckpoints:true});await pending;assert(performance.now()-started>=70);
  const chat=JSON.parse(await fs.readFile(path.join(f.root,'data','chats',id+'.json'),'utf8'));assert.equal(chat.generation.status,'stopped');assert.equal(chat.messages.at(-1).text,'Synthetic fragment');assert.equal(f.app.lifecycle.status().closed,true);
});

test('close reports its deadline explicitly when an upstream ignores cancellation',async t=>{
  let release,called=false;
  const f=await appFixture(t,{shutdownTimeoutMs:100,fetchImpl:async()=>{called=true;await new Promise(resolve=>{release=resolve;});return new Response('data: '+JSON.stringify({choices:[{delta:{content:'late'},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n');}});
  const pending=f.request('/api/chat',{method:'POST',body:{projectId:'p1',model:'synthetic',requestId:randomUUID(),text:'Synthetic prompt',fileProfile:'none'}});
  await until(()=>called);await assert.rejects(f.app.close(),{code:'SHUTDOWN_TIMEOUT'});assert.equal(f.app.lifecycle.status().stopping,true);
  release();await pending;await until(()=>f.app.lifecycle.status().closed);
});

test('model tool capabilities retain true false and unknown with evidence from the model endpoint',async()=>{
  const service=createModelService({baseUrl:'http://127.0.0.1:9999',fetchImpl:async()=>Response.json({models:[true,false,undefined].map((value,i)=>({key:'model-'+i,type:'llm',capabilities:value===undefined?{}:{trained_for_tool_use:value}}))})});
  const models=await service.list();assert.deepEqual(models.map(model=>model.tools),[true,false,'unknown']);assert.equal(models[2].capabilityEvidence.provider,'bionic');
});
