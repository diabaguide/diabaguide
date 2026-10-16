import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { directoryCategories, isPublicDirectoryProvider, CITY_DIRECTORY_CATEGORIES } from '../src/data.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const cats = [
  { id: 'gros', label: 'Marchés', active: true }, { id: 'hotel', label: 'Hôtels', active: true }, { id: 'resto', label: 'Restaurants', active: true },
  { id: 'transport', label: 'Transporteurs', active: true }, { id: 'transitaire', label: 'Transitaires', active: true },
];

test('seules les trois catégories d’adresses sont dans les listes', () => {
  assert.deepEqual(CITY_DIRECTORY_CATEGORIES, ['gros', 'hotel', 'resto']);
  assert.deepEqual(directoryCategories(cats).map((c) => c.id), ['gros', 'hotel', 'resto']);
  assert.equal(isPublicDirectoryProvider({ cat: 'transport' }), false);
  assert.equal(isPublicDirectoryProvider({ cat: 'transitaire' }), false);
  assert.equal(isPublicDirectoryProvider({ cat: 'resto' }), true);
});

test('les écrans de listes excluent transporteurs et transitaires sans supprimer les données', async () => {
  for (const p of ['src/pages/Home.tsx', 'src/pages/Search.tsx', 'src/pages/Contribute.tsx', 'src/pages/admin/Fiches.tsx', 'src/pages/admin/Admin.tsx']) {
    const text = await read(p);
    assert.match(text, /directoryCategories|isPublicDirectoryProvider/, p);
  }
  const providers = await read('src/lib/providers.ts');
  assert.doesNotMatch(providers, /delete\(.*transport|delete\(.*transitaire/i);
});
