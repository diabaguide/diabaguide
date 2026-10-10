import assert from 'node:assert/strict';
import { test } from 'node:test';

let handlers = {};
try {
  handlers = await import('../api/shipsgo-server.js');
} catch {
  // The missing route implementation is the expected RED state.
}

function mockResponse() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

test('ShipsGo route exports server handlers', () => {
  assert.equal(typeof handlers.handleShipsGoTrack, 'function');
  assert.equal(typeof handlers.handleShipsGoSync, 'function');
});

test('rejects unauthenticated tracking without making any network request', async () => {
  const res = mockResponse();
  let calls = 0;
  await handlers.handleShipsGoTrack({ method: 'POST', headers: {}, body: { code: 'EXP-2026-AB12' } }, res, {
    env: {}, fetch: async () => { calls += 1; throw new Error('must not fetch'); },
  });
  assert.equal(res.code, 401);
  assert.equal(calls, 0);
});

test('rejects a freight-only driver before any ShipsGo provider call', async () => {
  const res = mockResponse();
  const calls = [];
  const env = { VITE_SUPABASE_URL: 'https://db.example.invalid', VITE_SUPABASE_ANON_KEY: 'test-anon' };
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'driver-1' });
    if (String(url).endsWith('/rest/v1/rpc/is_team')) return response(false);
    throw new Error(`Unexpected request: ${url}`);
  };
  await handlers.handleShipsGoTrack({ method: 'POST', headers: { authorization: 'Bearer driver-session' }, body: { code: 'EXP-2026-AB12' } }, res, { env, fetch: fakeFetch });
  assert.equal(res.code, 403);
  assert.ok(calls.every((url) => !url.includes('api.shipsgo.com')));
});

test('registers a shipment through the API only after server-side team authorization', async () => {
  const res = mockResponse();
  const calls = [];
  const env = {
    VITE_SUPABASE_URL: 'https://db.example.invalid',
    VITE_SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    SHIPSGO_API_TOKEN: 'test-shipsgo',
  };
  const expedition = {
    code: 'EXP-2026-AB12', mode: 'maritime_groupage', container_no: 'MSCU1234567',
    awb_no: null, shipsgo_id: null, shipsgo_type: null, shipsgo_tracking_state: 'inactive',
  };
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1' });
    if (String(url).endsWith('/rest/v1/rpc/is_team')) return response(true);
    if (String(url).includes('/rest/v1/expeditions?')) return response([expedition]);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_claim_tracking')) return response(true);
    if (String(url).includes('api.shipsgo.com') && String(url).includes('filters%5Breference%5D')) return response({ shipments: [] });
    if (String(url) === 'https://api.shipsgo.com/v2/ocean/shipments' && init.method === 'POST') {
      return response({ message: 'SUCCESS', shipment: { id: 7654321, reference: expedition.code, container_number: 'MSCU1234567' } });
    }
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_finish_tracking')) return response(null);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_fail_tracking')) return response(null);
    throw new Error(`Unexpected request: ${url}`);
  };

  await handlers.handleShipsGoTrack({
    method: 'POST', headers: { authorization: 'Bearer user-session' }, body: { code: expedition.code },
  }, res, { env, fetch: fakeFetch });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true, type: 'ocean', id: 7654321, reused: false });
  assert.ok(calls.some((call) => call.url === 'https://api.shipsgo.com/v2/ocean/shipments' && call.init.method === 'POST'));
  assert.ok(calls.some((call) => call.url.includes('filters%5Breference%5D=eq%3AEXP-2026-AB12')));
});

test('reuses an exact existing provider match without creating another shipment', async () => {
  const res = mockResponse();
  const calls = [];
  const env = {
    VITE_SUPABASE_URL: 'https://db.example.invalid', VITE_SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', SHIPSGO_API_TOKEN: 'test-shipsgo',
  };
  const expedition = {
    code: 'EXP-2026-AB12', mode: 'maritime_groupage', container_no: 'MSCU1234567',
    awb_no: null, shipsgo_id: null, shipsgo_type: null, shipsgo_tracking_state: 'inactive',
  };
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1' });
    if (String(url).endsWith('/rest/v1/rpc/is_team')) return response(true);
    if (String(url).includes('/rest/v1/expeditions?')) return response([expedition]);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_claim_tracking')) return response(true);
    if (String(url).includes('api.shipsgo.com') && String(url).includes('filters%5Breference%5D')) {
      return response({ shipments: [{ id: 7654321, reference: expedition.code, container_number: expedition.container_no }] });
    }
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_finish_tracking')) return response(null);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_fail_tracking')) return response(null);
    throw new Error(`Unexpected request: ${url}`);
  };

  await handlers.handleShipsGoTrack({
    method: 'POST', headers: { authorization: 'Bearer user-session' }, body: { code: expedition.code },
  }, res, { env, fetch: fakeFetch });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true, type: 'ocean', id: 7654321, reused: true });
  assert.equal(calls.filter((call) => call.url.includes('api.shipsgo.com') && call.init.method === 'POST').length, 0);
});

test('syncs the linked shipment and submits only confirmed movements to the atomic database routine', async () => {
  const res = mockResponse();
  const calls = [];
  const env = {
    VITE_SUPABASE_URL: 'https://db.example.invalid',
    VITE_SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service',
    SHIPSGO_API_TOKEN: 'test-shipsgo',
  };
  const expedition = {
    code: 'EXP-2026-AB12', shipsgo_id: 7654321, shipsgo_type: 'ocean',
  };
  const detail = {
    id: 7654321, reference: expedition.code, status: 'ARRIVED',
    route: { port_of_discharge: { location: { code: 'SNDKR', name: 'Dakar' } } },
    containers: [{ number: 'MSCU1234567', movements: [
      { event: 'DEPA', status: 'ACT', timestamp: '2026-10-10T08:00:00Z', location: { code: 'CNSHA', name: 'Shanghai' } },
      { event: 'ARRV', status: 'ACT', timestamp: '2026-10-20T10:00:00Z', location: { code: 'SNDKR', name: 'Dakar' } },
    ] }],
  };
  let applied;
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1' });
    if (String(url).endsWith('/rest/v1/rpc/is_team')) return response(true);
    if (String(url).includes('/rest/v1/expeditions?')) return response([expedition]);
    if (String(url) === `https://api.shipsgo.com/v2/ocean/shipments/${expedition.shipsgo_id}`) {
      return response({ shipment: detail });
    }
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_apply_sync')) {
      applied = JSON.parse(init.body);
      return response(1);
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  await handlers.handleShipsGoSync({
    method: 'POST', headers: { authorization: 'Bearer user-session' }, body: { code: expedition.code },
  }, res, { env, fetch: fakeFetch });

  assert.equal(res.code, 200);
  assert.equal(applied.p_events.length, 2);
  assert.equal(applied.p_events[0].type, 'en_transit');
  assert.equal(applied.p_events[1].type, 'arrive_dakar');
  assert.equal(applied.p_status, 'ARRIVED');
  assert.ok(calls.every((call) => !String(call.url).includes('X-Shipsgo-User-Token')));
});

test('links an ALREADY_EXISTS response only when reference and transport identifier match', async () => {
  const res = mockResponse();
  const calls = [];
  const env = {
    VITE_SUPABASE_URL: 'https://db.example.invalid', VITE_SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', SHIPSGO_API_TOKEN: 'test-shipsgo',
  };
  const expedition = {
    code: 'EXP-2026-AB12', mode: 'maritime_groupage', container_no: 'MSCU1234567',
    awb_no: null, shipsgo_id: null, shipsgo_type: null, shipsgo_tracking_state: 'inactive',
  };
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/auth/v1/user')) return response({ id: 'user-1' });
    if (String(url).endsWith('/rest/v1/rpc/is_team')) return response(true);
    if (String(url).includes('/rest/v1/expeditions?')) return response([expedition]);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_claim_tracking')) return response(true);
    if (String(url).includes('api.shipsgo.com') && String(url).includes('filters%5Breference%5D')) return response({ shipments: [] });
    if (String(url) === 'https://api.shipsgo.com/v2/ocean/shipments' && init.method === 'POST') {
      return response({ message: 'ALREADY_EXISTS', shipment: {
        id: 8765432, reference: expedition.code, container_number: expedition.container_no,
      } }, 409);
    }
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_finish_tracking')) return response(null);
    if (String(url).endsWith('/rest/v1/rpc/shipsgo_fail_tracking')) return response(null);
    throw new Error(`Unexpected request: ${url}`);
  };

  await handlers.handleShipsGoTrack({
    method: 'POST', headers: { authorization: 'Bearer user-session' }, body: { code: expedition.code },
  }, res, { env, fetch: fakeFetch });

  assert.equal(res.code, 200);
  assert.deepEqual(res.body, { ok: true, type: 'ocean', id: 8765432, reused: true });
  assert.equal(calls.filter((call) => call.url.includes('api.shipsgo.com') && call.init.method === 'POST').length, 1);
});
