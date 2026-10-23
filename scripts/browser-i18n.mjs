// Development-only internationalization journeys. Every request is intercepted;
// no companion, model, GPU, personal project or listening port is used.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href)
  : await import('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS || path.resolve(root, '../captures');
await fs.mkdir(captures, { recursive: true });
const manifest = JSON.parse(await fs.readFile(path.join(root, 'release-manifest.json'), 'utf8'));
const assets = new Set(manifest.files.filter(file => file.startsWith('public/')).map(file => '/' + file.slice('public/'.length)));
const origin = 'http://bionic.test', projectId = 'i18n-project';
const chatId = 'web-11111111-1111-4111-8111-111111111111', otherChatId = 'web-22222222-2222-4222-8222-222222222222';
const userId = 'i18n-user', replyId = 'i18n-reply', streamId = 'i18n-stream';
const projectName = 'Projet français synthétique', chatName = 'Conversation française conservée';
const filename = 'notes-français.txt', fileText = 'Un fichier en français, avec des accents : été, élève.\nconst valeur = "français";\n';
const code = '  const message = "Été français";\r\n\tconsole.log(message);\r\n';
const replyText = 'La réponse du modèle reste en français.\n\n```javascript\r\n' + code + '```';
const userText = 'Mon message français avec du code :\n\n```js\nconst mot = "français";\n```';
const draftText = 'Rédige en français. Ne traduis ni ce brouillon ni `const mot = "été";`.\n';
const streamText = 'Un début de réponse français.\n\n```js\nconst début = "été";\n';
const message = (page, id) => page.locator('.message[data-message-id="' + id + '"]');
const tick = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

function fixture() {
  const calls = [], writes = [], sent = [], unexpected = [], loadedAssets = new Set();
  const models = ['a', 'b'].map((id, index) => ({ id: 'i18n-' + id, name: 'Modèle ' + id.toUpperCase() + ' français', type: 'llm', loaded: index === 0, loadedInstances: [], tools: true, vision: true, contextLength: 16384, reasoning: { allowedOptions: ['low', 'high'], default: 'low' } }));
  const chats = new Map([
    [chatId, { id: chatId, projectId, name: chatName, source: 'web', model: 'i18n-a', fileProfile: 'read', messages: [{ id: userId, role: 'user', text: userText, complete: true }, { id: replyId, role: 'assistant', text: replyText, complete: true, reasoning: 'high', outputBudget: { maxOutputTokens: 8192 }, metrics: { outputTokens: 1234, tokensPerSecond: 25.6, responseSeconds: 48.2, rateSource: 'observed' } }], generation: { status: 'completed' }, updatedAt: 1700000000000 }],
    [otherChatId, { id: otherChatId, projectId, name: 'Autre chat français', source: 'web', model: 'i18n-a', fileProfile: 'none', messages: [{ id: 'i18n-other', role: 'assistant', text: 'Un autre contenu français.', complete: true }], generation: { status: 'completed' }, updatedAt: 1700000000000 }]
  ]);
  const comfy = { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo', activeJobs: 0, memoryCleanup: false, loraProfiles: { krea2_turbo: [], hassaku_illustrious: [] }, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }, { id: 'hassaku_illustrious', label: 'Hassaku XL Illustrious v34' }] };
  async function respond(url, method, input) {
    calls.push({ route: url.pathname, method, input: structuredClone(input) });
    if (method === 'POST') writes.push({ route: url.pathname, input: structuredClone(input) });
    switch (url.pathname) {
      case '/api/status': return { ok: true, models, addresses: [origin] };
      case '/api/models': return { models, generationActive: false };
      case '/api/projects': return { projects: [{ id: projectId, name: projectName, sessionsCount: chats.size }] };
      case '/api/sessions': return { sessions: [...chats.values()].map(chat => ({ ...chat, messages: undefined })), partial: false, warnings: [] };
      case '/api/conversation': return chats.get(url.searchParams.get('id'));
      case '/api/chat-request': return { id: chatId, projectId, status: chats.get(chatId).generation.status };
      case '/api/activity': return { events: [], warnings: [] };
      case '/api/pins': return { pins: [] };
      case '/api/ping': return { app: 'bionic-mobile-local', version: '2.3.0', instanceId: '33333333-3333-4333-8333-333333333333' };
      case '/api/comfy/settings': return comfy;
      case '/api/comfy/loras': return { loras: ['synthetic/été.safetensors'], checkedAt: 1700000000000 };
      case '/api/model-preferences': return { model: url.searchParams.get('model'), contextLength: 16384, autoMaxOutputTokens: 8192, modelMaxOutputTokens: null, sessionMaxOutputTokens: null, sessionConfigured: false, automatic: true, maxOutputTokens: 8192, source: 'auto', applyToAllSessions: false };
      case '/api/capabilities': return { items: [] };
      case '/api/security/status': return { mode: 'http', devices: [], web: { canConfigure: false, canIssueDevice: false, currentDeviceId: null } };
      case '/api/updates': return { currentVersion: '2.3.0', enabled: false, channel: 'stable', candidate: null, installation: { status: 'idle' } };
      case '/api/file-roots': return { roots: [{ id: 'project', name: 'Dossier français synthétique', path: 'synthetic/project', writable: true }] };
      case '/api/files': return { rootId: 'project', path: '', entries: [{ name: filename, path: filename, directory: false }] };
      case '/api/file': return { rootId: 'project', path: filename, name: filename, hash: 'a'.repeat(64), size: Buffer.byteLength(fileText), text: fileText, kind: 'text', editable: true, attachable: true };
      default: throw Error('Unexpected synthetic route: ' + method + ' ' + url.pathname);
    }
  }
  function start(input) {
    sent.push(structuredClone(input));
    const chat = chats.get(chatId);
    chat.messages.push({ id: 'i18n-stream-user', role: 'user', text: input.text, requestId: input.requestId }, { id: streamId, role: 'assistant', text: '', localRequestId: input.requestId, complete: false });
    chat.generation = { status: 'running', requestId: input.requestId, replyId: streamId };
    return { type: 'start', id: chatId, name: chat.name, requestId: input.requestId, replyId: streamId, fileProfile: input.fileProfile, webAccess: input.webAccess, webApproval: input.webApproval, scriptAccess: input.scriptAccess };
  }
  function apply(event) {
    const chat = chats.get(chatId), reply = chat.messages.find(item => item.id === streamId);
    if (event.type === 'delta') reply.text += event.text;
    if (event.type === 'done') { reply.complete = true; chat.generation.status = 'completed'; }
  }
  return { calls, writes, sent, unexpected, loadedAssets, models, chats, respond, start, apply };
}

async function setup({ width, locale = 'en-US', deniedStorage = false }) {
  const context = await browser.newContext({ locale, viewport: { width, height: 900 } });
  const page = await context.newPage(), api = fixture(), errors = [], outbound = [];
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ deniedStorage }) => {
    window.__i18nClipboard = []; window.__i18nSent = [];
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__i18nClipboard.push(text) } });
    if (deniedStorage) {
      for (const method of ['getItem', 'setItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (key, ...args) {
          if (this === localStorage && key === 'bionic.interface-language.v1') throw new DOMException('Synthetic language-only storage denial', 'SecurityError');
          return original.call(this, key, ...args);
        };
      }
    }
    const nativeFetch = window.fetch.bind(window); let controller;
    window.fetch = async (input, options = {}) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/chat') return nativeFetch(input, options);
      window.__i18nSent.push(JSON.parse(options.body));
      return new Response(new ReadableStream({ start(value) { controller = value; } }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
    };
    window.__i18nPush = value => controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n'));
    window.__i18nEnd = () => controller.close();
  }, { deniedStorage });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin !== origin) { outbound.push(url.origin + url.pathname); return route.abort(); }
    if (url.pathname.startsWith('/api/')) {
      try {
        const input = request.postData() ? JSON.parse(request.postData()) : null;
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(await api.respond(url, request.method(), input)) });
      } catch (error) {
        api.unexpected.push(error.message);
        return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) });
      }
    }
    const asset = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!assets.has(asset)) { api.unexpected.push('Unlisted asset: ' + asset); return route.fulfill({ status: 404, body: '' }); }
    api.loadedAssets.add(asset);
    return route.fulfill({ contentType: asset.endsWith('.js') ? 'text/javascript' : asset.endsWith('.css') ? 'text/css' : asset.endsWith('.html') ? 'text/html' : asset.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', asset.slice(1))) });
  });
  await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' });
  return { context, page, api, errors, outbound };
}

async function chooseChat(page, id = chatId) {
  if (await page.locator('#settings-view').isVisible()) await page.locator('#settings-close').click();
  if (!(await page.locator('.session[data-session-id="' + id + '"]').isVisible())) await page.locator('#back').click();
  await page.locator('.session[data-session-id="' + id + '"]').click();
  await message(page, id === chatId ? replyId : 'i18n-other').waitFor();
  await page.waitForFunction(id=>state.chat?.id===id&&!state.loading,id);
}
async function openReading(page) {
  if (!(await page.locator('#settings-view').isVisible())) {
    if (!(await page.locator('#settings-open-sidebar').isVisible())) await page.locator('#back').click();
    await page.locator('#settings-open-sidebar').click();
  }
  const reading = page.locator('#settings-nav [data-settings-page="reading"]');
  if (!(await reading.isVisible())) await page.locator('#settings-back').click();
  await reading.click();
  await page.locator('#interface-language').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('#output-mode').disabled && !document.querySelector('#comfy-workflow').disabled);
  await tick(page);
}
async function openTools(page) { if (!(await page.locator('#attach-file').isVisible())) await page.locator('#files-menu-toggle').click(); }
async function snapshot(page) {
  return page.evaluate(() => {
    const el = id => document.getElementById(id);
    return { prompt: el('prompt').value, model: el('model').value, effort: el('effort').value, profile: el('agent-files').value, web: el('agent-web').checked, approval: el('agent-web-approval').checked, scripts: el('agent-scripts').checked, images: el('agent-images').checked, workflow: el('image-workflow').value, attachments: [...el('attachments').querySelectorAll('.attachment-chip span')].map(item => item.textContent), storedDrafts: sessionStorage.getItem('bm_drafts') };
  });
}
async function noOverflow(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, label + ': horizontal page overflow');
}
async function capture(page, name) { await tick(page); await noOverflow(page, name); await page.screenshot({ path: path.join(captures, name + '.png') }); }
async function switchLanguage(page, api, language) {
  const previous = await snapshot(page), writes = api.writes.length, sends = await page.evaluate(() => window.__i18nSent.length);
  await page.locator('#interface-language').selectOption(language);
  await page.waitForFunction(value => document.documentElement.lang === value, language); await tick(page);
  assert.deepEqual(await snapshot(page), previous, 'language switch preserves all composer data and stored drafts');
  assert.equal(api.writes.length, writes, 'language switch makes no server POST');
  assert.equal(await page.evaluate(() => window.__i18nSent.length), sends, 'language switch sends no model request');
}
async function searchSettings(page, language) {
  if (!(await page.locator('#settings-search').isVisible())) await page.locator('#settings-back').click();
  const expected = language === 'en' ? 'Interface language' : 'Langue de l’interface';
  await page.locator('#settings-search').fill(language === 'en' ? 'interface language' : 'langue interface');
  await page.locator('#settings-results .settings-search-result').getByText(expected, { exact: true }).waitFor();
  assert.match(await page.locator('#settings-search-status').textContent(), language === 'en' ? /found/ : /trouvé/);
  await page.locator('#settings-results .settings-search-result').filter({ hasText: expected }).click();
  await page.locator('#interface-language').waitFor({ state: 'visible' });
}
async function checkContent(page, language) {
  const reply = message(page, replyId), user = message(page, userId);
  assert.equal(await page.locator('#thread-title').textContent(), chatName);
  assert.equal(await reply.locator('.message-code pre code').textContent(), code);
  assert.equal(await reply.locator('.message-body > p').first().textContent(), 'La réponse du modèle reste en français.');
  assert.equal(await user.locator('.message-body > p').first().textContent(), 'Mon message français avec du code :');
  assert.equal(await page.locator('#model option:checked').textContent(), 'Modèle B français · Vision');
  assert.deepEqual(await page.locator('#attachments .attachment-chip span').allTextContents(), [filename]);
  const replyCopy = reply.locator('.message-text-copy'), codeCopy = reply.locator('.message-code-copy');
  assert.equal(await replyCopy.getAttribute('aria-label'), language === 'en' ? 'Copy response' : 'Copier la réponse');
  assert.equal(await codeCopy.getAttribute('aria-label'), language === 'en' ? 'Copy code' : 'Copier le code');
  await replyCopy.click(); assert.equal(await page.evaluate(() => window.__i18nClipboard.at(-1)), replyText);
  await codeCopy.click(); assert.equal(await page.evaluate(() => window.__i18nClipboard.at(-1)), code);
  assert.equal(await reply.locator('.message-code-kind').textContent(), language === 'en' ? 'Proposed code' : 'Code proposé');
  await noOverflow(page, language + ' conversation');
}
function clean(run) {
  assert.deepEqual(run.errors, [], 'no browser errors');
  assert.deepEqual(run.outbound, [], 'no request left the synthetic origin');
  assert.deepEqual(run.api.unexpected, [], 'all requests used the synthetic fixture or manifest assets');
  for (const asset of ['/i18n.js', '/locales/fr/ui.js', '/locales/en/ui.js', '/locales/fr/app.js', '/locales/en/app.js', '/locales/fr/settings.js', '/locales/en/settings.js', '/locales/fr/components.js', '/locales/en/components.js']) assert(run.api.loadedAssets.has(asset), 'loaded asset ' + asset);
}

const results = [];
try {
  for (const width of [1280, 320]) {
    const run = await setup({ width }), { page, api } = run;
    try {
      assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'en-US browser chooses English');
      await chooseChat(page);
      await openTools(page); await page.locator('#attach-file').click();
      await page.locator('#files-view').waitFor({ state: 'visible' });
      await page.locator('.file-row[data-file-path="' + filename + '"]').click();
      await page.locator('#file-editor').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#file-editor').inputValue(), fileText);
      await page.locator('#file-attach').click();
      await page.locator('#model').selectOption('i18n-b'); await page.locator('#effort').selectOption('high');
      await openTools(page); await page.locator('#agent-files').selectOption('read');
      await page.locator('#agent-web').check(); await page.locator('#agent-web-approval').check();
      await page.locator('#prompt').fill(draftText);
      await openReading(page); assert.equal(await page.locator('#interface-language').inputValue(), 'en');
      await searchSettings(page, 'en');
      const body = message(page, replyId).locator('.message-body');
      await body.evaluate(element => { window.__i18nOriginalBody = element; });
      await switchLanguage(page, api, 'fr');
      assert.equal(await body.evaluate(element => window.__i18nOriginalBody === element), true, 'existing message body survives the language switch');
      await searchSettings(page, 'fr'); await capture(page, width + '-fr-settings');
      await chooseChat(page); await checkContent(page, 'fr');
      await openReading(page); await switchLanguage(page, api, 'en');
      await capture(page, width + '-en-settings');
      await chooseChat(page); await checkContent(page, 'en');
      await capture(page, width + '-en-chat');
      // Saved interface language takes precedence over the browser locale after reload.
      await openReading(page); await switchLanguage(page, api, 'fr');
      assert.equal(await page.evaluate(() => localStorage.getItem(BionicI18n.storageKey)), 'fr');
      await page.reload(); await page.locator('#app').waitFor({ state: 'visible' });
      assert.equal(await page.locator('html').getAttribute('lang'), 'fr', 'French choice survives reload in an English browser');
      await chooseChat(page); assert.equal(await page.locator('#prompt').inputValue(), draftText);
      await checkContent(page, 'fr');
      // Drafts remain distinct across chats and survive switching languages.
      await chooseChat(page, otherChatId); await page.locator('#prompt').fill('Un brouillon français différent.');
      await openReading(page); await switchLanguage(page, api, 'en');
      await chooseChat(page); assert.equal(await page.locator('#prompt').inputValue(), draftText);
      // The production send loop consumes a locally controlled NDJSON stream.
      await page.locator('#send').click(); await page.waitForFunction(() => window.__i18nSent.length === 1);
      const input = await page.evaluate(() => window.__i18nSent[0]);
      assert.equal(input.text, draftText.trim()); assert.equal(input.model, 'i18n-b'); assert.equal(input.reasoning, 'high');
      assert.equal(input.fileProfile, 'read'); assert.equal(input.webApproval, true);
      assert.equal(input.attachments[0].path, filename);
      await page.evaluate(event => window.__i18nPush(event), api.start(input));
      api.apply({ type: 'delta', text: streamText }); await page.evaluate(text => window.__i18nPush({ type: 'delta', text }), streamText);
      await message(page, streamId).locator('.message-code-copy').waitFor();
      await page.locator('#prompt').fill('Prochain brouillon, toujours en français.');
      await openReading(page); await switchLanguage(page, api, 'fr');
      await chooseChat(page);
      assert.equal(await page.locator('#prompt').inputValue(), 'Prochain brouillon, toujours en français.');
      assert.equal(await message(page, streamId).locator('.message-code-copy').getAttribute('aria-label'), 'Copier le code');
      const finalFragment = 'const suite = "française";\n';
      api.apply({ type: 'delta', text: finalFragment }); await page.evaluate(text => window.__i18nPush({ type: 'delta', text }), finalFragment);
      await page.waitForFunction(fragment => document.querySelector('.message[data-message-id="i18n-stream"] code')?.textContent.includes(fragment), finalFragment.trim());
      const done = { type: 'done', id: chatId, replyId: streamId }; api.apply(done);
      await page.evaluate(event => { window.__i18nPush(event); window.__i18nEnd(); }, done);
      await page.waitForFunction(() => document.querySelector('#stop').hidden);
      assert.equal(api.sent.length, 1); assert.equal(await page.evaluate(() => window.__i18nSent.length), 1);
      await message(page, streamId).locator('.message-code-copy').click();
      assert.equal(await page.evaluate(() => window.__i18nClipboard.at(-1)), streamText.split('```js\n')[1] + finalFragment);
      await capture(page, width + '-fr-stream-finished');
      clean(run); results.push({ width, detected: 'en-US → en', persisted: 'fr', languageSwitches: 5, streaming: true, assets: api.loadedAssets.size });
    } catch (error) { await page.screenshot({ path: path.join(captures, width + '-i18n-failure.png') }); throw error; }
    finally { await run.context.close(); }
  }
  const unsupported = await setup({ width: 320, locale: 'ja-JP' });
  try {
    assert.equal(await unsupported.page.locator('html').getAttribute('lang'), 'fr', 'unsupported browser language falls back to French');
    await openReading(unsupported.page); assert.equal(await unsupported.page.locator('#interface-language').inputValue(), 'fr');
    await capture(unsupported.page, '320-unsupported-fallback'); clean(unsupported);
    results.push({ unsupported: 'ja-JP → fr' });
  } finally { await unsupported.context.close(); }
  const denied = await setup({ width: 320, locale: 'en-US', deniedStorage: true });
  try {
    await openReading(denied.page); await switchLanguage(denied.page, denied.api, 'fr');
    assert.equal(await denied.page.locator('#interface-language-status').isVisible(), true);
    assert.match(await denied.page.locator('#interface-language-status').textContent(), /pas pu|enregistrer/);
    assert.equal(await denied.page.locator('#interface-language-status').getAttribute('role'), 'alert');
    await capture(denied.page, '320-fr-storage-denied');
    await denied.page.reload(); await denied.page.locator('#app').waitFor({ state: 'visible' });
    assert.equal(await denied.page.locator('html').getAttribute('lang'), 'en', 'failed persistence leaves the browser language on reload');
    clean(denied); results.push({ deniedLanguageStorage: true, appliedInPage: 'fr', reload: 'en' });
  } finally { await denied.context.close(); }
  console.log(JSON.stringify({ ok: true, synthetic: true, results, captures }, null, 2));
} finally { await browser.close(); }
