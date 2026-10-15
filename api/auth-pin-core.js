import { createHmac } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

const RATE_TERM = '__auth_pin__';
const RATE_WINDOW_MS = 15 * 60 * 1000;
const IDENTIFIER_LIMIT = 5;
const NETWORK_LIMIT = 30;
const INTERNAL_DOMAIN = 'diabaguide.local';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reply(res, status, body) {
  return res.status(status).json(body);
}

function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body !== 'string') return {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

async function jsonFrom(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export function validatePin(value) {
  const pin = typeof value === 'string' ? value : '';
  if (!/^\d{3,6}$/.test(pin)) return false;
  if (/^(\d)\1+$/.test(pin)) return false;
  return !'0123456789'.includes(pin) && !'9876543210'.includes(pin);
}

export function deriveTechnicalPassword(pin, pepper, identity = 'global') {
  if (!validatePin(pin) || typeof pepper !== 'string' || pepper.length < 16) throw new Error('Configuration PIN invalide.');
  return `DgPin_${createHmac('sha256', pepper).update(`diabaguide-pin-v1:${String(identity).toLowerCase()}:${pin}`).digest('hex')}`;
}

function hmac(value, pepper) {
  return createHmac('sha256', pepper).update(String(value)).digest('hex');
}

function normalizePhone(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  try {
    const parsed = parsePhoneNumberFromString(raw);
    return parsed?.isValid() && /^\+[1-9]\d{7,14}$/.test(parsed.number) ? parsed.number : '';
  } catch {
    return '';
  }
}

function phoneKey(phone) {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('221') && digits.length === 12 ? digits.slice(3) : digits;
}

function clientNetwork(req) {
  const forwarded = req.headers?.['x-forwarded-for'] ?? req.headers?.['X-Forwarded-For'] ?? '';
  const ip = String(forwarded).split(',')[0].trim() || String(req.headers?.['x-real-ip'] ?? 'unknown');
  const agent = String(req.headers?.['user-agent'] ?? 'unknown').slice(0, 200);
  return `${ip}|${agent}`;
}

function serviceHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

function anonHeaders(env, token) {
  return {
    apikey: env.VITE_SUPABASE_ANON_KEY,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'content-type': 'application/json',
  };
}

async function rateRows(env, fetchImpl, filters, limit) {
  const query = new URLSearchParams({ select: 'id', term: `eq.${RATE_TERM}`, ...filters, limit: String(limit) });
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/search_logs?${query}`, { headers: serviceHeaders(env) });
  if (!response.ok) throw new Error('rate-store');
  const rows = await jsonFrom(response);
  if (!Array.isArray(rows)) throw new Error('rate-store');
  return rows;
}

async function beginRateLimit(req, env, fetchImpl, identifier) {
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const identifierHash = hmac(`identifier:${identifier}`, env.AUTH_PIN_PEPPER);
  const networkHash = hmac(`network:${clientNetwork(req)}`, env.AUTH_PIN_PEPPER);
  const common = { cat: `eq.${networkHash}`, created_at: `gte.${since}` };
  const perIdentifier = await rateRows(env, fetchImpl, { ...common, city: `eq.${identifierHash}` }, IDENTIFIER_LIMIT);
  if (perIdentifier.length >= IDENTIFIER_LIMIT) return { blocked: true };
  const perNetwork = await rateRows(env, fetchImpl, common, NETWORK_LIMIT);
  if (perNetwork.length >= NETWORK_LIMIT) return { blocked: true };
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/search_logs`, {
    method: 'POST', headers: serviceHeaders(env),
    body: JSON.stringify({ term: RATE_TERM, city: identifierHash, cat: networkHash, results: 1 }),
  });
  if (!response.ok) throw new Error('rate-store');
  return { blocked: false, identifierHash, networkHash };
}

async function clearRateLimit(env, fetchImpl, rate) {
  if (!rate?.identifierHash || !rate?.networkHash) return;
  const query = new URLSearchParams({
    term: `eq.${RATE_TERM}`, city: `eq.${rate.identifierHash}`, cat: `eq.${rate.networkHash}`,
  });
  await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/search_logs?${query}`, {
    method: 'DELETE', headers: serviceHeaders(env),
  }).catch(() => null);
}

async function tokenFor(env, fetchImpl, email, password) {
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: anonHeaders(env), body: JSON.stringify({ email, password }),
  });
  const data = await jsonFrom(response);
  if (!response.ok || !data?.access_token || !data?.refresh_token) return null;
  return { access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in ?? 3600 };
}

async function emailsForPhone(env, fetchImpl, phone) {
  const query = new URLSearchParams({
    select: 'email', phone_key: `eq.${phoneKey(phone)}`, order: 'created_at.asc', limit: '5',
  });
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?${query}`, { headers: serviceHeaders(env) });
  if (!response.ok) throw new Error('profiles');
  const rows = await jsonFrom(response);
  const emails = Array.isArray(rows) ? rows.map((row) => row?.email).filter((email) => typeof email === 'string') : [];
  return emails.length ? [...new Set(emails)] : [`p${phoneKey(phone)}@${INTERNAL_DOMAIN}`];
}

async function authenticatedUser(req, env, fetchImpl) {
  const auth = String(req.headers?.authorization ?? req.headers?.Authorization ?? '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/user`, { headers: anonHeaders(env, token) });
  if (!response.ok) return null;
  const user = await jsonFrom(response);
  return user?.id && user?.email ? user : null;
}

async function adminUpdatePassword(env, fetchImpl, userId, password) {
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT', headers: serviceHeaders(env), body: JSON.stringify({ password }),
  });
  return response.ok;
}

/** Appelant administrateur : jeton validé par Supabase, rôle relu en base avec ce même jeton. */
async function adminCaller(req, env, fetchImpl) {
  const user = await authenticatedUser(req, env, fetchImpl);
  if (!user) return { status: 401, error: 'Session expirée. Reconnectez-vous.' };
  const token = String(req.headers?.authorization ?? req.headers?.Authorization ?? '').slice(7);
  const response = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?select=role&id=eq.${encodeURIComponent(user.id)}`, { headers: anonHeaders(env, token) });
  const rows = response.ok ? await jsonFrom(response) : null;
  if (!Array.isArray(rows) || rows[0]?.role !== 'admin') return { status: 403, error: 'Action réservée aux administrateurs.' };
  return { user };
}

function sessionBody(session) {
  return { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in };
}

export async function handleAuthPin(req, res, runtime = {}) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Méthode non autorisée.' });
  const env = runtime.env ?? process.env;
  const fetchImpl = runtime.fetch ?? globalThis.fetch;
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.AUTH_PIN_PEPPER) {
    return reply(res, 503, { error: 'Connexion temporairement indisponible.' });
  }
  const body = bodyOf(req);
  const action = typeof body.action === 'string' ? body.action : '';

  try {
    if (action === 'login') {
      const legacyEmail = typeof body.legacyEmail === 'string' ? body.legacyEmail.trim().toLowerCase() : '';
      const legacyPassword = typeof body.legacyPassword === 'string' ? body.legacyPassword : '';
      const phone = normalizePhone(body.phone);
      const pin = typeof body.pin === 'string' ? body.pin : '';
      const legacy = !!legacyEmail;
      if (legacy ? (!EMAIL.test(legacyEmail) || legacyPassword.length < 6 || legacyPassword.length > 72) : (!phone || !validatePin(pin))) {
        return reply(res, 400, { error: 'Vérifiez les informations saisies.' });
      }
      const identifier = legacy ? `email:${legacyEmail}` : `phone:${phone}`;
      const rate = await beginRateLimit(req, env, fetchImpl, identifier);
      if (rate.blocked) return reply(res, 429, { error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
      const candidates = legacy ? [legacyEmail] : await emailsForPhone(env, fetchImpl, phone);
      let session = null;
      for (const email of candidates) {
        const password = legacy ? legacyPassword : deriveTechnicalPassword(pin, env.AUTH_PIN_PEPPER, email);
        session = await tokenFor(env, fetchImpl, email, password);
        if (session) break;
      }
      if (!session) return reply(res, 401, { error: 'Le numéro ou le code secret n’est pas correct.' });
      await clearRateLimit(env, fetchImpl, rate);
      return reply(res, 200, sessionBody(session));
    }

    if (action === 'signup') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = normalizePhone(body.phone);
      const pin = typeof body.pin === 'string' ? body.pin : '';
      if (!name || !phone || !validatePin(pin)) return reply(res, 400, { error: 'Vérifiez les informations saisies.' });
      const key = phoneKey(phone);
      const query = new URLSearchParams({ select: 'id', phone_key: `eq.${key}`, limit: '1' });
      const existsResponse = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?${query}`, { headers: serviceHeaders(env) });
      if (!existsResponse.ok) return reply(res, 503, { error: 'Création de compte temporairement indisponible.' });
      const existing = await jsonFrom(existsResponse);
      if (Array.isArray(existing) && existing.length) return reply(res, 409, { error: 'Un compte existe déjà pour ce numéro.' });
      const email = `p${key}@${INTERNAL_DOMAIN}`;
      const password = deriveTechnicalPassword(pin, env.AUTH_PIN_PEPPER, email);
      const create = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: serviceHeaders(env),
        body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { name, phone } }),
      });
      if (!create.ok) return reply(res, create.status === 422 ? 409 : 503, { error: create.status === 422 ? 'Un compte existe déjà pour ce numéro.' : 'Création de compte temporairement indisponible.' });
      const session = await tokenFor(env, fetchImpl, email, password);
      if (!session) return reply(res, 503, { error: 'Compte créé. Revenez à la connexion.' });
      return reply(res, 200, sessionBody(session));
    }

    if (action === 'admin-create') {
      const caller = await adminCaller(req, env, fetchImpl);
      if (!caller.user) return reply(res, caller.status, { error: caller.error });
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const phone = normalizePhone(body.phone);
      const pin = typeof body.pin === 'string' ? body.pin : '';
      const emailInput = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (!name || !phone || !validatePin(pin) || (emailInput && !EMAIL.test(emailInput))) {
        return reply(res, 400, { error: 'Vérifiez les informations saisies.' });
      }
      const key = phoneKey(phone);
      const email = emailInput || `p${key}@${INTERNAL_DOMAIN}`;
      const taken = new URLSearchParams({ select: 'id', or: `(phone_key.eq.${key},email.eq.${email})`, limit: '1' });
      const takenResponse = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?${taken}`, { headers: serviceHeaders(env) });
      if (!takenResponse.ok) return reply(res, 503, { error: 'Création de compte temporairement indisponible.' });
      const existing = await jsonFrom(takenResponse);
      if (Array.isArray(existing) && existing.length) return reply(res, 409, { error: 'Ce numéro ou cette adresse est déjà associé à un compte.' });
      const create = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/admin/users`, {
        method: 'POST', headers: serviceHeaders(env),
        body: JSON.stringify({ email, password: deriveTechnicalPassword(pin, env.AUTH_PIN_PEPPER, email), email_confirm: true, user_metadata: { name, phone } }),
      });
      if (!create.ok) return reply(res, create.status === 422 ? 409 : 503, { error: create.status === 422 ? 'Ce numéro ou cette adresse est déjà associé à un compte.' : 'Création de compte temporairement indisponible.' });
      const created = await jsonFrom(create);
      if (!created?.id) return reply(res, 503, { error: 'Création de compte temporairement indisponible.' });
      const profile = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
        method: 'POST', headers: { ...serviceHeaders(env), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ id: created.id, name, phone, phone_key: key, email, role: 'traveler' }),
      });
      if (!profile.ok) return reply(res, 503, { error: 'Le compte est créé mais sa fiche est incomplète. Reprenez-la depuis la liste des membres.' });
      return reply(res, 200, { id: created.id, email });
    }

    if (action === 'admin-set-pin') {
      const caller = await adminCaller(req, env, fetchImpl);
      if (!caller.user) return reply(res, caller.status, { error: caller.error });
      const target = typeof body.id === 'string' ? body.id : '';
      const pin = typeof body.pin === 'string' ? body.pin : '';
      if (!target || !validatePin(pin)) return reply(res, 400, { error: 'Le code secret doit contenir entre 3 et 6 chiffres.' });
      if (target === caller.user.id) return reply(res, 400, { error: 'Pour votre propre compte, utilisez « Changer le code secret » dans votre profil.' });
      const guard = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?select=is_primary_admin&id=eq.${encodeURIComponent(target)}`, { headers: serviceHeaders(env) });
      const guardRows = guard.ok ? await jsonFrom(guard) : null;
      if (!Array.isArray(guardRows)) return reply(res, 503, { error: 'Vérification du compte impossible. Réessayez.' });
      if (guardRows[0]?.is_primary_admin) return reply(res, 403, { error: 'Ce compte est l’administrateur principal : son code ne peut être changé que par lui-même.' });
      const account = await fetchImpl(`${env.VITE_SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(target)}`, { headers: serviceHeaders(env) });
      const accountData = account.ok ? await jsonFrom(account) : null;
      if (!accountData?.email) return reply(res, 404, { error: 'Ce compte est introuvable.' });
      const updated = await adminUpdatePassword(env, fetchImpl, target, deriveTechnicalPassword(pin, env.AUTH_PIN_PEPPER, accountData.email));
      return updated ? reply(res, 200, { ok: true }) : reply(res, 503, { error: 'Le code secret n’a pas pu être modifié.' });
    }

    if (action === 'change' || action === 'update') {
      const user = await authenticatedUser(req, env, fetchImpl);
      if (!user) return reply(res, 401, { error: 'Session expirée. Reconnectez-vous.' });
      const pin = typeof body.pin === 'string' ? body.pin : '';
      if (!validatePin(pin)) return reply(res, 400, { error: 'Le code secret doit contenir entre 3 et 6 chiffres.' });
      if (action === 'change') {
        const current = typeof body.current === 'string' ? body.current : '';
        const currentPassword = validatePin(current) ? deriveTechnicalPassword(current, env.AUTH_PIN_PEPPER, user.email) : current;
        const verified = currentPassword && await tokenFor(env, fetchImpl, user.email, currentPassword);
        if (!verified) return reply(res, 401, { error: 'Le code secret actuel est incorrect.' });
      }
      const updated = await adminUpdatePassword(env, fetchImpl, user.id, deriveTechnicalPassword(pin, env.AUTH_PIN_PEPPER, user.email));
      return updated ? reply(res, 200, { ok: true }) : reply(res, 503, { error: 'Le code secret n’a pas pu être modifié.' });
    }

    return reply(res, 400, { error: 'Action invalide.' });
  } catch (error) {
    if (error?.message === 'rate-store') return reply(res, 503, { error: 'Connexion temporairement indisponible.' });
    return reply(res, 503, { error: 'Service temporairement indisponible.' });
  }
}
