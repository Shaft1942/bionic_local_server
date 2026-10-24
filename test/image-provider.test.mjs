import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageProviderBinding } from '../lib/image-provider.mjs';

const service = () => ({ async submit() {}, get() {}, owner() {}, async image() {}, getSettings: () => ({ enabled: true, activeJobs: 0 }), lifecycleStatus: () => ({ active: 0, uncertain: 0 }), findForOwner() {}, async close() {} });
test('explicit image providers implement a bounded job contract independent of inference and advertise optional capabilities honestly', () => {
  const source = service(), binding = createImageProviderBinding({ provider: { identity: { id: 'synthetic-provider', label: 'Synthetic adapter' }, service: source } });
  const info = binding.publicInfo(); assert.equal(info.identity.protocol, 'image-jobs-v1'); assert.equal(info.capabilities.series, false); assert.equal(info.capabilities.history, false); assert.equal(info.capabilities.recoveryByOwner, true); assert(!JSON.stringify(info).includes('inferenceProvider'));
  assert.throws(() => binding.service.listGenerations({ projectId: 'p1' }), { status: 409, code: 'image-provider-unsupported' });
  for (const provider of [{ identity: { id: '../private', label: 'Invalid' }, service: source }, { identity: { id: 'valid', label: 'Incomplete' }, service: { submit() {} } }]) assert.throws(() => createImageProviderBinding({ provider }), { code: 'image-provider-unsupported' });
});
test('legacy comfyService injection remains supported without registering another active image provider', () => {
  const source = service(), binding = createImageProviderBinding({ legacyService: source }); assert.equal(binding.service, source); assert.equal(binding.identity.id, 'comfyui'); assert.equal(binding.publicInfo().toolNames[0], 'generate_comfy_image');
});
