/* Colis : côté équipe (dispatching, clients) et côté voyageur (annonce, suivi). */
import { supabase } from '../supabase';
import { suggestColisCode, type Caracteristique, type Colis, type EtapeType, type FretMode } from './model';
import { humanize, str, toColis, warn, type Row } from './internal';


export async function fetchColis(expeditionCode?: string): Promise<Colis[]> {
  if (!supabase) return [];
  let q = supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, ville_depart, caracteristiques, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at, profile_id')
    .order('created_at', { ascending: false });
  q = expeditionCode ? q.eq('expedition_code', expeditionCode) : q.is('expedition_code', null);
  const { data, error } = await q;
  if (error) { warn('chargement des colis', error); return []; }
  return (data as Row[]).map(toColis);
}

/** Tous les colis (tableau de bord fret), ou ceux d'un voyageur. */
export async function fetchTousColis(profileId?: string): Promise<Colis[]> {
  if (!supabase) return [];
  let q = supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, ville_depart, caracteristiques, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at, profile_id')
    .order('created_at', { ascending: false });
  if (profileId) q = q.eq('profile_id', profileId);
  const { data, error } = await q;
  if (error) { warn('chargement des colis', error); return []; }
  return (data as Row[]).map(toColis);
}

export interface VoyageurFret {
  id: string; name: string | null; phone: string | null;
  nbColis: number; colisEnCours: number; dernierColis: string | null;
}
/** Voyageurs ayant au moins un colis (supabase/310_livreur.sql : fret_voyageurs). */
export async function fetchVoyageursFret(q = ''): Promise<VoyageurFret[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('fret_voyageurs', { p_q: q });
  if (error) { warn('chargement des voyageurs du fret', error); return []; }
  return (data as Row[]).map((r) => ({
    id: String(r.id), name: str(r.name), phone: str(r.phone),
    nbColis: Number(r.nb_colis ?? 0), colisEnCours: Number(r.colis_en_cours ?? 0), dernierColis: str(r.dernier_colis),
  }));
}

/** Un client (voyageur) minimal, pour rattacher un colis à un compte. */
export interface ClientLite { id: string; name: string | null; phone: string | null }
/** Recherche de clients par nom, téléphone ou e-mail (équipe). */
export async function rechercherClients(q: string): Promise<ClientLite[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('rechercher_clients', { p_q: q });
  if (error) { warn('recherche de clients', error); return []; }
  return (data as ClientLite[]) ?? [];
}

/** Crée un compte voyageur par invitation, sans changer la session de l'équipe. */
export async function creerVoyageurFret(input: {
  name: string; email: string; phone: string;
}): Promise<{ traveler?: ClientLite; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.functions.invoke('creer-voyageur-fret', { body: input });
  if (error) {
    const response = 'context' in error ? error.context as Response | undefined : undefined;
    const detail = response ? await response.json().catch(() => null) as { error?: string } | null : null;
    return { error: detail?.error ?? error.message };
  }
  return { traveler: data as ClientLite };
}

/** Enregistre un colis reçu à l'entrepôt (le cœur du dispatching). */
export async function createColis(c: {
  code: string; mode: FretMode; expeditionCode?: string | null; profileId: string;
  clientNom?: string; clientTel?: string; codeClient?: string; marqueColis?: string;
  typeMarchandise?: string; description?: string; poidsKg?: number | null; volumeM3?: number | null;
  recuMaintenant?: boolean;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  if (!c.profileId) return { error: 'Choisissez un compte voyageur pour ce colis.' };
  const recu = c.recuMaintenant ?? true;
  const { error } = await supabase.from('colis').insert({
    code: c.code.trim(), mode: c.mode, expedition_code: c.expeditionCode ?? null,
    profile_id: c.profileId,
    client_nom: c.clientNom?.trim() || null, client_tel: c.clientTel?.trim() || null,
    code_client: c.codeClient?.trim() || null, marque_colis: c.marqueColis?.trim() || null,
    type_marchandise: c.typeMarchandise || 'general', description: c.description?.trim() || null,
    poids_kg: c.poidsKg ?? null, volume_m3: c.volumeM3 ?? null,
    statut: recu ? 'recu_chine' : 'annonce', recu_chine_le: recu ? new Date().toISOString() : null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Rattache un colis à une expédition (regroupement). */
export async function affecterColis(code: string, expeditionCode: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('colis')
    .update({ expedition_code: expeditionCode, statut: 'affecte', updated_at: new Date().toISOString() })
    .eq('code', code);
  return { error: error ? humanize(error.message) : undefined };
}

/** Le voyageur annonce un colis à venir (statut 'annonce', rattaché à son compte). */
export async function annoncerColis(c: {
  mode: FretMode; villeDepart: string; caracteristiques?: Caracteristique[]; typeMarchandise?: string; description?: string; marqueColis?: string;
  poidsKg?: number | null; volumeM3?: number | null; shoppingListId?: string | null;
}): Promise<{ code?: string; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { error: 'Connectez-vous pour annoncer un colis.' };
  const code = suggestColisCode();
  const { error } = await supabase.from('colis').insert({
    code, mode: c.mode, profile_id: uid, expedition_code: null, statut: 'annonce',
    type_marchandise: c.typeMarchandise || 'general', description: c.description?.trim() || null,
    marque_colis: c.marqueColis?.trim() || null, ville_depart: c.villeDepart, caracteristiques: c.caracteristiques ?? [], poids_kg: c.poidsKg ?? null, volume_m3: c.volumeM3 ?? null,
    shopping_list_id: c.shoppingListId || null,
  });
  if (error) return { error: humanize(error.message) };
  return { code };
}

/** Les colis du voyageur connecté (RLS : il ne voit que les siens). */
export async function fetchMesColis(): Promise<Colis[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, ville_depart, caracteristiques, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at, profile_id')
    .order('created_at', { ascending: false });
  if (error) { warn('chargement de mes colis', error); return []; }
  return (data as Row[]).map(toColis);
}

/** Un colis par son code (RLS : équipe = tous ; voyageur = les siens). */
export async function fetchColisByCode(code: string): Promise<Colis | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, ville_depart, caracteristiques, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at, profile_id')
    .eq('code', code).maybeSingle();
  if (error) { warn('chargement du colis', error); return null; }
  return data ? toColis(data as Row) : null;
}

export interface EtapeVue { type: EtapeType; au: string }
/**
 * Le suivi d'un colis : « colis annoncé » (sa création), « reçu à l'entrepôt
 * (Chine) » (sa réception), puis les étapes de l'expédition qui le transporte. RLS : un voyageur ne lit que les étapes
 * visibles des expéditions portant ses propres colis.
 */
export async function fetchEtapesColis(colisCode: string): Promise<EtapeVue[]> {
  if (!supabase) return [];
  const { data: c, error: ce } = await supabase.from('colis')
    .select('expedition_code, created_at, recu_chine_le').eq('code', colisCode).maybeSingle();
  if (ce || !c) { if (ce) warn('chargement du suivi', ce); return []; }
  const etapes: EtapeVue[] = [{ type: 'annonce', au: String(c.created_at) }];
  if (c.recu_chine_le) etapes.push({ type: 'recu_chine', au: String(c.recu_chine_le) });
  if (c.expedition_code) {
    const { data, error } = await supabase.from('expedition_etapes')
      .select('type, au').eq('expedition_code', c.expedition_code).order('au', { ascending: true });
    if (error) { warn('chargement du suivi', error); return etapes; }
    etapes.push(...((data as EtapeVue[]) ?? []));
  }
  return etapes.sort((x, y) => x.au.localeCompare(y.au));
}
