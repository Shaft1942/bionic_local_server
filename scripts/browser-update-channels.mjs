// Development-only update-channel journey. Every API and effect is synthetic.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href)
  : await import('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const origin = 'http://bionic.test', results = [];

function fixture() {
  const calls = [], models = [{ id: 'synthetic-model', name: 'Modèle synthétique', type: 'llm', tools: true, loaded: true, loadedInstances: [], contextLength: 16384 }];
  let updates = { currentVersion: '2.1.0', channel: 'stable', installedChannel: 'stable', enabled: false, candidate: null, lastCheckedAt: null, ignoredVersion: null, canInstall: false, installation: { status: 'idle' } };
  let failPreference = false, holdPreference = false, releasePreference = null;
  const snapshot = () => structuredClone(updates);
  async function respond(url, method, input) {
    calls.push({ route: url.pathname, method, input: structuredClone(input) });
    if (url.pathname === '/api/ping') return { app: 'bionic-mobile-local', version: updates.currentVersion, instanceId: '11111111-1111-4111-8111-111111111111' };
    if (url.pathname === '/api/status') return { ok: true, models, addresses: [] };
    if (url.pathname === '/api/models') return { models, generationActive: false };
    if (url.pathname === '/api/projects') return { projects: [{ id: 'synthetic-updates', name: 'Projet synthétique', sessionsCount: 0 }] };
    if (url.pathname === '/api/sessions') return { sessions: [], warnings: [], partial: false };
    if (url.pathname === '/api/activity') return { events: [], warnings: [] };
    if (url.pathname === '/api/model-preferences') return { automatic: true, maxOutputTokens: 8192, contextLength: 16384, source: 'auto', model: models[0].id };
    if (url.pathname === '/api/comfy/settings') return { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo', workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }], activeJobs: 0 };
    if (url.pathname === '/api/comfy/loras') return { loras: [], checkedAt: Date.now() };
    if (url.pathname === '/api/security/status') return { mode: 'http', epoch: 1, server: null, authority: null, devices: [] };
    if (url.pathname === '/api/capabilities') return { items: [] };
    if (url.pathname === '/api/updates') return snapshot();
    if (url.pathname === '/api/updates/preferences') {
      if (failPreference) { failPreference = false; return { httpError: 'Le canal n’a pas été enregistré. Réessaie.' }; }
      const apply = () => { updates = { ...updates, ...input }; if (Object.hasOwn(input, 'channel')) updates = { ...updates, candidate: null, lastCheckedAt: null, checking: false }; return snapshot(); };
      if (holdPreference) { holdPreference = false; return new Promise(resolve => { releasePreference = () => { releasePreference = null; resolve(apply()); }; }); }
      return apply();
    }
    if (url.pathname === '/api/updates/check') {
      updates.lastCheckedAt = Date.now();
      updates.candidate = updates.channel === 'beta' ? { version: '2.2.0-beta.1', channel: 'beta', notes: 'Version synthétique en cours d’essai.', publishedAt: '2026-10-23T10:00:00Z' } : null;
      return snapshot();
    }
    throw Error('Route synthétique manquante : ' + method + ' ' + url.pathname);
  }
  return { calls, respond, checkInProgress() { updates.checking = true; }, failNextPreference() { failPreference = true; }, holdNextPreference() { holdPreference = true; }, get held() { return !!releasePreference; }, release() { assert(releasePreference); releasePreference(); }, installBeta() { updates = { ...updates, currentVersion: '2.2.0-beta.1', installedChannel: 'beta', candidate: null }; } };
}

async function openUpdates(page) {
  await page.locator('#settings-open-sidebar').click();
  const maintenance = page.locator('button[data-settings-page="maintenance"]');
  if (!(await maintenance.isVisible())) await page.locator('#settings-back').click();
  await maintenance.click();
  await page.locator('#updates-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#updates-channel').disabled);
}
async function ready(page, channel) {
  await page.waitForFunction(value => { const select = document.querySelector('#updates-channel'); return select.value === value && !select.disabled; }, channel);
}
async function capture(page, width, name) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'page overflow ' + width);
  assert.equal(await page.locator('#updates-dialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'update section overflow ' + width);
  if (captures) await page.screenshot({ path: path.join(captures, width + '-update-channels-' + name + '.png') });
}

try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({locale:'fr-FR', viewport: { width, height: 900 } }), page = await context.newPage();
    const api = fixture(), errors = [], outbound = [];
    page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { outbound.push(url.origin + url.pathname); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        try {
          const data = await api.respond(url, request.method(), request.postData() ? JSON.parse(request.postData()) : null);
          return route.fulfill({ status: data.httpError ? 503 : 200, contentType: 'application/json', body: JSON.stringify(data.httpError ? { error: data.httpError } : data) });
        } catch (error) { errors.push(error.message); return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js|[a-z0-9.-]+)$/i.test(file)) return route.abort();
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', file)) });
    });
    try {
      await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' }); await openUpdates(page);
      assert.equal(await page.locator('#updates-dialog').evaluate(el => el.tagName === 'SECTION' && !!el.closest('#settings-page-maintenance')), true, 'updates are part of settings');
      const select = page.getByRole('combobox', { name: 'Canal de publication', exact: true });
      assert.equal(await select.inputValue(), 'stable');
      assert.match(await page.locator('#updates-version').textContent(), /2\.1\.0 · canal Stable/);
      assert.equal(await page.locator('#updates-enabled').isChecked(), false);
      assert.match(await page.locator('#updates-channel-scope').textContent(), /tous les appareils connectés/);
      await capture(page, width, 'stable');

      await page.locator('#settings-close').click(); api.checkInProgress(); await openUpdates(page);
      await page.waitForFunction(() => document.querySelector('#updates-status').textContent === 'Vérification en cours…');
      assert.equal(await select.isEnabled(), true, 'a slow background check must not block channel selection');

      api.holdNextPreference(); await select.focus(); await select.selectOption('beta');
      await page.waitForFunction(() => document.querySelector('#updates-channel').disabled);
      assert.equal(api.held, true); assert.equal(await page.locator('#updates-check').isDisabled(), true);
      assert.equal(await page.locator('#updates-enabled').isDisabled(), true);
      assert.equal(await select.inputValue(), 'beta'); api.release(); await ready(page, 'beta');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'updates-channel');
      assert.equal(await page.locator('#updates-candidate').isVisible(), false);
      assert.equal(await page.locator('#updates-enabled').isChecked(), false);
      assert.match(await page.locator('#updates-channel-note').textContent(), /en cours d’essai/);
      await page.locator('#updates-check').click(); await page.locator('#updates-candidate').waitFor({ state: 'visible' });
      assert.match(await page.locator('#updates-candidate-title').textContent(), /2\.2\.0-beta\.1 · Bêta/);
      assert.equal(await page.locator('#updates-badge').isVisible(), true);
      assert.equal(await page.locator('#settings-open-sidebar').evaluate(el => el.classList.contains('update-available')), false, 'updates never add an indicator to the sidebar bar');
      assert.equal(await page.locator('#settings-maintenance-nav').evaluate(el => el.classList.contains('update-available')), true, 'available version is signalled only inside settings');
      assert.equal(await page.locator('#updates-install').isDisabled(), true); await capture(page, width, 'beta');

      api.failNextPreference(); await select.focus(); await select.selectOption('stable');
      await page.locator('#updates-error').waitFor({ state: 'visible' }); await ready(page, 'beta');
      assert.match(await page.locator('#updates-error').textContent(), /n’a pas été enregistré/);
      assert.equal(await page.locator('#updates-candidate').isVisible(), true, 'failed preference keeps the previous candidate');
      await select.selectOption('stable'); await ready(page, 'stable');
      assert.equal(await page.locator('#updates-candidate').isVisible(), false, 'channel change invalidates the previous candidate');
      assert.equal(await page.locator('#updates-badge').isVisible(), false);
      assert.equal(await page.locator('#settings-open-sidebar').evaluate(el => el.classList.contains('update-available')), false, 'changing channel clears the old available badge');
      await page.locator('#settings-close').click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-open-sidebar');

      api.installBeta(); await openUpdates(page); await page.waitForFunction(() => document.querySelector('#updates-version').textContent.includes('2.2.0-beta.1')); await ready(page, 'stable');
      assert.match(await page.locator('#updates-version').textContent(), /2\.2\.0-beta\.1 · canal Bêta/);
      assert.match(await page.locator('#updates-channel-note').textContent(), /version stable plus récente/);
      await capture(page, width, 'return-stable');
      await page.locator('#updates-channel').press('Escape');
      assert.equal(await page.locator('#settings-view').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'settings-open-sidebar');
      assert.equal(api.calls.some(call => call.route === '/api/updates/install'), false);
      assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
      results.push({ width, passed: true, checks: ['stable default', 'PC scope', 'change during background check', 'pending state', 'beta choice', 'manual check', 'failure rollback', 'candidate invalidation', 'stable return after beta', 'keyboard and focus', 'no overflow'] });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode: 'synthetic browser only', results, limitations: ['Aucune installation, publication ou requête vers une instance active.', 'Viewports simulés : aucun téléphone physique, lecteur d’écran ou réseau réel.'] }, null, 2));
} finally { await browser.close(); }
