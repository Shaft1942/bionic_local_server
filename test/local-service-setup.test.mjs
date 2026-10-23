import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createLocalServiceSetup} from '../lib/local-service-setup.mjs';
import {loadLocalServiceProfiles} from '../lib/local-service-config.mjs';
import {createComfyImages} from '../lib/comfy-images.mjs';

async function fixture(t,options={}){
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'bionic-setup-gui-')));
  t.after(async()=>{assert.equal(path.dirname(root),await fs.realpath(os.tmpdir()));assert(path.basename(root).startsWith('bionic-setup-gui-'));await fs.rm(root,{recursive:true,force:true});});
  const homeDirectory=path.join(root,'synthetic-home'),installation=path.join(root,'installation');
  const put=async relative=>{const filename=path.join(root,relative);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,'synthetic source; never executed');return filename;};
  await fs.mkdir(installation);await fs.mkdir(path.join(homeDirectory,'.lmstudio','apps','bionic','.internal'),{recursive:true});
  const comfy={pythonPath:await put('installation/.venv/Scripts/python.exe'),entryPath:await put('installation/main.py'),workingDirectory:installation};
  const bionic={cliPath:await put('synthetic-home/.lmstudio/bin/lms.exe'),apiInfoPath:path.join(homeDirectory,'.lmstudio','apps','bionic','.internal','http-server.json'),appPath:await put('installation/Bionic.exe')};
  const connections={bionicUrl:'http://127.0.0.1:1235',comfyUrl:'http://127.0.0.1:8188'};
  const setup=createLocalServiceSetup({root,platform:'win32',homeDirectory,connections,discoveryRoots:[{serviceId:'bionic',directory:installation},{serviceId:'comfyui',directory:installation}],...options});
  const save=async(serviceId,profile)=>setup.save({serviceId,profile,exclusiveControl:true,expectedRevision:(await setup.snapshot()).revision});
  return{root,installation,comfy,bionic,connections,setup,save};
}

test('bounded discovery derives the three Comfy paths from one selected installation without executing it',async t=>{
  const f=await fixture(t),result=await f.setup.discover({serviceId:'comfyui',installationDirectory:f.installation});
  assert.equal(result.candidates.length,1);assert.deepEqual(result.candidates[0].profile,f.comfy);
  assert.equal((await f.setup.discover({serviceId:'bionic'})).candidates.length,1);
  assert.equal((await f.setup.snapshot()).services.every(service=>!service.configured),true);
  await assert.rejects(fs.stat(path.join(f.root,'config.launchers.local.json')),{code:'ENOENT'});
});

test('saving one typed GUI profile preserves the other and produces a valid cold-start configuration',async t=>{
  const f=await fixture(t);await f.save('bionic',f.bionic);const saved=await f.save('comfyui',f.comfy);
  assert.equal(saved.saved,true);assert(saved.services.every(service=>service.configured));
  const checked=await loadLocalServiceProfiles(f);assert.deepEqual(checked.errors,{});assert(checked.bionic&&checked.comfyui);
  const disk=await fs.readdir(f.root);assert(!disk.some(name=>name.endsWith('.tmp')));
});

test('invalid values and executable command fields never replace an existing profile',async t=>{
  const f=await fixture(t);await f.save('comfyui',f.comfy);const original=await fs.readFile(path.join(f.root,'config.launchers.local.json'),'utf8');
  for(const profile of [{...f.comfy,args:['--unsafe']},{...f.comfy,pythonPath:'https://example.test/python'},{...f.comfy,pythonPath:'\\\\remote\\share\\python.exe'},{...f.comfy,entryPath:path.join(f.installation,'not-main.py')},{...f.comfy,workingDirectory:os.tmpdir()}])await assert.rejects(f.save('comfyui',profile));
  assert.equal(await fs.readFile(path.join(f.root,'config.launchers.local.json'),'utf8'),original);
});

test('stale and simultaneous submissions cannot overwrite the latest selected installation',async t=>{
  const f=await fixture(t),revision=(await f.setup.snapshot()).revision;
  const results=await Promise.allSettled(['bionic','comfyui'].map(serviceId=>f.setup.save({serviceId,profile:serviceId==='bionic'?f.bionic:f.comfy,expectedRevision:revision,exclusiveControl:true})));
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
  assert.equal(results.find(result=>result.status==='rejected').reason.code,'setup-busy');
  await assert.rejects(f.setup.save({serviceId:'bionic',profile:f.bionic,expectedRevision:revision,exclusiveControl:true}),{code:'setup-stale-revision'});
});

test('configuration symlinks and linked executable parents are refused without touching their targets',async t=>{
  const f=await fixture(t),external=path.join(f.root,'other.json');await fs.writeFile(external,'{"sentinel":true}');
  try{await fs.symlink(external,path.join(f.root,'config.launchers.local.json'));}catch(error){if(error.code==='EPERM'){t.skip('Host denies file symlinks');return;}throw error;}
  await assert.rejects(f.setup.snapshot(),{code:'setup-invalid-config'});assert.equal(await fs.readFile(external,'utf8'),'{"sentinel":true}');
});

test('directory selection is user-triggered, single-flight, cancellable and never runs a motor',async t=>{
  let choose,opened=0;const f=await fixture(t,{chooseDirectory:async()=>{opened++;return new Promise(resolve=>{choose=resolve;});}});
  assert.equal(opened,0);const first=f.setup.pick({serviceId:'comfyui'});await Promise.resolve();assert.equal(opened,1);
  await assert.rejects(f.setup.pick({serviceId:'bionic'}),{code:'setup-busy'});choose('');assert.equal((await first).cancelled,true);
  const second=f.setup.pick({serviceId:'comfyui'});await Promise.resolve();choose(f.installation);assert.equal((await second).candidates.length,1);
});

test('platform and dedicated-control agreement cannot be bypassed by GUI bodies',async t=>{
  const f=await fixture(t);await assert.rejects(f.setup.save({serviceId:'comfyui',profile:f.comfy,expectedRevision:(await f.setup.snapshot()).revision,exclusiveControl:false}),{code:'setup-invalid-request'});
  const unsupported=createLocalServiceSetup({root:f.root,platform:'linux'});assert.equal((await unsupported.snapshot()).canConfigure,false);
  await assert.rejects(unsupported.discover({serviceId:'comfyui'}),{code:'setup-platform-unsupported'});await assert.rejects(unsupported.save({}),{code:'setup-platform-unsupported'});
});

test('image availability is passive and respects the disabled global setting',async t=>{
  const f=await fixture(t),requests=[];
  const service=await createComfyImages({directory:path.join(f.root,'synthetic-images'),enabled:true,fetchImpl:async url=>{requests.push(url);assert(url.endsWith('/system_stats'));return Response.json({system:{comfyui_version:'synthetic'}});}});
  t.after(()=>service.close());assert.equal(await service.available(),true);assert.equal(requests.length,1);
  await service.updateSettings({enabled:false});assert.equal(await service.available(),false);assert.equal(requests.length,1);
});
