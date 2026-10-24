// Real browser and application mutations; owned synthetic conversations only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createPrototype, PROTOTYPE_PROJECT, PROTOTYPE_MODEL, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [];
try {
  for (const width of [1280, 390]) for (const language of ['fr', 'en']) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-beta10-sidebar-'));
    const fixture = await createPrototype({ root, port: 0, publicDirectory: process.env.BIONIC_BROWSER_PUBLIC_DIR || path.join(sourceRoot, 'public') });
    const a = PROTOTYPE_PROJECT, b = 'prototype-other', loose = 'companion-unassigned', native = 'native-default';
    const sharedId = 'web-' + randomUUID(), secondId = 'web-' + randomUUID(), reads = [], posts = [], errors = [];
    const makeChat = (id, projectId, name, updatedAt) => ({ id, projectId, source: 'web', model: PROTOTYPE_MODEL, name, updatedAt, messages: [{ id: 'user-' + id, role: 'user', text: 'Question synthétique.' }, { id: 'assistant-' + id, role: 'assistant', text: 'Réponse synthétique.', complete: true }] });
    const first = makeChat(sharedId, a, 'Projet A récent', 1000), second = makeChat(secondId, b, 'Projet B existant', 900), webLoose = makeChat('web-' + randomUUID(), loose, 'Sans projet web', 800);
    for (const chat of [first, second, webLoose, ...Array.from({ length: 104 }, (_, index) => makeChat('web-' + randomUUID(), a, 'Projet A ' + String(index).padStart(3, '0'), 700 - index))]) await fixture.app.persistChat(chat);
    const nativeChat = { ...makeChat(sharedId, native, 'Sans projet natif', 850), source: 'bionic', readOnly: true };
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width < 760, reducedMotion: 'reduce' });
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    const text = (fr, en) => language === 'en' ? en : fr;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { const url = new URL(request.url()); if (url.pathname === '/api/sessions') reads.push(url.searchParams.get('projectId')); if (request.method() === 'POST') posts.push(url.pathname); });
    // A second read-only unassigned source demonstrates that the UI must use
    // isUnassigned, not just the local reserved id. No native store is accessed.
    await page.route('**/api/projects', async route => { const response = await route.fetch(), value = await response.json(); if (!response.ok()) return route.fulfill({ response }); await route.fulfill({ response, json: { ...value, projects: [...value.projects, { id: native, name: 'Sans projet · Bionic', isUnassigned: true, type: 'default' }] } }); });
    await page.route('**/api/sessions?**', async route => { const url = new URL(route.request().url()); if (url.searchParams.get('projectId') === native) await route.fulfill({ json: { sessions: [{ ...nativeChat, messages: undefined }], total: 1, hasMore: false, nextCursor: null } }); else await route.continue(); });
    await page.route('**/api/conversation?**', async route => { const url = new URL(route.request().url()); if (url.searchParams.get('projectId') === native) await route.fulfill({ json: nativeChat }); else await route.continue(); });
    const navigation = page.getByRole('complementary', { name: 'Navigation', exact: true });
    const showNavigation = async () => { await page.locator('.companion-shell').waitFor(); const open = page.getByRole('button', { name: text('Ouvrir la navigation', 'Open navigation'), exact: true }); if (await open.isVisible()) await open.click(); };
    const hideNavigation = async () => { if (width < 760) { const close = page.getByRole('button', { name: text('Fermer la navigation', 'Close navigation'), exact: true }); if (await close.isVisible()) await close.click({ timeout: 1000 }).catch(async failure => { if (await close.isVisible()) throw failure; }); } };
    const group = id => navigation.locator('.project-group').filter({ has: page.locator('.project-row .project-select') }).filter({ has: page.locator(`.project-row [aria-controls="project-conversations-${id}"]`) });
    const row = (pid, id) => navigation.locator(`.session-row[data-project-id="${pid}"][data-session-id="${id}"]`);
    try {
      await page.goto(fixture.baseUrl); await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByRole('textbox', { name: 'Message', exact: true }).waitFor();
      const ping = await (await context.request.get(fixture.baseUrl + '/api/ping')).json();
      await page.evaluate(({ instanceId, language }) => localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language })), { instanceId: ping.instanceId, language }); await page.reload();
      await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();await showNavigation();await navigation.getByRole('button',{name:text('Nouveau chat dans Atelier de démonstration','New chat in Atelier de démonstration'),exact:true}).click();await showNavigation(); await row(a, sharedId).waitFor(); await row(native, sharedId).waitFor(); await row(loose, webLoose.id).waitFor();
      assert.equal(await navigation.locator('.project-group').count(), 2);
      assert.equal(await navigation.locator('.unassigned-conversations .session-row').count(), 2);
      assert.equal(await navigation.locator('.unassigned-conversations [data-project-id="' + a + '"]').count(), 0);
      assert.equal(await navigation.locator('[data-unassigned-count]').textContent(), '2');
      assert.equal(reads.includes(b), false, 'unopened projects remain lazy');
      await hideNavigation(); const composer = page.getByRole('textbox', { name: 'Message', exact: true }); await composer.fill('Brouillon A nouveau — conservé'); await showNavigation();
      const toggle = group(b).getByRole('button', { name: text('Déplier le projet Second projet', 'Expand project Second projet'), exact: true });
      await toggle.focus(); await toggle.press('ArrowRight'); await row(b, secondId).waitFor(); assert.equal(await composer.inputValue(), 'Brouillon A nouveau — conservé');
      assert.equal(await group(a).locator('.project-select').evaluate(node => node.classList.contains('active')), true, 'expansion must not navigate');
      const expanded = group(b).getByRole('button', { name: text('Replier le projet Second projet', 'Collapse project Second projet'), exact: true });
      await expanded.focus(); await expanded.press('ArrowRight'); assert.equal(await row(b, secondId).evaluate(node => node === document.activeElement), true);
      await row(b, secondId).click(); await hideNavigation(); await page.getByRole('article', { name: text('Réponse du modèle', 'Model reply'), exact: true }).waitFor();
      await composer.fill('Brouillon B existant — conservé'); await showNavigation();await navigation.getByRole('button',{name:text('Nouveau chat dans Atelier de démonstration','New chat in Atelier de démonstration'),exact:true}).click(); await hideNavigation(); assert.equal(await composer.inputValue(), 'Brouillon A nouveau — conservé');
      await showNavigation(); await row(b, secondId).click(); await hideNavigation(); await page.waitForFunction(value => document.querySelector('#prompt')?.value === value, 'Brouillon B existant — conservé'); assert.equal(await composer.inputValue(), 'Brouillon B existant — conservé');
      await showNavigation(); await row(a, sharedId).click(); await hideNavigation();
      await page.locator('[id="message-assistant-' + sharedId + '"]').waitFor();
      await showNavigation(); assert.equal(await navigation.locator('.session-row.active').count(), 1); assert.equal(await row(native, sharedId).evaluate(node => node.classList.contains('active')), false, 'duplicate ids in another project cannot become active');
      await group(a).getByRole('button', { name: text('Charger d’autres conversations', 'Load more conversations'), exact: true }).click();
      await page.waitForFunction(id => document.querySelector(`.project-group[data-project-id="${id}"]`)?.querySelectorAll('.session-row').length === 105, a);
      assert.equal(await group(b).locator('.session-row').count(), 1);
      await navigation.getByRole('textbox', { name: text('Rechercher un chat', 'Search chats'), exact: true }).fill('Sans projet natif');
      await navigation.getByText(text('Recherche parmi les conversations chargées. Déplie un projet ou charge la suite pour élargir la recherche.', 'Search covers loaded conversations. Expand a project or load more to search further.'), { exact: true }).waitFor();
      assert.equal(await navigation.locator('.session-row:visible').count(), 1); assert.equal(await navigation.locator('.unassigned-conversations .session-row').count(), 1);
      await navigation.getByRole('textbox', { name: text('Rechercher un chat', 'Search chats'), exact: true }).fill(''); await hideNavigation();
      const actions = page.getByLabel(text('Actions de la conversation', 'Conversation actions'), { exact: true });
      await actions.click(); await page.getByRole('button', { name: text('Renommer', 'Rename'), exact: true }).click(); await page.getByLabel(text('Nom de la conversation', 'Conversation name'), { exact: true }).fill('Projet A renommé'); await page.getByRole('button', { name: text('Enregistrer', 'Save'), exact: true }).click();
      await showNavigation(); await row(a, sharedId).filter({ hasText: 'Projet A renommé' }).waitFor(); await hideNavigation();
      await actions.click(); await page.getByRole('button', { name: text('Déplacer vers un projet', 'Move to a project'), exact: true }).click(); await page.getByRole('combobox',{name:text('Projet de destination', 'Destination project'),exact:true}).selectOption(b);
      await Promise.all([page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/api/conversation' && url.searchParams.get('projectId') === b && url.searchParams.get('id') === sharedId; }), page.getByRole('button', { name: text('Enregistrer', 'Save'), exact: true }).click()]);
      await showNavigation(); await row(b, sharedId).waitFor(); assert.equal(await row(a, sharedId).count(), 0); assert.equal(await navigation.locator('.unassigned-conversations .session-row').count(), 2); await hideNavigation();
      await actions.click(); await page.getByRole('button', { name: text('Supprimer la conversation', 'Delete conversation'), exact: true }).click(); await page.getByRole('button', { name: text('Confirmer la suppression', 'Confirm deletion'), exact: true }).click();
      await showNavigation(); await row(b, sharedId).waitFor({ state: 'detached' }); await row(b, secondId).click(); await hideNavigation();
      await actions.click(); await Promise.all([page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/api/conversation' && url.searchParams.get('projectId') === b && ![secondId, sharedId].includes(url.searchParams.get('id')); }), page.getByRole('button', { name: text('Créer une branche', 'Create a branch'), exact: true }).click()]);
      await showNavigation(); await page.waitForFunction(id => document.querySelector(`.project-group[data-project-id="${id}"]`)?.querySelectorAll('.session-row').length === 2, b);
      assert.equal(await navigation.locator('.unassigned-conversations .session-row').count(), 2);
      await navigation.getByRole('button', { name: text('Nouveau chat sans projet', 'New chat without a project'), exact: true }).click(); await hideNavigation();
      assert.equal(await composer.inputValue(), ''); await page.locator('[data-composer-menu="files"]').click();
      const fileProfile = page.getByLabel(text('Droits sur les fichiers', 'File permissions'), { exact: true }); await fileProfile.waitFor({ state: 'visible' }); assert.equal(await fileProfile.inputValue(), 'none'); assert.equal(await fileProfile.isDisabled(), true); await page.keyboard.press('Escape');
      assert.equal(fixture.stats.modelCalls, 0); assert.equal(fixture.stats.externalCalls, 0); assert.equal(posts.includes('/api/chat'), false); assert.deepEqual(errors, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      results.push({ width, language, projectChildren: true, unassignedSources: 2, independentPagination: true, lazyExpansionPreservesDraft: true, keyboardExpansion: true, projectScopedSelection: true, renameMoveDeleteFork: true, draftRestoration: true, noGeneration: true });
    } finally { await context.close(); await fixture.app.close(); assert(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('canae-beta10-sidebar-')); await fs.rm(root, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify({ mode: 'real-browser-synthetic-projects', results }, null, 2));
} finally { await browser.close(); }
