import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ENTRY_NAME_RE, cardFileNameFor, cleanEntryName, clientNoLabel, entryNameFromInput, isValidEntryName, phoneLine, printedPhone, suggestEntryName,
} from '../src/lib/carteData.ts';

test('numéro de client sur 4 chiffres, comme (0022) sur la carte', () => {
  assert.equal(clientNoLabel(22), '0022');
  assert.equal(clientNoLabel(1), '0001');
  assert.equal(clientNoLabel(12345), '12345');
  assert.equal(clientNoLabel(0), '0000');
});

test('nom court : majuscules, lettres A-Z et chiffres seulement', () => {
  assert.equal(cleanEntryName('btc'), 'BTC');
  assert.equal(cleanEntryName(' b-t c '), 'BTC');
  assert.equal(cleanEntryName('Diagne 22'), 'DIAGNE22');
  assert.equal(cleanEntryName('é'), '');
  assert.equal(cleanEntryName('Sène'), 'SNE'); // même règle que la base : l'accent est retiré, pas converti
  assert.equal(cleanEntryName('名字'), '');
});

test('nom court saisi : les accents sont convertis, pas supprimés', () => {
  assert.equal(entryNameFromInput('Sène'), 'SENE');
  assert.equal(entryNameFromInput(' élodie-22 '), 'ELODIE22');
  assert.equal(entryNameFromInput('btc'), 'BTC');
  assert.equal(entryNameFromInput('张伟'), '');
  assert.equal(entryNameFromInput(''), '');
});

test('nom court valide : 2 à 10 caractères', () => {
  for (const ok of ['BTC', 'AD', 'DIAGNE22', 'ABCDEFGHIJ']) assert.ok(isValidEntryName(ok), ok);
  for (const ko of ['', 'A', 'ABCDEFGHIJK', 'abc', 'A B', 'É1']) assert.ok(!isValidEntryName(ko), ko);
  assert.equal(ENTRY_NAME_RE.source, '^[A-Z0-9]{2,10}$');
});

test('nom court proposé : initiales, ou trois premières lettres', () => {
  assert.equal(suggestEntryName('Aziz Diagne'), 'AD');
  assert.equal(suggestEntryName('Mamadou Lamine Sow'), 'MLS');
  assert.equal(suggestEntryName('Élodie Müller'), 'EM');
  assert.equal(suggestEntryName('Aziz'), 'AZI');
  assert.equal(suggestEntryName('Al'), 'AL');
  assert.equal(suggestEntryName('X'), 'XX');
  assert.equal(suggestEntryName('张伟'), '');
  assert.equal(suggestEntryName(''), '');
  for (const n of ['Aziz Diagne', 'Mamadou Lamine Sow', 'Élodie Müller', 'Aziz', 'X', 'Ousmane Ndiaye Fall Ba Seck']) {
    assert.ok(isValidEntryName(suggestEntryName(n)), `proposition invalide pour ${n}`);
  }
});

test('téléphone imprimé : Sénégal sans indicatif, autres pays avec +', () => {
  assert.equal(printedPhone('+221 77 411 51 64'), '774115164');
  assert.equal(printedPhone('00221774115164'), '774115164');
  assert.equal(printedPhone('+221774115164'), '774115164');
  assert.equal(printedPhone('77 411 51 64'), '774115164');
  assert.equal(printedPhone('+86 132 5073 4686'), '+8613250734686');
  assert.equal(printedPhone('0086 13250734686'), '+8613250734686');
  assert.equal(printedPhone('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(printedPhone(''), '');
  assert.equal(printedPhone(null), '');
  assert.equal(printedPhone(undefined), '');
});

test('ligne téléphone de la carte', () => {
  assert.equal(phoneLine('+221 77 411 51 64', 22), '774115164 / (0022)');
  assert.equal(phoneLine('', 22), '(0022)');
  assert.equal(phoneLine(null, 5), '(0005)');
});

test('nom de fichier de la carte', () => {
  assert.equal(cardFileNameFor('BTC', 22), 'diaba-cargo-BTC-0022.png');
  assert.equal(cardFileNameFor('b t c', 22), 'diaba-cargo-BTC-0022.png');
  assert.equal(cardFileNameFor('', 7), 'diaba-cargo-client-0007.png');
});
