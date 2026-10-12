import assert from 'node:assert/strict';
import test from 'node:test';
import { gcj02ToWgs84, lienAmap, lirePosition, wgs84ToGcj02 } from '../src/lib/amap.ts';

// Guangzhou, tour Canton (GPS)
const GZ = { lat: 23.1065, lng: 113.3245 };
const dist = (a, b) => {
  const k = Math.PI / 180, R = 6371000;
  const x = (b.lng - a.lng) * k * Math.cos(((a.lat + b.lat) / 2) * k), y = (b.lat - a.lat) * k;
  return Math.sqrt(x * x + y * y) * R;
};

test('GPS → Amap décale de plusieurs centaines de mètres, et le retour est exact', () => {
  const g = wgs84ToGcj02(GZ);
  const d = dist(GZ, g);
  assert.ok(d > 100 && d < 1000, `décalage ${d} m`);
  assert.ok(dist(GZ, gcj02ToWgs84(g)) < 1, 'aller-retour sous le mètre');
});

test('hors de Chine : aucune conversion', () => {
  const dakar = { lat: 14.6937, lng: -17.4441 };
  assert.deepEqual(wgs84ToGcj02(dakar), dakar);
  assert.deepEqual(gcj02ToWgs84(dakar), dakar);
});

test('lien « marker » d’Amap (longitude,latitude en GCJ-02) converti en GPS', () => {
  const g = wgs84ToGcj02(GZ);
  const r = lirePosition(`https://uri.amap.com/marker?position=${g.lng.toFixed(6)},${g.lat.toFixed(6)}&name=Test`);
  assert.equal(r?.type, 'coordonnees');
  assert.equal(r.source, 'amap');
  assert.ok(dist(GZ, r) < 2, 'retrouve le point GPS');
});

test('coordinate=wgs84 : pas de conversion', () => {
  const r = lirePosition('https://uri.amap.com/marker?position=113.3245,23.1065&coordinate=wgs84');
  assert.deepEqual([r.lat, r.lng], [23.1065, 113.3245]);
});

test('message de partage complet : le lien est trouvé dans le texte', () => {
  const r = lirePosition('我在高德地图分享了位置：白云纺织市场 https://uri.amap.com/marker?position=113.3300,23.1100&name=%E7%99%BD%E4%BA%91 点击查看');
  assert.equal(r?.type, 'coordonnees');
  // Le point GCJ-02 (23.1100, 113.3300) correspond à un point GPS décalé d'environ 500 m.
  const d = dist({ lat: 23.11, lng: 113.33 }, r);
  assert.ok(d > 100 && d < 1000, `décalage ${d} m`);
});

test('lien raccourci : pas de coordonnées, le lien est conservé pour l’équipe', () => {
  const r = lirePosition('https://surl.amap.com/abc123XYZ');
  assert.deepEqual(r, { type: 'lien', lien: 'https://surl.amap.com/abc123XYZ' });
});

test('coordonnées saisies : GPS, ordre libre en Chine, séparateurs variés', () => {
  for (const t of ['23.1065, 113.3245', '113.3245,23.1065', '23.1065 113.3245', '23.1065;113.3245']) {
    const r = lirePosition(t);
    assert.deepEqual([r.lat, r.lng, r.source], [23.1065, 113.3245, 'saisie'], t);
  }
});

test('texte sans position, coordonnées impossibles et 0,0 refusés', () => {
  for (const t of ['', 'près du marché', 'https://example.com/page', '0,0', '95, 200', '12345']) assert.equal(lirePosition(t), null, t);
});

test('lien Amap sur un point GPS', () => {
  assert.equal(lienAmap(GZ, 'Test'), 'https://uri.amap.com/marker?position=113.324500,23.106500&name=Test&coordinate=wgs84&callnative=1');
});
