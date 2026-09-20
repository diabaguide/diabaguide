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
