import assert from 'node:assert/strict';
import test from 'node:test';
import { EAN13_MODULES, MAX_CLIENT_NO, clientBarcode, ean13CheckDigit, ean13Modules, isValidEan13 } from '../src/lib/barcode.ts';

/* Décodeur indépendant : relit les 95 modules et retrouve les 13 chiffres. Il ne
   partage avec l'encodeur que les tables de la norme EAN-13 (copiées ici telles
   quelles), pas son code. */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function decode(modules) {
  const bits = modules.map((m) => (m ? '1' : '0')).join('');
  assert.equal(bits.length, 95);
  assert.equal(bits.slice(0, 3), '101', 'garde de début');
  assert.equal(bits.slice(45, 50), '01010', 'garde centrale');
  assert.equal(bits.slice(92), '101', 'garde de fin');
  const left = []; let parity = '';
  for (let i = 0; i < 6; i++) {
    const g = bits.slice(3 + i * 7, 10 + i * 7);
    const l = L.indexOf(g); const gg = G.indexOf(g);
    assert.ok(l >= 0 || gg >= 0, `groupe gauche illisible : ${g}`);
    if (l >= 0) { left.push(l); parity += 'L'; } else { left.push(gg); parity += 'G'; }
  }
  const first = PARITY.indexOf(parity);
  assert.ok(first >= 0, `parité inconnue : ${parity}`);
  const right = [];
  for (let i = 0; i < 6; i++) {
    const g = bits.slice(50 + i * 7, 57 + i * 7);
    const r = R.indexOf(g);
    assert.ok(r >= 0, `groupe droit illisible : ${g}`);
    right.push(r);
  }
  return [first, ...left, ...right].join('');
}

test('le code de référence : client n° 0 → 2000000000008', () => {
  assert.equal(clientBarcode(0), '2000000000008');
});

test('numéro client → 200 + 9 chiffres + clé de contrôle', () => {
  assert.equal(clientBarcode(1), '2000000000015');
  assert.equal(clientBarcode(22), '2000000000220');
  assert.equal(clientBarcode(MAX_CLIENT_NO).slice(0, 12), '200999999999');
  for (const n of [0, 1, 7, 22, 100, 4096, 999999]) {
    const c = clientBarcode(n);
    assert.equal(c.length, 13);
    assert.ok(c.startsWith('200'));
    assert.equal(Number(c.slice(3, 12)), n);
    assert.ok(isValidEan13(c), `clé invalide pour ${n} : ${c}`);
  }
});

test('clé de contrôle : codes EAN-13 du commerce, publiés dans la norme', () => {
  assert.equal(ean13CheckDigit('400638133393'), 1); // 4006381333931
  assert.equal(ean13CheckDigit('590123412345'), 7); // 5901234123457
  assert.equal(ean13CheckDigit('978020137962'), 4); // 9780201379624
  assert.equal(ean13CheckDigit('544900000099'), 6); // 5449000000996 (Coca-Cola 33 cl)
  assert.equal(ean13CheckDigit('301762042200'), 3); // 3017620422003 (Nutella)
  for (const ok of ['4006381333931', '5901234123457', '9780201379624', '5449000000996', '3017620422003', '2000000000008']) assert.ok(isValidEan13(ok), ok);
  for (const ko of ['4006381333932', '5901234123450', '200000000000', '20000000000080', 'abcdefghijklm', '']) assert.ok(!isValidEan13(ko), ko);
});

test('numéros de client invalides refusés', () => {
  for (const n of [-1, 1.5, MAX_CLIENT_NO + 1, NaN, Infinity]) assert.throws(() => clientBarcode(n), /invalide/);
  assert.throws(() => ean13CheckDigit('12345'), /12 chiffres/);
  assert.throws(() => ean13Modules('2000000000009'), /invalide/);
});

test('le motif fait 95 modules, avec ses gardes et ses 59 modules noirs ou plus', () => {
  const m = ean13Modules('2000000000008');
  assert.equal(m.length, EAN13_MODULES);
  assert.deepEqual(m.slice(0, 3), [true, false, true]);
  assert.deepEqual(m.slice(92), [true, false, true]);
  assert.ok(m.some(Boolean) && m.some((x) => !x));
});

test('aller-retour : les barres relues redonnent exactement le numéro (2 000 numéros)', () => {
  const nums = new Set([0, 1, 2, 9, 10, 22, 99, 100, 999, 1000, 65535, 999999, 123456789, MAX_CLIENT_NO]);
  let s = 42;
  while (nums.size < 2000) { s = (s * 1103515245 + 12345) & 0x7fffffff; nums.add(s % (MAX_CLIENT_NO + 1)); }
  for (const n of nums) {
    const code = clientBarcode(n);
    assert.equal(decode(ean13Modules(code)), code, `échec pour le client ${n}`);
  }
});

test('aller-retour sur des codes du commerce (tous les premiers chiffres)', () => {
  for (const code of ['4006381333931', '5901234123457', '9780201379624', '0123456789012'.slice(0, 12) + ean13CheckDigit('012345678901'), '3017620422003', '7612345678900'.slice(0, 12) + ean13CheckDigit('761234567890'), '1000000000009'.slice(0, 12) + ean13CheckDigit('100000000000'), '6000000000000'.slice(0, 12) + ean13CheckDigit('600000000000'), '8000000000000'.slice(0, 12) + ean13CheckDigit('800000000000')]) {
    assert.ok(isValidEan13(code), code);
    assert.equal(decode(ean13Modules(code)), code);
  }
});
