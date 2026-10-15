import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { handlePurgeTrash } from '../api/purge-corbeille-core.js';

const base = new URL('..', import.meta.url);
const read = (p) => readFile(new URL(p, base), 'utf8');
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, async text() { return data == null ? '' : JSON.stringify(data); } });
const makeRes = () => ({ statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(v) { this.body = v; return this; } });
const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key', CRON_SECRET: 'cron-secret-123456' };

test('la migration de corbeille protège soi-même, l’administrateur principal et le dernier administrateur', async () => {
  const sql = await read('supabase/580_account_trash.sql');
  assert.match(sql, /add column if not exists deleted_at/);
  for (const fn of ['admin_trash_accounts', 'admin_restore_accounts', 'admin_purge_accounts', 'purge_expired_accounts']) {
    assert.match(sql, new RegExp(`function public\\.${fn}`));
  }
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(sql, /is_primary_admin/);
  assert.match(sql, /Dernier administrateur/);
  assert.match(sql, /banned_until/);
  assert.match(sql, /interval '30 days'/);
  assert.match(sql, /revoke all on function public\.purge_expired_accounts[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.purge_expired_accounts\(uuid\[\]\) to service_role/);
});

test('un compte créé par un administrateur est explicitement actif', async () => {
  const core = await read('api/auth-pin-core.js');
  const legacy = await read('api/creer-voyageur.js');
  for (const source of [core, legacy]) {
    assert.match(source, /status: 'active'/);
    assert.match(source, /suspended_at: null/);
  }
});

test('la purge quotidienne exige le secret du cron', async () => {
  const res = makeRes();
  await handlePurgeTrash({ method: 'GET', headers: {} }, res, { env, fetch: async () => response(200, []) });
  assert.equal(res.statusCode, 401);
  const wrong = makeRes();
  await handlePurgeTrash({ method: 'GET', headers: { authorization: 'Bearer autre' } }, wrong, { env, fetch: async () => response(200, []) });
  assert.equal(wrong.statusCode, 401);
});

test('la purge efface les fichiers puis les comptes échus, sans toucher aux autres', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, method: init.method ?? 'GET', body: init.body });
    if (u.includes('/rest/v1/profiles?')) {
      assert.match(u, /deleted_at=lt\./);
      return response(200, [{ id: 'old-1' }, { id: 'old-2' }]);
    }
    if (u.includes('/storage/v1/object/list/')) return response(200, [{ name: 'photo.webp' }]);
    if (init.method === 'DELETE' && u.includes('/storage/v1/object/')) return response(200, []);
    if (u.endsWith('/rest/v1/rpc/purge_expired_accounts')) return response(200, [{ res_id: 'old-1', res_status: 'done' }, { res_id: 'old-2', res_status: 'skipped', res_reason: 'Administrateur principal' }]);
    throw new Error(`appel inattendu ${u}`);
  };
  const res = makeRes();
  await handlePurgeTrash({ method: 'GET', headers: { authorization: 'Bearer cron-secret-123456' } }, res, { env, fetch });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { purged: 1, skipped: 1, failed: 0 });
  assert.ok(calls.some((c) => c.url.includes('/storage/v1/object/list/')));
  assert.equal(JSON.stringify(res.body).includes('service-key'), false);
});

test('les écrans proposent la mise à la corbeille groupée et la corbeille elle-même', async () => {
  const travelers = await read('src/pages/admin/Travelers.tsx');
  const members = await read('src/pages/admin/Members.tsx');
  const app = await read('src/App.tsx');
  assert.match(travelers, /trashAccounts/);
  assert.match(members, /trashAccounts/);
  assert.match(app, /\/equipe\/corbeille/);
  const trash = await read('src/pages/admin/Trash.tsx');
  assert.match(trash, /restoreAccounts/);
  assert.match(trash, /purgeAccounts/);
});
