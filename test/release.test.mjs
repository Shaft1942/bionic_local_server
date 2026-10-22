import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectReleaseFiles, inspectContent } from '../scripts/release-files.mjs';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { inspectUpdateArchive } from '../lib/update-installer.mjs';
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
 assert.equal(metadata.schemaVersion,1);assert.equal(metadata.version,pkg.version);
 assert.equal(metadata.sha256,createHash('sha256').update(archive).digest('hex'));
 assert.equal(await fs.readFile(path.join(root,'dist/SHA256SUMS.txt'),'utf8'),metadata.sha256+'  '+metadata.archive+'\n');
 assert.equal(inspectUpdateArchive(archive,metadata).size,files.length);
 assert.equal(archive.includes(Buffer.from(privateCanary)),false);
});
