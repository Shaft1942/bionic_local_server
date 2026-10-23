import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const source=(await Promise.all(['i18n.js','locales/fr/local-services.js','locales/en/local-services.js','local-services.js'].map(file=>fs.readFile(new URL('../public/'+file,import.meta.url),'utf8')))).join('\n');
const service=(id='comfyui',extra={})=>({id,revision:'revision-1',configuration:{status:'valid'},controlMode:'owned-process',process:{state:'running'},api:{state:'ready'},model:{state:'unknown'},activity:{state:'idle',observedAt:'2026-10-23T14:30:00Z'},actions:{start:{allowed:false,reasonCode:'service_busy'},stop:{allowed:true},restart:{allowed:true}},...extra});
function fixture(intercept=()=>undefined,onComfyAvailability){
  const all=[],calls=[],timers=new Map(),storage=new Map();let seq=0;
  const document={hidden:false,activeElement:null,addEventListener(){},querySelectorAll(){return [];},getElementById:id=>all.find(item=>item.id===id)};
  function node(tag,className='',textContent=''){const item={tagName:tag,className,textContent,hidden:false,disabled:false,children:[],attributes:{},listeners:{},append(...items){for(const child of items){child.parent=this;this.children.push(child);}},replaceChildren(...items){this.children=[];this.append(...items);},setAttribute(key,value){this.attributes[key]=value;},addEventListener(type,handler){this.listeners[type]=handler;},focus(){document.activeElement=this;},scrollIntoView(){}};all.push(item);return item;}
  for(const id of ['settings-view','local-services-list','local-services-status','local-services-reload','launcher-setup-guide','launcher-setup-title'])node('div').id=id;
  const state={authenticated:true,authEpoch:1};let current=service();
  const api=async(route,options)=>{calls.push({route,options});const result=intercept(route,options);if(result!==undefined)return result;if(route==='/api/local-services')return {services:[current],csrfNonce:'synthetic-only'};if(route.endsWith('/actions'))return {operation:{id:'operation-1',action:JSON.parse(options.body).action,status:'running',phase:'starting',startedAt:new Date().toISOString()}};throw Object.assign(Error('fixture route absent'),{status:404});};
  const context={document,console,Intl,Date,JSON,Map,Set,URL,Uint8Array,crypto:webcrypto,navigator:{language:'fr'},sessionStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},setTimeout:callback=>{const id=++seq;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(context);vm.runInContext(source,context);context.api=api;context.node=node;context.getState=()=>state;context.onComfyAvailability=onComfyAvailability;const controller=vm.runInContext('createLocalServices({api,node,getState,onComfyAvailability})',context);
  const el=id=>document.getElementById(id),view=id=>el('launcher-'+id),click=id=>el(id).listeners.click();
  return {context,controller,calls,all,timers,storage,state,document,el,view,click,set(value){current=value;},text(id){const collect=item=>[item.textContent,...item.children.map(collect)].join(' ');return collect(view(id));}};
}
test('manual control uses server capability and opaque confirmed revision, sends once with CSRF',async()=>{
  const f=fixture();await f.controller.setVisible(true);f.click('launcher-comfyui-stop');assert.equal(f.document.activeElement.id,'launcher-comfyui-confirm-title');
  const confirmation=f.view('comfyui').children.find(item=>item.className==='local-service-confirmation');assert.equal(confirmation.attributes.role,'group');assert.equal(confirmation.children.at(-1).children[0].textContent,'Annuler');
  const confirm=confirmation.children.at(-1).children[1],first=confirm.listeners.click();confirm.listeners.click();await first;const writes=f.calls.filter(call=>call.options?.method==='POST');assert.equal(writes.length,1);assert.equal(writes[0].options.headers['X-Local-Service-CSRF'],'synthetic-only');
  const body=JSON.parse(writes[0].options.body);assert.equal(body.expectedRevision,'revision-1');assert.equal(body.action,'stop');assert.match(body.idempotencyKey,/^[0-9a-f-]{36}$/);f.controller.setVisible(false);assert.equal(f.timers.size,0);
});
test('unknown or external process and unknown work never get locally inferred actions',async()=>{
  const f=fixture();f.set(service('comfyui',{process:{state:'external'},api:{state:'unavailable'},activity:{state:'unknown'},actions:{start:{allowed:false,reasonCode:'external_process'},stop:{allowed:false,reasonCode:'activity_unknown'},restart:{allowed:false,reasonCode:'activity_unknown'}}}));await f.controller.setVisible(true);
  assert.equal(f.el('launcher-comfyui-start').disabled,true);assert.match(f.text('comfyui'),/Ferme cette instance sur le PC/);assert.match(f.text('comfyui'),/API inaccessible/);assert.doesNotMatch(f.text('comfyui'),/Processus arrêté/);f.click('launcher-comfyui-stop');assert.equal(f.calls.filter(call=>call.options?.method==='POST').length,0);
});
test('Escape cancels inline intention and returns focus before outer Escape handler',async()=>{
  const f=fixture();await f.controller.setVisible(true);f.click('launcher-comfyui-restart');let stopped=false,prevented=false;f.el('settings-view').listeners.keydown({key:'Escape',preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});assert.equal(stopped,true);assert.equal(prevented,true);assert.equal(f.document.activeElement.id,'launcher-comfyui-restart');assert.equal(f.calls.filter(call=>call.options?.method==='POST').length,0);
});
test('language changes and polling preserve confirmation and its original revision',async()=>{
  const f=fixture();await f.controller.setVisible(true);f.click('launcher-comfyui-stop');const focus=f.document.activeElement;f.context.BionicI18n.setLanguage('en');assert.equal(f.document.activeElement,focus);assert.equal(focus.textContent,'Stop ComfyUI?');
  f.set(service('comfyui',{revision:'revision-2'}));await f.controller.refresh();const confirm=f.view('comfyui').children.find(item=>item.className==='local-service-confirmation').children.at(-1).children[1];assert.equal(confirm.disabled,true);await confirm.listeners.click();assert.equal(f.calls.filter(call=>call.options?.method==='POST').length,0);
});
test('lost acceptance is recovered by GET key, never by replaying the action',async()=>{
  let posted=false;const f=fixture((route,options)=>{if(route.endsWith('/actions')){posted=true;throw Error('synthetic network lost');}if(route.startsWith('/api/local-service-operations/'))return {operation:{id:'recovered',action:'start',status:'running',phase:'checking_api'}};});f.set(service('comfyui',{process:{state:'stopped'},actions:{start:{allowed:true},stop:{allowed:false},restart:{allowed:false}}}));await f.controller.setVisible(true);await f.click('launcher-comfyui-start');assert.equal(posted,true);assert.equal(f.calls.filter(call=>call.options?.method==='POST').length,1);assert.equal(f.calls.filter(call=>call.route.startsWith('/api/local-service-operations/')).length,1);assert.match(f.text('comfyui'),/Vérification de l’API/);f.controller.setVisible(false);await f.controller.setVisible(true);assert.equal(f.calls.filter(call=>call.options?.method==='POST').length,1);
});
test('close and authentication reset ignore delayed results and stop polling',async()=>{
  let resolve;const held=new Promise(done=>resolve=done);const f=fixture(route=>route==='/api/local-services'?held:undefined),request=f.controller.setVisible(true);f.controller.setVisible(false);f.controller.reset();f.state.authenticated=false;f.state.authEpoch++;resolve({services:[service()],csrfNonce:'late'});await request;assert.equal(f.timers.size,0);assert.equal(f.el('launcher-comfyui-stop').disabled,true);
});
test('connection loss keeps last known observations and disables action',async()=>{
  let fail=false;const f=fixture(route=>{if(fail&&route==='/api/local-services')throw Error('synthetic offline');});await f.controller.setVisible(true);fail=true;await f.controller.refresh();assert.match(f.text('comfyui'),/Connexion au PC perdue/);assert.equal(f.el('launcher-comfyui-stop').disabled,true);assert.doesNotMatch(f.text('comfyui'),/Processus arrêté/);
});

const setupSnapshot=(revision='setup-1',canConfigure=true)=>({canConfigure,revision,services:[{id:'comfyui',configured:false}]});
const syntheticProfile={pythonPath:'C:/synthetic/.venv/Scripts/python.exe',entryPath:'C:/synthetic/main.py',workingDirectory:'C:/synthetic'};
test('guided detection saves only typed profile paths after dedicated-use consent and never starts a server',async()=>{
  const f=fixture((route,options)=>route==='/api/local-service-setup'?setupSnapshot():route.endsWith('/discover')?{candidates:[{id:'installation',label:'Synthetic ComfyUI',profile:syntheticProfile}]}:route.endsWith('/save')?{saved:true,...setupSnapshot('setup-2')}:undefined);
  await f.controller.setVisible(true);assert.equal(f.el('launcher-comfyui-save').disabled,true);await f.click('launcher-comfyui-detect');assert.equal(f.el('launcher-comfyui-pythonPath').value,syntheticProfile.pythonPath);assert.equal(f.el('launcher-comfyui-save').disabled,true);
  f.el('launcher-comfyui-exclusive').checked=true;f.el('launcher-comfyui-exclusive').listeners.change();await f.click('launcher-comfyui-save');
  const posts=f.calls.filter(c=>c.options?.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].options.headers['X-Local-Service-CSRF'],'synthetic-only');assert.deepEqual(JSON.parse(posts[1].options.body),{serviceId:'comfyui',expectedRevision:'setup-1',exclusiveControl:true,profile:syntheticProfile});assert.equal(posts.some(c=>c.route.endsWith('/actions')),false);assert.match(f.el('launcher-comfyui-setup-status').textContent,/Configuration enregistrée/);
});

test('phone setup remains unavailable and never accepts detection or save',async()=>{
  const f=fixture(route=>route==='/api/local-service-setup'?setupSnapshot('phone',false):undefined);await f.controller.setVisible(true);assert.equal(f.el('launcher-comfyui-detect').disabled,true);await f.click('launcher-comfyui-detect');assert.equal(f.calls.some(c=>c.options?.method==='POST'),false);assert.match(f.text('comfyui'),/sur le PC du compagnon/);
});

test('closing during setup allows reopening and authentication reset removes private paths and consent',async()=>{
  let resolve;const held=new Promise(done=>resolve=done);const f=fixture(route=>route==='/api/local-service-setup'?setupSnapshot():route.endsWith('/discover')?held:undefined);await f.controller.setVisible(true);const first=f.click('launcher-comfyui-detect');f.controller.setVisible(false);await f.controller.setVisible(true);assert.equal(f.el('launcher-comfyui-detect').disabled,false);resolve({candidates:[{label:'Old private path',profile:syntheticProfile}]});await first;assert.notEqual(f.el('launcher-comfyui-pythonPath').value,syntheticProfile.pythonPath);f.el('launcher-comfyui-pythonPath').value=syntheticProfile.pythonPath;f.el('launcher-comfyui-exclusive').checked=true;f.controller.reset();assert.equal(f.el('launcher-comfyui-pythonPath').value,'');assert.equal(f.el('launcher-comfyui-exclusive').checked,false);assert.equal(f.el('launcher-comfyui-detect').disabled,true);
});

test('a setup conflict refreshes the opaque revision without losing edited paths or resubmitting',async()=>{
  let reads=0,saves=0;const f=fixture(route=>route==='/api/local-service-setup'?setupSnapshot(++reads===1?'setup-1':'setup-2'):route.endsWith('/save')?(++saves===1?Promise.reject(Object.assign(Error('conflict'),{status:409,code:'setup-stale-revision'})):{saved:true,...setupSnapshot('setup-3')}):undefined);await f.controller.setVisible(true);for(const [field,value]of Object.entries(syntheticProfile)){f.el('launcher-comfyui-'+field).value=value;f.el('launcher-comfyui-'+field).listeners.input();}f.el('launcher-comfyui-exclusive').checked=true;await f.click('launcher-comfyui-save');assert.equal(saves,1);assert.equal(f.el('launcher-comfyui-pythonPath').value,syntheticProfile.pythonPath);assert.match(f.el('launcher-comfyui-setup-status').textContent,/configuration a changé/);await f.click('launcher-comfyui-save');assert.equal(JSON.parse(f.calls.filter(c=>c.route.endsWith('/save')).at(-1).options.body).expectedRevision,'setup-2');assert.equal(saves,2);
});

test('numeric operation timestamps show elapsed time while technical observations remain folded',async()=>{
  const f=fixture();f.set(service('bionic',{operation:{id:'op',status:'running',action:'start',phase:'starting',startedAt:Date.now()-12000}}));await f.controller.setVisible(true);assert.match(f.text('bionic'),/1[2-3] secondes écoulées/);assert.match(f.text('bionic'),/Desktop reste ouvert/);assert.equal(f.el('launcher-bionic-restart').parent.tagName,'details');assert.equal(f.el('launcher-bionic-restart').parent.open,undefined);
});

test('observed ComfyUI availability changes notify the composer once, and obsolete replies cannot notify',async()=>{
  const observed=[],f=fixture(()=>undefined,value=>observed.push(value));f.set(service('comfyui',{api:{state:'unavailable'}}));await f.controller.setVisible(true);await f.controller.refresh();f.set(service('comfyui',{api:{state:'ready'}}));await f.controller.refresh();await f.controller.refresh();f.set(service('comfyui',{api:{state:'unknown'}}));await f.controller.refresh();assert.deepEqual(observed,[false,true]);
  let resolve;const held=new Promise(done=>resolve=done),late=fixture(route=>route==='/api/local-services'?held:undefined,value=>observed.push(value));const request=late.controller.setVisible(true);late.controller.reset();late.state.authEpoch++;resolve({services:[service('comfyui',{api:{state:'unavailable'}})],csrfNonce:'old'});await request;assert.deepEqual(observed,[false,true]);
});
