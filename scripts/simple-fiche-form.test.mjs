import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const src = await readFile(new URL('../src/pages/admin/Fiches.tsx', import.meta.url), 'utf8');
test('le formulaire de restaurant évite les doublons halal et cuisine', () => {
  assert.match(src, /Type de cuisine/);
  assert.doesNotMatch(src, /txt\('halal', 'Halal'\)/);
  assert.doesNotMatch(src, /txt\('cuisine', 'Cuisine'\)/);
});
test('les informations secondaires sont repliées', () => {
  assert.match(src, /Informations complémentaires/);
  assert.match(src, /<details/);
});
