import assert from 'node:assert/strict';
import test from 'node:test';
import { TITRE_PAR_DEFAUT, iconeNotification, lienNotification, tempsRelatif, titreNotification } from '../src/lib/notificationsData.ts';

test('un titre par étape, un titre par défaut pour les autres', () => {
  assert.equal(titreNotification('arrive_dakar'), 'Votre marchandise est arrivée à Dakar');
  assert.equal(titreNotification('remis'), 'Votre marchandise vous a été remise');
  assert.equal(titreNotification('inconnue'), TITRE_PAR_DEFAUT);
});

test('icône selon l’étape', () => {
  assert.equal(iconeNotification('remis'), 'check');
  assert.equal(iconeNotification('en_livraison'), 'truck');
  assert.equal(iconeNotification('en_transit'), 'ship');
  assert.equal(iconeNotification('arrive_dakar'), 'box');
});

test('temps relatif : instant, minutes, heures, puis date', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  assert.deepEqual(tempsRelatif('2026-10-12T11:59:40Z', now), { cle: 'maintenant' });
  assert.deepEqual(tempsRelatif('2026-10-12T11:55:00Z', now), { cle: 'minutes', n: 5 });
  assert.deepEqual(tempsRelatif('2026-10-12T09:00:00Z', now), { cle: 'heures', n: 3 });
  assert.equal(tempsRelatif('2026-10-10T08:00:00Z', now).cle, 'date');
  assert.deepEqual(tempsRelatif('pas une date', now), { cle: 'date', texte: '' });
});

test('lien : le suivi public du lot, sinon Mes envois', () => {
  assert.equal(lienNotification('LOT 12/A'), '/suivi/LOT%2012%2FA');
  assert.equal(lienNotification(null), '/mes-envois');
});
