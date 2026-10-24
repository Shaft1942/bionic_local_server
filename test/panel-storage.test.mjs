import test from 'node:test';
import assert from 'node:assert/strict';
import {panelStorageKey,readPanelStorage,clearPanelStorage} from '../ui/src/lib/companion/panel-storage.ts';
function store(entries=[]){const values=new Map(entries);return{values,getItem:key=>values.has(key)?values.get(key):null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};}
test('route migration copies exact draft bytes and preserves its alias',()=>{
  const raw=' {"text":"  Unicode 中文 🌿\\n\\nfin  ","original":"before","hash":"fixture"} ',legacy=panelStorageKey('a','file','p:r:notes.md','/prototype/'),s=store([[legacy,raw]]);
  assert.equal(readPanelStorage(s,'a','file','p:r:notes.md'),raw);assert.equal(s.getItem(panelStorageKey('a','file','p:r:notes.md')),raw);assert.equal(s.getItem(legacy),raw);
});
test('canonical drafts and tracking remain authoritative, including empty values',()=>{
  for(const kind of ['file','image-draft','image-tracking']){const key=panelStorageKey('a',kind,'p'),old=panelStorageKey('a',kind,'p','/prototype/'),s=store([[key,''],[old,'legacy']]);assert.equal(readPanelStorage(s,'a',kind,'p'), '');assert.equal(s.getItem(old),'legacy');}
});
test('current known alias has priority but arbitrary routes never become sources',()=>{
  const s=store([[panelStorageKey('a','image-draft','p','/prototype/'),'old'],[panelStorageKey('a','image-draft','p','/llama-ui/index.html'),'current'],[panelStorageKey('a','image-draft','q','/foreign/'),'foreign']]);
  assert.equal(readPanelStorage(s,'a','image-draft','p','/llama-ui/index.html'),'current');assert.equal(readPanelStorage(s,'a','image-draft','q','/foreign/'),null);
});
test('migration is strictly bounded to the same instance, project, root and file',()=>{
  const legacy=panelStorageKey('a','file','p:r:notes.md','/prototype/'),s=store([[legacy,'draft']]);
  for(const [identity,scope]of[['b','p:r:notes.md'],['a','q:r:notes.md'],['a','p:other:notes.md'],['a','p:r:other.md']])assert.equal(readPanelStorage(s,identity,'file',scope),null);
  assert.deepEqual([...s.values],[[legacy,'draft']]);
});
test('clearing a migrated file draft never resurrects the preserved alias',()=>{
  const key=panelStorageKey('a','file','p:r:f'),old=panelStorageKey('a','file','p:r:f','/prototype/'),s=store([[old,'draft']]);readPanelStorage(s,'a','file','p:r:f');clearPanelStorage(s,'a','file','p:r:f');assert.equal(s.getItem(key),null);assert.equal(readPanelStorage(s,'a','file','p:r:f'),null);assert.equal(s.getItem(old),'draft');
});
test('read-only storage still restores from an alias without deleting or rewriting it',()=>{
  const old=panelStorageKey('a','image-tracking','p','/prototype/'),s=store([[old,'[{"requestId":"request","kind":"direct"}]']]);s.setItem=()=>{throw Error('Storage refused');};assert.equal(readPanelStorage(s,'a','image-tracking','p'),s.getItem(old));assert.equal(s.values.size,1);
});
