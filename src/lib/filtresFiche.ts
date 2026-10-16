/* Prix, halal, cuisine et horaires d'une fiche, et filtres contextuels par catégorie.
   Rien n'est inventé : sans donnée, la fonction renvoie « rien » et l'écran masque la ligne. */

export interface FicheInfos {
  id?: string; cat?: string; metro?: string; productTags?: string[];
  priceLevel?: number; priceNight?: number;
  halalStatus?: string; halal?: string;
  cuisineType?: string; cuisine?: string;
}

export type Niveau = 1 | 2 | 3;
/** Gamme : niveau saisi, sinon déduit du prix par nuit (< 200 ¥, 200–400 ¥, > 400 ¥). */
export function niveauPrix(p: Pick<FicheInfos, 'priceLevel' | 'priceNight'>): Niveau | null {
  if (p.priceLevel === 1 || p.priceLevel === 2 || p.priceLevel === 3) return p.priceLevel;
  const n = p.priceNight;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  return n < 200 ? 1 : n <= 400 ? 2 : 3;
}
export const symbolesPrix = (n: Niveau | null): string => (n ? '¥'.repeat(n) : '');

export type Halal = 'confirmed' | 'unverified' | 'no';
/** Statut halal : colonne dédiée, sinon lecture prudente du texte historique (« Oui », « Non confirmé… », « Non »). */
export function statutHalal(p: Pick<FicheInfos, 'halalStatus' | 'halal'>): Halal | null {
  if (p.halalStatus === 'confirmed' || p.halalStatus === 'unverified' || p.halalStatus === 'no') return p.halalStatus;
  const t = (p.halal ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/^non\s+confirm/.test(t) || /non\s+v[ée]rifi/.test(t)) return 'unverified';
  if (/^oui\b|^confirm|^halal\b/.test(t)) return 'confirmed';
  if (/^non\b/.test(t)) return 'no';
  return null;
}
export function libelleHalal(s: Halal | null): string {
  return s === 'confirmed' ? 'Halal confirmé par Diaba' : s === 'unverified' ? 'Halal : non vérifié par Diaba' : s === 'no' ? 'Non halal' : '';
}

export const TYPES_CUISINE = ['africaine', 'chinoise', 'arabe', 'autre'] as const;
/** Type de cuisine : colonne dédiée, sinon mots-clés évidents du texte historique ; inconnu → rien. */
export function typeCuisine(p: Pick<FicheInfos, 'cuisineType' | 'cuisine'>): string | null {
  if (p.cuisineType && (TYPES_CUISINE as readonly string[]).includes(p.cuisineType)) return p.cuisineType;
  const t = (p.cuisine ?? '').toLowerCase();
  if (!t) return null;
  if (/arabe|yéménit|yemenit|libanais|moyen-orient/.test(t)) return 'arabe';
  if (/chinois|sichuan|cantonais|川菜|粤菜/.test(t)) return 'chinoise';
  if (/africain|sénégal|senegal|ivoirien|camerounais/.test(t)) return 'africaine';
  return null;
}

const hm = (h: number, m: number) => (m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`);
/** « 11h00 – 22h00 » → Ouvert · ferme à 22h. Un format illisible (« sauf le lundi ») ne produit rien. */
export function statutOuverture(horaires: string | undefined | null, maintenant = new Date()): { ouvert: boolean; texte: string } | null {
  const m = (horaires ?? '').match(/^\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*[–—-]\s*(\d{1,2})\s*[h:]\s*(\d{2})?\s*\.?\s*$/i);
  if (!m) return null;
  const [h1, m1, h2, m2] = [Number(m[1]), Number(m[2] ?? 0), Number(m[3]), Number(m[4] ?? 0)];
  if (h1 > 24 || h2 > 24 || m1 > 59 || m2 > 59) return null;
  const debut = h1 * 60 + m1, fin = h2 * 60 + m2, now = maintenant.getHours() * 60 + maintenant.getMinutes();
  if (debut === fin) return null;
  const ouvert = debut < fin ? now >= debut && now < fin : now >= debut || now < fin;
  return ouvert ? { ouvert, texte: `Ouvert · ferme à ${hm(h2 % 24, m2)}` } : { ouvert, texte: `Fermé · ouvre à ${hm(h1 % 24, m1)}` };
}

export interface FiltresCtx { prix?: string | null; metro?: boolean; halal?: boolean; cuisine?: string | null; prod?: string | null; cat?: string | null }

export function appliquerFiltres<T extends FicheInfos>(list: T[], f: FiltresCtx): T[] {
  return list.filter((p) => {
    if (f.cat && p.cat !== f.cat) return false;
    if (f.prix && String(niveauPrix(p)) !== f.prix) return false;
    if (f.metro && !(p.metro ?? '').trim()) return false;
    if (f.halal && statutHalal(p) !== 'confirmed') return false;
    if (f.cuisine && typeCuisine(p) !== f.cuisine) return false;
    if (f.prod && !(p.productTags ?? []).includes(f.prod)) return false;
    return true;
  });
}

export interface OptionsFiltres {
  prix: Record<number, number>; metro: number; halal: number;
  cuisines: Record<string, number>; produits: Record<string, number>;
}
/** Valeurs réellement présentes (avec effectifs) : un filtre sans fiche correspondante n'est jamais proposé. */
export function optionsFiltres(list: FicheInfos[]): OptionsFiltres {
  const o: OptionsFiltres = { prix: {}, metro: 0, halal: 0, cuisines: {}, produits: {} };
  for (const p of list) {
    const n = niveauPrix(p); if (n) o.prix[n] = (o.prix[n] ?? 0) + 1;
    if ((p.metro ?? '').trim()) o.metro++;
    if (statutHalal(p) === 'confirmed') o.halal++;
    const c = typeCuisine(p); if (c) o.cuisines[c] = (o.cuisines[c] ?? 0) + 1;
    for (const t of new Set(p.productTags ?? [])) o.produits[t] = (o.produits[t] ?? 0) + 1;
  }
  return o;
}
