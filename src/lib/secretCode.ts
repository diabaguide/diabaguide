/**
 * Code secret voyageur : l’interface n’accepte que 3 à 6 chiffres.
 * La frontière serveur répète impérativement ces validations avant tout accès
 * à Supabase Auth ; ce module ne fabrique aucun mot de passe technique.
 */
export function normalizeSecretCode(raw: string): string {
  return (raw || '').replace(/\D/g, '').slice(0, 6);
}

export function isWeakSecretCode(raw: string): boolean {
  const digits = normalizeSecretCode(raw);
  if (digits.length < 3) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  return '0123456789'.includes(digits) || '9876543210'.includes(digits);
}

export function isValidSecretCode(raw: string): boolean {
  return /^\d{3,6}$/.test(raw || '') && !isWeakSecretCode(raw);
}

