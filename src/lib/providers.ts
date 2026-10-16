import { supabase } from './supabase';
import { PROVIDERS, type Cat, type City, type Provider } from '../data';

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
  deleted_at?: string | null;
  unpublished_at?: string | null;
  price_level?: number | null;
  price_night?: number | null;
  halal_status?: Provider['halalStatus'] | null;
  cuisine_type?: Provider['cuisineType'] | null;
  review_status?: Provider['reviewStatus'] | null;
  coords_verified?: boolean | null;
  partner_label?: Provider['partnerLabel'] | null;
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
    deletedAt: undef(r.deleted_at),
    unpublishedAt: undef(r.unpublished_at),
    priceLevel: undef(r.price_level),
    priceNight: undef(r.price_night),
    halalStatus: undef(r.halal_status),
    cuisineType: undef(r.cuisine_type),
    reviewStatus: undef(r.review_status),
    coordsVerified: undef(r.coords_verified),
    partnerLabel: undef(r.partner_label),
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
      console.warn('[Diaba Guide] Échec du chargement des adresses : conservation des fiches mémorisées.', e);
    }
    throw e;
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
    // Colonnes ajoutées par supabase/620_fiche_filters.sql : envoyées seulement si renseignées,
    // pour que l'enregistrement d'une fiche reste possible tant que la migration n'est pas exécutée.
    ...(p.priceLevel ? { price_level: p.priceLevel } : {}),
    ...(p.priceNight ? { price_night: p.priceNight } : {}),
    ...(p.halalStatus ? { halal_status: p.halalStatus } : {}),
    ...(p.cuisineType ? { cuisine_type: p.cuisineType } : {}),
    // supabase/630 : idem, seulement si la colonne existe (valeur connue).
    ...(p.reviewStatus ? { review_status: p.reviewStatus } : {}),
    ...(p.coordsVerified !== undefined ? { coords_verified: p.coordsVerified } : {}),
    ...(p.partnerLabel ? { partner_label: p.partnerLabel } : {}),
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

/**
 * Crée une fiche de transitaire en trois champs (nom, ville, téléphone),
 * depuis la console de fret — sans passer par le formulaire complet.
 *
 * `cn` (nom chinois) et `district` sont obligatoires en base : ils sont
 * laissés VIDES plutôt qu'inventés — c'est la règle du projet pour les noms
 * chinois non confirmés (voir supabase/donnees/insert_gz_sz_providers.sql). Les
 * coordonnées sont celles de la ville choisie : la fiche n'apparaît donc pas
 * sur une carte au large du golfe de Guinée. La RLS `providers_insert_team`
 * autorise l'équipe à écrire.
 */
export async function creerTransitaire(f: {
  nom: string; city: City; lat: number; lng: number; tel?: string;
}): Promise<{ id?: string; error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const nom = f.nom.trim();
  if (!nom) return { error: 'Saisissez le nom du transitaire.' };
  const id = newProviderId(nom);
  const { error } = await supabase.from('providers').insert({
    id, name: nom, cn: '', cat: 'transitaire', city: f.city, district: '',
    lat: f.lat, lng: f.lng, tel: nul(f.tel),
  });
  return error ? { error: error.message } : { id };
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

/* Corbeille des fiches (supabase/600_fiche_trash.sql) : 30 jours avant suppression définitive. */
type FicheTrashRow = { res_id: string; res_status: 'done' | 'skipped'; res_reason: string | null };
async function ficheRpc(fn: 'admin_trash_fiches' | 'admin_restore_fiches' | 'admin_purge_fiches', id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc(fn, { p_ids: [id] });
  if (error) return { error: error.message };
  const row = (data as FicheTrashRow[] | null)?.[0];
  return row?.res_status === 'skipped' ? { error: row.res_reason ?? 'Refusé.' } : {};
}
export const trashProviders = (id: string) => ficheRpc('admin_trash_fiches', id);
export const restoreProviders = (id: string) => ficheRpc('admin_restore_fiches', id);
/** Suppression définitive immédiate d'une fiche déjà à la corbeille, photos comprises. */
export async function purgeProviders(id: string, photoPaths: string[] = []): Promise<{ error?: string }> {
  if (!supabase) return {};
  const res = await ficheRpc('admin_purge_fiches', id);
  if (res.error) return res;
  if (photoPaths.length) await supabase.storage.from('fiche-photos').remove(photoPaths);
  return {};
}

/** Action groupée : changer de catégorie. */
export async function setProviderCategory(id: string, cat: Cat): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('providers').update({ cat }).eq('id', id);
  return error ? { error: error.message } : {};
}

/** Publier / dépublier (supabase/610_fiche_publish.sql) : une fiche dépubliée est masquée aux voyageurs. */
async function publishRpc(id: string, published: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc('admin_set_fiches_published', { p_ids: [id], p_published: published });
  if (error) return { error: error.message };
  const row = (data as FicheTrashRow[] | null)?.[0];
  return row?.res_status === 'skipped' ? { error: row.res_reason ?? 'Refusé.' } : {};
}
export const publishProviders = (id: string) => publishRpc(id, true);
export const unpublishProviders = (id: string) => publishRpc(id, false);

/* Note interne de l'équipe (supabase/630_fiche_workflow.sql) : jamais visible des voyageurs. Tolérant si la table n'existe pas encore. */
export async function fetchProviderNote(id: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('provider_notes').select('note').eq('provider_id', id).maybeSingle();
  if (error) return null;
  return (data as { note: string } | null)?.note ?? '';
}
export async function saveProviderNote(id: string, note: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from('provider_notes').upsert({ provider_id: id, note, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() });
  return error ? { error: error.message } : {};
}
