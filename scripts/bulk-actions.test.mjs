import assert from 'node:assert/strict';
import test from 'node:test';
import { BULK_MAX, runBulk, summarizeBulk, toggleAll, toggleOne } from '../src/lib/bulk.ts';

test('la sélection se coche, se décoche et ne garde que les lignes visibles', () => {
  let sel = new Set();
  sel = toggleOne(sel, 'a'); sel = toggleOne(sel, 'b');
  assert.deepEqual([...sel], ['a', 'b']);
  sel = toggleOne(sel, 'a');
  assert.deepEqual([...sel], ['b']);
  assert.deepEqual([...toggleAll(new Set(['b']), ['a', 'b', 'c'])].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...toggleAll(new Set(['a', 'b', 'c']), ['a', 'b', 'c'])], []);
});

test('chaque élément est traité séparément : un échec n’arrête pas les autres', async () => {
  const seen = [];
  const report = await runBulk(['a', 'b', 'c'], async (id) => {
    seen.push(id);
    return id === 'b' ? { error: 'refusé' } : {};
  });
  assert.deepEqual(seen, ['a', 'b', 'c']);
  assert.deepEqual(report.map((r) => [r.id, r.status]), [['a', 'done'], ['b', 'failed'], ['c', 'done']]);
  assert.equal(report[1].reason, 'refusé');
});

test('les éléments exclus ne sont jamais traités et le motif est rapporté', async () => {
  const called = [];
  const report = await runBulk(['me', 'primary', 'x'], async (id) => { called.push(id); return {}; }, {
    skip: (id) => (id === 'me' ? 'Vous-même' : id === 'primary' ? 'Administrateur principal' : null),
  });
  assert.deepEqual(called, ['x']);
  assert.deepEqual(report.map((r) => r.status), ['skipped', 'skipped', 'done']);
});

test('doublons éliminés, plafond appliqué, exception transformée en échec', async () => {
  const ids = Array.from({ length: BULK_MAX + 20 }, (_, i) => `id${i}`);
  const report = await runBulk([...ids, 'id0'], async () => ({}));
  assert.equal(report.length, BULK_MAX);
  const crash = await runBulk(['a'], async () => { throw new Error('réseau'); });
  assert.equal(crash[0].status, 'failed');
});

test('le compte rendu résume les faits, ignorés et échecs', () => {
  const text = summarizeBulk([
    { id: 'a', status: 'done' }, { id: 'b', status: 'done' },
    { id: 'c', status: 'skipped', reason: 'Vous-même' }, { id: 'd', status: 'failed', reason: 'refusé' },
  ]);
  assert.equal(text, '2 effectués, 1 ignoré, 1 en échec.');
  assert.equal(summarizeBulk([{ id: 'a', status: 'done' }]), '1 effectué.');
});
