import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { openCertificateStore, resetCertificateStoreLocal } from '../lib/certificate-store.mjs';
import { createAuthority, issueServer } from '../lib/certificate-pki.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

async function fixture(t) {
  const parent = path.resolve('work/test-certificate-store');
  await fs.mkdir(parent,{recursive:true});
  const directory = await fs.mkdtemp(path.join(parent,'data-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100}));
  return directory;
}
async function activate(directory,mode='https') {
  const store = await openCertificateStore(directory);
  const candidate = await store.prepareServer({hosts:['localhost','127.0.0.1']});
  await store.confirmServer(candidate.fingerprint);
  if (mode === 'mtls') {
    await store.issueDevice({name:'First phone',passphrase:'Fixture temporary password 123'});
    await store.activateMtls();
  }
  return store;
}

test('legacy HTTP read is lazy; new CA is unique per installation',async t => {
  const first = await fixture(t), second = await fixture(t);
  const a = await openCertificateStore(first), b = await openCertificateStore(second);
  assert.equal(a.state.mode,'http');
  assert.deepEqual(await fs.readdir(first),[]);
  await Promise.all([a.ensureAuthority(),b.ensureAuthority()]);
  assert.notEqual(a.state.authority.fingerprint,b.state.authority.fingerprint);
  assert.equal((await openCertificateStore(first)).state.mode,'http');
});

test('monotonic transport, two independent devices, targeted revocation, no retained client key',async t => {
  const directory = await fixture(t);
  const store = await activate(directory);
  const a = await store.issueDevice({name:'Phone A',passphrase:'Fixture temporary password 123'});
  const b = await store.issueDevice({name:'Tablet B',passphrase:'Fixture temporary password 456'});
  assert.notEqual(a.device.fingerprint,b.device.fingerprint);
  assert.equal(store.isDeviceAllowed(a.device.fingerprint.toUpperCase()),true);
  await store.activateMtls();
  await store.revokeDevice(a.device.id);
  assert.equal(store.isDeviceAllowed(a.device.fingerprint),false);
  assert.equal(store.isDeviceAllowed(b.device.fingerprint),true);
  const candidate = await store.prepareServer({hosts:['localhost','127.0.0.1','new-address.local']});
  await store.confirmServer(candidate.fingerprint);
  assert.equal(store.state.mode,'mtls','renewal never downgrades transport');
  const reopened = await openCertificateStore(directory);
  assert.equal(reopened.state.mode,'mtls');
  assert.equal(reopened.isDeviceAllowed(a.device.fingerprint),false);
  const disk = (await Promise.all((await fs.readdir(store.directory)).map(name=>fs.readFile(path.join(store.directory,name),'utf8')))).join('\n');
  assert.equal(disk.includes(a.device.fingerprint+'.key'),false);
  assert.equal(disk.includes('Fixture temporary password'),false);
  const status = JSON.stringify(store.publicStatus());
  assert.doesNotMatch(status,/PRIVATE KEY|keyFile|certFile|passphrase/);
  assert.equal((status.match(/fingerprint/g)||[]).length,4);
});

test('missing/corrupt state and keys never recreate HTTP or a replacement CA',async t => {
  for(const damage of ['missing-directory','missing-key','corrupt-state','floor-epoch','floor-mode','invalid-mode']) {
    const directory = await fixture(t);
    const store = await activate(directory);
    if(damage === 'missing-directory') await fs.rm(store.directory,{recursive:true,force:true});
    if(damage === 'missing-key') await fs.rm(path.join(store.directory,store.state.server.keyFile));
    if(damage === 'corrupt-state') await fs.writeFile(path.join(store.directory,'state.json'),'{bad');
    if(damage === 'invalid-mode') await fs.writeFile(path.join(store.directory,'state.json'),JSON.stringify({...store.state,mode:'toString'}));
    if(damage.startsWith('floor-')) {
      const file=path.join(directory,'security-floor.json');
      const state = JSON.parse(await fs.readFile(file,'utf8'));
      await fs.writeFile(file,JSON.stringify({...state,...(damage === 'floor-epoch' ? {epoch:'bad'} : {mode:'http'})}));
    }
    await assert.rejects(openCertificateStore(directory),{code:'SECURITY_LOCKED'},damage);
  }
});

test('explicit offline reset recovers even corrupt state and preserves unrelated data',async t => {
  const directory = await fixture(t);
  const store = await activate(directory,'mtls');
  const epoch = store.state.epoch;
  await fs.mkdir(path.join(directory,'chats'));
  await fs.writeFile(path.join(directory,'chats','fixture.json'),'saved chat');
  await fs.writeFile(path.join(directory,'attachment.bin'),'saved attachment');
  await fs.writeFile(path.join(store.directory,'state.json'),'corrupt');
  await assert.rejects(openCertificateStore(directory),{code:'SECURITY_LOCKED'});
  const reset = await resetCertificateStoreLocal(directory);
  assert.equal(reset.state.mode,'http');
  assert.notEqual(reset.state.epoch,epoch);
  assert.equal(reset.state.authority,null);
  assert.deepEqual(reset.state.devices,[]);
  assert.equal(await fs.readFile(path.join(directory,'chats','fixture.json'),'utf8'),'saved chat');
  assert.equal(await fs.readFile(path.join(directory,'attachment.bin'),'utf8'),'saved attachment');
});

test('expired active server blocks default load; explicit maintenance retains mode',async t => {
  const directory = await fixture(t);
  const store = await activate(directory);
  const now = new Date(Date.now()-10*86400000);
  const ca = await createAuthority({name:'Expiration fixture',now});
  const server = await issueServer({authority:ca,hosts:['localhost'],now:new Date(Date.now()-5*86400000),days:1});
  const state = store.state;
  for(const [type,identity] of [['authority',ca],['server',server]]) {
    const value = {fingerprint:identity.fingerprint,notBefore:identity.notBefore,expiresAt:identity.expiresAt,keyFile:`${type}-${identity.fingerprint}.key`,certFile:`${type}-${identity.fingerprint}.crt`,...(type==='server'?{hosts:['localhost']}:{})};
    await fs.writeFile(path.join(store.directory,value.keyFile),identity.key);
    await fs.writeFile(path.join(store.directory,value.certFile),identity.cert);
    state[type]=value;
  }
  await fs.writeFile(path.join(store.directory,'state.json'),JSON.stringify(state));
  await assert.rejects(openCertificateStore(directory),{code:'SECURITY_LOCKED'});
  const maintenance = await openCertificateStore(directory,{allowExpired:true});
  assert.equal(maintenance.state.mode,'https');
  const candidate = await maintenance.prepareServer({hosts:['localhost']});
  assert.ok(Date.parse(candidate.expiresAt)>Date.now());
  await maintenance.confirmServer(candidate.fingerprint);
  assert.equal((await openCertificateStore(directory)).state.mode,'https');
});

test('reset and loading reject junction ancestors without touching their target',async t => {
  const directory = await fixture(t), target = await fixture(t);
  const link = path.join(directory,'alias');
  await fs.writeFile(path.join(target,'keep.txt'),'untouched');
  await fs.symlink(target,link,process.platform === 'win32' ? 'junction' : 'dir');
  try {
    await assert.rejects(openCertificateStore(path.join(link,'data')),{code:'SECURITY_LOCKED'});
    await assert.rejects(resetCertificateStoreLocal(link),{code:'SECURITY_LOCKED'});
    assert.equal(await fs.readFile(path.join(target,'keep.txt'),'utf8'),'untouched');
  } finally { await fs.unlink(link); }
});

test('Windows private key ACL contains only current user and SYSTEM', {skip:process.platform !== 'win32'},async t => {
  const directory = await fixture(t);
  const store = await activate(directory);
  const script = path.join(directory,'check-acl.ps1');
  await fs.writeFile(script,`param([string]$Target)\n$ErrorActionPreference='Stop'\n$expected=@([System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value,'S-1-5-18')\n$acl=[System.IO.File]::GetAccessControl($Target)\nforeach($rule in $acl.Access){$sid=$rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;if($sid -notin $expected){throw 'Unexpected ACL identity'}}\nif(-not $acl.AreAccessRulesProtected -or $acl.Access.Count -ne 2){throw 'ACL not protected'}\nWrite-Output 'Private ACL verified'\n`);
  const {stdout}=await execFileAsync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Target',path.join(store.directory,store.state.authority.keyFile)],{windowsHide:true});
  assert.match(stdout,/Private ACL verified/);
});
