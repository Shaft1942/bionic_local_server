// Real browser, authenticated HTTP and adapters. Only synthetic GGUF headers and a fake process backend.
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-composer-models-'));
  const bootstrap = await createPrototype({ root, listen: false, modelDelayMs: 1 });
  const settings = { ...bootstrap.app.settings, port: 0, comfyEnabled: false, inferenceProvider: 'llamacpp', llamaUrl: 'http://127.0.0.1:1238' };
  await bootstrap.app.close();
  const directory = path.join(root, 'shared-models'), binaryPath = path.join(root, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  await fs.mkdir(directory); await fs.writeFile(binaryPath, 'Synthetic binary. Never executed.');
  await fs.writeFile(path.join(directory, 'Gemma-E4B-fixture-Q4.gguf'), gguf('Synthetic E4B', 'gemma4'));
  await fs.writeFile(path.join(directory, 'Qwen-9B-fixture-Q4.gguf'), gguf('Synthetic Qwen', 'qwen35'));
  await fs.writeFile(path.join(directory, 'mmproj-fixture.gguf'), gguf('Projector', 'clip'));
  const library = createLlamaServerLibrary({ defaultDirectory: directory });
  const profile = await createLlamaServerSettings({ filename: path.join(root, 'data', 'llama-server-settings.json'), library, initial: { binaryPath } });
  const stats = { starts: 0, stops: 0, modelCalls: 0 }; let current = null, rejectBusy = false, external = false, delayed = false, unconfirmed = false, release = null;
  const backend = {
    async occupied() { return !!current?.alive; },
    async launch(value) { stats.starts++; current = { alive: true, value, unconfirmed, ready: delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve() }; return current; },
    async inspect(value) { await value.ready; return value.alive ? { state: value.unconfirmed ? 'starting' : 'running', owned: true, pid: 900002 } : { state: 'stopped', owned: false, exitConfirmed: true }; },
    async stop(value) { stats.stops++; value.alive = false; return { state: 'stopped', exitConfirmed: true }; }, close() {}
  };
  const manager = createLlamaServerManager({ settings: profile, processBackend: backend, startTimeoutMs: 40, pollMs: 5,
    assertIdle: async () => { if (rejectBusy) throw Object.assign(Error('Une tâche synthétique est active.'), { status: 409, code: 'fixture-busy' }); },
    assertConnectorAvailable: async () => { if (external) throw Object.assign(Error('Arrête le serveur externe avant de charger ce GGUF.'), { status: 409, code: 'fixture-external-active' }); }
  });
  const fetchImpl = async (value, options = {}) => {
    const url = new URL(value);
    assert(['http://127.0.0.1:1238', 'http://127.0.0.1:19998'].includes(url.origin), 'No external engine or network in fixture');
    if (url.pathname === '/v1/models') return Response.json({ data: current?.alive ? [{ id: current.value.alias, meta: { n_ctx_train: 8192 } }] : [] });
    if (url.pathname === '/props') return Response.json({ total_slots: 1, default_generation_settings: { n_ctx: 8192 }, build_info: 'fixture' });
    if (url.pathname === '/api/v1/models') return Response.json({ models: ['one', 'two'].map(key => ({ key: 'bionic-' + key, display_name: 'Bionic fixture ' + key, type: 'llm', loaded_instances: [] })) });
    if (url.pathname === '/v1/chat/completions') {
      assert.equal(options.method, 'POST'); stats.modelCalls++;
      return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Réponse synthétique du GGUF choisi.' }, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n');
    }
    throw Error('Unexpected synthetic route: ' + url.pathname);
  };
  const app = await createCompanion({ root, publicDirectory: path.join(sourceRoot, 'public'), settings, llamaServerManager: manager, inferenceEnvironment: {}, fetchImpl,
    nativeStore: { listProjects: async () => [], listSessions: async () => [], getConversation: async () => { throw Object.assign(Error('No native fixture history'), { status: 404 }); } },
    localServiceSupervisor: { assertAdmission() {}, activeCount: () => 0, protectedPaths: () => [], snapshot: async () => ({ services: [], disabled: true }), close: async () => {} }, enableUpdateScheduling: false
  });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  return { app, root, stats, manager, setBusy(value) { rejectBusy = value; }, setExternal(value) { external = value; }, delay() { delayed = true; }, release() { delayed = false; release?.(); }, unknown() { unconfirmed = true; }, confirm() { unconfirmed = false; current.unconfirmed = false; }, url: 'http://127.0.0.1:' + app.server.address().port };
}
async function shot(page, name) { if (captures) await page.screenshot({ path: path.join(captures, name), fullPage: false }); }
async function dropReply(page, pathname) {
  let done, failed; const promise = new Promise((resolve, reject) => { done = resolve; failed = reject; });
  await page.route('**' + pathname, async route => { try { const response = await route.fetch(); assert.equal(response.status(), 200, await response.text()); await route.abort('failed'); done(); } catch (error) { failed(error); } });
  return async () => { await promise; await page.unroute('**' + pathname); };
}
const results = [];
try {
  for (const width of [1280, 390]) {
    const f = await fixture(), context = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 }, colorScheme: width === 390 ? 'dark' : 'light' }), page = await context.newPage(), errors = [], csp = [], posts = [], confirmations = [];
    page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (/content.security.policy|violates the following|refused to (?:apply|load|execute)/i.test(entry.text())) csp.push(entry.text()); });
    page.on('request', request => { if (request.method() === 'POST') posts.push(new URL(request.url()).pathname); });
    const actionCount = () => posts.filter(pathname => pathname === '/api/inference/select-model').length;
    try {
      await page.goto(f.url); await page.locator('#access-code').fill(PROTOTYPE_CODE); await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      const picker = page.getByRole('combobox', { name: 'Fichier GGUF', exact: true }), prompt = page.getByRole('textbox', { name: 'Message', exact: true });
      await picker.waitFor(); await page.waitForFunction(() => document.querySelector('[aria-label="Fichier GGUF"]')?.options.length === 3);
      const files = await f.manager.inventory(), e4b = files.models.find(item => item.name.startsWith('Gemma')), qwen = files.models.find(item => item.name.startsWith('Qwen'));
      assert.equal(files.models.length, 2); assert.equal(files.excludedProjectors, 1);
      await prompt.fill('Brouillon conservé pendant le choix de modèle.');
      await picker.selectOption(e4b.id); assert.equal(f.stats.starts, 0); assert.equal(actionCount(), 0);
      page.once('dialog', dialog => dialog.dismiss()); await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click();
      assert.equal(f.stats.starts, 0); assert.equal(actionCount(), 0); assert.equal(await prompt.inputValue(), 'Brouillon conservé pendant le choix de modèle.');
      page.on('dialog', dialog => { confirmations.push(dialog.message()); dialog.accept(); });
      await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor();
      assert.equal(f.stats.starts, 1); assert.equal(actionCount(), 1); assert.equal((await f.manager.snapshot()).process.model.id, e4b.id);
      assert.equal(await prompt.inputValue(), 'Brouillon conservé pendant le choix de modèle.');
      await page.reload(); await picker.waitFor(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor(); assert.equal(await picker.inputValue(), e4b.id); assert.equal(f.stats.starts, 1); assert.equal(actionCount(), 1);
      const tokenState = await (await context.request.get(f.url + '/api/inference/settings')).json();
      const tokenSetup = await context.request.post(f.url + '/api/inference/settings', { data: { provider: 'llamacpp', llamaToken: 'synthetic-fixture-token', expectedRevision: tokenState.revision }, headers: { Origin: f.url } }); assert.equal(tokenSetup.status(), 200, await tokenSetup.text());
      await page.reload(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor();
      await picker.selectOption(qwen.id); const dropped = await dropReply(page, '/api/inference/select-model');
      await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click(); await dropped(); await page.getByRole('status').filter({ hasText: 'État retrouvé' }).waitFor(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor();
      assert.equal(f.stats.starts, 2); assert.equal(f.stats.stops, 1); assert.equal(actionCount(), 2); assert.equal((await f.manager.snapshot()).process.model.id, qwen.id);
      assert(confirmations.at(-1).includes('jeton du llama-server externe sera effacé')); assert.equal((await (await context.request.get(f.url + '/api/inference/settings')).json()).hasLlamaToken, false);
      assert.equal(await page.getByRole('button', { name: 'Envoyer', exact: true }).isEnabled(), true);
      assert.equal(await prompt.inputValue(), 'Brouillon conservé pendant le choix de modèle.');
      await page.reload(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor(); assert.equal(await picker.inputValue(), qwen.id); assert.equal(actionCount(), 2); assert.equal(f.stats.starts, 2);
      f.setBusy(true); await picker.selectOption(e4b.id); await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'tâche synthétique' }).waitFor(); assert.equal(f.stats.starts, 2); assert.equal(f.stats.stops, 1); f.setBusy(false);
      f.setExternal(true); await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click(); await page.getByRole('alert').filter({ hasText: 'serveur externe' }).waitFor(); assert.equal(f.stats.starts, 2); assert.equal(f.stats.stops, 1); f.setExternal(false);
      f.delay(); await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click();
      await page.getByRole('button', { name: 'Chargement…', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Envoyer', exact: true }).isDisabled(), true);
      await prompt.press('Enter'); assert.equal(posts.filter(pathname => pathname === '/api/chat').length, 0); assert.equal(f.stats.modelCalls, 0);
      f.release(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor(); assert.equal(f.stats.starts, 3); assert.equal(f.stats.stops, 2);
      f.unknown(); await picker.selectOption(qwen.id); await page.getByRole('button', { name: 'Charger le GGUF', exact: true }).click();
      await page.getByRole('button', { name: 'À vérifier', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: 'Envoyer', exact: true }).isDisabled(), true); assert.equal(f.stats.starts, 4);
      const beforeRecovery = actionCount(); f.confirm(); await page.getByRole('button', { name: 'GGUF actif', exact: true }).waitFor();
      assert.equal(actionCount(), beforeRecovery); assert.equal(f.stats.starts, 4); assert.equal(f.stats.stops, 3); assert.equal(await page.getByRole('button', { name: 'Envoyer', exact: true }).isEnabled(), true);
      await shot(page, width + '-composer-gguf.png');
      const inference = await (await context.request.get(f.url + '/api/inference/settings')).json();
      const switched = await context.request.post(f.url + '/api/inference/settings', { data: { provider: 'bionic', expectedRevision: inference.revision }, headers: { Origin: f.url } }); assert.equal(switched.status(), 200, await switched.text());
      await page.reload(); const legacy = page.getByRole('combobox', { name: 'Modèle', exact: true }); await legacy.waitFor(); await legacy.selectOption('bionic-two'); assert.equal(await legacy.inputValue(), 'bionic-two'); assert.equal(await picker.count(), 0); assert.equal(f.stats.starts, 4);
      await page.reload(); await legacy.waitFor(); assert.equal(await legacy.inputValue(), 'bionic-two'); assert.equal(await prompt.inputValue(), 'Brouillon conservé pendant le choix de modèle.');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.deepEqual(errors, []); assert.deepEqual(csp, []);
      results.push({ width, ggufCatalogueBesideMessage: true, selectionWithoutEffect: true, cancelledConfirmationWithoutEffect: true, explicitStart: true, activeFromServerAfterReload: true, lostReplyAndReloadWithoutRepost: true, busyAndExternalRefusedBeforeEffect: true, sendAndEnterBlockedDuringTransition: true, unknownThenGetRecoveryWithoutRepostAndSendEnabled: true, tokenClearingDisclosedInConfirmation: true, promptPreserved: true, bionicSelectPreserved: true, starts: f.stats.starts, stops: f.stats.stops, modelCalls: f.stats.modelCalls, selectionPosts: actionCount(), pageErrors: errors.length, cspErrors: csp.length });
    } catch (error) { await shot(page, width + '-composer-models-failure.png').catch(() => {}); console.error(JSON.stringify({ width, errors, csp, stats: f.stats, posts })); throw error; }
    finally { f.release(); await context.close(); await f.app.close(); const resolved = path.resolve(f.root); assert(path.dirname(resolved) === path.resolve(os.tmpdir()) && path.basename(resolved).startsWith('canae-composer-models-')); await fs.rm(resolved, { recursive: true, force: true }); }
  }
  console.log(JSON.stringify({ mode: 'real-browser-authenticated-http-fake-processes-real-adapters', results, limitations: ['No actual llama-server process, model weights or GPU launched.', 'No active installation or personal configuration accessed.', 'Browser viewports do not qualify physical phones.'] }, null, 2));
} finally { await browser.close(); }
