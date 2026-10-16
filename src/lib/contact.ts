/* Règles d'affichage des contacts, des coordonnées et des mentions de fiche.
   Aucune donnée n'est inventée : ce qui manque ou paraît faux est masqué. */

const vide = (v?: string | null) => !v || !v.trim();

/** Téléphone chinois au format international (+86 20 8305 4520). Un numéro non reconnu est rendu tel quel. */
export function formatTelChine(brut?: string | null): string {
  if (vide(brut)) return '';
  const original = brut!.trim();
  let n = original.replace(/[\s().-]/g, '');
  if (n.startsWith('+') && !n.startsWith('+86')) return original;
  if (n.startsWith('0086')) n = n.slice(4);
  else if (n.startsWith('+86')) n = n.slice(3);
  else if (n.startsWith('86') && n.length >= 12) n = n.slice(2);
  if (/^1[3-9]\d{9}$/.test(n)) return `+86 ${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}`;
  const fixe = n.match(/^0?(10|2\d)(\d{8})$/);
  if (fixe) return `+86 ${fixe[1]} ${fixe[2].slice(0, 4)} ${fixe[2].slice(4)}`;
  const fixe3 = n.match(/^0?([3-9]\d{2})(\d{7,8})$/);
  if (fixe3 && n.startsWith('0')) return `+86 ${fixe3[1]} ${fixe3[2].slice(0, 4)} ${fixe3[2].slice(4)}`;
  return original;
}

/** Lien tel: sans espaces, sur le numéro international. Chaîne vide s'il n'y a pas de numéro. */
export function lienTel(brut?: string | null): string {
  const f = formatTelChine(brut);
  return f ? `tel:${f.replace(/\s/g, '')}` : '';
}

/** Un voyageur peut-il joindre le lieu ? Téléphone ou WeChat renseigné. */
export const aUnContact = (p: { tel?: string | null; wechat?: string | null }) => !vide(p.tel) || !vide(p.wechat);

const decimales = (n: number) => (String(n).split('.')[1] ?? '').length;
/** Coordonnées par défaut utilisées avant la saisie réelle : jamais une vraie position. */
const COORDS_PAR_DEFAUT: [number, number][] = [[23.13, 113.27]];

/** Coordonnées utilisables : présentes, assez précises (4 décimales) et différentes des valeurs par défaut. */
export function coordsFiables(p: { lat: number; lng: number }): boolean {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
  if (p.lat === 0 && p.lng === 0) return false;
  if (COORDS_PAR_DEFAUT.some(([a, b]) => p.lat === a && p.lng === b)) return false;
  return decimales(p.lat) >= 4 && decimales(p.lng) >= 4;
}

/** Mention de transparence : fiche liée à Diaba, ou mise en avant par l'équipe. */
export function etiquetteFiche(p: { name: string; featured?: boolean }): 'Service Diaba' | 'Partenaire' | null {
  if (/\bdiaba\b/i.test(p.name)) return 'Service Diaba';
  return p.featured ? 'Partenaire' : null;
}

/** Le tri « Mieux notées » n'a de sens que si au moins 3 fiches ont des avis. */
export const afficherTriNotes = (list: { ratingCount?: number }[]) => list.filter((x) => (x.ratingCount ?? 0) > 0).length >= 3;
