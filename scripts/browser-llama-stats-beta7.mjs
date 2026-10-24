// Full UI over intercepted synthetic files and APIs. No service, model or GPU.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const origin = 'http://message-stats-beta7.test', captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [];

function fixture(provider) {
  const instanceId = 'stats-beta7-' + provider, chatId = 'web-11111111-1111-4111-8111-111111111111', projectId = 'synthetic-project';
  const requests = [], unknown = [], receipts = new Map();
  let mode = 'done', sequence = 0, releaseConversation, waitingConversation = false, shouldHold = false;
  const model = { id: 'synthetic-stats-model', name: 'Modèle synthétique', type: 'llm', loaded: true, contextLength: 16384, tools: true, loadedInstances: [] };
  const chat = { id: chatId, projectId, model: model.id, source: 'web', name: 'Statistiques synthétiques', updatedAt: 1700000000000, messages: [
    { id: 'history-user', role: 'user', text: 'Question synthétique.' },
    { id: 'history-complete', role: 'assistant', text: 'Réponse enregistrée avec mesures.', complete: true, outcome: 'completed', finishedAt: 1700000005000, provider: { provider }, metrics: { inputTokens: 1200, outputTokens: 40, totalSeconds: 5, queueSeconds: 2, responseSeconds: 3, firstFragmentSeconds: .25, tokensPerSecond: 12.5, rateSource: provider === 'llamacpp' ? 'observed' : 'bionic', reasoningTokens: 0 } },
    { id: 'history-missing', role: 'assistant', text: 'Le moteur ne transmet aucun compteur.', complete: true, outcome: 'completed', metrics: { totalSeconds: 1.25, responseSeconds: 1.25, queueSeconds: 0 } },
    { id: 'history-stopped', role: 'assistant', text: 'Fragment conservé après arrêt.', outcome: 'stopped', interrupted: true, metrics: { partial: true, outputTokens: 4, totalSeconds: 2, responseSeconds: 2, queueSeconds: 0 } },
    { id: 'history-error', role: 'assistant', text: 'Interruption synthétique.', outcome: 'error', interrupted: true, metrics: { partial: true, totalSeconds: 1.25, responseSeconds: 1, queueSeconds: .25 } },
    { id: 'history-none', role: 'assistant', text: 'Ancienne réponse sans statistiques.', complete: true, outcome: 'completed' }
  ] };
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  async function api(route) {
    const request = route.request(), url = new URL(request.url()), name = url.pathname;
    if (!name.startsWith('/api/')) return false;
    const body = request.method() === 'POST' ? request.postDataJSON() : null;
    requests.push({ name, method: request.method(), ...(body ? { body } : {}) });
    let value;
    if (name === '/api/ping') value = { app: 'bionic-mobile-local', version: '2.6.0-beta.7', instanceId };
    else if (name === '/api/projects') value = { projects: [{ id: projectId, name: 'Projet synthétique', locallyOwned: true }] };
    else if (name === '/api/models') value = { models: [model], provider, inferenceRevision: 'synthetic-inference' };
    else if (name === '/api/inference/settings') value = { provider, apiUrl: 'http://127.0.0.1:1235', llamaUrl: 'http://127.0.0.1:1238', editable: true, revision: 'synthetic-inference' };
    else if (name === '/api/inference/model-selection') value = { busy: false, reconciliationRequired: false, editable: true };
    else if (name === '/api/llama-server') value = { profile: { endpoint: 'http://127.0.0.1:1238' }, canControl: true, process: { owned: false }, external: [] };
    else if (name === '/api/llama-server/models') value = { models: [] };
    else if (name === '/api/comfy/settings') value = { enabled: false, available: false, workflows: [] };
    else if (name === '/api/sessions') value = { sessions: [{ id: chat.id, projectId, source: 'web', name: chat.name, model: model.id, updatedAt: chat.updatedAt }], total: 1 };
    else if (name === '/api/conversation') {
      if (shouldHold) { waitingConversation = true; await new Promise(resolve => { releaseConversation = resolve; }); shouldHold = false; waitingConversation = false; }
      value = chat;
    }
    else if (name === '/api/chat-request') value = receipts.get(url.searchParams.get('requestId'));
    else if (name === '/api/chat') {
      const replyId = 'stream-reply-' + (++sequence), text = 'Nouveau fragment synthétique.';
      assert.equal(body.model, model.id); assert.equal(body.imageAccess, false);
      const assistant = { id: replyId, role: 'assistant', requestId: body.requestId, text, provider: { provider } };
      chat.messages.push({ id: 'stream-user-' + sequence, role: 'user', text: body.text, requestId: body.requestId }, assistant);
      let terminal;
      if (mode === 'running') {
        chat.generation = { status: 'running', requestId: body.requestId, replyId };
        receipts.set(body.requestId, { id: chatId, status: 'running', phase: 'inference' });
      } else {
        const failed = mode === 'error';
        const metrics = failed ? { partial: true, outputTokens: 0, totalSeconds: 1, responseSeconds: .75, queueSeconds: .25 } : { inputTokens: 20, outputTokens: 9, tokensPerSecond: 3, rateSource: 'observed', totalSeconds: 7, responseSeconds: 5, queueSeconds: 2 };
        Object.assign(assistant, { complete: !failed, interrupted: failed, finishedAt: 1700000010000 + sequence, outcome: failed ? 'error' : 'completed', metrics });
        chat.generation = { status: assistant.outcome, requestId: body.requestId, replyId };
        receipts.set(body.requestId, { id: chatId, status: assistant.outcome });
        terminal = { type: failed ? 'error' : 'done', id: chatId, replyId, finishedAt: assistant.finishedAt, outcome: assistant.outcome, metrics, ...(failed ? { message: 'Erreur synthétique.' } : {}) };
        shouldHold = true;
      }
      const events = [{ type: 'start', id: chatId, replyId, requestId: body.requestId, provider: { provider } }, { type: 'delta', text }, ...(terminal ? [terminal] : [])];
      await route.fulfill({ contentType: 'application/x-ndjson', body: events.map(event => JSON.stringify(event)).join('\n') + '\n' }); return true;
    }
    else if (name === '/api/cancel') {
      const assistant = chat.messages.find(message => message.role === 'assistant' && message.requestId === body.requestId);
      Object.assign(assistant, { finishedAt: 1700000020000, outcome: 'stopped', interrupted: true, metrics: { partial: true, totalSeconds: 2.5, responseSeconds: 2, queueSeconds: .5 } });
      chat.generation.status = 'stopped'; receipts.set(body.requestId, { id: chatId, status: 'stopped' }); value = { stopped: true };
    }
    else { unknown.push(name); await json(route, { error: 'Unknown synthetic route' }, 404); return true; }
    await json(route, value || { error: 'Synthetic item not found' }, value ? 200 : 404); return true;
  }
  return { instanceId, chatId, projectId, requests, unknown, api, chat, setMode(next) { mode = next; }, waiting: () => waitingConversation, release() { assert.ok(releaseConversation, 'A recovery GET is held'); releaseConversation(); releaseConversation = undefined; } };
}

async function until(predicate) { for (let i = 0; i < 200; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)); } assert.fail('Synthetic UI condition timed out'); }
try {
  for (const width of [1280, 390]) for (const provider of ['bionic', 'llamacpp']) {
    const state = fixture(provider), context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: width < 760 ? 'dark' : 'light', reducedMotion: 'reduce', locale: 'fr-FR' });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.addInitScript(({ instanceId, projectId, chatId }) => {
      const key = 'bionic:llama-prototype:' + instanceId;
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ projectId, chatId, jobs: [] }));
    }, { instanceId: state.instanceId, projectId: state.projectId, chatId: state.chatId });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.origin, origin, 'Every request stays on the intercepted synthetic origin');
      if (await state.api(route)) return;
      const file = path.resolve(root, 'public', url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.replace(/^\//, ''));
      assert.ok(file.startsWith(path.resolve(root, 'public') + path.sep));
      const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(file)] || 'text/html';
      await route.fulfill({ contentType, body: await fs.readFile(file), headers: contentType === 'text/html' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'" } : {} });
    });
    const stats = id => page.locator('#message-' + id + ' [data-message-stats]');
    const readRow = (container, label) => container.locator('dl > div').filter({ has: page.locator('dt', { hasText: label }) }).locator('dd').innerText();
    try {
      await page.goto(origin + '/prototype/'); await stats('history-complete').waitFor();
      if (width < 760 && await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).click();
      assert.match(await stats('history-complete').locator('summary').innerText(), /40 tokens/);
      assert.match(await stats('history-complete').locator('summary').innerText(), /12,5 tok\/s/);
      assert.equal((await stats('history-complete').locator('summary').innerText()).includes('≈'), provider === 'llamacpp');
      await stats('history-complete').locator('summary').click();
      assert.equal(await readRow(stats('history-complete'), 'Attente avant exécution'), '2 s');
      assert.equal(await readRow(stats('history-complete'), 'Tokens de raisonnement'), '0');
      await stats('history-complete').locator('summary').focus(); await page.keyboard.press('Escape');
      assert.equal(await stats('history-complete').evaluate(element => element.open), false);
      assert.equal(await stats('history-complete').locator('summary').evaluate(element => document.activeElement === element), true);
      assert.match(await stats('history-missing').locator('summary').innerText(), /— tokens/);
      assert.match(await stats('history-missing').locator('summary').innerText(), /— tok\/s/);
      for (const id of ['history-stopped', 'history-error']) { assert.equal(await stats(id).getAttribute('data-state'), 'partial'); assert.match(await stats(id).locator('summary').innerText(), /Partielles/); }
      assert.match(await stats('history-none').locator('summary').innerText(), /non transmises/);
      // A reload reads the same durable metrics; no generation request occurs.
      await page.reload(); await stats('history-complete').waitFor();
      assert.match(await stats('history-complete').locator('summary').innerText(), /40 tokens/);
      assert.equal(state.requests.filter(item => item.name === '/api/chat').length, 0);
      // An active recovered reply has no invented ticking tokens, time or rate.
      state.setMode('running'); await page.getByLabel('Message', { exact: true }).fill('Statistiques en cours.'); await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
      const running = stats('stream-reply-1'); await until(async () => await running.getAttribute('data-state') === 'running');
      assert.match(await running.locator('summary').innerText(), /fin de réponse/); assert(!/tok\/s/.test(await running.locator('summary').innerText()));
      await page.getByRole('button', { name: 'Arrêter la demande', exact: true }).click();
      await until(async () => await running.getAttribute('data-state') === 'partial');
      assert.match(await running.locator('summary').innerText(), /— tokens/); assert.match(await running.locator('summary').innerText(), /2,5 s/);
      // Hold the recovery GET so these assertions prove immediate done/error data.
      state.setMode('done'); await page.getByLabel('Message', { exact: true }).fill('Statistiques finales.'); await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
      await until(state.waiting); const done = stats('stream-reply-2');
      assert.match(await done.locator('summary').innerText(), /9 tokens/); assert.match(await done.locator('summary').innerText(), /≈ 3 tok\/s/); assert.match(await done.locator('summary').innerText(), /7 s/); state.release();
      await until(async () => await page.getByRole('button', { name: 'Arrêter la demande', exact: true }).count() === 0);
      state.setMode('error'); await page.getByLabel('Message', { exact: true }).fill('Statistiques après erreur.'); await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
      await until(state.waiting); const failed = stats('stream-reply-3');
      assert.equal(await failed.getAttribute('data-state'), 'partial'); assert.match(await failed.locator('summary').innerText(), /0 tokens/); assert.match(await failed.locator('summary').innerText(), /Partielles/); state.release();
      await until(async () => await page.getByRole('button', { name: 'Arrêter la demande', exact: true }).count() === 0);
      assert.equal(state.requests.filter(item => item.name === '/api/chat').length, 3, 'No reload or stats disclosure replays inference');
      assert.equal(new Set(state.requests.filter(item => item.name === '/api/chat').map(item => item.body.requestId)).size, 3);
      assert.deepEqual(state.unknown, []); assert.deepEqual(errors, []);
      await stats('history-complete').locator('summary').click(); await stats('history-complete').scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, offending: [...document.querySelectorAll('[data-message-stats]')].filter(element => element.scrollWidth > element.clientWidth + 1).length }));
      assert(overflow.page <= overflow.width + 1); assert.equal(overflow.offending, 0);
      const contrast = await stats('history-complete').evaluate(element => ({ foreground: getComputedStyle(element).color, background: getComputedStyle(document.querySelector('.workspace')).backgroundColor, fontSize: getComputedStyle(element).fontSize, rowGap: getComputedStyle(element.querySelector('.stats-summary')).columnGap }));
      if (captures) await page.screenshot({ path: path.join(captures, `stats-${provider}-${width}.png`) });
      // The existing language preference translates the same numeric facts.
      await page.evaluate(instanceId => localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language: 'en', theme: 'system', draftHours: 24 })), state.instanceId);
      await page.reload(); await stats('history-complete').waitFor();
      assert.match(await stats('history-complete').locator('summary').innerText(), /12.5 tok\/s/);
      await stats('history-complete').locator('summary').click(); assert.equal(await readRow(stats('history-complete'), 'Queue before execution'), '2 s');
      assert.deepEqual(errors, []); results.push({ width, provider, historyAndReload: true, liveStopError: true, immediateMetricsBeforeRecovery: true, noInferenceReplay: true, languages: ['fr', 'en'], contrast });
    } catch (error) {
      console.error(JSON.stringify({ width, provider, errors, unknown: state.unknown, requests: state.requests.map(item => item.name), body: (await page.locator('body').innerText()).slice(0, 1800) }));
      throw error;
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ success: true, synthetic: true, realEngines: false, results }, null, 2));
} finally { await browser.close(); }
