// Real Chromium; every API and asset is intercepted. No listener, engine or personal data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)), origin = 'http://companion-client.test';
const publicRoot=path.resolve(process.env.BIONIC_BROWSER_PUBLIC_DIR||path.join(root,'public'));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const captures = process.env.BIONIC_BROWSER_CAPTURES, results = [];
if (captures) await fs.mkdir(captures, { recursive: true });
const pid = 'client-project', instanceId = 'client-fixture';
function fixture() {
  const chats = new Map(), receipts = new Map(), posts = [], cancels = [], unknown = [], reads = [];
  chats.set('native-fixture', { id: 'native-fixture', projectId: pid, source: 'native', model: 'fixture', name: 'Historique natif synthétique', messages: [{ id: 'native-reply', role: 'assistant', text: 'Historique synthétique en lecture seule.', complete: true }] });
  let mode = 'success', serial = 0;
  const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
  function complete(requestId, status = 'completed') {
    const receipt = receipts.get(requestId); receipt.status = status;
    const chat = chats.get(receipt.id); chat.generation.status = status;
    const reply = chat.messages.at(-1); reply.text = 'Réponse canonique ' + requestId; reply.complete = status === 'completed'; reply.interrupted = !reply.complete;
    reply.finishedAt = 50; reply.metrics = { inputTokens: 30, outputTokens: 12, responseSeconds: 1, tokensPerSecond: 12 };
    return chat;
  }
  async function api(route) {
    const req = route.request(), url = new URL(req.url()), name = url.pathname;
    if (!name.startsWith('/api/')) return false;
    const body = req.method() === 'POST' ? req.postDataJSON() : undefined;
    let value;
    if (name === '/api/ping') value = { instanceId, version: '2.6.0-beta.7' };
    else if (name === '/api/projects') value = { projects: [{ id: pid, name: 'Projet synthétique', locallyOwned: true },{id:'companion-unassigned',name:'Sans projet',isUnassigned:true}] };
    else if (name === '/api/models') value = { provider:'bionic', inferenceRevision:'synthetic', models: [{ id: 'fixture', name: 'Modèle synthétique', type: 'llm', loaded: true, loadedInstances: [], contextLength: 4096 }] };
    else if (name === '/api/inference/settings') value = { provider: 'bionic', revision: 'synthetic', editable: true, apiUrl: 'http://127.0.0.1:19997' };
    else if (name === '/api/comfy/settings') value = { enabled: false, available: false, workflows: [] };
    else if (name === '/api/inference/model-selection') value = { busy: false, reconciliationRequired: false };
    else if (name === '/api/sessions') {const sessions=[...chats.values()].filter(chat=>chat.projectId===url.searchParams.get('projectId')).map(({messages,...chat})=>chat);value={sessions,total:sessions.length};}
    else if (name === '/api/conversation') value = chats.get(url.searchParams.get('id'));
    else if (name === '/api/chat-request') {
      const requestId = url.searchParams.get('requestId'); reads.push(requestId); value = receipts.get(requestId);
      if (!value) { await json(route, { error: 'Synthetic missing request' }, 404); return true; }
    }
    else if (name === '/api/cancel') {
      cancels.push(body); complete(body.requestId, 'stopped');
      // The effect succeeded; its HTTP response is lost. GET must settle it.
      await route.abort('failed'); return true;
    }
    else if (name === '/api/chat') {
      posts.push(body);
      if (mode === 'refusal') { await json(route, { error: 'Refus synthétique avant effet' }, 403); return true; }
      if (mode === 'missing') { await route.abort('failed'); return true; }
      const id = 'web-00000000-0000-4000-8000-' + String(++serial).padStart(12, '0'), replyId = 'reply-' + serial;
      receipts.set(body.requestId, { id, projectId: pid, status: 'running' });
      chats.set(id, { id, projectId: pid, source: 'web', model: 'fixture', name: 'Suivi synthétique ' + serial, generation: { requestId: body.requestId, status: 'running' }, messages: [{ id: 'user-' + serial, role: 'user', text: body.text, requestId: body.requestId }, { id: replyId, role: 'assistant', text: 'Texte partiel', requestId: body.requestId }] });
      const start = { type: 'start', id, replyId, requestId: body.requestId, model: 'fixture', provider: { id: 'bionic' } };
      if (mode === 'lost') { await route.abort('failed'); return true; }
      let lines = [start, { type: 'delta', text: 'Texte partiel' }];
      if (mode === 'malformed') { complete(body.requestId); lines.push({ type: 'delta', text: { malformed: 'must not render' } }); }
      else if (mode === 'success') {
        const chat = complete(body.requestId); lines = [start, { type: 'context', contextReceipt: { source: 'synthetic' }, outputBudget: { maxOutputTokens: 100 } }, { type: 'delta', text: chat.messages.at(-1).text }, { type: 'action', action: { name: 'synthetic-tool', ok: true } }, { type: 'done', id, replyId, metrics: chat.messages.at(-1).metrics, finishedAt: 50 }];
      }
      await route.fulfill({ contentType: 'application/x-ndjson', body: lines.map(value => JSON.stringify(value)).join('\n') + '\n' }); return true;
    }
    else { unknown.push(name); await json(route, { error: 'Unknown synthetic route' }, 404); return true; }
    await json(route, value || { error: 'Not found' }, value ? 200 : 404); return true;
  }
  return { api, posts, cancels, unknown, reads, complete, mode(value) { mode = value; } };
}
try {
  for (const [width, lang] of [[1280, 'fr'], [320, 'en']]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: lang === 'fr' ? 'fr-FR' : 'en-US', reducedMotion: 'reduce' });
    await context.addInitScript(({ instanceId, lang }) => localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language: lang, theme: 'light', draftHours: 24 })), { instanceId, lang });
    const page = await context.newPage(), state = fixture(), errors = [], csp = [];
    page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (/violates the following|content.security.policy/i.test(message.text())) csp.push(message.text()); });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url()); assert.equal(url.origin, origin, 'All traffic stays in synthetic origin');
      if (await state.api(route)) return;
      const file = path.resolve(publicRoot, url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.slice(1)); assert(file.startsWith(publicRoot + path.sep));
      const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[path.extname(file)] || 'text/html';
      await route.fulfill({ contentType, body: await fs.readFile(file), headers: contentType === 'text/html' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'" } : {} });
    });
    const label = (fr, en) => lang === 'fr' ? fr : en;
    const button = (fr, en) => page.getByRole('button', { name: label(fr, en), exact: true });
    const prompt = () => page.getByRole('textbox', { name: 'Message', exact: true });
    const restoredDraft = async text => { await page.waitForFunction(expected => document.querySelector('#prompt')?.value === expected, text); };
    const send = async text => { await prompt().fill(text); await button('Envoyer', 'Send').click(); };
    const verify = async () => {
      try { await button('Vérifier', 'Check').click({ timeout: 2000 }); }
      catch (failure) {
        // Automatic GET recovery may finish before this manual click reaches the DOM.
        const settled = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').jobs?.length === 0, 'bionic:llama-prototype:' + instanceId);
        if (!settled) throw failure;
      }
    };
    const newChat = async () => {
      const opener = button('Ouvrir la navigation', 'Open navigation'); if (await opener.isVisible()) await opener.click();
      await button('Nouveau chat dans Projet synthétique', 'New chat in Projet synthétique').click();
    };
    const openNative = async () => {
      const opener = button('Ouvrir la navigation', 'Open navigation'); if (await opener.isVisible()) await opener.click();
      await page.locator('.project-group[data-project-id="client-project"] .project-conversations').getByRole('button', { name: 'Historique natif synthétique', exact: true }).click();
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Historique synthétique en lecture seule.').waitFor();
    };
    const assertSettled = async () => { await page.waitForFunction(instanceId => JSON.parse(localStorage.getItem('bionic:llama-prototype:' + instanceId)).jobs.length === 0, instanceId); };
    try {
      await page.goto(origin + '/prototype/'); await prompt().waitFor();await newChat();
      await send('Succès synthétique'); await assertSettled(); assert.equal(state.posts.length, 1);
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Réponse canonique ' + state.posts.at(-1).requestId).waitFor();
      await newChat(); state.mode('refusal'); await send('Conserver après refus');
      await page.waitForFunction(() => document.querySelector('#prompt')?.value === 'Conserver après refus'); await assertSettled(); assert.equal(state.posts.length, 2);
      await newChat(); state.mode('malformed'); await send('Flux invalide'); await assertSettled(); assert.equal(state.posts.length, 3);
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Réponse canonique ' + state.posts.at(-1).requestId).waitFor();
      assert.equal(await page.getByText('must not render').count(), 0);

      await newChat(); state.mode('lost'); await send('Réponse perdue avant le premier événement');
      await button('Arrêter la demande', 'Stop request').waitFor(); const lost = state.posts.at(-1).requestId;
      // Persist a new draft while the request is running, then reload the exact view.
      await prompt().fill('Brouillon conservé après reload'); await prompt().press('End');
      await page.reload(); await prompt().waitFor();
      await restoredDraft('Brouillon conservé après reload'); assert.equal(state.posts.length, 4);
      await button('Arrêter la demande', 'Stop request').waitFor(); state.complete(lost); await verify(); await assertSettled();
      assert.equal(state.posts.length, 4); assert(state.reads.filter(id => id === lost).length >= 2);
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Réponse canonique ' + lost).waitFor();

      await newChat(); state.mode('cancel'); await send('Annulation avec réponse perdue');
      await button('Arrêter la demande', 'Stop request').waitFor(); await button('Arrêter la demande', 'Stop request').click();
      await assertSettled(); assert.equal(state.cancels.length, 1); assert.equal(state.posts.length, 5);

      await openNative(); state.mode('success'); await send('Continuation native avec événement admission'); await assertSettled(); assert.equal(state.posts.length, 6);
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Réponse canonique ' + state.posts.at(-1).requestId).waitFor();
      await prompt().fill('Brouillon de la continuation'); await page.reload(); await restoredDraft('Brouillon de la continuation');
      await openNative(); state.mode('lost'); await send('Continuation native sans réponse admission');
      await button('Arrêter la demande', 'Stop request').waitFor(); const continuation = state.posts.at(-1).requestId;
      await page.waitForFunction(instanceId => JSON.parse(localStorage.getItem('bionic:llama-prototype:' + instanceId)).chatId.startsWith('web-'), instanceId);
      await prompt().fill('Brouillon continuation récupérée');
      await page.waitForFunction(instanceId => { const saved = JSON.parse(localStorage.getItem('bionic:llama-prototype:' + instanceId)), drafts = JSON.parse(localStorage.getItem('bionic:llama-prototype:' + instanceId + ':drafts')); return drafts['client-project:' + saved.chatId]?.text === 'Brouillon continuation récupérée'; }, instanceId);
      await page.reload(); await restoredDraft('Brouillon continuation récupérée');
      state.complete(continuation); await verify(); await assertSettled(); assert.equal(state.posts.length, 7);
      await page.locator('.chat-message:not(.user) .companion-markdown').getByText('Réponse canonique ' + continuation).waitFor();

      await newChat(); state.mode('missing'); await send('Demande incertaine introuvable');
      await page.getByText(label('Demande non retrouvée. Aucun message renvoyé : vérifie à nouveau son état.', 'Request not found. No message was resent: check its state again.'), { exact: true }).waitFor();
      await prompt().fill('Intention suivante'); assert.equal(await button('Envoyer', 'Send').isDisabled(), true, 'Unknown first send remains tracked');
      await newChat(); await prompt().fill('Sortie utilisateur du verrou'); assert.equal(await button('Envoyer', 'Send').isEnabled(), true, 'New chat exits the lock without resending');
      assert.equal(state.posts.length, 8); await verify(); assert.equal(state.posts.length, 8);
      await page.reload();await prompt().waitFor();await newChat(); await restoredDraft('Sortie utilisateur du verrou'); assert.equal(await button('Envoyer', 'Send').isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No overflow at ' + width);
      assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
      if (captures) await page.screenshot({ path: path.join(captures, `client-${lang}-${width}.png`), fullPage: false });
      assert.deepEqual(errors, []); assert.deepEqual(csp, []); assert.deepEqual(state.unknown, []);
      results.push({ width, language: lang, chatPosts: state.posts.length, cancels: state.cancels.length, success: true, refusalDraft: true, malformedRecovered: true, lostResponseAndReloadNoPost: true, cancelResponseLostRecovered: true, nativeContinuationAndLostAdmission: true, unknownRequestUserExit: true, draftAfterReload: true, noOverflow: true });
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ passed: true, mode: 'browser-with-intercepted-synthetic-api', results }, null, 2));
} finally { await browser.close(); }
