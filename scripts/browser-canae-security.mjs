// Real local HTTP/TLS/mTLS and synthetic certificates. No OS trust/firewall changes.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import tls from 'node:tls';
import http from 'node:http';
import { createHash, X509Certificate } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createPrototype } from '../lib/llama-ui-prototype.mjs';

const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE_PATH, 'index.mjs')).href) : await import('playwright');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'canae-security-browser-'));
const fixture = await createPrototype({ root, port: 0, certificateTransport: true });
const assetHtml = await fs.readFile(fileURLToPath(new URL('../public/llama-ui/index.html', import.meta.url)), 'utf8');
const asset = /src="([^"]+\.js)"/.exec(assetHtml)?.[1];
const captures = process.env.BIONIC_BROWSER_CAPTURES;
if (captures) await fs.mkdir(captures, { recursive: true });
const errors = [], proofRequests = [], proofResponses = [], mutations = [], stages = [];
let browser, context, page;
const pins = [];
const content = () => page.locator('.settings-content');
const category = name => page.getByRole('navigation', { name: 'Catégories des paramètres' }).getByRole('button', { name, exact: true });
async function launch({ cookies = [], clientCertificates = [] } = {}) {
  browser = await chromium.launch({ headless: true, channel: process.env.BIONIC_BROWSER_CHANNEL || 'chrome', args: pins.length ? ['--ignore-certificate-errors-spki-list=' + pins.join(',')] : [] });
  context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 1280, height: 900 }, acceptDownloads: true, clientCertificates });
  if (cookies.length) await context.addCookies(cookies);
  context.on('page', value => value.on('pageerror', error => errors.push(error.message)));
  context.on('response', value => { const pathname = new URL(value.url()).pathname; if (['/api/security/proof', '/__certificates/start', '/__certificates/confirm'].includes(pathname)) proofResponses.push({ path: pathname, status: value.status() }); });
  context.on('request', value => { const url = new URL(value.url()); if (['/api/security/proof', '/__certificates/start', '/__certificates/confirm'].includes(url.pathname)) proofRequests.push({ path: url.pathname, query: !!url.search, method: value.method() }); if (value.method() === 'POST' && url.pathname.startsWith('/api/security/')) mutations.push({ path: url.pathname, body: value.postData() }); });
  page = await context.newPage(); page.setDefaultTimeout(20000);
}
async function openSecurity() {
  await page.goto(fixture.baseUrl + '/prototype/');
  await page.locator('#access-code, .workspace-tabs').first().waitFor({ state: 'visible' });
  const field = page.locator('#access-code');
  if (await field.isVisible()) { await field.fill(fixture.code); await page.getByRole('button', { name: 'Se connecter', exact: true }).click(); }
  await page.locator('.workspace-tabs').getByRole('button', { name: 'Paramètres', exact: true }).click();
  await category('Connexion sécurisée').click(); await content().getByTestId('security-mode').waitFor();
}
async function confirmAction() { await content().getByRole('group', { name: 'Confirmer la modification de sécurité' }).getByRole('button', { name: 'Confirmer', exact: true }).click(); }
async function prepare(mode = 'https') {
  await content().getByLabel('Adresses du PC à inclure').fill('127.0.0.1, localhost');
  await content().getByRole('button', { name: mode === 'mtls' ? 'Préparer les certificats obligatoires' : 'Préparer HTTPS', exact: true }).click();
  await confirmAction(); await content().getByTestId('security-candidate').waitFor();
}
async function pinCandidate() {
  const certificate = new X509Certificate(await fs.readFile(path.join(fixture.app.certificateStore.directory, fixture.app.certificateStore.state.candidate.certFile)));
  pins.push(createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
}
async function verifyAndActivate(mode) {
  const popupPromise = page.waitForEvent('popup'); await content().getByRole('button', { name: 'Ouvrir la vérification HTTPS', exact: true }).click(); const popup = await popupPromise;
  popup.setDefaultTimeout(10000);
  try { await popup.getByRole('button', { name: 'Ouvrir la vérification sécurisée', exact: true }).click(); }
  catch (error) { console.error(JSON.stringify({ stage: 'proof-bridge', path: new URL(popup.url()).pathname, proofResponses })); throw error; }
  const button = popup.getByRole('button', { name: mode === 'mtls' ? 'Confirmer et activer le certificat client obligatoire' : 'Confirmer et activer HTTPS', exact: true }); await button.waitFor();
  assert.equal(fixture.app.certificateStore.state.mode, mode === 'mtls' ? 'https' : 'http');
  await button.click(); await popup.getByRole('heading', { name: 'Accès sécurisé activé' }).waitFor();
  assert.equal(fixture.app.certificateStore.state.mode, mode); await popup.close();
}
async function downloadDevice() {
  const password = await content().getByLabel('Mot de passe du certificat').inputValue();
  const event = page.waitForEvent('download'); await content().getByRole('button', { name: 'Télécharger le certificat .p12', exact: true }).click(); const download = await event;
  const stream = await download.createReadStream(), chunks = []; for await (const chunk of stream) chunks.push(chunk); const pfx = Buffer.concat(chunks);
  assert.doesNotThrow(() => tls.createSecureContext({ pfx, passphrase: password }));
  assert.equal(await content().getByRole('button', { name: 'Télécharger le certificat .p12', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(secret => JSON.stringify(localStorage).includes(secret) || JSON.stringify(sessionStorage).includes(secret), password), false);
  return { pfx, passphrase: password };
}
async function screenshot(stage) {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'No horizontal page overflow');
    if (captures) await page.screenshot({ path: path.join(captures, `${width}-security-${stage}.png`) });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

try {
  await launch(); await openSecurity();
  assert.equal(await content().getByTestId('security-mode').textContent(), 'HTTP');
  assert.equal(await content().getByRole('button', { name: 'Créer un certificat appareil', exact: true }).count(), 0);
  await content().getByLabel('Port de vérification HTTPS').fill('70000'); assert.equal(await content().getByRole('button', { name: 'Préparer HTTPS', exact: true }).isDisabled(), true);
  await content().getByLabel('Port de vérification HTTPS').fill('');
  await prepare(); assert.equal(fixture.app.certificateStore.state.mode, 'http');
  await content().getByRole('button', { name: 'Annuler la préparation', exact: true }).click(); await content().getByTestId('security-candidate').waitFor({ state: 'hidden' });
  const occupied = http.createServer((_req, res) => res.end('Occupied synthetic port')); await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    await content().getByLabel('Port de vérification HTTPS').fill(String(occupied.address().port));
    await content().getByRole('button', { name: 'Préparer HTTPS', exact: true }).click(); await confirmAction();
    await content().getByRole('alert').filter({ hasText: 'port de vérification' }).waitFor();
    assert.equal(fixture.app.certificateStore.state.mode, 'http');
  } finally { await new Promise(resolve => occupied.close(resolve)); }
  await content().getByLabel('Port de vérification HTTPS').fill(''); await prepare(); await screenshot('http-prepared'); await pinCandidate();
  let cookies = await context.cookies(); await browser.close(); await launch({ cookies }); await openSecurity();
  await verifyAndActivate('https'); stages.push('native HTTP preparation, cancellation, occupied-port refusal, POST proof, HTTPS activation');
  await openSecurity(); assert.equal(await content().getByTestId('security-mode').textContent(), 'HTTPS');
  const caDownload = page.waitForEvent('download'); await content().getByRole('link', { name: 'Télécharger l’autorité publique', exact: true }).click(); const caEvent = await caDownload;
  const caStream = await caEvent.createReadStream(), caChunks = []; for await (const chunk of caStream) caChunks.push(chunk); assert(new X509Certificate(Buffer.concat(caChunks)).ca);
  await content().getByLabel('Nom du nouvel appareil').fill('Téléphone synthétique'); await content().getByRole('button', { name: 'Créer un certificat appareil', exact: true }).click(); await confirmAction();
  await content().getByLabel('Mot de passe du certificat').waitFor(); const original = await downloadDevice(); const originalId = fixture.app.certificateStore.state.devices[0].id;
  await category('Mises à jour et diagnostic').click(); await category('Connexion sécurisée').click(); assert.equal(await content().getByLabel('Mot de passe du certificat').count(), 0);
  await content().locator('[data-device-id="' + originalId + '"]').getByRole('button', { name: 'Renouveler', exact: true }).click(); await confirmAction(); await content().getByLabel('Mot de passe du certificat').waitFor();
  const replacement = await downloadDevice(), replacementId = fixture.app.certificateStore.state.devices[1].id;
  assert.equal(fixture.app.certificateStore.state.devices[0].revokedAt, null);
  await content().getByRole('button', { name: 'Masquer ces informations', exact: true }).click();
  // A successful issuance arriving after leaving the panel must not restore its password.
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (resource, options = {}) => {
      const response = await originalFetch(resource, options);
      if (String(resource).includes('/api/security/actions') && typeof options.body === 'string' && JSON.parse(options.body).name === 'Réponse tardive') {
        window.__securityLateReady = true;
        await new Promise(resolve => window.__releaseSecurityLate = resolve);
        window.__securityLateReleased = true;
      }
      return response;
    };
  });
  await content().getByLabel('Nom du nouvel appareil').fill('Réponse tardive'); await content().getByRole('button', { name: 'Créer un certificat appareil', exact: true }).click(); await confirmAction(); await page.waitForFunction(() => window.__securityLateReady);
  await category('Mises à jour et diagnostic').click(); await page.evaluate(() => window.__releaseSecurityLate()); await page.waitForFunction(() => window.__securityLateReleased);
  await category('Connexion sécurisée').click(); await content().getByRole('button', { name: 'Actualiser la sécurité', exact: true }).click(); assert.equal(await content().getByLabel('Mot de passe du certificat').count(), 0);
  await content().locator('[data-device-id="' + originalId + '"]').getByRole('button', { name: 'Révoquer cet appareil', exact: true }).click(); await confirmAction();
  await page.waitForFunction(id => document.querySelector('[data-device-id="' + id + '"]')?.textContent.includes('Révoqué'), originalId);
  await screenshot('https-devices'); stages.push('public CA, native issue/download once/renew/revoke, delayed-response secret cleared, no browser storage');
  await content().getByRole('button', { name: 'Préparer les certificats obligatoires', exact: true }).click(); await confirmAction(); await content().getByTestId('security-candidate').waitFor(); await pinCandidate();
  const candidateUrl = fixture.transport.status().candidate.url;
  cookies = await context.cookies(); await browser.close(); await launch({ cookies, clientCertificates: [fixture.baseUrl, candidateUrl].map(origin => ({ origin, pfx: replacement.pfx, passphrase: replacement.passphrase })) });
  await openSecurity(); await verifyAndActivate('mtls'); await openSecurity();
  assert.equal(await content().getByTestId('security-mode').textContent(), 'HTTPS et certificat appareil');
  assert.equal(await content().locator('[data-device-id="' + replacementId + '"]').getByText('Connexion actuelle', { exact: true }).count(), 1);
  assert.equal(await content().locator('[data-device-id="' + replacementId + '"]').getByRole('button', { name: 'Révoquer cet appareil', exact: true }).count(), 0);
  await screenshot('mtls'); stages.push('native mTLS proof with device, activation, renewed device login, current-device revoke hidden');
  assert.equal(errors.length, 0, errors.join('\n')); assert(proofRequests.length >= 6); assert(proofRequests.every(value => !value.query && value.method === 'POST'));
  assert.equal(mutations.filter(value => value.path === '/api/security/device-download').length, 2);
  assert.equal(fixture.stats.externalCalls, 0);
  console.log(JSON.stringify({ ok: true, asset, stages, pageErrors: errors.length, proofRequests: proofRequests.length, downloads: 2, widths: [1280, 390], mode: fixture.app.certificateStore.state.mode, noLiveEngineCalls: true, limitation: 'Only fixture public-key pins are accepted by this Chrome process. No OS trust, physical phone or LAN/firewall qualification.' }, null, 2));
} finally { await browser?.close(); await fixture.app.close(); await fs.rm(root, { recursive: true, force: true }); }
