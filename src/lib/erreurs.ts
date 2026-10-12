/* Messages d'erreur lisibles pour le voyageur.

   Quand le réseau coupe, le navigateur et Supabase répondent « Failed to fetch », « Load failed »,
   « NetworkError… » : des messages techniques en anglais qui n'aident personne. Ce module les remplace
   par une phrase claire qui dit quoi faire. Les autres messages passent inchangés. */

const RESEAU = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|err_connection|timed? ?out|timeout|econnreset|aborterror|the user aborted/i;
const SESSION = /jwt expired|invalid jwt|jwt is expired|refresh token|session (has )?expired|session not found|not authenticated/i;
const SERVEUR = /bad gateway|service unavailable|gateway time-?out|internal server error|upstream/i;

export const MSG_HORS_LIGNE = 'Vous n’êtes pas connecté à Internet. Vérifiez le Wi-Fi ou vos données mobiles, puis réessayez.';
export const MSG_RESEAU = 'Connexion impossible pour le moment. Vérifiez votre réseau, puis réessayez.';
export const MSG_SESSION = 'Votre session a expiré. Reconnectez-vous, puis réessayez.';
export const MSG_SERVEUR = 'Le service est momentanément indisponible. Réessayez dans quelques instants.';

/** Le message lisible correspondant à une erreur réseau, de session ou de service ; null pour toute autre erreur. */
export function messageReseau(msg: string | null | undefined, horsLigne = typeof navigator !== 'undefined' && navigator.onLine === false): string | null {
  const m = msg ?? '';
  if (RESEAU.test(m)) return horsLigne ? MSG_HORS_LIGNE : MSG_RESEAU;
  if (SESSION.test(m)) return MSG_SESSION;
  if (SERVEUR.test(m)) return MSG_SERVEUR;
  return null;
}

/** Le message lisible s'il existe, sinon le message d'origine. */
export const convivial = (msg: string): string => messageReseau(msg) ?? msg;
