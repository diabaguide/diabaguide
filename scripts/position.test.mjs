import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../src/lib/position.ts', import.meta.url), 'utf8')
  .replace(/^import .*$/m, 'const whatsappUrl = (t) => `https://wa.me/?text=${encodeURIComponent(t)}`;')
  .replace(/export interface[\s\S]*?\n\n/, '').replace(/export type .*\n/, '')
  .replace(/: Pick<[^)]*>/g, '').replace(/\(p: PositionLieu\)/g, '(p)').replace(/\(p: \{ lat: number; lng: number \}\)/g, '(p)')
  .replace(/: Promise<EnvoiPosition>/, '').replace(/\(e as Error\)/, '(e)').replace(/const coord = \(n: number\)/, 'const coord = (n)');
const m = await import('data:text/javascript,' + encodeURIComponent(src));
const lieu = { name: 'Marché test', cn: '测试市场', addrCn: '广州市白云区', lat: 23.1234567, lng: 113.2 };
test('lien de carte sur les coordonnées', () => assert.equal(m.lienPosition(lieu), 'https://www.google.com/maps/search/?api=1&query=23.123457%2C113.200000'));
test('message : nom, adresse chinoise, lien', () => {
  const t = m.messagePosition(lieu).split('\n');
  assert.deepEqual(t.slice(0, 2), ['Marché test · 测试市场', '广州市白云区']); assert.match(t[2], /^https:\/\/www\.google\.com\/maps/);
});
test('message sans adresse ni nom chinois', () => assert.equal(m.messagePosition({ name: 'A', lat: 1, lng: 2 }).split('\n').length, 2));
test('coordonnées invalides refusées', () => {
  assert.equal(m.positionValide({ lat: 0, lng: 0 }), false); assert.equal(m.positionValide({ lat: NaN, lng: 1 }), false);
  assert.equal(m.positionValide({ lat: 91, lng: 1 }), false); assert.equal(m.positionValide(lieu), true);
});
