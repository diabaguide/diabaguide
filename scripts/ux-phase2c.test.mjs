import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { completude, manquantsPourStatut, aRever, statutVisible, STATUTS } from '../src/lib/completude.ts';
import { evaluerPosition } from '../src/lib/positionSaisie.ts';
import { coordsFiables, etiquetteFiche } from '../src/lib/contact.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const complet = {
  name: 'Hôtel A', cn: '酒店', cat: 'hotel', district: 'Baiyun', addrCn: '广州市白云区', photoPaths: ['a.jpg'],
  lat: 23.152873, lng: 113.264391, coordsVerified: true, tel: '020 8305 4520', priceLevel: 2,
};

test('statuts : Brouillon → À vérifier → Publié', () => {
  assert.deepEqual(STATUTS.map((s) => s.id), ['draft', 'review', 'published']);
  assert.deepEqual(STATUTS.map((s) => s.label), ['Brouillon', 'À vérifier', 'Publié']);
});

test('complétude : une fiche complète de la catégorie hôtel', () => {
  const c = completude(complet);
  assert.equal(c.ok, c.total);
  assert.deepEqual(c.manquants, []);
});

test('complétude : liste exactement ce qui manque, par catégorie', () => {
  const c = completude({ name: 'X', cn: 'x', cat: 'hotel', addrCn: '', photoPaths: [], lat: 23.13, lng: 113.27 });
  assert.deepEqual(c.manquants, ['Photo de façade', 'Adresse en chinois', 'Position vérifiée', 'Un contact (téléphone ou WeChat)', 'Prix']);
  assert.equal(c.ok, c.total - 5);
  const m = completude({ ...complet, cat: 'gros', priceLevel: undefined, hours: undefined, productTags: [] });
  assert.deepEqual(m.manquants, ['Horaires', 'Produits']);
  const r = completude({ ...complet, cat: 'resto', priceLevel: undefined });
  assert.deepEqual(r.manquants, ['Horaires', 'Cuisine', 'Statut halal']);
});

test('une position est « vérifiée » seulement si fiable ET marquée vérifiée quand la colonne existe', () => {
  assert.equal(completude({ ...complet, coordsVerified: false }).manquants.includes('Position vérifiée'), true);
  assert.equal(completude({ ...complet, coordsVerified: undefined }).manquants.includes('Position vérifiée'), false);
  assert.equal(completude({ ...complet, lat: 23.13, lng: 113.27, coordsVerified: undefined }).manquants.includes('Position vérifiée'), true);
});

test('manquantsPourStatut : le brouillon passe toujours ; « À vérifier » et « Publié » exigent la fiche complète', () => {
  const vide = { name: 'X', cn: 'x', cat: 'hotel', lat: 23.13, lng: 113.27 };
  assert.deepEqual(manquantsPourStatut(vide, 'draft'), []);
  assert.ok(manquantsPourStatut(vide, 'review').length > 0);
  assert.ok(manquantsPourStatut(vide, 'published').length > 0);
  assert.deepEqual(manquantsPourStatut(complet, 'published'), []);
});

test('statutVisible : sans colonne ou publié = visible aux voyageurs ; brouillon et à vérifier = masqués', () => {
  assert.equal(statutVisible(undefined), true);
  assert.equal(statutVisible('published'), true);
  assert.equal(statutVisible('draft'), false);
  assert.equal(statutVisible('review'), false);
});

test('aRever : plus de 6 mois ou date absente / illisible', () => {
  const now = new Date(2026, 9, 16);
  assert.equal(aRever('25 sept. 2026', now), false);
  assert.equal(aRever('16 avr. 2026', now), true);
  assert.equal(aRever('17 avr. 2026', now), false);
  assert.equal(aRever('', now), true);
  assert.equal(aRever(undefined, now), true);
  assert.equal(aRever('hier', now), true);
  assert.equal(aRever('3 mars 2025', now), true);
});

test('evaluerPosition : refuse les coordonnées par défaut, hors de Chine ou trop imprécises', () => {
  assert.equal(evaluerPosition({ lat: 23.13, lng: 113.27, accuracy: 5 }).ok, false);
  assert.equal(evaluerPosition({ lat: 14.69, lng: -17.44, accuracy: 5 }).ok, false);
  assert.equal(evaluerPosition({ lat: 23.152873, lng: 113.264391, accuracy: 250 }).ok, false);
  assert.equal(evaluerPosition({ lat: Number.NaN, lng: 113.2, accuracy: 5 }).ok, false);
  const bon = evaluerPosition({ lat: 23.1528731234, lng: 113.2643912345, accuracy: 12 });
  assert.equal(bon.ok, true);
  assert.equal(bon.lat, 23.152873);
  assert.equal(bon.lng, 113.264391);
});

test('coordsFiables : respecte la colonne coords_verified quand elle existe', () => {
  assert.equal(coordsFiables({ lat: 23.152873, lng: 113.264391, coordsVerified: false }), false);
  assert.equal(coordsFiables({ lat: 23.152873, lng: 113.264391, coordsVerified: true }), true);
  assert.equal(coordsFiables({ lat: 23.152873, lng: 113.264391 }), true);
  assert.equal(coordsFiables({ lat: 23.13, lng: 113.27, coordsVerified: true }), false);
});

test('etiquetteFiche : le choix de l’équipe prime sur la détection automatique', () => {
  assert.equal(etiquetteFiche({ name: 'DIABA CARGO', partnerLabel: 'partenaire' }), 'Partenaire');
  assert.equal(etiquetteFiche({ name: 'Autre', partnerLabel: 'service_diaba' }), 'Service Diaba');
  assert.equal(etiquetteFiche({ name: 'DIABA CARGO' }), 'Service Diaba');
  assert.equal(etiquetteFiche({ name: 'Autre', featured: true }), 'Partenaire');
});

test('migration 630 : additive, sécurisée, réversible', async () => {
  const sql = await read('supabase/630_fiche_workflow.sql');
  for (const c of ['review_status', 'coords_verified', 'partner_label']) assert.match(sql, new RegExp(`add column if not exists ${c}`, 'i'));
  assert.match(sql, /review_status in \('draft', ?'review', ?'published'\)/i);
  assert.match(sql, /default 'published'/i);
  assert.match(sql, /create table if not exists public\.provider_notes/i);
  assert.match(sql, /alter table public\.provider_notes enable row level security/i);
  assert.match(sql, /public\.is_team\(\)/);
  assert.match(sql, /review_status = 'published'/);
  assert.match(sql, /create trigger providers_status_guard/i);
  assert.match(sql, /auth\.uid\(\) is null/i);
  assert.match(sql, /Seul un administrateur peut publier/);
  assert.match(sql, /select \* into v_old from public\.providers where id = new\.id/);
  assert.match(sql, /retour arrière|rollback/i);
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(code, /drop table|delete from|truncate|drop column/i);
});

test('les écrans d’équipe offrent capture GPS, statuts, jauge, aperçu, note interne et étiquette', async () => {
  const edit = await read('src/pages/admin/Fiches.tsx');
  assert.match(edit, /Enregistrer ma position ici/);
  assert.match(edit, /evaluerPosition/);
  assert.match(edit, /completude\(/);
  assert.match(edit, /manquantsPourStatut/);
  assert.match(edit, /Note pour l’équipe/);
  assert.match(edit, /Aperçu voyageur/);
  assert.match(edit, /partnerLabel/);
  assert.match(edit, /aRever/);
  assert.match(edit, /Fiches incomplètes/);
  const store = await read('src/store.tsx');
  assert.match(store, /statutVisible/);
  const prov = await read('src/lib/providers.ts');
  assert.match(prov, /review_status/);
  assert.match(prov, /provider_notes/);
});
