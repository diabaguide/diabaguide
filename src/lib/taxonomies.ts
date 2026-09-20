import { supabase } from './supabase';
import {
  STATIC_CATEGORIES, STATIC_CITIES, STATIC_DISTRICTS,
  type Category, type CityRef, type District, type FieldBlock, type ProductTag,
} from '../data';
import type { IconName } from '../icons';

export interface Taxonomies { categories: Category[]; cities: CityRef[]; districts: District[]; tags: ProductTag[] }

/** Repli utilisé si Supabase n'est pas configuré ou injoignable. */
export const STATIC_TAXONOMIES: Taxonomies = {
  categories: STATIC_CATEGORIES, cities: STATIC_CITIES, districts: STATIC_DISTRICTS, tags: [],
};

/* ---------------- Lecture ---------------- */

export async function fetchTaxonomies(): Promise<Taxonomies> {
  if (!supabase) return STATIC_TAXONOMIES;
  try {
    const [c, ci, d, t] = await Promise.all([
      supabase.from('categories').select('*').order('sort'),
      supabase.from('cities').select('*').order('sort'),
      supabase.from('districts').select('*').order('sort'),
      supabase.from('product_tags').select('*').order('sort'),
    ]);
    if (c.error || ci.error || d.error || t.error) throw c.error ?? ci.error ?? d.error ?? t.error;
    if (!c.data?.length || !ci.data?.length) return STATIC_TAXONOMIES;
    return {
      categories: (c.data as CategoryRow[]).map(rowToCategory),
      cities: (ci.data as CityRow[]).map(rowToCity),
      districts: (d.data as DistrictRow[]).map(rowToDistrict),
      tags: (t.data as TagRow[]).map(rowToTag),
    };
  } catch (e) {
    warn('chargement des taxonomies', e);
    return STATIC_TAXONOMIES;
  }
}

/* ---------------- Mapping ---------------- */

interface CategoryRow { id: string; label: string; label_cn: string | null; icon: string; cta_label: string | null; tags_label: string; fields: FieldBlock[] | null; is_freight: boolean; active: boolean; sort: number }
interface CityRow { id: string; name: string; name_cn: string | null; lat: number | null; lng: number | null; active: boolean; sort: number }
interface DistrictRow { id: string; city_id: string; name: string; lat: number; lng: number; active: boolean; sort: number }
interface TagRow { id: string; category_id: string; label: string; label_cn: string | null; active: boolean; sort: number }

const rowToCategory = (r: CategoryRow): Category => ({
  id: r.id, label: r.label, labelCn: r.label_cn ?? undefined, icon: r.icon as IconName,
  ctaLabel: r.cta_label ?? undefined, tagsLabel: r.tags_label,
  fields: Array.isArray(r.fields) ? r.fields : [], isFreight: r.is_freight, active: r.active, sort: r.sort,
});
const rowToCity = (r: CityRow): CityRef => ({
  id: r.id, name: r.name, nameCn: r.name_cn ?? undefined,
  lat: r.lat ?? undefined, lng: r.lng ?? undefined, active: r.active, sort: r.sort,
});
const rowToDistrict = (r: DistrictRow): District => ({
  id: r.id, cityId: r.city_id, name: r.name, lat: r.lat, lng: r.lng, active: r.active, sort: r.sort,
});
const rowToTag = (r: TagRow): ProductTag => ({
  id: r.id, categoryId: r.category_id, label: r.label, labelCn: r.label_cn ?? undefined, active: r.active, sort: r.sort,
});

/* ---------------- Écriture (administrateurs) ---------------- */

/** Identifiant stable dérivé d'un libellé : « Tissus wax » -> « tissus-wax ». */
export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function saveCity(c: CityRef, isNew: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const row = { id: c.id, name: c.name, name_cn: c.nameCn || null, lat: c.lat ?? null, lng: c.lng ?? null, active: c.active, sort: c.sort };
  const { error } = isNew
    ? await supabase.from('cities').insert(row)
    : await supabase.from('cities').update(row).eq('id', c.id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function saveDistrict(d: District, isNew: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const row = { city_id: d.cityId, name: d.name, lat: d.lat, lng: d.lng, active: d.active, sort: d.sort };
  const { error } = isNew
    ? await supabase.from('districts').insert(row)
    : await supabase.from('districts').update(row).eq('id', d.id!);
  return { error: error ? humanize(error.message) : undefined };
}

export async function deleteDistrict(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('districts').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function saveCategory(c: Category, isNew: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const row = {
    id: c.id, label: c.label, label_cn: c.labelCn || null, icon: c.icon, cta_label: c.ctaLabel || null,
    tags_label: c.tagsLabel, fields: c.fields, is_freight: c.isFreight, active: c.active, sort: c.sort,
  };
  const { error } = isNew
    ? await supabase.from('categories').insert(row)
    : await supabase.from('categories').update(row).eq('id', c.id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function saveTag(t: ProductTag, isNew: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const row = { id: t.id, category_id: t.categoryId, label: t.label, label_cn: t.labelCn || null, active: t.active, sort: t.sort };
  const { error } = isNew
    ? await supabase.from('product_tags').insert(row)
    : await supabase.from('product_tags').update(row).eq('id', t.id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function deleteTag(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('product_tags').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

/** Nombre de fiches et de propositions utilisant une ville ou une catégorie. */
export async function usageCount(column: 'city' | 'cat', value: string): Promise<number> {
  if (!supabase) return 0;
  const [p, q] = await Promise.all([
    supabase.from('providers').select('id', { count: 'exact', head: true }).eq(column, value),
    supabase.from('proposals').select('id', { count: 'exact', head: true }).eq(column, value),
  ]);
  return (p.count ?? 0) + (q.count ?? 0);
}

function humanize(msg: string): string {
  if (/duplicate key|already exists/i.test(msg)) return 'Cet identifiant existe déjà.';
  if (/foreign key|violates/i.test(msg)) return 'Élément encore utilisé par des fiches : désactivez-le plutôt que de le supprimer.';
  if (/row-level security|permission denied/i.test(msg)) return "Action réservée aux administrateurs.";
  return msg;
}

function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}
