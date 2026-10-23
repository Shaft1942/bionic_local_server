import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=(await Promise.all(['certificates.js','settings.js'].map(file=>fs.readFile(new URL('../public/'+file,import.meta.url),'utf8')))).join('\n');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defaultComfy={enabled:false,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo',activeJobs:0,workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};

/** A small DOM boundary keeps scope and asynchronous transport tests independent of a browser. */
function fixture(intercept=()=>undefined) {
  const elements=new Map(),writes=[];
  const document={activeElement:null,getElementById:element};
  function element(id) {
    if(!elements.has(id)) {
      let value='';
      elements.set(id,{id,hidden:id==='settings-view',checked:false,disabled:false,isConnected:true,textContent:'',children:[],attributes:{},listeners:{},
        get value(){return value;},set value(next){value=String(next);},
        focus(){document.activeElement=this;},setAttribute(name,next){this.attributes[name]=String(next);},
        replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},
        addEventListener(type,callback){this.listeners[type]=callback;}
      });
    }
    return elements.get(id);
  }
  const state={authenticated:true,authEpoch:1,projectId:'p',chat:null,viewKey:'p|new',status:{models:[{id:'m',name:'Modèle M'}]}};
  element('model').value='m';document.activeElement=element('settings-open');
  const api=async(route,options)=>{
    if(options?.method==='POST')writes.push({route,body:JSON.parse(options.body)});
    const override=intercept(route,options);if(override!==undefined)return override;
    if(route.startsWith('/api/model-preferences?'))return {source:'auto',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false};
    if(route==='/api/model-preferences')return {};
    if(route==='/api/comfy/settings')return structuredClone(defaultComfy);
    if(route==='/api/security/status')return {mode:'http',epoch:1,server:null,authority:null,devices:[]};
    if(route==='/api/capabilities')return {items:[{name:'Capacité actuelle',description:'Description actuelle.'}]};
    throw Error('Unexpected API route '+route);
  };
  const context=vm.createContext({document,Intl,URLSearchParams,structuredClone});
  vm.runInContext(source,context);
  const settings=context.createCompanionSettings({api,getState:()=>state,node:(tag,className,textContent)=>({tag,className,textContent}),onChange(){}});
  const fire=(id,type='click')=>element(id).listeners[type]({currentTarget:element(id),preventDefault(){}});
  const open=()=>fire('settings-open');
  async function saveOutput(value,all=false){element('output-mode').value=value===null?'auto':'manual';element('output-tokens').value=value??8192;element('output-all-sessions').checked=all;return fire('output-settings-form','submit');}
  return {state,document,element,settings,writes,fire,open,saveOutput};
}

test('LoRA form keeps two choices and strengths independently when switching image models',async()=>{
  const data={...defaultComfy,enabled:true,workflows:[{id:'krea2_turbo',label:'Krea2'},{id:'hassaku_illustrious',label:'HassakuXL'}],loraProfiles:{krea2_turbo:[],hassaku_illustrious:[]}};
  const f=fixture((route,options)=>route==='/api/comfy/loras'?{loras:['downloaded.safetensors','extra/detail.safetensors']}:route==='/api/comfy/settings'?options?.method==='POST'?{...data,...JSON.parse(options.body)}:structuredClone(data):undefined);
  await f.open();await tick();
  f.element('comfy-lora-1').value='downloaded.safetensors';f.element('comfy-lora-1-strength').value='0.6';
  f.element('comfy-lora-2').value='extra/detail.safetensors';f.element('comfy-lora-2-strength').value='0.25';
  f.fire('comfy-lora-1-strength','input');f.fire('comfy-lora-2-strength','input');
  assert.equal(f.element('comfy-lora-1-value').textContent,'0,60');assert.equal(f.element('comfy-lora-2-value').textContent,'0,25');
  f.element('comfy-workflow').value='hassaku_illustrious';f.fire('comfy-workflow','change');
  assert.equal(f.element('comfy-lora-1').value,'');
  f.element('comfy-lora-1').value='extra/detail.safetensors';f.element('comfy-lora-1-strength').value='0.9';
  f.element('comfy-workflow').value='krea2_turbo';f.fire('comfy-workflow','change');
  assert.equal(f.element('comfy-lora-1').value,'downloaded.safetensors');assert.equal(f.element('comfy-lora-1-strength').value,'0.6');assert.equal(f.element('comfy-lora-2-strength').value,'0.25');
  assert.equal(f.element('comfy-lora-1-value').textContent,'0,60');assert.equal(f.element('comfy-lora-1-strength').attributes['aria-valuetext'],'0,60');
  await f.fire('comfy-settings-form','submit');
  const saved=f.writes.findLast(write=>write.route==='/api/comfy/settings').body;
  assert.equal(saved.loraProfiles.krea2_turbo.length,2);assert.equal(saved.loraProfiles.hassaku_illustrious[0].strength,.9);
  f.element('image-workflow').value='hassaku_illustrious';assert.equal(f.settings.decorate({model:'m',imageAccess:true}).imageWorkflowId,'hassaku_illustrious');
});

test('late LoRA catalog replies cannot overwrite a newer settings view or its selected slots',async()=>{
  const old=deferred();let reads=0;
  const data={...defaultComfy,loraProfiles:{krea2_turbo:[{name:'new.safetensors',strength:.5}]}};
  const f=fixture(route=>route==='/api/comfy/settings'?structuredClone(data):route==='/api/comfy/loras'?++reads===1?old.promise:{loras:['new.safetensors']}:undefined);
  await f.open();f.settings.close();await f.open();await tick();
  assert.equal(f.element('comfy-lora-1').value,'new.safetensors');
  old.resolve({loras:['stale.safetensors']});await tick();
  assert.equal(f.element('comfy-lora-1').value,'new.safetensors');assert.equal(f.element('comfy-loras-status').textContent,'1 LoRA disponible(s) dans ComfyUI.');
});

test('image selection follows each conversation and its draft when the composer is refreshed',async()=>{
  const data={...defaultComfy,enabled:true,workflows:[{id:'krea2_turbo',label:'Krea2'},{id:'hassaku_illustrious',label:'HassakuXL'}]};
  const f=fixture(route=>route==='/api/comfy/settings'?data:undefined);await f.settings.refresh();
  f.state.chat={imageWorkflowId:'hassaku_illustrious'};f.settings.imagePermission();
  assert.equal(f.element('image-workflow').value,'hassaku_illustrious');
  f.state.draftImageWorkflowId='krea2_turbo';f.settings.imagePermission();
  assert.equal(f.element('image-workflow').value,'krea2_turbo');
  f.state.draftImageWorkflowId=null;f.state.chat={imageWorkflowId:'krea2_turbo'};f.settings.imagePermission();
  assert.equal(f.element('image-workflow').value,'krea2_turbo');
});

test('a session-only draft preference is consumed after acceptance and does not leak into the next new chat',async()=>{
  const f=fixture();await f.open();await f.saveOutput(777);
  const initialView=f.state.viewKey,request=f.settings.decorate({model:'m',requestId:'first'});
  assert.equal(request.outputPreferences.maxOutputTokens,777);
  f.settings.close();f.state.chat={id:'web-A',source:'web'};f.state.viewKey='p|web-A';
  f.settings.accepted(request,initialView);
  f.state.chat=null;f.state.viewKey=initialView;
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
});

test('token slider and precise input stay synchronized without replacing invalid manual text',async()=>{
  const f=fixture();await f.open();
  assert.equal(f.element('output-tokens-slider').value,'8192');
  assert.equal(f.element('output-tokens-slider').disabled,true);
  assert.equal(f.element('output-tokens').disabled,true);
  f.element('output-mode').value='manual';await f.fire('output-mode','change');
  assert.equal(f.element('output-tokens-slider').disabled,false);
  f.element('output-tokens').value='12345';await f.fire('output-tokens','input');
  assert.equal(f.element('output-tokens-slider').value,'12345');
  f.element('output-tokens-slider').value='4999999';await f.fire('output-tokens-slider','input');
  assert.equal(f.element('output-tokens').value,'4999999');
  assert.equal(f.element('output-tokens-slider').attributes['aria-valuetext'].replace(/\s/g,''),'4999999tokens');
  for(const value of ['', '0', '1.5', '5000001']){
    f.element('output-tokens').value=value;await f.fire('output-tokens','input');
    assert.equal(f.element('output-tokens').value,value);
    assert.equal(f.element('output-tokens-slider').value,'4999999');
    await f.fire('output-settings-form','submit');
    assert.equal(f.element('output-error').hidden,false);
    assert.match(f.element('output-error').textContent,/5 000 000/);
  }
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
  f.element('output-mode').value='auto';await f.fire('output-mode','change');
  assert.equal(f.element('output-manual').hidden,true);
  assert.equal(f.element('output-tokens').disabled,true);
  assert.equal(f.element('output-tokens-slider').disabled,true);
  await f.fire('output-settings-form','submit');
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences.maxOutputTokens,null);
});

test('large loaded and pending preferences restore both controls with exact values',async()=>{
  const f=fixture(route=>route.startsWith('/api/model-preferences?')?{source:'model',automatic:false,maxOutputTokens:5000000,contextLength:16000,applyToAllSessions:true}:undefined);
  await f.open();
  assert.equal(f.element('output-mode').value,'manual');
  assert.equal(f.element('output-tokens').value,'5000000');
  assert.equal(f.element('output-tokens-slider').value,'5000000');
  await f.saveOutput(4999999,false);f.settings.close();await f.open();
  assert.equal(f.element('output-tokens').value,'4999999');
  assert.equal(f.element('output-tokens-slider').value,'4999999');
  assert.equal(f.element('output-all-sessions').checked,false);
  await f.saveOutput(5000000,true);
  assert.equal(f.writes.at(-1).body.maxOutputTokens,5000000);
  assert.equal(f.writes.at(-1).body.applyToAllSessions,true);
});
test('acceptance preserves a newer draft preference and global defaults are not replayed from a stale draft',async()=>{
  const f=fixture();await f.open();await f.saveOutput(777);
  const request=f.settings.decorate({model:'m'}),view=f.state.viewKey;
  await f.saveOutput(888);f.settings.accepted(request,view);
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences.maxOutputTokens,888);
  await f.saveOutput(1234,true);
  assert.equal(f.writes.at(-1).body.applyToAllSessions,true);
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
});
test('a delayed save for existing session A cannot change draft B or its current form messages',async()=>{
  const save=deferred();let waiting=false;
  const f=fixture((route,options)=>route==='/api/model-preferences'&&options?.method==='POST'&&waiting?save.promise:undefined);
  f.state.viewKey='p|draft-B';await f.open();await f.saveOutput(777);f.settings.close();
  f.state.chat={id:'web-A',source:'web'};f.state.viewKey='p|web-A';await f.open();
  waiting=true;const pendingSave=f.saveOutput(999);await tick();
  assert.equal(f.writes.at(-1).body.id,'web-A');
  f.settings.close();f.state.chat=null;f.state.viewKey='p|draft-B';await f.open();
  save.resolve({});await pendingSave;
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences.maxOutputTokens,777);
  assert.equal(f.element('output-tokens').value,'777');
  assert.equal(f.element('output-result').textContent,'');
});
test('closing and reopening settings discards old GET results for output, ComfyUI and capabilities',async()=>{
  const oldComfy=deferred(),oldOutput=deferred(),oldCapabilities=deferred();let comfyReads=0,outputReads=0,capabilityReads=0;
  const f=fixture(route=>{
    if(route==='/api/comfy/settings'&&++comfyReads===1)return oldComfy.promise;
    if(route.startsWith('/api/model-preferences?')&&++outputReads===1)return oldOutput.promise;
    if(route==='/api/capabilities'&&++capabilityReads===1)return oldCapabilities.promise;
  });
  const previousOpen=f.open();await tick();f.settings.close();await f.open();
  f.element('comfy-url').value='http://192.168.1.88:8188';
  oldComfy.resolve({...defaultComfy,url:'http://192.168.1.99:8188'});
  oldOutput.resolve({source:'model',automatic:false,maxOutputTokens:333,contextLength:16000,applyToAllSessions:true});
  oldCapabilities.resolve({items:[{name:'Ancienne capacité',description:'Ancienne description.'}]});
  await previousOpen;
  assert.equal(f.element('comfy-url').value,'http://192.168.1.88:8188');
  assert.equal(f.element('output-mode').value,'auto');
  assert.equal(f.element('settings-capabilities').children[0].textContent,'Capacité actuelle');
});
test('an unreachable ComfyUI check displays its error instead of claiming a connection',async()=>{
  const f=fixture(route=>route==='/api/comfy/check'?{ok:false,reachable:false,error:'Serveur ComfyUI inaccessible.',workflows:[]}:undefined);
  await f.open();await f.fire('comfy-test');
  assert.equal(f.element('comfy-error').textContent,'Serveur ComfyUI inaccessible.');
  assert.equal(f.element('comfy-error').attributes.role,'alert');
  assert.equal(f.element('comfy-result').textContent,'');
  assert.equal(f.element('comfy-test').disabled,false);
});
test('an explicit automatic session override reopens as automatic even when its source is session',async()=>{
  const f=fixture(route=>route.startsWith('/api/model-preferences?')?{source:'session',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false}:undefined);
  f.state.chat={id:'web-A',source:'web'};await f.open();
  assert.equal(f.element('output-mode').value,'auto');assert.equal(f.element('output-manual').hidden,true);
  assert.equal(f.element('output-all-sessions').checked,false);
});
test('logout invalidates a delayed ComfyUI refresh without restoring enabled permissions',async()=>{
  const reply=deferred(),f=fixture(route=>route==='/api/comfy/settings'?reply.promise:undefined);
  const refresh=f.settings.refresh();f.state.authenticated=false;f.state.authEpoch++;f.settings.reset();
  reply.resolve({...defaultComfy,enabled:true});await refresh;
  assert.equal(f.settings.enabled(),false);
});
test('reopening after an in-flight ComfyUI check restores a usable check button and ignores the old result',async()=>{
  const reply=deferred(),f=fixture(route=>route==='/api/comfy/check'?reply.promise:undefined);
  await f.open();const check=f.fire('comfy-test');f.settings.close();await f.open();
  assert.equal(f.element('comfy-test').disabled,false);
  reply.resolve({ok:true,reachable:true,workflows:[]});await check;
  assert.equal(f.element('comfy-result').textContent,'');
  assert.equal(f.element('comfy-test').disabled,false);
});
test('reopening after an in-flight ComfyUI save restores a usable save button',async()=>{
  const reply=deferred(),f=fixture((route,options)=>route==='/api/comfy/settings'&&options?.method==='POST'?reply.promise:undefined);
  await f.open();const save=f.fire('comfy-settings-form','submit');f.settings.close();await f.open();
  assert.equal(f.element('comfy-save').disabled,false);
  reply.resolve({...defaultComfy,enabled:true});await save;
  assert.equal(f.element('comfy-save').disabled,false);
  assert.equal(f.element('comfy-result').textContent,'');
});
test('an older ComfyUI save response cannot replace the enabled state of a newer save',async()=>{
  const older=deferred();let writes=0;
  const f=fixture((route,options)=>{
    if(route==='/api/comfy/settings'&&options?.method==='POST')return ++writes===1?older.promise:{...defaultComfy,enabled:true,updatedAt:2};
  });
  await f.open();f.element('comfy-enabled').checked=false;const oldSave=f.fire('comfy-settings-form','submit');
  f.settings.close();await f.open();f.element('comfy-enabled').checked=true;await f.fire('comfy-settings-form','submit');
  assert.equal(f.settings.enabled(),true);
  older.resolve({...defaultComfy,enabled:false,updatedAt:1});await oldSave;
  assert.equal(f.settings.enabled(),true);
  // The caller owns composer locks; browser-v2 verifies the enabled control.
});

test('a targeted output opening cannot steal focus or scroll from a newer settings view',async()=>{
  const old=deferred();let calls=0,scrolls=0;
  const f=fixture(route=>route.startsWith('/api/model-preferences?')&&++calls===1?old.promise:undefined);
  f.element('output-settings-form').scrollIntoView=()=>{scrolls++;};
  const previous=f.settings.openOutput({currentTarget:f.element('budget-trigger')},'m');
  await tick();f.settings.close();await f.open();f.element('comfy-url').focus();
  old.resolve({source:'auto',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false});
  await previous;
  assert.equal(scrolls,0);
  assert.equal(f.document.activeElement,f.element('comfy-url'));
});

test('output shortcut uses its known model, and unknown provenance focuses the model choice',async()=>{
  const queries=[],f=fixture(route=>{if(route.startsWith('/api/model-preferences?'))queries.push(new URLSearchParams(route.split('?')[1]));});
  f.state.status.models.push({id:'n',name:'Modèle N'});f.element('model').value='n';
  let scrolls=0;f.element('output-settings-form').scrollIntoView=()=>{scrolls++;};
  await f.settings.openOutput({currentTarget:f.element('budget-trigger')},'m');
  assert.equal(queries.at(-1).get('model'),'m');assert.equal(f.document.activeElement,f.element('output-mode'));
  f.settings.close();assert.equal(f.document.activeElement,f.element('budget-trigger'));
  await f.settings.openOutput({currentTarget:f.element('unknown-budget')},null);
  assert.equal(queries.at(-1).get('model'),'n');assert.equal(f.document.activeElement,f.element('settings-model'));assert.equal(scrolls,2);
});
