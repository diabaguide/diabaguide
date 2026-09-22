import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Client Supabase.
 *
 * Les variables sont injectées à la compilation par Vite (préfixe VITE_).
 * En local : fichier `.env` (voir `.env.example`).
 * En production : Vercel → Settings → Environment Variables.
 *
 * Si les variables sont absentes, `supabase` vaut `null` et l'application
 * retombe sur les données statiques (`src/data.ts`). L'app reste donc
 * fonctionnelle même sans configuration Supabase.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  // flowType 'pkce' (recommandé par Supabase pour les apps navigateur) : la
  // connexion Google renvoie un ?code= échangé côté client, plus fiable que
  // l'ancien flux « implicit » (jeton dans le fragment d'URL), notamment
  // avec les protections anti-traçage (Safari, Brave, Firefox strict) qui
  // provoquaient parfois un échec nécessitant de relancer la connexion.
  ? createClient(url!, anonKey!, { auth: { flowType: 'pkce' } })
  : null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Diaba Guide] Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants) — ' +
      'utilisation des données statiques de démonstration.',
  );
}
