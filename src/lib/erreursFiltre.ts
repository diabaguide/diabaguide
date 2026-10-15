/* Quelles erreurs méritent d'être signalées à l'équipe ? (fonctions pures, testées)

   On ne signale que les plantages de l'application. Les coupures de réseau, les extensions de
   navigateur et les alertes sans importance sont écartées : elles ne sont pas des bugs et
   noieraient les vraies erreurs. */

/** Coupures de réseau (les mêmes que dans erreurs.ts ; ce fichier reste sans dépendance pour être testé seul). */
const RESEAU = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|err_connection|timed? ?out|timeout|econnreset/i;

const BRUIT = [
  /ResizeObserver loop/i,
  /^Script error\.?$/i,
  /(chrome|moz|safari|webkit)-(masked-)?extension:/i,
  /Non-Error promise rejection captured/i,
  /AbortError|The operation was aborted|The user aborted/i,
  /Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i, // rechargement géré ailleurs (vite:preloadError)
  /NotAllowedError|The request is not allowed by the user agent/i,
  /play\(\) request was interrupted/i,
];

export interface ErreurSignalee { message: string; detail: string }

/** Message et détail lisibles d'une valeur quelconque levée par l'application. */
export function decrireErreur(valeur: unknown): ErreurSignalee {
  if (valeur instanceof Error) return { message: `${valeur.name}: ${valeur.message}`.slice(0, 300), detail: (valeur.stack ?? '').split('\n').slice(0, 8).join('\n').slice(0, 1500) };
  if (typeof valeur === 'string') return { message: valeur.slice(0, 300), detail: '' };
  try { return { message: JSON.stringify(valeur).slice(0, 300), detail: '' }; } catch { return { message: String(valeur).slice(0, 300), detail: '' }; }
}

/** Vrai si cette erreur doit être signalée. */
export function doitSignaler(message: string): boolean {
  const m = (message ?? '').trim();
  if (m.length < 3) return false;
  if (RESEAU.test(m)) return false;
  return !BRUIT.some((re) => re.test(m));
}

/** Au plus `max` signalements par visite, une seule fois chacun : une boucle d'erreurs ne doit pas inonder la base. */
export function creerLimiteur(max = 5) {
  const vus = new Set<string>();
  return (message: string): boolean => {
    if (vus.has(message) || vus.size >= max) return false;
    vus.add(message);
    return true;
  };
}
