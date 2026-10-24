// Real Chromium interaction with fully intercepted synthetic HTTP. No real model or user history.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const userText = '  **Question exacte** — été 🌿\n\nDeuxième ligne.  ';
const replyText = '# Réponse exacte\n\nTexte avec 中文 et **Markdown**.  ';
const results = [];
try {
  for (const width of [1280, 390, 320]) for (const language of ['fr', 'en']) {
    const origin = 'http://127.0.0.1:19991', instanceId = `beta10-message-actions-${width}-${language}`;
    const source = width === 320 ? 'bionic' : 'web', sourceId = source === 'web' ? 'web-11111111-1111-4111-8111-111111111111' : 'native-fixture';
    const chat = { id: sourceId, projectId: 'p1', source, readOnly: source === 'bionic', name: 'Actions synthétiques', model: 'fixture', messages: [{ id: 'source-user', role: 'user', text: userText }, { id: 'source-reply', role: 'assistant', text: replyText, model: 'Un nom de modèle très long pour conserver une vraie place aux actions du message', complete: true }] };
    let fork, posts = 0;
    const errors = [], requests = [], text = (fr, en) => language === 'en' ? en : fr;
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 760, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, origin, 'Every request stays within the intercepted synthetic origin');
      if (url.pathname.startsWith('/api/')) {
        requests.push({ method: request.method(), path: url.pathname });
        let value;
        if (url.pathname === '/api/ping') value = { instanceId, app: 'bionic-mobile-local', version: '2.6.0-beta.9' };
        else if (url.pathname === '/api/projects') value = { projects: [{ id: 'p1', name: 'Projet synthétique' }] };
        else if (url.pathname === '/api/inference/settings') value = { provider: 'bionic', revision: 'synthetic', editable: true, apiUrl: 'http://127.0.0.1:19997' };
        else if (url.pathname === '/api/models') value = { provider: 'bionic', inferenceRevision: 'synthetic', models: [{ id: 'fixture', name: 'Modèle synthétique', type: 'llm', loaded: true, contextLength: 4096 }] };
        else if (url.pathname === '/api/comfy/settings') value = { enabled: false, available: false, workflows: [] };
        else if (url.pathname === '/api/inference/model-selection') value = { busy: false, reconciliationRequired: false };
        else if (url.pathname === '/api/sessions') value = { sessions: [chat, ...(fork ? [fork] : [])].map(item => ({ id: item.id, projectId: item.projectId, source: item.source, name: item.name, origin: item.origin })), total: fork ? 2 : 1 };
        else if (url.pathname === '/api/conversation') value = fork && url.searchParams.get('id') === fork.id ? fork : chat;
        else if (url.pathname === '/api/conversation/fork' && request.method() === 'POST') {
          posts++;
          assert.deepEqual(request.postDataJSON(), { projectId: 'p1', chatId: sourceId, messageId: 'source-user' });
          fork = { id: 'web-22222222-2222-4222-8222-222222222222', projectId: 'p1', source: 'web', name: 'Branche synthétique', model: 'fixture', origin: { kind: 'fork', id: sourceId, projectId: 'p1', messageId: 'source-user' }, messages: [{ id: 'fork-user', role: 'user', text: userText, fromFork: true }] };
          // The operation succeeded, but its response was lost. Recovery must only read.
          return route.abort('connectionfailed');
        } else throw Error('Unexpected synthetic API ' + request.method() + ' ' + url.pathname);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
      }
      const filename = path.resolve(root, 'public', url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.slice(1));
      assert(filename.startsWith(path.resolve(root, 'public') + path.sep));
      const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(filename)] || 'text/html';
      return route.fulfill({ contentType, body: await fs.readFile(filename) });
    });
    await page.addInitScript(({ instanceId, language, sourceId }) => {
      localStorage.setItem('bionic:llama-prototype:' + instanceId, JSON.stringify({ projectId: 'p1', chatId: sourceId }));
      localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language }));
      window.__copiedSource = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async value => { window.__copiedSource.push(value); } } });
    }, { instanceId, language, sourceId });
    try {
      await page.goto(origin + '/prototype/');
      const reply = page.getByRole('article', { name: text('Réponse du modèle', 'Model reply'), exact: true });
      await reply.waitFor();
      const close = page.getByRole('button', { name: text('Fermer la navigation', 'Close navigation'), exact: true });
      if (width < 760 && await close.isVisible()) await close.click();
      const user = page.getByRole('article', { name: text('Votre message', 'Your message'), exact: true });
      const userCopy = user.getByRole('button', { name: text('Copier votre message', 'Copy your message'), exact: true });
      const replyCopy = reply.getByRole('button', { name: text('Copier la réponse', 'Copy the response'), exact: true });
      const branch = user.getByRole('button', { name: text('Créer une branche depuis ce message', 'Create a branch from this message'), exact: true });
      for (const [article, copy] of [[user, userCopy], [reply, replyCopy]]) {
        const header = article.locator('.message-header');
        assert.equal(await header.getByRole('button').count(), 2, 'Both actions belong to the message header');
        const copyBox = await copy.boundingBox(), branchBox = await header.getByRole('button', { name: text('Créer une branche depuis ce message', 'Create a branch from this message'), exact: true }).boundingBox();
        assert(copyBox.width >= 44 && copyBox.height >= 44 && branchBox.width >= 44 && branchBox.height >= 44, 'The quiet icons retain touch targets');
        assert(Math.abs(copyBox.y - branchBox.y) < 1, 'The icons share one row');
        assert(copyBox.x + copyBox.width <= branchBox.x + 1, 'The buttons do not overlap');
        assert.equal(await copy.innerText(), '', 'The compact trigger does not add a visible label row');
        const contentBox = await article.locator('.companion-markdown').first().boundingBox();
        assert(contentBox.y >= copyBox.y + copyBox.height - 1, 'The action row never overlays message text');
        assert(copyBox.x >= 0 && branchBox.x + branchBox.width <= width, 'The header stays inside the viewport');
      }
      assert.equal(await user.locator('.chat-message-user-bubble .message-header').count(), 1, 'User actions are inside their message frame');
      await userCopy.focus(); await userCopy.press('Enter');
      await user.locator('[data-copy-state="copied"]').waitFor();
      if (width < 760) await replyCopy.tap(); else { await replyCopy.focus(); await replyCopy.press('Space'); }
      await reply.locator('[data-copy-state="copied"]').waitFor();
      assert.deepEqual(await page.evaluate(() => window.__copiedSource), [userText, replyText], 'Copy still receives the original strings');
      await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Synthetic refusal'); } } }); document.execCommand = () => false; });
      await replyCopy.click();
      const manual = reply.getByRole('textbox', { name: text('Texte du message à copier', 'Message text to copy'), exact: true });
      await manual.waitFor(); assert.equal(await manual.textContent(), replyText);
      await reply.getByRole('button', { name: text('Sélectionner le texte', 'Select text'), exact: true }).click();
      assert.equal(await page.evaluate(() => getSelection().toString()), replyText);
      await reply.getByRole('button', { name: text('Fermer la sélection du message', 'Close message selection'), exact: true }).click();
      assert(await replyCopy.evaluate(element => element === document.activeElement));
      await userCopy.click();
      const userManual = user.getByRole('textbox', { name: text('Texte du message à copier', 'Message text to copy'), exact: true });
      await userManual.waitFor(); assert.equal(await userManual.textContent(), userText);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Manual copy controls fit inside the user bubble');
      await user.getByRole('button', { name: text('Sélectionner le texte', 'Select text'), exact: true }).click();
      assert.equal(await page.evaluate(() => getSelection().toString()), userText);
      await user.getByRole('button', { name: text('Fermer la sélection du message', 'Close message selection'), exact: true }).click();
      assert(await userCopy.evaluate(element => element === document.activeElement));
      const before = structuredClone(chat);
      if (width < 760) await branch.tap(); else { await branch.focus(); await branch.press('Enter'); }
      const recover = user.getByRole('button', { name: text('Vérifier la modification', 'Check change'), exact: true });
      await recover.waitFor(); assert(await branch.isDisabled()); assert.equal(posts, 1);
      await recover.click();
      await page.getByRole('button', { name: text('Voir la conversation d’origine', 'View source conversation'), exact: true }).waitFor();
      assert.equal(posts, 1, 'Reading the completed branch never repeats the operation');
      assert.deepEqual(chat, before, 'A native or web source remains untouched');
      assert.equal(await page.locator('#message-fork-user').count(), 1, 'Recovery navigates to the branch with the requested boundary');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
      assert.deepEqual(errors, []);
      assert.deepEqual(requests.filter(item => item.method !== 'GET'), [{ method: 'POST', path: '/api/conversation/fork' }]);
      results.push({ width, language, source, integratedHeader: true, exactSource: true, manualFallback: true, restoredFocus: true, touchTargets: true, forkLostResponseRecovered: true, forkPosts: posts, noGeneration: true });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ ok: true, mode: 'real-browser-synthetic-http', results }, null, 2));
} finally { await browser.close(); }
