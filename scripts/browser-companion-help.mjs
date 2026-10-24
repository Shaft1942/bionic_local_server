// Real companion HTTP on an owned fixture, then intercepted error/future-contract cases.
// No engine, generation, GPU, user configuration or personal instance is used.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
import { capabilitiesFixture } from '../test/fixtures/companion-help.mjs';

const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const results = [];
try {
  for (const width of [1280, 320]) {
    const root = await fs.mkdtemp(path.join(process.env.BIONIC_HELP_FIXTURE_ROOT || os.tmpdir(), 'companion-help-'));
    // Port 0 is allocated atomically by the OS; no pre-existing listener is reused.
    const fixture = await createPrototype({ root, port: 0 });
    const registry = path.join(root, 'help-process.json');
    await fs.writeFile(registry, JSON.stringify({ pid: process.pid, url: fixture.baseUrl, status: 'running', owned: true }));
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'fr-FR', hasTouch: width === 320, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], posts = [], csp = [];
    let mode = 'actual', payload = capabilitiesFixture(), reads = 0;
    page.setDefaultTimeout(12000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/violates the following|content.security.policy|refused to (?:execute|apply|load)/i.test(message.text())) csp.push(message.text()); });
    page.on('request', request => { if (request.method() !== 'GET') posts.push(new URL(request.url()).pathname); assert.equal(new URL(request.url()).origin, fixture.baseUrl); });
    await page.route('**/api/companion-capabilities', async route => {
      reads++; assert.equal(route.request().method(), 'GET');
      if (mode === 'actual') return route.continue();
      if (mode === 'network') return route.abort('connectionreset');
      await route.fulfill({ status: mode === 'auth' ? 401 : 200, contentType: 'application/json', body: JSON.stringify(mode === 'auth' ? { error: 'Synthetic unauthorized' } : mode === 'malformed' ? { schemaVersion: 99 } : payload) });
    });
    const click = async locator => { if (width === 320) await locator.tap(); else { await locator.focus(); await locator.press('Enter'); } };
    const category = (name, en = false) => page.getByRole('navigation', { name: en ? 'Settings categories' : 'Catégories des paramètres', exact: true }).getByRole('button', { name, exact: true });
    const help = (en = false) => page.getByRole('region', { name: en ? 'Help and capabilities' : 'Aide et capacités', exact: true });
    const reload = (en = false) => help(en).getByRole('button', { name: en ? 'Reload capabilities' : 'Relire les capacités', exact: true });
    const openHelp = async (en = false) => { await click(category(en ? 'Help and capabilities' : 'Aide et capacités', en)); await help(en).getByRole('heading', { name: en ? 'Help and capabilities' : 'Aide et capacités', exact: true }).waitFor(); };
    const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.settings-content,.help-guide')].every(e => e.scrollWidth <= e.clientWidth + 1)), 'Help fits the viewport');
    const screenshot = async name => { if (captures) await page.screenshot({ path: path.join(captures, `${width}-${name}.png`) }); };
    try {
      await page.goto(fixture.baseUrl);
      await page.getByLabel('Code d’accès du prototype').fill(PROTOTYPE_CODE);
      await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      await page.getByRole('navigation', { name: 'Espace du projet', exact: true }).waitFor();
      const close = page.getByRole('button', { name: 'Fermer la navigation', exact: true });
      if (await close.isVisible()) await close.click();
      await click(page.getByRole('navigation', { name: 'Espace du projet', exact: true }).getByRole('button', { name: 'Paramètres', exact: true }));
      await category('Aide et capacités').waitFor();
      const navBox = await category('Aide et capacités').boundingBox(); assert(navBox && navBox.y >= 0 && navBox.y + navBox.height <= 900, 'Help category is visible without horizontal scrolling');
      assert(navBox.height >= 44, 'Help touch target is at least 44px');
      const writesBefore = posts.length;
      await openHelp();
      await help().getByText('Bionic', { exact: true }).waitFor();
      assert.equal(reads, 1);
      assert.match(await page.locator('.model-capabilities summary').innerText(), /synthetic-prototype/);
      assert.match(await help().innerText(), /Connexion et exécution non testées/);
      mode = 'ok'; await click(reload());
      await page.locator('.model-capabilities summary').filter({ hasText: payload.inference.models[0].id }).waitFor();
      assert.equal(reads, 2, 'Actual backend contract consumed before simulated edge cases');
      await noOverflow(); await screenshot('fr-help');
      // Index links open native details and move keyboard focus to their summary.
      await click(help().getByRole('navigation', { name: 'Rubriques d’aide' }).getByRole('link', { name: 'Internet et scripts : choisir ce que tu autorises', exact: true }));
      assert(await page.locator('#help-tools').evaluate(e => e.open));
      assert(await page.locator('#help-tools summary').evaluate(e => e === document.activeElement));
      // All eight topics resolve, including the certificate guide and image memory limits.
      for (const topic of ['start','chat','files','tools','images','connection','troubleshooting','updates']) {
        await page.locator(`#help-${topic}`).evaluate(e => e.open = true);
        assert(!/\b(?:help|beta24\.help|beta25\.help)\.[a-zA-Z]/.test(await page.locator(`#help-${topic}`).innerText()), 'No untranslated guide key');
      }
      await noOverflow();
      // Shortcuts navigate to existing settings and focus the destination, without activating a control.
      for (const [button, heading] of [['Régler la longueur des réponses','Conversation'], ['Régler la conservation des brouillons','Apparence et brouillons'], ['Configurer le moteur de conversation','Moteurs d’inférence'], ['Ouvrir la configuration ComfyUI','Fournisseur images'], ['Ouvrir Connexion sécurisée','Connexion sécurisée'], ['Ouvrir les mises à jour','Mises à jour et diagnostic']]) {
        const link = help().getByRole('button', { name: button, exact: true });
        assert.equal(await link.count(), 1, button);
        await click(link);
        await page.locator('.settings-page:not([hidden])').getByRole('heading', { name: heading, exact: true }).first().waitFor();
        assert(await page.evaluate(() => ['H2','H3'].includes(document.activeElement.tagName)), 'Shortcut moves focus to its destination heading');
        await openHelp();
      }
      assert.equal(posts.length, writesBefore, 'Guide navigation causes no POST');
      // Model capability and parameter support are reported rather than inferred.
      await page.locator('.model-capabilities summary').click();
      await help().getByText('Ce paramètre n’est pas transmis au moteur.', { exact: true }).first().waitFor();
      payload = capabilitiesFixture('llamacpp'); await click(reload()); await help().getByText('llama.cpp', { exact: true }).waitFor();
      const apiManagement = help().locator('dt').filter({ hasText: 'Gestion via l’API du moteur' });
      assert.match(await apiManagement.locator('+ dd').innerText(), /Non pris en charge/);
      assert.match(await page.locator('#help-start').innerText(), /profils locaux/);
      payload.inference.provider = 'future-engine'; payload.images.availability.state = 'ready'; payload.permissions.fileAccess.state = 'granted';
      await click(reload()); await help().getByText('Moteur inconnu', { exact: true }).waitFor();
      assert((await help().getByText('Information non reconnue ; aucune disponibilité confirmée.', { exact: true }).count()) >= 2);
      // Auth, network and malformed response errors discard stale capabilities; retry succeeds.
      for (const errorMode of ['auth','network','malformed']) {
        mode = errorMode; await click(reload()); await help().getByRole('alert').waitFor();
        assert.equal(await help().getByText('Moteur inconnu', { exact: true }).count(), 0);
        assert(await reload().isEnabled());
        mode = 'ok'; payload = capabilitiesFixture(); await click(reload()); await help().getByText('Bionic', { exact: true }).waitFor();
      }
      // Language changes are local and preserve expanded help topics without another capability read.
      const beforeLanguage = reads;
      await click(category('Apparence et brouillons'));
      await page.getByLabel('Langue de l’interface', { exact: true }).selectOption('en');
      await openHelp(true);
      await help(true).getByRole('heading', { name: 'Reported capabilities', exact: true }).waitFor();
      assert(await page.locator('#help-tools').evaluate(e => e.open));
      assert.equal(reads, beforeLanguage);
      await noOverflow();
      await page.locator('.settings-content').evaluate(e => e.scrollTo(0,0)); await screenshot('en-help');
      mode = 'auth'; await click(reload(true)); await help(true).getByRole('alert').waitFor();
      assert.match(await help(true).getByRole('alert').innerText(), /Sign in/);
      await screenshot('en-auth');
      mode = 'ok'; payload = capabilitiesFixture('llamacpp'); await click(reload(true)); await help(true).getByText('llama.cpp', { exact: true }).waitFor();
      assert.equal(posts.length, writesBefore, 'No POST from help, recovery, language or shortcuts');
      assert.equal(fixture.stats.modelCalls, 0); assert.equal(fixture.stats.promptPosts, 0);
      assert.deepEqual(errors, []); assert.deepEqual(csp, []);
      results.push({ width, fr: true, en: true, actualBackendContract: true, keyboard: width === 1280, touch: width === 320, helpVisible: true, guides: 8, shortcutFocus: true, unknownHonest: true, authNetworkMalformedRecovery: true, noPosts: true, noGeneration: true });
    } catch (error) { console.error(JSON.stringify({ width, errors, csp, posts, text: (await page.locator('body').innerText()).slice(0, 2500) })); await screenshot('failure'); throw error; }
    finally { await context.close(); await fixture.app.close(); await fs.writeFile(registry, JSON.stringify({ pid: process.pid, status: 'stopped', owned: true })); }
  }
  console.log(JSON.stringify({ ok: true, synthetic: true, results }, null, 2));
} finally { await browser.close(); }
