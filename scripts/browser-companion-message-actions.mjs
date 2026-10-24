// Real browser / HTTP / clipboard / downloads; synthetic project, no external engine.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPrototype, PROTOTYPE_PROJECT, PROTOTYPE_MODEL, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [], captures = process.env.BIONIC_BROWSER_CAPTURES;
if (captures) await fs.mkdir(captures, { recursive: true });
const code = 'const café = "été 🌿";\n  console.log("<img src=x onerror=alert(1)>");\n';
const draft = '  Brouillon exact — 中文 🌿\n\n```js\nconst x = 1;\n```\n';
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64');
try {
  for (const width of [1280, 390, 320]) for (const language of ['fr', 'en']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-message-actions-'));
    const fixture = await createPrototype({ root, port: 0 });
    const id = 'web-' + randomUUID(), errors = [], posts = [];
    await fixture.app.persistChat({ id, projectId: PROTOTYPE_PROJECT, source: 'web', name: 'Code synthétique', model: PROTOTYPE_MODEL, messages: [{ id: 'user-code-fixture', role: 'user', text: 'Code fourni :\n\n```js\nlet fourni = 2;\n```', attachments: [{ name: 'notes-extrait.txt', kind: 'text', text: '<script>Texte passif 🌿</script>', excerpt: true }, { name: 'image-test.png', kind: 'image', hash: 'a'.repeat(64), mime: 'image/png' }, { name: 'image-invalide.svg', kind: 'image', hash: 'https://example.test/foreign', mime: 'image/svg+xml' }] }, { id: 'code-fixture', role: 'assistant', text: 'Un bloc de code :\n\n```js\n' + code + '```\n\nUn lien [guide](https://example.test/).', complete: true }] });
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 760, reducedMotion: 'reduce' });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: fixture.baseUrl });
    const page = await context.newPage();
    await context.route('**/api/attachment-image?**', route => {
      const url = new URL(route.request().url());
      assert.equal(url.origin, fixture.baseUrl); assert.equal(url.searchParams.get('hash'), 'a'.repeat(64)); assert.equal(url.searchParams.get('mime'), 'image/png');
      return route.fulfill({ contentType: 'image/png', body: image });
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    const en = language === 'en', text = (fr, english) => en ? english : fr;
    try {
      await page.goto(fixture.baseUrl);
      await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByRole('navigation', { name: 'Espace du projet', exact: true }).waitFor();
      const ping = await (await context.request.get(fixture.baseUrl + '/api/ping')).json();
      await page.evaluate(({ instanceId, language }) => {
        localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language }));
      }, { instanceId: ping.instanceId, language });
      await page.reload();
      const open = page.getByRole('button', { name: text('Ouvrir la navigation', 'Open navigation'), exact: true });
      if (await open.isVisible()) await open.click();
      await page.locator('.chat-list').getByRole('button', { name: 'Code synthétique', exact: true }).click();
      const close = page.getByRole('button', { name: text('Fermer la navigation', 'Close navigation'), exact: true });
      if (width < 760 && await close.isVisible()) await close.click();
      const reply = page.getByRole('article', { name: text('Réponse du modèle', 'Model reply'), exact: true });
      const user = page.getByRole('article', { name: text('Votre message', 'Your message'), exact: true });
      await user.locator('summary').filter({ hasText: 'notes-extrait.txt' }).click();
      assert.equal(await user.locator('.message-attachments pre').textContent(), '<script>Texte passif 🌿</script>');
      assert.equal(await user.locator('.message-attachments script').count(), 0);
      await user.locator('summary').filter({ hasText: 'image-test.png' }).click();
      await user.getByRole('img', { name: 'image-test.png', exact: true }).evaluate(image => image.decode());
      await user.locator('summary').filter({ hasText: 'image-invalide.svg' }).click();
      await user.getByText(text('Aperçu indisponible pour cette pièce jointe.', 'Preview unavailable for this attachment.'), { exact: true }).waitFor();
      assert.equal(await user.locator('.message-attachments img').count(), 1);
      const copy = reply.getByRole('button', { name: text('Copier le code', 'Copy code'), exact: true });
      await copy.waitFor();
      assert.equal(await reply.locator('.companion-markdown pre code').textContent(), code);
      await user.getByRole('button', { name: text('Copier le code', 'Copy code'), exact: true }).click();
      await user.locator('.code-copy-toolbar [data-copy-state="copied"]').waitFor();
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), 'let fourni = 2;\n');
      assert.equal(await page.locator('.companion-markdown img').count(), 0);
      const link = page.getByRole('link', { name: 'guide', exact: true });
      assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
      await page.bringToFront(); await copy.focus(); await copy.press('Enter');
      await reply.locator('.code-copy-toolbar [data-copy-state="copied"]').waitFor();
      assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n'), code);
      await page.evaluate(() => { window.__codeCopies = []; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }); addEventListener('copy', event => window.__codeCopies.push(event.clipboardData?.getData('text/plain'))); });
      if (width < 760) await copy.tap(); else await copy.click();
      await reply.locator('.code-copy-toolbar [data-copy-state="copied"]').waitFor();
      assert.deepEqual(await page.evaluate(() => window.__codeCopies), [code]);
      await page.evaluate(() => { document.execCommand = () => false; });
      await copy.click();
      const manual = page.getByRole('textbox', { name: text('Code à copier manuellement', 'Code to copy manually'), exact: true });
      await manual.waitFor(); assert.equal(await manual.inputValue(), code);
      await reply.locator('.code-copy-toolbar').getByRole('button', { name: text('Sélectionner le texte', 'Select text'), exact: true }).click();
      assert.equal(await page.evaluate(() => getSelection().toString()), code);
      await reply.locator('.code-copy-toolbar').getByRole('button', { name: text('Fermer la sélection du message', 'Close message selection'), exact: true }).click();
      assert(await copy.evaluate(node => node === document.activeElement));
      const composer = page.getByRole('textbox', { name: text('Message', 'Message'), exact: true });
      await composer.fill(draft);
      const exported = page.getByRole('button', { name: text('Télécharger le brouillon', 'Download draft'), exact: true });
      const [download] = await Promise.all([page.waitForEvent('download'), exported.click()]);
      assert.equal(await download.failure(), null);
      assert.equal(await fs.readFile(await download.path(), 'utf8'), draft);
      assert.equal(await composer.inputValue(), draft);
      assert.deepEqual(posts.filter(route => route !== '/api/login'), []);
      assert.equal(fixture.stats.modelCalls, 0); assert.equal(fixture.stats.promptPosts, 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      if (captures) await page.screenshot({ path: path.join(captures, `${width}-${language}-message-actions.png`) });
      results.push({ width, language, codeExact: true, modernClipboard: true, fallbackClipboard: true, refusalManualSelection: true, draftBytesDownloaded: true, passiveAttachmentPreviews: true, invalidImageRefused: true, noGeneration: true });
    } finally {
      await context.close(); await fixture.app.close();
      assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('canae-message-actions-'));
      await fs.rm(root, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ mode: 'real-browser-synthetic-engines', results }, null, 2));
} finally { await browser.close(); }
