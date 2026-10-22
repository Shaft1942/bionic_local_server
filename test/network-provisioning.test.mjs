import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root=fileURLToPath(new URL('../',import.meta.url));
const windows=process.platform==='win32';
const q=value=>`'${String(value).replaceAll("'","''")}'`;
const helper=String.raw`
function Start-BionicElevated { return $false }
function Get-BionicField { param($Object,[string]$Name) if($null -ne $Object -and $null -ne $Object.PSObject.Properties[$Name]){return $Object.$Name};return $null }
function Get-BionicRuntime { param($Root) return [pscustomobject]@{port=43100;instanceId='fixture-network';node='NODE_PATH_FIXTURE';addresses=@('192.168.25.42')} }
function Assert-BionicRuntimeIdentity { return [pscustomobject]@{instanceId='fixture-network'} }
function Get-BionicTransport { return Get-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime/fixture-transport.json') -Raw | ConvertFrom-Json }
function Get-BionicFirewallName { return 'BionicMobileLocal-FIXTUREONLY' }
function Get-NetIPAddress { param($AddressFamily) return [pscustomobject]@{IPAddress='192.168.25.42';InterfaceAlias='Fixture private LAN';InterfaceIndex=7;PrefixLength=24} }
function Get-NetConnectionProfile { param($InterfaceIndex,$ErrorAction) return [pscustomobject]@{NetworkCategory='Private'} }
function Get-NetFirewallRule { param($Name,$ErrorAction) if($script:rule){return $script:rule} }
function Remove-NetFirewallRule { param([Parameter(ValueFromPipeline=$true)]$InputObject) process{$script:rule=$null} }
function New-NetFirewallRule {
 param($Name,$DisplayName,$Direction,$Action,$Protocol,$LocalPort,$Program,$LocalAddress,$RemoteAddress,$InterfaceAlias,$Profile)
 $PSBoundParameters | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'runtime/fixture-rule.json')
 $script:ports=$LocalPort
 $script:program=$Program; $script:localAddress=$LocalAddress; $script:remoteAddress=$RemoteAddress; $script:interfaceAlias=$InterfaceAlias
 $script:rule=[pscustomobject]@{Enabled='True';Direction=$Direction;Action=$Action;Profile=$Profile}
 return $script:rule
}
function Get-NetFirewallPortFilter {
 param($AssociatedNetFirewallRule,$ErrorAction)
 $ports=if($env:BIONIC_TEST_CORRUPT_RULE -eq '1'){@('43100')}else{$script:ports}
 return [pscustomobject]@{Protocol='TCP';LocalPort=$ports}
}
function Get-NetFirewallApplicationFilter { param($AssociatedNetFirewallRule,$ErrorAction) return [pscustomobject]@{Program=$(if($env:BIONIC_TEST_BAD_SCOPE -eq 'program'){'C:/foreign.exe'}else{$script:program})} }
function Get-NetFirewallAddressFilter { param($AssociatedNetFirewallRule,$ErrorAction) return [pscustomobject]@{LocalAddress=$script:localAddress;RemoteAddress=$(if($env:BIONIC_TEST_BAD_SCOPE -eq 'address'){'Any'}else{$script:remoteAddress})} }
function Get-NetFirewallInterfaceFilter { param($AssociatedNetFirewallRule,$ErrorAction) return [pscustomobject]@{InterfaceAlias=$(if($env:BIONIC_TEST_BAD_SCOPE -eq 'interface'){'Any'}else{$script:interfaceAlias})} }
`;
// Real PowerShell script, mocked Windows firewall cmdlets: no rules or UAC touched.
async function fixture(t,transport={version:1,instanceId:'fixture-network',appPort:43100,proofPort:43101,appProtocol:'http:'}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'bionic-network-test-'));
 t.after(async()=>{assert.equal(path.dirname(directory),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('bionic-network-test-'));await fs.rm(directory,{recursive:true,force:true});});
 await fs.mkdir(path.join(directory,'runtime'));
 for(const filename of ['Autoriser-reseau-prive.ps1','Retirer-autorisation-reseau.ps1'])await fs.copyFile(path.join(root,filename),path.join(directory,filename));
 await fs.writeFile(path.join(directory,'Bionic-mobile-commun.ps1'),helper.replace('NODE_PATH_FIXTURE',process.execPath.replaceAll("'","''")));
 await fs.writeFile(path.join(directory,'runtime/fixture-transport.json'),JSON.stringify(transport));
 return directory;
}
function ps(directory,code,env={}){
 return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-OutputFormat','Text','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';${code}`,'utf16le').toString('base64')],{encoding:'utf8',timeout:20000,windowsHide:true,env:{...process.env,BIONIC_TEST_CORRUPT_RULE:'0',BIONIC_TEST_BAD_SCOPE:'',...env},cwd:directory}).trim();
}

test('initial network permission scopes exactly the app and fixed proof ports, then records verified provisioning',{skip:!windows},async t=>{
 const directory=await fixture(t);
 ps(directory,`& ${q(path.join(directory,'Autoriser-reseau-prive.ps1'))}`);
 const rule=JSON.parse(await fs.readFile(path.join(directory,'runtime/fixture-rule.json'),'utf8'));
 assert.deepEqual(rule.LocalPort,[43100,43101]);assert.equal(rule.Program,process.execPath);
 assert.equal(rule.Profile,'Private');assert.equal(rule.LocalAddress,'192.168.25.42');assert.equal(rule.RemoteAddress,'192.168.25.0/24');assert.equal(rule.InterfaceAlias,'Fixture private LAN');
 const marker=JSON.parse(await fs.readFile(path.join(directory,'runtime/certificate-network.json'),'utf8'));
 assert.equal(marker.version,1);assert.equal(marker.instanceId,'fixture-network');assert.equal(marker.appPort,43100);assert.equal(marker.proofPort,43101);assert(Number.isFinite(Date.parse(marker.provisionedAt)));
 assert.equal(marker.localAddress,'192.168.25.42');assert.equal(marker.prefixLength,24);assert.equal(marker.remoteSubnet,'192.168.25.0/24');assert.equal(marker.interfaceAlias,'Fixture private LAN');assert.equal(marker.program,process.execPath);
});

test('unverified application, address or interface scope never records successful provisioning',{skip:!windows},async t=>{
 for(const kind of ['program','address','interface']){
  const directory=await fixture(t);
  assert.equal(ps(directory,`try{& ${q(path.join(directory,'Autoriser-reseau-prive.ps1'))};throw 'accepted'}catch{if($_.Exception.Message -eq 'accepted'){throw};'rejected'}`,{BIONIC_TEST_BAD_SCOPE:kind}),'rejected');
  await assert.rejects(fs.access(path.join(directory,'runtime/certificate-network.json')));
 }
});

test('unverified firewall ports never leave a successful network marker',{skip:!windows},async t=>{
 const directory=await fixture(t);
 await fs.writeFile(path.join(directory,'runtime/certificate-network.json'),'stale marker');
 const output=ps(directory,`try{& ${q(path.join(directory,'Autoriser-reseau-prive.ps1'))};throw 'accepted'}catch{if($_.Exception.Message -eq 'accepted'){throw};'rejected'}`,{BIONIC_TEST_CORRUPT_RULE:'1'});
 assert.equal(output,'rejected');await assert.rejects(fs.access(path.join(directory,'runtime/certificate-network.json')));
});

test('mismatched instance or invalid proof port refuses firewall mutation',{skip:!windows},async t=>{
 for(const fields of [{instanceId:'foreign'},{proofPort:0},{proofPort:43100},{appPort:43102}]){
  const directory=await fixture(t,{version:1,instanceId:'fixture-network',appPort:43100,proofPort:43101,appProtocol:'http:',...fields});
  assert.equal(ps(directory,`try{& ${q(path.join(directory,'Autoriser-reseau-prive.ps1'))};throw 'accepted'}catch{if($_.Exception.Message -eq 'accepted'){throw};'rejected'}`),'rejected');
  await assert.rejects(fs.access(path.join(directory,'runtime/fixture-rule.json')));await assert.rejects(fs.access(path.join(directory,'runtime/certificate-network.json')));
 }
});

test('removing instance network permission invalidates its provisioning marker',{skip:!windows},async t=>{
 const directory=await fixture(t);await fs.writeFile(path.join(directory,'runtime/certificate-network.json'),'stale marker');
 ps(directory,`& ${q(path.join(directory,'Retirer-autorisation-reseau.ps1'))}`);
 await assert.rejects(fs.access(path.join(directory,'runtime/certificate-network.json')));
});
