// A real browser over intercepted files/APIs only. No server, model or GPU is contacted.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR || path.join(root, 'public'));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const origin = 'http://image-count-beta6.test', captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [];

function fixture(provider) {
  const chats = new Map(), receipts = new Map(), jobs = new Map(), writes = [], unknown = [];
  const instanceId = 'image-count-beta6-' + provider;
  let serial = 0, mode = 'success', releaseDelayedPost;
  const model = { id: 'fixture-model', inferenceId: 'fixture-model', name: 'Modèle synthétique', type: 'llm', loaded: true, contextLength: 16384, tools: true, vision: false, loadedInstances: [] };
  const inference = { provider, apiUrl: 'http://127.0.0.1:1234', llamaUrl: 'http://127.0.0.1:1236', revision: 'fixture-inference', editable: true, busy: false, capabilities: { modelManagement: true } };
  const comfy = { enabled: true, available: true, url: 'http://127.0.0.1:8188', workflowId: 'workflow-a', memoryCleanup: false, modelPolicy: 'keep', queuePaused: false, workflows: [{ id: 'workflow-a', label: 'Workflow A synthétique', negativePrompt: true }] };
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  async function api(route) {
    const req = route.request(), url = new URL(req.url()), name = url.pathname;
    if (!name.startsWith('/api/')) return false;
    const body = req.method() === 'POST' ? req.postDataJSON() : null;
    if (body) writes.push({ name, body });
    let data;
    if (name === '/api/ping') data = { app: 'bionic-mobile-local', version: '2.6.0-beta.6', instanceId };
    else if (name === '/api/projects') data = { projects: [{ id: 'project-a', name: 'Projet A synthétique', locallyOwned: true }, { id: 'project-b', name: 'Projet B synthétique', locallyOwned: true }] };
    else if (name === '/api/models') data = { models: [model], provider: inference.provider, inferenceRevision: inference.revision };
    else if (name === '/api/inference/settings') data = inference;
    else if (name === '/api/inference/model-selection') data = { busy: false, reconciliationRequired: false, editable: true };
    else if (name === '/api/llama-server') data = { profile: { directory: 'C:/synthetic/gguf', endpoint: inference.llamaUrl }, canControl: true, process: { owned: false }, external: [] };
    else if (name === '/api/llama-server/models') data = { models: [{ id: 'fixture-gguf', relativePath: 'fixture.gguf', selectable: true }] };
    else if (name === '/api/comfy/settings') data = comfy;
    else if (name === '/api/sessions') data = { sessions: [...chats.values()].filter(chat => chat.projectId === url.searchParams.get('projectId')).map(({ messages, ...chat }) => chat), total: chats.size };
    else if (name === '/api/conversation') data = chats.get(url.searchParams.get('id'));
    else if (name === '/api/chat-request') data = receipts.get(url.searchParams.get('requestId'));
    else if (name === '/api/comfy/generations') data = { images: [], total: 0, nextCursor: null };
    else if (name === '/api/comfy/generation') data = jobs.get(url.searchParams.get('jobId'));
    else if (name === '/api/comfy/generation/cancel') { data = jobs.get(body.jobId); assert.ok(data); data.status = 'cancelled'; }
    else if (name === '/api/chat') {
      assert.equal(body.imageAccess, true); assert.ok(Number.isInteger(body.imageCount) && body.imageCount >= 1 && body.imageCount <= 5);
      const id = body.sessionId || 'web-' + String(++serial).padStart(8, '0') + '-1111-4111-8111-111111111111';
      const chat = chats.get(id) || { id, projectId: body.projectId, source: 'web', name: 'Chat synthétique', model: model.id, messages: [] };
      Object.assign(chat, { imageAccess: true, imageCount: body.imageCount, imageWorkflowId: body.imageWorkflowId, imageModelPolicy: body.imageModelPolicy || null, generation: { status: 'completed' } });
      const replyId = 'reply-' + (++serial);
      chat.messages.push({ id: 'user-' + serial, role: 'user', text: body.text, requestId: body.requestId }, { id: replyId, role: 'assistant', text: 'Réponse synthétique.', requestId: body.requestId, complete: true });
      chats.set(id, chat); receipts.set(body.requestId, { id, status: 'completed' });
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'start', id, replyId, requestId: body.requestId }, { type: 'delta', text: 'Réponse synthétique.' }, { type: 'done', id, replyId }].map(event => JSON.stringify(event)).join('\n') + '\n' }); return true;
    }
    else if (name === '/api/comfy/generate') {
      assert.ok(Number.isInteger(body.imageCount) && body.imageCount >= 1 && body.imageCount <= 5);
      if (mode === 'refuse') { await json(route, { error: 'Refus synthétique avant effet.' }, 400); return true; }
      const id = body.sessionId || 'web-' + String(++serial).padStart(8, '0') + '-2222-4222-8222-222222222222', messageId = 'image-reply-' + (++serial);
      const generations = Array.from({ length: body.imageCount }, (_, index) => ({ id: 'image-' + serial + '-' + index, status: 'queued', prompt: body.prompt, workflowId: body.workflowId, format: body.format, seed: body.seed + index, queuedLocally: true }));
      for (const job of generations) jobs.set(job.id, job);
      const chat = chats.get(id) || { id, projectId: body.projectId, model: model.id, source: 'web', name: 'Images synthétiques', messages: [] };
      chat.messages.push({ id: messageId, role: 'assistant', requestId: body.requestId, text: '', imageGenerations: generations, complete: true }); chats.set(id, chat);
      receipts.set(body.requestId, { id, status: 'completed' });
      if (mode === 'drop') { mode = 'success'; await route.abort('connectionreset'); return true; }
      if (mode === 'delay') { mode = 'success'; await new Promise(resolve => { releaseDelayedPost = resolve; }); releaseDelayedPost = undefined; }
      // Count one retains compatibility with the existing singular response contract.
      data = { id, messageId, generation: generations[0], ...(body.imageCount > 1 ? { generations } : {}) };
    }
    else { unknown.push(name); await json(route, { error: 'Unknown synthetic route' }, 404); return true; }
    await json(route, data || { error: 'Not found' }, data ? 200 : 404); return true;
  }
  return { api, instanceId, writes, unknown, setMode(next) { mode = next; }, releaseDelayed() { assert.ok(releaseDelayedPost, 'A response is awaiting release'); releaseDelayedPost(); } };
}

async function countWithKeyboard(slider, count) {
  await slider.focus(); await slider.press('Home');
  for (let i = 1; i < count; i++) await slider.press('ArrowRight');
  assert.equal(await slider.inputValue(), String(count));
  assert.equal(await slider.getAttribute('aria-valuetext'), `${count} image${count === 1 ? '' : 's'}`);
}

try {
  for (const width of [1280, 390]) for (const provider of ['bionic', 'llamacpp']) {
    const state = fixture(provider), context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'fr-FR', reducedMotion: 'reduce', hasTouch: width < 760 });
    const page = await context.newPage(), errors = [], csp = [];
    page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', item => { if (/content.security.policy|violates the following|refused to (?:execute|apply|load)/i.test(item.text())) csp.push(item.text()); });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.origin, origin, 'All requests remain intercepted on the synthetic origin');
      if (await state.api(route)) return;
      const file = path.resolve(publicRoot, url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.replace(/^\//, ''));
      assert.ok(file.startsWith(publicRoot + path.sep));
      const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' })[path.extname(file)] || 'text/html';
      await route.fulfill({ contentType, body: await fs.readFile(file), headers: contentType === 'text/html' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'" } : {} });
    });
    const tab = name => page.getByRole('navigation', { name: 'Espace du projet', exact: true }).getByRole('button', { name, exact: true }).click();
    const chatSlider = () => page.locator('#chat-image-count-range'), imageSlider = () => page.locator('#atelier-image-count-range');
    const tools = async () => { const options = page.locator('#chat-tools-options'); if (!await options.evaluate(element => element.matches(':popover-open'))) await page.locator('[data-composer-menu="tools"]').click(); await chatSlider().waitFor(); };
    const closeSidebar = async () => { if (width < 760 && await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).click(); };
    const sidebarAction = async action => { if (width < 760 && await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click(); await action(); await closeSidebar(); };
    try {
      await page.goto(origin + '/prototype/'); await page.getByLabel('Modèle', { exact: true }).waitFor(); await closeSidebar(); await tools();
      assert.equal(await chatSlider().inputValue(), '1');
      assert.equal(await page.getByLabel('Workflow du chat', { exact: true }).getByRole('option', { name: 'Workflow A synthétique', exact: true }).count(), 1, 'Workflow label is readable');
      assert.equal(await page.getByLabel('Modèle', { exact: true }).count(), 1, 'The existing single model field is preserved');
      if (provider === 'llamacpp') await page.getByLabel('Modèle', { exact: true }).getByRole('option', { name: 'fixture.gguf', exact: true }).waitFor({ state: 'attached' });
      for (let count = 1; count <= 5; count++) {
        await tools(); await countWithKeyboard(chatSlider(), count); await page.getByLabel('Message', { exact: true }).fill('Génère une série synthétique ' + count); await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#prompt')?.value === '' && !document.querySelector('.send-controls button[aria-label="Arrêter la demande"]'));
        assert.equal(state.writes.filter(write => write.name === '/api/chat').at(-1).body.imageCount, count);
      }
      await tools(); await page.locator('#chat-image-count').fill('3'); assert.equal(await chatSlider().inputValue(), '3');
      await page.reload(); await page.getByLabel('Modèle', { exact: true }).waitFor(); await closeSidebar(); await tools(); assert.equal(await chatSlider().inputValue(), '3', 'Chat image count survives reload');
      await page.getByLabel('Message', { exact: true }).fill('Valeur hors limites synthétique'); await page.locator('#chat-image-count').fill('6');
      const beforeInvalid = state.writes.filter(write => write.name === '/api/chat').length;
      await page.getByLabel('Message', { exact: true }).press('Enter'); assert.equal(state.writes.filter(write => write.name === '/api/chat').length, beforeInvalid, 'Enter cannot bypass numeric validation'); await page.locator('#chat-image-count').fill('3');
      await sidebarAction(() => page.getByRole('button', { name: 'Projet B synthétique', exact: true }).click()); await tools();
      assert.equal(await chatSlider().inputValue(), '1'); assert.equal(await page.locator('#chat-image-count').inputValue(), '1', 'Slider and numeric entry reset together for another project');
      await page.locator('#chat-image-count').fill('2'); await sidebarAction(() => page.getByRole('button', { name: 'Projet A synthétique', exact: true }).click());
      await sidebarAction(() => page.getByRole('button', { name: 'Chat synthétique', exact: true }).click()); await tools(); assert.equal(await chatSlider().inputValue(), '3', 'Original conversation count is restored');
      await sidebarAction(() => page.getByRole('button', { name: 'Projet B synthétique', exact: true }).click()); await tools(); assert.equal(await chatSlider().inputValue(), '2', 'Another project retains its separate count');
      await sidebarAction(() => page.getByRole('button', { name: 'Projet A synthétique', exact: true }).click()); await sidebarAction(() => page.getByRole('button', { name: 'Chat synthétique', exact: true }).click()); await tools();
      if (captures) await page.screenshot({ path: path.join(captures, `${width}-${provider}-chat-count.png`) });
      await tab('Images'); await imageSlider().waitFor(); assert.equal(await imageSlider().inputValue(), '1', 'Direct workspace starts with its own count');
      const imagePosts = () => state.writes.filter(write => write.name === '/api/comfy/generate');
      for (let count = 1; count <= 5; count++) {
        await countWithKeyboard(imageSlider(), count); await page.getByLabel('Description de l’image', { exact: true }).fill('Série directe synthétique ' + count);
        await page.getByRole('button', { name: count === 1 ? 'Générer une image' : `Générer ${count} images`, exact: true }).click();
        await page.getByText('Demande reçue par le serveur. Tu peux quitter puis retrouver son suivi.', { exact: true }).waitFor();
        assert.equal(imagePosts().at(-1).body.imageCount, count); assert.equal(await page.locator('.images-panel .job').count(), count * (count + 1) / 2, 'Every job in the returned batch is tracked');
      }
      await page.locator('#atelier-image-count').fill('4'); await page.reload(); await page.getByLabel('Modèle', { exact: true }).waitFor(); await closeSidebar(); await tab('Images'); await imageSlider().waitFor();
      assert.equal(await imageSlider().inputValue(), '4', 'Direct image count survives reload');
      assert.equal(await page.locator('.images-panel .job').count(), 15, 'Batch tracking survives reload');
      await tab('Chat'); await sidebarAction(() => page.getByRole('button', { name: 'Projet B synthétique', exact: true }).click()); await tab('Images'); await imageSlider().waitFor(); assert.equal(await imageSlider().inputValue(), '1', 'Another project starts its own direct count');
      await page.locator('#atelier-image-count').fill('2'); await tab('Chat'); await sidebarAction(() => page.getByRole('button', { name: 'Projet A synthétique', exact: true }).click()); await tab('Images'); await imageSlider().waitFor(); assert.equal(await imageSlider().inputValue(), '4', 'Direct count is restored for its project');
      await countWithKeyboard(imageSlider(), 2); state.setMode('refuse'); const refusedBefore = imagePosts().length;
      await page.getByRole('button', { name: 'Générer 2 images', exact: true }).click(); await page.getByText('Demande refusée. Aucun travail image reçu.', { exact: true }).waitFor();
      assert.equal(imagePosts().length, refusedBefore + 1); assert.equal(await page.getByRole('button', { name: 'Générer 2 images', exact: true }).isEnabled(), true, 'A deterministic refusal releases the form');
      state.setMode('drop'); await countWithKeyboard(imageSlider(), 3); const lostBefore = imagePosts().length;
      await page.getByRole('button', { name: 'Générer 3 images', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.images-panel .job')].filter(job => job.textContent.includes('Dans la file')).length === 18);
      assert.equal(imagePosts().length, lostBefore + 1, 'Recovery only reads the batch; no duplicate POST');
      state.setMode('delay'); const delayedBefore = imagePosts().length;
      await page.getByRole('button', { name: 'Générer 3 images', exact: true }).click();
      await page.waitForFunction(() => [...document.querySelectorAll('.images-panel .job')].filter(job => job.textContent.includes('Dans la file')).length === 21);
      state.releaseDelayed(); await page.getByText('Demande reçue par le serveur. Tu peux quitter puis retrouver son suivi.', { exact: true }).waitFor();
      assert.equal(await page.locator('.images-panel .job').count(), 22, 'A late POST merges the same three jobs already recovered by GET, including one refused track');
      assert.equal(imagePosts().length, delayedBefore + 1, 'Late POST reconciliation does not resubmit');
      await page.getByRole('button', { name: 'Annuler l’attente locale', exact: true }).first().click(); await page.getByText('Image retirée de la file locale.', { exact: true }).waitFor();
      assert.equal(state.writes.filter(write => write.name === '/api/comfy/generation/cancel').length, 1, 'One local job is cancelled within the batch');
      assert.equal(await page.getByText('Annulée localement', { exact: true }).count(), 1);
      if (width < 760) { const slider = imageSlider(); await slider.scrollIntoViewIfNeeded(); const box = await slider.boundingBox(); await slider.tap({ position: { x: box.width / 2, y: box.height / 2 } }); assert.equal(await slider.inputValue(), '3', 'Native slider accepts synthesized touch'); }
      if (captures) await page.screenshot({ path: path.join(captures, `${width}-${provider}-direct-count.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No document overflow');
      assert.deepEqual(state.unknown, []); assert.deepEqual(errors, []); assert.deepEqual(csp, []);
      results.push({ width, provider, chatCountsSent: state.writes.filter(write => write.name === '/api/chat').map(write => write.body.imageCount), directCountsSent: imagePosts().map(write => write.body.imageCount), restoredTracking: 15, lostResponseRecoveredJobs: 3, delayedResponseDeduplicatedJobs: 3, singleJobCancellation: true, projectDraftIsolation: true, numericValidation: true, externalCalls: 0, errors, csp });
    } catch (error) { if (captures) await page.screenshot({ path: path.join(captures, `${width}-${provider}-failure.png`) }); throw error; }
    finally { await context.close(); }
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally { await browser.close(); }
