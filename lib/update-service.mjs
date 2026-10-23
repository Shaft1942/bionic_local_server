import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { parseUpdateVersion, compareUpdateVersions, updateChannelForVersion } from './update-version.mjs';

const REPOSITORY = 'Shaft1942/bionic_local_server';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const DAY = 24 * 60 * 60 * 1000;
const HASH = /^[a-f0-9]{64}$/i;
const REDIRECT_HOSTS = new Set(['release-assets.githubusercontent.com', 'objects.githubusercontent.com']);
const LIMITS = { pages: 10, requests: 300, metadata: 96 * 1024, releases: 4 * 1024 * 1024, archive: 32 * 1024 * 1024, totalMetadata: 16 * 1024 * 1024 };
const ERROR_MESSAGES = {
  network: 'La vérification GitHub est indisponible. Vous pourrez réessayer.',
  timeout: 'GitHub n’a pas répondu à temps. Vous pourrez réessayer.',
  limit: 'La vérification a atteint sa limite de sécurité. Aucune mise à jour n’a été préparée.',
  invalid: 'Les informations de cette version sont invalides. Aucune mise à jour n’a été préparée.',
  integrity: 'L’intégrité de la mise à jour n’a pas pu être vérifiée. Aucun fichier n’a été installé.',
  unavailable: 'Cette mise à jour n’est plus disponible ou n’est pas compatible. Relancez la vérification.',
  storage: 'Le choix de mise à jour n’a pas pu être enregistré sur le PC.'
};
function failure(code, status = 502) { return Object.assign(new Error(ERROR_MESSAGES[code] || ERROR_MESSAGES.invalid), { code, status }); }
function version(value) {
  try { return parseUpdateVersion(value); } catch { return null; }
}
const compare = compareUpdateVersions;
const validChannel = value => value === 'stable' || value === 'beta';
function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function allowedUrl(value, redirects = false) {
  let url; try { url = new URL(value); } catch { throw failure('invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || url.hash) throw failure('invalid');
  const fixed = (url.hostname === 'api.github.com' && url.pathname.startsWith(`/repos/${REPOSITORY}/releases`)) ||
    (url.hostname === 'github.com' && url.pathname.startsWith(`/${REPOSITORY}/releases/download/`));
  if (!fixed && !(redirects && REDIRECT_HOSTS.has(url.hostname))) throw failure('invalid');
  return url;
}
function assetUrl(asset, tag) {
  if (!asset || typeof asset.name !== 'string' || /[\\/\x00-\x1f]/.test(asset.name)) throw failure('invalid');
  const url = allowedUrl(asset.browser_download_url);
  if (url.hostname !== 'github.com' || url.search || url.pathname !== `/${REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(asset.name)}`) throw failure('invalid');
  if (asset.digest !== undefined && asset.digest !== null && !/^sha256:[a-f0-9]{64}$/i.test(asset.digest)) throw failure('invalid');
  return url.href;
}
function metadataIsValid(value, releaseVersion) {
  return value && typeof value === 'object' && !Array.isArray(value) && value.schemaVersion === 1 && value.version === releaseVersion &&
    (value.channel === updateChannelForVersion(releaseVersion) || (value.channel === undefined && updateChannelForVersion(releaseVersion) === 'stable')) &&
    version(value.minInstalledVersion) && (value.maxInstalledVersion === undefined ||
      (version(value.maxInstalledVersion) && compare(value.minInstalledVersion, value.maxInstalledVersion) <= 0)) &&
    Number.isSafeInteger(value.nodeMajorMin) && value.nodeMajorMin >= 24 &&
    (value.nodeMajorMax === null || (Number.isSafeInteger(value.nodeMajorMax) && value.nodeMajorMax >= value.nodeMajorMin)) &&
    Array.isArray(value.platforms) && value.platforms.length > 0 && value.platforms.length <= 10 && value.platforms.every(p => typeof p === 'string' && /^[a-z0-9_-]{1,20}$/.test(p)) &&
    value.archive === `bionic-mobile-v${releaseVersion}.zip` && HASH.test(value.sha256);
}
function compatible(metadata, installed, platform, nodeMajor) {
  return metadata.platforms.includes(platform) && nodeMajor >= metadata.nodeMajorMin &&
    (metadata.nodeMajorMax === null || nodeMajor <= metadata.nodeMajorMax) &&
    compare(installed, metadata.minInstalledVersion) >= 0 && (!metadata.maxInstalledVersion || compare(installed, metadata.maxInstalledVersion) <= 0);
}

/** Public releases are checked centrally. This service never executes or installs an update. */
export async function createUpdateService({ root, currentVersion, fetchImpl = globalThis.fetch, platform = process.platform, nodeVersion = process.versions.node,
  now = Date.now, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout, intervalMs = DAY, requestTimeoutMs = 15000,
  stateFile = root ? path.join(root, 'data', 'update-state.json') : null } = {}) {
  if (!root || !version(currentVersion) || typeof fetchImpl !== 'function' || !Number.isFinite(intervalMs) || intervalMs <= 0) throw failure('invalid', 400);
  const nodeMajor = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isSafeInteger(nodeMajor)) throw failure('invalid', 400);
  let preferences = { enabled: true, channel: 'stable', ignoredVersion: null }, storageError = null;
  try {
    const saved = JSON.parse(await readFile(stateFile, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved) || (saved.schemaVersion !== undefined && saved.schemaVersion !== 1) || typeof saved.enabled !== 'boolean' || (saved.channel !== undefined && !validChannel(saved.channel)) || (saved.ignoredVersion != null && !version(saved.ignoredVersion))) throw failure('storage');
    preferences = { enabled: saved.enabled !== false, channel: saved.channel ?? 'stable', ignoredVersion: version(saved.ignoredVersion) ? saved.ignoredVersion : null };
  } catch (error) { if (error.code !== 'ENOENT') { storageError = ERROR_MESSAGES.storage; preferences.enabled = false; } }
  let checking = false, inFlight = null, selected = null, lastCheckedAt = null, nextCheckAt = null, lastError = storageError, timer = null, started = false;
  let saveChain = Promise.resolve(), selectionEpoch = 0, inFlightEpoch = 0;
  const status = () => ({ currentVersion, installedChannel: updateChannelForVersion(currentVersion), channel: preferences.channel, enabled: preferences.enabled, checking, lastCheckedAt, nextCheckAt,
    candidate: selected && selected.candidate.version !== preferences.ignoredVersion ? { ...selected.candidate } : null,
    ignoredVersion: preferences.ignoredVersion, error: lastError });
  const persist = change => {
    const task = saveChain.catch(() => {}).then(async () => {
      const next = { ...preferences, ...change };
      const enabledChanged = next.enabled !== preferences.enabled;
      const channelChanged = next.channel !== preferences.channel;
      const payload = JSON.stringify({ schemaVersion: 1, ...next });
      const temporary = `${stateFile}.${randomUUID()}.tmp`;
      try {
        await mkdir(path.dirname(stateFile), { recursive: true }); await writeFile(temporary, payload, { mode: 0o600 }); await rename(temporary, stateFile);
        // Apply only a durable choice; failures must not masquerade as a saved refusal.
        preferences = next;
        if (channelChanged) { ++selectionEpoch; selected = null; lastCheckedAt = null; lastError = null; }
        return { enabledChanged, channelChanged };
      }
      catch { await rm(temporary, { force: true }).catch(() => {}); lastError = ERROR_MESSAGES.storage; throw failure('storage', 500); }
    });
    saveChain = task; return task;
  };
  async function request(urlValue, { limit = LIMITS.metadata, json = false, asset, budget, archive = false } = {}) {
    let url = allowedUrl(urlValue), hops = 0;
    if (++budget.requests > LIMITS.requests || now() >= budget.deadline) throw failure('limit');
    const controller = new AbortController();
    const timeout = setTimeoutImpl(() => controller.abort(), Math.min(budget.deadline - now(), archive ? Math.max(requestTimeoutMs, 60000) : requestTimeoutMs)); timeout?.unref?.();
    try {
      while (true) {
        const response = await fetchImpl(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'bionic-mobile-updater', Accept: json ? 'application/vnd.github+json' : 'application/octet-stream' } });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel?.();
          if (++hops > 4 || ++budget.requests > LIMITS.requests || now() >= budget.deadline) throw failure('limit');
          url = allowedUrl(new URL(response.headers.get('location'), url).href, true); continue;
        }
        if (!response.ok) throw failure('network');
        if (response.url) allowedUrl(response.url, hops > 0);
        const declared = response.headers.get('content-length');
        if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) { await response.body?.cancel?.(); throw failure('limit'); }
        const chunks = []; let size = 0;
        if (response.body && response.body[Symbol.asyncIterator]) {
          for await (const chunk of response.body) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > limit) { controller.abort(); throw failure('limit'); } chunks.push(bytes); }
        } else { const bytes = Buffer.from(await response.arrayBuffer()); size = bytes.length; if (size > limit) throw failure('limit'); chunks.push(bytes); }
        if (!archive && (budget.bytes += size) > LIMITS.totalMetadata) throw failure('limit');
        const bytes = Buffer.concat(chunks, size);
        if (asset?.digest && digest(bytes) !== asset.digest.slice(7).toLowerCase()) throw failure('integrity');
        if (!json) return bytes;
        try { return JSON.parse(bytes.toString('utf8')); } catch { throw failure('invalid'); }
      }
    } catch (error) { if (ERROR_MESSAGES[error?.code]) throw error; throw failure(controller.signal.aborted ? 'timeout' : 'network'); }
    finally { clearTimeoutImpl(timeout); }
  }
  async function findLatest(channel) {
    const budget = { requests: 0, bytes: 0, deadline: now() + 120000 }, releases = []; let complete = false;
    for (let page = 1; page <= LIMITS.pages; page++) {
      const batch = await request(`${API}/releases?per_page=100&page=${page}`, { json: true, limit: LIMITS.releases, budget });
      if (!Array.isArray(batch) || batch.length > 100) throw failure('invalid');
      releases.push(...batch);
      if (batch.length < 100) { complete = true; break; }
    }
    if (!complete) throw failure('limit');
    const candidates = releases.filter(release => release && !release.draft && typeof release.tag_name === 'string' && release.tag_name.startsWith('v'))
      .map(release => ({ release, version: release.tag_name.replace(/^v/, '') }))
      .filter(item => version(item.version) && (updateChannelForVersion(item.version) === 'beta' ? channel === 'beta' && item.release.prerelease === true : item.release.prerelease === false) && compare(item.version, currentVersion) > 0).sort((a, b) => compare(b.version, a.version));
    for (const item of candidates) {
      const assets = item.release.assets;
      if (!Array.isArray(assets)) continue;
      const manifests = assets.filter(asset => asset.name === 'update-manifest.json');
      if (manifests.length !== 1) continue;
      let metadata;
      try {
        metadata = await request(assetUrl(manifests[0], item.release.tag_name), { json: true, asset: manifests[0], budget });
        if (!metadataIsValid(metadata, item.version) || !compatible(metadata, currentVersion, platform, nodeMajor)) continue;
      } catch (error) { if (error.code === 'invalid') continue; throw error; }
      const archives = assets.filter(asset => asset.name === metadata.archive), checksums = assets.filter(asset => asset.name === 'SHA256SUMS.txt');
      if (archives.length !== 1 || checksums.length !== 1) continue;
      try { assetUrl(archives[0], item.release.tag_name); assetUrl(checksums[0], item.release.tag_name); } catch { continue; }
      return { candidate: { version: item.version, channel: updateChannelForVersion(item.version), url: `https://github.com/${REPOSITORY}/releases/tag/${encodeURIComponent(item.release.tag_name)}`,
        notes: typeof item.release.body === 'string' ? item.release.body.slice(0, 12000) : '',
        publishedAt: typeof item.release.published_at === 'string' && Number.isFinite(Date.parse(item.release.published_at)) ? item.release.published_at : null },
      metadata, archiveAsset: archives[0], checksumAsset: checksums[0], tag: item.release.tag_name };
    }
    return null;
  }
  function check({ manual = false } = {}) {
    if (inFlight) return inFlightEpoch === selectionEpoch ? inFlight : inFlight.then(() => check({ manual }));
    if (!manual && !preferences.enabled) return Promise.resolve(status());
    const epoch = selectionEpoch, channel = preferences.channel; inFlightEpoch = epoch;
    checking = true;
    inFlight = (async () => {
      try { const found = await findLatest(channel); if (epoch === selectionEpoch) { selected = found; lastError = null; } }
      catch (error) { if (epoch === selectionEpoch) { lastError = ERROR_MESSAGES[error.code] || ERROR_MESSAGES.network; selected = null; } }
      finally { if (epoch === selectionEpoch) lastCheckedAt = now(); checking = false; inFlight = null; }
      return status();
    })();
    return inFlight;
  }
  function schedule() {
    if (timer !== null) clearTimeoutImpl(timer);
    timer = null;
    if (!started || !preferences.enabled) { nextCheckAt = null; return; }
    if (nextCheckAt === null) nextCheckAt = now() + intervalMs;
    timer = setTimeoutImpl(() => { timer = null; nextCheckAt = now() + intervalMs; void check(); schedule(); }, Math.max(0, nextCheckAt - now()));
    timer?.unref?.();
  }
  async function setPreferences(change) {
    if (!change || typeof change !== 'object' || Array.isArray(change) || !Object.keys(change).length || Object.keys(change).some(key => !['enabled', 'channel'].includes(key)) ||
      ('enabled' in change && typeof change.enabled !== 'boolean') || ('channel' in change && !validChannel(change.channel))) throw failure('invalid', 400);
    const { enabledChanged, channelChanged } = await persist(change);
    if (enabledChanged || channelChanged) { nextCheckAt = null; schedule(); if (preferences.enabled && started) void check(); }
    return status();
  }
  return {
    status, check,
    start() { if (started) return; started = true; nextCheckAt = preferences.enabled ? now() + intervalMs : null; schedule(); if (preferences.enabled) void check(); },
    stop() { started = false; if (timer !== null) clearTimeoutImpl(timer); timer = null; nextCheckAt = null; },
    async ignore(ignored) { if (!version(ignored) || !selected || selected.candidate.version !== ignored) throw failure('unavailable', 409); await persist({ ignoredVersion: ignored }); return status(); },
    setPreferences,
    setEnabled(enabled) { return setPreferences({ enabled }); },
    setChannel(channel) { return setPreferences({ channel }); },
    async prepareInstall(targetVersion) {
      if (!version(targetVersion)) throw failure('unavailable', 409);
      const epoch = selectionEpoch;
      await check({ manual: true });
      if (epoch !== selectionEpoch || !selected || selected.candidate.version !== targetVersion || preferences.ignoredVersion === targetVersion || lastError) throw failure('unavailable', 409);
      const picked = selected, budget = { requests: 0, bytes: 0, deadline: now() + 90000 };
      const sums = (await request(assetUrl(picked.checksumAsset, picked.tag), { asset: picked.checksumAsset, budget })).toString('utf8');
      if (epoch !== selectionEpoch || preferences.ignoredVersion === targetVersion) throw failure('unavailable', 409);
      const lines = sums.split(/\r?\n/).filter(line => line.trim());
      const matching = lines.map(line => /^([a-f0-9]{64}) [ *]([^\r\n]+)$/i.exec(line)).filter(match => match?.[2] === picked.metadata.archive);
      if (matching.length !== 1 || matching[0][1].toLowerCase() !== picked.metadata.sha256.toLowerCase()) throw failure('integrity');
      const archive = await request(assetUrl(picked.archiveAsset, picked.tag), { limit: LIMITS.archive, archive: true, asset: picked.archiveAsset, budget });
      if (epoch !== selectionEpoch || preferences.ignoredVersion === targetVersion) throw failure('unavailable', 409);
      if (digest(archive) !== picked.metadata.sha256.toLowerCase()) throw failure('integrity');
      return { candidate: { ...picked.candidate }, archive, archiveBuffer: archive, metadata: structuredClone(picked.metadata) };
    }
  };
}
