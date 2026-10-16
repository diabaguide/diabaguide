import assert from 'node:assert/strict';
import test from 'node:test';
import { isMissingFicheFilterColumn, withoutFicheFilterColumns } from '../src/lib/providerSchema.ts';
import { readFile } from 'node:fs/promises';

test('reconnaît une colonne optionnelle absente du cache Supabase', () => {
  assert.equal(isMissingFicheFilterColumn("Could not find the 'price_level' column of 'providers' in the schema cache"), true);
  assert.equal(isMissingFicheFilterColumn("Could not find the 'review_status' column of 'providers' in the schema cache"), false);
});

test('le repli retire seulement les colonnes de filtres non migrées', () => {
  const row = withoutFicheFilterColumns({ name: 'Lieu', price_level: 2, halal_status: 'confirmed', cuisine_type: 'arabe', review_status: 'draft' });
  assert.equal('price_level' in row, false);
  assert.equal('halal_status' in row, false);
  assert.equal('cuisine_type' in row, false);
  assert.equal(row.review_status, 'draft');
});

test('la sauvegarde réessaie sans les colonnes optionnelles absentes', async () => {
  const src = await readFile(new URL('../src/lib/providers.ts', import.meta.url), 'utf8');
  assert.match(src, /isMissingFicheFilterColumn\(error\.message\)/);
  assert.match(src, /withoutFicheFilterColumns\(providerToRow\(p\)\)/);
});
