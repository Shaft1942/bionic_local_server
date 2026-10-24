import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as wait} from 'node:timers/promises';
import {createComfyImages} from '../lib/comfy-images.mjs';

const owner={projectId:'p1',chatId:'web-series',messageId:'reply-series',requestId:'request-series'};
const images=(prefix='Series')=>[
  {prompt:prefix+' red bicycle beside a stone wall',seed:101,format:'square'},
  {prompt:prefix+' wooden sailboat at dawn',seed:102,format:'portrait'},
  {prompt:prefix+' yellow tram in an empty street',seed:103,format:'landscape'},
];
const countedImages=(prefix,count)=>Array.from({length:count},(_,index)=>({prompt:prefix+' distinct subject '+(index+1),seed:301+index,format:['square','portrait','landscape'][index%3]}));
async function until(condition,label='expected fixture state'){
  const deadline=Date.now()+4000;
  while(!condition()){assert(Date.now()<deadline,label);await wait(5);}
}
async function bounded(promise,label,timeout=2000){
  let timer;
  try{return await Promise.race([promise,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error(label)),timeout);})]);}
  finally{clearTimeout(timer);}
}
async function fixture(t,options={}){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-series-test-'));
  const settingsFile=path.join(directory,'settings.json');
  const posts=[],completed=new Set(),requests=[];let maxRunning=0,ambiguousNext=false,refusedNext=false,catalogReply;
  const fetchImpl=async(url,request={})=>{
    assert(String(url).startsWith('http://127.0.0.1:8188/'));
    assert.equal(request.redirect,'error');
    requests.push(String(url));
    if(url.endsWith('/object_info')){
      if(catalogReply)return catalogReply;
      return Response.json({LoraLoaderModelOnly:{input:{required:{lora_name:[['synthetic-style.safetensors']]}}}});
    }
    if(url.endsWith('/prompt')){
      const body=JSON.parse(request.body),id='synthetic-'+(posts.length+1);
      posts.push({id,body});maxRunning=Math.max(maxRunning,posts.filter(post=>!completed.has(post.id)).length);
      if(ambiguousNext){ambiguousNext=false;throw Error('Synthetic network loss after submission');}
      if(refusedNext){refusedNext=false;completed.add(id);return Response.json({error:{message:'Synthetic model refused'}},{status:400});}
      return Response.json({prompt_id:id});
    }
    if(url.includes('/history/')){
      const id=decodeURIComponent(url.slice(url.lastIndexOf('/')+1));
      if(!completed.has(id))return Response.json({});
      const post=posts.find(post=>post.id===id);
      assert(post,'history only observes submitted synthetic prompts');
      return Response.json({[id]:{status:{status_str:'success',completed:true},outputs:{'9':{images:[{filename:id+'.png',subfolder:'Synthetic',type:'output'}]}}}});
    }
    if(url.endsWith('/queue'))return Response.json({queue_running:posts.filter(post=>!completed.has(post.id)).map(post=>[0,post.id]),queue_pending:[]});
    if(url.includes('/view?')){
      const filename=new URL(url).searchParams.get('filename');
      const post=posts.find(post=>filename===post.id+'.png');assert(post);
      const {width,height}=post.body.prompt['5'].inputs;
      const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(width,16);bytes.writeUInt32BE(height,20);
      return new Response(bytes);
    }
    throw Error('Unexpected synthetic ComfyUI route '+url);
  };
  let service=await createComfyImages({directory,settingsFile,enabled:true,fetchImpl,pollMs:10,...options});
  t.after(async()=>{
    await bounded(service.close(),'synthetic image service did not close');
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('comfy-series-test-'));
    await fs.rm(directory,{recursive:true,force:true});
  });
  return {directory,posts,completed,requests,get maxRunning(){return maxRunning;},get service(){return service;},
    makeNextAmbiguous(){ambiguousNext=true;},makeNextRefused(){refusedNext=true;},
    holdCatalog(){let release;catalogReply=new Promise(resolve=>{release=()=>resolve(Response.json({LoraLoaderModelOnly:{input:{required:{lora_name:[['synthetic-style.safetensors']]}}}}));});return release;},
    async finish(job){
      await until(()=>service.get(job.id).promptId,'image was not submitted');
      completed.add(service.get(job.id).promptId);
      await service.refresh(job.id);
      await until(()=>service.get(job.id).status==='succeeded','completed image was not saved');
    },
    async restart(){await service.close();service=await createComfyImages({directory,settingsFile,enabled:true,fetchImpl,pollMs:10,...options});},
  };
}

test('series validates two to five images before persistence or HTTP submission',async t=>{
  const f=await fixture(t);
  const valid=images();
  for(const args of [
    {images:[]}, {images:valid.slice(0,1)}, {images:countedImages('Too many',6)}, {images:Array(2)},
    {images:[...valid,valid[0]]}, {images:[valid[0],valid[1],{prompt:''}]},
    {images:[valid[0],valid[1],{prompt:'third',seed:-1}]}, {images:[valid[0],valid[1],{prompt:'third',format:'__proto__'}]},
    {images:[valid[0],valid[1],{prompt:'third',url:'http://example.org'}]}, {images:valid,arbitrary:true},
    {images:[valid[0],valid[1],{...valid[2],prompt:valid[0].prompt.toUpperCase()}]},
    {images:[valid[0],valid[1],{...valid[2],seed:valid[0].seed}]},
  ])await assert.rejects(f.service.submitSeries(args,owner),{status:400});
  assert.equal(f.posts.length,0);
  assert.equal(f.service.getSettings().activeJobs,0);
  assert.deepEqual((await fs.readdir(f.directory)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name)),[]);
});

for(const count of [2,4,5])test(`a ${count}-image series pins its metadata and submits every distinct graph once in order`,async t=>{
  const f=await fixture(t,{memoryCleanup:true});
  const input=countedImages('Count '+count,count);
  const jobs=await f.service.submitSeries({images:input},owner);
  assert.equal(jobs.length,count);assert.equal(new Set(jobs.map(job=>job.seriesId)).size,1);assert(jobs[0].seriesId);
  assert.deepEqual(jobs.map(job=>job.seriesIndex),Array.from({length:count},(_,index)=>index+1));
  assert(jobs.every(job=>job.seriesTotal===count));
  for(const job of jobs){assert.deepEqual(f.service.owner(job.id),owner);await f.finish(job);}
  assert.equal(f.posts.length,count);assert.equal(f.maxRunning,1);
  assert.deepEqual(f.posts.map(post=>post.body.prompt['6'].inputs.text),input.map(image=>image.prompt));
  assert.deepEqual(f.posts.map(post=>post.body.prompt['3'].inputs.seed),input.map(image=>image.seed));
  assert(f.posts.every(post=>Object.hasOwn(post.body.prompt,'99')));
  const repeated=await f.service.submitSeries({images:countedImages('Ignored',count)},owner);
  assert.deepEqual(repeated.map(job=>job.id),jobs.map(job=>job.id));assert.equal(f.posts.length,count);
});

for(const count of [1,2,5])test(`direct ${count}-image batch preserves its prompt, uses distinct bounded seeds and recovers every job`,async t=>{
  const f=await fixture(t,{memoryCleanup:true});
  const args={prompt:'An identical direct workshop prompt',seed:4294967295,format:'square'};
  const jobs=await f.service.submitBatch(args,count,owner);
  assert.equal(jobs.length,count);
  assert.deepEqual(jobs.map(job=>job.seed),Array.from({length:count},(_,index)=>(4294967295+index)%4294967296));
  assert(jobs.every(job=>job.prompt===args.prompt));
  const repeat=await f.service.submitBatch({...args,prompt:'Ignored retry prompt'},count,owner);
  assert.deepEqual(repeat.map(job=>job.id),jobs.map(job=>job.id));
  for(const job of jobs)await f.finish(job);
  assert.equal(f.posts.length,count);assert.equal(f.maxRunning,1);
  assert(f.posts.every(post=>post.body.prompt['6'].inputs.text===args.prompt&&Object.hasOwn(post.body.prompt,'99')));
  await f.restart();
  assert.deepEqual(f.service.findAllForOwner(owner).map(job=>job.id),jobs.map(job=>job.id));
  assert.deepEqual(f.service.findAllForOwner({...owner,requestId:'other-request'}),[]);
  assert.deepEqual(f.service.findAllForOwner({...owner,projectId:'other-project'}),[]);
  const recovered=await f.service.submitBatch(args,count,owner);
  assert.deepEqual(recovered.map(job=>job.id),jobs.map(job=>job.id));assert.equal(f.posts.length,count);
});

test('direct batch rejects invalid counts and parameters before persistence and reserves capacity atomically',async t=>{
  const f=await fixture(t);
  for(const count of [0,6,1.5,'2',null,undefined])await assert.rejects(f.service.submitBatch({prompt:'Direct batch'},count,owner),{status:400});
  await assert.rejects(f.service.submitBatch({prompt:'Direct batch',seed:-1},2,owner),{status:400});
  assert.equal(f.posts.length,0);assert.equal(f.service.getSettings().activeJobs,0);
  const first=await f.service.submitBatch({prompt:'First batch',seed:10},5,owner);
  const second=await f.service.submitBatch({prompt:'Second batch',seed:20},5,{...owner,messageId:'second'});
  await assert.rejects(f.service.submitBatch({prompt:'Overflow',seed:30},3,{...owner,messageId:'overflow'}),{status:409});
  assert.equal(f.service.getSettings().activeJobs,10);
  assert.equal((await fs.readdir(f.directory)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name)).length,10);
  for(const job of [...first,...second])await f.finish(job);
  assert.deepEqual(f.posts.map(post=>post.body.prompt['6'].inputs.text),[...Array(5).fill('First batch'),...Array(5).fill('Second batch')]);
  assert.equal(f.maxRunning,1);
});

test('mixed five-image lots keep the twelve-image capacity atomic and preserve FIFO groups',async t=>{
  const f=await fixture(t);
  const firstInput=countedImages('First',5),secondInput=countedImages('Second',5),lastInput=countedImages('Last',2);
  const first=await f.service.submitSeries({images:firstInput},owner);
  const second=await f.service.submitSeries({images:secondInput},{...owner,chatId:'second-chat',messageId:'second-reply'});
  const lastOwner={...owner,chatId:'last-chat',messageId:'last-reply'};
  await assert.rejects(f.service.submitSeries({images:countedImages('Overflow',3)},lastOwner),{status:409});
  assert.equal(f.service.getSettings().activeJobs,10);
  const last=await f.service.submitSeries({images:lastInput},lastOwner);
  assert.equal(f.service.getSettings().activeJobs,12);
  assert.equal((await fs.readdir(f.directory)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name)).length,12);
  for(const job of [...first,...second,...last])await f.finish(job);
  assert.deepEqual(f.posts.map(post=>post.body.prompt['6'].inputs.text),[...firstInput,...secondInput,...lastInput].map(image=>image.prompt));
  assert.equal(f.posts.length,12);assert.equal(f.maxRunning,1);
});

test('three distinct prompts execute sequentially with memory cleanup after every image when enabled',async t=>{
  const f=await fixture(t,{memoryCleanup:true});
  const first=await f.service.submitSeries({images:images('First')},owner);
  const other={...owner,chatId:'web-other',messageId:'reply-other',requestId:'request-other'};
  const second=await f.service.submitSeries({images:images('Second')},other);
  assert.equal(first.length,3);assert.equal(second.length,3);
  assert.equal(new Set(first.map(job=>job.seriesId)).size,1);assert.equal(new Set(second.map(job=>job.seriesId)).size,1);
  assert.notEqual(first[0].seriesId,second[0].seriesId);
  assert.deepEqual(first.map(job=>job.seriesIndex),[1,2,3]);assert(first.every(job=>job.seriesTotal===3));
  assert(second.every(job=>job.queuedLocally===true&&!job.promptId));
  await until(()=>f.posts.length===1);
  await wait(30);assert.equal(f.posts.length,1,'only one graph is submitted while the first image is running');
  for(const job of [...first,...second])await f.finish(job);
  assert.equal(f.posts.length,6);assert.equal(f.maxRunning,1);
  assert.deepEqual(f.posts.map(post=>post.body.prompt['6'].inputs.text),[...images('First'),...images('Second')].map(image=>image.prompt));
  assert.deepEqual(f.posts.map(post=>post.body.prompt['3'].inputs.seed),[101,102,103,101,102,103]);
  assert.deepEqual(f.posts.map(post=>Object.hasOwn(post.body.prompt,'99')),[true,true,true,true,true,true]);
  for(const [index,job]of [...first,...second].entries()){
    const publicJob=f.service.get(job.id);
    assert.equal(publicJob.status,'succeeded');assert.equal(publicJob.format,images()[index%3].format);
    assert.equal((await f.service.image(job.id)).bytes.length,24);
  }
  assert.equal(f.service.getSettings().activeJobs,0);
});

test('series reservations are atomic across conversations and the twelve-image capacity never partially admits a lot',async t=>{
  const f=await fixture(t);
  const outcomes=await Promise.allSettled(Array.from({length:5},(_,index)=>f.service.submitSeries({images:images('Lot '+index)},{...owner,chatId:'chat-'+index,messageId:'reply-'+index,requestId:'request-'+index})));
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,4);
  assert.equal(outcomes.filter(result=>result.status==='rejected'&&result.reason.status===409).length,1);
  assert.equal(f.service.getSettings().activeJobs,12);
  const accepted=outcomes.filter(result=>result.status==='fulfilled').flatMap(result=>result.value);
  assert.equal(new Set(accepted.map(job=>job.id)).size,12);
  const saved=(await fs.readdir(f.directory)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name));assert.equal(saved.length,12);
  for(const job of accepted)await f.finish(job);
  assert.equal(f.posts.length,12);assert.equal(f.maxRunning,1);
  assert(f.posts.every(post=>!Object.hasOwn(post.body.prompt,'99')),'disabling cleanup retains its meaning for every image in a series');
});

test('repeated series requests for one reply reuse all three jobs and preserve their original owner',async t=>{
  const f=await fixture(t);
  const original={...owner};
  const [first,repeated]=await Promise.all([
    f.service.submitSeries({images:images()},original),
    f.service.submitSeries({images:images('Repeated')},{...owner}),
  ]);
  assert.deepEqual(first.map(job=>job.id),repeated.map(job=>job.id));
  original.projectId='changed';original.chatId='changed';
  for(const job of first)assert.deepEqual(f.service.owner(job.id),owner);
  for(const job of first)await f.finish(job);
  assert.equal(f.posts.length,3);assert(f.posts.every(post=>!post.body.prompt['6'].inputs.text.startsWith('Repeated')));
  const after=await f.service.submitSeries({images:images('After success')},owner);
  assert.deepEqual(after.map(job=>job.id),first.map(job=>job.id));assert.equal(f.posts.length,3);
});

test('different projects cannot collide when they happen to use the same chat and reply identifiers',async t=>{
  const f=await fixture(t);
  const first=await f.service.submitSeries({images:images()},owner);
  const second=await f.service.submitSeries({images:images('Project two')},{...owner,projectId:'p2'});
  assert.equal(new Set([...first,...second].map(job=>job.id)).size,6);
  for(const job of [...first,...second])await f.finish(job);
  assert.equal(f.posts.length,6);
});

test('aborted series is refused before admitting any image',async t=>{
  const f=await fixture(t),controller=new AbortController();controller.abort();
  await assert.rejects(f.service.submitSeries({images:images()},owner,controller.signal));
  assert.equal(f.posts.length,0);assert.equal(f.service.getSettings().activeJobs,0);
});

test('the image scheduler is acquired once for the full series and receives the frozen model policy',async t=>{
  const calls=[];
  const f=await fixture(t,{gpuScheduler:{async acquireImages(options){calls.push({type:'acquire',policy:options.policy});return()=>{calls.push({type:'release'});};}}});
  const selection={...f.service.resolveSelection('krea2_turbo'),modelPolicy:'unload'};
  const jobs=await f.service.submitSeries({images:images()},owner,undefined,selection);
  selection.modelPolicy='keep';
  await until(()=>calls.some(call=>call.type==='acquire'));
  assert.deepEqual(calls,[{type:'acquire',policy:'unload'}]);
  await f.finish(jobs[0]);await f.finish(jobs[1]);assert.equal(calls.length,1);
  await f.finish(jobs[2]);await until(()=>calls.some(call=>call.type==='release'));
  assert.deepEqual(calls,[{type:'acquire',policy:'unload'},{type:'release'}]);
});

test('locally queued images neither contact ComfyUI nor consume their execution deadline while awaiting a lease',async t=>{
  let admitImages;
  const f=await fixture(t,{deadlineMs:80,gpuScheduler:{acquireImages(){return new Promise(resolve=>{admitImages=()=>resolve(()=>{});});}}});
  const pending=f.service.submitSeries({images:images()},owner);
  try{
    await until(()=>typeof admitImages==='function');
    const saved=(await fs.readdir(f.directory)).filter(name=>/^[a-f0-9-]{36}\.json$/i.test(name));
    const localJob=JSON.parse(await fs.readFile(path.join(f.directory,saved[0]),'utf8'));
    await wait(120);
    assert.equal((await f.service.refresh(localJob.id)).status,'queued');
    assert.equal(f.requests.length,0);
  }finally{admitImages?.();}
  const jobs=await pending;
  for(const job of jobs)await f.finish(job);
  assert(jobs.every(job=>f.service.get(job.id).status==='succeeded'));
});

test('definitive rejection fails the remaining series and lets the next conversation advance',async t=>{
  const f=await fixture(t);f.makeNextRefused();
  const first=await f.service.submitSeries({images:images()},owner);
  await until(()=>first.every(job=>f.service.get(job.id).status==='failed'),'the rejected series did not fail all three jobs');
  const next=await f.service.submitSeries({images:images('Next conversation')},{...owner,chatId:'web-next',messageId:'reply-next'});
  for(const job of next)await f.finish(job);
  assert.equal(f.posts.length,4);
});

test('ambiguous submission suspends the shared queue instead of risking simultaneous images or automatic replay',async t=>{
  const f=await fixture(t);f.makeNextAmbiguous();
  // Admit another conversation before the first ambiguous POST is processed.
  // It must remain local even when ComfyUI might still be executing that POST.
  const firstPending=f.service.submitSeries({images:images()},owner);
  const nextPending=f.service.submitSeries({images:images('Next conversation')},{...owner,chatId:'web-next',messageId:'reply-next'});
  const [first,next]=await Promise.all([firstPending,nextPending]);
  await until(()=>f.service.get(first[0].id).status==='unknown');
  await until(()=>f.service.getSettings().queuePaused===true);
  await wait(40);assert.equal(f.posts.length,1);
  const repeated=await f.service.submitSeries({images:images('Do not replay')},owner);
  assert.deepEqual(repeated.map(job=>job.id),first.map(job=>job.id));assert.equal(f.posts.length,1);
  assert(next.every(job=>!f.service.get(job.id).promptId));
  await assert.rejects(f.service.submitSeries({images:images('New reply')},{...owner,messageId:'reply-after-pause'}),{status:409});
});

test('restart never submits locally queued images and retrying the reply reuses the persisted series',async t=>{
  const f=await fixture(t);
  const first=await f.service.submitSeries({images:images()},owner);
  await until(()=>f.posts.length===1);
  await f.restart();await wait(30);
  assert.equal(f.posts.length,1);
  assert(first.slice(1).every(job=>f.service.get(job.id).status==='failed'));
  const repeated=await f.service.submitSeries({images:images('Do not replay')},owner);
  assert.deepEqual(repeated.map(job=>job.id),first.map(job=>job.id));assert.equal(f.posts.length,1);
  await f.finish(first[0]);await wait(30);assert.equal(f.posts.length,1);
});

test('closing during LoRA catalog validation ends admission without submitting or leaving a pending close',async t=>{
  const f=await fixture(t);
  await f.service.updateSettings({loraProfiles:{krea2_turbo:[{name:'synthetic-style.safetensors',strength:1}]}});
  const releaseCatalog=f.holdCatalog();
  const pending=f.service.submitSeries({images:images()},owner);
  const refused=assert.rejects(pending,{status:503});
  await until(()=>f.requests.some(url=>url.endsWith('/object_info')));
  const closing=f.service.close();releaseCatalog();
  await bounded(Promise.all([refused,closing]),'closing during catalog lookup left unresolved admission');
  assert.equal(f.posts.length,0);assert.equal(f.service.getSettings().activeJobs,0);
});
