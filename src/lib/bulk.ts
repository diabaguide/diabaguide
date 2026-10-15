/* Actions groupées de l'administration : sélection et exécution élément par élément. */

/** Plafond par opération, appliqué aussi côté serveur. */
export const BULK_MAX = 100;

export type BulkStatus = 'done' | 'skipped' | 'failed';
export interface BulkResult { id: string; status: BulkStatus; reason?: string }

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** « Tout sélectionner » ne porte que sur les lignes visibles ; si tout l'est déjà, on vide ces lignes. */
export function toggleAll(selected: ReadonlySet<string>, visibleIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  const all = visibleIds.length > 0 && visibleIds.every((id) => next.has(id));
  for (const id of visibleIds) { if (all) next.delete(id); else next.add(id); }
  return next;
}

/**
 * Exécute `action` sur chaque identifiant, séquentiellement. Un échec (ou une
 * exception) n'interrompt pas les autres. `skip` renvoie le motif d'exclusion
 * (soi-même, administrateur principal…) : l'élément n'est alors jamais traité.
 */
export async function runBulk(
  ids: readonly string[],
  action: (id: string) => Promise<{ error?: string }>,
  opts: { skip?: (id: string) => string | null } = {},
): Promise<BulkResult[]> {
  const unique = [...new Set(ids)].slice(0, BULK_MAX);
  const report: BulkResult[] = [];
  for (const id of unique) {
    const motif = opts.skip?.(id) ?? null;
    if (motif) { report.push({ id, status: 'skipped', reason: motif }); continue; }
    try {
      const res = await action(id);
      report.push(res.error ? { id, status: 'failed', reason: res.error } : { id, status: 'done' });
    } catch (error) {
      report.push({ id, status: 'failed', reason: (error as Error).message || 'Erreur inattendue.' });
    }
  }
  return report;
}

export function summarizeBulk(report: readonly BulkResult[]): string {
  const count = (s: BulkStatus) => report.filter((r) => r.status === s).length;
  const done = count('done'), skipped = count('skipped'), failed = count('failed');
  const parts = [
    done ? `${done} effectué${done > 1 ? 's' : ''}` : '',
    skipped ? `${skipped} ignoré${skipped > 1 ? 's' : ''}` : '',
    failed ? `${failed} en échec` : '',
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : 'Aucun élément traité.';
}
