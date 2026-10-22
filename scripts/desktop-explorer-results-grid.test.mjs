import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const search = await readFile(new URL('../src/pages/Search.tsx', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('Explorer groupe les cartes dans une grille dédiée', () => {
  assert.match(search, /className="search-results"/);
  assert.match(search, /<div className="search-results">\s*\{pageList\.map/s);
  assert.match(search, /const showMap = online && !loading && mapList\.length > 0/);
  assert.match(search, /search-layout\$\{showMap \? ' has-map' : ''\}/);
  assert.match(search, /\{showMap && <MapView/);
});

test('la grille Explorer affiche deux lieux côte à côte sur Desktop', () => {
  assert.match(styles, /@media \(min-width: 1024px\)[\s\S]*?\.search-results\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.search-layout\s*\{\s*display:\s*grid;\s*grid-template-columns:\s*260px minmax\(0, 1fr\)/);
  assert.match(styles, /\.search-layout\.has-map\s*\{\s*grid-template-columns:\s*260px minmax\(0, 1fr\) 420px/);
  assert.match(styles, /\.search-layout\.has-map \.search-results\s*\{\s*grid-template-columns:\s*1fr/);
});
