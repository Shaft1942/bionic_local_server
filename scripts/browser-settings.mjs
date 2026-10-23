// Development-only settings journeys: all data, requests and effects are synthetic.
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
const origin = 'http://bionic.test', projectId = 'settings-project';
const chatA = 'web-11111111-1111-4111-8111-111111111111', chatB = 'web-22222222-2222-4222-8222-222222222222', nativeId = 'native-settings-history';
const pages = ['reading', 'models', 'tools', 'images', 'connection', 'maintenance'];
const fakePassphrase = 'FAKE-CERT-ONLY-NOT-A-REAL-CREDENTIAL';
const tick = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

function fixture() {
  const defaults = new Map([['settings-a', 12000], ['settings-b', 9000]]), calls = [], sends = [], writes = [], checks = [], failures = new Map();
  const chats = new Map([
    [chatA, { id: chatA, projectId, name: 'Chat A synthétique', source: 'web', model: 'settings-a', fileProfile: 'none', outputPreferencesByModel: { 'settings-a': null }, messages: [{ id: 'reply-a', role: 'assistant', text: 'Conversation synthétique A.', complete: true }], generation: { status: 'completed' } }],
    [chatB, { id: chatB, projectId, name: 'Chat B synthétique', source: 'web', model: 'settings-a', fileProfile: 'read', outputPreferencesByModel: { 'settings-a': 4000 }, messages: [{ id: 'reply-b', role: 'assistant', text: 'Conversation synthétique B.', complete: true }], generation: { status: 'completed' } }],
    [nativeId, { id: nativeId, projectId, name: 'Historique Bionic synthétique', source: 'bionic', model: 'settings-a', readOnly: true, messages: [{ id: 'reply-native', role: 'assistant', text: 'Historique natif de fixture en lecture seule.', fromBionic: true, complete: true }] }],
  ]);
  const models = [{ id: 'settings-a', name: 'Modèle A synthétique', type: 'llm', tools: true, vision: true, loaded: true, contextLength: 16384, loadedInstances: [{ id: 'instance-settings-a', contextLength: 16384 }], reasoning: { allowedOptions: ['low', 'high'], default: 'low' } }, { id: 'settings-b', name: 'Modèle B sans effort', type: 'llm', tools: false, loaded: false, contextLength: null, loadedInstances: [], reasoning: null }];
  let comfy = { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo', activeJobs: 0, loraProfiles: { krea2_turbo: [{ name: 'synthetic/krea.safetensors', strength: 0.5 }], hassaku_illustrious: [{ name: 'synthetic/hassaku.safetensors', strength: 1 }] }, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }, { id: 'hassaku_illustrious', label: 'Hassaku XL Illustrious v34' }] };
  const security = { mode: 'https', server: { fingerprint: 'SYNTHETIC-SERVER-FINGERPRINT', hosts: ['bionic.test'], expiresAt: new Date(Date.now() + 86400000).toISOString() }, authority: { fingerprint: 'SYNTHETIC-AUTHORITY-FINGERPRINT', expiresAt: new Date(Date.now() + 86400000).toISOString() }, devices: [{ id: 'device-current', name: 'Appareil courant fictif', fingerprint: 'SYNTHETIC-DEVICE-A', expiresAt: new Date(Date.now() + 86400000).toISOString() }, { id: 'device-other', name: 'Autre appareil fictif', fingerprint: 'SYNTHETIC-DEVICE-B', expiresAt: new Date(Date.now() + 86400000).toISOString() }], web: { csrfToken: 'synthetic-csrf-for-settings-fixture', canConfigure: true, canIssueDevice: true, currentDeviceId: 'device-current', suggestedHosts: ['bionic.test'], proofPortProvisioned: true } };
  let updates = { currentVersion: '2.1.0', enabled: true, ignoredVersion: null, candidate: { version: '2.2.0', notes: 'Version synthétique : aucune installation réelle.', publishedAt: new Date().toISOString() }, canInstall: false, unavailableReason: 'Installation automatique indisponible dans cette fixture.', installation: { status: 'idle' }, lastCheckedAt: Date.now() };
  let holdNextPreference = false, heldPreference, releasePreference, holdNextDiagnostic = false, heldDiagnostic = false, releaseDiagnostic, holdNextIssue = false, heldIssue = false, releaseIssue;
  function resolvePreference(input) {
    const chat = chats.get(input.id), stored = chat?.source === 'web' ? chat.outputPreferencesByModel || {} : {}, configured = Object.hasOwn(stored, input.model), global = defaults.get(input.model) ?? null;
    const value = configured ? stored[input.model] : global;
    return { model: input.model, contextLength: models.find(model => model.id === input.model)?.contextLength ?? null, autoMaxOutputTokens: 8192, modelMaxOutputTokens: global, sessionMaxOutputTokens: configured ? stored[input.model] : null, sessionConfigured: configured, automatic: value === null, maxOutputTokens: value ?? 8192, source: configured ? 'session' : global !== null ? 'model' : 'auto', applyToAllSessions: !configured && global !== null };
  }
  async function respond(url, method, input) {
    calls.push({ route: url.pathname, method, input: structuredClone(input), query: Object.fromEntries(url.searchParams) });
    if (failures.has(url.pathname)) { const value = failures.get(url.pathname); failures.delete(url.pathname); return { httpError: value }; }
    if (url.pathname === '/api/status') return { ok: true, models, addresses: ['http://bionic.test'] };
    if (url.pathname === '/api/models') return { models, generationActive: false };
    if (url.pathname === '/api/projects') return { projects: [{ id: projectId, name: 'Projet synthétique paramètres', sessionsCount: chats.size }] };
    if (url.pathname === '/api/sessions') return { sessions: [...chats.values()].map(chat => ({ ...chat, messages: undefined })), warnings: [], partial: false };
    if (url.pathname === '/api/conversation') return chats.get(url.searchParams.get('id'));
    if (url.pathname === '/api/activity') return { events: [], warnings: [] };
    if (url.pathname === '/api/ping') return { app: 'bionic-mobile-local', version: '2.1.0', instanceId: '33333333-3333-4333-8333-333333333333' };
    if (url.pathname === '/api/model-preferences') {
      const target = input || Object.fromEntries(url.searchParams);
      if (input) {
        writes.push({ type: 'output', ...input }); const chat = chats.get(input.id);
        if (input.applyToAllSessions) { if (input.maxOutputTokens === null) defaults.delete(input.model); else defaults.set(input.model, input.maxOutputTokens); if (chat?.source === 'web') delete chat.outputPreferencesByModel?.[input.model]; }
        else { assert.equal(chat?.source, 'web'); (chat.outputPreferencesByModel ||= {})[input.model] = input.maxOutputTokens; }
      }
      const value = resolvePreference(target);
      if (!input && holdNextPreference) { holdNextPreference = false; heldPreference = true; return new Promise(resolve => { releasePreference = () => { heldPreference = false; resolve(value); }; }); }
      return value;
    }
    if (url.pathname === '/api/comfy/settings') { if (input) { writes.push({ type: 'comfy', ...input }); comfy = { ...comfy, ...structuredClone(input) }; } return comfy; }
    if (url.pathname === '/api/comfy/loras') return { loras: ['synthetic/krea.safetensors', 'synthetic/hassaku.safetensors', 'synthetic/detail.safetensors'], checkedAt: Date.now() };
    if (url.pathname === '/api/comfy/check') { checks.push(input); return { ok: true, reachable: true, workflows: [{ id: input.workflowId, compatible: true, errors: [] }] }; }
    if (url.pathname === '/api/security/status') return security;
    if (url.pathname === '/api/security/actions') {
      writes.push({ type: 'security', ...input });
      if (input.action === 'issue-device') { security.devices.push({ id: 'device-issued-' + security.devices.length, name: input.name, fingerprint: 'SYNTHETIC-ISSUED', expiresAt: new Date(Date.now() + 86400000).toISOString() }); const issued = { exportId: 'synthetic-export', passphrase: fakePassphrase, expiresAt: new Date(Date.now() + 300000).toISOString() }; if (holdNextIssue) { holdNextIssue = false; heldIssue = true; return new Promise(resolve => { releaseIssue = () => { heldIssue = false; resolve(issued); }; }); } return issued; }
      throw Error('Action de certificat inattendue : ' + input.action);
    }
    if (url.pathname === '/api/updates') return updates;
    if (url.pathname === '/api/updates/preferences') { writes.push({ type: 'updates', ...input }); updates = { ...updates, enabled: input.enabled }; return updates; }
    if (url.pathname === '/api/updates/check') return updates;
    if (url.pathname === '/api/diagnostics') { const result = { synthetic: true, checks: { server: 'fixture', model: 'not called' } }; if (holdNextDiagnostic) { holdNextDiagnostic = false; heldDiagnostic = true; return new Promise(resolve => { releaseDiagnostic = () => { heldDiagnostic = false; resolve(result); }; }); } return result; }
    if (url.pathname === '/api/capabilities') return { items: [{ name: 'Fichiers', description: 'Selon le projet et les autorisations du prochain envoi.' }, { name: 'Mémoire et contexte', description: 'Informations de fixture ; réglages de chargement dans Bionic.' }, { name: 'Scripts', description: 'Code exact avec accord, droits du compte PC.' }] };
    if (url.pathname === '/api/chat') {
      sends.push(input); const id = 'web-44444444-4444-4444-8444-444444444444';
      if (input.outputPreferences?.applyToAllSessions) throw Error('Pending local preference unexpectedly became global');
      const created = { id, projectId, name: 'Suite web synthétique', source: 'web', model: input.model, fileProfile: input.fileProfile, outputPreferencesByModel: input.outputPreferences ? { [input.model]: input.outputPreferences.maxOutputTokens } : {}, messages: [{ id: 'sent-user', role: 'user', text: input.text, requestId: input.requestId }, { id: 'sent-reply', role: 'assistant', text: 'Suite synthétique reçue.', complete: true, requestId: input.requestId }], generation: { status: 'completed', requestId: input.requestId, replyId: 'sent-reply' } }; chats.set(id, created);
      return { ndjson: [{ type: 'start', id, name: created.name, requestId: input.requestId, replyId: 'sent-reply' }, { type: 'delta', text: 'Suite synthétique reçue.' }, { type: 'done', id, replyId: 'sent-reply' }] };
    }
    if (url.pathname === '/api/chat-request') return { id: 'web-44444444-4444-4444-8444-444444444444', projectId, status: 'completed' };
    if (url.pathname === '/api/logout') return { ok: true };
    if (url.pathname === '/api/login') return { ok: true };
    throw Error('Route synthétique manquante : ' + method + ' ' + url.pathname);
  }
  return { calls, writes, checks, sends, chats, defaults, failures, respond, get comfy() { return comfy; }, get heldPreference() { return heldPreference; }, holdPreference() { holdNextPreference = true; }, releasePreference() { assert(releasePreference); releasePreference(); releasePreference = null; }, get heldDiagnostic() { return heldDiagnostic; }, holdDiagnostic() { holdNextDiagnostic = true; }, releaseDiagnostic() { assert(releaseDiagnostic); releaseDiagnostic(); releaseDiagnostic = null; }, get heldIssue() { return heldIssue; }, holdIssue() { holdNextIssue = true; }, releaseIssue() { assert(releaseIssue); releaseIssue(); releaseIssue = null; } };
}

async function openSettings(page, section = 'reading') {
  if (!(await page.locator('#settings-view').isVisible())) {
    if (await page.locator('#settings-open-sidebar').isVisible()) await page.locator('#settings-open-sidebar').click();
    else { await page.locator('#conversation-options-toggle').click(); await page.locator('#settings-open').click(); }
  }
  await navigate(page, section);
}
async function navigate(page, section) {
  const target = page.locator('button[data-settings-page="' + section + '"]').first();
  if (!(await target.isVisible())) await page.locator('#settings-back').click();
  await target.click(); await page.locator('#settings-page-' + section).waitFor({ state: 'visible' });
}
async function chooseChat(page, id) {
  if (await page.locator('#settings-view').isVisible()) await page.locator('#settings-close').click();
  if (await page.locator('#back').isVisible()) await page.locator('#back').click();
  await page.locator('.session[data-session-id="' + id + '"]').click(); await page.locator('#thread-title').getByText(id === chatA ? 'Chat A synthétique' : id === chatB ? 'Chat B synthétique' : 'Historique Bionic synthétique', { exact: true }).waitFor();
}
async function outputReady(page) { await page.waitForFunction(() => !document.querySelector('#output-save').disabled && /chargé|envoi/.test(document.querySelector('#output-current').textContent)); }
async function comfyReady(page) { await page.waitForFunction(() => document.querySelector('#comfy-workflow').options.length === 2 && !document.querySelector('#comfy-result').textContent.startsWith('Chargement')); }
async function search(page, value) { if (!(await page.locator('#settings-search').isVisible())) await page.locator('#settings-back').click(); await page.locator('#settings-search').fill(value); }
async function capture(page, width, name) { if (captures) await page.screenshot({ path: path.join(captures, width + '-settings-' + name + '.png') }); }
async function dirtyDecision(page, choice) { await page.locator('#settings-unsaved').waitFor({ state: 'visible' }); await page.locator('#settings-unsaved-' + choice).click(); }
const results = [];

try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
    const page = await context.newPage(), api = fixture(), errors = [], outbound = [];
    page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { outbound.push(url.origin + url.pathname); return route.abort(); }
      if (url.pathname.startsWith('/api/')) {
        try {
          const input = request.postData() ? JSON.parse(request.postData()) : null, data = await api.respond(url, request.method(), input);
          if (data?.httpError) return route.fulfill({ status: data.httpError.status || 503, contentType: 'application/json', body: JSON.stringify({ error: data.httpError.message }) });
          return route.fulfill({ contentType: data?.ndjson ? 'application/x-ndjson' : 'application/json', body: data?.ndjson ? data.ndjson.map(event => JSON.stringify(event) + '\n').join('') : JSON.stringify(data) });
        } catch (error) { errors.push(error.message); return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[a-z0-9.-]+$/i.test(file)) return route.abort();
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', file)) });
    });
    const started = performance.now();
    try {
      await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' }); await chooseChat(page, chatA);
      // Shortcuts opened from the mobile project list must expose their canonical target.
      for (const [section, control] of [['models', 'settings-edit-model'], ['tools', 'settings-edit-tools'], ['images', 'settings-edit-image'], ['maintenance', 'settings-help']]) {
        if (await page.locator('#back').isVisible()) await page.locator('#back').click();
        await openSettings(page, section); await page.locator('#' + control).click(); assert.equal(await page.locator('#settings-view').isVisible(), false);
        assert.equal(await page.locator('#prompt').isVisible(), true, 'shortcut opens the conversation from the project list');
        assert.equal(await page.evaluate(() => document.activeElement.getClientRects().length > 0 && !document.activeElement.disabled), true, 'shortcut returns a visible, usable focus');
        if (control === 'settings-help') { await page.locator('#info').waitFor({ state: 'visible' }); await page.locator('#info-close').click(); }
        else if (await page.locator('#composer-files').getAttribute('open') !== null) await page.locator('#files-menu-toggle').press('Escape');
      }
      await openSettings(page); assert.equal(await page.locator('#settings-close').isVisible(), true);
      if (width === 320 || width === 1280) { if (width === 320) await page.locator('#settings-back').click(); await capture(page, width, 'index'); if (width === 320) await navigate(page, 'reading'); }
      // Inventory controls retain one canonical instance; metadata and actions remain scoped.
      const locations = { reading: ['draft-duration', 'draft-download', 'draft-clear'], models: ['settings-model', 'output-mode', 'output-tokens', 'output-tokens-slider', 'output-all-sessions', 'output-save', 'settings-models-loaded', 'settings-edit-model'], tools: ['settings-edit-tools'], images: ['comfy-enabled', 'comfy-url', 'comfy-workflow', 'comfy-lora-1', 'comfy-lora-2', 'comfy-lora-1-strength', 'comfy-lora-2-strength', 'comfy-loras-refresh', 'comfy-test', 'comfy-save', 'settings-edit-image'], connection: ['certificate-refresh', 'certificate-hosts', 'certificate-prepare', 'certificate-ca-download', 'certificate-proof', 'certificate-cancel', 'certificate-device-name', 'certificate-issue', 'certificate-download', 'certificate-export-clear', 'certificate-mtls', 'certificate-revoke-yes', 'certificate-revoke-no'], maintenance: ['diagnostics-open', 'diagnostics-result', 'updates-open', 'settings-capabilities'] };
      for (const section of pages) {
        await navigate(page, section); assert.equal(await page.locator('#settings-page-' + section).isVisible(), true);
        for (const id of locations[section]) { assert.equal(await page.locator('#' + id).count(), 1, 'one canonical #' + id); assert.equal(await page.locator('#' + id).evaluate((el, expected) => el.closest('[data-settings-section]')?.id === 'settings-page-' + expected, section), true, '#' + id + ' destination'); }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'overflow ' + section + ' ' + width);
      }
      // Search uses a local catalog, with scope and keyboard activation of the destination.
      await search(page, 'tokens'); const tokenResult = page.locator('#settings-results button').first(); await tokenResult.waitFor();
      if (width === 320 || width === 1280) await capture(page, width, 'search');
      assert.match(await tokenResult.textContent(), /conversation|chat|modèle/i, 'scope is present in result'); await tokenResult.focus(); await tokenResult.press('Enter');
      assert.equal(await page.locator('#settings-page-models').isVisible(), true); assert.equal(await page.evaluate(() => !!document.activeElement.closest('#settings-page-models')), true, 'search focuses its setting');
      for (const term of ['lora', 'certificat', 'brouillon', 'diagnostic', 'permissions']) { await search(page, term); assert(await page.locator('#settings-results button').count() > 0, 'search synonym ' + term); }
      await search(page, 'lora'); await page.locator('#settings-results').getByRole('button', { name: /^LoRA et forces/ }).click(); await tick(page);
      assert.equal(await page.evaluate(() => { const active = document.activeElement, viewport = document.querySelector('.settings-body').getBoundingClientRect(), rect = active.getBoundingClientRect(); return active.id === 'comfy-lora-1' && rect.top >= viewport.top - 1 && rect.bottom <= viewport.bottom + 1; }), true, 'search scrolls its focused setting into the visible page area');
      await search(page, 'certificat appareil'); await page.locator('#settings-results').getByRole('button', { name: /^Certificat de cet appareil/ }).click(); await page.locator('#settings-page-connection').waitFor({ state: 'visible' }); await tick(page);
      assert.equal(await page.evaluate(() => !!document.activeElement.closest('#settings-page-connection') && document.activeElement.getClientRects().length > 0), true, 'a temporarily hidden certificate target falls back to a visible destination');
      await search(page, fakePassphrase); assert.equal(await page.locator('#settings-results button').count(), 0, 'search does not index secrets or field values');
      await search(page, ''); await navigate(page, 'models'); await outputReady(page);
      assert.equal(await page.locator('#output-mode').inputValue(), 'auto'); assert.equal(await page.locator('#output-all-sessions').inputValue(), 'session');
      assert.match(await page.locator('#output-origin').textContent(), /conversation|chat/i); assert.match(await page.locator('#output-scope').textContent(), /Chat A/);
      assert.match(await page.locator('#output-effective').textContent(), /8.?192|8192/); assert.equal(api.defaults.get('settings-a'), 12000, 'explicit local auto does not inherit global manual');
      await page.locator('#settings-models-loaded').click(); await page.locator('#models-dialog').waitFor({ state: 'visible' }); await page.waitForFunction(() => document.querySelector('#models-list').textContent.includes('Modèle A')); await page.locator('#models-close').click(); assert.equal(await page.locator('#settings-page-models').isVisible(), true);
      await capture(page, width, 'models');
      // Dirty form guards cover navigation, continue, cancel, retain and discard.
      await page.locator('#output-mode').selectOption('manual'); await page.locator('#output-tokens').fill('1234'); await page.locator('#settings-model').selectOption('settings-b'); await dirtyDecision(page, 'continue'); assert.equal(await page.locator('#settings-model').inputValue(), 'settings-a'); assert.equal(await page.locator('#output-tokens').inputValue(), '1234'); await page.locator('#output-tokens').press('Escape'); await dirtyDecision(page, 'continue');
      assert.equal(await page.locator('#settings-view').isVisible(), true); assert.equal(await page.locator('#output-tokens').inputValue(), '1234'); assert.equal(api.writes.length, 0);
      await page.locator('#output-cancel').click(); assert.equal(await page.locator('#output-mode').inputValue(), 'auto');
      await page.locator('#output-mode').selectOption('manual'); await page.locator('#output-tokens').fill('2345'); await page.locator('#settings-close').click(); await dirtyDecision(page, 'keep');
      assert.equal(await page.locator('#settings-view').isVisible(), false); await openSettings(page, 'models'); await outputReady(page); assert.equal(await page.locator('#output-tokens').inputValue(), '2345');
      await page.locator('#settings-close').click(); await dirtyDecision(page, 'discard'); await openSettings(page, 'models'); await outputReady(page); assert.equal(await page.locator('#output-mode').inputValue(), 'auto');
      await page.locator('#output-mode').selectOption('manual'); await page.locator('#output-tokens').fill('5000000'); assert.equal(await page.locator('#output-tokens-slider').inputValue(), '5000000');
      await page.locator('#output-all-sessions').selectOption('model'); await page.locator('#output-save').click(); await page.waitForFunction(() => document.querySelector('#output-result').textContent.startsWith('Défaut de ce modèle enregistré'));
      assert.equal(api.defaults.get('settings-a'), 5000000); assert.equal(Object.hasOwn(api.chats.get(chatA).outputPreferencesByModel, 'settings-a'), false, 'global save removes only current chat exception'); assert.equal(api.chats.get(chatB).outputPreferencesByModel['settings-a'], 4000);
      assert.equal(api.writes.at(-1).applyToAllSessions, true); assert.equal(api.writes.at(-1).id, chatA);
      await page.locator('#output-all-sessions').selectOption('session'); await page.locator('#output-mode').selectOption('auto'); await page.locator('#output-save').click(); await page.waitForFunction(() => document.querySelector('#output-result').textContent.startsWith('Réglage enregistré pour cette conversation'));
      assert.equal(api.chats.get(chatA).outputPreferencesByModel['settings-a'], null); assert.equal(api.defaults.get('settings-a'), 5000000);
      await chooseChat(page, chatB); await openSettings(page, 'models'); await outputReady(page); assert.equal(await page.locator('#output-tokens').inputValue(), '4000'); await page.locator('#settings-close').click();
      // The actual effort and sensitive permissions remain in the canonical composer.
      await openSettings(page, 'models'); await page.locator('#settings-edit-model').click(); assert.equal(await page.locator('#settings-view').isVisible(), false); assert.equal(await page.evaluate(() => document.activeElement.id), 'model');
      await page.locator('#model').selectOption('settings-b'); assert.equal(await page.locator('#effort').isDisabled(), true); assert.match(await page.locator('#effort-help').textContent(), /API|propose pas|indisponible/);
      await openSettings(page, 'tools'); await page.locator('#settings-edit-tools').click(); assert.equal(await page.locator('#composer-files').getAttribute('open'), ''); assert.equal(await page.locator('#agent-images').isDisabled(), true); await page.locator('#agent-files').selectOption('read'); await page.locator('#agent-web').check(); await page.locator('#agent-web-approval').check(); await page.locator('#agent-scripts').check(); await page.locator('#agent-scripts').press('Escape');
      const permissions = await page.evaluate(() => [document.querySelector('#agent-files').value, ...['agent-web', 'agent-web-approval', 'agent-scripts'].map(id => document.getElementById(id).checked)]); assert.deepEqual(permissions, ['read', true, true, true]);
      await openSettings(page, 'images'); await comfyReady(page);
      await page.locator('#comfy-enabled').check(); await page.locator('#comfy-workflow').selectOption('hassaku_illustrious'); await page.locator('#comfy-loras-refresh').click(); await page.waitForFunction(() => document.querySelector('#comfy-loras-status').textContent.includes('disponible'));
      await page.locator('#comfy-lora-1').selectOption('synthetic/hassaku.safetensors'); await page.locator('#comfy-lora-2').selectOption('synthetic/detail.safetensors'); await page.locator('#comfy-lora-1-strength').press('End');
      await page.locator('#comfy-workflow').selectOption('krea2_turbo'); assert.equal(await page.locator('#comfy-lora-1').inputValue(), 'synthetic/krea.safetensors'); assert.equal(await page.locator('#comfy-lora-1-strength').inputValue(), '0.5');
      await page.locator('#comfy-workflow').selectOption('hassaku_illustrious'); assert.equal(await page.locator('#comfy-lora-1-strength').inputValue(), '20'); assert.equal(await page.locator('#comfy-lora-2').inputValue(), 'synthetic/detail.safetensors');
      const writesBeforeCheck = api.writes.length; await page.locator('#comfy-test').click(); await page.waitForFunction(() => document.querySelector('#comfy-result').textContent.includes('Connexion confirmée')); assert.equal(api.checks.length, 1); assert.equal(api.writes.length, writesBeforeCheck, 'test never saves'); assert.equal(api.comfy.enabled, false);
      await capture(page, width, 'images'); await page.locator('#comfy-cancel').click(); assert.equal(await page.locator('#comfy-enabled').isChecked(), false); assert.equal(await page.locator('#comfy-workflow').inputValue(), 'krea2_turbo');
      await page.locator('#comfy-enabled').check(); await page.locator('#comfy-workflow').selectOption('hassaku_illustrious'); await page.locator('#comfy-lora-2').selectOption('synthetic/detail.safetensors'); await page.locator('#comfy-lora-1-strength').press('End'); await page.locator('#comfy-save').click(); await page.waitForFunction(() => document.querySelector('#comfy-result').textContent.startsWith('Configuration enregistrée'));
      assert.equal(api.comfy.enabled, true); assert.equal(api.comfy.loraProfiles.hassaku_illustrious[0].strength, 20); assert.equal(api.comfy.loraProfiles.hassaku_illustrious[1].name, 'synthetic/detail.safetensors'); assert.equal(api.comfy.loraProfiles.krea2_turbo[0].strength, 0.5);
      const writesAfterComfy = api.writes.length;
      api.failures.set('/api/comfy/check', { message: 'Erreur de connexion synthétique.' }); await page.locator('#comfy-test').click(); await page.waitForFunction(() => !document.querySelector('#comfy-error').hidden); assert.match(await page.locator('#comfy-error').textContent(), /synthétique/); assert.equal(api.writes.length, writesAfterComfy);
      await page.locator('#settings-edit-image').click(); assert.equal(await page.locator('#settings-view').isVisible(), false); assert.equal(await page.locator('#image-workflow').isVisible(), true); assert.equal(await page.locator('#agent-images').isChecked(), false, 'global ComfyUI activation does not grant image permission'); await page.locator('#image-workflow').press('Escape');
      // Browser-only drafts and maintenance effects are immediate, not undone by form cancel.
      await openSettings(page, 'reading'); await page.locator('#draft-duration').selectOption('3600000'); assert.match(await page.locator('#draft-status').textContent(), /cet appareil|conservés/); await capture(page, width, 'reading');
      await navigate(page, 'maintenance'); await page.locator('#diagnostics-open').click(); await page.locator('#diagnostics-result').getByText(/Diagnostic volontaire/).waitFor(); assert.equal(api.calls.filter(call => call.route === '/api/diagnostics').length, 1);
      await page.locator('#updates-open').click(); await page.locator('#updates-dialog').waitFor({ state: 'visible' }); assert.equal(await page.locator('#updates-install').isDisabled(), true); assert.match(await page.locator('#updates-unavailable').textContent(), /fixture/);
      assert.equal(await page.locator('#updates-enabled').isChecked(), true); await page.locator('#updates-enabled').click(); await page.waitForFunction(() => !document.querySelector('#updates-enabled').disabled && !document.querySelector('#updates-enabled').checked); assert.equal(api.writes.at(-1).type, 'updates'); assert.equal(api.writes.at(-1).enabled, false); await page.locator('#updates-close').click();
      const appliedWrites = api.writes.length; await navigate(page, 'images'); await page.locator('#comfy-url').fill('http://192.168.1.90:8188'); await page.locator('#comfy-cancel').click(); await navigate(page, 'maintenance'); await page.locator('#updates-open').click(); await page.locator('#updates-dialog').waitFor({ state: 'visible' }); assert.equal(await page.locator('#updates-enabled').isChecked(), false, 'form cancel cannot undo an applied update preference'); assert.equal(api.writes.length, appliedWrites); await page.locator('#updates-close').click();
      await navigate(page, 'connection'); await page.locator('#certificate-device-form').waitFor({ state: 'visible' }); assert.equal(await page.locator('#certificate-devices').getByRole('button', { name: 'Renouveler', exact: true }).count(), 2); assert.equal(await page.locator('#certificate-mtls').isVisible(), true);
      await page.locator('#certificate-devices').getByRole('button', { name: 'Retirer cet appareil', exact: true }).click(); assert.equal(await page.locator('#certificate-revoke-confirm').isVisible(), true); await page.locator('#certificate-revoke-no').click();
      await page.locator('#certificate-device-name').fill('Appareil éphémère de fixture'); await page.locator('#certificate-issue').click(); await page.waitForFunction(() => !document.querySelector('#certificate-export').hidden); assert.equal(await page.locator('#certificate-export-password').textContent(), fakePassphrase);
      await capture(page, width, 'connection'); await page.locator('#settings-close').click(); assert.equal(await page.locator('#certificate-export-password').textContent(), ''); assert.equal(await page.locator('#certificate-proof-csrf').inputValue(), '');
      assert.equal(await page.evaluate(secret => JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]).includes(secret), fakePassphrase), false);
      await openSettings(page, 'connection'); await page.locator('#certificate-device-form').waitFor({ state: 'visible' }); api.holdIssue(); await page.locator('#certificate-device-name').fill('Appareil tardif fictif'); await page.locator('#certificate-issue').click(); await page.waitForTimeout(30); assert.equal(api.heldIssue, true);
      await navigate(page, 'reading'); api.releaseIssue(); await tick(page); await page.waitForTimeout(60); assert.equal(await page.locator('#certificate-export-password').textContent(), '', 'a late certificate action cannot restore its export on a hidden page'); assert.equal(await page.evaluate(() => !!document.activeElement.closest('#settings-page-reading') && document.activeElement.getClientRects().length > 0), true, 'late certificate action cannot steal focus back to hidden connection controls');
      await page.locator('#settings-close').click();
      // A late GET from an old view must not overwrite the new view or its focus.
      api.holdPreference(); await openSettings(page, 'models'); await page.waitForFunction(() => !document.querySelector('#settings-view').hidden); await page.waitForTimeout(30); assert.equal(api.heldPreference, true); await page.locator('#settings-close').click();
      api.defaults.set('settings-b', 7777); await openSettings(page, 'images'); await outputReady(page); await page.locator('#comfy-url').focus(); api.releasePreference(); await tick(page); await page.waitForTimeout(60); assert.equal(await page.evaluate(() => document.activeElement.id), 'comfy-url'); assert.equal(await page.locator('#output-tokens').inputValue(), '7777', 'old GET cannot replace the newer saved model value');
      // New/native conversation-only values stay pending in this tab until first send.
      await page.locator('#settings-close').click(); if (await page.locator('#back').isVisible()) await page.locator('#back').click(); await page.locator('#new-chat').click(); await page.locator('#model').selectOption('settings-a');
      await openSettings(page, 'models'); await outputReady(page); const beforePending = api.writes.length; await page.locator('#output-mode').selectOption('manual'); await page.locator('#output-tokens').fill('321'); await page.locator('#output-all-sessions').selectOption('session'); await page.locator('#output-save').click(); await page.waitForFunction(() => document.querySelector('#output-result').textContent.includes('envoi'));
      assert.equal(api.writes.length, beforePending); await page.locator('#settings-close').click(); assert.equal(await page.evaluate(() => companionSettings.decorate({ model: 'settings-a' }).outputPreferences.maxOutputTokens), 321);
      await chooseChat(page, nativeId); await openSettings(page, 'models'); await outputReady(page); assert.equal(await page.locator('#output-tokens').inputValue(), '5000000', 'new-chat pending preference must not leak into native history');
      await page.locator('#output-mode').selectOption('manual'); await page.locator('#output-tokens').fill('654'); await page.locator('#output-all-sessions').selectOption('session'); await page.locator('#output-save').click(); await page.waitForFunction(() => document.querySelector('#output-result').textContent.includes('envoi')); assert.equal(api.writes.length, beforePending); await page.locator('#settings-close').click();
      await page.locator('#prompt').fill('Suite web de l’historique synthétique.'); await page.locator('#send').click(); await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('Suite synthétique reçue.')); assert.equal(api.sends.length, 1); assert.equal(api.sends[0].outputPreferences.maxOutputTokens, 654); assert.equal(api.chats.get(nativeId).outputPreferencesByModel, undefined);
      await openSettings(page, 'maintenance'); await capture(page, width, 'maintenance');
      api.holdDiagnostic(); await page.locator('#diagnostics-open').click(); await page.waitForTimeout(30); assert.equal(api.heldDiagnostic, true); await page.locator('#settings-close').click(); if (await page.locator('#back').isVisible()) await page.locator('#back').click(); await page.locator('#logout').click(); await page.locator('#login').waitFor({ state: 'visible' });
      await page.locator('#code').fill('synthetic-login-only'); await page.locator('#login-button').click(); await page.locator('#app').waitFor({ state: 'visible' }); api.releaseDiagnostic(); await tick(page); await page.waitForTimeout(60);
      assert.equal(await page.locator('#diagnostics-result').textContent(), '', 'old diagnostic cannot repopulate a new authenticated session');
      await openSettings(page, 'maintenance'); await search(page, ''); await page.locator('#settings-search').focus(); await page.locator('#settings-search').press('Escape'); assert.equal(await page.locator('#settings-view').isVisible(), false); assert.equal(await page.evaluate(() => ['settings-open', 'settings-open-sidebar', 'conversation-options-toggle'].includes(document.activeElement.id) && document.activeElement.getClientRects().length > 0), true, 'focus returns to a visible opener');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(outbound, []); assert.deepEqual(errors, []);
      results.push({ width, passed: true, writes: api.writes.length, comfyChecks: api.checks.length, sends: api.sends.length, pages: pages.length, durationMs: Math.round(performance.now() - started) });
    } catch (error) {
      if (captures) await page.screenshot({ path: path.join(captures, width + '-settings-failure.png') }).catch(() => {});
      throw new Error('Paramètres synthétiques ' + width + ' px : ' + error.message, { cause: error });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode: 'synthetic settings browser', results, limitations: ['Toutes requêtes interceptées et données fabriquées ; aucun serveur, modèle, GPU, certificat réel ou installation active.', 'Viewports simulés : aucun téléphone physique ou lecteur d’écran qualifié.', 'Les mutations ne concernent que la fixture mémoire ; les clés, mots de passe et sorties réels ne sont jamais utilisés.'] }, null, 2));
} finally { await browser.close(); }
