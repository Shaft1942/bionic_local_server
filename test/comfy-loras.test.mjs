import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {normalizeLoraProfiles,applyLoras} from '../lib/comfy-loras.mjs';
import {createComfySettings} from '../lib/comfy-settings.mjs';
import {createComfyImages} from '../lib/comfy-images.mjs';

const owner={projectId:'p',chatId:'chat',messageId:'reply',requestId:'request'};
const slots=[{name:'downloaded/style.safetensors',strength:0.7},{name:'extra\\detail.safetensors',strength:0.35}];
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'comfy-loras-test-')),calls=[];
  const choices=[...slots.map(lora=>lora.name),'new.safetensors'];
  const info={LoraLoader:{input:{required:{lora_name:[choices]}}},LoraLoaderModelOnly:{input:{required:{lora_name:[choices]}}}};
  const fetchImpl=async(url,options={})=>{calls.push({url,options});if(url.endsWith('/object_info'))return Response.json(info);if(url.endsWith('/prompt'))return Response.json({prompt_id:'prompt-'+calls.length});throw Error('Unexpected HTTP call');};
  const service=await createComfyImages({directory,settingsFile:path.join(directory,'settings.json'),enabled:true,fetchImpl,pollMs:100000});
  t.after(async()=>{await service.close();assert(path.basename(directory).startsWith('comfy-loras-test-'));await fs.rm(directory,{recursive:true,force:true});});
  return {directory,service,calls,info};
}

test('two slots per model, independent profiles and bounded named values',()=>{
  assert.equal(normalizeLoraProfiles({krea2_turbo:[{name:'style.safetensors',strength:20}]}).krea2_turbo[0].strength,20);
  const previous=normalizeLoraProfiles({krea2_turbo:slots});
  const next=normalizeLoraProfiles({hassaku_illustrious:[{name:'sdxl.safetensors',strength:-0.5}]},previous);
  assert.deepEqual(next.krea2_turbo,slots);assert.equal(next.hassaku_illustrious[0].strength,-0.5);
  for(const value of [{krea2_turbo:[...slots,slots[0]]},{hassaku_illustrious:[slots[0],slots[0]]},{krea2_turbo:[{name:'../outside',strength:1}]},{krea2_turbo:[{name:'x',strength:NaN}]},{krea2_turbo:[{name:'x',strength:20.05}]},{unknown:[]}])assert.throws(()=>normalizeLoraProfiles(value),{status:400});
});

test('Hassaku chains model AND CLIP through two LoRA; VAE and cleanup stay on original branches',async()=>{
  const graph=JSON.parse(await fs.readFile(new URL('../workflows/hassaku-illustrious.api.json',import.meta.url),'utf8'));
  applyLoras(graph,{id:'hassaku_illustrious',sampler:'56',positive:'6',negative:'7'},slots);
  assert.equal(graph['201'].class_type,'LoraLoader');assert.deepEqual(graph['201'].inputs.model,['53',0]);assert.deepEqual(graph['201'].inputs.clip,['53',1]);
  assert.deepEqual(graph['202'].inputs.clip,['201',1]);assert.equal(graph['202'].inputs.strength_clip,.35);
  assert.deepEqual(graph['56'].inputs.model,['202',0]);assert.deepEqual(graph['6'].inputs.clip,['202',1]);assert.deepEqual(graph['7'].inputs.clip,['202',1]);
  assert.deepEqual(graph['17'].inputs.vae,['53',2]);assert.deepEqual(graph['99'].inputs.trigger,['19',0]);assert.equal(graph['99'].class_type,'FreeMemoryAfterWorkflow');
});

test('Krea LoRA modifies only diffusion, preserves Qwen CLIP and zero strength skips loading',async()=>{
  const graph=JSON.parse(await fs.readFile(new URL('../workflows/krea2-turbo.api.json',import.meta.url),'utf8'));
  const applied=applyLoras(graph,{id:'krea2_turbo',sampler:'3',positive:'6'},[slots[0],{...slots[1],strength:0}]);
  assert.equal(applied.length,1);assert.equal(graph['201'].class_type,'LoraLoaderModelOnly');assert.equal(graph['201'].inputs.clip,undefined);assert.equal(graph['202'],undefined);
  assert.deepEqual(graph['3'].inputs.model,['201',0]);assert.deepEqual(graph['6'].inputs.clip,['11',0]);assert.deepEqual(graph['99'].inputs.trigger,['9',0]);
});

test('v1 settings migrate without losing endpoint; two model LoRA profiles persist and returned values are detached',async t=>{
  const f=await fixture(t),file=path.join(f.directory,'legacy-settings.json');
  await fs.writeFile(file,JSON.stringify({version:1,enabled:true,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo'}));
  const store=await createComfySettings({file});await store.update({loraProfiles:{krea2_turbo:slots}});await store.update({loraProfiles:{hassaku_illustrious:[{name:'sdxl.safetensors',strength:1}]}});
  const restored=await createComfySettings({file});assert.deepEqual(restored.get().loraProfiles.krea2_turbo,slots);assert.equal(restored.get().loraProfiles.hassaku_illustrious[0].name,'sdxl.safetensors');
  const copy=restored.get();copy.loraProfiles.krea2_turbo[0].name='mutated';assert.equal(restored.get().loraProfiles.krea2_turbo[0].name,slots[0].name);assert.equal(JSON.parse(await fs.readFile(file)).version,2);
});

test('catalog uses ComfyUI loader choices, including extra folders; image job keeps selected model, two LoRA and /free',async t=>{
  const f=await fixture(t),catalog=await f.service.listLoras();assert(catalog.loras.includes('extra\\detail.safetensors'));assert(catalog.loras.includes('downloaded/style.safetensors'));assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,undefined);
  await f.service.updateSettings({loraProfiles:{hassaku_illustrious:slots}});
  const selected=f.service.resolveSelection('hassaku_illustrious');await f.service.updateSettings({workflowId:'krea2_turbo',loraProfiles:{hassaku_illustrious:[]}});
  const job=await f.service.submit({prompt:'An illustrated teapot',seed:42},owner,undefined,selected);
  assert.equal(job.workflowId,'hassaku_illustrious');assert.deepEqual(job.loras,slots);assert.equal(job.memoryCleanup,true);
  const body=JSON.parse(f.calls.find(call=>call.options.method==='POST').options.body);assert.equal(body.prompt['201'].inputs.lora_name,slots[0].name);assert.deepEqual(body.prompt['99'].inputs.trigger,['19',0]);
  assert.equal(body.prompt['56'].inputs.steps,25);assert.equal(body.prompt['3'],undefined);
});

test('missing LoRA and model attempts to override the UI selection send no GPU request',async t=>{
  const f=await fixture(t);await f.service.updateSettings({loraProfiles:{krea2_turbo:[{name:'missing.safetensors',strength:1}]}});
  await assert.rejects(f.service.submit({prompt:'Teapot'},owner),{status:400});
  const selected=f.service.resolveSelection('hassaku_illustrious');
  await assert.rejects(f.service.submit({prompt:'Teapot',workflowId:'krea2_turbo'},owner,undefined,selected),{status:400});
  assert.equal(f.calls.filter(call=>call.options.method==='POST').length,0);
});
