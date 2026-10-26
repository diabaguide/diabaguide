import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { addProductCategory, normalizeProductCategory, PRODUCT_CATEGORY_SUGGESTIONS } from '../src/lib/productCategories.ts';

const formSource = await readFile(new URL('../src/pages/admin/Fiches.tsx', import.meta.url), 'utf8');
const messages = JSON.parse(await readFile(new URL('../src/i18n/messages.json', import.meta.url), 'utf8'));


test('normalise accents, casse et espaces avant sauvegarde', () => {
  assert.equal(normalizeProductCategory('  ÉLECTRONIQUE   '), 'electronique');
});

test('ajoute une catégorie suggérée sous son libellé canonique', () => {
  assert.deepEqual(addProductCategory([], ' telephones et electronique ', PRODUCT_CATEGORY_SUGGESTIONS), {
    values: ['Téléphones et électronique'], error: null,
  });
});

test('refuse les doublons malgré accents, casse ou espaces', () => {
  assert.deepEqual(addProductCategory(['Téléphones et accessoires'], ' telephones  ET ACCESSOIRES ', PRODUCT_CATEGORY_SUGGESTIONS), {
    values: ['Téléphones et accessoires'], error: 'Cette catégorie est déjà ajoutée.',
  });
});

test('accepte une nouvelle catégorie personnalisée nettoyée', () => {
  assert.deepEqual(addProductCategory([], '  Emballages   cadeaux ', PRODUCT_CATEGORY_SUGGESTIONS), {
    values: ['Emballages cadeaux'], error: null,
  });
});

test('ignore une entrée vide et évite les valeurs trop longues', () => {
  assert.equal(addProductCategory([], '   ', PRODUCT_CATEGORY_SUGGESTIONS).error, 'Saisissez une catégorie.');
  assert.equal(addProductCategory([], 'x'.repeat(81), PRODUCT_CATEGORY_SUGGESTIONS).error, 'La catégorie ne peut pas dépasser 80 caractères.');
});

test('le formulaire marché utilise des catégories suggérées ou saisies, sans cases à cocher', () => {
  const start = formSource.indexOf('{p.cat === \'gros\' && (', formSource.indexOf('has(\'senegal\')'));
  const end = formSource.indexOf('</Section>', start);
  const marketForm = formSource.slice(start, end);
  assert.match(marketForm, /visibleProductSuggestions/);
  assert.match(marketForm, /Ajouter cette catégorie/);
  assert.doesNotMatch(marketForm, /type="checkbox"/);
  assert.match(formSource, /normalizeProductCategory\(selected\.label\) === normalizeProductCategory\(label\)/);
});

test('toutes les suggestions et libellés sont traduits dans les langues de l’application', () => {
  const keys = [...PRODUCT_CATEGORY_SUGGESTIONS, 'Catégories de produits', 'Rechercher ou saisir une catégorie', 'Ajouter cette catégorie'];
  for (const key of keys) {
    for (const locale of ['en', 'zh', 'ar']) assert.ok(messages[key]?.[locale], `${key} manque en ${locale}`);
  }
});