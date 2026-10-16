import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeOfflineProviders, toggleOfflineProvider } from '../src/lib/offlineProviders.ts';

const a = { id: 'a', name: 'Adresse A' };
const b = { id: 'b', name: 'Adresse B' };
const live = { id: 'a', name: 'Adresse A mise à jour' };

test('ajouter une fiche hors connexion conserve une copie complète et éviter les doublons', () => {
  const once = toggleOfflineProvider([], a);
  assert.deepEqual(once, [a]);
  assert.deepEqual(toggleOfflineProvider(once, a), []);
});

test('le repli hors connexion fusionne les fiches téléchargées et préfère la version mémorisée', () => {
  assert.deepEqual(mergeOfflineProviders([live], [a, b]), [a, b]);
});
