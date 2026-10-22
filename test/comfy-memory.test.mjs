import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createComfyImages } from '../lib/comfy-images.mjs';
import { collectReleaseFiles } from '../scripts/release-files.mjs';

const owner={projectId:'p',chatId:'chat',messageId:'reply',requestId:'request'};
async function fixture(t,{busy,cleanupFailure,unrelated=false,legacy=false,success=false,race=false}={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-memory-test-')),calls=[];
  const settingsFile=path.join(directory,'settings.json');
  let service,ownedJobId,externalRunning=false;
  const fetchImpl=async(url,options={})=>{
    const route=new URL(url).pathname;calls.push({route,method:options.method??'GET'});
    if(route==='/prompt')return Response.json({prompt_id:'owned-prompt'});
    if(route==='/history/owned-prompt') {
      const status={status_str:success?'success':'error',completed:success,messages:[['execution_start',{timestamp:1000}],[success?'execution_success':'execution_interrupted',{timestamp:4500}]]};
      return Response.json({[unrelated?'somebody-elses-prompt':'owned-prompt']:{status,outputs:{'9':{images:[{filename:'image.png',subfolder:'Bionic',type:'output'}]}}}});
    }
    if(route==='/view') {
      const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.write('IHDR',12);bytes.writeUInt32BE(1024,16);bytes.writeUInt32BE(1024,20);return new Response(bytes);
    }
    if(route==='/queue') {
      if(race)externalRunning=true;
      return Response.json({queue_running:busy==='running'?[[1,'foreign-running']]:[],queue_pending:busy==='pending'?[[2,'foreign-pending']]:[]});
    }
    if(route==='/free') {
      assert.equal(options.method,'POST');assert.deepEqual(JSON.parse(options.body),{unload_models:true,free_memory:true});
      const saved=JSON.parse(await fs.readFile(path.join(directory,ownedJobId+'.json'),'utf8'));
      assert.equal(saved.status,'failed');assert.equal(saved.memoryCleanupRecovery.state,'requesting');
      if(race)assert.equal(externalRunning,true); // The request sets deferred flags, never an interrupt.
      if(cleanupFailure==='ambiguous')throw Error('Network lost after /free');
      if(cleanupFailure==='refused')return new Response('',{status:503});
      return new Response('',{status:200});
    }
    throw Error('Unexpected route '+route);
  };
  service=await createComfyImages({directory,settingsFile,enabled:true,fetchImpl,pollMs:100000});
  t.after(async()=>{await service.close();assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('comfy-memory-test-'));await fs.rm(directory,{recursive:true,force:true});});
  const job=await service.submit({prompt:'Synthetic teapot',seed:42},owner);
  ownedJobId=job.id;
  async function restart(){await service.close();service=await createComfyImages({directory,settingsFile,fetchImpl,pollMs:100000});}
  if(legacy) {
    const file=path.join(directory,job.id+'.json'),saved=JSON.parse(await fs.readFile(file,'utf8'));
    delete saved.memoryCleanupOnFailure;await fs.writeFile(file,JSON.stringify(saved));await restart();
  }
  return {job,calls,get service(){return service;},restart};
}

test('interrupted own job recovers once after terminal history and an idle queue, persisting before /free',async t=>{
  const f=await fixture(t);
  const [job,again]=await Promise.all([f.service.refresh(f.job.id),f.service.refresh(f.job.id)]);
  assert.equal(job.status,'failed');assert.equal(job.memoryCleanupRecovery.state,'requested');assert.equal(job.executionDurationMs,3500);assert.deepEqual(again,job);
  assert.deepEqual(f.calls.map(call=>call.route),['/prompt','/history/owned-prompt','/queue','/free']);
  await f.service.refresh(f.job.id);await f.restart();await f.service.refresh(f.job.id);
  assert.equal(f.calls.filter(call=>call.route==='/free').length,1);
  assert.equal((await f.service.submit({prompt:'A retry'},owner)).id,f.job.id);
  assert.equal(f.calls.filter(call=>call.route==='/prompt').length,1);
});

for(const busy of ['running','pending'])test('foreign '+busy+' job blocks failure cleanup without changing its queue',async t=>{
  const f=await fixture(t,{busy}),job=await f.service.refresh(f.job.id);
  assert.equal(job.status,'failed');assert.equal(job.memoryCleanupRecovery.state,'skipped_busy');
  assert.equal(f.calls.some(call=>call.route==='/free'),false);
  assert(f.calls.filter(call=>call.route!=='/prompt').every(call=>call.method==='GET'));
});

test('history for another prompt never frees memory or reports our job finished',async t=>{
  const f=await fixture(t,{unrelated:true}),job=await f.service.refresh(f.job.id);
  assert.equal(job.status,'queued');assert.equal(job.memoryCleanupRecovery,undefined);
  assert.equal(f.calls.some(call=>call.route==='/free'),false);
});

test('legacy reloaded jobs never gain cleanup side effects',async t=>{
  const f=await fixture(t,{legacy:true}),job=await f.service.refresh(f.job.id);
  assert.equal(job.status,'failed');assert.equal(job.memoryCleanupRecovery,undefined);
  assert.deepEqual(f.calls.map(call=>call.route),['/prompt','/history/owned-prompt']);
});

for(const cleanupFailure of ['ambiguous','refused'])test('cleanup '+cleanupFailure+' remains terminal and is not retried after restart',async t=>{
  const f=await fixture(t,{cleanupFailure}),job=await f.service.refresh(f.job.id);
  assert.equal(job.status,'failed');assert.equal(job.memoryCleanupRecovery.state,cleanupFailure==='ambiguous'?'unknown':'failed');
  await f.restart();await f.service.refresh(f.job.id);
  assert.equal(f.calls.filter(call=>call.route==='/free').length,1);
  assert.equal(f.calls.filter(call=>call.route==='/prompt').length,1);
});

test('a racing external job receives no interrupt or queue mutation',async t=>{
  const f=await fixture(t,{race:true}),job=await f.service.refresh(f.job.id);
  assert.equal(job.memoryCleanupRecovery.state,'requested');
  assert.deepEqual(f.calls.filter(call=>call.method==='POST').map(call=>call.route),['/prompt','/free']);
});

test('successful workflow reports execution time and keeps its final cleanup node without extra /free',async t=>{
  const f=await fixture(t,{success:true}),job=await f.service.refresh(f.job.id);
  assert.equal(job.status,'succeeded');assert.equal(job.executionDurationMs,3500);assert.equal(job.memoryCleanup,true);assert.equal(job.memoryCleanupRecovery,undefined);
  assert.equal(f.calls.some(call=>call.route==='/free'),false);
  for(const [file,output]of [['krea2-turbo.api.json','9'],['hassaku-illustrious.api.json','19']]) {
    const graph=JSON.parse(await fs.readFile(new URL('../workflows/'+file,import.meta.url),'utf8'));
    assert.equal(graph['99'].class_type,'FreeMemoryAfterWorkflow');assert.deepEqual(graph['99'].inputs.trigger,[output,0]);assert.equal(graph[output].class_type,'SaveImage');
  }
});

test('downloadable releases include the standalone cleanup module and its installation guide',async()=>{
  const files=await collectReleaseFiles();
  assert(files.some(file=>file.path==='comfyui/custom_nodes/free_memory_after_workflow.py'));
  assert(files.some(file=>file.path==='comfyui/README.md'));
});
