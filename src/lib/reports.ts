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
  if (payload.providerName.length > 100) return { error: "Le nom du prestataire ne doit pas dépasser 100 caractères." };
  if (payload.about.length > 100) return { error: "Le motif ne doit pas dépasser 100 caractères." };
  if (payload.type.length > 50) return { error: "Le type ne doit pas dépasser 50 caractères." };
  const text = payload.text.trim();
  if (text.length === 0) return { error: "Le texte du signalement ne peut pas être vide." };
  if (text.length > 1000) return { error: "Le texte du signalement ne doit pas dépasser 1000 caractères." };

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
