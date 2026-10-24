// Real browser, intercepted API/assets only: no server, model, GPU or personal data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR || path.join(root, 'public'));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const origin = 'http://beta7-images.test', captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' }), results = [];
const pid = 'beta7-project-a', persistedId = 'web-11111111-1111-4111-8111-111111111111', statusId = 'web-22222222-2222-4222-8222-222222222222', navId = 'web-33333333-3333-4333-8333-333333333333';
function syntheticPng() {
  const crc = bytes => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (kind, bytes) => { const type = Buffer.from(kind), out = Buffer.alloc(bytes.length + 12); out.writeUInt32BE(bytes.length); type.copy(out, 4); bytes.copy(out, 8); out.writeUInt32BE(crc(Buffer.concat([type, bytes])), out.length - 4); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(32); header.writeUInt32BE(24, 4); header[8] = 8; header[9] = 2;
  const pixels = Buffer.alloc((32 * 3 + 1) * 24); for (let y = 0; y < 24; y++) for (let x = 0; x < 32; x++) { const offset = y * 97 + 1 + x * 3; pixels[offset] = 50 + x * 4; pixels[offset + 1] = 70 + y * 5; pixels[offset + 2] = 140; }
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const png = syntheticPng();

function fixture() {
  const jobs = new Map(), owners = new Map(), reads = new Map(), writes = [], unknown = [];
  const image = (id, status = 'succeeded', extra = {}) => ({ id, status, prompt: 'Image synthétique ' + id, workflowId: 'workflow-a', workflowLabel: 'Workflow synthétique', width: 320, height: 240, seed: 42, ...(status === 'succeeded' ? { image: { width: 320, height: 240 } } : {}), ...extra });
  const ready = image('persisted-image'), statuses = [image('cancelled-image', 'cancelled'), image('failed-image', 'failed', { error: 'Échec synthétique visible.' }), image('unknown-image', 'unknown'), image('missing-owner', 'queued'), image('expired-session', 'queued'), image('broken-image')], navigating = image('navigation-image', 'running');
  const chats = new Map([
    [persistedId, { id: persistedId, projectId: pid, source: 'web', model: 'fixture-model', name: 'Image directe persistée', messages: [{ id: 'persisted-reply', role: 'assistant', text: 'Image directe synthétique.', directImage: true, complete: true, actions: [{ imageGeneration: ready }], imageGenerations: [ready] }] }],
    [statusId, { id: statusId, projectId: pid, source: 'web', model: 'fixture-model', name: 'États et récupération', messages: [{ id: 'status-reply', role: 'assistant', text: 'États synthétiques.', complete: true, imageGenerations: statuses }] }],
    [navId, { id: navId, projectId: pid, source: 'web', model: 'fixture-model', name: 'Arrêt du suivi', messages: [{ id: 'nav-reply', role: 'assistant', text: 'Suivi synthétique.', complete: true, imageGenerations: [navigating] }] }]
  ]);
  for (const chat of chats.values()) for (const message of chat.messages) for (const job of message.imageGenerations) { jobs.set(job.id, job); owners.set(job.id, { chatId: chat.id, messageId: message.id }); }
  let brokenRequests = 0, serial = 0;
  const json = (route, data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  async function api(route) {
    const req = route.request(), url = new URL(req.url()), name = url.pathname;
    if (!name.startsWith('/api/')) return false;
    const body = req.method() === 'POST' ? req.postDataJSON() : undefined;
    if (body) writes.push({ name, body });
    let data;
    if (name === '/api/ping') data = { version: '2.6.0-beta.7', instanceId: 'beta7-images' };
    else if (name === '/api/projects') data = { projects: [{ id: pid, name: 'Projet images synthétique', locallyOwned: true }, { id: 'beta7-project-b', name: 'Autre projet synthétique', locallyOwned: true }] };
    else if (name === '/api/models') data = { provider:'bionic', inferenceRevision:'synthetic-images', models: [{ id: 'fixture-model', name: 'Modèle synthétique', type: 'llm', loaded: true, contextLength: 16384, loadedInstances: [] }] };
    else if (name === '/api/inference/settings') data = { provider: 'bionic', revision:'synthetic-images', apiUrl: 'http://127.0.0.1:1234', editable: true, busy: false };
    else if (name === '/api/comfy/settings') data = { enabled: true, available: true, workflowId: 'workflow-a', workflows: [{ id: 'workflow-a', label: 'Workflow synthétique' }], modelPolicy: 'keep' };
    else if (name === '/api/model-preferences') data = { automatic: true, maxOutputTokens: 8192, applyToAllSessions: true };
    else if (name === '/api/sessions') data = { sessions: [...chats.values()].filter(chat => chat.projectId === url.searchParams.get('projectId')).map(({ messages, ...chat }) => chat), total: chats.size };
    else if (name === '/api/conversation') data = chats.get(url.searchParams.get('id'));
    else if (name === '/api/chat-request') data = { id: 'web-44444444-4444-4444-8444-444444444444', status: 'completed' };
    else if (name === '/api/comfy/generations') data = { images: [], total: 0, nextCursor: null };
    else if (name === '/api/comfy/generation-image') { assert.equal(url.searchParams.get('projectId'), pid); await route.fulfill({ contentType: 'image/png', body: png }); return true; }
    else if (name === '/api/comfy/generation' || name === '/api/comfy/image') {
      const id = url.searchParams.get('jobId'), owner = owners.get(id);
      assert.equal(url.searchParams.get('projectId'), pid); assert.equal(url.searchParams.get('chatId'), owner?.chatId); assert.equal(url.searchParams.get('messageId'), owner?.messageId);
      if (name.endsWith('/generation')) {
        reads.set(id, (reads.get(id) || 0) + 1);
        if (id === 'missing-owner') { await json(route, { error: 'Scope refused by synthetic owner' }, 403); return true; }
        if (id === 'expired-session') { await json(route, { error: 'Synthetic session expired' }, 401); return true; }
        data = jobs.get(id);
        if (id.startsWith('series-') && reads.get(id) >= 2) { data.status = 'succeeded'; data.image = { width: 320, height: 240 }; data.updatedAt = 20; }
      } else {
        if (id === 'broken-image' && brokenRequests++ === 0) { await json(route, { error: 'Temporary synthetic image failure' }, 404); return true; }
        await route.fulfill({ contentType: 'image/png', body: png, ...(url.searchParams.get('download') === '1' ? { headers: { 'Content-Disposition': 'attachment; filename="synthetic.png"' } } : {}) }); return true;
      }
    }
    else if (name === '/api/chat') {
      const id = 'web-44444444-4444-4444-8444-444444444444', replyId = 'series-reply';
      assert.equal(body.imageCount, 5); const series = Array.from({ length: 5 }, (_, index) => image('series-' + index, 'queued', { seriesIndex: index + 1, seriesTotal: 5, updatedAt: 10 }));
      for (const job of series) { jobs.set(job.id, job); owners.set(job.id, { chatId: id, messageId: replyId }); }
      const action = { id: 'series-tool-' + (++serial), name: 'generate_comfy_image_series', ok: true, imageGenerations: series };
      chats.set(id, { id, projectId: pid, source: 'web', model: 'fixture-model', name: 'Série issue du flux', imageAccess: true, imageCount: 5, messages: [{ id: 'series-user', role: 'user', text: body.text }, { id: replyId, role: 'assistant', text: 'Le texte est terminé ; les images continuent.', actions: [action], imageGenerations: series, complete: true }], generation: { status: 'completed' } });
      await route.fulfill({ contentType: 'application/x-ndjson', body: [{ type: 'start', id, replyId, requestId: body.requestId }, { type: 'action', action }, { type: 'delta', text: 'Le texte est terminé ; les images continuent.' }, { type: 'done', id, replyId }].map(event => JSON.stringify(event)).join('\n') + '\n' }); return true;
    }
    else if (name === '/api/logout') data = { ok: true };
    else { unknown.push(name); await json(route, { error: 'Unknown synthetic route' }, 404); return true; }
    await json(route, data || { error: 'Not found' }, data ? 200 : 404); return true;
  }
  return { api, reads, writes, unknown };
}

try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'fr-FR', reducedMotion: 'reduce' }), page = await context.newPage(), state = fixture(), errors = [], csp = [];
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message)); page.on('console', item => { if (/content.security.policy|violates the following/i.test(item.text())) csp.push(item.text()); });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.origin, origin, 'No external network request'); if (await state.api(route)) return;
      const file = path.resolve(publicRoot, url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.replace(/^\//, '')); assert.ok(file.startsWith(publicRoot + path.sep));
      const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/html';
      await route.fulfill({ contentType, body: await fs.readFile(file), headers: contentType === 'text/html' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'" } : {} });
    });
    await page.addInitScript(({ pid, id }) => localStorage.setItem('bionic:llama-prototype:beta7-images', JSON.stringify({ projectId: pid, chatId: id, jobs: [] })), { pid, id: persistedId });
    const closeSidebar = async () => { const button = page.getByRole('button', { name: 'Fermer la navigation', exact: true }); if (width < 760 && await button.isVisible()) await button.click(); };
    const sidebar = async (action, close = true) => { const button = page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }); if (await button.isVisible()) await button.click(); await action(); if (close) await closeSidebar(); };
    const tab = name => page.getByRole('navigation', { name: 'Espace du projet', exact: true }).getByRole('button', { name, exact: true }).click();
    const decoded = async selector => { const images = page.locator(selector); for (const image of await images.all()) await image.scrollIntoViewIfNeeded(); await page.waitForFunction(selector => [...document.querySelectorAll(selector)].length > 0 && [...document.querySelectorAll(selector)].every(image => image.complete && image.naturalWidth > 0), selector); };
    try {
      await page.goto(origin + '/prototype/'); await page.getByRole('combobox', { name: 'Modèle', exact: true }).waitFor(); await closeSidebar();
      await page.locator('[data-image-job="persisted-image"]').waitFor();
      assert.equal(await page.locator('[data-image-job="persisted-image"]').count(), 1, 'Single and canonical receipts make one card'); await decoded('.message-images img');
      const downloadLink = page.getByRole('link', { name: 'Télécharger', exact: true }), downloadHref = await downloadLink.getAttribute('href'); assert.equal(new URL(downloadHref, origin).searchParams.get('download'), '1'); assert.equal(await downloadLink.getAttribute('download'), '');
      const binary = await page.evaluate(async href => { const response = await fetch(href); return { ok: response.ok, mime: response.headers.get('content-type'), bytes: (await response.arrayBuffer()).byteLength }; }, downloadHref); assert.equal(binary.ok, true); assert.equal(binary.mime, 'image/png'); assert.equal(binary.bytes, png.length);
      await page.getByRole('button', { name: 'Ouvrir la galerie', exact: true }).click(); await page.getByRole('heading', { name: 'Atelier images', exact: true }).waitFor(); await tab('Chat');
      await sidebar(() => page.getByRole('button', { name: 'Nouveau chat', exact: true }).click());
      const tools = page.locator('#chat-tools-options'); if (!await tools.evaluate(element => element.matches(':popover-open'))) await page.locator('[data-composer-menu="tools"]').click(); await tools.waitFor({ state: 'visible' });
      await page.locator('#chat-image-count').fill('5'); await page.getByLabel('Message', { exact: true }).fill('Crée cinq images synthétiques.'); await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#message-series-reply .message-images img').length === 5); await decoded('#message-series-reply .message-images img');
      assert.equal(await page.locator('#message-series-reply [data-image-job]').count(), 5); assert.match(await page.locator('#message-series-reply').textContent(), /Image 5 sur 5/);
      assert.equal(state.writes.filter(write => write.name === '/api/chat').length, 1, 'Polling never resubmits the generation');
      if (captures) {
        if (await tools.evaluate(element => element.matches(':popover-open'))) await page.keyboard.press('Escape');
        await page.locator('#message-series-reply .message-images').evaluate(element => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: path.join(captures, `${width}-series-in-message.png`) });
      }
      await page.reload(); await page.getByRole('combobox', { name: 'Modèle', exact: true }).waitFor(); await closeSidebar();
      // The init script intentionally opens the persisted direct conversation again.
      await sidebar(() => page.getByRole('button', { name: 'Série issue du flux', exact: true }).click()); await decoded('#message-series-reply .message-images img'); assert.equal(await page.locator('#message-series-reply [data-image-job]').count(), 5, 'Images remain visible after reloading');
      await sidebar(() => page.getByRole('button', { name: 'États et récupération', exact: true }).click());
      await page.getByText('Le suivi de cette image est indisponible dans cette conversation.', { exact: true }).waitFor();
      await page.getByText('La connexion a expiré. Reconnecte-toi pour retrouver cette image.', { exact: true }).waitFor();
      assert.match(await page.locator('#message-status-reply').textContent(), /Annulée localement/); assert.match(await page.locator('#message-status-reply').textContent(), /Échec de la génération/); assert.match(await page.locator('#message-status-reply').textContent(), /Résultat incertain/);
      await page.locator('[data-image-job="broken-image"] img').scrollIntoViewIfNeeded(); await page.getByRole('button', { name: 'Réessayer l’affichage', exact: true }).waitFor(); await page.getByRole('button', { name: 'Réessayer l’affichage', exact: true }).click(); await decoded('[data-image-job="broken-image"] img');
      const deniedReads = state.reads.get('missing-owner'), expiredReads = state.reads.get('expired-session');
      await sidebar(() => page.getByRole('button', { name: 'Arrêt du suivi', exact: true }).click()); await page.waitForFunction(() => document.querySelector('[data-image-job="navigation-image"]'));
      await tab('Paramètres'); const beforeSettings = state.reads.get('navigation-image'); await page.waitForTimeout(2200); assert.equal(state.reads.get('navigation-image'), beforeSettings, 'Tracking stops while another workspace is open'); assert.equal(state.reads.get('missing-owner'), deniedReads, 'Forbidden owner is not polled indefinitely'); assert.equal(state.reads.get('expired-session'), expiredReads, 'Expired session is not polled indefinitely');
      await tab('Chat'); await page.waitForFunction(() => document.querySelector('[data-image-job="navigation-image"]')); await sidebar(() => page.getByRole('button', { name: 'Autre projet synthétique', exact: true }).click()); const beforeProject = state.reads.get('navigation-image'); await page.waitForTimeout(2200); assert.equal(state.reads.get('navigation-image'), beforeProject, 'Tracking stops after changing project');
      await sidebar(() => page.getByRole('button', { name: 'Projet images synthétique', exact: true }).click()); await sidebar(() => page.getByRole('button', { name: 'Arrêt du suivi', exact: true }).click()); await page.locator('[data-image-job="navigation-image"]').waitFor(); await sidebar(() => page.getByRole('button', { name: 'Se déconnecter', exact: true }).click(), false); const beforeLogout = state.reads.get('navigation-image'); await page.waitForTimeout(2200); assert.equal(state.reads.get('navigation-image'), beforeLogout, 'Tracking stops after logout');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []); assert.deepEqual(csp, []); assert.deepEqual(state.unknown, []);
      assert.deepEqual(state.writes.map(write => write.name), ['/api/chat', '/api/logout']);
      results.push({ width, persistedDirectImage: true, streamedSeries: 5, recoveredAfterTextCompleted: true, duplicateCards: 0, reload: true, downloadLinkAndBytes: true, galleryLink: true, ownerAndAuthErrorsVisible: true, displayRetry: true, navigationStopsPolling: true, projectStopsPolling: true, logoutStopsPolling: true, generationPosts: 1, externalRequests: 0, errors, csp });
    } catch (error) { console.error(JSON.stringify({ width, errors, unknown: state.unknown, imageSections: await page.locator('.message-images').count(), messageCount: await page.locator('.chat-message').count() })); if (captures) await page.screenshot({ path: path.join(captures, `${width}-failure.png`) }); throw error; }
    finally { await context.close(); }
  }
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally { await browser.close(); }
