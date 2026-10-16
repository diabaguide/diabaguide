import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { niveauPrix, symbolesPrix, statutHalal, libelleHalal, typeCuisine, statutOuverture, appliquerFiltres, optionsFiltres } from '../src/lib/filtresFiche.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const P = (o) => ({ cat: 'hotel', metro: '', productTags: [], ...o });

test('niveauPrix : niveau saisi, sinon déduit du prix par nuit, sinon rien', () => {
  assert.equal(niveauPrix(P({ priceLevel: 2 })), 2);
  assert.equal(niveauPrix(P({ priceNight: 150 })), 1);
  assert.equal(niveauPrix(P({ priceNight: 199 })), 1);
  assert.equal(niveauPrix(P({ priceNight: 200 })), 2);
  assert.equal(niveauPrix(P({ priceNight: 400 })), 2);
  assert.equal(niveauPrix(P({ priceNight: 401 })), 3);
  assert.equal(niveauPrix(P({})), null);
  assert.equal(niveauPrix(P({ priceLevel: 9 })), null);
});

test('symbolesPrix', () => {
  assert.equal(symbolesPrix(1), '¥');
  assert.equal(symbolesPrix(3), '¥¥¥');
  assert.equal(symbolesPrix(null), '');
});

test('statutHalal : colonne dédiée, sinon lecture prudente du texte historique', () => {
  assert.equal(statutHalal({ halalStatus: 'confirmed' }), 'confirmed');
  assert.equal(statutHalal({ halal: 'Oui' }), 'confirmed');
  assert.equal(statutHalal({ halal: 'Non confirmé 100%' }), 'unverified');
  assert.equal(statutHalal({ halal: 'Non' }), 'no');
  assert.equal(statutHalal({ halal: 'Plat du jour' }), null);
  assert.equal(statutHalal({}), null);
  assert.equal(statutHalal({ halalStatus: 'confirmed', halal: 'Non confirmé' }), 'confirmed');
});

test('libelleHalal : formulations de l’audit', () => {
  assert.equal(libelleHalal('confirmed'), 'Halal confirmé par Diaba');
  assert.equal(libelleHalal('unverified'), 'Halal : non vérifié par Diaba');
  assert.equal(libelleHalal('no'), 'Non halal');
  assert.equal(libelleHalal(null), '');
});

test('typeCuisine : colonne dédiée, sinon mots-clés du texte historique', () => {
  assert.equal(typeCuisine({ cuisineType: 'africaine' }), 'africaine');
  assert.equal(typeCuisine({ cuisine: 'Cuisine yéménite, moyen-orientale et arabe.' }), 'arabe');
  assert.equal(typeCuisine({ cuisine: 'Cuisine chinoise – Sichuan / 川菜.' }), 'chinoise');
  assert.equal(typeCuisine({ cuisine: 'Poulet yassa, mafé, thiéboudienne' }), null);
  assert.equal(typeCuisine({}), null);
});

test('statutOuverture : calculé à partir des horaires, sans deviner', () => {
  const h = (hh, mm = 0) => new Date(2026, 9, 16, hh, mm);
  assert.deepEqual(statutOuverture('11h00 – 22h00', h(15)), { ouvert: true, texte: 'Ouvert · ferme à 22h' });
  assert.deepEqual(statutOuverture('11h00 – 22h00', h(23)), { ouvert: false, texte: 'Fermé · ouvre à 11h' });
  assert.deepEqual(statutOuverture('08h00 – 01h00.', h(0, 30)), { ouvert: true, texte: 'Ouvert · ferme à 1h' });
  assert.deepEqual(statutOuverture('08h00 – 01h00.', h(3)), { ouvert: false, texte: 'Fermé · ouvre à 8h' });
  assert.deepEqual(statutOuverture('11:30 - 21:30', h(12)), { ouvert: true, texte: 'Ouvert · ferme à 21h30' });
  assert.equal(statutOuverture('Tous les jours sauf le lundi', h(12)), null);
  assert.equal(statutOuverture('', h(12)), null);
  assert.equal(statutOuverture(undefined, h(12)), null);
});

const liste = [
  P({ id: 'a', cat: 'hotel', priceNight: 150, metro: 'Ligne 5' }),
  P({ id: 'b', cat: 'hotel', priceNight: 300 }),
  P({ id: 'c', cat: 'hotel', priceLevel: 3, metro: 'Ligne 2' }),
  P({ id: 'd', cat: 'resto', halalStatus: 'confirmed', cuisineType: 'africaine', priceLevel: 1 }),
  P({ id: 'e', cat: 'resto', halal: 'Non confirmé 100%', cuisine: 'Cuisine chinoise' }),
  P({ id: 'f', cat: 'gros', productTags: ['t1', 't2'] }),
  P({ id: 'g', cat: 'gros', productTags: ['t2'] }),
];

test('appliquerFiltres : prix, métro, halal, cuisine, produit', () => {
  const ids = (f) => appliquerFiltres(liste, f).map((p) => p.id);
  assert.deepEqual(ids({ prix: '1' }), ['a', 'd']);
  assert.deepEqual(ids({ prix: '3', cat: 'hotel' }), ['c']);
  assert.deepEqual(ids({ metro: true }), ['a', 'c']);
  assert.deepEqual(ids({ halal: true }), ['d']);
  assert.deepEqual(ids({ cuisine: 'chinoise' }), ['e']);
  assert.deepEqual(ids({ prod: 't2' }), ['f', 'g']);
  assert.deepEqual(ids({}), liste.map((p) => p.id));
});

test('optionsFiltres : n’affiche que ce qui existe réellement, avec les effectifs', () => {
  const o = optionsFiltres(liste.filter((p) => p.cat === 'hotel'));
  assert.deepEqual(o.prix, { 1: 1, 2: 1, 3: 1 });
  assert.equal(o.metro, 2);
  assert.equal(o.halal, 0);
  assert.deepEqual(o.cuisines, {});
  const r = optionsFiltres(liste.filter((p) => p.cat === 'resto'));
  assert.equal(r.halal, 1);
  assert.deepEqual(r.cuisines, { africaine: 1, chinoise: 1 });
  assert.deepEqual(optionsFiltres(liste.filter((p) => p.cat === 'gros')).produits, { t1: 1, t2: 2 });
  assert.deepEqual(optionsFiltres([]).prix, {});
});

test('migration 620 : colonnes additives, contraintes et retour arrière', async () => {
  const sql = await read('supabase/620_fiche_filters.sql');
  for (const col of ['price_level', 'price_night', 'halal_status', 'cuisine_type']) assert.match(sql, new RegExp(`add column if not exists ${col}`, 'i'));
  assert.match(sql, /check \(price_level between 1 and 3\)/i);
  assert.match(sql, /halal_status in \('confirmed', ?'unverified', ?'no'\)/i);
  assert.match(sql, /retour arrière|rollback/i);
  assert.doesNotMatch(sql, /drop table|delete from|truncate/i);
  assert.doesNotMatch(sql, /update public\.providers set (price|lat|lng|tel)/i);
});

test('les écrans appliquent les filtres, la ligne d’infos clés et la barre d’actions', async () => {
  const search = await read('src/pages/Search.tsx');
  const fiche = await read('src/pages/Fiche.tsx');
  const prov = await read('src/lib/providers.ts');
  const admin = await read('src/pages/admin/Fiches.tsx');
  assert.match(search, /appliquerFiltres/);
  assert.match(search, /optionsFiltres/);
  assert.match(search, /ContextFilters/);
  assert.match(fiche, /statutOuverture/);
  assert.match(fiche, /symbolesPrix/);
  assert.match(fiche, /libelleHalal/);
  assert.match(fiche, /fiche-actionbar/);
  assert.match(fiche, /Voir sur la carte/);
  assert.doesNotMatch(fiche, /tr\("Position"\)/);
  assert.match(fiche, /Signaler une erreur/);
  assert.match(prov, /price_level/);
  assert.match(prov, /halal_status/);
  assert.match(admin, /priceLevel/);
  assert.match(admin, /Cuisine halal/);
  assert.match(admin, /cuisineType/);
});

test('l’enregistrement d’une fiche n’envoie les nouvelles colonnes que si elles sont renseignées', async () => {
  const prov = await read('src/lib/providers.ts');
  const i = prov.indexOf('function providerToRow');
  const bloc = prov.slice(i, prov.indexOf('/** Identifiant lisible', i));
  assert.match(bloc, /includeFicheFilters && p\.priceLevel/);
  assert.match(bloc, /includeFicheFilters && p\.halalStatus/);
});
