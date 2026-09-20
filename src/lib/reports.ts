import { supabase } from './supabase';

export interface ReportPayload {
  providerId: string;
  providerName: string;
  type: 'correction' | 'signalement';
  about: string;
  text: string;
}

/**
 * Enregistre un signalement dans la table Supabase `reports`.
 * En mode démo (Supabase non configuré), log uniquement en dev et retourne sans erreur.
 */
export async function saveReport(payload: ReportPayload): Promise<{ error?: string }> {
  if (!supabase) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[Diaba Guide] Signalement (mode démo, non persisté) :', payload);
    }
    return {};
  }

  const { error } = await supabase.from('reports').insert({
    provider_id: payload.providerId,
    provider_name: payload.providerName,
    type: payload.type,
    about: payload.about,
    text: payload.text.trim(),
  });

  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Diaba Guide] Échec : enregistrement du signalement.', error);
    }
    return { error: 'Impossible d\'envoyer le signalement. Réessayez dans quelques instants.' };
  }

  return {};
}
