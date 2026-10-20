import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSettings } from '../lib/config.mjs';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-config-test-'));
  t.after(async () => { assert.equal(path.dirname(root),path.resolve(os.tmpdir())); assert(path.basename(root).startsWith('bionic-mobile-config-test-')); await fs.rm(root,{recursive:true,force:true}); });
  return root;
}
test('portable defaults never grant an extra project folder or depend on an agent runtime',async t=>{
  const root=await fixture(t), home=path.join(root,'user');
  const settings=await loadSettings({root,home,env:{},platform:'win32'});
  assert.equal(settings.port,8769);assert.equal(settings.apiUrl,'http://127.0.0.1:1235');assert.equal(settings.python,'python');assert.deepEqual(settings.extraRoots,[]);assert.equal(settings.bionicRoot,path.join(home,'.lmstudio/apps/bionic'));
});
test('local settings and explicit environment overrides apply to the matching installation',async t=>{
  const root=await fixture(t), native=path.join(root,'native');
  await fs.writeFile(path.join(root,'config.local.json'),JSON.stringify({port:4000,apiUrl:'http://localhost:1234/',bionicRoot:native,python:'python3',extraRoots:[{id:'extra',name:'Manual folder',path:root}]}));
  let settings=await loadSettings({root,env:{}});assert.equal(settings.port,4000);assert.equal(settings.registryPath,path.join(native,'.internal/projects-registry.json'));assert.equal(settings.extraRoots[0].writable,false);
  settings=await loadSettings({root,env:{BIONIC_MOBILE_PORT:'4001',BIONIC_API_URL:'http://127.0.0.1:1236',BIONIC_MOBILE_EXTRA_ROOTS:'[]'}});assert.equal(settings.port,4001);assert.equal(settings.apiUrl,'http://127.0.0.1:1236');assert.deepEqual(settings.extraRoots,[]);
});
test('remote APIs, URL credentials, malformed roots and unknown settings are rejected',async t=>{
  const root=await fixture(t);
  for(const apiUrl of ['https://example.com','http://192.168.0.10:1235','http://user:password@localhost:1235','http://localhost:1235/v1'])await assert.rejects(loadSettings({root,env:{BIONIC_API_URL:apiUrl}}),/Configuration invalide/);
  for(const config of [{port:0},{port:70000},{bionicRoot:'relative/path'},{extraRoots:[{id:'project',name:'x',path:root}]},{unexpected:true}]) {await fs.writeFile(path.join(root,'config.local.json'),JSON.stringify(config));await assert.rejects(loadSettings({root,env:{}}),/Configuration invalide/);}
});
