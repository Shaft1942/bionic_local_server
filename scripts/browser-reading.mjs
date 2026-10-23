// Synthetic conversation-reading checks. No server, model, GPU or personal data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let playwright;
try {
  playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href)
    : await import('playwright');
} catch {
  throw Error('Playwright de développement absent : utilise une installation existante ou npm install --include=dev puis npx playwright install chromium. Aucun serveur utilisateur requis.');
}
const browser = await playwright.chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const origin = 'http://bionic.test';
const projectId = 'reading-project';
const chatId = 'web-11111111-1111-4111-8111-111111111111';
const approvalId = '33333333-3333-4333-8333-333333333333';
const streamReply = 'reading-stream-reply';
const codeClosed = '  const angle = "<script>passif</script>";  \r\n\tconsole.log(angle);\r\n\r\n';
const codeOpen = '  print("fragment incomplet")\n\t# espaces conservés  ';
const codeUser = '\twindow.__readingExecuted += 100;  \n';
const readingSentence = 'La lecture doit rester stable pendant les fragments.';
const streamInitial = '## Réponse en cours\n\n' + readingSentence + '\n\n```js\n  const fragment = "début";\n';
// Small geometric PNG made for this fixture; it is not a generated model result.
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAB00lEQVR4nO3bMXbCMAwG4KDH0GuwduhJ6ObXQ+p5a6/RoQwsHbgGY4e+Dn2JI9uyZAvrHwk40YfsBAiHz++vxZMO7GzzOBAd7yAiDkTEgYg4EBEHInJMbbjcbstkeTmd1g96BxFxICIORMSBiDhQ7VmMk/D8tH4wXu/L5EBhy2W91ZbUUYFm88lWmEBZh/kqe0CBUacJIxZQYFc4vhF0ry2MbQQjVBUGNvILRQGgIPCGD9tEJjsI3z/U9gVGdVDLCMaZC6FwZB0jYx2E/1EUjCwBoeLSYw8IEzrSamaAdiJqBI9BgGJGBoAwr3gho2KgKPZF1+bIRWVLGBnooKI0N4LHqxabGtUARYFZth6zy1WPmQ5Cnk5D3Eqg2LSJJFqylRF0ryqKTa4m47CmWGQbSS89/NG4a1BkGOkszMwxGyzSscpI85dVjlGbs1i83vMLTj1Z9LxePXjLmxfiX9kVd3cMctWzziH1ZxbNmzhRS+ft9byz1W/iXCreif5X0qg7uUp31xkIeyw9RTvtCYT9Fub8XfefYoMbdQPCAc7rOccA0+pkBibXQepg5l2DMo1g5vbJOSpVIBxSZ//Ykp/FPL/xNYiIAxFxICIORMSBiDjQsp8f0uK9xNqfBloAAAAASUVORK5CYII=', 'base64');

function fixture() {
  const now = Date.now(), preferenceQueries = [], decisions = [], unexpected = [], forks = [];
  const models = ['a', 'b'].map(id => ({ id: 'reading-' + id, name: 'Modèle synthétique ' + id, type: 'llm', tools: true, vision: true, loaded: true, loadedInstances: [], contextLength: 16384, reasoning: { allowedOptions: ['low', 'high'], default: 'low' } }));
  const receipt = { version: 1, initialTransmitted: true, history: { selectedCount: 1, messages: [{ id: 'reading-user', role: 'user', preview: 'Texte fourni, synthétique.' }] }, current: { messageId: 'reading-user' }, attachments: [{ index: 0, messageId: 'reading-user', name: 'extrait-synthetique.txt', rootId: 'project', path: 'extrait-synthetique.txt', kind: 'text', transmitted: true, text: 'Extrait fictif.', preview: 'Extrait fictif.', characters: 15 }], permissions: { fileProfile: 'none', webAccess: false, scriptAccess: false }, toolReads: [], external: [] };
  const markdown = [
    '## Une réponse structurée',
    '',
    readingSentence,
    '',
    'Une phrase **forte**, une *emphase* et du `code inline`.',
    '',
    '1. Première étape',
    '   - Détail imbriqué',
    '2. Deuxième étape',
    '',
    '> Une citation passive.',
    '',
    '| Élément | État |',
    '| --- | --- |',
    '| Lecture | Confirmée |',
    '',
    '---',
    '',
    '[Source sûre](https://example.com/documentation) ; [lien hostile](javascript:window.__readingExecuted=10) ; [donnée active](data:text/html,hostile).',
    '',
    '<img src="https://hostile.invalid/pixel" onerror="window.__readingExecuted=11"><script>window.__readingExecuted=12</script>',
    '',
    '```javascript\r\n' + codeClosed + '```',
  ].join('\n');
  const chat = { id: chatId, projectId, name: 'Lecture synthétique', source: 'web', model: 'reading-b', fileProfile: 'none', updatedAt: now,
    generation: { status: 'running', requestId: 'reading-approval-request', replyId: 'reading-warning', awaitingApproval: true },
    messages: [
      { id: 'reading-user', role: 'user', text: 'Code fourni par le message.\n\n```js\n' + codeUser + '```', fromBionic: true },
      { id: 'reading-normal', role: 'assistant', text: markdown, fromBionic: true, complete: true, reasoning: 'high', outputBudget: { maxOutputTokens: 8192 }, metrics: { outputTokens: 120, inputTokens: 500, tokensPerSecond: 25, responseSeconds: 6.4, rateSource: 'observed' }, contextReceipt: structuredClone(receipt) },
      { id: 'reading-open', role: 'assistant', text: 'Bloc reçu sans clôture.\n\n```python\n' + codeOpen, complete: true, interrupted: true },
      { id: 'reading-warning', role: 'assistant', text: 'Décisions et résultats restent consultables.', complete: false,
        approvals: [{ id: approvalId, projectId, chatId, kind: 'script', runtime: 'python', code: 'print("validation synthétique uniquement")', directory: '', status: 'pending', createdAt: now, expiresAt: now + 600000 }],
        actions: [{ id: 'reading-failed-action', name: 'read_project_file', ok: false, message: 'Échec synthétique : fichier indisponible.', path: 'fichier-absent.txt' }],
        mutationIntents: [{ id: 'reading-uncertain', tool: 'write_project_file', path: 'livrable-incertain.txt', status: 'uncertain' }],
        imageGenerations: [{ id: '44444444-4444-4444-8444-444444444444', status: 'succeeded', prompt: 'Image synthétique pour vérifier la carte et son téléchargement.', seed: 1234, width: 1216, height: 832, workflowId: 'krea2_turbo', workflowLabel: 'Krea 2 Turbo', image: { width: 1216, height: 832 } }],
      },
      ...Array.from({ length: 8 }, (_, i) => ({ id: 'reading-history-' + i, role: i % 2 ? 'assistant' : 'user', text: 'Historique synthétique ' + (i + 1) + '.\n\n' + ('Un passage antérieur reste disponible pour lire sans suivre le bas du fil. '.repeat(4)), fromBionic: true, complete: true })),
      // Old saved replies do not contain a per-reply model in this release.
      { id: 'reading-truncated', role: 'assistant', text: 'Ancienne réponse coupée.\n\n```text\nsource incomplète  ', complete: true, truncated: true, outputBudget: { maxOutputTokens: 777, adjusted: false }, contextReceipt: structuredClone(receipt) },
    ],
  };
  const comfy = { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'krea2_turbo', activeJobs: 0, loraProfiles: { krea2_turbo: [], hassaku_illustrious: [] }, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }, { id: 'hassaku_illustrious', label: 'Hassaku XL Illustrious v34' }] };
  let sends = 0;
  function startStream(input) {
    sends++;
    assert.equal(input.projectId, projectId); assert.equal(input.sessionId, chatId); assert.equal(input.model, 'reading-b');
    chat.messages.push({ id: 'reading-stream-user', role: 'user', text: input.text, requestId: input.requestId }, { id: streamReply, role: 'assistant', text: '', requestId: input.requestId, complete: false, contextReceipt: structuredClone(receipt) });
    chat.generation = { status: 'running', requestId: input.requestId, replyId: streamReply };
    return { type: 'start', id: chatId, name: chat.name, requestId: input.requestId, replyId: streamReply, contextReceipt: structuredClone(receipt), fileProfile: 'none' };
  }
  function apply(event) {
    const reply = chat.messages.find(message => message.id === streamReply);
    if (event.type === 'delta') reply.text += event.text;
    if (event.type === 'action') { (reply.actions ||= []).push(structuredClone(event.action)); if (event.action.imageGeneration) (reply.imageGenerations ||= []).push(structuredClone(event.action.imageGeneration)); }
    if (event.type === 'approval') { const approvals = reply.approvals ||= [], index = approvals.findIndex(item => item.id === event.approval.id); if (index < 0) approvals.push(structuredClone(event.approval)); else approvals[index] = structuredClone(event.approval); chat.generation.awaitingApproval = event.approval.status === 'pending'; }
    if (event.type === 'done') { Object.assign(reply, { complete: true, truncated: event.truncated, limited: event.limited, outputBudget: event.outputBudget }); chat.generation.status = 'completed'; }
    chat.updatedAt = Date.now();
  }
  async function respond(url, input) {
    if (url.pathname === '/api/status') return { ok: true, models, addresses: [] };
    if (url.pathname === '/api/projects') return { projects: [{ id: projectId, name: 'Projet synthétique de lecture', sessionsCount: 1 }] };
    if (url.pathname === '/api/sessions') return { sessions: [{ ...chat, messages: undefined }], warnings: [], partial: false };
    if (url.pathname === '/api/conversation') return chat;
    if (url.pathname === '/api/conversation/fork') { forks.push(input); return { id: chatId }; }
    if (url.pathname === '/api/chat-request') return { id: chatId, projectId, status: chat.generation.status };
    if (url.pathname === '/api/activity') return { events: [], warnings: [] };
    if (url.pathname === '/api/ping') return { app: 'bionic-mobile-local', version: '2.1.0', instanceId: '55555555-5555-4555-8555-555555555555' };
    if (url.pathname === '/api/updates') return { currentVersion: '2.1.0', enabled: false, candidate: null, canInstall: false, installation: { status: 'idle' } };
    if (url.pathname === '/api/comfy/settings') return comfy;
    if (url.pathname === '/api/comfy/loras') return { loras: [], checkedAt: Date.now() };
    if (url.pathname === '/api/security/status') return { mode: 'http', devices: [], web: { canConfigure: false, canIssueDevice: false } };
    if (url.pathname === '/api/capabilities') return { items: [{ name: 'Conversations', description: 'Fixture de lecture, sans moteur.' }] };
    if (url.pathname === '/api/model-preferences') {
      assert.equal(input, null, 'reading smoke must not save settings');
      const query = Object.fromEntries(url.searchParams); preferenceQueries.push(query);
      return { model: query.model, contextLength: 16384, automatic: true, maxOutputTokens: 8192, source: 'auto', applyToAllSessions: false };
    }
    if (url.pathname === '/api/tool-approval') {
      assert.equal(input.id, approvalId); assert.equal(input.decision, 'deny'); decisions.push(input);
      chat.messages.find(message => message.id === 'reading-warning').approvals[0].status = 'denied'; chat.messages.find(message => message.id === 'reading-warning').complete = true; chat.generation = { ...chat.generation, status: 'completed', awaitingApproval: false };
      return { id: approvalId, status: 'denied' };
    }
    unexpected.push(url.pathname); throw Error('Route synthétique non prévue : ' + url.pathname);
  }
  return { chat, models, preferenceQueries, decisions, unexpected, forks, respond, startStream, apply, get sends() { return sends; } };
}

const message = (page, id) => page.locator('.message[data-message-id="' + id + '"]');
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function snapshot(page, name, width) { if (captures) await page.screenshot({ path: path.join(captures, width + '-' + name + '.png') }); }
async function push(page, api, event) { api.apply(event); await page.evaluate(value => window.__readingPush(value), event); await page.waitForTimeout(90); await settle(page); }
async function checkScroll(page, before, label) {
  const after = await page.locator('#messages').evaluate(el => el.scrollTop);
  assert(Math.abs(after - before) <= 3, label + ': scroll moved from ' + before + ' to ' + after);
}

const results = [];
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({locale:'fr-FR', viewport: { width, height: 900 } });
    const page = await context.newPage(), api = fixture(), errors = [], outbound = [];
    page.setDefaultTimeout(6000); page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
      window.__readingExecuted = 0; window.__readingClipboard = []; window.__readingRejectClipboard = false; window.__readingSent = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { if (window.__readingRejectClipboard) throw Error('Synthetic clipboard refusal'); window.__readingClipboard.push(text); } } });
      const nativeFetch = window.fetch.bind(window); let controller;
      window.fetch = async (input, options = {}) => {
        const url = new URL(typeof input === 'string' ? input : input.url, location.href);
        if (url.pathname !== '/api/chat') return nativeFetch(input, options);
        window.__readingSent.push(JSON.parse(options.body));
        return new Response(new ReadableStream({ start(value) { controller = value; } }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
      };
      window.__readingPush = value => controller.enqueue(new TextEncoder().encode(JSON.stringify(value) + '\n'));
      window.__readingEnd = () => controller.close();
    });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) { outbound.push(url.origin + url.pathname); return route.abort(); }
      if (url.pathname === '/api/comfy/image') return route.fulfill({ contentType: 'image/png', body: imageBytes });
      if (url.pathname.startsWith('/api/')) {
        const input = request.postData() ? JSON.parse(request.postData()) : null;
        try { return route.fulfill({ contentType: 'application/json', body: JSON.stringify(await api.respond(url, input)) }); }
        catch (error) { errors.push(error.message); return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: error.message }) }); }
      }
      const relative = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components|local-services)\.js|[a-z0-9.-]+)$/i.test(relative)) return route.abort();
      return route.fulfill({ contentType: relative.endsWith('.js') ? 'text/javascript' : relative.endsWith('.css') ? 'text/css' : relative.endsWith('.html') ? 'text/html' : relative.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', relative)) });
    });
    const started = performance.now();
    try {
      await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' });
      await page.locator('.session').first().click(); await message(page, 'reading-normal').waitFor();
      const normal = message(page, 'reading-normal'), normalBody = normal.locator('.message-body'), extras = normal.locator(':scope > .message-extras');
      for (const id of ['reading-user','reading-normal']) {
        const header=message(page,id).locator('.message-role'), actions=header.locator('.message-actions');
        const fork=actions.getByRole('button',{name:'Créer une branche depuis ici',exact:true});
        assert.equal(await fork.isVisible(),true,'branch action is directly visible');
        assert.equal(await fork.textContent(),'');assert.equal(await fork.locator('svg').count(),1);
        assert.equal(await actions.locator('.message-text-copy').isVisible(),true);
        const layout=await header.evaluate(el=>{
          const a=el.querySelector('.message-actions').getBoundingClientRect(),h=el.getBoundingClientRect();
          const copy=el.querySelector('.message-text-copy').getBoundingClientRect(),fork=el.querySelector('.message-fork').getBoundingClientRect();
          return {right:Math.abs(h.right-a.right),gap:fork.left-copy.right,aligned:Math.abs(fork.top-copy.top)};
        });
        assert(layout.right<2 && layout.gap>=0 && layout.gap<=8 && layout.aligned<2,'message icons form one group at the right edge');
      }
      assert.equal(await message(page,'reading-user').locator('.message-extras').count(),0,'branch does not create an ellipsis menu');
      await message(page,'reading-user').scrollIntoViewIfNeeded();await snapshot(page,'message-actions',width);
      assert.match(await normal.locator('.origin-tag').textContent(), /historique Bionic/);
      assert.equal(await normalBody.locator('h2').first().textContent(), 'Une réponse structurée');
      assert.equal(await normalBody.locator('strong').first().textContent(), 'forte'); assert.equal(await normalBody.locator('em').first().textContent(), 'emphase');
      assert.equal(await normalBody.locator('ol > li').count(), 2); assert.equal(await normalBody.locator('ol ul li').count(), 1);
      assert.equal(await normalBody.locator('blockquote').count(), 1); assert.equal(await normalBody.locator('table th').count(), 2); assert.equal(await normalBody.locator('table td').count(), 2); assert.equal(await normalBody.locator('hr').count(), 1);
      assert.equal(await normalBody.locator('script,img,iframe,object,embed,style').count(), 0, 'raw HTML must stay passive text');
      assert.equal(await normalBody.locator('a').count(), 1, 'only HTTP(S) links become anchors');
      assert.equal(await normalBody.locator('a').getAttribute('href'), 'https://example.com/documentation');
      assert.match(await normalBody.locator('a').getAttribute('rel'), /noopener/);
      assert.equal(await extras.getAttribute('open'), null); assert.equal(await extras.locator('.message-extras-label').textContent(), 'Détails du tour');
      assert.equal(await extras.locator('.message-turn-duration').textContent(),'6,4 s');assert.match(await extras.locator('.message-turn-throughput').textContent(),/120 tokens · ≈ 25 tok\/s/);
      assert.equal(await extras.locator('.message-turn-measures').isVisible(),true,'metrics stay visible while details are closed');
      await normal.getByRole('button',{name:'Copier la réponse',exact:true}).click();assert.equal(await page.evaluate(()=>window.__readingClipboard.at(-1)),api.chat.messages.find(m=>m.id==='reading-normal').text);
      await message(page,'reading-user').getByRole('button',{name:'Copier mon prompt',exact:true}).click();assert.equal(await page.evaluate(()=>window.__readingClipboard.at(-1)),api.chat.messages.find(m=>m.id==='reading-user').text);
      assert.equal(await normal.locator('.message-code-copy').textContent(),'');assert.equal(await normal.locator('.message-code-copy svg').count(),1);
      await extras.scrollIntoViewIfNeeded();await snapshot(page,'compact-measures',width);
      assert.equal(await normal.locator('.message-budget').isVisible(), false, 'ordinary budget is collapsed');
      assert.equal(await normal.locator('.message-budget').evaluate(el => !!el.closest('.message-extras')), true);
      for (const [id, expected, kind, complete] of [['reading-user', codeUser, 'Code fourni', 'true'], ['reading-normal', codeClosed, 'Code proposé', 'true'], ['reading-open', codeOpen, 'Code proposé', 'false']]) {
        const block = message(page, id).locator('.message-code').first();
        assert.equal(await block.getAttribute('data-complete'), complete); assert.equal(await block.locator('.message-code-kind').textContent(), kind);
        assert.equal(await block.locator('pre > code').textContent(), expected, 'exact visible code ' + id);
        await block.getByRole('button', { name: 'Copier le code', exact: true }).click();
        assert.equal(await page.evaluate(() => window.__readingClipboard.at(-1)), expected, 'exact copied code ' + id);
      }
      assert.equal(await message(page, 'reading-open').locator('.message-code-state').textContent(), 'Bloc non fermé');
      await page.evaluate(() => { window.__readingRejectClipboard = true; });
      await normal.locator('.message-code-copy').click();
      assert.equal(await normal.locator('.message-code-fallback').textContent(), codeClosed); assert.equal(await normal.locator('.message-code-fallback').getAttribute('aria-readonly'), 'true');
      await page.evaluate(() => { window.__readingRejectClipboard = false; });
      await normal.locator('.message-code-copy').click(); await normalBody.scrollIntoViewIfNeeded();
      await snapshot(page, 'markdown-code', width);

      const warning = message(page, 'reading-warning');
      assert.equal(await warning.locator('.tool-approval').isVisible(), true); assert.equal(await warning.getByRole('button', { name: 'Exécuter ce script', exact: true }).isVisible(), true);
      assert.equal(await warning.locator('.action-warning').isVisible(), true); assert.equal(await warning.locator('.mutation-warning').isVisible(), true);
      assert.equal(await warning.locator('.action-warning').evaluate(el => !!el.closest('.message-extras')), false);
      assert.equal(await warning.locator('.mutation-warning').evaluate(el => !!el.closest('.message-extras')), false);
      const generated = warning.locator('.generated-image-result'); await generated.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.generated-image-result')?.naturalWidth > 0);
      assert.equal(await generated.isVisible(), true); assert.equal(await warning.getByRole('link', { name: 'Télécharger l’image' }).count(), 1);
      await warning.locator('.tool-approval').scrollIntoViewIfNeeded(); await snapshot(page, 'decisions-errors', width);
      await warning.getByRole('button', { name: 'Refuser', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.tool-approval-status')?.textContent.includes('Refusé'));
      assert.equal(api.decisions.length, 1); assert.equal(await page.evaluate(() => window.__readingExecuted), 0);
      const oldTruncated = message(page, 'reading-truncated');
      assert.equal(await oldTruncated.locator('.message-truncated').isVisible(), true);
      assert.match(await oldTruncated.locator('.message-budget-target').textContent(), /Modèle de cette réponse non relevé/, 'old history must not invent a per-reply model');
      assert.match(await oldTruncated.locator('.message-budget-target').textContent(), /modèle du prochain envoi/);

      // Use the production send loop with a controllable, purely local NDJSON stream.
      await page.locator('#model').selectOption('reading-b'); await page.locator('#prompt').fill('Continuer la lecture avec un flux synthétique.');
      await page.locator('#send').click(); await page.waitForFunction(() => window.__readingSent.length === 1);
      const submitted = await page.evaluate(() => window.__readingSent[0]), startEvent = api.startStream(submitted);
      await page.evaluate(event => window.__readingPush(event), startEvent); await push(page, api, { type: 'delta', text: streamInitial });
      const streaming = message(page, streamReply); await streaming.locator('.message-code-copy').waitFor();
      assert.equal(await streaming.locator('.message-fork').count(),0,'incomplete reply cannot be branched');
      assert.equal(api.sends, 1); assert.equal(await streaming.locator('.message-code').getAttribute('data-complete'), 'false');
      await page.locator('#messages').evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); }); await settle(page);
      await push(page, api, { type: 'delta', text: '  const suite = "fragment 2";\n' });
      assert(await page.locator('#messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 8), 'near-bottom reading follows fragments');

      // A focused copy button remains usable while this same body gains text.
      await streaming.locator('.message-code-copy').focus();
      await push(page, api, { type: 'delta', text: '  const suite3 = true;\n' });
      assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('message-code-copy')), true, 'copy focus survives a delta');
      await page.locator('#prompt').focus(); await settle(page);

      // Preserve a DOM text selection in the actively streaming response.
      const selected = await streaming.locator('.message-body').evaluate((body, phrase) => {
        const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT); let text;
        while ((text = walker.nextNode())) { const index = text.data.indexOf(phrase); if (index >= 0) { const range = document.createRange(); range.setStart(text, index + 3); range.setEnd(text, index + 25); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString(); } }
        throw Error('Selection target missing');
      }, readingSentence);
      await push(page, api, { type: 'delta', text: '  // fragment pendant la sélection\n' });
      assert.equal(await page.evaluate(() => window.getSelection().toString()), selected, 'selection survives delta');
      await page.evaluate(() => recoverReplies()); await settle(page);
      assert.equal(await page.evaluate(() => window.getSelection().toString()), selected, 'selection survives snapshot recovery');
      await page.evaluate(() => { window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); }); await page.locator('#prompt').focus(); await settle(page);

      // Open stable-key disclosures in an older turn and retain input selection.
      await extras.locator(':scope > summary').click(); await extras.locator('.context-receipt > summary').click(); await extras.locator('.context-file > summary').click(); await extras.locator('.pin-control > summary').click();
      const title = normal.getByLabel('Titre dans les livrables'); await title.fill('Titre synthétique conservé'); await title.evaluate(el => { el.focus(); el.setSelectionRange(2, 9); });
      await push(page, api, { type: 'action', action: { id: 'reading-late-action', name: 'run_project_script', runtime: 'node', ok: true, message: 'Sortie de fixture synthétique, aucune exécution réelle.', stdout: 'stdout synthétique\nligne source exacte\n' } });
      await page.evaluate(() => recoverReplies()); await settle(page);
      assert.equal(await title.inputValue(), 'Titre synthétique conservé'); assert.deepEqual(await title.evaluate(el => [el === document.activeElement, el.selectionStart, el.selectionEnd]), [true, 2, 9]);
      assert.equal(await extras.getAttribute('open'), ''); assert.equal(await extras.locator('.context-receipt').getAttribute('open'), ''); assert.equal(await extras.locator('.context-file').getAttribute('open'), '');

      // Technical receipts can be reconstructed while their stdout is selected.
      const streamExtras = streaming.locator(':scope > .message-extras');
      await streamExtras.locator(':scope > summary').click(); await streamExtras.locator('.actions-log > summary').click();
      const technical = streaming.locator('.action-row[data-action-id="reading-late-action"] .tool-output');
      await technical.locator(':scope > summary').click();
      const technicalSelection = await technical.locator('pre').evaluate(pre => {
        const range = document.createRange(); range.setStart(pre.firstChild, 3); range.setEnd(pre.firstChild, 24); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return selection.toString();
      });
      await push(page, api, { type: 'action', action: { id: 'reading-selection-action', name: 'read_project_file', path: 'recu-synthetique.txt', ok: true, message: 'Reçu synthétique ajouté pendant la sélection.' } });
      assert.equal(await page.evaluate(() => window.getSelection().toString()), technicalSelection, 'stdout selection survives reconstructed action details');
      assert.equal(await technical.getAttribute('open'), '');
      await page.evaluate(() => recoverReplies()); await settle(page);
      assert.equal(await page.evaluate(() => window.getSelection().toString()), technicalSelection, 'stdout selection survives snapshot recovery');
      assert.equal(await technical.getAttribute('open'), ''); assert.equal(await streamExtras.getAttribute('open'), '');
      await page.evaluate(() => { window.getSelection().removeAllRanges(); document.dispatchEvent(new Event('selectionchange')); });

      // A full update at the bottom must not move a reader who scrolled upward.
      await page.locator('#prompt').focus(); await page.locator('#messages').evaluate(el => { el.scrollTop = 120; el.dispatchEvent(new Event('scroll')); }); await settle(page);
      const before = await page.locator('#messages').evaluate(el => el.scrollTop);
      await push(page, api, { type: 'delta', text: '  // lecture remontée préservée\n' }); await checkScroll(page, before, 'delta away from bottom');
      await push(page, api, { type: 'action', action: { id: 'reading-late-error', name: 'read_project_file', ok: false, path: 'absent-tardif.txt', message: 'Erreur tardive synthétique.' } }); await checkScroll(page, before, 'late action full redraw');
      const lateApproval = { id: '66666666-6666-4666-8666-666666666666', projectId, chatId, kind: 'script', runtime: 'python', code: 'print("proposition tardive passive")', status: 'pending', createdAt: Date.now(), expiresAt: Date.now() + 600000 };
      await push(page, api, { type: 'approval', approval: lateApproval }); await checkScroll(page, before, 'late approval full redraw');
      assert.equal(await streaming.locator('.tool-approval').isVisible(), true, 'late approval remains outside collapsed details');
      await push(page, api, { type: 'action', action: { id: 'reading-late-image', name: 'generate_comfy_image', ok: true, message: 'Image synthétique disponible.', imageGeneration: { id: '77777777-7777-4777-8777-777777777777', status: 'succeeded', prompt: 'Image tardive synthétique, sans génération réelle.', seed: 5678, width: 1216, height: 832, workflowId: 'krea2_turbo', image: { width: 1216, height: 832 } } } }); await checkScroll(page, before, 'late image full redraw');
      assert.equal(await streaming.locator('.generated-image').isVisible(), true, 'late image remains outside collapsed details');
      await page.evaluate(() => recoverReplies()); await settle(page); await checkScroll(page, before, 'snapshot away from bottom');
      await page.locator('#reply-follow').waitFor({ state: 'visible' }); assert.equal(await page.locator('#reply-follow').textContent(), 'Revenir à la réponse');
      await snapshot(page, 'reading-position', width);
      await page.locator('#reply-follow').click(); await settle(page);
      assert(await page.locator('#messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 8), 'explicit return reaches current response');
      await push(page, api, { type: 'delta', text: '  // suivi après retour 1\n' });
      assert(await page.locator('#messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 8), 'explicit return resumes following the first new delta');
      await push(page, api, { type: 'delta', text: '  // suivi après retour 2\n' });
      assert(await page.locator('#messages').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop < 8), 'explicit return keeps following the second new delta');

      await push(page, api, { type: 'approval', approval: { ...lateApproval, status: 'expired' } });
      await push(page, api, { type: 'delta', text: '  // fin sans clôture  ' });
      await push(page, api, { type: 'done', id: chatId, replyId: streamReply, limited: true, truncated: true, finishReason: 'length', outputBudget: { maxOutputTokens: 777, requestedMaxOutputTokens: 777, adjusted: false } });
      await page.evaluate(() => window.__readingEnd()); await page.waitForFunction(() => !document.querySelector('#stop') || document.querySelector('#stop').hidden);
      await streaming.locator('.message-truncated').waitFor(); assert.equal(await streaming.locator('.message-truncated .message-budget').isVisible(), true);
      assert.equal(await streaming.locator(':scope > .message-budget').count(), 0, 'no repeated standalone budget below the truncation warning');
      assert.equal(await page.locator('#toast').isVisible(), false, 'truncation must not create a redundant toast');
      await page.locator('#model').selectOption('reading-a');
      await streaming.getByRole('button', { name: 'Régler le plafond', exact: true }).click(); await page.locator('#output-current').waitFor();
      await page.waitForFunction(() => !document.querySelector('#output-save').disabled && document.querySelector('#output-effective').textContent.includes('Contexte chargé'));
      assert.equal(await page.locator('#settings-model').inputValue(), 'reading-b', 'target uses known request model, despite current composer a');
      assert.equal(api.preferenceQueries.at(-1).model, 'reading-b'); assert.equal(api.preferenceQueries.at(-1).id, chatId); assert.equal(api.preferenceQueries.at(-1).projectId, projectId);
      await page.locator('#settings-close').click(); await streaming.locator('.message-truncated').scrollIntoViewIfNeeded();
      await snapshot(page, 'truncation', width);
      await streaming.locator('.message-code-copy').click(); assert.equal(await page.evaluate(() => window.__readingClipboard.at(-1)), streamInitial.split('```js\n')[1] + '  const suite = "fragment 2";\n  const suite3 = true;\n  // fragment pendant la sélection\n  // lecture remontée préservée\n  // suivi après retour 1\n  // suivi après retour 2\n  // fin sans clôture  ');
      await streaming.getByRole('button',{name:'Copier la réponse',exact:true}).click();assert.equal(await page.evaluate(()=>window.__readingClipboard.at(-1)),api.chat.messages.find(m=>m.id===streamReply).text,'message copy uses the complete updated stream, not the initial snapshot');

      assert.equal(await page.evaluate(() => window.__readingExecuted), 0, 'code/HTML never executes');
      await message(page,'reading-user').getByRole('button',{name:'Créer une branche depuis ici',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('Branche indépendante créée'));
      assert.deepEqual(api.forks,[{projectId,chatId,messageId:'reading-user'}],'branch icon passes the source message to the existing fork API');
      assert.deepEqual(outbound, [], 'all requests stay intercepted; raw HTML caused no request'); assert.deepEqual(api.unexpected, []); assert.deepEqual(errors, []);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no document horizontal overflow at ' + width);
      results.push({ width, passed: true, sends: api.sends, refusals: api.decisions.length, clipboardCopies: await page.evaluate(() => window.__readingClipboard.length), preferenceQueries: api.preferenceQueries.length, durationMs: Math.round(performance.now() - started) });
    } catch (error) {
      if (captures) await page.screenshot({ path: path.join(captures, width + '-failure.png') }).catch(() => {});
      throw Object.assign(new Error('Lecture synthétique ' + width + ' px : ' + error.message, { cause: error }), { results });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode: 'synthetic browser only', results, limitations: ['Les API et le flux NDJSON sont fabriqués et interceptés, sans serveur réel.', 'Viewports simulés : aucun téléphone physique, lecteur d’écran, Bionic, ComfyUI, modèle ou GPU qualifié.', 'Le refus clipboard est simulé ; le presse-papiers système et une exécution de script ne sont jamais utilisés.'] }, null, 2));
} finally { await browser.close(); }
