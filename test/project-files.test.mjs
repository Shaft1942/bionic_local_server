import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createProjectFiles } from '../lib/project-files.mjs';
const base = await fs.mkdtemp(path.join(os.tmpdir(),'bionic-mobile-files-test-'));
const own = path.join(base, 'project'), other = path.join(base, 'other'), linked = path.join(base, 'linked');
for (const directory of [own, other, linked]) await fs.mkdir(directory);
await fs.writeFile(path.join(own, 'notes.md'), '\ufeffPremière ligne\r\nDeuxième ligne\r\n');
await fs.writeFile(path.join(own, 'config.json'), '{"value":1}\n');
await fs.writeFile(path.join(own, '.env'), 'secret');
await fs.writeFile(path.join(other, 'private.txt'), 'outside');
await fs.writeFile(path.join(linked, 'readme.txt'), 'read only');
await fs.writeFile(path.join(own, 'bad.txt'), Buffer.from([0xff,0x01,0xfe]));
await fs.writeFile(path.join(own, 'archive.zip'), Buffer.from('binary'));
const registryPath = path.join(base,'registry.json');
await fs.writeFile(registryPath, JSON.stringify({projects:[['p1',{projectWorkingDirectoryPath:own,fileLinks:[{kind:'directory',access:'read',path:linked}]}],['p2',{projectWorkingDirectoryPath:other}]]}));
const files = createProjectFiles({registryPath,backupDirectory:path.join(base,'backups'),extraRoots:[]});

test('only registered folders are exposed, respecting read-only native links', async () => {
  assert.deepEqual((await files.roots('p1')).map(r=>[r.id,r.writable]),[['project',true],['linked-0',false]]);
  await assert.rejects(files.roots('unknown'),{status:404});
  await assert.rejects(files.list('p2','linked-0',''),{status:404});
  const list = await files.list('p1','project','');
  assert(!list.entries.some(f=>f.name==='.env'||f.name==='escape'));
});
test('rejects traversal, absolute paths, Windows streams, hidden credentials and escaping junctions', async () => {
  for(const unsafe of ['../other/private.txt','/etc/passwd','E:/file','notes.md:stream','.env','foo/../notes.md','foo\\bar','notes.md.']) {
    await assert.rejects(files.read('p1','project',unsafe), e=>e.status===400||e.status===403);
  }
});
test('a synthetic directory link cannot expand file access', async t => {
  const link=path.join(own,'outside-link');
  try { await fs.symlink(other,link,process.platform==='win32'?'junction':'dir'); }
  catch(e) { if(['EPERM','EACCES','ENOTSUP'].includes(e.code))return t.skip('Symlink creation is unavailable.');throw e; }
  await assert.rejects(files.read('p1','project','outside-link/private.txt'),{status:403});
});

test('edits preserve BOM and CRLF, save a copy and can restore it', async () => {
  const original = await files.read('p1','project','notes.md');
  assert.equal(original.text,'Première ligne\nDeuxième ligne\n'); assert(original.editable);
  const saved = await files.write('p1','project','notes.md',original.hash,'Texte modifié\n');
  assert.equal(saved.text,'Texte modifié\n'); assert(saved.backupId);
  assert.deepEqual(await fs.readFile(path.join(own,'notes.md')),Buffer.from('\ufeffTexte modifié\r\n'));
  const restored=await files.write('p1','project','notes.md',saved.hash,undefined,saved.backupId);
  assert.equal(restored.text,original.text);
});
test('stale versions never replace newer PC edits, including concurrent saves', async () => {
  const old=await files.read('p1','project','config.json');
  await fs.writeFile(path.join(own,'config.json'),'{"value":2}\n');
  await assert.rejects(files.write('p1','project','config.json',old.hash,'lost update'),{status:409});
  assert.equal(await fs.readFile(path.join(own,'config.json'),'utf8'),'{"value":2}\n');
  const current=await files.read('p1','project','config.json');
  const attempts=await Promise.allSettled([files.write('p1','project','config.json',current.hash,'{"value":3}\n'),files.write('p1','project','config.json',current.hash,'{"value":4}\n')]);
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(attempts.filter(x=>x.status==='rejected'&&x.reason.status===409).length,1);
});
test('binary, malformed encoding and read-only folders cannot be overwritten', async () => {
  for(const name of ['bad.txt','archive.zip']) {const file=await files.read('p1','project',name);assert.equal(file.editable,false);await assert.rejects(files.write('p1','project',name,'0'.repeat(64),'x'),e=>[409,415].includes(e.status));}
  const file=await files.read('p1','linked-0','readme.txt');assert.equal(file.editable,false);
  await assert.rejects(files.write('p1','linked-0','readme.txt',file.hash,'x'),{status:403});
});
test('attachments snapshot verified content and excerpts, reject edited references', async () => {
  const file=await files.read('p1','project','notes.md');
  const [attachment]=await files.attachments('p1',[{rootId:'project',path:file.path,hash:file.hash,selection:{start:0,end:8}}]);
  assert.equal(attachment.text,'Première');assert.equal(attachment.excerpt,true);
  await fs.appendFile(path.join(own,'notes.md'),'changed');
  await assert.rejects(files.attachments('p1',[{rootId:'project',path:file.path,hash:file.hash}]),{status:409});
  await assert.rejects(files.attachments('p1',Array(5).fill({})),{status:400});
});
test('downloads use passive content types and do not execute HTML/SVG', async () => {
  await fs.writeFile(path.join(own,'page.html'),'<script>alert(1)</script>');
  const download=await files.download('p1','project','page.html',true);
  assert.equal(download.mime,'application/octet-stream');assert.equal(download.inline,false);
});
console.log('Synthetic project files fixture:',base);

 test.after(async()=>{ const safeRoot=path.resolve(base), safeTemp=path.resolve(os.tmpdir())+path.sep; assert(safeRoot.startsWith(safeTemp)&&path.basename(safeRoot).startsWith('bionic-mobile-')); await fs.rm(safeRoot,{recursive:true,force:true}); });

test('Windows reserved device names and wildcard paths are rejected before IO',async()=>{
 for(const name of ['CON.txt','NUL','aux.md','COM1.log','LPT9.txt','COM¹.txt','a?.txt'])await assert.rejects(files.importFile('p1',name,Buffer.from('x')),{status:403});
});
