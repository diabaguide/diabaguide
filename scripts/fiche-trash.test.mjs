import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handlePurgeTrash } from '../api/purge-corbeille-core.js';

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), 'utf8');
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, async text() { return data == null ? '' : JSON.stringify(data); } });
const makeRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'cron-secret-123456' };

test('la migration des fiches : corbeille masquée aux voyageurs, restaurable, purge réservée', async () => {
  const sql = await read('supabase/600_fiche_trash.sql');
  assert.match(sql, /add column if not exists deleted_at/);
  assert.match(sql, /providers_read_authenticated[\s\S]*deleted_at is null/);
  for (const fn of ['admin_trash_fiches', 'admin_restore_fiches', 'admin_purge_fiches', 'purge_expired_fiches']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`));
  }
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /is_admin\(\)/);
  assert.match(sql, /revoke all on function public\.purge_expired_fiches[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.purge_expired_fiches\(text\[\]\) to service_role/);
});

test('le store garde les fiches à la corbeille hors des listes publiques', async () => {
  const store = await read('src/store.tsx');
  assert.match(store, /!x\.deletionRequestedAt && !x\.deletedAt/);
  const lib = await read('src/lib/providers.ts');
  assert.match(lib, /deleted_at/);
  assert.match(lib, /export const trashProviders/);
  assert.match(lib, /export async function setProviderCategory/);
});

test('l’écran Fiches propose les actions groupées et la corbeille a un onglet Fiches', async () => {
  const fiches = await read('src/pages/admin/Fiches.tsx');
  for (const k of ['trashProviders', 'setProviderCategory', 'fiches.trash', 'fiches.category']) assert.match(fiches, new RegExp(k));
  const trash = await read('src/pages/admin/Trash.tsx');
  for (const k of ['restoreProviders', 'purgeProviders']) assert.match(trash, new RegExp(k));
});

test('la purge quotidienne supprime aussi les fiches échues et leurs photos', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET' });
    if (u.includes('/rest/v1/profiles?')) return response(200, []);
    if (u.includes('/rest/v1/providers?')) {
      assert.match(u, /deleted_at=lt\./);
      return response(200, [{ id: 'f-1', photo_paths: ['f-1/a.webp'] }, { id: 'f-2', photo_paths: null }]);
    }
    if (init.method === 'DELETE' && u.includes('/storage/v1/object/fiche-photos')) return response(200, []);
    if (u.endsWith('/rest/v1/rpc/purge_expired_fiches')) return response(200, [{ res_id: 'f-1', res_status: 'done' }, { res_id: 'f-2', res_status: 'done' }]);
    throw new Error(`appel inattendu ${u}`);
  };
  const res = makeRes();
  await handlePurgeTrash({ method: 'GET', headers: { authorization: 'Bearer cron-secret-123456' } }, res, { env, fetch });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.fiches, 2);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.includes('fiche-photos')));
});

test('publier / dépublier : masqué aux voyageurs par la base, visible et modifiable par l’équipe', async () => {
  const sql = await read('supabase/610_fiche_publish.sql');
  assert.match(sql, /add column if not exists unpublished_at/);
  assert.match(sql, /providers_read_authenticated[\s\S]*unpublished_at is null/);
  assert.match(sql, /deleted_at is null/);
  assert.match(sql, /function public\.admin_set_fiches_published/);
  assert.match(sql, /is_admin\(\)/);
  assert.match(sql, /grant execute on function public\.admin_set_fiches_published\(text\[\], boolean\) to authenticated/);
  const store = await read('src/store.tsx');
  assert.match(store, /!x\.unpublishedAt/);
  assert.match(store, /hiddenProviders/);
  const lib = await read('src/lib/providers.ts');
  assert.match(lib, /export const publishProviders/);
  assert.match(lib, /export const unpublishProviders/);
  const fiches = await read('src/pages/admin/Fiches.tsx');
  for (const k of ['publishProviders', 'unpublishProviders', 'fiches\\.publish', 'fiches\\.unpublish']) assert.match(fiches, new RegExp(k));
});
