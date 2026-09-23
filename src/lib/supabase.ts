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
  //
  // Connexions persistantes : une fois connecté, le voyageur le reste — c'est
  // le comportement attendu, comme WhatsApp. Les trois réglages ci-dessous le
  // garantissent explicitement, plutôt que de compter sur les valeurs par
  // défaut de la bibliothèque, qu'une mise à jour pourrait changer :
  //   • persistSession      → la session est écrite dans le stockage du
  //                            navigateur (localStorage, clé `sb-<projet>-auth-token`)
  //                            et non en mémoire : elle survit à la fermeture ;
  //   • autoRefreshToken    → le jeton d'accès (1 h) est renouvelé tout seul
  //                            grâce au jeton de rafraîchissement, y compris à
  //                            la réouverture de l'application ;
  //   • detectSessionInUrl  → la session est récupérée au retour d'une
  //                            connexion externe (Google, lien reçu par e-mail).
  //
  // Ne jamais passer à `sessionStorage` ni désactiver `persistSession` : cela
  // forcerait chaque visiteur à se reconnecter. Et ne pas changer `storageKey`
  // sans migration : les sessions déjà enregistrées ne seraient plus trouvées.
  ? createClient(url!, anonKey!, {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
  : null;

if (!isSupabaseConfigured && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Diaba Guide] Supabase non configuré (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants) — ' +
      'utilisation des données statiques de démonstration.',
  );
}
