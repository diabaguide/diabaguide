/**
 * Données de la carte d'expédition : fonctions pures, sans dépendance, testées
 * seules (scripts/carte-data.test.mjs).
 */

/** Règle du nom court, identique à celle de la base (supabase/500_carte_expedition.sql). */
export const ENTRY_NAME_RE = /^[A-Z0-9]{2,10}$/;

/** Numéro de client sur 4 chiffres, comme « (0022) » sur la carte. */
export const clientNoLabel = (n: number): string => String(Math.max(0, Math.trunc(n))).padStart(4, '0');

/** Met un nom court en forme : majuscules, lettres A–Z et chiffres seulement (accents retirés). */
export const cleanEntryName = (s: string): string => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Nom court tel que le voyageur le saisit : les lettres accentuées sont converties
 * (« Sène » → « SENE ») avant le nettoyage, pour ne pas perdre de lettres. La base
 * applique ensuite sa propre règle stricte sur la valeur déjà nettoyée.
 */
export const entryNameFromInput = (s: string): string =>
  cleanEntryName((s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

/** Le nom court est-il valide (2 à 10 lettres ou chiffres) ? */
export const isValidEntryName = (s: string): boolean => ENTRY_NAME_RE.test(s);

/**
 * Proposition de nom court quand le voyageur n'en a pas choisi : les initiales de
 * son nom (« Aziz Diagne » → « AD »), ou ses trois premières lettres s'il n'a qu'un
 * mot. Renvoie '' si le nom ne contient aucune lettre latine.
 */
export function suggestEntryName(name: string): string {
  const mots = (name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // retire les accents
    .split(/[^A-Za-z]+/).filter(Boolean);
  if (mots.length === 0) return '';
  if (mots.length === 1) return mots[0].slice(0, 3).toUpperCase().padEnd(2, mots[0][0].toUpperCase());
  return mots.slice(0, 4).map((m) => m[0]).join('').toUpperCase();
}

/**
 * Téléphone tel qu'imprimé : les numéros du Sénégal s'impriment sans l'indicatif
 * (« +221 77 411 51 64 » → « 774115164 »), les autres gardent leur « + ».
 */
export function printedPhone(raw: string | null | undefined): string {
  const compact = (raw ?? '').replace(/[\s.\-()]/g, '');
  if (!compact) return '';
  const sn = compact.match(/^(?:\+|00)221(\d{7,10})$/);
  if (sn) return sn[1];
  return compact.replace(/^00/, '+');
}

/** Ligne « téléphone / (numéro client) » de la carte. */
export function phoneLine(phone: string | null | undefined, clientNo: number): string {
  const tel = printedPhone(phone);
  return `${tel ? `${tel} / ` : ''}(${clientNoLabel(clientNo)})`;
}

/** Nom de fichier du PNG : « diaba-cargo-BTC-0022.png ». */
export function cardFileNameFor(entryName: string, clientNo: number): string {
  return `diaba-cargo-${cleanEntryName(entryName) || 'client'}-${clientNoLabel(clientNo)}.png`;
}

/** Nom ou téléphone saisi pour la carte : espaces superflus retirés ; vide = reprendre le profil. */
export const cleanCardText = (raw: string): string => raw.trim().replace(/\s+/g, ' ');
/** Nom de la carte : vide (profil) ou 2 à 40 caractères. */
export const isValidCardName = (raw: string): boolean => { const v = cleanCardText(raw); return v === '' || (v.length >= 2 && v.length <= 40); };
/** Téléphone de la carte : vide (profil) ou 6 à 25 caractères parmi chiffres, espaces et + ( ) . / - */
export const isValidCardPhone = (raw: string): boolean => { const v = cleanCardText(raw); return v === '' || (v.length >= 6 && v.length <= 25 && /^[0-9+()./ -]+$/.test(v)); };
