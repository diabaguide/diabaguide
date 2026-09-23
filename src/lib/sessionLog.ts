import { supabase } from './supabase';

/**
 * Journal de session (supabase/session_events.sql).
 *
 * Pourquoi : quand une connexion n'est pas conservée d'une visite à l'autre,
 * deux causes opposées se ressemblent — le stockage du navigateur a été vidé, ou
 * le renouvellement du jeton a été refusé. Depuis un téléphone, aucune des deux
 * n'est observable de l'extérieur. L'application note donc elle-même ce qu'elle
 * constate à chaque démarrage.
 *
 * Ce journal ne doit jamais gêner : tout échec est ignoré en silence.
 */
export function logSessionEvent(evenement: string, detail = ''): void {
  if (!supabase) return;
  try {
    const appareil = typeof navigator === 'undefined' ? '' : navigator.userAgent || '';
    void supabase
      .rpc('log_session_event', { p_evenement: evenement, p_detail: detail.slice(0, 300), p_appareil: appareil })
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    /* le journal ne doit jamais gêner l'application */
  }
}

/** Clés de session Supabase présentes dans le stockage du navigateur. */
export function clesDeSessionEnMemoire(): string[] {
  try {
    return Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch {
    return ['(stockage illisible)'];
  }
}
