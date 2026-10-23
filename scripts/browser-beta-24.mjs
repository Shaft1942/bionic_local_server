// All requests are intercepted. No service, model, GPU or personal project.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.BIONIC_BROWSER_CHANNEL ? { channel: process.env.BIONIC_BROWSER_CHANNEL } : {}) });
const origin = 'http://bionic.test', projectId = 'synthetic-beta-project', chatId = 'web-11111111-1111-4111-8111-111111111111';
const captures = process.env.BIONIC_SMOKE_SCREENSHOTS;
if (captures) await fs.mkdir(captures, { recursive: true });
const results = [];
try {
  for (const width of [1280, 320]) {
    const context = await browser.newContext({ locale: 'fr-FR', viewport: { width, height: 900 } }), page = await context.newPage(), requests = [], errors = [];
    page.setDefaultTimeout(5000); page.on('pageerror', failure => (errors.push(failure.message),console.error('Browser error:',failure.stack)));
    let chat, rejectImage = false, loseImageReply = false;
    const projects = [{ id: projectId, name: 'Projet synthétique bêta', sessionsCount: 0 }];
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) {
        const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        if (!/^(?:locales\/(?:fr|en)\/(?:ui|app|settings|components)\.js|[a-z0-9.-]+)$/i.test(file)) return route.abort();
        return route.fulfill({ contentType: file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html', body: await fs.readFile(path.join(root, 'public', file)) });
      }
      const input = request.postData() ? JSON.parse(request.postData()) : null;
      requests.push({ path: url.pathname, method: request.method(), input });
      let value, status = 200;
      if (url.pathname === '/api/status') value = { ok: false, models: [], addresses: [] };
      else if (url.pathname === '/api/models') value = { models: [], generationActive: false };
      else if (url.pathname === '/api/projects') value = { projects };
      else if (url.pathname === '/api/sessions') value = { sessions: chat && chat.projectId === url.searchParams.get('projectId') ? [{ ...chat, messages: undefined }] : [], warnings: [] };
      else if (url.pathname === '/api/local-projects') {
        const project = { id: 'local-synthetic-project', name: input.name, localOnly: true, locallyOwned: true, sessionsCount: 0 }; projects.push(project); value = { project };
      }
      else if (url.pathname === '/api/local-projects/adoption') value = { id: projectId, name: projects[0].name, fingerprint: 'synthetic-roots-fingerprint', notice: 'Historiques synthétiques en lecture seule.', roots: [{ id: 'root-writable', name: 'Dossier modifiable synthétique', path: 'C:\\Synthetic\\Writable', writable: true }, { id: 'root-readonly', name: 'Dossier en lecture synthétique', path: 'C:\\Synthetic\\Readonly', writable: false }] };
      else if (url.pathname === '/api/local-projects/adopt') { Object.assign(projects[0], { localOnly: true, locallyOwned: true }); value = { project: projects[0] }; }
      else if (url.pathname === '/api/activity') value = { events: [], warnings: [] };
      else if (url.pathname === '/api/updates') value = { currentVersion: '2.4.0-beta.1', enabled: false, candidate: null, installation: { status: 'idle' } };
      else if (url.pathname === '/api/model-preferences') value = { automatic: true, maxOutputTokens: 8192, source: 'auto' };
      else if (url.pathname === '/api/comfy/settings') value = { enabled: true, workflowId: 'krea2_turbo', activeJobs: 0, loraProfiles: {}, workflows: [{ id: 'krea2_turbo', label: 'Krea 2 Turbo' }] };
      else if (url.pathname === '/api/conversation') value = chat;
      else if (url.pathname === '/api/chat-request') value = { id: chatId, status: 'completed', projectId: chat?.projectId || projectId };
      else if (url.pathname === '/api/comfy/generation') value = chat.messages[1].imageGenerations[0];
      else if (url.pathname === '/api/comfy/generate') {
        if (rejectImage) { rejectImage = false; status = 403; value = { error: 'Génération refusée par la fixture.' }; }
        else {
          const generation = { id: 'synthetic-image-job', status: 'queued', prompt: input.prompt, workflowId: input.workflowId, workflowLabel: 'Krea 2 Turbo', width: 1024, height: 1024, seed: 42 };
          chat = { id: chatId, projectId: input.projectId, name: 'Image directe synthétique', source: 'web', imageWorkflowId: input.workflowId, messages: [{ id: 'synthetic-user', role: 'user', text: input.prompt, requestId: input.requestId }, { id: 'synthetic-reply', role: 'assistant', text: 'Génération image directe.', imageGenerations: [generation], complete: true }], generation: { status: 'completed', requestId: input.requestId } };
          value = { id: chatId, requestId: input.requestId, messageId: 'synthetic-reply', generation };
          if (loseImageReply) { loseImageReply = false; return route.abort(); }
        }
      } else { status = 404; value = { error: 'Route absente de la fixture : ' + url.pathname }; }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    });
    await page.goto(origin); await page.locator('#app').waitFor({ state: 'visible' });
    await page.locator('#new-chat').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#reconnect').count(), 0);
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelector('#refresh').getAttribute('aria-busy') === 'false');
    await page.locator('#models-open-sidebar').click(); await page.locator('#models-dialog').waitFor({ state: 'visible' });
    await page.locator('#models-title').click(); assert.equal(await page.locator('#models-dialog').isVisible(), true);
    const title = await page.locator('#models-title').boundingBox();
    await page.mouse.move(title.x + 5, title.y + 5); await page.mouse.down(); await page.mouse.move(2, 2); await page.mouse.up();
    assert.equal(await page.locator('#models-dialog').isVisible(), true, 'inside-to-outside drag preserves modal');
    await page.mouse.click(2, 2); await page.locator('#models-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'models-open-sidebar');
    await page.locator('#models-open-sidebar').click(); await page.keyboard.press('Escape');
    await page.locator('#models-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'models-open-sidebar');
    await page.locator('#project-management>summary').click(); await page.locator('#project-adoption-preview').click();
    await page.locator('#project-adoption-form').waitFor({ state: 'visible' });
    if (captures) await page.screenshot({ path: path.join(captures, width + '-beta24-projects.png') });
    assert.equal(await page.locator('#project-adoption-roots input:checked').count(), 0, 'no implicit root or write permission');
    await page.locator('input[data-root-id="root-writable"]').check();
    assert.equal(await page.locator('input[data-write-for="root-writable"]').isChecked(), false, 'selected root defaults to reading');
    await page.locator('input[data-write-for="root-writable"]').check();
    await page.locator('#local-project-name').fill('Brouillon de projet en français');
    const writesBeforeLanguage = requests.filter(request => request.method === 'POST').length;
    await page.evaluate(() => BionicI18n.setLanguage('en'));
    assert.match(await page.locator('#project-adoption-title').textContent(), /^Adopt/);
    assert.match(await page.locator('input[data-root-id="root-writable"]').locator('..').textContent(), /Allow reading/);
    assert.equal(await page.locator('input[data-root-id="root-writable"]').isChecked(), true);
    assert.equal(await page.locator('input[data-write-for="root-writable"]').isChecked(), true);
    assert.equal(await page.locator('#local-project-name').inputValue(), 'Brouillon de projet en français');
    assert.equal(requests.filter(request => request.method === 'POST').length, writesBeforeLanguage, 'language change never submits a form');
    await page.evaluate(() => BionicI18n.setLanguage('fr'));
    await page.locator('input[data-write-for="root-writable"]').uncheck();
    await page.locator('input[data-root-id="root-readonly"]').check();
    assert.equal(await page.locator('input[data-write-for="root-readonly"]').isDisabled(), true);
    await page.locator('input[data-root-id="root-readonly"]').uncheck();
    await page.locator('#project-adoption-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#project-management').open);
    assert.deepEqual(requests.find(request => request.path === '/api/local-projects/adopt').input, { projectId, fingerprint: 'synthetic-roots-fingerprint', roots: [{ id: 'root-writable', writable: false }] });
    await page.locator('#project-management>summary').click(); await page.locator('#local-project-name').fill('Projet autonome synthétique');
    await page.locator('#local-project-create').click(); await page.waitForFunction(() => document.querySelector('#project').value === 'local-synthetic-project');
    assert.deepEqual(requests.find(request => request.path === '/api/local-projects').input, { name: 'Projet autonome synthétique' });
    if (width === 320 && await page.locator('#back').isVisible()) await page.locator('#back').click();
    await page.locator('#new-chat').click(); await page.locator('#files-menu-toggle').click(); await page.locator('#generate-image-direct').click();
    await page.locator('#message-error').waitFor({ state: 'visible' });
    await page.evaluate(() => BionicI18n.setLanguage('en'));
    assert.match(await page.locator('#message-error').textContent(), /^Write an image prompt/);
    assert.equal(await page.locator('#prompt').inputValue(), '');
    await page.evaluate(() => BionicI18n.setLanguage('fr'));
    await page.locator('#prompt').fill('Une théière bleue, texte exact.');
    await page.locator('#files-menu-toggle').click();
    await page.locator('#agent-images').click(); assert.equal(await page.locator('#composer-files').getAttribute('open'), '');
    await page.locator('#prompt').click(); assert.equal(await page.locator('#composer-files').getAttribute('open'), null);
    await page.locator('#conversation-options-toggle').click();
    await page.locator('#prompt').click(); assert.equal(await page.locator('#conversation-options').isVisible(), false);
    await page.locator('#conversation-options-toggle').click(); await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'conversation-options-toggle');
    await page.locator('#files-menu-toggle').click(); await page.locator('#generate-image-direct').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#send').isDisabled(), true, 'text model is unavailable');
    assert.equal(await page.locator('#generate-image-direct').isDisabled(), false, 'direct image works without a text model');
    if (captures) { await page.locator('#generate-image-direct').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(captures, width + '-beta24-tools.png') }); }
    await page.locator('#generate-image-direct').click();
    await page.locator('.generated-image').waitFor({ state: 'visible' }).catch(async failure => {
      console.error(JSON.stringify({ errors, paths: requests.map(request => request.path), error: await page.locator('#message-error').textContent(), messages: await page.locator('#messages').textContent() })); throw failure;
    });
    assert.equal(requests.filter(request => request.path === '/api/comfy/generate').length, 1);
    assert.equal(requests.find(request => request.path === '/api/comfy/generate').input.prompt, 'Une théière bleue, texte exact.');
    assert.equal(requests.filter(request => request.path === '/api/chat').length, 0);
    const imagePrompt = await page.locator('.generated-image-prompt p').textContent();
    await page.evaluate(() => BionicI18n.setLanguage('en'));
    assert.equal(await page.locator('.generated-image-status').textContent(), await page.evaluate(() => BionicI18n.t('components.beta25.3408c60177')));
    assert.equal(await page.locator('.generated-image-prompt p').textContent(), imagePrompt, 'image prompt is never translated');
    await page.evaluate(() => BionicI18n.setLanguage('fr'));
    await page.locator('#prompt').fill('Prompt refusé conservé.'); rejectImage = true;
    await page.locator('#files-menu-toggle').click(); await page.locator('#generate-image-direct').click();
    await page.getByText('Génération refusée par la fixture.', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('#prompt').inputValue(), 'Prompt refusé conservé.');
    await page.locator('#prompt').fill('Image acceptée, réponse réseau perdue.'); loseImageReply = true;
    await page.locator('#files-menu-toggle').click(); await page.locator('#generate-image-direct').click();
    await page.waitForFunction(() => document.querySelector('#messages').textContent.includes('Image acceptée, réponse réseau perdue.'));
    assert.equal(requests.filter(request => request.path === '/api/comfy/generate').length, 3, 'recovery never resubmits a lost reply');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page overflow');
    assert.deepEqual(errors, []);
    if (captures) await page.screenshot({ path: path.join(captures, width + '-beta24-result.png') });
    results.push({ width, passed: true, directRequests: 3, textRequests: 0, ambiguousReplyRecoveredWithoutResubmission: true, localProjectCreated: true, nativeAdoption: 'explicit read permission', hotLanguages: ['fr', 'en'], formValuesAndImagePromptPreserved: true }); await context.close();
  }
  console.log(JSON.stringify({ mode: 'synthetic browser only', results, limits: ['No real model, GPU, phone, certificate import or PC connection.'] }, null, 2));
} finally { await browser.close(); }
