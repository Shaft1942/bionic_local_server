import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const windows=process.platform==='win32';
const q=value=>`'${String(value).replaceAll("'","''")}'`;
function ps(code) {
  return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-OutputFormat','Text','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; . ${q(path.join(root,'Installation-commun.ps1'))}; function Test-BionicPortOpen { param($Port) return $false }; ${code}`,'utf16le').toString('base64')],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,BIONIC_MOBILE_NODE:'',BIONIC_MOBILE_PORT:''}}).trim();
}
async function fixture(t) {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-install-test-'));
  t.after(async()=>{assert.equal(path.dirname(base),path.resolve(os.tmpdir()));assert(path.basename(base).startsWith('bionic-install-test-'));await fs.rm(base,{recursive:true,force:true});});
  const source=path.join(base,'source');await fs.mkdir(source);
  const files=['server.mjs','Demarrer.ps1','release-manifest.json',...Array.from({length:7},(_,i)=>`public-${i}.txt`)];
  for(const f of files)await fs.writeFile(path.join(source,f),'Synthetic public source.');
  await fs.writeFile(path.join(source,'release-manifest.json'),JSON.stringify({files}));
  await fs.mkdir(path.join(source,'data'));await fs.writeFile(path.join(source,'data/private.txt'),'PRIVATE_INSTALLATION_CANARY');
  await fs.writeFile(path.join(source,'config.local.json'),JSON.stringify({port:3001,python:'custom-python',extraRoots:[],customSetting:'preserve-me'}));
  return {base,source,target:path.join(base,'new installation')};
}
const install=(source,target,extra='')=>`Install-BionicCompanion -Source ${q(source)} -Destination ${q(target)} -Port 3002 -ApiUrl 'http://localhost:1235/v1' -NodePath ${q(process.execPath)} -DownloadNode $false ${extra}`;
const reject=code=>`try { $null=${code}; throw 'unexpected-success' } catch { if($_.Exception.Message -eq 'unexpected-success'){throw}; 'rejected' }`;

test('wizard launchers and recovery commands exist in the downloadable distribution',async()=>{
  const wizard=await fs.readFile(path.join(root,'Installer.ps1'),'utf8');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'release-manifest.json'),'utf8'));
  const scripts=[...wizard.matchAll(/Join-Path \$(?:PSScriptRoot|result\.Root) '([^']+\.ps1)'/g)].map(match=>match[1]);
  const commands=[...wizard.matchAll(/\b[A-Za-z\u00c0-\u00ff0-9_-]+\.cmd\b/g)].map(match=>match[0]);
  assert(scripts.length>0,'No wizard script references found.');
  assert(commands.length>0,'No wizard recovery commands found.');
  for(const relative of new Set([...scripts,...commands])){
    assert(manifest.files.includes(relative),`Wizard references a launcher absent from the release: ${relative}`);
    assert((await fs.stat(path.join(root,relative))).isFile(),`Wizard launcher is not a source file: ${relative}`);
  }
});

test('installer accepts only loopback HTTP APIs and normalizes the Bionic /v1 suffix',{skip:!windows},()=>{
  assert.equal(ps(`ConvertTo-BionicApiUrl 'http://localhost:1235/v1'`),'http://localhost:1235');
  for(const url of ['https://localhost:1235','http://192.168.1.1:1235','http://user:secret@localhost:1235','http://localhost:1235/other','http://localhost:1235/?x=1'])assert.equal(ps(reject(`ConvertTo-BionicApiUrl ${q(url)}`)),'rejected');
});
test('new installation copies only public sources and records a reusable Node path',{skip:!windows},async t=>{
  const {base,source,target}=await fixture(t);
  const result=JSON.parse(ps(`${install(source,target)} | ConvertTo-Json -Compress`));
  // Windows runners can expose TEMP through an 8.3 alias. Compare the actual
  // directory identity, since PowerShell expands that alias to its long path.
  assert.equal(await fs.realpath(result.Root),await fs.realpath(target));assert.equal(result.Existing,false);
  const config=JSON.parse(await fs.readFile(path.join(target,'config.local.json'),'utf8'));
  assert.deepEqual(config,{port:3002,certificateProofPort:3003,apiUrl:'http://localhost:1235'});
  assert.equal(result.CertificateProofPort,3003);
  await assert.rejects(fs.access(path.join(target,'data/private.txt')));
  assert.equal(await fs.realpath(JSON.parse(await fs.readFile(path.join(target,'runtime/node-path.json'),'utf8')).path),await fs.realpath(process.execPath));
  assert.equal(await fs.realpath(ps(`Get-BionicNode -Root ${q(target)}`)),await fs.realpath(process.execPath));
  assert(!(await fs.readdir(base)).some(n=>n.startsWith('.bionic-install-')));
});
test('in-place configuration preserves private bytes and unknown settings and backs up configuration',{skip:!windows},async t=>{
  const {source}=await fixture(t);const original=await fs.readFile(path.join(source,'config.local.json'));
  ps(`${install(source,source)} | Out-Null`);
  assert.equal(await fs.readFile(path.join(source,'data/private.txt'),'utf8'),'PRIVATE_INSTALLATION_CANARY');
  const config=JSON.parse(await fs.readFile(path.join(source,'config.local.json'),'utf8'));
  assert.equal(config.customSetting,'preserve-me');assert.equal(config.python,'custom-python');assert.equal(config.port,3002);
  const backups=await fs.readdir(path.join(source,'runtime/install-backups'),{recursive:true});
  const backup=backups.find(n=>n.endsWith('config.local.json'));assert(backup);
  assert.deepEqual(await fs.readFile(path.join(source,'runtime/install-backups',backup)),original);
});
test('occupied destinations and ports are refused without modifying existing files',{skip:!windows},async t=>{
  const {source,target}=await fixture(t);await fs.mkdir(target);await fs.writeFile(path.join(target,'keep.txt'),'keep');
  assert.equal(ps(reject(install(source,target))),'rejected');assert.equal(await fs.readFile(path.join(target,'keep.txt'),'utf8'),'keep');
  assert.equal(ps(`function Test-BionicPortOpen {return $true}; ${reject(install(source,source))}`),'rejected');
  assert.equal(JSON.parse(await fs.readFile(path.join(source,'config.local.json'),'utf8')).port,3001);
});
test('changing port cannot reconfigure a still running installation',{skip:!windows},async t=>{
  const {source}=await fixture(t);await fs.mkdir(path.join(source,'runtime'));await fs.writeFile(path.join(source,'runtime/server.json'),JSON.stringify({root:source,port:3001}));
  assert.equal(ps(`function Test-BionicPortOpen { param($Port) return $Port -eq 3001 }; ${reject(install(source,source))}`),'rejected');
  assert.equal(JSON.parse(await fs.readFile(path.join(source,'config.local.json'),'utf8')).port,3001);
});
test('a failed in-place configuration write restores earlier changes and preserves private bytes',{skip:!windows},async t=>{
  const {source}=await fixture(t);const config=path.join(source,'config.local.json');const original=await fs.readFile(config);
  const result=ps(`$lock=[IO.File]::Open(${q(config)},[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);try { ${reject(install(source,source))} } finally {$lock.Dispose()}`);
  assert.equal(result,'rejected');assert.deepEqual(await fs.readFile(config),original);
  await assert.rejects(fs.access(path.join(source,'runtime/node-path.json')));
  assert.equal(await fs.readFile(path.join(source,'data/private.txt'),'utf8'),'PRIVATE_INSTALLATION_CANARY');
});
test('cancellation before commit removes staging and leaves no installed folder',{skip:!windows},async t=>{
  const {source,target,base}=await fixture(t);
  assert.equal(ps(`$cancel=New-Object Threading.CancellationTokenSource; $cancel.Cancel(); ${reject(install(source,target,'-Cancellation $cancel.Token'))}`),'rejected');
  await assert.rejects(fs.access(target));assert(!(await fs.readdir(base)).some(n=>n.startsWith('.bionic-install-')));
});
test('closed source inventory rejects traversal and private files before copying',{skip:!windows},async t=>{
  const {source,target}=await fixture(t);const file=path.join(source,'release-manifest.json');const m=JSON.parse(await fs.readFile(file,'utf8'));
  for(const illegal of ['../outside.txt','data/private.txt','runtime/node-path.json','config.local.json']){await fs.writeFile(file,JSON.stringify({files:[...m.files,illegal]}));assert.equal(ps(reject(install(source,target))),'rejected');await assert.rejects(fs.access(target));}
});
test('junction destinations cannot redirect installation outside the selected real folder',{skip:!windows},async t=>{
  const {base,source}=await fixture(t);const outside=path.join(base,'outside');await fs.mkdir(outside);const link=path.join(base,'link');await fs.symlink(outside,link,'junction');
  assert.equal(ps(reject(install(source,path.join(link,'app')))),'rejected');assert.deepEqual(await fs.readdir(outside),[]);
});
test('Node metadata selects exactly one architecture and rejects an ambiguous or missing checksum',{skip:!windows},()=>{
  const sums='a'.repeat(64)+'  node-v24.22.1-win-x64.zip\n'+'b'.repeat(64)+'  node-v24.22.1-win-arm64.zip\n';
  const result=JSON.parse(ps(`Get-BionicNodeDownload ${q(sums)} 'arm64' | ConvertTo-Json -Compress`));assert.equal(result.Hash,'b'.repeat(64));assert.equal(result.Archive,'node-v24.22.1-win-arm64.zip');
  for(const value of [sums+sums,'no checksum'])assert.equal(ps(reject(`Get-BionicNodeDownload ${q(value)} 'x64'`)),'rejected');
});

test('certificate proof port is configurable, retained on reconfiguration, and cannot collide with app or API ports',{skip:!windows},async t=>{
 const {source,target}=await fixture(t);
 let result=JSON.parse(ps(`${install(source,target,'-CertificateProofPort 42111')} | ConvertTo-Json -Compress`));
 assert.equal(result.CertificateProofPort,42111);
 assert.equal(JSON.parse(await fs.readFile(path.join(target,'config.local.json'),'utf8')).certificateProofPort,42111);
 ps(`${install(target,target)} | Out-Null`);
 assert.equal(JSON.parse(await fs.readFile(path.join(target,'config.local.json'),'utf8')).certificateProofPort,42111);
 const original=await fs.readFile(path.join(source,'config.local.json'));
 for(const port of [3002,1235,-1,65536])assert.equal(ps(reject(install(source,source,'-CertificateProofPort '+port))),'rejected');
 assert.equal(ps(`function Test-BionicPortOpen {param($Port) return $Port -eq 42111}; ${reject(install(source,source,'-CertificateProofPort 42111'))}`),'rejected');
 assert.deepEqual(await fs.readFile(path.join(source,'config.local.json')),original);
});
