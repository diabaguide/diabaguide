import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const src = await readFile(new URL('../src/pages/admin/Admin.tsx', import.meta.url), 'utf8');
test('le menu équipe est rangé en cinq groupes métier', () => {
  const labels = ['TRAVAIL QUOTIDIEN', 'FRET', 'RÉPERTOIRE', 'COMMUNAUTÉ', 'ADMINISTRATION'];
  let previous = -1;
  for (const label of labels) {
    const index = src.indexOf(label);
    assert.ok(index > previous, `${label} doit suivre le groupe précédent`);
    previous = index;
  }
  assert.match(src, /Suppressions à valider/);
  assert.match(src, /nav-section-title/);
});
