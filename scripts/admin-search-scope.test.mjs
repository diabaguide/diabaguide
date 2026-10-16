import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const admin = await readFile(new URL('../src/pages/admin/Admin.tsx', import.meta.url), 'utf8');
const fiches = await readFile(new URL('../src/pages/admin/Fiches.tsx', import.meta.url), 'utf8');
test('la recherche équipe propose les propositions et les fiches', () => {
  assert.match(admin, /searchScope/);
  assert.match(admin, /value="propositions"/);
  assert.match(admin, /value="fiches"/);
  assert.match(admin, /\/equipe\/fiches/);
});
test('la liste de fiches initialise sa recherche depuis l’URL', () => {
  assert.match(fiches, /useSearchParams/);
  assert.match(fiches, /params\.get\('q'\)/);
});
