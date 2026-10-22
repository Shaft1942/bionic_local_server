import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const windows = process.platform === 'win32';
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
function ps(source, env = {}, { timeout = 15_000 } = {}) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(`$ErrorActionPreference = 'Stop'; $ProgressPreference = 'SilentlyContinue'; ${source}`, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout,
    env: { ...process.env, BIONIC_MOBILE_PORT: '', BIONIC_MOBILE_NODE: '', ...env }
  }).trim();
}
const helpers = `. ${quote(path.join(root, 'Bionic-mobile-commun.ps1'))}; `;
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'bionic launchers '));
  t.after(async () => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('bionic launchers '));
    await fs.rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test('PowerShell launchers parse without executing their actions', { skip: !windows }, () => {
  const result = ps(`$bad = @(); Get-ChildItem -LiteralPath ${quote(root)} -Filter '*.ps1' | ForEach-Object { $tokens = $null; $errors = $null; $null = [Management.Automation.Language.Parser]::ParseFile($_.FullName, [ref]$tokens, [ref]$errors); $bad += $errors }; if ($bad.Count) { throw ($bad | Out-String) }; 'OK'`, {}, { timeout: 45_000 });
  assert.equal(result, 'OK');
});

test('launcher port uses environment, then local configuration, never stale runtime', { skip: !windows }, async t => {
  const directory = await fixture(t);
  await fs.mkdir(path.join(directory, 'runtime'));
  await fs.writeFile(path.join(directory, 'runtime/server.json'), JSON.stringify({ port: 4001 }));
  assert.equal(ps(`${helpers}Get-BionicPort ${quote(directory)}`), '8769');
  await fs.writeFile(path.join(directory, 'config.local.json'), JSON.stringify({ port: 4010 }));
  assert.equal(ps(`${helpers}Get-BionicPort ${quote(directory)}`), '4010');
  assert.equal(ps(`${helpers}Get-BionicPort ${quote(directory)}`, { BIONIC_MOBILE_PORT: '4020' }), '4020');
  assert.equal(ps(`${helpers}try { Get-BionicPort ${quote(directory)}; throw 'accepted' } catch { if ($_.Exception.Message -eq 'accepted') { throw }; 'rejected' }`, { BIONIC_MOBILE_PORT: '0' }), 'rejected');
});

test('instance checks reject another Bionic installation and absent identifiers', { skip: !windows }, () => {
  const result = ps(`${helpers}$same = [pscustomobject]@{app='bionic-mobile-local'; instanceId='ours'}; $foreign = [pscustomobject]@{app='bionic-mobile-local'; instanceId='other'}; @((Test-BionicIdentity $same 'ours'), (Test-BionicIdentity $foreign 'ours'), (Test-BionicIdentity $same ''), (Test-BionicIdentity $null 'ours')) | ConvertTo-Json -Compress`);
  assert.deepEqual(JSON.parse(result), [true, false, false, false]);
});

test('runtime ownership requires this folder and matching live instance', { skip: !windows }, async t => {
  const directory = await fixture(t);
  await fs.mkdir(path.join(directory, 'data'));
  await fs.mkdir(path.join(directory, 'runtime'));
  await fs.writeFile(path.join(directory, 'data/config.json'), JSON.stringify({ instanceId: 'ours', adminToken: 'fixture-only' }));
  const runtime = { root: directory, instanceId: 'ours', port: 4040 };
  await fs.writeFile(path.join(directory, 'runtime/server.json'), JSON.stringify(runtime));
  assert.equal(ps(`${helpers}function Get-BionicPing { return [pscustomobject]@{app='bionic-mobile-local'; instanceId='ours'} }; $runtime = Get-BionicRuntime ${quote(directory)}; $null = Assert-BionicRuntimeIdentity ${quote(directory)} $runtime; 'OK'`), 'OK');
  assert.equal(ps(`${helpers}function Get-BionicPing { return [pscustomobject]@{app='bionic-mobile-local'; instanceId='other'} }; $runtime = Get-BionicRuntime ${quote(directory)}; try { $null = Assert-BionicRuntimeIdentity ${quote(directory)} $runtime; throw 'accepted' } catch { if ($_.Exception.Message -eq 'accepted') { throw }; 'rejected' }`), 'rejected');
  await fs.writeFile(path.join(directory, 'runtime/server.json'), JSON.stringify({ ...runtime, root: path.join(directory, 'different') }));
  assert.equal(ps(`${helpers}try { $null = Get-BionicRuntime ${quote(directory)}; throw 'accepted' } catch { if ($_.Exception.Message -eq 'accepted') { throw }; 'rejected' }`), 'rejected');
});

test('firewall names are scoped to the folder and independent of path casing', { skip: !windows }, async t => {
  const directory = await fixture(t);
  const result = JSON.parse(ps(`${helpers}@((Get-BionicFirewallName ${quote(directory)}), (Get-BionicFirewallName ${quote(directory.toUpperCase())}), (Get-BionicFirewallName ${quote(path.join(directory, 'another'))})) | ConvertTo-Json -Compress`));
  assert.match(result[0], /^BionicMobileLocal-[0-9A-F]{16}$/);
  assert.equal(result[0], result[1]);
  assert.notEqual(result[0], result[2]);
});

test('explicit Node executable is verified without a bundled runtime dependency', { skip: !windows }, () => {
  const actual = ps(`${helpers}Get-BionicNode`, { BIONIC_MOBILE_NODE: process.execPath });
  assert.equal(path.resolve(actual).toLowerCase(), path.resolve(process.execPath).toLowerCase());
});
