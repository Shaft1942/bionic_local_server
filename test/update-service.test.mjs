import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createUpdateService } from '../lib/update-service.mjs';

const API = 'https://api.github.com/repos/Shaft1942/bionic_local_server/releases';
const BASE = 'https://github.com/Shaft1942/bionic_local_server/releases/download/';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const archive = Buffer.from('synthetic archive bytes; ZIP validation belongs to installer');
function release(version, overrides = {}) {
  const metadata = { schemaVersion: 1, version, minInstalledVersion: '1.8.0', nodeMajorMin: 24, nodeMajorMax: null, platforms: ['win32'], archive: `bionic-mobile-v${version}.zip`, sha256: sha(archive), ...overrides.metadata };
  const payloads = { 'update-manifest.json': Buffer.from(JSON.stringify(metadata)), 'SHA256SUMS.txt': Buffer.from(`${metadata.sha256}  ${metadata.archive}\n`), [metadata.archive]: archive, ...overrides.payloads };
  const assets = Object.entries(payloads).map(([name, bytes]) => ({ name, browser_download_url: `${BASE}v${version}/${name}`, digest: `sha256:${sha(bytes)}` }));
  return { release: { tag_name: `v${version}`, draft: false, prerelease: false, body: `Notes ${version}`, published_at: '2026-10-21T12:00:00Z', assets, ...overrides.release }, payloads, metadata };
}
function network(fixtures, { pages, intercept } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const intercepted = await intercept?.(url, options); if (intercepted) return intercepted;
    if (url.startsWith(API + '?')) { const page = Number(new URL(url).searchParams.get('page')); return Response.json(pages ? (pages[page - 1] || []) : fixtures.map(f => f.release)); }
    for (const fixture of fixtures) for (const asset of fixture.release.assets || []) {
      if (url === asset.browser_download_url) return new Response(fixture.payloads[asset.name]);
    }
    throw new Error('Unexpected URL: ' + url);
  };
  return { fetchImpl, calls };
}
async function setup(t, fixtures = [], options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bionic-update-service-'));
  const mock = network(fixtures, options);
  const service = await createUpdateService({ root, currentVersion: '1.8.0', platform: 'win32', nodeVersion: '24.13.0', ...mock, ...options });
  t.after(async () => { service.stop(); await rm(root, { recursive: true, force: true }); });
  return { root, service, ...mock };
}

test('offers only the latest stable compatible semantic version over multiple skipped versions', async t => {
  const fixtures = [release('1.9.0'), release('1.10.0'), release('2.0.0', { metadata: { minInstalledVersion: '1.9.0' } }), release('9.0.0', { release: { prerelease: true } }), release('8.0.0', { release: { draft: true } }), release('1.7.0')];
  const { service } = await setup(t, fixtures);
  const result = await service.check();
  assert.equal(result.candidate.version, '1.10.0');
  assert.equal(result.currentVersion, '1.8.0');
  assert.equal(result.error, null);
});

test('compatibility includes platform, Node bounds, and installed version maximum', async t => {
  const fixtures = [release('5.0.0', { metadata: { platforms: ['linux'] } }), release('4.0.0', { metadata: { nodeMajorMin: 25 } }), release('3.0.0', { metadata: { nodeMajorMax: 23 } }), release('2.0.0', { metadata: { maxInstalledVersion: '1.7.9' } }), release('1.9.0')];
  const { service } = await setup(t, fixtures);
  assert.equal((await service.check()).candidate.version, '1.9.0');
});

test('legacy release without compatibility manifest is never offered', async t => {
  const legacy = release('9.0.0'); legacy.release.assets = legacy.release.assets.filter(a => a.name !== 'update-manifest.json');
  const { service } = await setup(t, [legacy]);
  assert.equal((await service.check()).candidate, null);
});

test('does not offer invalid tags, downgrades, equal versions, or malformed manifests', async t => {
  const badTag = release('9.0.0', { release: { tag_name: 'v9.0.0-rc.1' } });
  const wrongVersion = release('3.0.0', { metadata: { version: '7.0.0' } });
  const protocol = release('2.0.0', { metadata: { schemaVersion: 2 } });
  const { service } = await setup(t, [badTag, wrongVersion, protocol, release('1.8.0'), release('1.0.0')]);
  assert.equal((await service.check()).candidate, null);
});

test('checks all release pages before sorting rather than trusting GitHub order', async t => {
  const latest = release('1.10.0');
  const fillers = Array.from({ length: 100 }, (_, i) => ({ tag_name: `old-${i}`, draft: false, prerelease: false }));
  const { service, calls } = await setup(t, [latest], { pages: [fillers, [latest.release]] });
  assert.equal((await service.check()).candidate.version, '1.10.0');
  assert.equal(calls.filter(c => c.url.startsWith(API + '?')).length, 2);
});

test('fails closed when release pagination exceeds its bounded budget', async t => {
  const fullPage = Array.from({ length: 100 }, () => ({ tag_name: 'old' }));
  const { service } = await setup(t, [], { pages: Array.from({ length: 10 }, () => fullPage) });
  const result = await service.check();
  assert.equal(result.candidate, null);
  assert.match(result.error, /limite/);
});

test('ignoring is persisted per version and never blocks a later version', async t => {
  const first = release('1.9.0'), fixtures = [first];
  const { service, root, fetchImpl } = await setup(t, fixtures);
  await service.check(); await service.ignore('1.9.0');
  assert.equal(service.status().candidate, null);
  const state = JSON.parse(await readFile(path.join(root, 'data', 'update-state.json'), 'utf8'));
  assert.equal(state.ignoredVersion, '1.9.0');
  const again = await createUpdateService({ root, currentVersion: '1.8.0', platform: 'win32', nodeVersion: '24.0.0', fetchImpl });
  assert.equal((await again.check()).candidate, null);
  fixtures.push(release('1.10.0'));
  assert.equal((await again.check()).candidate.version, '1.10.0');
  assert.equal(again.status().ignoredVersion, '1.9.0');
});

test('disabled automatic checks still permit an explicit manual check', async t => {
  const { service, calls } = await setup(t, [release('1.9.0')]);
  await service.setEnabled(false); service.start();
  assert.equal(service.status().nextCheckAt, null);
  assert.equal((await service.check()).candidate, null);
  assert.equal(calls.length, 0);
  assert.equal((await service.check({ manual: true })).candidate.version, '1.9.0');
});

test('start checks immediately, deduplicates concurrent calls, and schedules every 24h uptime', async t => {
  let clock = 1000, id = 0;
  const timers = new Map(), day = 24 * 60 * 60 * 1000;
  const { service, calls } = await setup(t, [release('1.9.0')], {
    now: () => clock,
    setTimeoutImpl: (callback, delay) => { const handle = ++id; timers.set(handle, { callback, delay }); return handle; },
    clearTimeoutImpl: handle => timers.delete(handle)
  });
  service.start(); service.start();
  const first = service.check(), second = service.check();
  assert.equal(first, second);
  await first;
  assert.equal(calls.filter(c => c.url.startsWith(API)).length, 1);
  assert.equal(service.status().nextCheckAt, 1000 + day);
  assert.equal(timers.size, 1);
  const scheduled = [...timers.entries()][0];
  assert.equal(scheduled[1].delay, day);
  clock += day; timers.delete(scheduled[0]); scheduled[1].callback(); await service.check();
  assert.equal(calls.filter(c => c.url.startsWith(API)).length, 2);
  assert.equal(service.status().nextCheckAt, 1000 + 2 * day);
  service.stop(); assert.equal(timers.size, 0);
});

test('disabling removes the timer and choice is loaded on next process', async t => {
  const timers = new Map(); let id = 0;
  const { service, root, fetchImpl } = await setup(t, [], { setTimeoutImpl: (callback, delay) => { timers.set(++id, { callback, delay }); return id; }, clearTimeoutImpl: handle => timers.delete(handle) });
  service.start(); await service.check(); await service.setEnabled(false);
  assert.equal(timers.size, 0);
  const again = await createUpdateService({ root, currentVersion: '1.8.0', fetchImpl });
  assert.equal(again.status().enabled, false);
});

test('a network failure sanitizes the error and discards stale candidates', async t => {
  let offline = false;
  const { service } = await setup(t, [release('1.9.0')], { intercept: () => { if (offline) throw new Error('E:\\private-project\\secrets.json token=secret'); } });
  await service.check(); offline = true;
  const result = await service.check();
  assert.equal(result.candidate, null);
  assert.match(result.error, /indisponible/);
  assert.doesNotMatch(JSON.stringify(result), /private-project|token=secret/);
});

test('request timeout is bounded and leaves no checking flag stuck', async t => {
  const { service } = await setup(t, [], { requestTimeoutMs: 5, fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
  const result = await service.check();
  assert.equal(result.checking, false);
  assert.match(result.error, /temps/);
});

test('manifest asset URLs cannot direct a request to a local or foreign server', async t => {
  const latest = release('1.9.0'); latest.release.assets.find(a => a.name === 'update-manifest.json').browser_download_url = 'http://127.0.0.1/private';
  const { service, calls } = await setup(t, [latest]);
  assert.equal((await service.check()).candidate, null);
  assert.equal(calls.length, 1);
});

test('redirects to untrusted domains are rejected before making an outbound request', async t => {
  const { service, calls } = await setup(t, [release('1.9.0')], { intercept: url => url.includes('update-manifest.json') ? new Response(null, { status: 302, headers: { Location: 'https://attacker.example/private' } }) : null });
  const result = await service.check();
  assert.equal(result.candidate, null);
  assert.equal(calls.length, 2);
});

test('GitHub release asset redirects are followed with bounded requests', async t => {
  const fixture = release('1.9.0');
  const { service } = await setup(t, [fixture], { intercept: url => {
    if (url.includes('update-manifest.json')) return new Response(null, { status: 302, headers: { Location: 'https://release-assets.githubusercontent.com/github-production-release-asset/fixture?signature=public-fixture' } });
    if (url.startsWith('https://release-assets.githubusercontent.com/')) return new Response(fixture.payloads['update-manifest.json']);
  } });
  assert.equal((await service.check()).candidate.version, '1.9.0');
});

test('oversized metadata is rejected before reading its body', async t => {
  const { service } = await setup(t, [], { intercept: () => new Response('{}', { headers: { 'Content-Length': String(5 * 1024 * 1024) } }) });
  assert.match((await service.check()).error, /limite/);
});

test('prepareInstall validates the real SHA256SUMS.txt asset, manifest hash and GitHub digest before returning bytes', async t => {
  const { service } = await setup(t, [release('1.9.0')]);
  await service.check();
  const prepared = await service.prepareInstall('1.9.0');
  assert.deepEqual(prepared.archive, archive);
  assert.equal(prepared.archiveBuffer, prepared.archive);
  assert.equal(prepared.metadata.sha256, sha(archive));
  assert.equal(prepared.candidate.version, '1.9.0');
});

test('checksum manifest disagreement prevents archive download', async t => {
  const fixture = release('1.9.0', { payloads: { 'SHA256SUMS.txt': Buffer.from(`${'0'.repeat(64)}  bionic-mobile-v1.9.0.zip\n`) } });
  const { service, calls } = await setup(t, [fixture]);
  await assert.rejects(service.prepareInstall('1.9.0'), /intégrité/);
  assert.equal(calls.some(c => c.url.endsWith('.zip')), false);
});

test('duplicate archive checksum entries are rejected', async t => {
  const entry = `${sha(archive)}  bionic-mobile-v1.9.0.zip\n`;
  const { service } = await setup(t, [release('1.9.0', { payloads: { 'SHA256SUMS.txt': Buffer.from(entry + entry) } })]);
  await assert.rejects(service.prepareInstall('1.9.0'), /intégrité/);
});

test('tampered ZIP cannot pass even when the GitHub digest is absent', async t => {
  const fixture = release('1.9.0', { payloads: { 'bionic-mobile-v1.9.0.zip': Buffer.from('tampered') } });
  delete fixture.release.assets.find(a => a.name.endsWith('.zip')).digest;
  const { service } = await setup(t, [fixture]);
  await assert.rejects(service.prepareInstall('1.9.0'), /intégrité/);
});

test('an incorrect GitHub asset digest also prevents installation preparation', async t => {
  const fixture = release('1.9.0'); fixture.release.assets.find(a => a.name.endsWith('.zip')).digest = `sha256:${'0'.repeat(64)}`;
  const { service } = await setup(t, [fixture]);
  await assert.rejects(service.prepareInstall('1.9.0'), /intégrité/);
});

test('ignored, stale, or superseded version cannot be installed', async t => {
  const fixtures = [release('1.9.0')];
  const { service } = await setup(t, fixtures);
  await service.check(); await service.ignore('1.9.0');
  await assert.rejects(service.prepareInstall('1.9.0'), /plus disponible/);
  fixtures.push(release('1.10.0'));
  await assert.rejects(service.prepareInstall('1.9.0'), /plus disponible/);
  assert.equal((await service.prepareInstall('1.10.0')).candidate.version, '1.10.0');
});

test('status exposes only safe JSON and bounded external release notes', async t => {
  const { service } = await setup(t, [release('1.9.0', { release: { body: 'x'.repeat(20000) } })]);
  const result = await service.check();
  assert.equal(result.candidate.notes.length, 12000);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
  result.candidate.version = '99.0.0';
  assert.equal(service.status().candidate.version, '1.9.0');
});

test('a failed preferences write does not apply an ignored version or disabled checks in memory', async t => {
  const { service, root } = await setup(t, [release('1.9.0')]);
  await service.check();
  // An existing directory at the state filename deterministically prevents atomic replacement.
  await mkdir(path.join(root, 'data', 'update-state.json'), { recursive: true });
  await assert.rejects(service.ignore('1.9.0'), /enregistré/);
  assert.equal(service.status().ignoredVersion, null);
  assert.equal(service.status().candidate.version, '1.9.0');
  await assert.rejects(service.setEnabled(false), /enregistré/);
  assert.equal(service.status().enabled, true);
});

test('concurrent preference changes preserve both durable choices', async t => {
  const { service, root } = await setup(t, [release('1.9.0')]);
  await service.check();
  await Promise.all([service.ignore('1.9.0'), service.setEnabled(false)]);
  const saved = JSON.parse(await readFile(path.join(root, 'data', 'update-state.json'), 'utf8'));
  assert.equal(saved.ignoredVersion, '1.9.0'); assert.equal(saved.enabled, false);
  assert.equal(service.status().ignoredVersion, '1.9.0'); assert.equal(service.status().enabled, false);
});

test('rapid concurrent enable toggles keep scheduling consistent with the durable final choice', async t => {
  const { service } = await setup(t);
  service.start(); await service.check();
  await Promise.all([service.setEnabled(false), service.setEnabled(true)]);
  assert.equal(service.status().enabled, true);
  assert.ok(service.status().nextCheckAt > 0);
});

test('unreadable saved choices suspend automatic checks instead of forgetting a refusal silently',async t=>{
 const {root,fetchImpl,calls}=await setup(t,[release('1.9.0')]);
 await mkdir(path.join(root,'data'));await writeFile(path.join(root,'data/update-state.json'),'{broken');
 const service=await createUpdateService({root,currentVersion:'1.8.0',platform:'win32',fetchImpl});t.after(()=>service.stop());
 service.start();assert.equal(service.status().enabled,false);assert(service.status().error);assert.equal(calls.length,0);
 assert.equal((await service.check({manual:true})).candidate.version,'1.9.0');
});
