import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const componentSource = await fs.readFile(new URL('../public/updates.js', import.meta.url), 'utf8');
const source = (await Promise.all(['i18n.js', 'locales/fr/components.js', 'locales/en/components.js'].map(file => fs.readFile(new URL('../public/'+file, import.meta.url), 'utf8')))).join('\n') + '\n' + componentSource;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const initial = () => ({ currentVersion: '2.1.0', enabled: false, channel: 'stable', installedChannel: 'stable', candidate: null, canInstall: false, installation: { status: 'idle' } });

function fixture(intercept = () => undefined, status = initial()) {
  const elements = new Map(), calls = [], timers = new Map();
  let timerId = 0;
  const document = { hidden: false, activeElement: null, getElementById: element, addEventListener() {}, body: {} };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', checked: false, disabled: false, hidden: false, textContent: '', isConnected: true, open: false, listeners: {}, attributes: {},
      classList: { toggle() {} }, setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { document.activeElement = this; }, close() { this.open = false; }, showModal() { this.open = true; },
    });
    return elements.get(id);
  }
  document.activeElement = element('settings-open-sidebar');
  const api = async (route, options) => {
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ route, body });
    const override = intercept(route, options, body);
    if (override !== undefined) return override;
    if (route === '/api/updates/preferences') { status = { ...status, ...body }; if (body.channel) status = { ...status, candidate: null, lastCheckedAt: null }; }
    if (route === '/api/updates/check') status = { ...status, candidate: { version: '2.2.0-beta.1', channel: 'beta', notes: 'Version synthétique.' } };
    return structuredClone(status);
  };
  const context = vm.createContext({ document, AbortController, setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; }, clearTimeout(id) { timers.delete(id); }, window: { confirm: () => false } });
  vm.runInContext(source, context);
  const updates = context.initUpdates({ api });
  const fire = (id, type = 'click') => element(id).listeners[type]({ preventDefault() {} });
  return { element, document, calls, timers, updates, fire };
}

test('updates default to stable and keep installed channel separate from the selected channel', async () => {
  const f = fixture(); await f.updates.activate();
  assert.equal(f.element('updates-channel').value, 'stable');
  assert.match(f.element('updates-version').textContent, /2\.1\.0 · canal Stable/);
  f.element('updates-channel').value = 'beta'; await f.fire('updates-channel', 'change');
  assert.deepEqual(f.calls.find(call => call.body?.channel), { route: '/api/updates/preferences', body: { channel: 'beta' } });
  assert.equal(f.element('updates-channel').value, 'beta');
  assert.equal(f.element('updates-enabled').checked, false, 'changing the channel must not enable automatic checks');
  assert.match(f.element('updates-version').textContent, /canal Stable/);
  assert.match(f.element('updates-channel-note').textContent, /en cours d’essai/);
  assert.equal(f.calls.some(call => call.route === '/api/updates/install'), false);
});

test('a pending channel preference disables conflicting actions then rolls back on failure and restores focus', async () => {
  const saved = deferred(), f = fixture(route => route === '/api/updates/preferences' ? saved.promise : undefined);
  await f.updates.activate(); f.element('settings-view').hidden = false; f.element('settings-page-maintenance').hidden = false;
  const select = f.element('updates-channel'); select.focus(); select.value = 'beta';
  const request = f.fire('updates-channel', 'change');
  assert.equal(select.value, 'beta');
  for (const id of ['updates-channel', 'updates-enabled', 'updates-check', 'updates-install']) assert.equal(f.element(id).disabled, true, id);
  f.document.activeElement = f.document.body;
  await f.updates.refresh(); assert.equal(f.calls.filter(call => call.route === '/api/updates').length, 1);
  saved.reject(Object.assign(new Error('Canal non enregistré. Réessaie.'), { status: 503 })); await request;
  assert.equal(select.value, 'stable'); assert.equal(select.disabled, false);
  assert.match(f.element('updates-error').textContent, /Canal non enregistré/);
  assert.equal(f.document.activeElement, select);
});

test('late status reads cannot restore a candidate from the previous channel', async () => {
  const old = deferred(); let reads = 0;
  const prior = { ...initial(), candidate: { version: '2.1.1', channel: 'stable' } };
  const f = fixture(route => route === '/api/updates' && ++reads === 2 ? old.promise : undefined, prior);
  await f.updates.activate(); const refresh = f.updates.refresh();
  f.element('updates-channel').value = 'beta'; await f.fire('updates-channel', 'change');
  old.resolve(prior); await refresh;
  assert.equal(f.element('updates-channel').value, 'beta');
  assert.equal(f.element('updates-candidate').hidden, true);
  await f.fire('updates-check');
  assert.match(f.element('updates-candidate-title').textContent, /2\.2\.0-beta\.1 · Bêta/);
});

test('returning from an installed beta explains waiting for a newer stable without installing', async () => {
  const f = fixture(undefined, { ...initial(), currentVersion: '2.2.0-beta.1', installedChannel: 'beta', channel: 'beta' });
  await f.updates.activate(); f.element('updates-channel').value = 'stable'; await f.fire('updates-channel', 'change');
  assert.match(f.element('updates-version').textContent, /canal Bêta/);
  assert.equal(f.element('updates-channel').value, 'stable');
  assert.match(f.element('updates-channel-note').textContent, /version stable plus récente/);
  assert.equal(f.calls.some(call => call.route === '/api/updates/install'), false);
});

test('channel replies arriving after logout cannot repopulate the update controls', async () => {
  const saved = deferred(), f = fixture(route => route === '/api/updates/preferences' ? saved.promise : undefined);
  await f.updates.activate(); f.element('updates-channel').value = 'beta'; const request = f.fire('updates-channel', 'change');
  f.updates.stop(); saved.resolve({ ...initial(), channel: 'beta' }); await request;
  assert.equal(f.element('updates-channel').value, 'stable'); assert.equal(f.element('updates-channel').disabled, true);
  assert.equal(f.element('updates-badge').hidden, true); assert.equal(f.timers.size, 0);
});

test('the channel stays available during background checks and their status receives a short poll', async () => {
  const f = fixture(route => route === '/api/updates/preferences' ? { ...initial(), channel: 'beta', checking: true } : undefined, { ...initial(), checking: true });
  await f.updates.activate(); assert.equal(f.element('updates-channel').disabled, false);
  f.element('updates-channel').value = 'beta'; await f.fire('updates-channel', 'change');
  assert.equal(f.element('updates-channel').value, 'beta');
  assert.equal(f.element('updates-channel').disabled, false);
  assert.equal([...f.timers.values()].at(-1).delay, 1500);
});

test('a delayed channel save cannot take focus back after leaving maintenance', async () => {
  const saved = deferred(), f = fixture(route => route === '/api/updates/preferences' ? saved.promise : undefined);
  await f.updates.activate(); f.element('settings-view').hidden = false;
  const select = f.element('updates-channel'); select.focus(); select.value = 'beta';
  const request = f.fire('updates-channel', 'change');
  f.element('settings-page-maintenance').hidden = true;
  const reading = f.element('draft-duration'); reading.focus();
  saved.resolve({ ...initial(), channel: 'beta' }); await request;
  assert.equal(f.document.activeElement, reading);
  assert.equal(select.value, 'beta');
});
