import assert from 'node:assert/strict';
import test from 'node:test';
import { creerLimiteur, decrireErreur, doitSignaler } from '../src/lib/erreursFiltre.ts';

test('les vrais plantages sont signalés', () => {
  assert.ok(doitSignaler("TypeError: Cannot read properties of undefined (reading 'map')"));
  assert.ok(doitSignaler('ReferenceError: x is not defined'));
});

test('les coupures de réseau et le bruit connu ne le sont pas', () => {
  for (const m of ['TypeError: Failed to fetch', 'Load failed', 'ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'AbortError: The operation was aborted.',
    'TypeError: Failed to fetch dynamically imported module: https://x/assets/a.js', 'Non-Error promise rejection captured with value: Object Not Found Matching Id:3',
    'Error at chrome-extension://abc/content.js', 'ab', '']) {
    assert.equal(doitSignaler(m), false, m);
  }
});

test('description d’une erreur : message et début de la pile', () => {
  const e = new TypeError('boum');
  const d = decrireErreur(e);
  assert.equal(d.message, 'TypeError: boum');
  assert.ok(d.detail.length > 0 && d.detail.split('\n').length <= 8);
  assert.deepEqual(decrireErreur('texte'), { message: 'texte', detail: '' });
  assert.equal(decrireErreur({ a: 1 }).message, '{"a":1}');
  assert.ok(decrireErreur('x'.repeat(1000)).message.length <= 300);
});

test('limiteur : une fois chaque erreur, cinq au plus par visite', () => {
  const ok = creerLimiteur(3);
  assert.equal(ok('a'), true);
  assert.equal(ok('a'), false);
  assert.equal(ok('b'), true);
  assert.equal(ok('c'), true);
  assert.equal(ok('d'), false);
});
