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
