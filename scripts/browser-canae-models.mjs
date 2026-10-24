// Real companion/browser; synthetic GGUF metadata and fake process backend only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPrototype, PROTOTYPE_CODE } from '../lib/llama-ui-prototype.mjs';
import { createCompanion } from '../server.mjs';
import { createLlamaServerLibrary } from '../lib/llama-server-library.mjs';
import { createLlamaServerSettings, createLlamaServerManager } from '../lib/llama-server-settings.mjs';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome' });
const captures = process.env.BIONIC_BROWSER_CAPTURES || process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const u64 = value => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes; };
const u32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const string = value => Buffer.concat([u64(Buffer.byteLength(value)), Buffer.from(value)]);
const gguf = (name, architecture) => Buffer.concat([Buffer.from('GGUF'), u32(3), u64(0), u64(2), string('general.architecture'), u32(8), string(architecture), string('general.name'), u32(8), string(name)]);
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-models-browser-'));
  const bootstrap = await createPrototype({ root, listen: false, modelDelayMs: 1 });
  const settings = { ...bootstrap.app.settings, port: 0, comfyEnabled: false }; await bootstrap.app.close();
  const directory = path.join(root, 'shared-models'), binaryPath = path.join(root, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  await fs.mkdir(directory); await fs.writeFile(binaryPath, 'Synthetic binary. Never executed.');
  await fs.writeFile(path.join(directory, 'Gemma-E4B-fixture-Q4.gguf'), gguf('Synthetic E4B', 'gemma4')); await fs.writeFile(path.join(directory, 'Qwen-9B-fixture-Q4.gguf'), gguf('Synthetic Qwen', 'qwen35')); await fs.writeFile(path.join(directory, 'mmproj-fixture.gguf'), gguf('Projector', 'clip')); await fs.writeFile(path.join(directory, 'unsupported.gguf'), 'not a GGUF');
  const library = createLlamaServerLibrary({ defaultDirectory: directory });
  const profile = await createLlamaServerSettings({ filename: path.join(root, 'data', 'llama-server-settings.json'), library, initial: { binaryPath } });
  const stats = { starts: 0, stops: 0 }; let current = null, rejectBusy = false;
  const backend = { async occupied() { return !!current?.alive; }, async launch(value) { stats.starts++; current = { alive: true, value }; return current; }, async inspect(value) { return value.alive ? { state: 'running', owned: true, pid: 900001 } : { state: 'stopped', owned: false, exitConfirmed: true }; }, async stop(value) { stats.stops++; value.alive = false; return { state: 'stopped', exitConfirmed: true }; }, close() {} };
  const manager = createLlamaServerManager({ settings: profile, processBackend: backend, assertIdle: async () => { if (rejectBusy) throw Object.assign(Error('Une tâche synthétique est active.'), { status: 409, code: 'fixture-busy' }); }, assertConnectorAvailable: async () => {} });
  const model = { id: 'canae-catalogue-fixture', type: 'llm', name: 'Synthetic unloaded model', loaded: false, contextLength: 8192, loadedInstances: [], reasoning: { allowedOptions: [] } };
  const app = await createCompanion({ root, publicDirectory: path.join(sourceRoot, 'public'), settings, llamaServerManager: manager, nativeStore: { listProjects: async () => [], listSessions: async () => [], getConversation: async () => { throw Object.assign(Error('No native fixture history'), { status: 404 }); } }, modelService: { list: async () => [model], forInference: async () => model, pendingCount: () => 0 }, modelTransport: { identity: { provider: 'bionic', protocol: 'chat-completions', endpoint: 'http://127.0.0.1:19998' }, request: async () => { throw Error('No generation allowed in catalogue fixture'); } }, fetchImpl: async () => { throw Error('No external network allowed in catalogue fixture'); }, localServiceSupervisor: { assertAdmission() {}, activeCount: () => 0, protectedPaths: () => [], snapshot: async () => ({ services: [], disabled: true }), close: async () => {} }, enableUpdateScheduling: false });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  return { app, root, directory, stats, manager, setBusy(value) { rejectBusy = value; }, url: 'http://127.0.0.1:' + app.server.address().port };
}
async function openSettings(page) {
  await page.getByRole('navigation', { name: 'Espace du projet', exact: true }).getByRole('button', { name: 'Paramètres', exact: true }).click();
  await page.getByRole('navigation', { name: 'Catégories des paramètres', exact: true }).getByRole('button', { name: 'Serveurs du PC',exact:true }).click();
  await page.getByRole('navigation', { name: 'Types de serveurs', exact: true }).getByRole('button', { name: 'Moteurs d’inférence',exact:true }).click();
  await page.getByRole('combobox', { name: 'GGUF du profil', exact: true }).waitFor();
}
async function shot(page, name) { if (captures) await page.screenshot({ path: path.join(captures, name), fullPage: false }); }
async function dropReply(page, pathname) {
  let done, failed; const promise = new Promise((resolve, reject) => { done = resolve; failed = reject; });
  await page.route('**' + pathname, async route => { try { const response = await route.fetch(); assert.equal(response.status(), 200); await route.abort('failed'); done(); } catch (error) { failed(error); } });
  return async () => { await promise; await page.unroute('**' + pathname); };
}
const results = [];
try {
  for (const width of [1280, 390]) {
    const f = await fixture(), context = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 } }), page = await context.newPage(), errors = [], posts = [];
    page.setDefaultTimeout(15000); page.on('dialog', dialog => dialog.accept()); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => { if (request.method() === 'POST') posts.push({ pathname: new URL(request.url()).pathname, body: request.postData() }); });
    const actionCount = () => posts.filter(item => item.pathname === '/api/llama-server/action').length;
    try {
      await page.goto(f.url); await page.locator('#access-code').fill(PROTOTYPE_CODE); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); await openSettings(page);
      assert.equal(f.stats.starts, 0); assert.equal(f.stats.stops, 0);
      const catalogue = await f.manager.inventory(), e4b = catalogue.models.find(item => item.name.startsWith('Gemma')), qwen = catalogue.models.find(item => item.name.startsWith('Qwen'));
      assert.equal(catalogue.models.length, 3); assert.equal(catalogue.excludedProjectors, 1); assert(catalogue.models.find(item => !item.selectable));
      await page.getByRole('combobox', { name: 'GGUF du profil', exact: true }).selectOption(e4b.id);
      await page.getByRole('spinbutton', { name: 'Contexte demandé au lancement', exact: true }).fill('6144'); await page.getByRole('slider', { name: 'Curseur pour Contexte demandé au lancement', exact: true }).focus(); await page.keyboard.press('ArrowRight');
      assert(Number(await page.getByRole('spinbutton', { name: 'Contexte demandé au lancement', exact: true }).inputValue()) > 6144);
      await page.getByRole('spinbutton', { name: 'Contexte demandé au lancement', exact: true }).fill('6144'); await page.getByRole('spinbutton', { name: 'Couches sur GPU (0 = CPU)', exact: true }).fill('0');
      await page.getByRole('button', { name: 'Enregistrer le profil', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Profil enregistré' }).waitFor();
      assert.equal((await f.manager.snapshot()).profile.contextSize, 6144); assert.equal(f.stats.starts, 0);
      const check = page.getByRole('checkbox', { name: 'Les autres modèles sont déchargés ; j’autorise ce lancement ou ce remplacement.', exact: true });
      await check.check(); const dropped = await dropReply(page, '/api/llama-server/action'); await page.getByRole('button', { name: 'Démarrer le profil', exact: true }).click(); await dropped(); await page.getByRole('alert').filter({ hasText: /connexion|réseau|fetch|request|interromp|Failed/i }).waitFor();
      await page.getByRole('button', { name: 'Arrêter le processus possédé', exact: true }).waitFor(); assert.equal(f.stats.starts, 1); assert.equal(actionCount(), 1);
      await page.reload(); await openSettings(page); assert.equal(f.stats.starts, 1); assert.equal(actionCount(), 1); await page.getByRole('button', { name: 'Arrêter le processus possédé', exact: true }).waitFor();
      await page.getByRole('combobox', { name: 'GGUF du profil', exact: true }).selectOption(qwen.id); await check.check(); await page.getByRole('button', { name: 'Remplacer le modèle possédé', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Action confirmée' }).waitFor(); assert.equal(f.stats.starts, 2); assert.equal(f.stats.stops, 1);
      await page.getByRole('button', { name: 'Arrêter le processus possédé', exact: true }).click(); await page.getByRole('status').filter({ hasText: 'Action confirmée' }).waitFor(); assert.equal(f.stats.stops, 2);
      f.setBusy(true); await check.check(); await page.getByRole('button', { name: 'Démarrer le profil', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'tâche synthétique' }).waitFor(); assert.equal(f.stats.starts, 2); f.setBusy(false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []); await shot(page, width + '-canae-models.png');
      const ping = await (await context.request.get(f.url + '/api/ping')).json();
      await page.evaluate(instanceId => localStorage.setItem('bionic:llama-preferences:' + instanceId, JSON.stringify({ language: 'en', theme: 'system', draftHours: 24 })), ping.instanceId);
      await page.reload(); await page.getByRole('navigation', { name: 'Project workspace', exact: true }).getByRole('button', { name: 'Settings', exact: true }).click();
      await page.getByRole('navigation', { name: 'Settings categories', exact: true }).getByRole('button', { name: 'PC servers', exact: true }).click();
      await page.getByRole('navigation', { name: 'Server types', exact: true }).getByRole('button', { name: 'Inference engines', exact: true }).click();
      await page.getByRole('heading', { name: 'llama-server library and startup', exact: true }).waitFor(); await page.getByRole('slider', { name: 'Slider for Context requested at startup', exact: true }).waitFor();
      assert.equal(f.stats.starts, 2); assert.equal(f.stats.stops, 2); assert.deepEqual(errors, []); await shot(page, width + '-canae-models-en.png');
      results.push({ width, catalogue: true, noImplicitStart: true, exactContextAndSlider: true, lostReplyRecoveredByGet: true, reloadWithoutRepost: true, replaceAndStopExplicit: true, busyRefusedBeforeEffect: true, localeSwitch: true, starts: f.stats.starts, stops: f.stats.stops, pageErrors: errors.length });
    } catch (error) { await shot(page, width + '-canae-models-failure.png').catch(() => {}); console.error(JSON.stringify({ width, errors, posts: posts.map(item => item.pathname), stats: f.stats })); throw error; }
    finally { await context.close(); await f.app.close(); f.manager.close(); const resolved = path.resolve(f.root); assert(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('canae-models-browser-')); await fs.rm(resolved, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify({ mode: 'real-browser-real-companion-fake-process-backend', results, limitations: ['No actual llama-server binary, model or GPU launched.', 'No active installation or personal configuration accessed.', 'Browser viewports do not qualify physical phones.'] }, null, 2));
} finally { await browser.close(); }
