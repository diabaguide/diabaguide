import { supabase } from './supabase';
import { creerLimiteur, decrireErreur, doitSignaler } from './erreursFiltre';

/* Journal des erreurs de l'application (supabase/550_journal_erreurs.sql).

   L'application note ses erreurs inattendues pour que l'équipe l'apprenne sans attendre un message.
   Jamais de mot de passe, de jeton ni de saisie du voyageur : le message technique, la page et le
   navigateur seulement. Le journal ne doit jamais gêner : tout échec est ignoré en silence. */

const autorise = creerLimiteur(5);

/** Signale une erreur (si elle en vaut la peine, et au plus quelques fois par visite). */
export function signalerErreur(valeur: unknown, contexte = ''): void {
  if (!supabase) return;
  try {
    const { message, detail } = decrireErreur(valeur);
    if (!doitSignaler(message) || !autorise(message)) return;
    const page = typeof location === 'undefined' ? '' : location.pathname.replace(/\/[0-9a-f-]{20,}(?=\/|$)/gi, '/:id');
    const appareil = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
    void supabase
      .rpc('log_error_event', { p_message: message, p_detail: [contexte, detail].filter(Boolean).join('\n'), p_page: page, p_appareil: appareil })
      .then(() => undefined, () => undefined);
  } catch {
    /* le journal ne doit jamais gêner l'application */
  }
}

/** Écoute les erreurs non rattrapées de la page. À appeler une fois au démarrage. */
export function surveillerErreurs(): void {
  window.addEventListener('error', (e) => { signalerErreur(e.error ?? e.message, 'window.onerror'); });
  window.addEventListener('unhandledrejection', (e) => { signalerErreur(e.reason, 'promesse rejetée'); });
}

export interface ErreurJournal {
  id: number;
  message: string;
  detail: string;
  page: string;
  appareil: string;
  occurrences: number;
  premiereFois: string;
  derniereFois: string;
  resolue: boolean;
}

type Ligne = {
  id: number; message: string; detail: string | null; page: string | null; appareil: string | null;
  occurrences: number; premiere_fois: string; derniere_fois: string; resolue: boolean;
};

/** Les erreurs du journal, les plus récentes d'abord (administration). */
export async function fetchErreurs(): Promise<ErreurJournal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('error_events')
    .select('id, message, detail, page, appareil, occurrences, premiere_fois, derniere_fois, resolue')
    .order('derniere_fois', { ascending: false }).limit(200);
  if (error) return [];
  return (data as Ligne[]).map((r) => ({
    id: r.id, message: r.message, detail: r.detail ?? '', page: r.page ?? '', appareil: r.appareil ?? '',
    occurrences: r.occurrences, premiereFois: r.premiere_fois, derniereFois: r.derniere_fois, resolue: r.resolue,
  }));
}

/** Vrai si le journal est installé (le script SQL a été lancé). */
export async function journalInstalle(): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('error_events').select('id').limit(1);
  return !error || !(error.code === '42P01' || error.code === 'PGRST205' || /does not exist|could not find the table/i.test(error.message));
}

export async function marquerErreur(id: number, resolue: boolean): Promise<string | null> {
  if (!supabase) return 'Supabase non configuré.';
  const { error } = await supabase.rpc('admin_maj_erreur', { p_id: id, p_resolue: resolue });
  return error ? error.message : null;
}

/** Supprime les erreurs résolues depuis plus de `jours` jours. */
export async function purgerErreurs(jours = 30): Promise<{ supprimees?: number; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('admin_purger_erreurs', { p_jours: jours });
  return error ? { error: error.message } : { supprimees: Number(data ?? 0) };
}
