// Real browser + real companion HTTP; projects, inference and ComfyUI are owned fixtures.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE, PROTOTYPE_PROJECT } from '../lib/llama-ui-prototype.mjs';

const applicationRoot = fileURLToPath(new URL('../', import.meta.url));
await fs.access(path.join(applicationRoot, 'public', 'llama-ui', 'index.html')).catch(() => { throw new Error('Build the reviewed frontend first: npm run build:llama-ui.'); });
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const captures = process.env.BIONIC_BROWSER_CAPTURES || process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [];

async function navigateSidebar(page) {
  const opener = page.getByRole('button', { name: 'Ouvrir la navigation', exact: true });
  if (await opener.isVisible()) await opener.click();
}
async function closeMobileSidebar(page, width) {
  if (width < 760 && await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).isVisible()) await page.getByRole('button', { name: 'Fermer la navigation', exact: true }).click();
}
async function login(page, url, width) {
  await page.goto(url);
  await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await page.getByRole('navigation', { name: 'Espace du projet', exact: true }).waitFor();
  await closeMobileSidebar(page, width);
}
async function tab(page, name) { await page.getByRole('navigation', { name: 'Espace du projet', exact: true }).getByRole('button', { name, exact: true }).click(); }
async function noOverflow(page, label) { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label); }
async function screenshot(page, name) { if (captures) await page.screenshot({ path: path.join(captures, name), fullPage: false }); }

try {
  for (const width of [1280, 390]) {
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'llama-browser-fixture-'));
    const fixture = await createPrototype({ root: fixtureRoot, port: 0, modelDelayMs: 4200, imageDelayMs: 4200 });
    const context = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 } });
    const page = await context.newPage(), errors = [], csp = [], chatPosts = [], imagePosts = [];
    page.setDefaultTimeout(15000);
    const observe = observedPage => {
      observedPage.on('pageerror', error => errors.push(error.message));
      observedPage.on('console', message => { if (/content.security.policy|violates the following|refused to (?:execute|apply|load)/i.test(message.text())) csp.push(message.text()); });
    };
    observe(page);
    page.on('request', request => {
      const url = new URL(request.url());
      if (request.method() !== 'POST') return;
      if (url.pathname === '/api/chat') chatPosts.push(request.postDataJSON());
      if (url.pathname === '/api/comfy/generate') imagePosts.push(request.postDataJSON());
    });
    let otherContext;
    try {
      await login(page, fixture.baseUrl, width);
      await noOverflow(page, 'login layout ' + width);
      await navigateSidebar(page);
      await page.getByRole('button', { name: 'Créer un projet', exact: true }).click();
      const projectName = 'Projet navigateur ' + width;
      await page.getByRole('textbox', { name: 'Nom du projet', exact: true }).fill(projectName);
      await page.getByRole('button', { name: 'Créer', exact: true }).click();
      await page.locator('.project-list').getByRole('button', { name: projectName, exact: true }).waitFor();
      await page.locator('.project-list').getByRole('button', { name: 'Atelier de démonstration', exact: true }).click();
      await closeMobileSidebar(page, width);
      await tab(page, 'Fichiers');
      await page.getByRole('button', { name: 'Ouvrir le fichier notes.md', exact: true }).click();
      const editor = page.getByRole('textbox', { name: 'Contenu de notes.md', exact: true });
      await editor.waitFor();
      assert.match(await editor.inputValue(), /note synthétique/);
      const beforeHash = await page.locator('.hash').textContent();
      const fileText = '# Démonstration navigateur\n\nVersion vérifiée à ' + width + ' pixels.\n';
      await editor.fill(fileText);
      await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
      await page.getByRole('button', { name: 'Joindre au chat', exact: true }).waitFor({ state: 'visible' });
      await page.waitForFunction(previous => document.querySelector('.hash')?.textContent !== previous, beforeHash);
      assert.equal(await fs.readFile(path.join(fixture.files, 'notes.md'), 'utf8'), fileText);
      await noOverflow(page, 'files layout ' + width);
      await screenshot(page, width + '-llama-files.png');
      await page.getByRole('button', { name: 'Joindre au chat', exact: true }).click();
      await page.locator('.attachment-chips').getByText('notes.md', { exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'Droits sur les fichiers', exact: true }).selectOption('none');
      const prompt = 'Reprise du chat navigateur ' + width;
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill(prompt);
      await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
      await page.getByRole('article', { name: 'Votre message', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Déconnecter le flux sans arrêter la demande', exact: true }).click();
      assert.equal(chatPosts.length, 1);
      assert.equal(chatPosts[0].attachments.length, 1);
      await page.reload();
      await page.getByRole('article', { name: 'Réponse du modèle', exact: true }).getByText(/Retrouvez ce message en rouvrant/).waitFor();
      await page.getByRole('button', { name: 'Envoyer', exact: true }).waitFor();
      assert.equal(chatPosts.length, 1, 'reload must not POST the chat again');
      assert.equal(fixture.stats.modelCalls, 1);
      assert.equal(await page.locator('.chat-message').count(), 2);
      const chats = await fixture.app.webChats(PROTOTYPE_PROJECT), chatId = chats[0].id;
      const saved = await fixture.app.readWeb(chatId); assert.equal(saved.messages.length, 2); assert.equal(saved.messages[0].attachments[0].text, fileText);
      await noOverflow(page, 'chat layout ' + width);
      await screenshot(page, width + '-llama-chat-recovered.png');

      // A fresh browser context has no local storage, cookie or previous tracking state.
      otherContext = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 } });
      const other = await otherContext.newPage(); other.setDefaultTimeout(15000); observe(other);
      await login(other, fixture.baseUrl, width);
      await navigateSidebar(other);
      await other.getByRole('navigation', { name: 'Conversations', exact: true }).getByRole('button', { name: prompt, exact: true }).click();
      await other.getByRole('article', { name: 'Réponse du modèle', exact: true }).getByText(/Retrouvez ce message en rouvrant/).waitFor();
      assert.equal(await other.locator('.chat-message').count(), 2);
      assert.equal(fixture.stats.modelCalls, 1);

      await tab(page, 'Images');
      await page.getByRole('textbox', { name: 'Description de l’image', exact: true }).fill('Gradient bleu synthétique ' + width);
      await page.getByRole('textbox', { name: 'Seed', exact: true }).fill('42');
      await page.getByRole('button', { name: 'Générer une image de test', exact: true }).click();
      await page.locator('.job-prompt').filter({ hasText: 'Gradient bleu synthétique ' + width }).waitFor();
      assert.equal(imagePosts.length, 1); assert.equal(fixture.stats.promptPosts, 1);
      await page.reload(); await tab(page, 'Images');
      await page.locator('.gallery-item').waitFor();
      await page.locator('.job img').waitFor();
      await page.waitForFunction(() => { const image = document.querySelector('.gallery-item img'); return image instanceof HTMLImageElement && image.complete && image.naturalWidth === 1024; });
      assert.equal(await page.locator('.gallery-item').count(), 1);
      assert.equal(imagePosts.length, 1); assert.equal(fixture.stats.promptPosts, 1);
      assert.equal(await page.locator('.gallery-item img').evaluate(image => image.complete && image.naturalWidth === 1024), true);
      await noOverflow(page, 'images layout ' + width);
      await screenshot(page, width + '-llama-image-recovered.png');
      await tab(other, 'Images'); await other.locator('.gallery-item').waitFor();
      assert.equal(await other.locator('.gallery-item').count(), 1);
      assert.equal(fixture.stats.promptPosts, 1);
      assert.deepEqual(errors, [], 'uncaught browser errors'); assert.deepEqual(csp, [], 'CSP violations');
      results.push({ width, passed: true, projectCreation: true, versionedFileEdit: true, attachmentSnapshot: true, disconnectedChatRecovered: true, freshBrowserRecovered: true, imageReloadRecovered: true, modelCalls: fixture.stats.modelCalls, promptPosts: fixture.stats.promptPosts, pageErrors: errors.length, cspViolations: csp.length });
    } catch (error) {
      await screenshot(page, width + '-llama-failure.png').catch(() => {});
      console.error(JSON.stringify({ width, pageErrors: errors, cspViolations: csp, modelCalls: fixture.stats.modelCalls, promptPosts: fixture.stats.promptPosts }));
      throw error;
    } finally {
      await otherContext?.close(); await context.close(); await fixture.app.close();
      assert(path.basename(fixtureRoot).startsWith('llama-browser-fixture-'));
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ mode: 'real-browser-real-http-synthetic-engines', results, limitations: ['Simulated desktop/mobile viewports; no physical phone or Wi-Fi qualification.', 'No active Bionic/ComfyUI installation, real model or GPU used.'] }, null, 2));
} finally { await browser.close(); }
