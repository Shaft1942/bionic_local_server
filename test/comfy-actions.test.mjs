import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {createComfyImages} from '../lib/comfy-images.mjs';
import {createGpuScheduler} from '../lib/gpu-scheduler.mjs';

const owner=index=>({projectId:'fixture-project',chatId:'fixture-chat-'+index,messageId:'fixture-reply-'+index,requestId:'fixture-request-'+index});
const image=(index=0)=>({prompt:'Distinct synthetic scene '+index,seed:501+index,format:'square'});
const series=count=>({images:Array.from({length:count},(_,index)=>image(index))});
const slots=[{name:'synthetic-style.safetensors',strength:0.7}];
async function until(condition,label='expected synthetic state'){
  const deadline=Date.now()+3000;
  while(!condition()){assert(Date.now()<deadline,label);await wait(5);}
}
async function bounded(promise,label){
  let timer;
  try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),1500);})]);}
  finally{clearTimeout(timer);}
}
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-actions-test-'));
  const settingsFile=path.join(directory,'settings.json'),workflowFile=path.join(directory,'workflow.json');
  await fs.copyFile(new URL('../workflows/krea2-turbo.api.json',import.meta.url),workflowFile);
  const posts=[],requests=[],modelCalls=[],completed=new Set(),failures=new Set();
  let loaded=true,ambiguous=false,postRelease;
  const scheduler=createGpuScheduler({modelService:{
    async list(){modelCalls.push('list');return[{type:'llm',loaded,loadedInstances:loaded?[{id:'synthetic-model'}]:[]}];},
    async unload(id){modelCalls.push('unload:'+id);loaded=false;return{unloaded:true};},
  }});
  const fetchImpl=async(url,options={})=>{
    const route=new URL(url);assert(['http://127.0.0.1:8188','http://127.0.0.1:8189'].includes(route.origin));assert.equal(options.redirect,'error');
    requests.push({url:String(url),method:options.method??'GET'});
    if(route.pathname==='/object_info')return Response.json({LoraLoader:{input:{required:{lora_name:[[slots[0].name,'other.safetensors']]}}},LoraLoaderModelOnly:{input:{required:{lora_name:[[slots[0].name,'other.safetensors']]}}}});
    if(route.pathname==='/prompt'){
      const graph=JSON.parse(options.body).prompt,id='synthetic-action-'+(posts.length+1);
      assert.equal(posts.filter(post=>!completed.has(post.id)).length,0,'only one remote image runs');
      posts.push({id,graph,url:route.origin});
      if(postRelease)await postRelease.promise;
      if(ambiguous){ambiguous=false;throw Error('Synthetic ambiguous submission');}
      return Response.json({prompt_id:id});
    }
    if(route.pathname==='/queue')return Response.json({queue_running:posts.filter(post=>!completed.has(post.id)).map(post=>[0,post.id]),queue_pending:[]});
    if(route.pathname.startsWith('/history/')){
      const id=route.pathname.slice('/history/'.length),post=posts.find(entry=>entry.id===id);
      if(!completed.has(id))return Response.json({});
      if(failures.has(id))return Response.json({[id]:{status:{status_str:'error',messages:[['execution_error',{exception_message:'Synthetic failure'}]]}}});
      const output=Object.entries(post.graph).find(([,node])=>node.class_type==='SaveImage')[0];
      return Response.json({[id]:{status:{completed:true,status_str:'success'},outputs:{[output]:{images:[{filename:id+'.png',subfolder:'Synthetic',type:'output'}]}}}});
    }
    if(route.pathname==='/view'){
      const id=route.searchParams.get('filename').replace(/\.png$/,''),post=posts.find(entry=>entry.id===id);
      const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);
      bytes.writeUInt32BE(post.graph['5'].inputs.width,16);bytes.writeUInt32BE(post.graph['5'].inputs.height,20);return new Response(bytes);
    }
    if(route.pathname==='/free')return Response.json({});
    throw Error('Unexpected synthetic route '+route.pathname);
  };
  const create=()=>createComfyImages({directory,settingsFile,workflowFile,enabled:true,fetchImpl,gpuScheduler:scheduler,pollMs:10});
  let service=await create();
  t.after(async()=>{
    postRelease?.resolve();
    await bounded(service.close(),'synthetic actions service must close');scheduler.close();
    assert(!requests.some(request=>new URL(request.url).pathname==='/interrupt'));
    assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('comfy-actions-test-'));
    await fs.rm(directory,{recursive:true,force:true});
  });
  return{directory,workflowFile,posts,requests,modelCalls,completed,scheduler,get service(){return service;},
    all:()=>service.listGenerations({projectId:owner(0).projectId,includeAll:true}),
    policy:modelPolicy=>({...service.resolveSelection('krea2_turbo'),modelPolicy}),
    makeAmbiguous(){ambiguous=true;},
    holdPost(){let resolve;const promise=new Promise(done=>{resolve=done;});postRelease={promise,resolve};return()=>{resolve();postRelease=null;};},
    async finish(job,{error=false}={}){
      await until(()=>service.get(job.id).promptId,'image must be submitted before synthetic completion');
      const id=service.get(job.id).promptId;completed.add(id);if(error)failures.add(id);
      await service.refresh(job.id);await until(()=>service.get(job.id).status===(error?'failed':'succeeded'),'image must become terminal');
    },
    async restart(){await bounded(service.close(),'service must close before restart');service=await create();},
  };
}

test('cancelling a complete local unload lot removes its model barrier without unloading or posting',async t=>{
  const f=await fixture(t),releaseModel=await f.scheduler.acquireModel();
  t.after(releaseModel);
  const pending=f.service.submitSeries(series(3),owner(0),undefined,f.policy('unload'));
  await until(()=>f.all().length===3&&f.scheduler.snapshot().queuedImages===1);
  let laterStarted=false;
  const later=f.scheduler.acquireModel().then(release=>{laterStarted=true;return release;});
  await wait(15);assert.equal(laterStarted,false);
  const jobs=f.all();
  const cancelled=await Promise.all(jobs.map(job=>f.service.cancel(job.id)));
  assert(cancelled.every(job=>job.status==='cancelled'&&Number.isSafeInteger(job.cancelledAt)));
  const result=await bounded(pending,'the original submission must settle when every local image is cancelled');
  assert(result.every(job=>job.status==='cancelled'));
  (await bounded(later,'cancelling the lot must unblock later model work'))();
  assert.equal(f.scheduler.snapshot().queuedImages,0);assert.equal(f.service.getSettings().activeJobs,0);
  assert.equal(f.posts.length,0);assert.deepEqual(f.modelCalls,[]);
  assert.equal(f.service.listGenerations({projectId:owner(0).projectId}).length,0);
});

test('one local image can be cancelled during another image without cancelling its siblings or replaying after restart',async t=>{
  const f=await fixture(t);
  const jobs=await f.service.submitSeries(series(3),owner(0));
  await assert.rejects(f.service.cancel(jobs[0].id),{status:409});
  const [first,second]=await Promise.all([f.service.cancel(jobs[1].id),f.service.cancel(jobs[1].id)]);
  assert.equal(first.cancelledAt,second.cancelledAt);
  await f.finish(jobs[0]);await f.finish(jobs[2]);
  assert.equal(f.posts.length,2);assert.deepEqual(f.posts.map(post=>post.graph['3'].inputs.seed),[501,503]);
  assert.equal(f.service.get(jobs[1].id).status,'cancelled');
  await f.restart();
  const repeated=await f.service.cancel(jobs[1].id);
  assert.equal(repeated.status,'cancelled');assert.equal(repeated.cancelledAt,first.cancelledAt);
  assert.equal(f.posts.length,2);assert.equal(f.all().length,3);
  assert.equal(f.service.listGenerations({projectId:owner(0).projectId}).length,2);
});

test('cancelled tails stay cancelled when their remote sibling fails',async t=>{
  const f=await fixture(t),jobs=await f.service.submitSeries(series(3),owner(0));
  await f.service.cancel(jobs[1].id);await f.finish(jobs[0],{error:true});
  await until(()=>f.service.get(jobs[2].id).status==='failed');
  assert.equal(f.service.get(jobs[1].id).status,'cancelled');assert.equal(f.posts.length,1);
});

test('submitting, remote queued, running and unknown images reject cancellation and retry',async t=>{
  const f=await fixture(t),release=f.holdPost();
  const pending=f.service.submit(image(),owner(0));
  await until(()=>f.posts.length===1);
  const submitting=f.all()[0];assert.equal(submitting.status,'submitting');
  await assert.rejects(f.service.cancel(submitting.id),{status:409});
  await assert.rejects(f.service.retry(submitting.id,owner(1)),{status:409});
  release();const job=await pending;
  await assert.rejects(f.service.cancel(job.id),{status:409});
  await f.service.refresh(job.id);assert.equal(f.service.get(job.id).status,'running');
  await assert.rejects(f.service.cancel(job.id),{status:409});
  await assert.rejects(f.service.validateRetry(job.id),{status:409});
  await f.finish(job);
  f.makeAmbiguous();const unknown=await f.service.submit(image(2),owner(2));
  assert.equal(unknown.status,'unknown');
  await assert.rejects(f.service.cancel(unknown.id),{status:409});
  await assert.rejects(f.service.retry(unknown.id,owner(3)),{status:409});
  await assert.rejects(f.service.validateRetry(unknown.id),{status:409});
});

test('retry preserves the source recipe, same seed, provenance and idempotency despite new defaults',async t=>{
  const f=await fixture(t);
  await f.service.updateSettings({workflowId:'hassaku_illustrious',memoryCleanup:true,loraProfiles:{hassaku_illustrious:slots}});
  const source=await f.service.submit({prompt:'A precise synthetic scene',negativePrompt:'Synthetic negative',seed:42,format:'landscape'},owner(0));
  await f.finish(source);
  await f.service.updateSettings({workflowId:'krea2_turbo',memoryCleanup:false,modelPolicy:'unload',loraProfiles:{hassaku_illustrious:[{name:'other.safetensors',strength:1.3}]}});
  const before=f.posts.length;assert.equal((await f.service.validateRetry(source.id,{seedMode:'same'})).id,source.id);assert.equal(f.posts.length,before);
  const [retried,repeated]=await Promise.all([f.service.retry(source.id,owner(1),{seedMode:'same'}),f.service.retry(source.id,owner(1),{seedMode:'same'})]);
  assert.equal(retried.id,repeated.id);assert.notEqual(retried.id,source.id);assert.equal(retried.retryOf,source.id);
  assert.equal(retried.seed,source.seed);assert.equal(retried.workflowId,source.workflowId);assert.equal(retried.format,source.format);
  assert.equal(retried.memoryCleanup,true);assert.equal(retried.modelPolicy,'keep');assert.deepEqual(retried.loras,slots);
  assert.deepEqual(f.service.owner(retried.id),owner(1));
  const normalized=graph=>{const copy=structuredClone(graph);for(const node of Object.values(copy))if(node.class_type==='SaveImage')node.inputs.filename_prefix='<output>';return copy;};
  assert.deepEqual(normalized(f.posts[1].graph),normalized(f.posts[0].graph));
  await f.finish(retried);assert.equal(f.posts.length,2);
  assert.equal(f.service.getSettings().modelPolicy,'unload');assert.equal(f.service.getSettings().workflowId,'krea2_turbo');
});

test('retry with a new seed is distinct, durable and can also start from a cancelled source',async t=>{
  const f=await fixture(t),running=await f.service.submit(image(),owner(0));
  const source=await f.service.submit(image(1),owner(1));await f.service.cancel(source.id);
  const retried=await f.service.retry(source.id,owner(2),{seedMode:'new'});
  assert.notEqual(retried.seed,source.seed);assert(Number.isSafeInteger(retried.seed)&&retried.seed>=0&&retried.seed<=4294967295);
  assert.equal(retried.retryOf,source.id);assert.equal(retried.queuedLocally,true);
  await f.finish(running);await f.finish(retried);await f.restart();
  assert.equal(f.service.get(source.id).status,'cancelled');assert.equal(f.service.get(retried.id).retryOf,source.id);
  const repeated=await f.service.retry(source.id,owner(2),{seedMode:'new'});
  assert.equal(repeated.id,retried.id);assert.equal(repeated.seed,retried.seed);assert.equal(f.posts.length,2);
});

test('a failed source can be retried without mutating its terminal result',async t=>{
  const f=await fixture(t),source=await f.service.submit(image(),owner(0));await f.finish(source,{error:true});
  assert.equal((await f.service.validateRetry(source.id)).status,'failed');
  const retried=await f.service.retry(source.id,owner(1));
  assert.equal(retried.retryOf,source.id);assert.equal(retried.seed,source.seed);assert.notEqual(retried.id,source.id);
  await f.finish(retried);
  assert.equal(f.service.get(source.id).status,'failed');assert.equal(f.posts.length,2);
});

test('a cancellation survives closing while another remote image is still being monitored',async t=>{
  const f=await fixture(t),running=await f.service.submit(image(),owner(0));
  const local=await f.service.submit(image(1),owner(1)),untouched=await f.service.submit(image(2),owner(2));
  const cancelled=await f.service.cancel(local.id);await f.restart();
  assert.equal(f.service.get(local.id).status,'cancelled');assert.equal(f.service.get(local.id).cancelledAt,cancelled.cancelledAt);
  assert.equal(f.service.get(untouched.id).status,'failed');
  await f.finish(running);assert.equal(f.posts.length,1);
});

test('one retry owner cannot silently reuse another source image',async t=>{
  const f=await fixture(t),running=await f.service.submit(image(),owner(0));
  const first=await f.service.submit(image(1),owner(1)),second=await f.service.submit(image(2),owner(2));
  await f.service.cancel(first.id);await f.service.cancel(second.id);
  const results=await Promise.allSettled([f.service.retry(first.id,owner(3)),f.service.retry(second.id,owner(3))]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.equal(results[1].reason.status,409);
  await f.finish(running);await f.finish(results[0].value);assert.equal(f.posts.length,2);
});

test('URL or workflow revision changes refuse retry before another graph is persisted or posted',async t=>{
  const f=await fixture(t),source=await f.service.submit(image(),owner(0));await f.finish(source);
  await f.service.updateSettings({url:'http://127.0.0.1:8189'});
  await assert.rejects(f.service.validateRetry(source.id),{status:409});
  await assert.rejects(f.service.retry(source.id,owner(1)),{status:409});
  assert.equal(f.all().length,1);assert.equal(f.posts.length,1);
  await f.service.updateSettings({url:'http://127.0.0.1:8188'});await f.service.close();
  const graph=JSON.parse(await fs.readFile(f.workflowFile,'utf8'));graph['3'].inputs.steps++;
  await fs.writeFile(f.workflowFile,JSON.stringify(graph));await f.restart();
  await assert.rejects(f.service.validateRetry(source.id),{status:409});
  await assert.rejects(f.service.retry(source.id,owner(2)),{status:409});
  assert.equal(f.posts.length,1);assert.equal(f.all().length,1);
});

test('retry idempotency wins over full capacity and a rejected new retry creates no job',async t=>{
  const f=await fixture(t),running=await f.service.submit(image(9),owner(0));
  const source=await f.service.submit(image(8),owner(1));await f.service.cancel(source.id);
  const retried=await f.service.retry(source.id,owner(2),{seedMode:'new'});
  const first=await f.service.submitSeries(series(5),owner(3)),second=await f.service.submitSeries(series(5),owner(4));
  assert.equal(f.service.getSettings().activeJobs,12);
  const repeated=await f.service.retry(source.id,owner(2),{seedMode:'new'});
  assert.equal(repeated.id,retried.id);assert.equal(repeated.seed,retried.seed);
  await assert.rejects(f.service.retry(source.id,owner(5)),{status:409});
  assert.equal(f.service.listGenerations({projectId:owner(0).projectId,messageId:owner(5).messageId,includeAll:true}).length,0);
  for(const job of [running,retried,...first,...second])await f.finish(job);
  assert.equal(f.posts.length,12);
});

test('gallery only returns scoped successes by default and clones owners and recipe data',async t=>{
  const f=await fixture(t),first=await f.service.submit(image(),owner(0));
  const second=await f.service.submit(image(1),owner(1));await f.service.cancel(second.id);await f.finish(first);
  assert.equal(f.service.listGenerations({projectId:'another-project',includeAll:true}).length,0);
  const successful=f.service.listGenerations({projectId:owner(0).projectId});assert.equal(successful.length,1);assert.equal(successful[0].id,first.id);
  assert.equal(f.all().length,2);assert.equal(f.service.listGenerations({projectId:owner(0).projectId,chatId:owner(1).chatId,includeAll:true})[0].status,'cancelled');
  successful[0].owner.projectId='changed';successful[0].loras.push({name:'injected',strength:1});
  assert.deepEqual(f.service.owner(first.id),owner(0));assert.deepEqual(f.service.get(first.id).loras,[]);
  assert(!JSON.stringify(successful).includes('bytes'));
  for(const scope of [undefined,null,{},[],{projectId:''},{projectId:owner(0).projectId,includeAll:'yes'}])assert.throws(()=>f.service.listGenerations(scope),{status:400});
});

test('invalid action ids, options and foreign project retries have no effects',async t=>{
  const f=await fixture(t),source=await f.service.submit(image(),owner(0));await f.finish(source);
  await assert.rejects(f.service.cancel('missing'),{status:404});
  await assert.rejects(f.service.retry('missing',owner(1)),{status:404});
  await assert.rejects(f.service.retry(source.id,{...owner(1),projectId:'foreign-project'}),{status:409});
  for(const options of [null,[],{seedMode:null},{seedMode:'invalid'},{seedMode:'new',extra:true}]){
    await assert.rejects(f.service.retry(source.id,owner(2),options),{status:400});
    await assert.rejects(f.service.validateRetry(source.id,options),{status:400});
  }
  assert.equal(f.posts.length,1);assert.equal(f.all().length,1);
});
