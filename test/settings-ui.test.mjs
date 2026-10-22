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
  const context=vm.createContext({document,Intl,URLSearchParams});
  vm.runInContext(source,context);
  const settings=context.createCompanionSettings({api,getState:()=>state,node:(tag,className,textContent)=>({tag,className,textContent}),onChange(){}});
  const fire=(id,type='click')=>element(id).listeners[type]({currentTarget:element(id),preventDefault(){}});
  const open=()=>fire('settings-open');
  async function saveOutput(value,all=false){element('output-mode').value=value===null?'auto':'manual';element('output-tokens').value=value??8192;element('output-all-sessions').checked=all;return fire('output-settings-form','submit');}
  return {state,element,settings,writes,fire,open,saveOutput};
}

test('a session-only draft preference is consumed after acceptance and does not leak into the next new chat',async()=>{
  const f=fixture();await f.open();await f.saveOutput(777);
  const initialView=f.state.viewKey,request=f.settings.decorate({model:'m',requestId:'first'});
  assert.equal(request.outputPreferences.maxOutputTokens,777);
  f.settings.close();f.state.chat={id:'web-A',source:'web'};f.state.viewKey='p|web-A';
  f.settings.accepted(request,initialView);
  f.state.chat=null;f.state.viewKey=initialView;
  assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
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
