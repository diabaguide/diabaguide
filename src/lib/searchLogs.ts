import { supabase } from './supabase';

/* Journal des recherches (supabase/search_logs.sql).
   Le voyageur écrit ses recherches, l'équipe lit le tout : ce qui ne donne
   aucun résultat indique les fiches qui manquent au guide. */

export interface SearchStats {
  /** Terme normalisé (minuscules, espaces retirés aux extrémités). */
  terme: string;
  ville: string | null;
  /** Nombre de recherches sur ce terme. */
  recherches: number;
  /** Parmi elles, celles restées sans aucune adresse. */
  sansResultat: number;
  /** Voyageurs distincts concernés par une recherche sans résultat. */
  voyageurs: number;
  /** Date de la dernière recherche sans résultat. */
  dernierLe: string | null;
}

type Row = {
  terme: string; ville: string | null; recherches: number;
  sans_resultat: number; voyageurs: number; dernier_le: string | null;
};

/**
 * Enregistre une recherche. Volontairement silencieux : une panne du journal ne
 * doit jamais gêner la recherche du voyageur.
 */
export async function logSearch(term: string, city: string | null, cat: string | null, results: number): Promise<void> {
  if (!supabase) return;
  const propre = term.trim().slice(0, 80);
  if (propre.length < 2) return;
  const { error } = await supabase.from('search_logs')
    .insert({ term: propre, city: city ?? null, cat: cat ?? null, results: Math.max(0, Math.trunc(results)) });
  if (error && import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn('[Diaba Guide] Échec : enregistrement de la recherche.', error);
  }
}

/** Recherches de la période, celles sans résultat en tête (équipe seulement). */
export async function fetchSearchStats(jours = 30): Promise<SearchStats[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('admin_search_stats', { p_jours: jours });
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Diaba Guide] Échec : chargement des recherches.', error);
    }
    return [];
  }
  return ((data as Row[]) ?? []).map((r) => ({
    terme: r.terme,
    ville: r.ville,
    recherches: r.recherches,
    sansResultat: r.sans_resultat,
    voyageurs: r.voyageurs,
    dernierLe: r.dernier_le,
  }));
}

/** Retire les recherches plus vieilles que la durée indiquée (administration). */
export async function pruneSearchLogs(jours = 180): Promise<{ supprimees?: number; error?: string }> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('admin_prune_search_logs', { p_jours: jours });
  if (error) return { error: error.message };
  return { supprimees: (data as number) ?? 0 };
}