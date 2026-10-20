import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectReleaseFiles, inspectContent } from '../scripts/release-files.mjs';
test('release list excludes local data even after a private installation has been used',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-release-test-'));
 t.after(async()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('bionic-mobile-release-test-'));await fs.rm(root,{recursive:true,force:true});});
 const files=Array.from({length:10},(_,index)=>`file-${index}.txt`);
 for(const file of files)await fs.writeFile(path.join(root,file),'Public synthetic source.');
 await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/config.json'),'LOCAL_ONLY_CANARY');
 const manifest=async names=>fs.writeFile(path.join(root,'release-manifest.json'),JSON.stringify({files:names}));
 await manifest(files);const clean=await collectReleaseFiles(root);assert.equal(clean.length,10);assert(!clean.some(file=>file.bytes.includes('LOCAL_ONLY_CANARY')));
 for(const forbidden of ['data/config.json','config.local.json','ACCES-PRIVE.txt','server.log','../outside.txt','C:/outside.txt']){await manifest([...files,forbidden]);await assert.rejects(collectReleaseFiles(root),/interdit/);}
});
test('token and private-key patterns stop export without revealing the matching value',()=>{
 for(const secret of ['ghp_'+'x'.repeat(35),'sk-proj-'+'y'.repeat(30),'-----BEGIN '+'PRIVATE KEY-----',JSON.stringify({adminToken:'a'.repeat(64)}),['C:','Users','test-person','notes.txt'].join(String.fromCharCode(92))])assert.throws(()=>inspectContent('synthetic.txt',secret),error=>error.message.includes('synthetic.txt')&&!error.message.includes(secret));
 assert.doesNotThrow(()=>inspectContent('public.txt','BIONIC_API_TOKEN is configured locally.'));
});
