import { supabase } from './supabase';

/** Note du voyageur connecté pour une fiche (RLS : ne renvoie que sa propre ligne). */
export async function fetchMyRating(providerId: string): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('ratings').select('stars').eq('provider_id', providerId).maybeSingle();
  if (error || !data) return null;
  return (data as { stars: number }).stars;
}

/** Note (ou met à jour la note) du voyageur connecté pour une fiche.
 *  `user_id` est omis : la valeur par défaut (auth.uid()) le renseigne. */
export async function rateProvider(providerId: string, stars: number): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { error } = await supabase.from('ratings')
    .upsert({ provider_id: providerId, stars }, { onConflict: 'provider_id,user_id' });
  return { error: error ? humanize(error.message) : undefined };
}

function humanize(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return 'Connectez-vous pour noter ce lieu.';
  return msg;
}
