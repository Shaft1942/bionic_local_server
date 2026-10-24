// Real HTTP + browser; deliberately inconsistent GET snapshots must not corrupt live SSE.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createPrototype, PROTOTYPE_CODE, PROTOTYPE_PROJECT } from '../lib/llama-ui-prototype.mjs';

const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const applicationRoot = fileURLToPath(new URL('../', import.meta.url));
const assetHtml = await fs.readFile(path.join(applicationRoot, 'public', 'llama-ui', 'index.html'), 'utf8');
const asset = /src="([^"]+\.js)"/.exec(assetHtml)?.[1] || 'unknown';
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-stream-browser-'));
const fixture = await createPrototype({ root: fixtureRoot, port: 0, modelDelayMs: 12000 });
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 } });
const page = await context.newPage(); page.setDefaultTimeout(30000);
const pageErrors = [], modifiedSnapshots = [], requests = [];
let phase = 'snapshots';
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => { if (new URL(request.url()).pathname === '/api/chat' && request.method() === 'POST') requests.push(request.postDataJSON()); });
const normal = text => text.replace(/\s+/g, ' ').trim();

await context.addInitScript(() => {
  const audit = window.__llamaStreamAudit = { active: false, requestId: '', received: '', ended: false, samples: [], violations: [], lastLength: 0, holdTerminal: false, terminalHeld: false, releaseTerminal: false };
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const sample = () => {
    if (!audit.active || !audit.received) return;
    const element = document.querySelector('.chat-message:not(.user) .companion-markdown');
    const visible = normalize(element?.textContent || ''), received = normalize(audit.received);
    if (!received.startsWith(visible)) audit.violations.push({ kind: 'not-prefix', visible, received });
    if (visible.length < audit.lastLength) audit.violations.push({ kind: 'text-regressed', visible, received, previousLength: audit.lastLength });
    audit.lastLength = visible.length; audit.samples.push({ visible, received });
  };
  addEventListener('DOMContentLoaded', () => new MutationObserver(sample).observe(document.body, { childList: true, characterData: true, subtree: true }));
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (resource, options = {}) => {
    const pathname = new URL(typeof resource === 'string' ? resource : resource.url, location.href).pathname;
    const response = await originalFetch(resource, options);
    if (pathname !== '/api/chat' || !response.ok || !response.body) return response;
    audit.requestId = JSON.parse(options.body).requestId; audit.active = true; audit.received = ''; audit.ended = false; audit.samples = []; audit.violations = []; audit.lastLength = 0; audit.terminalHeld = false; audit.releaseTerminal = false;
    const reader = response.body.getReader(), decoder = new TextDecoder(), encoder = new TextEncoder(); let buffered = '', tail = [];
    const observed = new ReadableStream({
      async pull(controller) {
        try {
          while (true) {
            const value = await reader.read();
            if (value.done) { audit.active = false; audit.ended = true; controller.close(); return; }
            buffered += decoder.decode(value.value, { stream: true }); const lines = buffered.split('\n'); buffered = lines.pop() || ''; const output = [];
            for (const line of lines) {
              if (!line.trim()) continue; const event = JSON.parse(line);
              if (audit.holdTerminal) {
                if (event.type === 'delta') { output.push(...tail); tail = [line]; }
                else if (tail.length) tail.push(line); else output.push(line);
                if (event.type === 'done') {
                  audit.terminalHeld = true;
                  while (!audit.releaseTerminal) await new Promise(resolve => setTimeout(resolve, 20));
                  output.push(...tail); tail = [];
                }
              } else output.push(line);
            }
            if (!output.length) continue;
            for (const line of output) { const event = JSON.parse(line); if (event.type === 'delta') audit.received += event.text || ''; }
            controller.enqueue(encoder.encode(output.join('\n') + '\n')); return;
          }
        } catch (error) { audit.active = false; audit.ended = true; controller.error(error); }
      },
      async cancel(reason) { audit.active = false; audit.ended = true; await reader.cancel(reason); }
    }, { highWaterMark: 0 });
    return new Response(observed, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
});

await context.route('**/api/conversation?**', async route => {
  const response = await route.fetch(), conversation = await response.json();
  const audit = await page.evaluate(() => ({ active: window.__llamaStreamAudit.active, requestId: window.__llamaStreamAudit.requestId, received: window.__llamaStreamAudit.received }));
  const reply = conversation.messages?.find(message => message.role === 'assistant' && message.requestId === audit.requestId);
  if (phase === 'snapshots' && audit.active && audit.received && reply) {
    const mode = modifiedSnapshots.length % 2 === 0 ? 'ahead' : 'behind';
    reply.text = mode === 'ahead' ? audit.received + ' CHECKPOINT_AHEAD_MUST_NEVER_APPEAR' : audit.received.slice(0, Math.max(0, audit.received.length - 20));
    modifiedSnapshots.push({ mode, receivedLength: audit.received.length, snapshotLength: reply.text.length });
  }
  await route.fulfill({ response, contentType: 'application/json', body: JSON.stringify(conversation) });
});

try {
  await page.goto(fixture.baseUrl);
  await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
  await page.getByRole('combobox', { name: 'Droits sur les fichiers', exact: true }).selectOption('none');
  await page.locator('.tool-options > summary').click();
  for (const label of ['Recherche web', 'Génération d’images']) {
    const checkbox = page.getByRole('checkbox', { name: label, exact: true });
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Vérification ciblée des checkpoints et du flux.');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.waitForFunction(() => window.__llamaStreamAudit.received.length > 0);
  const until = Date.now() + 20000;
  while (modifiedSnapshots.length < 2 && Date.now() < until) await page.waitForTimeout(100);
  assert(modifiedSnapshots.length >= 2, 'at least one ahead and one behind snapshot must be received while SSE is active');
  await page.waitForTimeout(200);
  const during = await page.evaluate(() => window.__llamaStreamAudit);
  assert.equal(during.active, true, 'both snapshots must run before streaming ends');
  assert(during.samples.length > 1); assert.deepEqual(during.violations, [], 'live text must remain a monotonic prefix of received SSE');
  const visible = normal(await page.locator('.chat-message:not(.user) .companion-markdown').textContent());
  assert.equal(visible, normal(during.received), 'snapshots must not remove received SSE text');
  await page.getByRole('button', { name: 'Déconnecter le flux sans arrêter la demande', exact: true }).click();
  await page.waitForFunction(() => !window.__llamaStreamAudit.active);
  await page.getByRole('article', { name: 'Réponse du modèle', exact: true }).getByText(/Retrouvez ce message en rouvrant/).waitFor();
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Arrêter la demande"]'));
  const chat = (await fixture.app.webChats(PROTOTYPE_PROJECT))[0], saved = await fixture.app.readWeb(chat.id), canonical = saved.messages.at(-1).text;
  assert.equal(normal(await page.locator('.chat-message:not(.user) .companion-markdown').textContent()), normal(canonical));
  assert.equal(saved.messages.length, 2); assert.equal(fixture.stats.modelCalls, 1); assert.equal(requests.length, 1); assert.deepEqual(pageErrors, []);
  const finalAudit = await page.evaluate(() => window.__llamaStreamAudit); assert.deepEqual(finalAudit.violations, []);
  // Hold the final delta together with done while the real server has already completed.
  phase = 'terminal';
  await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click();
  await page.evaluate(() => { window.__llamaStreamAudit.holdTerminal = true; });
  await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Réponse terminale retardée après sa confirmation serveur.');
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await page.waitForFunction(() => window.__llamaStreamAudit.terminalHeld);
  const terminalReceipt = await page.evaluate(async () => (await fetch('/api/chat-request?' + new URLSearchParams({ projectId: 'prototype-project', requestId: window.__llamaStreamAudit.requestId }))).json());
  assert.equal(terminalReceipt.status, 'completed');
  await page.getByRole('button', { name: 'Vérifier', exact: true }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole('button', { name: 'Arrêter la demande', exact: true }).isVisible(), true, 'terminal receipt must not remove the job before its active reader receives the last delta');
  const held = await page.evaluate(() => window.__llamaStreamAudit), terminalChat = await fixture.app.readWeb(terminalReceipt.id), terminalCanonical = terminalChat.messages.at(-1).text;
  assert(held.received.length < terminalCanonical.length, 'a real final delta must still be withheld');
  assert.equal(normal(await page.locator('.chat-message:not(.user) .companion-markdown').textContent()), normal(held.received));
  await page.evaluate(() => { window.__llamaStreamAudit.releaseTerminal = true; });
  await page.waitForFunction(() => !window.__llamaStreamAudit.active);
  await page.waitForFunction(() => !document.querySelector('button[aria-label="Arrêter la demande"]'));
  assert.equal(normal(await page.locator('.chat-message:not(.user) .companion-markdown').textContent()), normal(terminalCanonical));
  assert.equal(fixture.stats.modelCalls, 2); assert.equal(requests.length, 2); assert.equal(terminalChat.messages.length, 2); assert.deepEqual(pageErrors, []);
  const terminalAudit = await page.evaluate(() => window.__llamaStreamAudit); assert.deepEqual(terminalAudit.violations, []);
  console.log(JSON.stringify({ passed: true, mode: 'real-http-real-browser-synthetic-model', asset, modifiedSnapshots, liveSamples: during.samples.length, prefixAndMonotonic: true, detachedAndCanonicalRecovered: true, terminalReceiptBeforeLastDeltaRecovered: true, withheldTailCharacters: terminalCanonical.length - held.received.length, modelCalls: fixture.stats.modelCalls, chatPosts: requests.length, modelCallsPerRequest: 1, messagesPerConversation: terminalChat.messages.length, pageErrors: pageErrors.length }, null, 2));
} finally {
  await context.close(); await browser.close(); await fixture.app.close();
  assert(path.basename(fixtureRoot).startsWith('llama-stream-browser-')); await fs.rm(fixtureRoot, { recursive: true, force: true });
}
