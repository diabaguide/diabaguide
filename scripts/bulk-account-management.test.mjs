import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
test('les membres sélectionnés peuvent recevoir un rôle groupé avec des garde-fous', async () => {
  const src = await read('src/pages/admin/Members.tsx');
  assert.match(src, /const bulkRole = async/);
  assert.match(src, /setMemberRole\(id, bulkRoleTarget\)/);
  assert.match(src, /memberSkip\(id\)/);
  assert.match(src, /Changer le rôle/);
});
test('les suppressions groupées sont annoncées comme restaurables', async () => {
  for (const page of ['src/pages/admin/Members.tsx', 'src/pages/admin/Travelers.tsx']) {
    const src = await read(page);
    assert.match(src, /Supprimer \(corbeille 30 jours\)/);
    assert.match(src, /restaurables pendant 30 jours/);
  }
});
