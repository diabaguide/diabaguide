import {
  buildShipsGoRegistration,
  matchExistingShipsGoShipment,
  prepareShipsGoEvents,
} from './shipsgo-core.js';

const SHIPSGO_BASE = 'https://api.shipsgo.com/v2';

function runtimeOf(runtime) {
  return { env: runtime?.env ?? process.env, fetch: runtime?.fetch ?? globalThis.fetch };
}

function reply(res, status, body) {
  return res.status(status).json(body);
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string') return {};
  try { return JSON.parse(req.body || '{}'); } catch { throw Object.assign(new Error('Corps JSON invalide.'), { status: 400 }); }
}

function bearerFrom(req) {
  const value = req.headers?.authorization ?? req.headers?.Authorization ?? '';
  return typeof value === 'string' && /^Bearer\s+\S+$/i.test(value) ? value.replace(/^Bearer\s+/i, '') : '';
}

async function jsonFrom(response) {
  if (typeof response.text === 'function') {
    const text = await response.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }
  try { return await response.json(); } catch { return null; }
}

async function authenticateFret(req, env, fetchImpl) {
  const token = bearerFrom(req);
  if (!token) return { error: { status: 401, message: 'Connectez-vous pour utiliser ShipsGo.' } };
  const url = env.VITE_SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return { error: { status: 503, message: 'Le service de suivi est temporairement indisponible.' } };

  const headers = { apikey: anon, authorization: `Bearer ${token}` };
  const userResponse = await fetchImpl(`${url}/auth/v1/user`, { headers });
  if (!userResponse.ok) return { error: { status: 401, message: 'Session expirée. Reconnectez-vous.' } };
  const user = await jsonFrom(userResponse);
  if (!user?.id) return { error: { status: 401, message: 'Session invalide.' } };

  const roleResponse = await fetchImpl(`${url}/rest/v1/rpc/is_team`, {
    method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{}',
  });
  if (!roleResponse.ok || (await jsonFrom(roleResponse)) !== true) {
    return { error: { status: 403, message: 'Action réservée à l’équipe.' } };
  }
  return { user };
}

function serviceHeaders(env) {
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) throw Object.assign(new Error('Configuration serveur incomplète.'), { status: 503 });
  return {
    apikey: service,
    authorization: `Bearer ${service}`,
    'content-type': 'application/json',
  };
}

async function findExistingShipsGoShipment(env, fetchImpl, type, code, identifier) {
  const identifierField = type === 'ocean' ? 'container_number' : 'awb_number';
  const query = new URLSearchParams({
    'filters[reference]': `eq:${code}`,
    [`filters[${identifierField}]`]: `eq:${identifier}`,
    take: '100',
  });
  const data = await shipsgoRequest(env, fetchImpl, type, `/shipments?${query.toString()}`);
  return matchExistingShipsGoShipment(type, code, identifier, data?.shipments);
}

async function supabaseRequest(env, fetchImpl, path, init = {}) {
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...serviceHeaders(env), ...init.headers },
  });
  const data = await jsonFrom(response);
  if (!response.ok) throw Object.assign(new Error('Échec de mise à jour du suivi.'), { status: 502 });
  return data;
}

async function supabaseRpc(env, fetchImpl, name, args) {
  return supabaseRequest(env, fetchImpl, `rpc/${name}`, { method: 'POST', body: JSON.stringify(args) });
}

async function expeditionByCode(env, fetchImpl, code) {
  const query = new URLSearchParams({
    code: `eq.${code}`,
    select: 'code,mode,container_no,bl_no,awb_no,shipsgo_id,shipsgo_type,shipsgo_status,shipsgo_tracking_state,shipsgo_synced_at',
    limit: '1',
  });
  const rows = await supabaseRequest(env, fetchImpl, `expeditions?${query}`);
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

function codeFrom(body) {
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9][A-Z0-9-]{3,63}$/.test(code)) {
    throw Object.assign(new Error('Code d’expédition invalide.'), { status: 400 });
  }
  return code;
}

function shipgoMessage(status) {
  if (status === 401 || status === 403) return 'ShipsGo a refusé la clé API ou l’accès à cette fonction.';
  if (status === 402) return 'Le compte ShipsGo ne dispose pas du quota nécessaire.';
  if (status === 409) return 'ShipsGo signale un suivi déjà existant ou une référence ambiguë.';
  if (status === 422) return 'ShipsGo a refusé les références de transport du lot.';
  if (status === 429) return 'La limite de requêtes ShipsGo est atteinte. Réessayez plus tard.';
  return 'La communication avec ShipsGo a échoué. Réessayez plus tard.';
}

async function shipsgoRequest(env, fetchImpl, type, path, init = {}) {
  const token = env.SHIPSGO_API_TOKEN;
  if (!token) throw Object.assign(new Error('Clé API ShipsGo non configurée côté serveur.'), { status: 503 });
  const { allowConflict = false, ...requestInit } = init;
  const response = await fetchImpl(`${SHIPSGO_BASE}/${type}${path}`, {
    ...requestInit,
    headers: {
      'X-Shipsgo-User-Token': token,
      ...(requestInit.body ? { 'content-type': 'application/json' } : {}),
      ...requestInit.headers,
    },
  });
  const data = await jsonFrom(response);
  if (!response.ok) {
    if (allowConflict && response.status === 409 && data?.message === 'ALREADY_EXISTS' && data?.shipment) {
      return { ...data, __alreadyExists: true };
    }
    throw Object.assign(new Error(shipgoMessage(response.status)), { status: response.status });
  }
  return data;
}

export async function handleShipsGoTrack(req, res, runtime) {
  const { env, fetch: fetchImpl } = runtimeOf(runtime);
  if (req.method !== 'POST') return reply(res, 405, { error: 'Méthode non autorisée.' });

  let code;
  try { code = codeFrom(bodyOf(req)); }
  catch (error) { return reply(res, error.status ?? 400, { error: error.message }); }

  try {
    const auth = await authenticateFret(req, env, fetchImpl);
    if (auth.error) return reply(res, auth.error.status, { error: auth.error.message });
    if (!env.SUPABASE_SERVICE_ROLE_KEY) return reply(res, 503, { error: 'Le service de suivi est temporairement indisponible.' });

    const expedition = await expeditionByCode(env, fetchImpl, code);
    if (!expedition) return reply(res, 404, { error: 'Expédition introuvable.' });
    if (expedition.shipsgo_id) {
      return reply(res, 200, { ok: true, type: expedition.shipsgo_type, id: expedition.shipsgo_id, reused: true });
    }

    let registration;
    try { registration = buildShipsGoRegistration(expedition); }
    catch (error) { return reply(res, 422, { error: error.message }); }

    const claimed = await supabaseRpc(env, fetchImpl, 'shipsgo_claim_tracking', { p_code: code });
    if (claimed !== true) {
      const current = await expeditionByCode(env, fetchImpl, code);
      if (current?.shipsgo_id) return reply(res, 200, { ok: true, type: current.shipsgo_type, id: current.shipsgo_id, reused: true });
      return reply(res, 409, { error: 'L’activation du suivi est déjà en cours. Réessayez dans quelques instants.' });
    }

    try {
      const identifier = registration.type === 'ocean'
        ? registration.body.container_number
        : registration.body.awb_number;
      const existing = await findExistingShipsGoShipment(env, fetchImpl, registration.type, code, identifier);
      const created = existing ? null : await shipsgoRequest(env, fetchImpl, registration.type, '/shipments', {
        method: 'POST', body: JSON.stringify(registration.body), allowConflict: true,
      });
      const matched = existing ?? matchExistingShipsGoShipment(registration.type, code, identifier, [created?.shipment]);
      if (!matched) throw Object.assign(new Error('Réponse ShipsGo inattendue.'), { status: 409 });

      await supabaseRpc(env, fetchImpl, 'shipsgo_finish_tracking', {
        p_code: code, p_type: registration.type, p_id: matched.id,
        p_status: typeof matched.status === 'string' ? matched.status : null,
      });
      return reply(res, 200, { ok: true, type: registration.type, id: matched.id, reused: Boolean(existing || created?.__alreadyExists) });
    } catch (error) {
      await supabaseRpc(env, fetchImpl, 'shipsgo_fail_tracking', { p_code: code }).catch(() => null);
      if (error.message?.startsWith('Plusieurs suivis')) return reply(res, 409, { error: error.message });
      const status = error.status === 503 ? 503 : error.status === 409 ? 409 : 502;
      return reply(res, status, { error: status === 503 ? error.message : shipgoMessage(error.status) });
    }
  } catch {
    return reply(res, 502, { error: 'Le service de suivi est temporairement indisponible.' });
  }
}

export async function handleShipsGoSync(req, res, runtime) {
  const { env, fetch: fetchImpl } = runtimeOf(runtime);
  if (req.method !== 'POST') return reply(res, 405, { error: 'Méthode non autorisée.' });
  let code;
  try { code = codeFrom(bodyOf(req)); }
  catch (error) { return reply(res, error.status ?? 400, { error: error.message }); }

  try {
    const auth = await authenticateFret(req, env, fetchImpl);
    if (auth.error) return reply(res, auth.error.status, { error: auth.error.message });
    if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.SHIPSGO_API_TOKEN) {
      return reply(res, 503, { error: 'Le service de suivi est temporairement indisponible.' });
    }

    const expedition = await expeditionByCode(env, fetchImpl, code);
    if (!expedition) return reply(res, 404, { error: 'Expédition introuvable.' });
    if (!Number.isSafeInteger(expedition.shipsgo_id) || !['ocean', 'air'].includes(expedition.shipsgo_type)) {
      return reply(res, 409, { error: 'Le suivi ShipsGo n’est pas activé pour ce lot.' });
    }

    const result = await shipsgoRequest(env, fetchImpl, expedition.shipsgo_type, `/shipments/${expedition.shipsgo_id}`);
    const shipment = result?.shipment;
    if (!shipment || shipment.id !== expedition.shipsgo_id || shipment.reference !== code) {
      return reply(res, 409, { error: 'Le suivi ShipsGo ne correspond plus à ce lot. Vérifiez la console fret.' });
    }
    const events = prepareShipsGoEvents(expedition.shipsgo_type, expedition.shipsgo_id, shipment);
    const inserted = await supabaseRpc(env, fetchImpl, 'shipsgo_apply_sync', {
      p_code: code,
      p_type: expedition.shipsgo_type,
      p_id: expedition.shipsgo_id,
      p_status: typeof shipment.status === 'string' ? shipment.status : null,
      p_events: events,
    });
    return reply(res, 200, {
      ok: true,
      status: typeof shipment.status === 'string' ? shipment.status : null,
      eventsAdded: Number(inserted ?? 0),
    });
  } catch (error) {
    if (error.status === 503) return reply(res, 503, { error: error.message });
    return reply(res, 502, { error: shipgoMessage(error.status) });
  }
}
