import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../', import.meta.url);
const [catalog, fret, detail] = await Promise.all([
  readFile(new URL('src/i18n/messages.json', root), 'utf8').then(JSON.parse),
  readFile(new URL('src/lib/fret.ts', root), 'utf8'),
  readFile(new URL('src/pages/admin/Expeditions.tsx', root), 'utf8'),
]);

const keys = [
  'Suivi ShipsGo',
  'Activer le suivi ShipsGo',
  'Réessayer l’activation',
  'Synchroniser maintenant',
  'Synchronisation…',
  'Le suivi ShipsGo est activé.',
  'Suivi en cours d’activation…',
  'Aucune synchronisation effectuée pour l’instant.',
  'La création du suivi ShipsGo peut consommer un crédit. Continuer ?',
  'Synchronisation ShipsGo terminée : {0} nouvelle(s) étape(s) ajoutée(s).',
  'Le suivi ShipsGo existant a été réutilisé.',
  'Vérifiez le numéro de conteneur ou d’AWB dans la fiche du lot.',
  'Le suivi ShipsGo est déjà activé ou en cours.',
  'Session expirée. Reconnectez-vous.',
  'Action réservée à l’équipe.',
  'Expédition introuvable.',
  'Le service de suivi est temporairement indisponible.',
  'Le suivi ShipsGo n’est pas activé pour ce lot.',
  'Vérifiez les références de transport ou réessayez plus tard.',
  'Un numéro valide de conteneur ou d’AWB est requis pour activer ShipsGo.',
  'Synchronisé par ShipsGo',
  'Dernière synchronisation',
];

test('provides every new ShipsGo UI message in all four locales', () => {
  for (const key of keys) {
    assert.ok(catalog[key], `missing catalog entry: ${key}`);
    for (const locale of ['en', 'zh', 'ar']) {
      assert.equal(typeof catalog[key][locale], 'string', `missing ${locale} for: ${key}`);
      assert.ok(catalog[key][locale].trim(), `empty ${locale} for: ${key}`);
    }
  }
});

test('keeps the provider secret out of the browser and gates chargeable creation with confirmation', () => {
  assert.match(fret, /\/api\/shipsgo-track/);
  assert.match(fret, /\/api\/shipsgo-sync/);
  assert.doesNotMatch(fret, /SHIPSGO_API_TOKEN/);
  assert.match(detail, /window\.confirm\(t\('La création du suivi ShipsGo peut consommer un crédit\. Continuer \?'\)\)/);
  assert.match(detail, /creerSuiviShipsGo/);
  assert.match(detail, /synchroniserShipsGo/);
});
