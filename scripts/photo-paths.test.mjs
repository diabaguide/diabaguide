import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { THUMB_MAX_SIDE, isThumbPath, thumbPath } from '../src/lib/photoPaths.ts';

test('la vignette de <nom>.<ext> est <nom>-sm.webp, à côté de l\'original', () => {
  assert.equal(thumbPath('3f2a9c.jpg'), '3f2a9c-sm.webp');
  assert.equal(thumbPath('3f2a9c.webp'), '3f2a9c-sm.webp');
  assert.equal(thumbPath('3f2a9c.avif'), '3f2a9c-sm.webp');
  assert.equal(thumbPath('dossier/uuid-1234.JPG'), 'dossier/uuid-1234-sm.webp');
  assert.equal(thumbPath('sans-extension'), 'sans-extension-sm.webp');
});

test('la vignette d\'une vignette est elle-même (pas de -sm-sm)', () => {
  assert.equal(thumbPath('abc-sm.webp'), 'abc-sm.webp');
  assert.equal(thumbPath(thumbPath('abc.jpg')), 'abc-sm.webp');
});

test('isThumbPath reconnaît uniquement les vignettes', () => {
  assert.equal(isThumbPath('abc-sm.webp'), true);
  assert.equal(isThumbPath('ABC-SM.WEBP'), true);
  assert.equal(isThumbPath('abc.webp'), false);
  assert.equal(isThumbPath('abc-sm.jpg'), false);
  assert.equal(isThumbPath('smart.webp'), false);
});

test('deux photos différentes n\'ont jamais la même vignette', () => {
  assert.notEqual(thumbPath('a.jpg'), thumbPath('b.jpg'));
  assert.notEqual(thumbPath('x/a.jpg'), thumbPath('y/a.jpg'));
});

test('le script de réencodage applique la même convention que l\'application', async () => {
  const script = await readFile(new URL('./reencode-fiche-photos.mjs', import.meta.url), 'utf8');
  // String.raw : les barres obliques inverses des expressions régulières restent telles quelles.
  assert.ok(script.includes(String.raw`const isThumbPath = (p) => /-sm\.webp$/i.test(p);`), 'isThumbPath du script diffère de src/lib/photoPaths.ts');
  assert.ok(script.includes(String.raw`p.replace(/\.[A-Za-z0-9]+$/, '')`), 'thumbPath du script diffère de src/lib/photoPaths.ts');
  assert.ok(script.includes('-sm.webp'), 'le script n\'écrit pas de vignette -sm.webp');
  assert.ok(script.includes(`const THUMB_MAX_SIDE = ${THUMB_MAX_SIDE};`), 'taille de vignette du script différente de THUMB_MAX_SIDE');
});
