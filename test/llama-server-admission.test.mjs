import test from 'node:test';
import assert from 'node:assert/strict';
import { assertExternalInferenceIdle } from '../lib/llama-server-admission.mjs';
import { createLlamaCppModelService } from '../lib/llamacpp-model-service.mjs';

test('a direct external catalogue with missing meta never authorizes a second model',async()=>{
  const model=createLlamaCppModelService({baseUrl:'http://127.0.0.1:19997',fetchImpl:async url=>Response.json(url.endsWith('/v1/models')?{data:[{id:'external-no-meta'}]}:{total_slots:1,default_generation_settings:{n_ctx:8192}})});
  const catalogue=await model.list();assert.equal(catalogue[0].loaded,false);
  assert.throws(()=>assertExternalInferenceIdle('llamacpp',catalogue),{status:409,code:'llama-other-engine-loaded'});
});
test('a direct external sleeping catalogue is also conservative; an empty catalogue permits launch',()=>{
  assert.throws(()=>assertExternalInferenceIdle('llamacpp',[{type:'llm',loaded:false}]),{code:'llama-other-engine-loaded'});
  assert.doesNotThrow(()=>assertExternalInferenceIdle('llamacpp',[]));
});
test('Bionic requires a confirmed unloaded text model and refuses missing state',()=>{
  assert.throws(()=>assertExternalInferenceIdle('bionic',[{type:'llm',loaded:true}]),{code:'llama-other-engine-loaded'});
  assert.throws(()=>assertExternalInferenceIdle('bionic',[{type:'llm'}]),{code:'llama-other-engine-unknown'});
  assert.doesNotThrow(()=>assertExternalInferenceIdle('bionic',[{type:'llm',loaded:false},{type:'embedding',loaded:true}]));
});
test('invalid provider or catalogue cannot prove idle state',()=>{
  for(const [provider,catalogue] of [['future',[]],['bionic',null],['bionic',[null]]])assert.throws(()=>assertExternalInferenceIdle(provider,catalogue),{code:'llama-other-engine-unknown'});
});
