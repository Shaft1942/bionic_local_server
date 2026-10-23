import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentTools, toolsFor, SERIES_IMAGE_TOOLS } from '../lib/agent-tools.mjs';

const images=count=>Array.from({length:count},(_,index)=>({prompt:'Distinct fixture subject '+(index+1),seed:401+index,format:'square'}));
const call=(args,name='generate_comfy_image_series')=>({id:'fixture-call',function:{name,arguments:JSON.stringify(args)}});
function fixture(count){
  const submitted=[];
  const options={imageAccess:true,imageCount:count,fileProfile:'none',imageOwner:{projectId:'p',chatId:'c',messageId:'m',requestId:'r'},imageSelection:{workflowId:'krea2_turbo',modelPolicy:'alternate'},comfyService:{
    async submitSeries(args,owner,signal,selection){submitted.push({args,owner,signal,selection});return args.images.map((image,index)=>({id:'fixture-job-'+index,status:'queued',seed:image.seed,seriesIndex:index+1,seriesTotal:args.images.length}));},
    async submit(args){submitted.push({args});return{id:'fixture-single',status:'queued',seed:args.seed??42};},
  }};
  return{options,submitted,agent:createAgentTools(options)};
}

for(const count of [1,2,3,4,5])test(`image count ${count} selects only its matching tool and exact series schema`,()=>{
  const tools=toolsFor({imageAccess:true,imageCount:count,fileProfile:'none'});
  if(count===1){assert(tools.some(tool=>tool.function.name==='generate_comfy_image'));assert(!tools.some(tool=>tool.function.name==='generate_comfy_image_series'));}
  else{
    assert.deepEqual(tools.map(tool=>tool.function.name),['generate_comfy_image_series']);
    const schema=tools[0].function.parameters.properties.images;
    assert.equal(schema.minItems,count);assert.equal(schema.maxItems,count);
    assert.deepEqual(schema.items.required,['prompt','seed']);assert.equal(schema.items.additionalProperties,false);
  }
  assert.equal(SERIES_IMAGE_TOOLS[0].function.parameters.properties.images.minItems,3,'historical export remains a three-image schema');
});

test('default count remains one and invalid counts never produce an executable agent',()=>{
  assert.deepEqual(toolsFor({imageAccess:true,fileProfile:'none'}).map(tool=>tool.function.name),['generate_krea2_image','generate_comfy_image']);
  for(const count of [null,0,6,-1,2.5,'3',false,{},NaN,Infinity]){
    assert.throws(()=>toolsFor({imageAccess:true,imageCount:count}),{status:400});
    assert.throws(()=>fixture(count),{status:400});
  }
});

for(const count of [2,3,4,5])test(`a ${count}-image tool refuses a different count before calling any image service`,async()=>{
  const f=fixture(count);
  for(const other of [0,1,2,3,4,5,6].filter(value=>value!==count)){
    const result=await f.agent.execute(call({images:images(other)}));
    assert.equal(result.action.ok,false);assert.match(result.result.error,new RegExp('exactement '+count+' images'));
  }
  assert.equal(f.submitted.length,0);
  const result=await f.agent.execute(call({images:images(count)}));
  assert.equal(result.action.ok,true);assert.equal(result.action.imageGenerations.length,count);
  assert.match(result.action.message,new RegExp('Série de '+count+' images'));
  assert.match(result.result.message,new RegExp('les '+count+' images'));
  assert.equal(f.submitted.length,1);
  assert.equal(f.submitted[0].selection.modelPolicy,'alternate');
});

for(const count of [2,5])test(`a ${count}-image tool validates distinct prompts, seeds and every image before effects`,async()=>{
  const f=fixture(count),valid=images(count);
  const replace=image=>[...valid.slice(0,-1),image];
  const invalid=[
    {},{images:null},{images:{}},{images:valid,extra:true},
    {images:replace(null)},{images:replace([])},{images:replace({seed:200})},{images:replace({prompt:'  ',seed:200})},
    {images:replace({prompt:'Third',seed:'200'})},{images:replace({prompt:'Third',seed:1.5})},
    {images:replace({prompt:'Third',seed:-1})},{images:replace({prompt:'Third',seed:4294967296})},
    {images:replace({prompt:'Third'})},{images:replace({prompt:'Third',seed:200,format:'unknown'})},
    {images:replace({prompt:'Third',seed:200,url:'http://example.org'})},
    {images:replace({...valid.at(-1),prompt:' '+valid[0].prompt.toUpperCase()+' '})},
    {images:replace({...valid.at(-1),seed:valid[0].seed})},
  ];
  for(const args of invalid){const result=await f.agent.execute(call(args));assert.equal(result.action.ok,false);assert(result.result.error);}
  assert.equal(f.submitted.length,0);
});

test('chosen count stays fixed even if the calling options object changes',async()=>{
  const f=fixture(2);f.options.imageCount=5;
  assert.equal((await f.agent.execute(call({images:images(5)}))).action.ok,false);
  assert.equal((await f.agent.execute(call({images:images(2)}))).action.ok,true);
  assert.equal(f.submitted.length,1);assert.equal(f.submitted[0].args.images.length,2);
});

test('single and series tools cannot bypass the selected count by using another image tool',async()=>{
  const single=fixture(1),series=fixture(4);
  assert.equal((await single.agent.execute(call({images:images(2)}))).action.ok,false);
  for(const name of ['generate_comfy_image','generate_krea2_image'])assert.equal((await series.agent.execute(call({prompt:'Only one image'},name))).action.ok,false);
  assert.equal(single.submitted.length,0);assert.equal(series.submitted.length,0);
});
