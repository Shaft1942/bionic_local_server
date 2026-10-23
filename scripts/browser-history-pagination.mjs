// Synthetic history, queue phases and capability notices. Every request is intercepted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const origin = 'http://bionic.test', projectId = 'synthetic-history-project', historyId = 'web-11111111-1111-4111-8111-111111111111', otherId = 'web-22222222-2222-4222-8222-222222222222';
const results = [];
const message = index => ({ id: 'history-' + index, role: index % 2 ? 'assistant' : 'user', text: 'Message synthétique ' + index + '\n\nTexte de lecture conservé. '.repeat(8), complete: true });
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 } }), page = await context.newPage(), errors = [], calls = [], receipts = new Map();
    const model = { id: 'synthetic-unknown-tools', name: 'Modèle synthétique', tools: null, toolsCapability: 'unknown', type: 'llm', loaded: true, loadedInstances: [], reasoning: null };
    const image = { id: 'synthetic-wait-image', prompt: 'Image de fixture', status: 'waiting-resource', workflowId: 'krea2_turbo', width: 1024, height: 1024, seed: 42 };
    const history = { id: historyId, projectId, name: 'Grand historique synthétique', source: 'web', model: model.id, messages: Array.from({ length: 250 }, (_, index) => message(index)), generation: { status: 'running', phase: 'waiting-model', requestId: 'synthetic-history-request', replyId: 'history-249' } };
    history.messages.at(-1).imageGenerations = [image];
    const other = { id: otherId, projectId, name: 'Autre conversation synthétique', source: 'web', model: model.id, messages: [{ id: 'other-initial', role: 'assistant', text: 'Conversation indépendante.', complete: true }], generation: { status: 'completed' } };
    let holdOlder = false, releaseOlder, signalOlder;
    const olderStarted = new Promise(resolve => { signalOlder = resolve; });
    const attach = tab => { tab.setDefaultTimeout(5000); tab.on('pageerror', failure => errors.push(failure.message)); };
    attach(page);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js|[a-z0-9.-]+)$/i.test(name)) return route.abort();
        return route.fulfill({ contentType: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html', body: await fs.readFile(path.join(root, 'public', name)) });
      }
      const input = req.postData() ? JSON.parse(req.postData()) : null;
      calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), input });
      let value, ndjson = false;
      if (url.pathname === '/api/status') value = { ok: true, models: [model], addresses: [] };
      else if (url.pathname === '/api/projects') value = { projects: [{ id: projectId, name: 'Projet synthétique', sessionsCount: 2 }] };
      else if (url.pathname === '/api/sessions') value = { sessions: [history, other].map(chat => ({ ...chat, messages: undefined })), warnings: [] };
      else if (url.pathname === '/api/conversation') {
        const chat = url.searchParams.get('id') === historyId ? history : other, limit = Number(url.searchParams.get('limit')) || 100;
        const end = url.searchParams.has('before') ? chat.messages.findIndex(message => message.id === url.searchParams.get('before')) : chat.messages.length;
        const start = Math.max(0, end - limit);
        value = { ...chat, messages: chat.messages.slice(start, end), pagination: { hasMore: start > 0, nextCursor: start > 0 ? chat.messages[start].id : null, total: chat.messages.length } };
        if (holdOlder && url.searchParams.has('before')) { holdOlder = false; signalOlder(); await new Promise(resolve => { releaseOlder = resolve; }); }
      }
      else if (url.pathname === '/api/chat-request') value = receipts.get(url.searchParams.get('requestId')) || { id: historyId, projectId, status: 'running', phase: 'waiting-resource' };
      else if (url.pathname === '/api/activity') value = { events: [], warnings: [] };
      else if (url.pathname === '/api/ping') value = { instanceId: '33333333-3333-4333-8333-333333333333', version: '2.4.0-beta.1' };
      else if (url.pathname === '/api/updates') value = { currentVersion: '2.4.0-beta.1', enabled: false, candidate: null, installation: { status: 'idle' } };
      else if (url.pathname === '/api/model-preferences') value = { source: 'auto', automatic: true, maxOutputTokens: 8192 };
      else if (url.pathname === '/api/comfy/settings') value = { enabled: true, degraded: true, jobIncidents: [{ code: 'unreadable-job', id: 'synthetic-isolated-job' }], workflowId: 'krea2_turbo', loraProfiles: {}, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }] };
      else if (url.pathname === '/api/comfy/generation') value = image;
      else if (url.pathname === '/api/chat') {
        const replyId = 'synthetic-capability-reply';
        other.messages.push({ id: 'synthetic-capability-user', role: 'user', text: input.text, requestId: input.requestId }, { id: replyId, role: 'assistant', text: 'Essai reçu.', requestId: input.requestId, complete: true });
        other.generation = { status: 'completed', requestId: input.requestId, replyId };
        receipts.set(input.requestId, { id: otherId, projectId, status: 'completed' }); ndjson = true;
        value = [{ type: 'start', id: otherId, replyId, requestId: input.requestId, name: other.name }, { type: 'capability', tools: 'unknown', trial: true, message: 'La capacité outils de ce modèle est inconnue. Essai volontaire des outils activés.' }, { type: 'delta', text: 'Essai reçu.' }, { type: 'done', id: otherId, replyId }];
      } else value = {};
      return route.fulfill({ contentType: ndjson ? 'application/x-ndjson' : 'application/json', body: ndjson ? value.map(event => JSON.stringify(event) + '\n').join('') : JSON.stringify(value) });
    });
    const choose = async (tab, id) => { if (width === 320 && await tab.locator('#back').isVisible()) await tab.locator('#back').click(); await tab.locator('.session[data-session-id="' + id + '"]').click(); };
    await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' }); await choose(page, historyId);
    await page.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 100);
    assert.equal(await page.locator('#messages>.message').first().getAttribute('data-message-id'), 'history-150');
    assert.match(await page.locator('#composer-activity').textContent(), /attente.*ressource/);
    assert.match(await page.locator('.generated-image-status').textContent(), /attente.*ressource/);
    assert.match(await page.locator('#model option').first().textContent(), /outils non confirmés/);
    assert.equal(await page.locator('#model-tools-help').isVisible(), true);
    assert.equal(await page.locator('#comfy-storage-warning').getAttribute('hidden'), null);
    const originalMessage = await page.locator('#messages>.message .message-body').first().textContent();
    await page.locator('#prompt').fill('Brouillon français conservé tel quel.');
    await page.evaluate(() => BionicI18n.setLanguage('en'));
    assert.equal(await page.locator('#history-load').textContent(), 'Load previous messages');
    assert.match(await page.locator('#history-count').textContent(), /100 of 250/);
    assert.match(await page.locator('#composer-activity').textContent(), /Waiting for a PC resource/);
    assert.match(await page.locator('#model-tools-help').textContent(), /unconfirmed/);
    assert.match(await page.locator('#comfy-storage-warning').textContent(), /unreadable/);
    assert.equal(await page.locator('.generated-image-status').textContent(), await page.evaluate(() => BionicI18n.t('components.images.waitingResource')));
    assert.equal(await page.locator('#prompt').inputValue(), 'Brouillon français conservé tel quel.');
    assert.equal(await page.locator('#messages>.message .message-body').first().textContent(), originalMessage);
    history.generation.phase = 'waiting-image'; await page.evaluate(() => recoverReplies());
    assert.match(await page.locator('#composer-activity').textContent(), /image is rendering/);
    await page.evaluate(() => BionicI18n.setLanguage('fr'));
    assert.match(await page.locator('#composer-activity').textContent(), /image est en cours de rendu/);
    history.generation.phase = 'waiting-model'; await page.evaluate(() => recoverReplies());
    await page.locator('#messages').evaluate(element => { element.scrollTop = 0; });
    const topBefore = await page.locator('.message[data-message-id="history-150"]').evaluate(element => element.getBoundingClientRect().top);
    await page.locator('#history-load').click(); await page.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 200);
    const topAfter = await page.locator('.message[data-message-id="history-150"]').evaluate(element => element.getBoundingClientRect().top);
    assert(Math.abs(topAfter - topBefore) < 3, 'loading older history preserves reading position');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'history-load');
    history.messages.push(message(250), message(251)); history.messages[230].text = 'Version récente modifiée.';
    await page.evaluate(() => recoverReplies()); await page.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 202);
    assert.equal(await page.locator('#messages>.message').first().getAttribute('data-message-id'), 'history-50');
    assert.equal(await page.locator('.message[data-message-id="history-230"] .message-body').textContent(), 'Version récente modifiée.');
    await page.locator('#history-load').click(); await page.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 252);
    assert.equal(await page.locator('#history-load').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'history-count');
    await choose(page, otherId); await choose(page, historyId);
    await page.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 252);
    if (width === 320) await page.locator('#back').click(); await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelector('#refresh').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#messages>.message').count(), 252, 'manual refresh preserves loaded older pages');
    await choose(page, otherId); await page.locator('#prompt').fill('Essai volontaire des outils.'); await page.locator('#send').click();
    await page.locator('.message-capability-notice').waitFor({ state: 'visible' }); await page.evaluate(() => recoverReplies());
    assert.match(await page.locator('.message-capability-notice').textContent(), /inconnue.*essayés/);
    await page.evaluate(() => BionicI18n.setLanguage('en'));
    assert.match(await page.locator('.message-capability-notice').textContent(), /tool support is unknown/);
    assert.equal(await page.locator('.message[data-message-id="synthetic-capability-reply"] .message-body').textContent(), 'Essai reçu.');
    await page.evaluate(() => BionicI18n.setLanguage('fr'));
    const late = await context.newPage(); attach(late); await late.goto(origin); await late.locator('#app').waitFor({ state: 'visible' }); await choose(late, historyId);
    await late.waitForFunction(() => document.querySelectorAll('#messages>.message').length === 100);
    holdOlder = true; await late.locator('#history-load').click(); await olderStarted;
    await choose(late, otherId); releaseOlder();
    await late.locator('#thread-title').getByText('Autre conversation synthétique', { exact: true }).waitFor();
    assert.equal(await late.locator('.message[data-message-id="history-0"]').count(), 0, 'late history result cannot change the active chat');
    assert(calls.filter(call => call.path === '/api/conversation').every(call => call.query.limit === '100'), 'normal and recovery reads are paginated');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []);
    results.push({ width, passed: true, initialMessages: 100, fullyLoadedMessages: 252, scrollPreserved: true, cacheRefreshPreserved: true, lateResponseIgnored: true, capabilityAndWaitingVisible: true, hotLanguages: ['fr', 'en'], chatAndDraftTextPreserved: true });
    await context.close();
  }
  console.log(JSON.stringify({ mode: 'synthetic browser only', results, limitations: ['No real model, GPU, phone or network service.'] }, null, 2));
} finally { await browser.close(); }
