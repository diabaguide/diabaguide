import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ui = await readFile(new URL('../src/ui.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const messages = JSON.parse(await readFile(new URL('../src/i18n/messages.json', import.meta.url), 'utf8'));

test('la barre de titres ajoute Guide au logo', () => {
  assert.match(ui, /<Logo height=\{34\} tail="Guide" \/>/);
  assert.deepEqual(messages.Guide, { en: 'Guide', zh: '指南', ar: 'الدليل' });
});

test('le sélecteur de ville est précédé d’un texte indicatif traduit', () => {
  assert.match(home, /city-switch-field/);
  assert.match(home, /tr\("Choisissez votre ville"\)/);
  assert.match(css, /\.city-switch-label/);
  assert.deepEqual(messages['Choisissez votre ville'], {
    en: 'Choose your city', zh: '请选择城市', ar: 'اختر مدينتك',
  });
});
