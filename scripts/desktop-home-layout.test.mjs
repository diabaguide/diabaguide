import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const home = await readFile(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
test('l’accueil regroupe l’introduction et les besoins pour le bureau', () => {
  assert.match(home, /className="home-overview"/);
  assert.match(css, /\.home-overview\s*\{[\s\S]*grid-template-columns:/);
});
test('le bureau agrandit le titre et les actions sans modifier les règles mobiles', () => {
  assert.match(css, /\.phone\.has-nav \.screen\.wide \.home-intro h1/);
  assert.match(css, /\.phone\.has-nav \.screen\.wide \.quick-actions/);
  assert.match(css, /\.phone\.has-nav \.screen\.wide \.needtile/);
});
