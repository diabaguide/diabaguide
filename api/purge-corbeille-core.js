const BUCKETS = ['proposal-photos', 'review-photos', 'avatars'];

function reply(res, status, body) { return res.status(status).json(body); }

async function jsonFrom(response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/**
 * Purge quotidienne de la corbeille : supprime définitivement les comptes à la
 * corbeille depuis plus de 30 jours, fichiers compris. Appelée par Vercel Cron,
 * qui envoie « Authorization: Bearer <CRON_SECRET> ». Sans ce secret : 401.
 */
export async function handlePurgeTrash(req, res, runtime = {}) {
  const env = runtime.env ?? process.env;
  const fetchImpl = runtime.fetch ?? globalThis.fetch;
  if (!env.CRON_SECRET || !env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return reply(res, 503, { error: 'Purge indisponible : configuration incomplète.' });
  }
  const auth = String(req.headers?.authorization ?? req.headers?.Authorization ?? '');
  if (auth !== `Bearer ${env.CRON_SECRET}`) return reply(res, 401, { error: 'Non autorisé.' });

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const query = new URLSearchParams({ select: 'id', deleted_at: `lt.${cutoff}`, limit: '100' });
    const due = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/profiles?${query}`, { headers });
    const rows = due.ok ? await jsonFrom(due) : null;
    if (!Array.isArray(rows)) return reply(res, 503, { error: 'Lecture de la corbeille impossible.' });
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return reply(res, 200, { purged: 0, skipped: 0, failed: 0 });

    // Fichiers déposés par ces comptes (dossier <id>/), retirés avant la suppression des comptes.
    for (const id of ids) {
      for (const bucket of BUCKETS) {
        const list = await fetchImpl(`${env.VITE_SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
          method: 'POST', headers, body: JSON.stringify({ prefix: `${id}/`, limit: 1000 }),
        });
        const files = list.ok ? await jsonFrom(list) : null;
        const paths = Array.isArray(files) ? files.map((f) => `${id}/${f.name}`) : [];
        if (paths.length) {
          await fetchImpl(`${env.VITE_SUPABASE_URL}/storage/v1/object/${bucket}`, {
            method: 'DELETE', headers, body: JSON.stringify({ prefixes: paths }),
          });
        }
      }
    }

    const purge = await fetchImpl(`${env.VITE_SUPABASE_URL}/rest/v1/rpc/purge_expired_accounts`, {
      method: 'POST', headers, body: JSON.stringify({ p_ids: ids }),
    });
    const results = purge.ok ? await jsonFrom(purge) : null;
    if (!Array.isArray(results)) return reply(res, 503, { error: 'Purge impossible.' });
    const count = (s) => results.filter((r) => r.res_status === s).length;
    return reply(res, 200, { purged: count('done'), skipped: count('skipped'), failed: ids.length - results.length });
  } catch {
    return reply(res, 503, { error: 'Service temporairement indisponible.' });
  }
}
