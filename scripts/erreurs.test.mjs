import assert from 'node:assert/strict';
import test from 'node:test';
import { MSG_HORS_LIGNE, MSG_RESEAU, MSG_SERVEUR, MSG_SESSION, convivial, messageReseau } from '../src/lib/erreurs.ts';

test('erreurs réseau : un message clair, sans anglais technique', () => {
  for (const m of ['TypeError: Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'Network request failed', 'signal timed out', 'net::ERR_CONNECTION_REFUSED']) {
    assert.equal(messageReseau(m, false), MSG_RESEAU, m);
  }
});

test('hors connexion : le message le dit', () => {
  assert.equal(messageReseau('TypeError: Failed to fetch', true), MSG_HORS_LIGNE);
});

test('session expirée et service indisponible', () => {
  assert.equal(messageReseau('JWT expired', false), MSG_SESSION);
  assert.equal(messageReseau('Invalid Refresh Token: Refresh Token Not Found', false), MSG_SESSION);
  assert.equal(messageReseau('502 Bad Gateway', false), MSG_SERVEUR);
  assert.equal(messageReseau('Service Unavailable', false), MSG_SERVEUR);
});

test('les autres messages ne sont pas modifiés', () => {
  for (const m of ['Ce code existe déjà.', 'Le titre ne doit pas dépasser 120 caractères.', 'Le texte ne doit pas dépasser 500 caractères.', 'duplicate key value', '']) {
    assert.equal(messageReseau(m, false), null, m);
    assert.equal(convivial(m), m);
  }
  assert.equal(messageReseau(undefined, false), null);
});
