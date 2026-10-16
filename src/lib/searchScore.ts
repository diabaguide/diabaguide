/* Classement des résultats de recherche.

   Règles : tous les mots saisis doivent correspondre ; un mot correspond à un mot entier de la fiche
   (pluriel toléré) ou, à partir de 4 lettres, à un début de mot. « sac » ne trouve donc plus « Sacred »,
   mais « bai » reste trop court pour deviner « Baiyun ». Le poids dépend du champ : catégorie,
   puis produits et spécialités, puis nom, puis description. */
import { sansAccent } from './texte.ts';

export interface ScoreCtx {
  categories: { id: string; label: string; labelCn?: string }[];
  tags: { id: string; label: string; labelCn?: string; categoryId?: string }[];
}
export interface Scorable {
  name: string; cn?: string; cat: string; district?: string; desc?: string;
  products?: string[]; services?: string[]; productTags?: string[]; cuisine?: string; goods?: string;
}

/** Groupes de synonymes (français, anglais, chinois), écrits sans accent. La première forme est la forme canonique. */
const GROUPES: string[][] = [
  ['vetement', 'clothes', 'clothing', 'clothe', 'habit', 'habits', 'tenue', 'tenues', 'garment', 'apparel', '服装', '衣服', '成衣'],
  ['chaussure', 'shoe', 'shoes', 'sneaker', 'sneakers', 'basket', 'baskets', '鞋', '鞋子'],
  ['sac', 'bag', 'bags', 'sacoche', 'maroquinerie', '包', '箱包'],
  ['cuir', 'leather', '皮具', '皮革'],
  ['electronique', 'electronic', 'electronics', 'electro', '电子'],
  ['telephone', 'phone', 'phones', 'mobile', 'portable', '手机'],
  ['tissu', 'tissus', 'fabric', 'fabrics', 'textile', 'wax', '布料', '面料'],
  ['perruque', 'wig', 'wigs', 'cheveux', 'hair', '假发'],
  ['cosmetique', 'cosmetics', 'cosmetic', 'beaute', 'beauty', '化妆品'],
  ['moto', 'motorcycle', 'motorbike', 'scooter', '摩托车'],
  ['hotel', 'hotels', 'hebergement', 'dormir', 'logement', 'chambre', 'lodging', '酒店', '宾馆'],
  ['restaurant', 'restaurants', 'resto', 'manger', 'repas', 'food', 'diner', 'dejeuner', '餐厅', '餐馆'],
  ['marche', 'marches', 'market', 'markets', 'gros', 'grossiste', 'wholesale', 'wholesaler', '批发', '市场'],
  ['halal', '清真'],
  ['africain', 'african', 'afrique', 'africa', '非洲'],
];
const CANON = new Map<string, string[]>();
for (const g of GROUPES) for (const m of g) CANON.set(sansAccent(m), g.map(sansAccent));

/** Variantes d'un mot : lui-même, son singulier/pluriel et ses synonymes. */
export function expandTerms(mot: string): string[] {
  const m = sansAccent(mot.trim());
  if (!m) return [];
  const out = new Set<string>([m]);
  const bases = [m, m.replace(/(s|x)$/, '')];
  for (const b of bases) for (const v of CANON.get(b) ?? []) out.add(v);
  return [...out];
}

const CJK = /[\u3400-\u9fff]/;
const mots = (t: string) => sansAccent(t).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

function motCorrespond(mot: string, variante: string, dernier: boolean): boolean {
  if (CJK.test(variante)) return mot.includes(variante);
  if (mot === variante || mot === variante + 's' || mot === variante + 'x' || mot + 's' === variante) return true;
  return dernier && variante.length >= 4 && mot.startsWith(variante);
}

const POIDS = { cat: 100, produit: 60, nom: 40, cuisine: 30, services: 30, quartier: 15, desc: 10 } as const;

function champs(p: Scorable, ctx: ScoreCtx): { poids: number; texte: string }[] {
  const cat = ctx.categories.find((c) => c.id === p.cat);
  const tags = (p.productTags ?? []).map((id) => { const x = ctx.tags.find((t) => t.id === id); return `${x?.label ?? ''} ${x?.labelCn ?? ''}`; });
  return [
    { poids: POIDS.cat, texte: `${cat?.label ?? ''} ${cat?.labelCn ?? ''} ${p.cat}` },
    { poids: POIDS.produit, texte: [...tags, ...(p.products ?? [])].join(' ') },
    { poids: POIDS.nom, texte: `${p.name} ${p.cn ?? ''}` },
    { poids: POIDS.cuisine, texte: p.cuisine ?? '' },
    { poids: POIDS.services, texte: [...(p.services ?? []), p.goods ?? ''].join(' ') },
    { poids: POIDS.quartier, texte: p.district ?? '' },
    { poids: POIDS.desc, texte: p.desc ?? '' },
  ];
}

/** Score d'une fiche pour une recherche ; 0 = ne correspond pas. */
export function scoreProvider(p: Scorable, requete: string, ctx: ScoreCtx): number {
  const demandes = sansAccent(requete).split(/\s+/).filter(Boolean);
  if (!demandes.length) return 1;
  const cs = champs(p, ctx).map((c) => ({ poids: c.poids, mots: mots(c.texte) }));
  let total = 0;
  for (let i = 0; i < demandes.length; i++) {
    const dernier = i === demandes.length - 1;
    const variantes = expandTerms(demandes[i]);
    let meilleur = 0;
    for (const c of cs) {
      if (c.poids <= meilleur) continue;
      if (c.mots.some((m) => variantes.some((v) => motCorrespond(m, v, dernier)))) meilleur = c.poids;
    }
    if (!meilleur) return 0;
    total += meilleur;
  }
  return total;
}

/** Fiches correspondantes, les plus pertinentes d'abord (ordre d'origine à égalité). */
export function rankProviders<T extends Scorable>(list: T[], requete: string, ctx: ScoreCtx): T[] {
  const notes = list.map((p, i) => ({ p, i, s: scoreProvider(p, requete, ctx) })).filter((x) => x.s > 0);
  // Quand la requête désigne une catégorie (« restaurant », « hôtel »), seule cette catégorie sort :
  // un hôtel qui propose un restaurant sur place n'est pas un restaurant. Pour un produit (« sac »),
  // les mentions secondaires restent affichées, mais après les spécialistes.
  const meilleur = notes.reduce((m, x) => Math.max(m, x.s), 0);
  const seuil = meilleur >= POIDS.cat ? meilleur * 0.7 : 0;
  return notes
    .filter((x) => x.s >= seuil)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.p);
}

export interface Suggestion { kind: 'tag' | 'cat'; id: string; label: string }

/** Au plus 3 pistes réelles (produits puis catégories existants), les plus proches du terme d'abord. */
export function suggestAlternatives(terme: string, ctx: ScoreCtx): Suggestion[] {
  const t = sansAccent(terme);
  const proche = (label: string) => {
    const l = sansAccent(label); let n = 0;
    while (n < l.length && n < t.length && l[n] === t[n]) n++;
    return n;
  };
  const tags: Suggestion[] = ctx.tags.map((x) => ({ kind: 'tag' as const, id: x.id, label: x.label }));
  const cats: Suggestion[] = ctx.categories.map((x) => ({ kind: 'cat' as const, id: x.id, label: x.label }));
  const tri = (a: Suggestion[]) => a.map((x, i) => ({ x, i, n: proche(x.label) })).sort((u, v) => v.n - u.n || u.i - v.i).map((e) => e.x);
  return [...tri(tags).slice(0, 2), ...tri(cats)].slice(0, 3);
}
