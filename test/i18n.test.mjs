import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const core = await fs.readFile(new URL('../public/i18n.js', import.meta.url), 'utf8');
function fixture({ stored, languages = ['fr-FR'], denied = false, document } = {}) {
  const storage = new Map(stored ? [['bionic.interface-language.v1', stored]] : []);
  const context = vm.createContext({ Intl, document, navigator: { languages }, localStorage: {
    getItem: key => { if (denied) throw Error('Storage denied'); return storage.get(key); },
    setItem: (key, value) => { if (denied) throw Error('Storage denied'); storage.set(key, value); }
  }});
  vm.runInContext(core, context);
  return { context, i18n: context.BionicI18n, storage };
}

test('saved supported choice overrides browser; regions resolve and unsupported locales fall back', () => {
  assert.equal(fixture({ stored: 'fr', languages: ['en-US'] }).i18n.getLanguage(), 'fr');
  assert.equal(fixture({ languages: ['de-DE', 'en-AU'] }).i18n.getLanguage(), 'en');
  assert.equal(fixture({ languages: ['fr_CA'] }).i18n.getLanguage(), 'fr');
  assert.equal(fixture({ languages: ['ja-JP'] }).i18n.getLanguage(), 'fr');
  assert.equal(fixture({ stored: 'ar', languages: ['en-US'] }).i18n.getLanguage(), 'en');
});

test('choice persists per browser and unsupported choices cannot enter storage', () => {
  const { i18n, storage } = fixture(); let changes = 0;
  const stop = i18n.onChange(() => changes++);
  assert.equal(i18n.setLanguage('en').persisted, true);
  assert.equal(storage.get(i18n.storageKey), 'en');
  assert.equal(changes, 1);
  assert.equal(i18n.setLanguage('../../private').supported, false);
  assert.equal(i18n.getLanguage(), 'en');
  stop(); i18n.setLanguage('fr'); assert.equal(changes, 1);
});

test('storage refusal keeps a usable language in this tab and reports that it was not saved', () => {
  const { i18n } = fixture({ denied: true });
  assert.equal(i18n.setLanguage('en').persisted, false);
  assert.equal(i18n.getLanguage(), 'en');
});

test('translations have French fallback, native plural rules and locale formats without parsing parameters', () => {
  const { i18n } = fixture();
  i18n.register('fr', { onlyFrench: 'Repli français', files: { one: '{count} fichier', other: '{count} fichiers' }, named: 'Nom : {name}' });
  i18n.register('en', { files: { one: '{count} file', other: '{count} files' }, named: 'Name: {name}' });
  assert.equal(i18n.t('files', { count: 0 }), '0 fichier');
  i18n.setLanguage('en');
  assert.equal(i18n.t('onlyFrench'), 'Repli français');
  assert.equal(i18n.t('unknown.key'), 'unknown.key');
  assert.equal(i18n.t('files', { count: 0 }), '0 files');
  assert.equal(i18n.t('files', { count: 1 }), '1 file');
  assert.equal(i18n.t('files', { count: 1234 }), '1,234 files');
  assert.equal(i18n.t('named', { name: '<img src=x onerror=alert(1)> {count}' }), 'Name: <img src=x onerror=alert(1)> {count}');
  assert.equal(i18n.number(1234.5), '1,234.5');
  assert.match(i18n.date('2026-10-23T12:00:00Z', { month: 'long', timeZone: 'UTC' }), /October/);
  assert.throws(() => i18n.register('en', { named: 'Duplicate' }), /Duplicate/);
});

test('static bindings do not translate unmarked user/model text or replace a controller-owned placeholder', () => {
  const label = { dataset: { i18n: 'label' }, textContent: 'Réglages' };
  const changed = { dataset: { i18n: 'status' }, textContent: 'Projet personnel — unchanged' };
  const document = { documentElement: {}, querySelectorAll: selector => selector === '[data-i18n]' ? [label, changed] : [] };
  const { i18n } = fixture({ document });
  i18n.register('fr', { label: 'Réglages', status: 'Connexion…' });
  i18n.register('en', { label: 'Settings', status: 'Connecting…' });
  i18n.setLanguage('en');
  assert.equal(label.textContent, 'Settings');
  assert.equal(changed.textContent, 'Projet personnel — unchanged');
  assert.equal(document.documentElement.lang, 'en');
  assert.equal(document.documentElement.dir, 'ltr');
  i18n.setLanguage('fr'); assert.equal(label.textContent, 'Réglages');
});

test('all shipped catalogues share keys and parameters, and every explicit HTML key is defined', async () => {
  const { i18n, context } = fixture();
  const catalogues = { fr: {}, en: {} };
  const recorder = Object.freeze({ ...i18n, register(language, entries) { Object.assign(catalogues[language], entries); i18n.register(language, entries); } });
  context.BionicI18n = recorder;
  for (const language of ['fr', 'en']) for (const domain of ['ui', 'app', 'settings', 'components']) {
    vm.runInContext(await fs.readFile(new URL(`../public/locales/${language}/${domain}.js`, import.meta.url), 'utf8'), context);
  }
  assert.deepEqual(Object.keys(catalogues.fr).sort(), Object.keys(catalogues.en).sort());
  const parameters = entry => [...new Set(JSON.stringify(entry).match(/\{\w+\}/g) || [])].sort();
  for (const key of Object.keys(catalogues.fr)) assert.deepEqual(parameters(catalogues.fr[key]), parameters(catalogues.en[key]), key);
  const html = await fs.readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)) assert.ok(Object.hasOwn(catalogues.fr, key), key);
});
