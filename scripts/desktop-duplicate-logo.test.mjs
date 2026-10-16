import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const home = await readFile(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
test('le logo du bandeau accueil est identifiable pour le masquer sur bureau', () => {
  assert.match(home, /className="[^"]*home-hero-brand[^"]*"/);
  assert.match(css, /\.phone\.has-nav \.screen\.wide \.home-hero-brand\s*\{\s*display:\s*none/);
});
