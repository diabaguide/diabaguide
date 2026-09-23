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
