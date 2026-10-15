import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveTechnicalPassword, handleAuthPin, validatePin } from '../api/auth-pin-core.js';

const response = (status, data) => ({
  ok: status >= 200 && status < 300,
  status,
  async text() { return data == null ? '' : JSON.stringify(data); },
});

const makeRes = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(value) { this.body = value; return this; },
});

const env = {
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  AUTH_PIN_PEPPER: 'pepper-kept-on-the-server',
};

const request = (body, headers = {}) => ({
  method: 'POST', body,
  headers: { 'x-forwarded-for': '203.0.113.8', 'user-agent': 'test-agent', ...headers },
});

test('le serveur valide strictement le code secret et dérive un mot de passe non réversible', () => {
  assert.equal(validatePin('274'), true);
  assert.equal(validatePin('2 7 4'), false);
  assert.equal(validatePin('abc274'), false);
  assert.equal(validatePin('123'), false);
  assert.equal(validatePin('1111'), false);
  const password = deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER);
  assert.match(password, /^DgPin_[a-f0-9]{64}$/);
  assert.equal(password.includes('274'), false);
  assert.equal(password, deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER));
  assert.notEqual(
    deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER, 'a@example.com'),
    deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER, 'b@example.com'),
  );
});

test('la connexion PIN est limitée côté serveur puis ouvre une session sans exposer le secret', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/rest/v1/search_logs?') && init.method !== 'DELETE') return response(200, []);
    if (String(url).endsWith('/rest/v1/search_logs') && init.method === 'POST') return response(201, null);
    if (String(url).includes('/rest/v1/profiles?')) return response(200, [{ email: 'p771234567@diabaguide.local' }]);
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      const body = JSON.parse(init.body);
      assert.equal(body.password.includes('274'), false);
      return response(200, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
    }
    if (String(url).includes('/rest/v1/search_logs?') && init.method === 'DELETE') return response(204, null);
    throw new Error(`appel inattendu: ${url}`);
  };
  const res = makeRes();
  await handleAuthPin(request({ action: 'login', phone: '+221771234567', pin: '274' }), res, { env, fetch });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
  assert.equal(JSON.stringify(res.body).includes('274'), false);
  assert.ok(calls.some((call) => call.url.includes('/rest/v1/search_logs')));
  assert.ok(calls.some((call) => call.url.includes('/auth/v1/token')));
});

test('le stockage de limitation est obligatoire et bloque avant Supabase Auth', async () => {
  let authCalled = false;
  const fetch = async (url, init = {}) => {
    if (String(url).includes('/rest/v1/search_logs?')) return response(503, { error: 'down' });
    if (String(url).includes('/auth/v1/')) authCalled = true;
    return response(500, {});
  };
  const res = makeRes();
  await handleAuthPin(request({ action: 'login', phone: '+221771234567', pin: '274' }), res, { env, fetch });
  assert.equal(res.statusCode, 503);
  assert.equal(authCalled, false);
});

test('cinq essais du même réseau sont bloqués sans verrouiller globalement le numéro', async () => {
  let authCalled = false;
  const fetch = async (url) => {
    if (String(url).includes('city=eq.')) return response(200, Array.from({ length: 5 }, (_, id) => ({ id })));
    if (String(url).includes('/auth/v1/')) authCalled = true;
    return response(200, []);
  };
  const res = makeRes();
  await handleAuthPin(request({ action: 'login', phone: '+221771234567', pin: '274' }), res, { env, fetch });
  assert.equal(res.statusCode, 429);
  assert.equal(authCalled, false);
});

test('la connexion historique exige explicitement l’e-mail et l’ancien mot de passe', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/rest/v1/search_logs?') && init.method !== 'DELETE') return response(200, []);
    if (String(url).endsWith('/rest/v1/search_logs') && init.method === 'POST') return response(201, null);
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      assert.deepEqual(JSON.parse(init.body), { email: 'ancien@example.com', password: 'Ancien-pass-9' });
      return response(200, { access_token: 'legacy-access', refresh_token: 'legacy-refresh', expires_in: 3600 });
    }
    if (String(url).includes('/rest/v1/search_logs?') && init.method === 'DELETE') return response(204, null);
    throw new Error(`appel inattendu: ${url}`);
  };
  const res = makeRes();
  await handleAuthPin(request({ action: 'login', legacyEmail: 'ancien@example.com', legacyPassword: 'Ancien-pass-9' }), res, { env, fetch });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.access_token, 'legacy-access');
  assert.equal(calls.some((call) => call.url.includes('/profiles?')), false);
});

const adminFetch = (role, store = {}) => async (url, init = {}) => {
  const u = String(url);
  if (u.endsWith('/auth/v1/user')) return response(200, { id: 'admin-1', email: 'admin@example.com' });
  if (u.includes('/rest/v1/profiles?select=role')) return response(200, [{ role }]);
  if (u.includes('select=is_primary_admin')) return response(200, [{ is_primary_admin: store.primary === true }]);
  if (u.includes('/rest/v1/profiles?select=id')) return response(200, store.existing ?? []);
  if (u.endsWith('/auth/v1/admin/users') && init.method === 'POST') { store.created = JSON.parse(init.body); return response(200, { id: 'new-1' }); }
  if (u.endsWith('/auth/v1/admin/users/user-9') && !init.method) return response(200, { id: 'user-9', email: 'membre@example.com' });
  if (u.endsWith('/auth/v1/admin/users/user-9') && init.method === 'PUT') { store.updated = JSON.parse(init.body); return response(200, {}); }
  if (u.includes('/rest/v1/profiles?on_conflict=id')) { store.profile = JSON.parse(init.body); return response(201, null); }
  throw new Error(`appel inattendu: ${u}`);
};
const asAdmin = (body) => request(body, { authorization: 'Bearer admin-token' });

test('un administrateur crée un compte membre avec son code secret, sans jamais le renvoyer', async () => {
  const store = {};
  const res = makeRes();
  await handleAuthPin(asAdmin({ action: 'admin-create', name: 'Awa Diop', email: 'Awa@Example.com', phone: '+221771234567', pin: '274' }), res, { env, fetch: adminFetch('admin', store) });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { id: 'new-1', email: 'awa@example.com' });
  assert.equal(store.created.email, 'awa@example.com');
  assert.equal(store.created.password, deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER, 'awa@example.com'));
  assert.equal(JSON.stringify(store.created).includes('"274"'), false);
  assert.equal(store.profile.role, 'traveler');
});

test('seul un administrateur peut créer un compte avec un code secret ou en changer', async () => {
  for (const body of [
    { action: 'admin-create', name: 'Awa', email: 'a@example.com', phone: '+221771234567', pin: '274' },
    { action: 'admin-set-pin', id: 'user-9', pin: '274' },
  ]) {
    const res = makeRes();
    await handleAuthPin(asAdmin(body), res, { env, fetch: adminFetch('team') });
    assert.equal(res.statusCode, 403);
  }
  const anonymous = makeRes();
  await handleAuthPin(request({ action: 'admin-set-pin', id: 'user-9', pin: '274' }), anonymous, { env, fetch: adminFetch('admin') });
  assert.equal(anonymous.statusCode, 401);
});

test('le code secret imposé par un administrateur respecte la règle 3 à 6 chiffres', async () => {
  const res = makeRes();
  await handleAuthPin(asAdmin({ action: 'admin-create', name: 'Awa', email: 'a@example.com', phone: '+221771234567', pin: '12' }), res, { env, fetch: adminFetch('admin') });
  assert.equal(res.statusCode, 400);
});

test('un administrateur définit le code d’un autre compte, mais pas celui de l’administrateur principal', async () => {
  const store = {};
  const ok = makeRes();
  await handleAuthPin(asAdmin({ action: 'admin-set-pin', id: 'user-9', pin: '274' }), ok, { env, fetch: adminFetch('admin', store) });
  assert.equal(ok.statusCode, 200);
  assert.equal(store.updated.password, deriveTechnicalPassword('274', env.AUTH_PIN_PEPPER, 'membre@example.com'));
  const protectedRes = makeRes();
  await handleAuthPin(asAdmin({ action: 'admin-set-pin', id: 'user-9', pin: '274' }), protectedRes, { env, fetch: adminFetch('admin', { primary: true }) });
  assert.equal(protectedRes.statusCode, 403);
});

test('un numéro déjà utilisé est refusé avant toute création', async () => {
  const store = { existing: [{ id: 'x' }] };
  const res = makeRes();
  await handleAuthPin(asAdmin({ action: 'admin-create', name: 'Awa', email: 'a@example.com', phone: '+221771234567', pin: '274' }), res, { env, fetch: adminFetch('admin', store) });
  assert.equal(res.statusCode, 409);
  assert.equal(store.created, undefined);
});
