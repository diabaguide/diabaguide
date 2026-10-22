import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { paginateResults, SEARCH_PAGE_SIZE } from '../src/lib/searchPagination.ts';

const search = await readFile(new URL('../src/pages/Search.tsx', import.meta.url), 'utf8');
const messages = JSON.parse(await readFile(new URL('../src/i18n/messages.json', import.meta.url), 'utf8'));

test('la pagination découpe les résultats et borne une page invalide', () => {
  const items = Array.from({ length: SEARCH_PAGE_SIZE * 2 + 1 }, (_, index) => index + 1);
  const first = paginateResults(items, 1);
  const last = paginateResults(items, 99);
  assert.equal(first.pageCount, 3);
  assert.deepEqual(first.items, items.slice(0, SEARCH_PAGE_SIZE));
  assert.equal(last.page, 3);
  assert.deepEqual(last.items, [items.at(-1)]);
});

test('Explorer n’impose aucune ville et expose le choix Toutes les villes', () => {
  assert.match(search, /city:\s*\(sp\.get\('ville'\) as City \| null\) \?\? null/);
  assert.match(search, /q\.city \? p\.city === q\.city : true/);
  assert.match(search, /l: 'Toutes les villes'/);
  assert.match(search, /pageList/);
  assert.match(search, /paginateResults\(list, q\.page\)/);
  assert.deepEqual(messages['Toutes les villes'], { en: 'All cities', zh: '所有城市', ar: 'كل المدن' });
  assert.deepEqual(messages['Pagination des résultats'], { en: 'Results pagination', zh: '结果分页', ar: 'ترقيم النتائج' });
});
