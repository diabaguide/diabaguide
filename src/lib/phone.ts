/**
 * Numéros de téléphone : règle unique de normalisation.
 *
 * Depuis que l'inscription ne demande plus d'adresse e-mail, le téléphone est
 * l'identifiant du compte. Cette règle est donc aussi appliquée en base par
 * `public.email_for_phone()` (supabase/phone_signup.sql) : les deux doivent
 * rester identiques, sinon une personne s'inscrirait avec « +221 78 225 40 40 »
 * et ne pourrait plus se connecter en tapant « 78 225 40 40 ».
 *
 * Règle, dans l'ordre :
 *   1. ne garder que les chiffres ;
 *   2. retirer l'indicatif du Sénégal (« 00221 » puis « 221 ») ;
 *   3. le numéro local à 9 chiffres obtenu sert d'identifiant.
 * Un numéro étranger conserve son indicatif : deux pays peuvent partager les
 * mêmes derniers chiffres, on ne veut pas les confondre.
 */

/** Impossible de se tromper : la vérification croisée est faite par les tests. */
export const DOMAINE_INTERNE = 'diabaguide.local';

/** Chiffres utiles d'un numéro, sans indicatif sénégalais. */
export function phoneKey(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('00221')) d = d.slice(5);
  if (d.startsWith('221') && d.length > 9) d = d.slice(3);
  return d;
}

/** Adresse interne d'un compte sans e-mail (jamais envoyée, jamais montrée). */
export function phoneLoginId(raw: string): string | null {
  const d = phoneKey(raw);
  return d.length >= 6 ? `p${d}@${DOMAINE_INTERNE}` : null;
}

/** Vrai si l'adresse est celle, interne, d'un compte créé avec un téléphone. */
export function isInternalEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${DOMAINE_INTERNE}`);
}

/** Numéro à afficher : « +221 78 225 40 40 » pour un numéro sénégalais. */
export function formatPhone(raw: string): string {
  const d = phoneKey(raw);
  if (d.length === 9) return `+221 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7, 9)}`;
  if (d.length >= 6) return `+${d}`;
  return (raw || '').trim();
}

/** Numéro d'un compte : celui du profil, à défaut celui déduit de l'identifiant. */
export function phoneOf(phone: string | null | undefined, email: string | null | undefined): string {
  if (phone && phoneKey(phone).length >= 6) return formatPhone(phone);
  if (isInternalEmail(email)) return formatPhone(email!.split('@')[0].replace(/^p/, ''));
  return '';
}

export const PHONE = /^[+]?[\d\s().-]{6,20}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** L'identifiant de connexion saisi est-il un numéro plutôt qu'un e-mail ? */
export function identifiantEstUnNumero(saisie: string): boolean {
  return !saisie.includes('@');
}

/** Indicatifs proposés dans les formulaires (Sénégal par défaut). */
export const DIAL_CODES: { c: string; flag: string; n: string }[] = [
  { c: '+221', flag: '🇸🇳', n: 'Sénégal' }, { c: '+86', flag: '🇨🇳', n: 'Chine' }, { c: '+33', flag: '🇫🇷', n: 'France' },
  { c: '+223', flag: '🇲🇱', n: 'Mali' }, { c: '+224', flag: '🇬🇳', n: 'Guinée' }, { c: '+225', flag: '🇨🇮', n: 'Côte d’Ivoire' },
  { c: '+220', flag: '🇬🇲', n: 'Gambie' }, { c: '+222', flag: '🇲🇷', n: 'Mauritanie' }, { c: '+226', flag: '🇧🇫', n: 'Burkina Faso' },
  { c: '+227', flag: '🇳🇪', n: 'Niger' }, { c: '+228', flag: '🇹🇬', n: 'Togo' }, { c: '+229', flag: '🇧🇯', n: 'Bénin' },
  { c: '+234', flag: '🇳🇬', n: 'Nigeria' }, { c: '+233', flag: '🇬🇭', n: 'Ghana' }, { c: '+237', flag: '🇨🇲', n: 'Cameroun' },
  { c: '+243', flag: '🇨🇩', n: 'RD Congo' }, { c: '+242', flag: '🇨🇬', n: 'Congo' }, { c: '+241', flag: '🇬🇦', n: 'Gabon' },
  { c: '+212', flag: '🇲🇦', n: 'Maroc' }, { c: '+213', flag: '🇩🇿', n: 'Algérie' }, { c: '+216', flag: '🇹🇳', n: 'Tunisie' },
  { c: '+20', flag: '🇪🇬', n: 'Égypte' }, { c: '+27', flag: '🇿🇦', n: 'Afrique du Sud' }, { c: '+32', flag: '🇧🇪', n: 'Belgique' },
  { c: '+41', flag: '🇨🇭', n: 'Suisse' }, { c: '+44', flag: '🇬🇧', n: 'Royaume-Uni' }, { c: '+49', flag: '🇩🇪', n: 'Allemagne' },
  { c: '+34', flag: '🇪🇸', n: 'Espagne' }, { c: '+39', flag: '🇮🇹', n: 'Italie' }, { c: '+1', flag: '🇺🇸', n: 'États-Unis / Canada' },
  { c: '+971', flag: '🇦🇪', n: 'Émirats arabes unis' }, { c: '+90', flag: '🇹🇷', n: 'Turquie' }, { c: '+852', flag: '🇭🇰', n: 'Hong Kong' },
];

/** Numéro complet : l'indicatif est ajouté sauf si la personne a déjà tapé un « + ». */
export const joinPhone = (dial: string, raw: string) => {
  const n = raw.trim();
  if (!n) return '';
  return n.startsWith('+') ? n : `${dial} ${n.replace(/^0+/, '')}`;
};
