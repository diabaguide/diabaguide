/* Complétude d'une fiche, statuts de relecture et fraîcheur. Sert l'outil de saisie de l'équipe. */
import { coordsFiables } from './contact.ts';
import { sansAccent } from './texte.ts';

export type Statut = 'draft' | 'review' | 'published';
export const STATUTS: { id: Statut; label: string }[] = [
  { id: 'draft', label: 'Brouillon' }, { id: 'review', label: 'À vérifier' }, { id: 'published', label: 'Publié' },
];
/** Sans colonne (migration 630 absente) ou publié : visible des voyageurs. */
export const statutVisible = (s: string | undefined | null) => !s || s === 'published';

export interface Evaluable {
  name?: string; cn?: string; cat?: string; addrCn?: string; photoPaths?: string[];
  lat: number; lng: number; coordsVerified?: boolean;
  tel?: string; wechat?: string; hours?: string;
  productTags?: string[]; products?: string[];
  priceLevel?: number; priceNight?: number; cuisine?: string; cuisineType?: string; halal?: string; halalStatus?: string;
}
const plein = (v?: string | null) => !!v && v.trim().length > 0;

/** Champs exigés avant « À vérifier » ou « Publié » : communs, puis propres à la catégorie. */
export function completude(p: Evaluable): { ok: number; total: number; manquants: string[] } {
  const regles: [string, boolean][] = [
    ['Photo de façade', (p.photoPaths?.length ?? 0) > 0],
    ['Adresse en chinois', plein(p.addrCn)],
    ['Position vérifiée', coordsFiables(p)],
    ['Un contact (téléphone ou WeChat)', plein(p.tel) || plein(p.wechat)],
  ];
  if (p.cat === 'gros') regles.push(['Horaires', plein(p.hours)], ['Produits', (p.productTags?.length ?? 0) > 0 || (p.products?.length ?? 0) > 0]);
  if (p.cat === 'hotel') regles.push(['Prix', !!p.priceLevel || !!p.priceNight]);
  if (p.cat === 'resto') regles.push(['Horaires', plein(p.hours)], ['Cuisine', plein(p.cuisineType) || plein(p.cuisine)], ['Statut halal', plein(p.halalStatus) || plein(p.halal)]);
  const manquants = regles.filter(([, ok]) => !ok).map(([l]) => l);
  return { ok: regles.length - manquants.length, total: regles.length, manquants };
}

/** Ce qui empêche de passer la fiche à ce statut. Le brouillon est toujours permis. */
export function manquantsPourStatut(p: Evaluable, statut: Statut): string[] {
  return statut === 'draft' ? [] : completude(p).manquants;
}

const MOIS: Record<string, number> = { janv: 0, fevr: 1, mars: 2, avr: 3, mai: 4, juin: 5, juil: 6, aout: 7, sept: 8, oct: 9, nov: 10, dec: 11 };
/** Fiche à revérifier : dernière vérification il y a plus de 6 mois, ou date absente / illisible. */
export function aRever(verified: string | undefined | null, now = new Date(), mois = 6): boolean {
  const m = sansAccent(verified ?? '').match(/(\d{1,2})\s+([a-z]+)\.?\s+(\d{4})/);
  const mm = m ? MOIS[m[2].slice(0, 4)] ?? MOIS[m[2].slice(0, 3)] : undefined;
  if (!m || mm === undefined) return true;
  const limite = new Date(now.getFullYear(), now.getMonth() - mois, now.getDate());
  return new Date(Number(m[3]), mm, Number(m[1])) <= limite;
}
