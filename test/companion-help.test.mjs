import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCompanionCapabilities } from '../ui/src/lib/companion/client/capabilities-contract.ts';
import { capabilitiesFixture } from './fixtures/companion-help.mjs';

test('schema 1 preserves support, permission and availability as separate facts', () => {
  const result = parseCompanionCapabilities(capabilitiesFixture());
  assert.equal(result.images.support.singleImage.state, 'supported');
  assert.equal(result.images.enabled, true);
  assert.equal(result.images.availability.state, 'unknown');
  assert.equal(result.permissions.imageAccess.state, 'request-scoped');
  assert.equal(result.inference.models[0].parameters.temperature.state, 'unsupported');
  assert.equal(result.inference.models[0].support.tools.state, 'unknown');
  const llama = parseCompanionCapabilities(capabilitiesFixture('llamacpp'));
  assert.equal(llama.inference.provider, 'llamacpp');
  assert.equal(llama.inference.models[0].support.vision.state, 'unsupported');
});

test('future enum values never become supported, ready or authorized', () => {
  const input = capabilitiesFixture('future-engine');
  input.images.providerId = 'future-image-provider';
  input.inference.support.chat.state = 'enabled';
  input.images.availability.state = 'ready';
  input.permissions.fileAccess.state = 'granted';
  input.inference.models[0].support.tools.state = 'yes';
  const result = parseCompanionCapabilities(input);
  assert.equal(result.inference.provider, 'unknown');
  assert.equal(result.images.providerId, 'unknown');
  for (const item of [result.inference.support.chat, result.images.availability, result.permissions.fileAccess, result.inference.models[0].support.tools]) assert.equal(item.state, 'unknown');
});

test('malformed consumed fields fail closed; extra fields are ignored and never rendered', () => {
  const mutations = [v => v.schemaVersion = 2, v => v.inference.models = {}, v => v.images.enabled = 'true', v => delete v.permissions.scriptAccess, v => v.images.reachability.state = true, v => v.inference.models[0].contextLength = -1, v => v.inference.models[0].id = 'bad\nmodel', v => v.inference.models.push(v.inference.models[0]), v => delete v.inference.models[0].parameters.seed.support, v => v.images.support.batch.reasonCode = '<raw remote error>'];
  for (const mutate of mutations) { const input = capabilitiesFixture(); mutate(input); assert.throws(() => parseCompanionCapabilities(input), /Invalid companion capabilities/); }
  for (const input of [null, [], 'invalid', { schemaVersion: 1 }]) assert.throws(() => parseCompanionCapabilities(input));
  const input = capabilitiesFixture(); input.internal = 'must be dropped'; input.inference.models[0].path = 'must be dropped';
  assert(!JSON.stringify(parseCompanionCapabilities(input)).includes('must be dropped'));
});

test('all native guide references resolve in both existing public catalogues', async () => {
  const component = await readFile(new URL('../ui/src/lib/companion/settings/HelpSettings.svelte', import.meta.url), 'utf8');
  const literalKeys = [...component.matchAll(/t\('(help\.[^']+|beta25\.help\.[^']+|beta24\.help\.[^']+)'\)/g)].map(match => match[1]);
  const dynamicKeys = ['start','chat','files','tools','images','connection','troubleshooting','updates'].map(topic => 'help.' + topic + 'Title');
  dynamicKeys.push(...['httpsPrepare','httpsInstallAuthority','httpsVerify','authorityAndroid','authorityIos','authorityWindows'].map(key => 'beta24.help.' + key), ...['modelProblem','toolProblem','serverProblem','imageProblem','fileProblem'].map(key => 'help.' + key));
  for (const language of ['fr','en']) {
    const source = await readFile(new URL(`../public/locales/${language}/components.js`, import.meta.url), 'utf8');
    const dictionary = Object.assign({}, ...Array.from(source.matchAll(/BionicI18n\.register\("(?:fr|en)",\s*(\{[\s\S]*?\})\);/g), match => JSON.parse(match[1])));
    for (const key of [...literalKeys, ...dynamicKeys]) assert.equal(typeof dictionary['components.' + key], 'string', `${language} ${key}`);
  }
});
