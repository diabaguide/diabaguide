import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { aUnContact, coordsFiables, formatTelChine, lienTel, etiquetteFiche, afficherTriNotes } from '../src/lib/contact.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');

test('formatTelChine : indicatif +86 pour un fixe ou un mobile chinois', () => {
  assert.equal(formatTelChine('020-83054520'), '+86 20 8305 4520');
  assert.equal(formatTelChine('020 8305 4520'), '+86 20 8305 4520');
  assert.equal(formatTelChine('13800138000'), '+86 138 0013 8000');
  assert.equal(formatTelChine('+86 20 8305 4520'), '+86 20 8305 4520');
  assert.equal(formatTelChine('0086 138 0013 8000'), '+86 138 0013 8000');
});

test('formatTelChine : un numéro non reconnu est renvoyé tel quel, jamais inventé', () => {
  assert.equal(formatTelChine('12345'), '12345');
  assert.equal(formatTelChine(''), '');
  assert.equal(formatTelChine(undefined), '');
  assert.equal(formatTelChine('+221 77 123 45 67'), '+221 77 123 45 67');
});

test('lienTel : lien tel: international sans espaces', () => {
  assert.equal(lienTel('020-83054520'), 'tel:+862083054520');
  assert.equal(lienTel(''), '');
});

test('aUnContact : téléphone ou WeChat renseigné', () => {
  assert.equal(aUnContact({ tel: '', wechat: '' }), false);
  assert.equal(aUnContact({ tel: '  ', wechat: undefined }), false);
  assert.equal(aUnContact({ tel: '020-83054520' }), true);
  assert.equal(aUnContact({ wechat: 'abc123' }), true);
});

test('coordsFiables : refuse l’absence, l’arrondi grossier et les coordonnées par défaut', () => {
  assert.equal(coordsFiables({ lat: 23.13, lng: 113.27 }), false);
  assert.equal(coordsFiables({ lat: 23.1, lng: 113.2 }), false);
  assert.equal(coordsFiables({ lat: 0, lng: 0 }), false);
  assert.equal(coordsFiables({ lat: Number.NaN, lng: 113.27341 }), false);
  assert.equal(coordsFiables({ lat: 23.152873, lng: 113.264391 }), true);
});

test('etiquetteFiche : service Diaba, partenaire, ou rien', () => {
  assert.equal(etiquetteFiche({ name: 'DIABA CARGO', featured: false }), 'Service Diaba');
  assert.equal(etiquetteFiche({ name: 'Baiyun Market', featured: true }), 'Partenaire');
  assert.equal(etiquetteFiche({ name: 'Baiyun Market', featured: false }), null);
});

test('afficherTriNotes : au moins 3 fiches notées', () => {
  assert.equal(afficherTriNotes([{ ratingCount: 1 }, { ratingCount: 0 }, {}]), false);
  assert.equal(afficherTriNotes([{ ratingCount: 1 }, { ratingCount: 4 }, { ratingCount: 2 }]), true);
});

test('les écrans appliquent les règles de la phase 1', async () => {
  const search = await read('src/pages/Search.tsx');
  const fiche = await read('src/pages/Fiche.tsx');
  const home = await read('src/pages/Home.tsx');
  const ui = await read('src/ui.tsx');
  assert.match(search, /aUnContact\(p\)/);
  assert.match(search, /coordsFiables/);
  assert.match(search, /afficherTriNotes/);
  assert.match(search, /'Pertinence'/);
  assert.doesNotMatch(search, /'Recommandées'/);
  assert.match(fiche, /aUnContact\(p\)/);
  assert.match(fiche, /coordsFiables\(p\)/);
  assert.match(fiche, /Contact non disponible/);
  assert.match(fiche, /lienTel/);
  assert.doesNotMatch(home, /Suivre un envoi/);
  assert.match(home, /defaultValue=|onSubmit/);
  assert.doesNotMatch(ui, /<NotProvided \/>\}<\/div>;\r?\n\}\r?\nexport function Section/);
});
