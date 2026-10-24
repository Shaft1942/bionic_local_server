import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalServiceAdapters } from '../lib/local-service-adapters.mjs';
import { createLocalServiceSupervisor } from '../lib/local-service-supervisor.mjs';

const native={pid:4321,createdAt:'638000000000000000',executable:'C:/fixture/Bionic.exe'};
const cliIdentity={size:100,sha256:'a'.repeat(64)};
const profile={id:'bionic',type:'bionic-cli',port:1235,url:'http://fixture.invalid:1235',fingerprint:'approved-profile',appPath:native.executable,cliPath:'C:/fixture/lms.exe',apiInfoPath:'C:/fixture/info.json',exclusiveControl:true,startTimeoutMs:10,fileIdentity:{cliPath:cliIdentity}};
function fixture({preexisting=false}={}){
  const state={desktop:preexisting,api:false,launched:false,changed:false,lostStop:false,failBeforeStop:false,noReady:false,captureChanged:false},effects=[];
  const desktopProcess={
    async capture(value){assert.equal(value.pid,native.pid);if(state.captureChanged)throw Object.assign(Error('changed'),{code:'desktop_identity_changed',effectAttempted:false});return{...native};},
    async inspect(value){assert.deepEqual(value,native);if(state.changed)throw Object.assign(Error('PID reused'),{code:'desktop_identity_changed',effectAttempted:false});return{state:state.desktop?'running':'stopped'};},
    async stop(value){assert.deepEqual(value,native);if(state.changed)throw Object.assign(Error('PID reused'),{code:'desktop_identity_changed',effectAttempted:false});if(state.failBeforeStop)throw Object.assign(Error('No signal yet'),{code:'desktop_identity_unconfirmed',effectAttempted:false});effects.push('desktop-stop');state.desktop=false;if(state.lostStop)throw Object.assign(Error('Lost native receipt'),{code:'desktop_status_unconfirmed',effectAttempted:true});return{state:'stopped'};}
  };
  const options={platform:'win32',pollMs:1,desktopProcess,readCliIdentity:async()=>({...cliIdentity}),inspectController:async()=>state.api?{...native,configIdentity:{ino:1}}:null,inspectDesktop:async()=>state.launched&&state.desktop,inspectPort:async()=>state.api?'present':'absent',
    spawnImpl(){effects.push('desktop-start');state.desktop=true;state.launched=true;const child=new EventEmitter();child.pid=native.pid;child.unref=()=>{};return child;},
    execFileImpl:async(_filename,args)=>{
      if(args[1]==='start'){effects.push('api-start');state.api=true;}
      if(args[1]==='stop'){effects.push('api-stop');state.api=false;}
      const status=state.desktop?(state.noReady?{running:false}:{running:state.api,port:profile.port}):{running:false};
      return{stdout:JSON.stringify(status)};
    },
    fetchImpl:async()=>{if(!state.api)throw Error('Synthetic API absent');return{ok:true,json:async()=>({models:[]})};}
  };
  return{state,effects,options,adapters:createLocalServiceAdapters(options)};
}
test('cold Desktop receipt survives restart; API stops before exactly its owned Desktop',async()=>{
  const f=fixture(),receipt=await f.adapters.start(profile);assert.equal(receipt.desktopPid,native.pid);assert.deepEqual(receipt.desktopIdentity,native);
  const restarted=createLocalServiceAdapters(f.options),status=await restarted.observe(profile,JSON.parse(JSON.stringify(receipt)));
  assert.equal(status.process.ownership,'desktop-and-api');assert.equal(status.process.desktopState,'running');
  assert(!JSON.stringify(status).includes(native.executable));assert(!JSON.stringify(status).includes(native.createdAt));
  await restarted.stop(profile,receipt);assert.deepEqual(f.effects,['desktop-start','api-start','api-stop','desktop-stop']);
  assert.equal((await restarted.observe(profile,receipt)).process.state,'stopped');assert.equal(f.state.desktop,false);
});
test('legacy spawned receipt with strong controller identity can close only that same Desktop',async()=>{
  const f=fixture(),receipt=await f.adapters.start(profile);delete receipt.desktopIdentity;
  await f.adapters.stop(profile,receipt);assert.deepEqual(f.effects,['desktop-start','api-start','api-stop','desktop-stop']);
});
test('Desktop that predates Canae remains open after its API-only stop',async()=>{
  const f=fixture({preexisting:true}),receipt=await f.adapters.start(profile);
  assert.equal(receipt.desktopPid,undefined);assert.equal((await f.adapters.observe(profile,receipt)).process.ownership,'api-only');
  await f.adapters.stop(profile,receipt);assert.deepEqual(f.effects,['api-start','api-stop']);assert.equal(f.state.desktop,true);
});
test('reused PID or changed birth identity never receives a Desktop stop',async()=>{
  const f=fixture(),receipt=await f.adapters.start(profile),before=[...f.effects];f.state.changed=true;
  await assert.rejects(f.adapters.stop(profile,receipt),{code:'identity_unconfirmed'});
  assert.deepEqual(f.effects,before);assert.equal(f.state.desktop,true);
});
async function supervised(t,f){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'desktop11-cycle-'))),instances=[];
  const open=async()=>{const supervisor=await createLocalServiceSupervisor({root,...f.options,profilesLoader:async()=>({revision:'fixture',errors:{},bionic:profile}),processBackend:{},reserve:()=>{if(f.state.busy)throw Object.assign(Error('Synthetic active work'),{code:'service_busy'});return()=>{};}});instances.push(supervisor);return supervisor;};
  t.after(async()=>{await Promise.all(instances.map(value=>value.close()));assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('desktop11-cycle-'));await fs.rm(root,{recursive:true,force:true});});
  return{open,act:async(supervisor,action)=>{const current=(await supervisor.snapshot()).services[0];return supervisor.action('bionic',{action,expectedRevision:current.revision,idempotencyKey:randomUUID()});}};
}
async function terminal(supervisor,id){for(let n=0;n<100;n++){const op=await supervisor.operation(id);if(!['accepted','running'].includes(op.status))return op;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('Synthetic operation timeout');}
test('lost Desktop stop response is recovered by reread without a second termination',async t=>{
  const f=fixture(),control=await supervised(t,f),first=await control.open();
  await terminal(first,(await control.act(first,'start')).id);f.state.lostStop=true;
  const stopped=await control.act(first,'stop');assert.equal((await terminal(first,stopped.id)).status,'unknown');await first.close();
  const resumed=await control.open();await resumed.reload();assert.equal((await resumed.operation(stopped.id)).status,'succeeded');assert.doesNotThrow(()=>resumed.assertAdmission());
  assert.deepEqual(f.effects,['desktop-start','api-start','api-stop','desktop-stop']);
});
test('an idempotent request never repeats a successful Desktop stop',async t=>{
  const f=fixture(),control=await supervised(t,f),supervisor=await control.open();await terminal(supervisor,(await control.act(supervisor,'start')).id);
  const service=(await supervisor.snapshot()).services[0],input={action:'stop',expectedRevision:service.revision,idempotencyKey:randomUUID()};
  const first=await supervisor.action('bionic',input);await terminal(supervisor,first.id);
  const duplicate=await supervisor.action('bionic',input);assert.equal(duplicate.id,first.id);assert.equal(duplicate.status,'succeeded');
  assert.equal(f.effects.filter(effect=>effect==='desktop-stop').length,1);
});
test('partial stop and interrupted cold startup both offer a fresh explicit stop, never automatic replay',async t=>{
  for(const cold of [false,true]){
    const f=fixture();f.state.noReady=cold;
    const control=await supervised(t,f),first=await control.open();
    const start=await control.act(first,'start');const started=await terminal(first,start.id);
    if(cold)assert.equal(started.status,'unknown');else{
      assert.equal(started.status,'succeeded');f.state.failBeforeStop=true;
      const stop=await control.act(first,'stop');assert.equal((await terminal(first,stop.id)).status,'unknown');
    }
    await first.close();const resumed=await control.open();await resumed.reload();
    const before=[...f.effects],status=(await resumed.snapshot()).services[0];
    assert.equal(status.actions.stop.allowed,true);assert.equal(status.process.recoveryStop,true);assert.equal(status.actions.start.allowed,false);assert.deepEqual(f.effects,before);
    f.state.failBeforeStop=false;const recovery=await control.act(resumed,'stop');assert.equal((await terminal(resumed,recovery.id)).status,'succeeded');
    assert.doesNotThrow(()=>resumed.assertAdmission());assert.equal(f.state.desktop,false);assert.equal(f.effects.filter(effect=>effect==='desktop-stop').length,1);
  }
});
test('active companion work refuses the stop before API or Desktop effects',async t=>{
  const f=fixture(),control=await supervised(t,f),supervisor=await control.open();await terminal(supervisor,(await control.act(supervisor,'start')).id);
  f.state.busy=true;const before=[...f.effects];await assert.rejects(control.act(supervisor,'stop'),{code:'service_busy'});assert.deepEqual(f.effects,before);
});
test('lost recovery-stop response resolves all retained intentions only after native exit is observed',async t=>{
  const f=fixture(),control=await supervised(t,f),supervisor=await control.open();await terminal(supervisor,(await control.act(supervisor,'start')).id);
  f.state.failBeforeStop=true;const first=await control.act(supervisor,'stop');assert.equal((await terminal(supervisor,first.id)).status,'unknown');
  f.state.failBeforeStop=false;f.state.lostStop=true;const recovery=await control.act(supervisor,'stop');assert.equal((await terminal(supervisor,recovery.id)).status,'unknown');
  await supervisor.reload();assert.equal((await supervisor.operation(first.id)).status,'succeeded');assert.equal((await supervisor.operation(recovery.id)).status,'succeeded');
  assert.doesNotThrow(()=>supervisor.assertAdmission());assert.deepEqual(f.effects,['desktop-start','api-start','api-stop','desktop-stop']);
});
