import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhotoUrlBatcher, mapPhotoUrlBatchResults } from '../src/lib/photoUrlBatcher.ts';

test('groups simultaneous photo URL requests and deduplicates paths', async () => {
  const calls = [];
  const request = createPhotoUrlBatcher(async (paths) => {
    calls.push(paths);
    return new Map(paths.map((path) => [path, { url: `signed:${path}`, missing: false }]));
  }, 0);

  const result = await Promise.all([request('one.webp'), request('two.webp'), request('one.webp')]);

  assert.deepEqual(result, [
    { url: 'signed:one.webp', missing: false },
    { url: 'signed:two.webp', missing: false },
    { url: 'signed:one.webp', missing: false },
  ]);
  assert.deepEqual(calls, [['one.webp', 'two.webp']]);
});

test('distinguishes missing objects from temporary and omitted signing results', async () => {
  const request = createPhotoUrlBatcher(async () => new Map([
    ['missing.webp', { url: null, missing: true }],
    ['temporary.webp', { url: null, missing: false }],
  ]), 0);

  assert.deepEqual(await request('missing.webp'), { url: null, missing: true });
  assert.deepEqual(await request('temporary.webp'), { url: null, missing: false });
  assert.deepEqual(await request('omitted.webp'), { url: null, missing: false });
});

test('maps partial Storage results without treating transient errors as missing objects', () => {
  const results = mapPhotoUrlBatchResults(['missing.webp', 'temporary.webp', 'ready.webp'], [
    { path: null, signedUrl: null, error: 'Object not found' },
    { path: 'temporary.webp', signedUrl: null, error: 'Storage temporarily unavailable' },
    { path: 'ready.webp', signedUrl: 'signed:ready.webp', error: null },
  ]);

  assert.deepEqual(results, new Map([
    ['missing.webp', { url: null, missing: true }],
    ['temporary.webp', { url: null, missing: false }],
    ['ready.webp', { url: 'signed:ready.webp', missing: false }],
  ]));
});

test('resolves failures safely and allows a later retry', async () => {
  let attempts = 0;
  const request = createPhotoUrlBatcher(async (paths) => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary signing failure');
    return new Map(paths.map((path) => [path, { url: `signed:${path}`, missing: false }]));
  }, 0);

  assert.deepEqual(await request('retry.webp'), { url: null, missing: false });
  assert.deepEqual(await request('retry.webp'), { url: 'signed:retry.webp', missing: false });
  assert.equal(attempts, 2);
});
