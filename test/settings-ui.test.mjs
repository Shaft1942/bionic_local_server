import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=(await Promise.all(['i18n.js','locales/fr/ui.js','locales/en/ui.js','locales/fr/settings.js','locales/en/settings.js','locales/fr/components.js','locales/en/components.js','locales/fr/local-services.js','locales/en/local-services.js','certificates.js','help.js','settings.js'].map(file=>fs.readFile(new URL('../public/'+file,import.meta.url),'utf8')))).join('\n');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const defaultComfy={enabled:false,url:'http://127.0.0.1:8188',workflowId:'krea2_turbo',activeJobs:0,workflows:[{id:'krea2_turbo',label:'Krea 2 Turbo'}]};

/** A small DOM boundary keeps scope and asynchronous transport tests independent of a browser. */
function fixture(intercept=()=>undefined) {
  const elements=new Map(),writes=[],navigations=[],globalEvents={},serviceCalls=[];
  const document={activeElement:null,getElementById:element,querySelectorAll:selector=>['[data-settings-page]','#settings-nav [data-settings-page]'].includes(selector)?[...elements.values()].filter(value=>value.dataset.settingsPage):[]};
  function element(id) {
    if(!elements.has(id)) {
      let value='';
      elements.set(id,{id,hidden:id==='settings-view',checked:false,disabled:false,isConnected:true,textContent:'',children:[],attributes:{},listeners:{},dataset:{},
        get value(){return value;},set value(next){value=String(next);},
        focus(){document.activeElement=this;},scrollIntoView(){},setAttribute(name,next){this.attributes[name]=String(next);},
        closest(selector){if(selector!=='[hidden]')return null;const parents={'certificate-prepare':'certificate-setup-form','certificate-setup-form':'certificate-controls','certificate-device-name':'certificate-device-form','certificate-device-form':'certificate-controls'};let current=this;while(current){if(current.hidden)return current;current=parents[current.id]?element(parents[current.id]):null;}return null;},
        replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},querySelectorAll(){return [];},contains(target){return this===target||this.children.includes(target);},
        addEventListener(type,callback){this.listeners[type]=callback;}
      });
    }
    return elements.get(id);
  }
  for(const page of ['reading','models','tools','images','servers','connection','maintenance','help'])element('nav-'+page).dataset.settingsPage=page;
  const state={authenticated:true,authEpoch:1,projectId:'p',chat:null,viewKey:'p|new',status:{models:[{id:'m',name:'Modèle M'}]}};
  element('model').value='m';document.activeElement=element('settings-open-sidebar');
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
  const context=vm.createContext({document,Intl,URL,URLSearchParams,structuredClone,addEventListener:(name,callback)=>globalEvents[name]=callback,createLocalServices:()=>({setVisible:visible=>serviceCalls.push({visible}),openService:id=>serviceCalls.push({id}),reset:()=>serviceCalls.push({reset:true})})});
  vm.runInContext(source,context);
  let nodes=0;const settings=context.createCompanionSettings({api,getState:()=>state,node:(tag,className,textContent)=>Object.assign(element('node-'+nodes++),{tag,className,textContent}),onChange(){},onNavigate:target=>navigations.push(target)});
  const fire=(id,type='click')=>element(id).listeners[type]({currentTarget:element(id),preventDefault(){}});
  const open=()=>fire('settings-open-sidebar');
  async function saveOutput(value,all=false){element('output-mode').value=value===null?'auto':'manual';element('output-tokens').value=value??8192;element('output-all-sessions').value=all?'model':'session';return fire('output-settings-form','submit');}
  return {state,document,element,settings,writes,navigations,globalEvents,serviceCalls,fire,open,saveOutput};
}

test('server navigation and authentication reset preserve image request options until reset',async()=>{
  const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,enabled:true}:undefined);
  f.state.draftImageAccess=true;f.state.draftImageCount=5;f.state.draftImageModelPolicy='alternate';
  await f.open();await tick();
  await f.settings.openService('comfyui');
  assert.equal(f.element('settings-page-servers').hidden,false);
  assert.ok(f.serviceCalls.some(call=>call.visible===true));
  assert.ok(f.serviceCalls.some(call=>call.id==='comfyui'));
  const request=f.settings.decorate({model:'m',imageAccess:true});
  assert.equal(request.imageCount,5);assert.equal(request.imageModelPolicy,'alternate');
  await f.settings.openPage({currentTarget:f.element('settings-open-sidebar')},'images');
  assert.equal(f.element('settings-page-images').hidden,false);
  assert.equal(f.element('image-count').value,'5');
  f.settings.reset();
  assert.ok(f.serviceCalls.some(call=>call.reset===true));
  assert.equal(f.serviceCalls.at(-1).visible,false);
});

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
  assert.equal(f.element('comfy-lora-1').value,'new.safetensors');assert.equal(f.element('comfy-loras-status').textContent,'1 LoRA disponible dans ComfyUI.');
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

test('series selection follows its conversation and draft, and is sent only with image permission',async()=>{
  const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,enabled:true,modelPolicy:'unload'}:undefined);
  await f.settings.refresh();f.element('agent-images').checked=true;
  f.state.chat={imageCount:3};f.settings.imagePermission();
  assert.equal(f.element('image-count').value,'3');assert.equal(!!f.element('image-count').disabled,false);
  assert.equal(f.settings.decorate({model:'m',imageAccess:true}).imageCount,3);
  assert.equal(f.settings.decorate({model:'m',imageAccess:false}).imageCount,undefined);
  assert.match(f.element('image-settings-help').textContent,/3 prompts différents/);
  assert.match(f.element('image-settings-help').textContent,/réponses texte attendront/);
  f.state.draftImageCount=1;f.settings.imagePermission();assert.equal(f.element('image-count').value,'1');
  f.state.draftImageCount=null;f.state.chat={};f.settings.imagePermission();assert.equal(f.element('image-count').value,'1');
  f.element('agent-images').checked=false;f.settings.imagePermission();assert.equal(f.element('image-count').disabled,true);
});

test('text model policy defaults to keep and participates in dirty state, cancellation and saved settings',async()=>{
  let saved={...defaultComfy,enabled:true};
  const f=fixture((route,options)=>route==='/api/comfy/settings'?options?.method==='POST'?(saved={...saved,...JSON.parse(options.body)}):structuredClone(saved):undefined);
  await f.open();assert.equal(f.element('comfy-model-policy').value,'keep');
  f.element('comfy-model-policy').value='unload';f.fire('comfy-model-policy','change');assert.equal(f.settings.hasUnsaved(),true);
  await f.fire('comfy-cancel');assert.equal(f.element('comfy-model-policy').value,'keep');assert.equal(f.settings.hasUnsaved(),false);
  f.element('comfy-model-policy').value='unload';f.fire('comfy-model-policy','change');await f.fire('comfy-settings-form','submit');
  assert.equal(f.writes.findLast(write=>write.route==='/api/comfy/settings').body.modelPolicy,'unload');
  await f.settings.close();await f.open();assert.equal(f.element('comfy-model-policy').value,'unload');assert.equal(f.settings.hasUnsaved(),false);
});

test('alternate policy is saved and restored without converting it to keep or claiming concurrent rendering',async()=>{
  let saved={...defaultComfy,enabled:true};
  const f=fixture((route,options)=>route==='/api/comfy/settings'?options?.method==='POST'?(saved={...saved,...JSON.parse(options.body)}):structuredClone(saved):undefined);
  await f.open();f.element('comfy-model-policy').value='alternate';f.fire('comfy-model-policy','change');assert.equal(f.settings.hasUnsaved(),true);
  await f.fire('comfy-settings-form','submit');assert.equal(saved.modelPolicy,'alternate');assert.equal(f.settings.hasUnsaved(),false);
  await f.settings.close();await f.open();assert.equal(f.element('comfy-model-policy').value,'alternate');
  f.element('agent-images').checked=true;f.state.chat={imageCount:2};f.settings.imagePermission();assert.match(f.element('image-settings-help').textContent,/attendent la fin de l’image en cours/);
  assert.match(f.element('image-settings-help').textContent,/entre deux images/);assert.doesNotMatch(f.element('image-settings-help').textContent,/pendant un rendu|simultané/);
  f.element('comfy-model-policy').value='keep';f.fire('comfy-model-policy','change');await f.fire('comfy-cancel');assert.equal(f.element('comfy-model-policy').value,'alternate');
});

test('image counts from one to five restore with an accessible count and respect disabled permissions',async()=>{
  const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,enabled:true}:undefined);await f.settings.refresh();f.element('agent-images').checked=true;
  for(const count of [1,2,3,4,5]){
    f.state.chat={imageCount:count};f.settings.imagePermission();
    assert.equal(f.element('image-count').value,String(count));assert.equal(f.element('image-count-value').textContent,count+' image'+(count>1?'s':''));
    assert.equal(f.element('image-count').attributes['aria-valuetext'],count+' image'+(count>1?'s':''));
    assert.equal(f.settings.decorate({model:'m',imageAccess:true}).imageCount,count);
    assert.match(f.element('image-settings-help').textContent,count===1?/Une image/:new RegExp(count+' prompts différents'));
  }
  f.state.draftImageCount=2;f.settings.imagePermission();assert.equal(f.element('image-count').value,'2');
  f.element('agent-images').checked=false;f.settings.imagePermission();assert.equal(f.element('image-count-value').textContent,'0 image (désactivé)');
  assert.equal(f.element('image-count').disabled,true);assert.equal(f.element('image-model-policy').disabled,true);assert.match(f.element('image-settings-help').textContent,/0 image autorisée/);
  assert.equal(f.settings.decorate({model:'m',imageAccess:false}).imageCount,undefined);
});

test('per-message model policy preserves the chosen intent across settings refreshes and can clear an earlier override',async()=>{
  let globalPolicy='unload';const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,enabled:true,modelPolicy:globalPolicy}:undefined);
  await f.settings.refresh();f.element('agent-images').checked=true;f.state.chat={imageCount:3,imageModelPolicy:'keep'};f.settings.imagePermission();
  assert.equal(f.element('image-model-policy').value,'keep');assert.equal(f.settings.decorate({model:'m',imageAccess:true}).imageModelPolicy,'keep');
  f.state.draftImageModelPolicy='alternate';globalPolicy='keep';await f.settings.refresh();
  assert.equal(f.element('image-model-policy').value,'alternate');assert.match(f.element('image-settings-help').textContent,/Choix pour ce message/);
  assert.equal(f.settings.decorate({model:'m',imageAccess:true}).imageModelPolicy,'alternate');
  f.state.draftImageModelPolicy='';globalPolicy='unload';await f.settings.refresh();
  assert.equal(f.element('image-model-policy').value,'');assert.equal(Object.hasOwn(f.settings.decorate({model:'m',imageAccess:true}),'imageModelPolicy'),false);
  assert.match(f.element('image-settings-help').textContent,/Paramètres globaux/);assert.match(f.element('image-settings-help').textContent,/déchargé avant les images/);
  f.state.draftImageModelPolicy=null;f.state.chat={imageCount:1};f.settings.imagePermission();assert.equal(f.element('image-model-policy').value,'');
  f.state.draftImageModelPolicy='unload';f.settings.imagePermission();assert.equal(f.settings.decorate({model:'m',imageAccess:false}).imageModelPolicy,undefined);
});

test('queue recovery is hidden unless the server explicitly reports a paused queue',async()=>{
  const f=fixture();await f.open();assert.equal(f.element('comfy-queue-paused').hidden,true);
  await f.fire('comfy-queue-resume');assert.equal(f.writes.filter(write=>write.route==='/api/comfy/queue/resume').length,0);
});

test('queue recovery refreshes queue state without saving or replacing an edited image configuration',async()=>{
  let paused=true;
  const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,queuePaused:paused,activeJobs:paused?3:2}:route==='/api/comfy/queue/resume'?(paused=false,{ok:true}):undefined);
  await f.open();assert.equal(f.element('comfy-queue-paused').hidden,false);
  f.element('comfy-model-policy').value='unload';f.fire('comfy-model-policy','change');
  await f.fire('comfy-queue-resume');
  const writes=f.writes.filter(write=>write.route==='/api/comfy/queue/resume');assert.equal(writes.length,1);assert.deepEqual(writes[0].body,{});
  assert.equal(f.element('comfy-queue-paused').hidden,true);assert.match(f.element('comfy-result').textContent,/File reprise/);
  assert.equal(f.element('comfy-model-policy').value,'unload');assert.equal(f.settings.hasUnsaved(),true);
  assert.equal(f.writes.filter(write=>write.route==='/api/comfy/settings').length,0);
});

test('busy queue recovery displays its error and prevents duplicate clicks while the request is pending',async()=>{
  const response=deferred(),f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,queuePaused:true}:route==='/api/comfy/queue/resume'?response.promise:undefined);
  await f.open();const pending=f.fire('comfy-queue-resume');assert.equal(f.element('comfy-queue-resume').disabled,true);
  await f.fire('comfy-queue-resume');assert.equal(f.writes.filter(write=>write.route==='/api/comfy/queue/resume').length,1);
  response.reject(Error('ComfyUI traite encore une image.'));await pending;
  assert.equal(f.element('comfy-queue-paused').hidden,false);assert.equal(f.element('comfy-queue-resume').disabled,false);
  assert.equal(f.element('comfy-error').hidden,false);assert.match(f.element('comfy-error').textContent,/traite encore une image/);
});

test('an old queue recovery cannot update a reopened settings view',async()=>{
  const response=deferred();let paused=true;
  const f=fixture(route=>route==='/api/comfy/settings'?{...defaultComfy,queuePaused:paused}:route==='/api/comfy/queue/resume'?response.promise:undefined);
  await f.open();const pending=f.fire('comfy-queue-resume');await f.settings.close();paused=false;await f.open();
  assert.equal(f.element('comfy-queue-paused').hidden,true);assert.equal(f.element('comfy-result').textContent,'');
  response.resolve({ok:true});await pending;
  assert.equal(f.element('comfy-queue-paused').hidden,true);assert.equal(f.element('comfy-result').textContent,'');assert.equal(f.element('comfy-queue-resume').disabled,false);
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
  assert.equal(f.element('output-all-sessions').value,'session');
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
  assert.match(f.element('comfy-server-status').textContent,/Serveur ComfyUI inaccessible/);
  assert.match(f.element('comfy-result').textContent,/Complète/);
  assert.equal(f.element('comfy-test').disabled,false);
});
test('an explicit automatic session override reopens as automatic even when its source is session',async()=>{
  const f=fixture(route=>route.startsWith('/api/model-preferences?')?{source:'session',automatic:true,maxOutputTokens:8192,contextLength:16000,applyToAllSessions:false}:undefined);
  f.state.chat={id:'web-A',source:'web'};await f.open();
  assert.equal(f.element('output-mode').value,'auto');assert.equal(f.element('output-manual').hidden,true);
  assert.equal(f.element('output-all-sessions').value,'session');
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

function editOutput(f,value){f.element('output-mode').value='manual';f.fire('output-mode','change');f.element('output-tokens').value=String(value);f.fire('output-tokens','input');}
const persistedWrites=f=>f.writes.filter(write=>['/api/model-preferences','/api/comfy/settings'].includes(write.route));

test('eight pages and local search keep form edits, expose scope and never submit values',async()=>{
  const f=fixture();await f.open();editOutput(f,4567);await f.fire('nav-images');
  assert.equal(f.element('settings-page-images').hidden,false);assert.equal(f.element('settings-page-models').hidden,true);assert.equal(f.element('output-tokens').value,'4567');
  assert.equal(f.element('settings-view').dataset.settingsIndex,'false');await f.fire('settings-back');assert.equal(f.element('settings-view').dataset.settingsIndex,'true');
  for(const query of ['tokens','permissions','LoRA','certificat','brouillons','renommer','corbeille','python','redémarrer']){f.element('settings-search').value=query;await f.fire('settings-search','input');assert(f.element('settings-results').children.length>0,query);}
  f.element('settings-search').value='tokens';await f.fire('settings-search','input');const result=f.element('settings-results').children[0];assert.equal(result.children[1].textContent,'Chat ou défaut du modèle');await result.listeners.click();
  assert.equal(f.element('settings-page-models').hidden,false);assert.equal(f.element('output-tokens').value,'4567');assert.equal(f.document.activeElement,f.element('output-mode'));assert.equal(persistedWrites(f).length,0);
});

test('Continue keeps the dirty form, Keep only retains it in memory and Annuler restores the loaded value',async()=>{
  const f=fixture();await f.open();editOutput(f,3333);const first=f.settings.close();assert.equal(f.element('settings-unsaved').hidden,false);await f.fire('settings-unsaved-continue');assert.equal(await first,false);assert.equal(f.element('settings-view').hidden,false);assert.equal(f.element('output-tokens').value,'3333');
  const second=f.settings.close();await f.fire('settings-unsaved-keep');await second;assert.equal(f.element('settings-view').hidden,true);assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
  await f.open();assert.equal(f.element('output-tokens').value,'3333');assert.equal(f.settings.hasUnsaved(),true);await f.fire('output-cancel');assert.equal(f.element('output-tokens').value,'8192');assert.equal(f.settings.hasUnsaved(),false);assert.equal(persistedWrites(f).length,0);
});

test('abandoning one target preserves a kept form from another conversation',async()=>{
  const f=fixture();f.state.viewKey='p|A';await f.open();editOutput(f,1111);const a=f.settings.close();await f.fire('settings-unsaved-keep');await a;
  f.state.viewKey='p|B';await f.open();assert.equal(f.element('output-tokens').value,'8192');editOutput(f,2222);const b=f.settings.close();await f.fire('settings-unsaved-discard');await b;
  f.state.viewKey='p|A';await f.open();assert.equal(f.element('output-tokens').value,'1111');assert.equal(f.settings.decorate({model:'m'}).outputPreferences,undefined);
});

test('model target changes are guarded and retained drafts stay independent without changing the composer model',async()=>{
  const f=fixture();f.state.status.models.push({id:'n',name:'Modèle N'});await f.open();editOutput(f,4444);f.element('settings-model').value='n';const change=f.fire('settings-model','change');assert.equal(f.element('settings-model').value,'m');await f.fire('settings-unsaved-keep');await change;assert.equal(f.element('settings-model').value,'n');assert.equal(f.element('output-tokens').value,'8192');
  f.element('settings-model').value='m';await f.fire('settings-model','change');assert.equal(f.element('output-tokens').value,'4444');assert.equal(f.element('model').value,'m');assert.equal(persistedWrites(f).length,0);
});

test('a delayed output GET for model m cannot replace model n and unavailable values remain guarded',async()=>{
  const old=deferred();let reads=0;const f=fixture(route=>route.startsWith('/api/model-preferences?')&&++reads===1?old.promise:undefined);f.state.status.models.push({id:'n',name:'Modèle N'});
  const opening=f.open();await tick();assert.equal(f.element('output-mode').disabled,true);f.element('settings-model').value='n';await f.fire('settings-model','change');old.resolve({source:'model',automatic:false,maxOutputTokens:555,contextLength:1000,applyToAllSessions:true});await opening;
  assert.equal(f.element('settings-model').value,'n');assert.equal(f.element('output-mode').value,'auto');assert.equal(f.element('output-tokens').value,'8192');assert.equal(f.element('output-save').disabled,false);
});

test('reload and beforeunload protect unsent forms without persisting or applying them',async()=>{
  let reads=0;const f=fixture(route=>{if(route.startsWith('/api/model-preferences?'))reads++;});await f.open();editOutput(f,7777);let prevented=false;f.globalEvents.beforeunload({preventDefault(){prevented=true;}});assert(prevented);
  const reload=f.fire('settings-reload');assert.equal(reads,1);await f.fire('settings-unsaved-discard');await reload;assert.equal(reads,2);assert.equal(f.element('output-tokens').value,'8192');assert.equal(persistedWrites(f).length,0);
});

test('automatic session origin is explicit and a global save keeps its existing clear-current effect',async()=>{
  const f=fixture(route=>route.startsWith('/api/model-preferences?')?{source:'session',automatic:true,maxOutputTokens:8192,modelMaxOutputTokens:1234,contextLength:12000,applyToAllSessions:false}:undefined);f.state.chat={id:'web-A',source:'web',name:'Alpha'};await f.open();assert.match(f.element('output-origin').textContent,/Exception de ce chat/);assert.match(f.element('output-origin').textContent,/pas une reprise/);assert.match(f.element('output-effective').textContent,/calculé à chaque appel/);
  await f.saveOutput(5000000,true);const write=persistedWrites(f).at(-1);assert.equal(write.body.id,'web-A');assert.equal(write.body.applyToAllSessions,true);assert.equal(write.body.maxOutputTokens,5000000);assert.match(f.element('output-result').textContent,/exception du chat courant retirée/);
});

test('Annuler restores the complete ComfyUI configuration and both independent LoRA profiles',async()=>{
  const data={...defaultComfy,workflows:[{id:'krea2_turbo',label:'Krea'},{id:'hassaku_illustrious',label:'Hassaku'}],loraProfiles:{krea2_turbo:[{name:'k1',strength:.4},{name:'k2',strength:.5}],hassaku_illustrious:[{name:'h1',strength:.6},{name:'h2',strength:.7}]}};
  const f=fixture(route=>route==='/api/comfy/settings'?structuredClone(data):undefined);await f.open();f.element('comfy-lora-1').value='changed';f.fire('comfy-lora-1','change');f.element('comfy-workflow').value='hassaku_illustrious';f.fire('comfy-workflow','change');f.element('comfy-lora-2-strength').value='19';f.fire('comfy-lora-2-strength','input');f.element('comfy-url').value='http://192.168.1.44:8188';f.fire('comfy-url','input');
  await f.fire('comfy-cancel');assert.equal(f.element('comfy-url').value,data.url);assert.equal(f.element('comfy-workflow').value,'krea2_turbo');assert.equal(f.element('comfy-lora-1').value,'k1');f.element('comfy-workflow').value='hassaku_illustrious';f.fire('comfy-workflow','change');assert.equal(f.element('comfy-lora-2').value,'h2');assert.equal(f.element('comfy-lora-2-strength').value,'0.7');assert.equal(persistedWrites(f).length,0);
});

test('ComfyUI tests use unsaved fields but never change enabled state or save the configuration',async()=>{
  const f=fixture(route=>route==='/api/comfy/check'?{ok:true,reachable:true,workflows:[]}:undefined);await f.open();f.element('comfy-enabled').checked=true;f.element('comfy-url').value='http://192.168.1.44:8188';await f.fire('comfy-test');assert.equal(f.settings.enabled(),false);assert.equal(persistedWrites(f).length,0);assert.equal(f.writes.at(-1).body.url,'http://192.168.1.44:8188');assert.match(f.element('comfy-result').textContent,/aucune saisie enregistrée/);
});

test('late submitted output cannot erase a newer kept unsent form for the same target',async()=>{
  const save=deferred(),f=fixture((route,options)=>route==='/api/model-preferences'&&options?.method==='POST'?save.promise:undefined);f.state.chat={id:'web-A',source:'web'};f.state.viewKey='p|web-A';await f.open();const saving=f.saveOutput(4000);await tick();editOutput(f,5000);const closing=f.settings.close();await f.fire('settings-unsaved-keep');await closing;save.resolve({source:'session',automatic:false,maxOutputTokens:4000});await saving;await f.open();assert.equal(f.element('output-tokens').value,'5000');assert.equal(f.settings.hasUnsaved(),true);
});

test('a late old global save cannot erase a newer local preference prepared in this tab',async()=>{
  const save=deferred(),f=fixture((route,options)=>route==='/api/model-preferences'&&options?.method==='POST'?save.promise:undefined);await f.open();const older=f.saveOutput(4000,true);await tick();f.settings.close();await f.open();await f.saveOutput(777,false);save.resolve({source:'model',automatic:false,maxOutputTokens:4000});await older;assert.equal(f.settings.decorate({model:'m'}).outputPreferences.maxOutputTokens,777);assert.equal(f.element('output-tokens').value,'777');
});

test('a rejected save for m cannot add errors or enable the form while model n is loading',async()=>{
  const save=deferred(),load=deferred();let waiting=false;const f=fixture((route,options)=>route==='/api/model-preferences'&&options?.method==='POST'?save.promise:waiting&&route.startsWith('/api/model-preferences?')?load.promise:undefined);f.state.status.models.push({id:'n',name:'N'});f.state.chat={id:'web-A',source:'web'};await f.open();const saving=f.saveOutput(4000);await tick();waiting=true;f.element('settings-model').value='n';const loading=f.fire('settings-model','change');save.reject(Error('Old model failure'));await saving;assert.equal(f.element('output-error').textContent,'');assert.equal(f.element('output-save').disabled,true);load.resolve({source:'auto',automatic:true,maxOutputTokens:8192,applyToAllSessions:false});await loading;assert.equal(f.element('output-save').disabled,false);
});

test('certificate fields are cleared when leaving Connection or its mobile index, not stored with kept forms',async()=>{
  const f=fixture();await f.settings.openSecurity();f.element('certificate-export-password').textContent='SYNTHETIC_PASSWORD';f.element('certificate-proof-csrf').value='SYNTHETIC_CSRF';f.element('certificate-device-name').value='SYNTHETIC_NAME';await f.fire('nav-models');assert.equal(f.element('certificate-export-password').textContent,'');assert.equal(f.element('certificate-proof-csrf').value,'');assert.equal(f.element('certificate-device-name').value,'');
  await f.fire('nav-connection');f.element('certificate-export-password').textContent='SYNTHETIC_PASSWORD';await f.fire('settings-back');assert.equal(f.element('certificate-export-password').textContent,'');
  editOutput(f,3333);const closing=f.settings.close();await f.fire('settings-unsaved-keep');await closing;await f.open();assert.equal(f.element('output-tokens').value,'3333');assert.equal(f.element('certificate-export-password').textContent,'');f.element('settings-search').value='SYNTHETIC_PASSWORD';await f.fire('settings-search','input');assert.equal(f.element('settings-results').children.length,0);
});

test('navigation callbacks wait for a dirty decision and revision tokens expire after close',async()=>{
  const f=fixture();await f.open();const revision=f.settings.revision();assert(f.settings.isCurrent(revision));editOutput(f,9999);const navigation=f.settings.requestNavigate('tools');assert.equal(f.navigations.length,0);await f.fire('settings-unsaved-continue');await navigation;assert.equal(f.navigations.length,0);assert.equal(f.element('settings-view').hidden,false);
  const next=f.settings.requestNavigate('tools');await f.fire('settings-unsaved-discard');await next;assert.deepEqual(f.navigations,['tools']);assert.equal(f.settings.isCurrent(revision),false);assert.equal(f.element('settings-view').hidden,true);
});

test('searching for an unavailable certificate action focuses its visible heading',async()=>{
  const f=fixture();await f.open();f.element('settings-search').value='préparer https';await f.fire('settings-search','input');const result=f.element('settings-results').children[0];await result.listeners.click();assert.equal(f.element('settings-page-connection').hidden,false);assert.equal(f.document.activeElement,f.element('settings-heading-connection'));assert.equal(f.element('certificate-controls').hidden,true);
});

test('a delayed security result after Back cannot restore a secret or target focus in the hidden page',async()=>{
  const response=deferred(),f=fixture(route=>route==='/api/security/status'?response.promise:undefined);await f.open();const opening=f.fire('nav-connection');await tick();f.element('certificate-export-password').textContent='SYNTHETIC_ONLY';await f.fire('settings-back');const focus=f.document.activeElement;
  response.resolve({mode:'http',epoch:1,server:null,authority:null,devices:[],web:{canConfigure:true,canIssueDevice:true}});await opening;assert.equal(f.element('certificate-export-password').textContent,'');assert.equal(f.element('certificate-controls').hidden,true);assert.equal(f.document.activeElement,focus);assert.equal(f.element('settings-view').dataset.settingsIndex,'true');
});

test('targeted opening preserves a non-enumerable event currentTarget as its return focus',async()=>{
  const f=fixture(),trigger=f.element('non-focused-touch-trigger'),event={};Object.defineProperty(event,'currentTarget',{get:()=>trigger});f.document.activeElement=f.element('unrelated-control');await f.settings.openPage(event,'models','output-mode');f.settings.close();assert.equal(f.document.activeElement,trigger);
});

test('closing restores an available chat or sidebar trigger when the original menu entry is hidden',async()=>{
  for(const inThread of [true,false]){
    const f=fixture(),trigger=f.element('ephemeral-settings-trigger');await f.settings.openPage({currentTarget:trigger},'reading');trigger.hidden=true;
    f.element('conversation-options-toggle').hidden=!inThread;
    await f.settings.close();
    assert.equal(f.document.activeElement,f.element(inThread?'conversation-options-toggle':'settings-open-sidebar'));
  }
});


test('optional memory cleanup participates in dirty state, cancel and saved configuration',async()=>{
  let saved={...defaultComfy,memoryCleanup:false};
  const f=fixture((route,options)=>route==='/api/comfy/settings'?(options?.method==='POST'?(saved={...saved,...JSON.parse(options.body)}):structuredClone(saved)):undefined);
  await f.open();assert.equal(f.settings.hasUnsaved(),false);
  f.element('comfy-memory-cleanup').checked=true;f.fire('comfy-memory-cleanup','change');assert.equal(f.settings.hasUnsaved(),true);
  f.fire('comfy-cancel');assert.equal(f.element('comfy-memory-cleanup').checked,false);assert.equal(f.settings.hasUnsaved(),false);
  f.element('comfy-memory-cleanup').checked=true;f.fire('comfy-memory-cleanup','change');await f.fire('comfy-settings-form','submit');
  assert.equal(saved.memoryCleanup,true);assert.equal(f.settings.hasUnsaved(),false);
  await f.settings.close();await f.open();assert.equal(f.element('comfy-memory-cleanup').checked,true);
});

test('guided diagnostics discard a response for edited values and keep the test button usable',async()=>{
  const waiting=deferred();let count=0;
  const f=fixture(route=>route==='/api/comfy/check'?++count===1?waiting.promise:{ok:true,reachable:true,url:'http://127.0.0.1:8000',workflows:[],memoryCleanup:{available:false}}:undefined);
  await f.open();const old=f.fire('comfy-test');
  f.element('comfy-url').value='http://127.0.0.1:8000';f.fire('comfy-url','input');
  waiting.resolve({ok:true,reachable:true,url:'http://127.0.0.1:8188',workflows:[]});await old;
  assert.equal(f.element('comfy-diagnostic').hidden,true);assert.equal(f.element('comfy-test').disabled,false);
  await f.fire('comfy-test');assert.match(f.element('comfy-server-status').textContent,/8000/);
  assert.match(f.element('comfy-memory-status').textContent,/ne bloque pas/);
});

test('guided discovery cannot replace a changed address or an invalidated settings view',async()=>{
  const waiting=deferred();
  const f=fixture(route=>route==='/api/comfy/discover'?waiting.promise:undefined);
  await f.open();const old=f.fire('comfy-discover');
  f.element('comfy-url').value='http://127.0.0.1:9000';f.fire('comfy-url','input');
  waiting.resolve({servers:[{url:'http://127.0.0.1:8000'}]});await old;
  assert.equal(f.element('comfy-servers').children.length,0);assert.equal(f.element('comfy-url').value,'http://127.0.0.1:9000');
  assert.equal(f.element('comfy-discover').disabled,false);
});
