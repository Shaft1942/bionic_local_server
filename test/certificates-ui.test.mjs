import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const source=await fs.readFile(new URL('../public/certificates.js',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
const settingsSource=await fs.readFile(new URL('../public/settings.js',import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
const tomorrow=new Date(Date.now()+86400000).toISOString();
const later=new Date(Date.now()+365*86400000).toISOString();
const fingerprint=Array(32).fill('AB').join(':');
const status=(mode='http')=>({mode,epoch:1,server:mode==='http'?null:{fingerprint,expiresAt:later,hosts:['127.0.0.1','bionic.local']},authority:mode==='http'?null:{fingerprint,expiresAt:later},devices:[]});

function fixture(intercept=()=>status()){
  const elements=new Map(),calls=[];
  function node(tag='div',className='',textContent=''){
    return {tag,className,textContent,hidden:false,disabled:false,children:[],listeners:{},
      value:'',focus(){},querySelectorAll(){return this.children.filter(child=>child.tag==='button');},
      append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},
      addEventListener(type,fn){this.listeners[type]=fn;}};
  }
  const el=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
  const state={authenticated:true,authEpoch:1};
  const api=async(...args)=>{calls.push(args);return intercept(...args);};
  const context=vm.createContext({document:{getElementById:el},Intl});
  vm.runInContext(source,context);
  const certificates=context.createCompanionCertificates({api,getState:()=>state,node});
  const text=element=>element.textContent+element.children.map(text).join('\n');
  const allText=()=>[...elements.values()].map(text).join('\n');
  return {el,state,calls,certificates,allText};
}

test('all three active levels have distinct truthful descriptions and certificate metadata',async()=>{
  for(const [mode,label,description] of [['http','HTTP','ne sont pas chiffrés'],['https','HTTPS','certificat du serveur'],['mtls','HTTPS + certificat client','certificat client autorisé']]){
    const f=fixture(()=>status(mode));await f.certificates.load();
    assert.equal(f.el('certificate-mode').textContent,label);
    assert.ok(f.el('certificate-description').textContent.includes(description));
    assert.equal(f.el('certificate-data').hidden,false);
    assert.equal(f.el('certificate-devices-empty').hidden,false);
    assert.equal(f.el('certificate-refresh').disabled,false);
    assert.deepEqual(f.calls,[['/api/security/status']]);
    if(mode!=='http'){assert.ok(f.allText().includes(fingerprint));assert.ok(f.allText().includes('bionic.local'));}
  }
});

test('closing while preparing or issuing restores enabled controls and discards the late private response',async()=>{
  for(const action of ['prepare','issue-device']){
    const reply=deferred(),web={csrfToken:'n'.repeat(43),canConfigure:true,canIssueDevice:true,suggestedHosts:['127.0.0.1'],proofPortProvisioned:true};
    const f=fixture((route)=>route==='/api/security/actions'?reply.promise:{...status('https'),web});
    f.el('certificate-controls').append(f.el('certificate-prepare'),f.el('certificate-issue'));f.el('certificate-prepare').tag='button';f.el('certificate-issue').tag='button';
    await f.certificates.load();f.el('certificate-device-name').value='Fixture device';
    f.el(action==='prepare'?'certificate-setup-form':'certificate-device-form').listeners.submit({preventDefault(){}});
    assert.equal(f.el('certificate-prepare').disabled,true);assert.equal(f.el('certificate-issue').disabled,true);
    f.certificates.reset();f.el('settings-view').hidden=false;await f.certificates.load();
    assert.equal(f.el('certificate-prepare').disabled,false);assert.equal(f.el('certificate-issue').disabled,false);
    reply.resolve(action==='prepare'?{status:{...status('https'),web}}:{passphrase:'PRIVATE_LATE_RESPONSE',exportId:'late',expiresAt:later});await new Promise(resolve=>setImmediate(resolve));
    assert.equal(f.el('certificate-export').hidden,true);assert.equal(f.el('certificate-export-password').textContent,'');assert(!f.allText().includes('PRIVATE_LATE_RESPONSE'));
  }
});

test('loading hides previous data and an unreadable response never claims an active level',async()=>{
  const reply=deferred(),f=fixture(()=>reply.promise),load=f.certificates.load();
  assert.equal(f.el('certificate-data').hidden,true);
  assert.equal(f.el('certificate-refresh').disabled,true);
  assert.match(f.el('certificate-status').textContent,/Chargement/);
  reply.resolve({mode:'unknown',devices:[]});await load;
  assert.equal(f.el('certificate-error').hidden,false);
  assert.equal(f.el('certificate-mode').textContent,'');
  assert.equal(f.el('certificate-refresh').disabled,false);
});

test('the refresh action recovers from an API error using only an authenticated read',async()=>{
  let unavailable=true;
  const f=fixture(()=>{if(unavailable)throw Error('offline');return status('https');});
  await f.certificates.load();assert.equal(f.el('certificate-error').hidden,false);
  unavailable=false;await f.el('certificate-refresh').listeners.click();
  assert.equal(f.el('certificate-error').hidden,true);
  assert.equal(f.el('certificate-mode').textContent,'HTTPS');
  assert.ok(f.calls.every(args=>args.length===1&&args[0]==='/api/security/status'));
});

test('pending activation stays separate from the active level and never reveals a proof URL',async()=>{
  const f=fixture(()=>({...status('http'),candidate:{mode:'https',url:'https://127.0.0.1:9999/proof?token=PRIVATE',expiresAt:tomorrow}}));
  await f.certificates.load();
  assert.equal(f.el('certificate-mode').textContent,'HTTP');
  assert.match(f.el('certificate-pending').textContent,/Préparation de HTTPS en attente/);
  assert.match(f.el('certificate-pending').textContent,/accès actuel reste actif/);
  assert.equal(f.el('certificate-pending').hidden,false);
  assert.ok(!f.allText().includes('PRIVATE'));
  assert.ok(!f.allText().includes('https://127.0.0.1:9999'));
});

test('expired activation offers a new browser preparation',async()=>{
  const f=fixture(()=>({...status('https'),candidate:{mode:'mtls',expiresAt:'2000-01-01T00:00:00Z'}}));await f.certificates.load();
  assert.equal(f.el('certificate-mode').textContent,'HTTPS');
  assert.match(f.el('certificate-pending').textContent,/a expiré/);
  assert.match(f.el('certificate-pending').textContent,/Recommence la préparation ci-dessous/);
});

test('each device shows its own validity and revocation while metadata remains plain text',async()=>{
  const name='<img src=x onerror=alert(1)>',f=fixture(()=>({...status('mtls'),devices:[
    {id:'1',name,fingerprint,expiresAt:later,revokedAt:null},
    {id:'2',name:'Ancien téléphone',fingerprint,expiresAt:later,revokedAt:'2026-01-02T12:00:00Z'},
    {id:'3',name:'Tablette',fingerprint,expiresAt:'2000-01-01T00:00:00Z',revokedAt:null}
  ]}));await f.certificates.load();
  const rows=f.el('certificate-devices').children;
  assert.equal(rows.length,3);assert.equal(rows[0].children[0].textContent,name);
  assert.match(rows[0].children[1].textContent,/Autorisé · Valable jusqu’au/);
  assert.match(rows[1].children[1].textContent,/Révoqué le/);
  assert.match(rows[2].children[1].textContent,/Expiré/);
  assert.equal(f.el('certificate-devices-empty').hidden,true);
  assert.ok(rows.every(row=>row.children.every(child=>child.tag!=='button'&&child.tag!=='a')));
});

test('closing settings or signing out invalidates pending metadata and clears old certificates',async()=>{
  for(const action of ['close','logout','epoch']){
    const reply=deferred(),f=fixture(()=>reply.promise),load=f.certificates.load();
    if(action==='close'){f.el('settings-view').hidden=true;f.certificates.reset();}
    if(action==='logout'){f.state.authenticated=false;f.state.authEpoch++;f.certificates.reset();}
    if(action==='epoch')f.state.authEpoch++;
    reply.resolve(status('mtls'));await load;
    assert.equal(f.el('certificate-data').hidden,true);
    assert.equal(f.el('certificate-mode').textContent,'');
  }
});

test('a later refresh wins over an older delayed result',async()=>{
  const reply=deferred();let reads=0;
  const f=fixture(()=>++reads===1?reply.promise:status('mtls'));
  const first=f.certificates.load();await f.certificates.load();reply.resolve(status('http'));await first;
  assert.equal(f.el('certificate-mode').textContent,'HTTPS + certificat client');
});

test('settings has an explicit close action, Escape dismissal and return of focus',()=>{
  assert.match(html,/<button id="settings-close"[^>]*aria-label="Fermer les paramètres"[^>]*>Fermer<\/button>/);
  assert.match(settingsSource,/event\.key==='Escape'/);
  assert.match(settingsSource,/opener\.focus\(\{preventScroll:true\}\)/);
  assert.match(settingsSource,/function closeNow\(restore=true\)\{\s*certificates\.reset\(\)/);
  assert.ok(html.indexOf('/certificates.js')<html.indexOf('/settings.js'));
  assert.ok(!source.includes('innerHTML'));
  assert.match(html,/Certificat perdu \? Retourne sur le PC serveur/);
});
