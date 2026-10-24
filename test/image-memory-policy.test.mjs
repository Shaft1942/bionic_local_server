import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as turn } from 'node:timers/promises';
import { imageMemoryPolicyCapabilities, resolveImageMemoryPolicy } from '../lib/image-memory-policy.mjs';
import { createLlamaCppModelService } from '../lib/llamacpp-model-service.mjs';
import { createGpuScheduler } from '../lib/gpu-scheduler.mjs';

test('direct llama exposes effective memory policies without reading an engine or claiming GPU release',()=>{
  const service=createLlamaCppModelService({baseUrl:'http://127.0.0.1:19991',fetchImpl:()=>{throw Error('No engine request allowed');}});
  assert.deepEqual(service.capabilities,{provider:'llamacpp',unload:false});
  const capabilities=imageMemoryPolicyCapabilities({provider:'llamacpp',modelService:service,defaultPolicy:'unload'});
  assert.deepEqual(capabilities.supportedPolicies,['keep','alternate']);assert.equal(capabilities.unloadSupported,false);
  assert.equal(capabilities.defaultPolicy,'unload');assert.equal(capabilities.effectiveDefaultPolicy,'alternate');assert.equal(capabilities.defaultAdjusted,true);
  assert.match(capabilities.reason,/Aucune libération de mémoire GPU n’est confirmée/);
});
test('Bionic keeps all three policies; explicit negative connector evidence overrides the provider',()=>{
  assert.deepEqual(imageMemoryPolicyCapabilities({provider:'bionic'}).supportedPolicies,['keep','unload','alternate']);
  for(const requestedPolicy of [null,'keep','unload','alternate']){
    const value=resolveImageMemoryPolicy({provider:'bionic',requestedPolicy,defaultPolicy:'unload'});
    assert.equal(value.effectivePolicy,requestedPolicy??'unload');assert.equal(value.adjusted,false);
  }
  assert.equal(imageMemoryPolicyCapabilities({provider:'bionic',modelService:{capabilities:{unload:false}}}).unloadSupported,false);
  assert.equal(imageMemoryPolicyCapabilities({provider:'unknown'}).unloadSupported,false);
});
test('unsupported explicit unload and invalid policy values are refused with compatible guidance',()=>{
  assert.throws(()=>resolveImageMemoryPolicy({provider:'llamacpp',requestedPolicy:'unload',defaultPolicy:'keep'}),error=>error.status===409&&error.code==='image-memory-policy-unsupported'&&/Alterner/.test(error.message));
  for(const requestedPolicy of ['keep','alternate'])assert.equal(resolveImageMemoryPolicy({provider:'llamacpp',requestedPolicy,defaultPolicy:'unload'}).effectivePolicy,requestedPolicy);
  for(const value of ['',false,'automatic',{},[]])assert.throws(()=>resolveImageMemoryPolicy({provider:'bionic',requestedPolicy:value}),{status:400});
  assert.throws(()=>resolveImageMemoryPolicy({provider:'bionic',defaultPolicy:'invalid'}),{status:400});
});
test('the adjusted default serializes real scheduler leases while keeping the direct model untouched',async t=>{
  const requests=[];
  const modelService=createLlamaCppModelService({baseUrl:'http://127.0.0.1:19991',fetchImpl:async url=>{requests.push(url);throw Error('No model API request needed');}});
  const scheduler=createGpuScheduler({modelService});t.after(()=>scheduler.close());
  const resolved=resolveImageMemoryPolicy({modelService,defaultPolicy:'unload'});
  assert.equal(resolved.effectivePolicy,'alternate');assert.equal(resolved.adjusted,true);
  const releaseFirst=await scheduler.acquireModel();let imageAdmitted=false,laterAdmitted=false;
  const image=scheduler.acquireImages({policy:resolved.effectivePolicy}).then(release=>{imageAdmitted=true;return release;});
  const later=scheduler.acquireModel().then(release=>{laterAdmitted=true;return release;});
  await turn();assert.equal(imageAdmitted,false);assert.equal(laterAdmitted,false);
  releaseFirst();const releaseImage=await image;await turn();
  assert.equal(scheduler.snapshot().imagePolicy,'alternate');assert.equal(laterAdmitted,false);
  releaseImage();(await later)();assert.deepEqual(requests,[]);
});
test('scheduler rejects unsupported unload before catalogue lookup or creating a queued image barrier',async t=>{
  const requests=[];
  const modelService=createLlamaCppModelService({baseUrl:'http://127.0.0.1:19991',fetchImpl:async url=>{requests.push(url);throw Error('Unexpected catalogue read');}});
  const scheduler=createGpuScheduler({modelService});t.after(()=>scheduler.close());
  const releaseModel=await scheduler.acquireModel();
  await assert.rejects(scheduler.acquireImages({policy:'unload'}),{status:409,code:'image-memory-policy-unsupported'});
  assert.equal(scheduler.snapshot().queuedImages,0);assert.equal(scheduler.snapshot().activeImages,0);assert.deepEqual(requests,[]);releaseModel();
  (await scheduler.acquireImages({policy:'keep'}))();
});
test('scheduler rechecks current connector evidence when an earlier queued unload finally prepares',async t=>{
  const effects=[],service={list:async()=>{effects.push('list');return[];},unload:async()=>{effects.push('unload');return{unloaded:true};}};
  const scheduler=createGpuScheduler({modelService:service});t.after(()=>scheduler.close());
  const releaseModel=await scheduler.acquireModel();
  const pending=scheduler.acquireImages({policy:'unload'});
  const refused=assert.rejects(pending,{status:409,code:'image-memory-policy-unsupported'});
  service.capabilities={provider:'llamacpp',unload:false};releaseModel();await refused;
  assert.deepEqual(effects,[]);assert.equal(scheduler.snapshot().activeImages,0);assert.equal(scheduler.snapshot().queuedImages,0);
  (await scheduler.acquireModel())();
});
