import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { scoreProvider, rankProviders, expandTerms, suggestAlternatives } from '../src/lib/searchScore.ts';
import { lienItineraire, APPS_ITINERAIRE, appItineraireChoisie } from '../src/lib/itineraire.ts';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const P = (o) => ({ id: o.id, name: o.name, cn: o.cn ?? '', cat: o.cat, city: 'guangzhou', district: o.district ?? '', desc: o.desc ?? '', products: o.products ?? [], services: o.services ?? [], productTags: o.productTags ?? [], cuisine: o.cuisine ?? '', goods: o.goods ?? '' });
const ctx = { categories: [{ id: 'gros', label: 'Marchés' }, { id: 'hotel', label: 'Hôtels' }, { id: 'resto', label: 'Restaurants' }], tags: [{ id: 't1', label: 'Vêtements', categoryId: 'gros' }, { id: 't2', label: 'Chaussures', categoryId: 'gros' }, { id: 't3', label: 'Sacs et cuir', categoryId: 'gros' }] };

const fiches = [
  P({ id: 'h1', name: 'Sacred Heart Hotel', cat: 'hotel', desc: 'Hôtel proche du métro' }),
  P({ id: 'h2', name: 'Sacramento Inn', cat: 'hotel' }),
  P({ id: 'cuir', name: 'Baiyun World Leather Trading Centre', cat: 'gros', productTags: ['t3'], desc: 'Sacs, ceintures et articles en cuir' }),
  P({ id: 'r1', name: 'Hadramout Restaurant', cat: 'resto', cuisine: 'Yéménite' }),
  P({ id: 'r2', name: 'A Qiang Jia Sichuan Cuisine', cat: 'resto', cuisine: 'Sichuan' }),
  P({ id: 'tex', name: 'Baiyun Textile', cat: 'gros', productTags: ['t1'], desc: 'Vêtements, tissus et wax' }),
];

test('« sac » place le marché du cuir avant les hôtels « Sacred » / « Sacramento »', () => {
  const ids = rankProviders(fiches, 'sac', ctx).map((p) => p.id);
  assert.equal(ids[0], 'cuir');
  assert.ok(!ids.includes('h1') && !ids.includes('h2'), 'un mot différent (Sacred) ne doit pas correspondre');
});

test('« restaurant » classe les restaurants avant tout le reste', () => {
  const ids = rankProviders(fiches, 'restaurant', ctx).map((p) => p.id);
  assert.deepEqual(ids.slice(0, 2).sort(), ['r1', 'r2']);
  assert.ok(!ids.includes('h1'));
});

test('« clothes » trouve les marchés de vêtements (synonymes)', () => {
  const ids = rankProviders(fiches, 'clothes', ctx).map((p) => p.id);
  assert.ok(ids.includes('tex'));
  assert.equal(ids[0], 'tex');
});

test('insensible aux accents et à la casse ; « vetement » = « vêtements »', () => {
  assert.ok(rankProviders(fiches, 'VETEMENT', ctx).some((p) => p.id === 'tex'));
});

test('recherche par début de mot, pas au milieu : « ac » ne trouve pas « Baiyun »', () => {
  assert.equal(scoreProvider(P({ id: 'x', name: 'Baiyun', cat: 'gros' }), 'ia', ctx), 0);
  assert.ok(scoreProvider(P({ id: 'x', name: 'Baiyun Market', cat: 'gros' }), 'baiy', ctx) > 0);
});

test('une simple mention dans la description est écartée quand de bons résultats existent', () => {
  const l = [P({ id: 'r', name: 'Chez Awa', cat: 'resto' }), P({ id: 'h', name: 'Grand Hotel', cat: 'hotel', desc: 'Hôtel avec restaurant sur place' })];
  assert.deepEqual(rankProviders(l, 'restaurant', ctx).map((p) => p.id), ['r']);
  // sans meilleur résultat, la mention en description reste trouvable
  assert.deepEqual(rankProviders([l[1]], 'restaurant', ctx).map((p) => p.id), ['h']);
});

test('plusieurs mots : tous doivent correspondre', () => {
  assert.ok(rankProviders(fiches, 'sac cuir', ctx).some((p) => p.id === 'cuir'));
  assert.equal(rankProviders(fiches, 'sac sichuan', ctx).length, 0);
});

test('la catégorie pèse plus que le nom, qui pèse plus que la description', () => {
  const parCat = scoreProvider(P({ id: 'a', name: 'X', cat: 'hotel' }), 'hôtels', ctx);
  const parNom = scoreProvider(P({ id: 'b', name: 'Hôtels Union', cat: 'gros' }), 'hôtels', ctx);
  const parDesc = scoreProvider(P({ id: 'c', name: 'Autre', cat: 'gros', desc: 'proche des hôtels' }), 'hôtels', ctx);
  assert.ok(parCat > parNom && parNom > parDesc && parDesc > 0);
});

test('expandTerms : français, anglais et chinois', () => {
  assert.ok(expandTerms('clothes').includes('vetement'));
  assert.ok(expandTerms('服装').includes('vetement'));
  assert.ok(expandTerms('shoes').includes('chaussure'));
});

test('suggestAlternatives : propose des termes réels, jamais inventés', () => {
  const s = suggestAlternatives('xyzqwe', ctx);
  assert.ok(s.length > 0 && s.length <= 3);
  for (const x of s) assert.ok(ctx.tags.some((t) => t.label === x.label) || ctx.categories.some((c) => c.label === x.label));
});

test('itinéraire : Amap, Baidu, Apple Plans, OpenStreetMap, avec coordonnées à 6 décimales', () => {
  const p = { lat: 23.152873, lng: 113.264391, name: 'Marché Test' };
  assert.deepEqual(APPS_ITINERAIRE.map((a) => a.id), ['amap', 'baidu', 'apple', 'osm']);
  const amap = lienItineraire('amap', p);
  assert.match(amap, /^https:\/\/uri\.amap\.com\/navigation\?/);
  assert.match(amap, /to=113\.264391,23\.152873,/);
  assert.match(amap, /coordinate=wgs84/);
  assert.match(lienItineraire('baidu', p), /^https:\/\/api\.map\.baidu\.com\/direction\?/);
  assert.match(lienItineraire('baidu', p), /coord_type=wgs84/);
  assert.match(lienItineraire('apple', p), /^https:\/\/maps\.apple\.com\/\?daddr=23\.152873,113\.264391/);
  assert.match(lienItineraire('osm', p), /openstreetmap\.org\/directions\?to=23\.152873%2C113\.264391/);
  assert.equal(appItineraireChoisie(null), 'amap');
  assert.equal(appItineraireChoisie('baidu'), 'baidu');
  assert.equal(appItineraireChoisie('inconnu'), 'amap');
});

test('aucune ressource externe de police ni de carte Google', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|google/i);
});

test('les écrans utilisent le classement, les itinéraires et le journal d’usage', async () => {
  const search = await read('src/pages/Search.tsx');
  const fiche = await read('src/pages/Fiche.tsx');
  const driver = fiche.slice(fiche.indexOf('export function Driver'));
  assert.match(search, /rankProviders/);
  assert.match(search, /suggestAlternatives/);
  assert.match(fiche, /lienItineraire/);
  assert.match(fiche, /logUsage\('chauffeur'/);
  assert.match(fiche, /logUsage\('itineraire'/);
  assert.match(fiche, /logUsage\('appel'/);
  assert.match(fiche, /logUsage\('wechat'/);
  assert.match(search, /logUsage\('chauffeur'/);
  assert.match(driver, /Écouter|speechSynthesis|logUsage/);
});
