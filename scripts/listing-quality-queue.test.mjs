import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const src = await readFile(new URL('../src/pages/admin/Fiches.tsx', import.meta.url), 'utf8');
test('les fiches offrent des filtres rapides de qualité', () => {
  assert.match(src, /type MissingFilter/);
  assert.match(src, /À compléter en priorité/);
  assert.match(src, /Sans contact/);
  assert.match(src, /Sans photo/);
  assert.match(src, /Sans position vérifiée/);
});
test('le filtre de qualité participe aux lignes visibles', () => {
  assert.match(src, /hasMissing\(p, missing\)/);
  assert.match(src, /missingCounts/);
});
