import { supabase } from './supabase';
import { PROVIDERS, type Provider } from '../data';

/** Ligne telle que renvoyée par la table Supabase `providers` (snake_case). */
interface ProviderRow {
  id: string;
  name: string;
  cn: string;
  cat: Provider['cat'];
  city: Provider['city'];
  district: string;
  lat: number;
  lng: number;
  featured: boolean | null;
  rating_avg: number | null;
  rating_count: number | null;
  verified: string | null;
  description: string | null;
  addr_cn: string | null;
  addr_fr: string | null;
  entree: string | null;
  reperes: string | null;
  metro: string | null;
  tel: string | null;
  wechat: string | null;
  products: string[] | null;
  product_tags: string[] | null;
  moq: string | null;
  services: string[] | null;
  cuisine: string | null;
  hours: string | null;
  halal: string | null;
  freight: Provider['freight'] | null;
  goods: string | null;
  senegal: string | null;
  photo_paths: string[] | null;
  deletion_requested_at: string | null;
  deletion_requested_by: string | null;
  deletion_reason: string | null;
}

const undef = <T,>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** Convertit une ligne Supabase vers le type `Provider` utilisé par l'app. */
function rowToProvider(r: ProviderRow): Provider {
  return {
    id: r.id,
    name: r.name,
    cn: r.cn,
    cat: r.cat,
    city: r.city,
    district: r.district,
    lat: r.lat,
    lng: r.lng,
    featured: r.featured ?? undefined,
    ratingAvg: r.rating_avg ?? undefined,
    ratingCount: r.rating_count ?? undefined,
    verified: r.verified ?? '',
    desc: r.description ?? '',
    addrCn: r.addr_cn ?? '',
    addrFr: r.addr_fr ?? '',
    entree: undef(r.entree),
    reperes: undef(r.reperes),
    metro: undef(r.metro),
    tel: undef(r.tel),
    wechat: undef(r.wechat),
    products: undef(r.products),
    productTags: r.product_tags ?? [],
    moq: undef(r.moq),
    services: undef(r.services),
    cuisine: undef(r.cuisine),
    hours: undef(r.hours),
    halal: undef(r.halal),
    freight: undef(r.freight),
    goods: undef(r.goods),
    senegal: undef(r.senegal),
    photoPaths: r.photo_paths ?? [],
    deletionRequestedAt: undef(r.deletion_requested_at),
    deletionRequestedBy: undef(r.deletion_requested_by),
    deletionReason: undef(r.deletion_reason),
  };
}

/**
 * Charge les adresses depuis Supabase. En cas d'absence de configuration
 * ou d'erreur réseau, retombe silencieusement sur les données statiques
 * (`PROVIDERS`) pour que l'app reste utilisable hors-ligne / non configurée.
 */
export async function fetchProviders(): Promise<Provider[]> {
  if (!supabase) return PROVIDERS;
  try {
    const { data, error } = await supabase
      .from('providers')
      .select('*')
      .order('featured', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw error;
    if (!data || data.length === 0) return PROVIDERS;
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[Diaba Guide] ${data.length} adresses chargées depuis Supabase.`);
    }
    return (data as ProviderRow[]).map(rowToProvider);
  } catch (e) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Diaba Guide] Échec du chargement des adresses depuis Supabase, repli sur les données statiques.', e);
    }
    return PROVIDERS;
  }
}

/* ------------------------------------------------------------------ */
/* Écritures (équipe) : ajout, modification, demande de suppression    */
/* ------------------------------------------------------------------ */
const nul = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
const arr = (v: string[] | undefined) => (v && v.length ? v : null);

function providerToRow(p: Provider) {
  return {
    id: p.id, name: p.name.trim(), cn: p.cn.trim(), cat: p.cat, city: p.city, district: p.district.trim(),
    lat: p.lat, lng: p.lng, featured: p.featured ?? false, verified: nul(p.verified), description: nul(p.desc),
    addr_cn: nul(p.addrCn), addr_fr: nul(p.addrFr), entree: nul(p.entree), reperes: nul(p.reperes), metro: nul(p.metro),
    tel: nul(p.tel), wechat: nul(p.wechat), products: arr(p.products), product_tags: p.productTags ?? [], moq: nul(p.moq),
    services: arr(p.services), cuisine: nul(p.cuisine), hours: nul(p.hours), halal: nul(p.halal),
    freight: arr(p.freight), goods: nul(p.goods), senegal: nul(p.senegal),
    photo_paths: p.photoPaths ?? [],
  };
}

/** Identifiant lisible et unique pour une nouvelle fiche. */
export function newProviderId(name: string): string {
  const slug = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
  return `${slug || 'fiche'}-${Math.random().toString(36).slice(2, 7)}`;
}

export function validateProvider(p: Provider): string | null {
  if (!p.name.trim()) return 'Saisissez le nom de la fiche.';
  if (!p.cn.trim()) return 'Saisissez le nom en chinois.';
  if (!p.district.trim()) return 'Indiquez le quartier ou le district.';
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return 'Latitude et longitude doivent être des nombres.';
  if (p.name.length > 100 || p.cn.length > 100) return 'Les noms ne doivent pas dépasser 100 caractères.';
  return null;
}

/** Crée ou met à jour une fiche (équipe). */
export async function saveProvider(p: Provider): Promise<{ error?: string }> {
  const vErr = validateProvider(p);
  if (vErr) return { error: vErr };
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { error } = await supabase.from('providers').upsert(providerToRow(p));
  return error ? { error: error.message } : {};
}

/** L'équipe demande la suppression : la fiche est masquée aux voyageurs en attendant l'administrateur. */
export async function requestProviderDeletion(id: string, reason: string, by: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { error } = await supabase.from('providers')
    .update({ deletion_requested_at: new Date().toISOString(), deletion_requested_by: by, deletion_reason: reason || null })
    .eq('id', id);
  return error ? { error: error.message } : {};
}

/** Administrateur : refuse la suppression, la fiche redevient visible. */
export async function cancelProviderDeletion(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { error } = await supabase.from('providers')
    .update({ deletion_requested_at: null, deletion_requested_by: null, deletion_reason: null }).eq('id', id);
  return error ? { error: error.message } : {};
}

/** Administrateur : suppression définitive. */
export async function deleteProvider(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { error, count } = await supabase.from('providers').delete({ count: 'exact' }).eq('id', id);
  if (error) return { error: error.message };
  if (!count) return { error: 'Suppression refusée : réservée à l\'administrateur.' };
  return {};
}
