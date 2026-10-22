// Synthetic project-tree journeys. No Bionic, model, GPU, or personal data.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
  ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href)
  : await import('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const origin = 'http://bionic.test';
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const results = [];

function fixture() {
  const now = Date.now();
  const projects = [
    { id: 'p1', name: 'Projet principal avec un nom volontairement long pour le petit écran', sessionsCount: 9 },
    { id: 'p2', name: 'Projet secondaire', sessionsCount: 2 },
    { id: 'companion-unassigned', name: 'Sans projet', isUnassigned: true, sessionsCount: 1 }
  ];
  const chats = projects.flatMap((project, index) => Array.from({ length: project.sessionsCount }, (_, n) => {
    const id = 'web-' + String(index + 1).repeat(8) + '-1111-4111-8111-' + String(n + 1).padStart(12, '0');
    return {
      id, projectId: project.id,
      name: (n === 0 || project.id === 'p1' && n === 7 ? 'Aiguille ' : 'Conversation ') + project.id + ' ' + (n + 1),
      source: 'web', updatedAt: now - n * 1000, fileProfile: 'none', messages: [
        { id: id + '-u', role: 'user', text: 'Question synthétique ' + project.id + ' ' + (n + 1) },
        { id: id + '-a', role: 'assistant', text: 'Réponse synthétique ' + project.id + ' ' + (n + 1), complete: true }
      ]
    };
  }));
  const sessionsReads = [], conversationReads = [], unknownRoutes = [], holds = new Map();
  function holdNextSessions(id) {
    assert.equal(holds.has(id), false, 'one pending hold per project');
    let release;
    const promise = new Promise(resolve => { release = resolve; });
    holds.set(id, promise);
    return release;
  }
  async function respond(url) {
    const route = url.pathname;
    if (route === '/api/status') return { ok: true, models: [{ id: 'synthetic-model', name: 'Modèle de test', type: 'llm', tools: true, loaded: true, contextLength: 16384, reasoning: { allowedOptions: [], default: 'default' } }], addresses: [] };
    if (route === '/api/ping') return { app: 'bionic-mobile-local', version: '2.0.0', instanceId: '44444444-4444-4444-8444-444444444444' };
    if (route === '/api/projects') return { projects };
    if (route === '/api/sessions') {
      const id = url.searchParams.get('projectId');
      assert(projects.some(project => project.id === id), 'sessions must be scoped to a known project');
      sessionsReads.push(id);
      const pending = holds.get(id);
      if (pending) { holds.delete(id); await pending; }
      return { sessions: chats.filter(chat => chat.projectId === id).map(({ messages, ...chat }) => chat), warnings: [], partial: false };
    }
    if (route === '/api/conversation') {
      const id = url.searchParams.get('id'), projectId = url.searchParams.get('projectId');
      conversationReads.push({ id, projectId });
      const chat = chats.find(chat => chat.id === id && chat.projectId === projectId);
      assert(chat, 'conversation must be scoped to its actual project');
      return chat;
    }
    if (route === '/api/comfy/settings') return { enabled: false, url: 'http://127.0.0.1:8188', workflowId: 'synthetic-workflow', activeJobs: 0, workflows: [] };
    if (route === '/api/updates') return { currentVersion: '2.0.0', enabled: false, candidate: null, canInstall: false, installation: { status: 'idle' } };
    if (route === '/api/activity') return { events: [], warnings: [], truncated: false };
    if (route === '/api/login' || route === '/api/logout') return { ok: true };
    unknownRoutes.push(route);
    return { error: 'Route de fixture absente : ' + route };
  }
  return { respond, holdNextSessions, sessionsReads, conversationReads, unknownRoutes, chats };
}

function group(page, id) { return page.locator('.project-group[data-project-id="' + id + '"]'); }
function isSessions(url, id) { const parsed = new URL(url); return parsed.pathname === '/api/sessions' && parsed.searchParams.get('projectId') === id; }
async function sidebar(page, width) { if (width === 320 && await page.locator('#back').isVisible()) await page.locator('#back').click(); }
async function waitRows(page, id, count) { await page.waitForFunction(({ id, count }) => document.querySelectorAll('.project-group[data-project-id="' + id + '"] .session').length === count, { id, count }); }
async function assertNoOverflow(page, label) {
  const measurements = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, list: document.querySelector('#sessions').scrollWidth, listWidth: document.querySelector('#sessions').clientWidth }));
  assert(measurements.document <= measurements.viewport, label + ' document overflow: ' + JSON.stringify(measurements));
  assert(measurements.list <= measurements.listWidth, label + ' tree overflow: ' + JSON.stringify(measurements));
}

try {
  for (const width of [1280, 320]) for (const journey of ['navigation-search-draft', 'late-logout', 'rapid-navigation']) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(), api = fixture(), errors = [];
    page.setDefaultTimeout(6000);
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/api/')) {
        const data = await api.respond(url);
        return route.fulfill({ status: data.error ? 404 : 200, contentType: 'application/json', body: JSON.stringify(data) });
      }
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!/^[\w.-]+$/.test(file)) return route.abort();
      return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : file.endsWith('.svg') ? 'image/svg+xml' : 'application/json', body: await fs.readFile(path.join(root, 'public', file)) });
    });
    const started = performance.now();
    try {
      await page.goto(origin);
      await page.locator('#app').waitFor({ state: 'visible' });
      await waitRows(page, 'p1', 6);
      assert.equal(await page.locator('.project-group').count(), 3);
      assert(api.sessionsReads.length >= 1 && api.sessionsReads.every(id => id === 'p1'), 'only the current project loads initially, including its recovery refresh');
      assert.equal(await page.locator('#project').inputValue(), 'p1');
      assert.equal(await group(page, 'p2').locator('.project-toggle').getAttribute('aria-expanded'), 'false');
      assert.equal(await group(page, 'companion-unassigned').locator('.project-toggle').getAttribute('aria-expanded'), 'false');
      await assertNoOverflow(page, journey + ' initial ' + width);

      if (journey === 'navigation-search-draft') {
        await group(page, 'p1').getByRole('button', { name: 'Afficher plus (3)', exact: true }).click();
        await waitRows(page, 'p1', 9);
        assert.equal(await group(page, 'p1').locator('.project-more').count(), 0);
        assert.equal(await group(page, 'p1').locator('.session').nth(6).evaluate(el => el === document.activeElement), true, 'pagination focuses the first new conversation');
        const toggle = group(page, 'p1').locator('.project-toggle');
        await toggle.focus();
        const childrenId = await toggle.getAttribute('aria-controls');
        assert(childrenId && await page.locator('#' + childrenId).count() === 1, 'expanded control points to its group');
        await toggle.press('ArrowLeft');
        await waitRows(page, 'p1', 0);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        await toggle.press('ArrowRight');
        await waitRows(page, 'p1', 9);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await toggle.press('ArrowRight');
        assert.equal(await group(page, 'p1').locator('.session').first().evaluate(el => el === document.activeElement), true);
        await toggle.focus(); await toggle.press('Enter'); await waitRows(page, 'p1', 0);
        await toggle.press('Space'); await waitRows(page, 'p1', 9);

        await page.locator('#new-chat').click();
        await page.locator('#prompt').fill('Brouillon privé du projet principal');
        await sidebar(page, width);
        await group(page, 'p2').locator('.project-toggle').click();
        await waitRows(page, 'p2', 2);
        assert.equal(await page.locator('#project').inputValue(), 'p1', 'lazy expansion does not select the project');
        assert.equal(await page.locator('#prompt').inputValue(), 'Brouillon privé du projet principal');
        assert.equal(api.sessionsReads.filter(id => id === 'p2').length, 1);
        assert.equal(api.conversationReads.length, 0);
        if (captures) {
          // A taller capture makes the three groups visible together; contracts
          // and overflow checks above and below retain the 900 px test height.
          await group(page, 'p1').locator('.project-toggle').click();
          await page.setViewportSize({ width, height: 1100 });
          await page.locator('#sessions').evaluate(el => { el.scrollTop = 0; });
          await page.screenshot({ path: path.join(captures, width + '-project-tree-groups.png') });
          await page.setViewportSize({ width, height: 900 });
          await group(page, 'p1').locator('.project-toggle').click();
          await waitRows(page, 'p1', 9);
        }
        await group(page, 'p2').locator('.session').first().click();
        await page.waitForFunction(() => document.querySelector('#thread-title').textContent === 'Aiguille p2 1');
        assert.equal(await page.locator('#project').inputValue(), 'p2', 'cross-project conversation selects its actual project');
        assert.equal(await page.locator('#prompt').inputValue(), '');
        assert.equal(api.conversationReads.at(-1).projectId, 'p2');
        await sidebar(page, width);
        await page.locator('#project').selectOption('p1');
        await page.waitForFunction(() => document.querySelector('#prompt').value === 'Brouillon privé du projet principal');
        assert.equal(await group(page, 'p1').locator('.project-select').getAttribute('aria-current'), 'true');

        await page.locator('#search').fill('aiguille');
        await waitRows(page, 'p1', 2); await waitRows(page, 'p2', 1);
        assert.equal(await page.locator('.project-group').count(), 3, 'search keeps every project accessible');
        assert((await page.locator('.project-search-scope').textContent()).includes('conversations chargées'));
        assert((await page.locator('.project-search-scope').textContent()).includes('Déplie les autres projets'));
        assert.equal(api.sessionsReads.filter(id => id === 'companion-unassigned').length, 0, 'search itself does not eagerly load all projects');
        await group(page, 'companion-unassigned').locator('.project-toggle').click();
        await waitRows(page, 'companion-unassigned', 1);
        assert.equal(await page.locator('#project').inputValue(), 'p1');
        assert.equal(await page.locator('#session-count').textContent(), '4');
        await assertNoOverflow(page, journey + ' filtered ' + width);
        await page.locator('#search').fill('aucun-resultat-synthetique');
        await waitRows(page, 'p1', 0); await waitRows(page, 'p2', 0); await waitRows(page, 'companion-unassigned', 0);
        assert.equal(await page.locator('.project-group .project-select:visible').count(), 3);
        await page.locator('#project').selectOption('p2');
        await waitRows(page, 'p2', 2);
        assert.equal(await page.locator('#search').inputValue(), '', 'project select retains its explicit search reset');
        await group(page, 'companion-unassigned').locator('.project-select').click();
        await page.waitForFunction(() => document.querySelector('#project').value === 'companion-unassigned');
        assert.equal(await page.locator('#agent-files').inputValue(), 'none');
        assert.equal(await page.locator('#agent-scripts').isChecked(), false);
      } else if (journey === 'late-logout') {
        const release = api.holdNextSessions('p2');
        const request = page.waitForRequest(request => isSessions(request.url(), 'p2'));
        await group(page, 'p2').locator('.project-toggle').click();
        await request;
        assert.equal(await group(page, 'p2').locator('.project-group-state').textContent(), 'Chargement des conversations…');
        assert.notEqual(await page.evaluate(() => sessionStorage.getItem('bm_project_tree')), null);
        await page.locator('#logout').click();
        await page.locator('#login').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#sessions').innerHTML(), '');
        assert.equal(await page.evaluate(() => sessionStorage.getItem('bm_project_tree')), null);
        const response = page.waitForResponse(response => isSessions(response.url(), 'p2'));
        release(); await response;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('#sessions').innerHTML(), '', 'late lazy response cannot restore private DOM after logout');
        assert.equal(await page.evaluate(() => sessionStorage.getItem('bm_project_tree')), null);
        await page.locator('#code').fill('synthetic-code'); await page.locator('#login-button').click();
        await waitRows(page, 'p1', 6);
        assert.equal(await group(page, 'p2').locator('.project-toggle').getAttribute('aria-expanded'), 'false');
        assert.equal(await group(page, 'p2').locator('.session').count(), 0);
        await group(page, 'p2').locator('.project-toggle').click(); await waitRows(page, 'p2', 2);
        assert.equal(api.sessionsReads.filter(id => id === 'p2').length, 2, 'a new login loads fresh data rather than a private cached result');
      } else {
        await page.locator('#new-chat').click(); await page.locator('#prompt').fill('Brouillon avant navigation rapide'); await sidebar(page, width);
        await group(page, 'p2').locator('.project-toggle').click(); await waitRows(page, 'p2', 2);
        const release = api.holdNextSessions('p2');
        const request = page.waitForRequest(request => isSessions(request.url(), 'p2'));
        await group(page, 'p2').locator('.session').first().click(); await request;
        await group(page, 'p1').locator('.project-select').click();
        await page.waitForFunction(() => document.querySelector('#project').value === 'p1' && document.querySelector('#prompt').value === 'Brouillon avant navigation rapide');
        const response = page.waitForResponse(response => isSessions(response.url(), 'p2'));
        release(); await response;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.locator('#project').inputValue(), 'p1');
        assert.equal(await page.locator('#prompt').inputValue(), 'Brouillon avant navigation rapide');
        assert.equal(api.conversationReads.length, 0, 'superseded cross-project click cannot open its conversation later');
        assert.equal(await group(page, 'p1').locator('.project-select').getAttribute('aria-current'), 'true');
      }
      await assertNoOverflow(page, journey + ' final ' + width);
      assert.deepEqual(errors, []);
      assert.deepEqual(api.unknownRoutes, []);
      if (captures) await page.screenshot({ path: path.join(captures, width + '-project-tree-' + journey + '.png') });
      results.push({ journey, width, passed: true, durationMs: Math.round(performance.now() - started), sessionRequests: api.sessionsReads.length });
    } catch (error) {
      if (captures) await page.screenshot({ path: path.join(captures, width + '-project-tree-' + journey + '-failed.png') }).catch(() => {});
      throw new Error('Project tree: ' + journey + ' at ' + width + ' px: ' + error.message, { cause: error });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ mode: 'synthetic browser only', results, limitations: ['Viewports simulés : aucun téléphone, lecteur d’écran ou réseau Wi-Fi réel.', 'Données de fixture exclusivement : aucune validation de Bionic réel ou de modèle.'] }, null, 2));
} finally { await browser.close(); }
