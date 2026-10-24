// Real Chromium clipboard, fully intercepted synthetic HTTP pages/APIs. No engine or private data.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const captures = process.env.BIONIC_BROWSER_CAPTURES, results = [];
if (captures) await fs.mkdir(captures, { recursive: true });
const userText = '  **Message utilisateur exact**\n\n```js\nconst café = "été 🌿";\n```\n';
const assistantText = '# Réponse exacte\n\n- Première ligne\n- Deuxième ligne\n\n中文 — العربية — fin.  ';
try { for (const width of [1280, 390]) for (const mode of ['http-lan', 'secure-local']) {
  const origin = mode === 'http-lan' ? 'http://copy-beta7.test' : 'http://127.0.0.1:19995';
  const readerOrigin = 'http://127.0.0.1:19996', instanceId = 'copy-beta7-' + mode + '-' + width, id = 'web-11111111-1111-4111-8111-111111111111';
  const chat = { id, projectId: 'p1', source: 'web', name: 'Copie synthétique', model: 'fixture', generation: { status: 'completed' }, messages: [{ id: 'copy-user', role: 'user', text: userText }, { id: 'copy-assistant', role: 'assistant', text: assistantText, complete: true }] };
  const context = await browser.newContext({ viewport: { width, height: 940 }, locale: 'fr-FR', hasTouch: width < 760, reducedMotion: 'reduce' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: readerOrigin });
  if (mode === 'secure-local') await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const page = await context.newPage(), errors = [], csp = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', entry => { if (/content.security.policy|violates the following|refused to (?:execute|apply|load)/i.test(entry.text())) csp.push(entry.text()); });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === readerOrigin) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Synthetic clipboard reader</title>' });
    assert.equal(url.origin, origin, 'No request leaves the owned synthetic origins');
    if (url.pathname.startsWith('/api/')) {
      requests.push({ path: url.pathname, method: route.request().method() }); let value;
      if (url.pathname === '/api/ping') value = { instanceId, app: 'bionic-mobile-local', version: '2.6.0-beta.7' };
      else if (url.pathname === '/api/projects') value = { projects: [{ id: 'p1', name: 'Projet synthétique' }] };
      else if (url.pathname === '/api/models') value = { provider:'bionic', inferenceRevision:'synthetic', models: [{ id: 'fixture', name: 'Modèle synthétique', type: 'llm', loaded: true, contextLength: 4096 }] };
      else if (url.pathname === '/api/inference/settings') value = { provider: 'bionic', revision: 'synthetic', editable: true, apiUrl: 'http://127.0.0.1:19997' };
      else if (url.pathname === '/api/comfy/settings') value = { enabled: false, available: false, workflows: [] };
      else if (url.pathname === '/api/sessions') value = { sessions: [{ id, projectId: 'p1', name: chat.name, source: 'web' }], total: 1 };
      else if (url.pathname === '/api/conversation') value = chat;
      else if (url.pathname === '/api/inference/model-selection') value = { busy: false, reconciliationRequired: false };
      else throw Error('Unexpected synthetic API ' + url.pathname);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    }
    const filename = path.resolve(root, 'public', url.pathname === '/prototype/' ? 'llama-ui/index.html' : url.pathname.slice(1));
    assert(filename.startsWith(path.resolve(root, 'public') + path.sep));
    const contentType = ({ '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' })[path.extname(filename)] || 'text/html';
    return route.fulfill({ contentType, body: await fs.readFile(filename), headers: contentType === 'text/html' ? { 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data: blob:; object-src 'none'; base-uri 'self'" } : {} });
  });
  await page.addInitScript(({ instanceId, id }) => { localStorage.setItem('bionic:llama-prototype:' + instanceId, JSON.stringify({ projectId: 'p1', chatId: id })); window.__copyEvents = []; window.__modernArguments = []; window.addEventListener('copy', event => window.__copyEvents.push(event.clipboardData?.getData('text/plain'))); if (navigator.clipboard?.writeText) { const write = navigator.clipboard.writeText.bind(navigator.clipboard); Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: text => { window.__modernArguments.push(text); return write(text); } }); } }, { instanceId, id });
  const reader = await context.newPage(); await reader.goto(readerOrigin + '/');
  const readClipboard = async () => { await reader.bringToFront(); return reader.evaluate(() => navigator.clipboard.readText()); };
  const lineEndings = text => text.replaceAll('\r\n', '\n');
  try {
    await page.goto(origin + '/prototype/'); await page.getByRole('button', { name: 'Copier votre message', exact: true }).waitFor();
    if (width < 760 && await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).click();
    assert.equal(await page.evaluate(() => isSecureContext), mode === 'secure-local');
    const userCopy = page.getByRole('button', { name: 'Copier votre message', exact: true }), assistantCopy = page.getByRole('button', { name: 'Copier la réponse', exact: true });
    await page.bringToFront(); await userCopy.focus(); await userCopy.press('Enter');
    await page.getByRole('article', { name: 'Votre message', exact: true }).locator('[data-copy-state="copied"]').waitFor();
    const copiedUser = await readClipboard();
    assert.equal(lineEndings(copiedUser), userText, 'Real clipboard preserves the complete user source (Windows may normalize line endings)');
    await page.bringToFront(); if (width < 760) await assistantCopy.tap(); else { await assistantCopy.focus(); await assistantCopy.press('Space'); }
    await page.getByRole('article', { name: 'Réponse du modèle', exact: true }).locator('[data-copy-state="copied"]').waitFor();
    const copiedAssistant = await readClipboard();
    assert.equal(lineEndings(copiedAssistant), assistantText, 'Real clipboard contains Markdown source, not rendered HTML');
    if (mode === 'http-lan') assert.deepEqual(await page.evaluate(() => window.__copyEvents), [userText, assistantText]);
    else assert.deepEqual(await page.evaluate(() => window.__modernArguments), [userText, assistantText], 'The real modern API receives the unmodified source string');
    await page.bringToFront();
    const buttonSize = await assistantCopy.boundingBox(); assert(buttonSize.height >= 44, 'Touch target remains at least 44px high');
    if (captures) await page.screenshot({ path: path.join(captures, `${width}-${mode}-copy-success.png`) });
    await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new DOMException('Synthetic permission refusal', 'NotAllowedError')) } }); document.execCommand = () => false; });
    if (width < 760) await assistantCopy.tap(); else await assistantCopy.click();
    const reply = page.getByRole('article', { name: 'Réponse du modèle', exact: true });
    await reply.locator('[data-copy-state="refused"]').waitFor();
    assert.equal(await reply.getByRole('status').innerText(), 'Copie non autorisée. Vous pouvez sélectionner le texte ci-dessous.');
    const manual = reply.getByRole('textbox', { name: 'Texte du message à copier', exact: true }); await manual.waitFor();
    assert.equal(await manual.textContent(), assistantText); assert.equal(await reply.getByText('Copié', { exact: true }).count(), 0);
    await reply.getByRole('button', { name: 'Sélectionner le texte', exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => getSelection().toString()), assistantText);
    assert.equal(await readClipboard(), copiedAssistant, 'Refusal and manual selection never overwrite the clipboard or claim success');
    await page.bringToFront(); await reply.getByRole('button', { name: 'Fermer la sélection du message', exact: true }).click(); assert(await assistantCopy.evaluate(element => element === document.activeElement));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Copy feedback fits the mobile viewport');
    // A delayed denied write cannot expose old source after the same message changes.
    await page.evaluate(() => { window.__copyFallbackCalls = 0; document.execCommand = () => { window.__copyFallbackCalls++; return false; }; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => new Promise((resolve, reject) => { window.__rejectCopy = () => reject(new Error('Delayed synthetic refusal')); }) } }); });
    await assistantCopy.click();
    if (width < 760 && await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    chat.messages[1].text = assistantText + '\nVersion actualisée pendant la copie.';
    await page.locator('.project-group[data-project-id="p1"] .project-conversations').getByRole('button', { name: chat.name, exact: true }).click();
    if (width < 760 && await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).click();
    await page.getByText('Version actualisée pendant la copie.', { exact: false }).waitFor();
    await page.evaluate(() => window.__rejectCopy()); await page.waitForTimeout(40);
    assert.equal(await page.locator('.message-copy-manual').count(), 0); assert.equal(await page.evaluate(() => window.__copyFallbackCalls), 0);
    // Unmounting also cancels an unresolved write without running the HTTP fallback.
    await assistantCopy.click();
    if (width < 760 && await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Ouvrir la navigation', exact: true }).click();
    await page.getByRole('button', { name: 'Nouveau chat', exact: true }).click();
    await page.evaluate(() => window.__rejectCopy()); await page.waitForTimeout(40);
    assert.equal(await page.locator('.message-copy-manual').count(), 0); assert.equal(await page.evaluate(() => window.__copyFallbackCalls), 0);
    assert.deepEqual(errors, []); assert.deepEqual(csp, []); assert(requests.every(request => request.method === 'GET'));
    results.push({ width, mode, realClipboardUser: true, realClipboardAssistant: true, exactAPISource: true, platformLineEndings: copiedUser === userText ? 'preserved' : 'Windows CRLF', keyboard: true, touch: width < 760, refusalHonest: true, manualSelection: true, focusRestored: true, changedSourceCancelled: true, obsoleteWriteCancelled: true, pageErrors: 0, cspErrors: 0 });
  } catch (error) { console.error(JSON.stringify({ width, mode, errors, csp, requests, page: (await page.locator('body').innerText()).slice(0, 3500) })); if (captures) await page.screenshot({ path: path.join(captures, `${width}-${mode}-copy-failure.png`) }); throw error; }
  finally { await context.close(); }
} console.log(JSON.stringify({ ok: true, syntheticOnly: true, results }, null, 2)); } finally { await browser.close(); }
