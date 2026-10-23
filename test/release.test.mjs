import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectReleaseFiles, inspectContent } from '../scripts/release-files.mjs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { inspectUpdateArchive, prepareUpdate, applyPreparedUpdate } from '../lib/update-installer.mjs';
import { updateChannelForVersion } from '../lib/update-version.mjs';
test('release list excludes local data even after a private installation has been used',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-release-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-mobile-release-test-'));await fs.rm(root,{recursive:true,force:true});});
 const files=Array.from({length:10},(_,index)=>`file-${index}.txt`);
 for(const file of files)await fs.writeFile(path.join(root,file),'Public synthetic source.');
 await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/config.json'),'LOCAL_ONLY_CANARY');
 const manifest=async names=>fs.writeFile(path.join(root,'release-manifest.json'),JSON.stringify({files:names}));
 await manifest(files);const clean=await collectReleaseFiles(root);assert.equal(clean.length,10);assert(!clean.some(file=>file.bytes.includes('LOCAL_ONLY_CANARY')));
 for(const forbidden of ['data/config.json','config.local.json','ACCES-PRIVE.txt','server.log','authority.crt','client.cer','certificate.der','device.p12','server.key','../outside.txt','C:/outside.txt']){await manifest([...files,forbidden]);await assert.rejects(collectReleaseFiles(root),/interdit/);}
});
test('token and private-key patterns stop export without revealing the matching value',()=>{
 for(const secret of ['ghp_'+'x'.repeat(35),'sk-proj-'+'y'.repeat(30),'-----BEGIN '+'PRIVATE KEY-----',JSON.stringify({adminToken:'a'.repeat(64)}),['C:','Users','test-person','notes.txt'].join(String.fromCharCode(92))])assert.throws(()=>inspectContent('synthetic.txt',secret),error=>error.message.includes('synthetic.txt')&&!error.message.includes(secret));
 assert.doesNotThrow(()=>inspectContent('public.txt','BIONIC_API_TOKEN is configured locally.'));
});

test('release produces a consistent updater manifest and ZIP without local installation data',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-release-update-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-release-update-test-'));await fs.rm(root,{recursive:true,force:true});});
 const files=await collectReleaseFiles();
 for(const file of files){const filename=path.join(root,file.path);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,file.bytes);}
 const privateCanary=randomUUID();await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/private.txt'),privateCanary);
 execFileSync(process.execPath,['scripts/build-release.mjs'],{cwd:root,stdio:'pipe',windowsHide:true});
 const metadata=JSON.parse(await fs.readFile(path.join(root,'dist/update-manifest.json'),'utf8'));
 const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
 const archive=await fs.readFile(path.join(root,'dist',metadata.archive));
 assert.equal(metadata.schemaVersion,1);assert.equal(metadata.version,pkg.version);assert.equal(metadata.channel,updateChannelForVersion(pkg.version));
 assert.equal(metadata.sha256,createHash('sha256').update(archive).digest('hex'));
 assert.equal(await fs.readFile(path.join(root,'dist/SHA256SUMS.txt'),'utf8'),metadata.sha256+'  '+metadata.archive+'\n');
 assert.equal(inspectUpdateArchive(archive,metadata).size,files.length);
 assert.equal(archive.includes(Buffer.from(privateCanary)),false);
});

test('release builds stable and beta manifests and refuses mismatched channels or unsupported versions', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-release-channels-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-release-channels-test-'));await fs.rm(root,{recursive:true,force:true});});
 const files=await collectReleaseFiles();
 for(const file of files){const filename=path.join(root,file.path);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,file.bytes);}
 const filename=path.join(root,'package.json'), pkg=JSON.parse(await fs.readFile(filename,'utf8'));
 const build=channel=>execFileSync(process.execPath,['scripts/build-release.mjs',...(channel===undefined?[]:['--channel',channel])],{cwd:root,stdio:'pipe',windowsHide:true});
 for(const [version,channel] of [['2.2.0','stable'],['2.2.0-beta.1','beta'],['2.2.0-beta.12','beta']]){
  await fs.writeFile(filename,JSON.stringify({...pkg,version}));build(channel);
  const metadata=JSON.parse(await fs.readFile(path.join(root,'dist/update-manifest.json'),'utf8'));
  assert.equal(metadata.channel,channel);assert.equal(metadata.version,version);assert.equal(metadata.archive,`bionic-mobile-v${version}.zip`);
  const archive=await fs.readFile(path.join(root,'dist',metadata.archive));assert.equal(inspectUpdateArchive(archive,metadata).size,files.length);
  assert.throws(()=>build(channel==='beta'?'stable':'beta'),/Le canal demandé/);
 }
 for(const version of ['2.2.0-rc.1','2.2.0-beta.0','2.2.0-beta.01','02.2.0']){
  await fs.writeFile(filename,JSON.stringify({...pkg,version}));assert.throws(()=>build(),/Version de mise à jour invalide/);
 }
 await fs.writeFile(filename,JSON.stringify({...pkg,version:'2.2.0-beta.1'}));
 const compatibilityFile=path.join(root,'update-compatibility.json'), compatibility=JSON.parse(await fs.readFile(compatibilityFile,'utf8'));
 await fs.writeFile(compatibilityFile,JSON.stringify({...compatibility,minInstalledVersion:'2.1.0',maxInstalledVersion:'2.0.0'}));
 assert.throws(()=>build('beta'),/Bornes de compatibilité/);
});

test('built beta and stable archives install in order from a synthetic 2.1 installation', async t => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-release-install-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-release-install-test-'));await fs.rm(root,{recursive:true,force:true});});
 const files=await collectReleaseFiles();
 for(const file of files){const filename=path.join(root,file.path);await fs.mkdir(path.dirname(filename),{recursive:true});await fs.writeFile(filename,file.bytes);}
 const filename=path.join(root,'package.json'), pkg=JSON.parse(await fs.readFile(filename,'utf8'));
 await fs.writeFile(filename,JSON.stringify({...pkg,version:'2.1.0'},null,2)+'\n');
 const canary=randomUUID();await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/private.txt'),canary);
 await fs.writeFile(path.join(root,'config.local.json'),JSON.stringify({synthetic:canary}));
 let currentVersion='2.1.0';
 for(const version of ['2.2.0-beta.1','2.2.0']){
  const previous=await fs.readFile(filename), channel=updateChannelForVersion(version);
  await fs.writeFile(filename,JSON.stringify({...pkg,version},null,2)+'\n');
  execFileSync(process.execPath,['scripts/build-release.mjs','--channel',channel],{cwd:root,stdio:'pipe',windowsHide:true});
  const metadata=JSON.parse(await fs.readFile(path.join(root,'dist/update-manifest.json'),'utf8'));
  const archive=await fs.readFile(path.join(root,'dist',metadata.archive));
  assert.equal(inspectUpdateArchive(archive,metadata).size,files.length);
  await fs.writeFile(filename,previous);
  const prepared=await prepareUpdate({root,archive,metadata,currentVersion,instanceId:'synthetic-release-install',port:12345,platform:'win32'});
  const restarts=[];
  await applyPreparedUpdate(prepared,{restart:async(_plan,next)=>{restarts.push(next);return {pid:321};}});
  assert.deepEqual(restarts,[version]);assert.equal(JSON.parse(await fs.readFile(filename)).version,version);
  assert.deepEqual(await fs.readFile(path.join(prepared.jobRoot,'backup/package.json')),previous);
  assert.equal(await fs.readFile(path.join(root,'data/private.txt'),'utf8'),canary);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'config.local.json'))),{synthetic:canary});
  currentVersion=version;
 }
});
