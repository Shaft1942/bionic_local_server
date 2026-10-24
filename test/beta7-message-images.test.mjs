import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMessageImages, mergeMessageImages, messageImagePending, messageImageReady, messageImageRoute } from '../ui/src/lib/companion/message-images.ts';

test('streamed single and series receipts are visible and deduplicated with the persisted message', () => {
  const message = { actions: [{ imageGeneration: { id: 'a', status: 'queued' } }, { imageGenerations: [{ id: 'a', status: 'running' }, { id: 'b', status: 'queued' }] }], imageGenerations: [{ id: 'a', status: 'succeeded', image: { width: 32 } }] };
  const result = collectMessageImages(message);
  assert.deepEqual(result.map(image => image.id), ['a', 'b']); assert.equal(result[0].status, 'succeeded'); assert.ok(result[0].image);
  assert.equal(message.actions[0].imageGeneration.status, 'queued', 'Collecting never mutates the source receipt');
});
test('late queued receipts cannot hide a completed image, while a newer server revision can change a result', () => {
  const complete = { id: 'a', status: 'succeeded', updatedAt: 20, image: { width: 32 } };
  assert.equal(mergeMessageImages([complete], [{ id: 'a', status: 'queued', updatedAt: 10 }])[0].status, 'succeeded');
  assert.equal(mergeMessageImages([complete], [{ id: 'a', status: 'failed', updatedAt: 21 }])[0].status, 'failed');
  assert.equal(mergeMessageImages([{ ...complete, updatedAt: undefined }], [{ id: 'a', status: 'queued' }])[0].status, 'succeeded');
});
test('only valid server job identities become cards; malformed receipts do not break a conversation', () => {
  assert.deepEqual(collectMessageImages({ actions: [null, 'bad', { imageGenerations: 'invalid' }], imageGenerations: [null, {}, { id: 'https://external.test/image' }, { id: 'valid-job', status: 'cancelled' }] }).map(image => image.id), ['valid-job']);
  assert.deepEqual(collectMessageImages(null), []);
});
test('pending tracking ends on cancellation, errors and uncertain results', () => {
  for (const status of ['waiting-resource', 'submitting', 'queued', 'running']) assert.equal(messageImagePending({ id: 'a', status }), true);
  for (const status of ['failed', 'error', 'unknown', 'cancelled', 'canceled', 'stopped']) assert.equal(messageImagePending({ id: 'a', status }), false);
  assert.equal(messageImagePending({ id: 'a', status: 'succeeded' }), true, 'A missing final descriptor is recovered by a read');
  assert.equal(messageImageReady({ id: 'a', status: 'succeeded', image: {} }), true);
});
test('image and tracking routes always retain the complete conversation owner', () => {
  const owner = { projectId: 'project space', chatId: 'web-a', messageId: 'reply/&' };
  const url = new URL(messageImageRoute(owner, 'job-a', 'image', true), 'http://companion.test');
  assert.equal(url.pathname, '/api/comfy/image'); assert.equal(url.searchParams.get('messageId'), 'reply/&'); assert.equal(url.searchParams.get('projectId'), 'project space'); assert.equal(url.searchParams.get('download'), '1');
  assert.equal(new URL(messageImageRoute(owner, 'job-a', 'generation'), url).pathname, '/api/comfy/generation');
});
