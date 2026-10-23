// Development only: every request is intercepted; no server, model or user data.
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
const origin = 'http://bionic.test', projectId = 'help-fixture-project';
const chatId = 'web-11111111-1111-4111-8111-111111111111';
const pages = ['reading', 'models', 'tools', 'images', 'connection', 'maintenance', 'help'];
const longName = 'Nom_de_capacite_synthetique_tres_long_sans_espace_'.repeat(5);
const tick = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

function fixture() {
  const calls = [];
  const model = { id: 'help-model', name: 'Modèle synthétique', type: 'llm', loaded: true, tools: true, vision: true, contextLength: 16384, loadedInstances: [{ id: 'help-instance', contextLength: 16384 }], reasoning: { allowedOptions: ['low'], default: 'low' } };
  const chat = { id: chatId, projectId, name: 'Chat aide synthétique', source: 'web', model: model.id, fileProfile: 'none', messages: [{ id: 'help-reply', role: 'assistant', text: 'Réponse de fixture pour le parcours aide.', complete: true }], generation: { status: 'completed' } };
  const comfy = { enabled: false, memoryCleanup: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo', activeJobs: 0, loraProfiles: {}, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }, { id: 'hassaku_illustrious', label: 'Hassaku XL Illustrious v34' }] };
  function respond(url, method, input) {
    calls.push({ route: url.pathname, method, input });
    // This journey is deliberately passive. Any unexpected mutation fails the fixture.
    assert(method === 'GET' || (method === 'POST' && url.pathname === '/api/comfy/loras'), 'help navigation cannot mutate a server resource');
    if (url.pathname === '/api/status') return { ok: true, models: [model], addresses: [origin] };
    if (url.pathname === '/api/projects') return { projects: [{ id: projectId, name: 'Projet aide synthétique', sessionsCount: 1 }] };
    if (url.pathname === '/api/sessions') return { sessions: [{ ...chat, messages: undefined }], warnings: [], partial: false };
    if (url.pathname === '/api/conversation') return chat;
    if (url.pathname === '/api/activity') return { events: [], warnings: [] };
    if (url.pathname === '/api/ping') return { app: 'bionic-mobile-local', version: '2.2.1-beta.4', instanceId: '33333333-3333-4333-8333-333333333333' };
    if (url.pathname === '/api/models') return { models: [model], generationActive: false };
    if (url.pathname === '/api/model-preferences') return { model: model.id, contextLength: 16384, autoMaxOutputTokens: 8192, modelMaxOutputTokens: null, sessionMaxOutputTokens: null, sessionConfigured: false, automatic: true, maxOutputTokens: 8192, source: 'auto', applyToAllSessions: false };
    if (url.pathname === '/api/comfy/settings') return comfy;
    if (url.pathname === '/api/comfy/loras') return { loras: [], checkedAt: Date.now() };
    if (url.pathname === '/api/capabilities') return { items: [{ name: longName, description: 'Description synthétique très longue '.repeat(12) }, { name: 'Fichiers', description: 'Selon le projet et les autorisations du prochain message.' }] };
    if (url.pathname === '/api/security/status') return { mode: 'http', web: { canConfigure: false, canIssueDevice: false }, devices: [] };
    if (url.pathname === '/api/updates') return { currentVersion: '2.2.1-beta.4', channel: 'beta', enabled: true, candidate: null, canInstall: false, installation: { status: 'idle' }, lastCheckedAt: Date.now() };
    throw Error('Route synthétique manquante : ' + method + ' ' + url.pathname);
  }
  return { calls, respond };
}

async function navigate(page, section) {
  const target = page.locator('#settings-nav [data-settings-page="' + section + '"]');
  if (!(await target.isVisible())) await page.locator('#settings-back').click();
  await target.click();
  await page.locator('#settings-page-' + section).waitFor({ state: 'visible' });
  assert.equal(await page.locator('#settings-nav [aria-current="page"]').getAttribute('data-settings-page'), section);
}
async function openSettings(page, section = 'help') {
  if (!(await page.locator('#settings-view').isVisible())) {
    if (!(await page.locator('#settings-open-sidebar').isVisible())) await page.locator('#back').click();
    await page.locator('#settings-open-sidebar').click();
  }
  await navigate(page, section);
}
async function search(page, value) {
  if (!(await page.locator('#settings-search').isVisible())) await page.locator('#settings-back').click();
  await page.locator('#settings-search').fill(value);
}
async function capture(page, width, suffix) {
  await tick(page);
  if (captures) await page.screenshot({ path: path.join(captures, width + '-help-' + suffix + '.png') });
}
async function assertLayout(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page horizontal overflow');
  const body = await page.locator('.settings-body').evaluate(el => ({ scroll: el.scrollWidth, width: el.clientWidth, overflowing: [...el.querySelectorAll('dt,dd,summary,p,button')].filter(node => node.getClientRects().length && node.scrollWidth > node.clientWidth + 1).map(node => ({ tag: node.tagName, id: node.id, width: node.clientWidth, scroll: node.scrollWidth })) }));
  assert(body.scroll <= body.width + 1, 'no settings horizontal overflow: ' + JSON.stringify(body));
  assert.equal(await page.locator('#help-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'no guide horizontal overflow');
  assert.equal(await page.locator('#settings-capabilities').evaluate(el => el.scrollWidth <= el.clientWidth + 1), true, 'long capability names wrap');
}

const results = [];
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({locale:'fr-FR', viewport: { width, height: 900 }, serviceWorkers: 'block' });
    const page = await context.newPage(), api = fixture(), errors = [], outbound = [];
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { outbound.push(url.origin + url.pathname); return route.abort(); }
      try {
        if (url.pathname.startsWith('/api/')) {
          const data = api.respond(url, request.method(), request.postData() ? JSON.parse(request.postData()) : null);
          return await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
        }
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const catalog = /^locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js$/.test(file);
        if (!/^[a-z0-9.-]+$/i.test(file) && !catalog) throw Error('Unexpected static route ' + url.pathname);
        return await route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', file)) });
      } catch (error) {
        errors.push(error.message);
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) });
      }
    });
    try {
      await page.goto(origin);
      await page.locator('#app').waitFor({ state: 'visible' });
      await page.locator('.session[data-session-id="' + chatId + '"]').click();
      await page.locator('#prompt').fill('Brouillon synthétique conservé après consultation de l’aide.');
      await openSettings(page);
      assert.deepEqual(await page.locator('#settings-nav [data-settings-page]').evaluateAll(nodes => nodes.map(el => el.dataset.settingsPage)), pages, 'seven independent settings destinations');
      for (const id of ['help-content', 'settings-capabilities']) assert.equal(await page.locator('#' + id).evaluate(el => el.closest('[data-settings-section]')?.dataset.settingsSection), 'help', id + ' belongs to help');
      for (const id of ['updates-dialog', 'diagnostics-open']) assert.equal(await page.locator('#' + id).evaluate(el => el.closest('[data-settings-section]')?.dataset.settingsSection), 'maintenance', id + ' belongs to maintenance');
      assert.equal(await page.locator('#logout').evaluate(el => el.closest('[data-settings-section]')?.dataset.settingsSection), 'connection', 'logout remains with connections and devices');
      assert.equal(await page.locator('#info, #help-dialog').count(), 0, 'no obsolete help panel');
      assert.equal(await page.locator('#help-content details').count(), 8, 'all help topics rendered');
      const summaries = page.locator('#help-content details > summary');
      for (let index = 0; index < await summaries.count(); index++) {
        const summary = summaries.nth(index);
        await summary.focus();
        const before = await summary.evaluate(el => el.parentElement.open);
        await summary.press('Enter');
        assert.equal(await summary.evaluate(el => el.parentElement.open), !before, 'native summary toggles with Enter');
        if (before) await summary.press('Enter');
      }
      await summaries.first().focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.matches('#help-content .help-settings-link')), true, 'Tab reaches a guide shortcut in reading order');
      await page.waitForFunction(name => document.querySelector('#settings-capabilities').textContent.includes(name), longName);
      await assertLayout(page);
      assert.equal(await page.locator('#help-content').evaluate(el => [...el.querySelectorAll('p,li')].every(node => Number.parseFloat(getComputedStyle(node).fontSize) >= 13)), true, 'guide body remains readable');
      await page.locator('.settings-body').evaluate(el => { el.scrollTop = 0; });
      await capture(page, width, 'guide');
      await page.locator('#settings-capabilities').scrollIntoViewIfNeeded();
      await capture(page, width, 'capabilities');

      // Every guide shortcut is live, targets the right section and moves focus there.
      const shortcuts = await page.locator('#help-content .help-settings-link').evaluateAll(nodes => nodes.map(el => ({ text: el.textContent, page: el.dataset.helpPage, target: el.dataset.helpTarget })));
      assert(shortcuts.length >= 5, 'guide offers useful settings shortcuts');
      for (const shortcut of shortcuts) {
        await navigate(page, 'help');
        const button = page.locator('#help-content .help-settings-link').filter({ hasText: shortcut.text }).first();
        await button.evaluate(el => { for (let details = el.closest('details'); details; details = details.parentElement.closest('details')) details.open = true; });
        await button.click();
        await page.locator('#settings-page-' + shortcut.page).waitFor({ state: 'visible' });
        assert.equal(await page.locator('#' + shortcut.target).count(), 1, 'shortcut destination exists');
        assert.equal(await page.evaluate(expected => !!document.activeElement.closest('#settings-page-' + expected) && document.activeElement.getClientRects().length > 0, shortcut.page), true, 'shortcut gives focus to its visible destination');
        assert.equal(await page.locator('#' + shortcut.target).evaluate(el => !el.matches('button,input,select,textarea,a[href],[tabindex]') || el.disabled || el.getClientRects().length === 0 || document.activeElement === el), true, 'shortcut focuses the exact available control');
      }

      // Passive help navigation preserves both form drafts without sending them.
      await navigate(page, 'models');
      await page.waitForFunction(() => !document.querySelector('#output-save').disabled);
      await page.locator('#output-mode').selectOption('manual');
      await page.locator('#output-tokens').fill('1234');
      await navigate(page, 'images');
      await page.waitForFunction(() => !document.querySelector('#comfy-save').disabled && document.querySelector('#comfy-workflow').options.length === 2);
      await page.locator('#comfy-url').fill('http://192.0.2.44:8188');
      await navigate(page, 'help');
      await navigate(page, 'models');
      assert.equal(await page.locator('#output-tokens').inputValue(), '1234');
      await navigate(page, 'images');
      assert.equal(await page.locator('#comfy-url').inputValue(), 'http://192.0.2.44:8188');
      await navigate(page, 'help');
      await page.locator('#settings-close').click();
      await page.locator('#settings-unsaved').waitFor({ state: 'visible' });
      await page.locator('#settings-unsaved-continue').press('Escape');
      assert.equal(await page.locator('#settings-view').isVisible(), true, 'Escape cancels the unsaved decision');
      await navigate(page, 'models'); await page.locator('#output-cancel').click();
      await navigate(page, 'images'); await page.locator('#comfy-cancel').click();

      // Search distinguishes guide and operations; it only indexes public vocabulary.
      await search(page, 'aide');
      const helpResult = page.locator('#settings-results button').filter({ hasText: /Aide|Guide/ }).first();
      await helpResult.click(); await page.locator('#settings-page-help').waitFor({ state: 'visible' });
      await search(page, 'mise à jour');
      await page.locator('#settings-results button').filter({ hasText: /Mise/ }).first().click();
      await page.locator('#settings-page-maintenance').waitFor({ state: 'visible' });
      await capture(page, width, 'maintenance');
      await navigate(page, 'help');
      await page.locator('#settings-close').press('Escape');
      assert.equal(await page.locator('#settings-view').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id === 'settings-open-sidebar' && document.activeElement.getClientRects().length > 0), true, 'settings restores visible opener focus');

      // Existing conversation menu access opens the same guide and returns to the chat.
      if (!(await page.locator('#prompt').isVisible())) await page.locator('.session[data-session-id="' + chatId + '"]').click();
      await page.locator('#conversation-options-toggle').click();
      await page.locator('#info-button').click();
      await page.locator('#settings-page-help').waitFor({ state: 'visible' });
      await page.locator('#settings-close').press('Escape');
      assert.equal(await page.locator('#prompt').inputValue(), 'Brouillon synthétique conservé après consultation de l’aide.');
      assert.equal(await page.evaluate(() => document.activeElement.getClientRects().length > 0 && !document.activeElement.closest('[hidden]')), true, 'conversation help restores a visible focus');
      const duplicateIds = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(el => el.id); return ids.filter((id, index) => ids.indexOf(id) !== index); });
      assert.deepEqual(duplicateIds, []);
      assert.deepEqual(api.calls.filter(call => call.method !== 'GET' && call.route !== '/api/comfy/loras'), [], 'no implicit mutation; POST catalogue reads are passive');
      assert.deepEqual(outbound, []);
      assert.deepEqual(errors, []);
      results.push({ width, passed: true, pages: pages.length, shortcuts: shortcuts.length, passiveRequests: api.calls.length });
    } catch (error) {
      await capture(page, width, 'failure').catch(() => {});
      throw new Error('Aide synthétique ' + width + ' px : ' + error.message, { cause: error });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode: 'synthetic help browser', results, limitations: ['Requêtes toutes interceptées et données fabriquées ; aucun serveur, modèle, GPU ni installation active.', 'Viewports simulés : aucun téléphone physique ou lecteur d’écran qualifié.'] }, null, 2));
} finally { await browser.close(); }
