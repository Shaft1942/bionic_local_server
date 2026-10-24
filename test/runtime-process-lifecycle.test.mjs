import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalServiceSupervisor } from '../lib/local-service-supervisor.mjs';
import { createLlamaServerManager } from '../lib/llama-server-settings.mjs';

async function fixture(t, id) {
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'runtime11-cycle-'))),effects=[];
  const state={running:false,uncertainStop:false,external:false,fingerprint:'synthetic-profile'};
  const profile={id,type:id==='bionic'?'bionic-cli':'comfyui-python',url:'http://fixture.invalid',fingerprint:'synthetic-profile',exclusiveControl:true};
  const options={root,profilesLoader:async()=>({revision:'synthetic',errors:{},[id]:{...profile,fingerprint:state.fingerprint}}),adapters:{
    async observe(_profile,receipt){return {process:{state:receipt?(state.running?'running':'stopped'):'external'},api:{state:state.running||state.external?'ready':'unavailable'},activity:{state:'idle'},model:{state:'unknown'}};},
    async start(){effects.push('start');state.running=true;return {profileFingerprint:state.fingerprint};},
    async stop(){effects.push('stop');state.running=false;if(state.uncertainStop)throw Object.assign(Error('Synthetic stop response lost'),{code:'termination_unconfirmed'});},
  }};
  const instances=[];
  const open=async()=>{const supervisor=await createLocalServiceSupervisor(options);instances.push(supervisor);return supervisor;};
  t.after(async()=>{await Promise.all(instances.map(value=>value.close()));assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('runtime11-cycle-'));await fs.rm(root,{recursive:true,force:true});});
  return {state,effects,open,async act(supervisor,action){const service=(await supervisor.snapshot()).services.find(value=>value.id===id);return supervisor.action(id,{action,expectedRevision:service.revision,idempotencyKey:randomUUID()});}};
}
async function terminal(supervisor,id){for(let i=0;i<100;i++){const operation=await supervisor.operation(id);if(!['accepted','running'].includes(operation.status))return operation;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Synthetic operation did not settle');}

for(const id of ['bionic','comfyui'])test(`${id} owned start, lost stop acknowledgement, reread and fresh start recover without replay`,async t=>{
  const f=await fixture(t,id),first=await f.open();
  const started=await f.act(first,'start');assert.equal((await terminal(first,started.id)).status,'succeeded');
  assert.equal((await first.snapshot()).services.find(value=>value.id===id).actions.stop.allowed,true);
  f.state.uncertainStop=true;
  const stopped=await f.act(first,'stop');assert.equal((await terminal(first,stopped.id)).status,'unknown');
  assert.throws(()=>first.assertAdmission());assert.deepEqual(f.effects,['start','stop']);
  await first.close();const resumed=await f.open();
  await resumed.reload();
  assert.equal((await resumed.operation(stopped.id)).status,'succeeded');
  assert.doesNotThrow(()=>resumed.assertAdmission());
  const ready=(await resumed.snapshot()).services.find(value=>value.id===id);
  assert.equal(ready.process.state,'external');assert.equal(ready.actions.start.allowed,true);assert.equal(ready.actions.stop.allowed,false);
  assert.deepEqual(f.effects,['start','stop'],'Reload confirms only; it never signals or launches');
  const restarted=await f.act(resumed,'start');assert.equal((await terminal(resumed,restarted.id)).status,'succeeded');
  assert.equal((await resumed.snapshot()).services.find(value=>value.id===id).actions.stop.allowed,true);
  assert.deepEqual(f.effects,['start','stop','start']);
});

test('changed profile cannot reconcile an old stop, and an external ready API is never adopted',async t=>{
  const f=await fixture(t,'bionic'),supervisor=await f.open();
  f.state.external=true;
  let service=(await supervisor.snapshot()).services[0];
  await assert.rejects(f.act(supervisor,'stop'),{code:'external_service'});assert.deepEqual(f.effects,[]);
  f.state.external=false;const started=await f.act(supervisor,'start');await terminal(supervisor,started.id);
  f.state.uncertainStop=true;const stopped=await f.act(supervisor,'stop');await terminal(supervisor,stopped.id);
  f.state.fingerprint='changed-profile';await supervisor.reload();
  assert.equal((await supervisor.operation(stopped.id)).status,'unknown');assert.throws(()=>supervisor.assertAdmission());
  assert.deepEqual(f.effects,['start','stop']);
});

function llamaFixture(){
  const state={alive:false,ready:true,foreign:false,lostStop:false},effects=[];
  const profile={revision:'synthetic',directory:'/synthetic/models',binaryPath:'/synthetic/llama',port:1238,endpoint:'http://127.0.0.1:1238',contextSize:1024,gpuLayers:0},model={id:'a'.repeat(64),name:'Synthetic',filename:'/synthetic/model.gguf',fileIdentity:{ino:1}};
  const manager=createLlamaServerManager({settings:{snapshot:()=>({...profile}),validateBinary:async()=>({filename:profile.binaryPath,identity:{ino:2}}),library:{resolveModel:async()=>({...model})}},processBackend:{
    occupied:async()=>state.alive||state.foreign,
    launch:async()=>{effects.push('start');state.alive=true;return {};},
    inspect:async()=>state.alive?{state:state.ready?'running':'starting',owned:true}:{state:'stopped',owned:false,exitConfirmed:true},
    stop:async()=>{effects.push('stop');state.alive=false;if(state.lostStop)throw Object.assign(Error('Synthetic lost stop'),{code:'llama-stop-unknown',status:409});},close(){}
  },assertIdle:async()=>{},assertConnectorAvailable:async()=>{},startTimeoutMs:2,pollMs:1});
  return {state,effects,manager,input:action=>({action,requestId:randomUUID(),expectedRevision:profile.revision,modelId:model.id,consent:true})};
}
test('llama owned cycle confirms a lost stop on reread and never adopts an external listener',async t=>{
  const f=llamaFixture();t.after(()=>f.manager.close());
  assert.equal((await f.manager.action(f.input('start'))).process.owned,true);
  f.state.lostStop=true;await assert.rejects(f.manager.action(f.input('stop')),{code:'llama-stop-unknown'});
  const status=await f.manager.snapshot();assert.equal(status.lifecycle.reconciliationRequired,false);assert.equal(status.operation.state,'succeeded');assert.equal(status.process.owned,false);
  f.state.foreign=true;assert.equal((await f.manager.snapshot()).process.state,'detected-unowned');
  await assert.rejects(f.manager.action(f.input('stop')),{code:'llama-not-owned'});assert.deepEqual(f.effects,['start','stop']);
});
test('llama child still loading can be explicitly stopped without waiting forever for ready API',async t=>{
  const f=llamaFixture();t.after(()=>f.manager.close());f.state.ready=false;
  await assert.rejects(f.manager.action(f.input('start')),{code:'llama-start-unknown'});
  assert.equal((await f.manager.snapshot()).process.owned,true);
  assert.equal((await f.manager.action(f.input('stop'))).operation.state,'succeeded');
  assert.equal((await f.manager.snapshot()).lifecycle.reconciliationRequired,false);assert.deepEqual(f.effects,['start','stop']);
});
