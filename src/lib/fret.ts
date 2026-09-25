import { supabase } from './supabase';

/**
 * Accès aux données du module Fret (expéditions, colis, suivi).
 * Tables : voir supabase/fret_module.sql et supabase/fret_tarifs.sql.
 * RLS : réservé à l'équipe (is_team) ; le client lit ses propres colis.
 */

export type FretMode = 'maritime_groupage' | 'maritime_complet' | 'aerien_fret' | 'aerien_express';
export type ExpeditionStatut = 'ouverte' | 'cloturee' | 'partie' | 'arrivee' | 'livree' | 'annulee';
export type ColisStatut =
  | 'annonce' | 'recu_chine' | 'affecte' | 'en_transit' | 'arrive_dakar'
  | 'dispo_retrait' | 'en_livraison' | 'remis' | 'probleme';
export type EtapeType =
  | 'annonce' | 'recu_chine' | 'regroupe' | 'depart' | 'en_transit'
  | 'arrive_dakar' | 'chez_diaba' | 'dispo_retrait' | 'en_livraison' | 'remis';

export const MODE_LABEL: Record<FretMode, string> = {
  maritime_groupage: 'Maritime groupage',
  maritime_complet: 'Maritime conteneur complet',
  aerien_fret: 'Aérien fret',
  aerien_express: 'Aérien express',
};
/** Unité de facturation par mode (cadrage : m³ pour le groupage, kg sinon). */
export const MODE_UNITE: Record<FretMode, 'kg' | 'm3'> = {
  maritime_groupage: 'm3',
  maritime_complet: 'kg',
  aerien_fret: 'kg',
  aerien_express: 'kg',
};
export const EXPEDITION_STATUT_LABEL: Record<ExpeditionStatut, string> = {
  ouverte: 'Ouverte', cloturee: 'Clôturée', partie: 'Partie',
  arrivee: 'Arrivée', livree: 'Livrée', annulee: 'Annulée',
};
export const COLIS_STATUT_LABEL: Record<ColisStatut, string> = {
  annonce: 'Annoncé', recu_chine: 'Reçu en Chine', affecte: 'Affecté', en_transit: 'En transit',
  arrive_dakar: 'Arrivé à Dakar', dispo_retrait: 'Disponible au retrait',
  en_livraison: 'En livraison', remis: 'Remis', probleme: 'Problème',
};
/** Étape → libellé et visibilité client par défaut (cadrage du 25 sept.). */
export const ETAPE_LABEL: Record<EtapeType, string> = {
  annonce: 'Colis annoncé', recu_chine: 'Reçu à l’entrepôt (Chine)', regroupe: 'Regroupé / chargé',
  depart: 'Départ', en_transit: 'En transit', arrive_dakar: 'Arrivé à Dakar',
  chez_diaba: 'Arrivé chez Diaba', dispo_retrait: 'Disponible au retrait',
  en_livraison: 'En livraison', remis: 'Remis au client',
};
export const ETAPE_VISIBLE_DEFAUT: Record<EtapeType, boolean> = {
  annonce: true, recu_chine: false, regroupe: false, depart: false, en_transit: true,
  arrive_dakar: true, chez_diaba: false, dispo_retrait: true, en_livraison: true, remis: true,
};

export interface Warehouse { id: string; nom: string; usage: 'fret_express' | 'cargo'; actif: boolean }
export interface Expedition {
  code: string; mode: FretMode; warehouseId: string | null; destination: string;
  containerNo: string | null; blNo: string | null; awbNo: string | null;
  seuilKg: number | null; seuilM3: number | null; statut: ExpeditionStatut; createdAt: string;
}
export interface ExpeditionTotaux {
  code: string; mode: FretMode; statut: ExpeditionStatut; seuilKg: number | null; seuilM3: number | null;
  nbColis: number; totalKg: number; totalM3: number; pctKg: number | null; pctM3: number | null;
}
export interface Colis {
  code: string; expeditionCode: string | null; clientNom: string | null; clientTel: string | null;
  codeClient: string | null; marqueColis: string | null; mode: FretMode; typeMarchandise: string | null;
  description: string | null; poidsKg: number | null; volumeM3: number | null;
  statut: ColisStatut; recuChineLe: string | null; createdAt: string;
}

/** Code de lot suggéré (l'équipe peut le remplacer). */
export const suggestExpeditionCode = () =>
  `EXP-${new Date().getFullYear()}-${rand(4)}`;
export const suggestColisCode = () =>
  `DBA-${new Date().getFullYear()}-${rand(6)}`;
function rand(n: number) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/* ---------- Lectures ---------- */

export async function fetchWarehouses(): Promise<Warehouse[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('warehouses')
    .select('id, nom, usage, actif').eq('actif', true).order('nom');
  if (error) { warn('chargement des entrepôts', error); return []; }
  return (data as Warehouse[]) ?? [];
}

export async function fetchExpeditions(): Promise<Expedition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('expeditions')
    .select('code, mode, warehouse_id, destination, container_no, bl_no, awb_no, seuil_kg, seuil_m3, statut, created_at')
    .order('created_at', { ascending: false });
  if (error) { warn('chargement des expéditions', error); return []; }
  return (data as Row[]).map(toExpedition);
}

export async function fetchExpeditionTotaux(): Promise<Record<string, ExpeditionTotaux>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('v_expedition_totaux')
    .select('code, mode, statut, seuil_kg, seuil_m3, nb_colis, total_kg, total_m3, pct_kg, pct_m3');
  if (error) { warn('chargement des totaux', error); return {}; }
  const out: Record<string, ExpeditionTotaux> = {};
  for (const r of (data as Row[])) {
    out[String(r.code)] = {
      code: String(r.code), mode: r.mode as FretMode, statut: r.statut as ExpeditionStatut, seuilKg: num(r.seuil_kg), seuilM3: num(r.seuil_m3),
      nbColis: Number(r.nb_colis ?? 0), totalKg: Number(r.total_kg ?? 0), totalM3: Number(r.total_m3 ?? 0),
      pctKg: num(r.pct_kg), pctM3: num(r.pct_m3),
    };
  }
  return out;
}

export async function fetchColis(expeditionCode?: string): Promise<Colis[]> {
  if (!supabase) return [];
  let q = supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at')
    .order('created_at', { ascending: false });
  q = expeditionCode ? q.eq('expedition_code', expeditionCode) : q.is('expedition_code', null);
  const { data, error } = await q;
  if (error) { warn('chargement des colis', error); return []; }
  return (data as Row[]).map(toColis);
}

/* ---------- Écritures ---------- */

export async function createExpedition(e: {
  code: string; mode: FretMode; warehouseId?: string | null; destination?: string;
  seuilKg?: number | null; seuilM3?: number | null;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('expeditions').insert({
    code: e.code.trim(), mode: e.mode, warehouse_id: e.warehouseId ?? null,
    destination: e.destination?.trim() || 'Dakar', seuil_kg: e.seuilKg ?? null, seuil_m3: e.seuilM3 ?? null,
  });
  return { error: error ? humanize(error.message) : undefined };
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
  if (error) return { error: humanize(error.message) };
  // Trace l'étape correspondante (interne par défaut pour « reçu en Chine »).
  if (recu) await addEtape(c.code.trim(), 'recu_chine');
  else await addEtape(c.code.trim(), 'annonce');
  return {};
}

/** Rattache un colis à une expédition (regroupement). */
export async function affecterColis(code: string, expeditionCode: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('colis')
    .update({ expedition_code: expeditionCode, statut: 'affecte', updated_at: new Date().toISOString() })
    .eq('code', code);
  if (error) return { error: humanize(error.message) };
  await addEtape(code, 'regroupe');
  return {};
}

/** Ajoute une étape de suivi ; visibilité client selon le défaut du cadrage. */
export async function addEtape(colisCode: string, type: EtapeType, visibleClient?: boolean, note?: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('colis_etapes').insert({
    colis_code: colisCode, type,
    visible_client: visibleClient ?? ETAPE_VISIBLE_DEFAUT[type],
    note_interne: note?.trim() || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/* ---------- Côté client (voyageur) ---------- */

/** Devis rapide : montant estimé d'un envoi via la fonction calc_fret. */
export async function devisFret(
  mode: FretMode, typeMarchandise: string, poidsKg: number | null, volumeM3: number | null, devise = 'XOF',
): Promise<number | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('calc_fret', {
    p_mode: mode, p_type: typeMarchandise || 'general', p_poids: poidsKg, p_volume: volumeM3, p_devise: devise,
  });
  if (error) { warn('calcul du devis', error); return null; }
  return data === null || data === undefined ? null : Number(data);
}

/** Le voyageur annonce un colis à venir (statut 'annonce', rattaché à son compte). */
export async function annoncerColis(c: {
  mode: FretMode; typeMarchandise?: string; description?: string; marqueColis?: string;
  poidsKg?: number | null; volumeM3?: number | null;
}): Promise<{ code?: string; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) return { error: 'Connectez-vous pour annoncer un colis.' };
  const code = suggestColisCode();
  const { error } = await supabase.from('colis').insert({
    code, mode: c.mode, profile_id: uid, expedition_code: null, statut: 'annonce',
    type_marchandise: c.typeMarchandise || 'general', description: c.description?.trim() || null,
    marque_colis: c.marqueColis?.trim() || null, poids_kg: c.poidsKg ?? null, volume_m3: c.volumeM3 ?? null,
  });
  if (error) return { error: humanize(error.message) };
  return { code };
}

/** Les colis du voyageur connecté (RLS : il ne voit que les siens). */
export async function fetchMesColis(): Promise<Colis[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at')
    .order('created_at', { ascending: false });
  if (error) { warn('chargement de mes colis', error); return []; }
  return (data as Row[]).map(toColis);
}

/** Un colis par son code (RLS : équipe = tous ; voyageur = les siens). */
export async function fetchColisByCode(code: string): Promise<Colis | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('colis')
    .select('code, expedition_code, client_nom, client_tel, marque_colis, mode, type_marchandise, description, poids_kg, volume_m3, statut, recu_chine_le, created_at')
    .eq('code', code).maybeSingle();
  if (error) { warn('chargement du colis', error); return null; }
  return data ? toColis(data as Row) : null;
}

export interface EtapeVue { type: EtapeType; au: string }
/** Les étapes visibles d'un colis (RLS : seulement si le colis appartient au voyageur). */
export async function fetchEtapesColis(colisCode: string): Promise<EtapeVue[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('colis_etapes')
    .select('type, au').eq('colis_code', colisCode).order('au', { ascending: true });
  if (error) { warn('chargement du suivi', error); return []; }
  return (data as EtapeVue[]) ?? [];
}

/* ---------- Administration : entrepôts, tarifs, types ---------- */

export interface WarehouseFull extends Warehouse { addrCn: string | null; addrFr: string | null; ville: string | null }
export interface TypeMarchandise { code: string; libelle: string }
export interface TarifFret { id: string; mode: FretMode; typeMarchandise: string; unite: 'kg' | 'm3' | 'colis' | 'conteneur'; prix: number; devise: string; actif: boolean }
export interface TarifAnnexe { id: string; categorie: 'stockage' | 'livraison' | 'autre'; libelle: string; prix: number; devise: string; joursGratuits: number | null; zone: string | null; actif: boolean }

export async function fetchTypesMarchandise(): Promise<TypeMarchandise[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('types_marchandise').select('code, libelle').eq('actif', true).order('libelle');
  if (error) { warn('chargement des types', error); return []; }
  return (data as TypeMarchandise[]) ?? [];
}

/** Tous les entrepôts, actifs ou non (pour l'administration). */
export async function fetchAllWarehouses(): Promise<WarehouseFull[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('warehouses').select('id, nom, usage, addr_cn, addr_fr, ville, actif').order('nom');
  if (error) { warn('chargement des entrepôts', error); return []; }
  return (data as Row[]).map((r) => ({
    id: String(r.id), nom: String(r.nom), usage: r.usage as 'fret_express' | 'cargo',
    addrCn: str(r.addr_cn), addrFr: str(r.addr_fr), ville: str(r.ville), actif: Boolean(r.actif),
  }));
}

export async function saveWarehouse(w: {
  id: string; nom: string; usage: 'fret_express' | 'cargo'; addrCn?: string; addrFr?: string; ville?: string; actif?: boolean;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('warehouses').upsert({
    id: w.id.trim(), nom: w.nom.trim(), usage: w.usage,
    addr_cn: w.addrCn?.trim() || null, addr_fr: w.addrFr?.trim() || null, ville: w.ville?.trim() || null,
    actif: w.actif ?? true,
  }, { onConflict: 'id' });
  return { error: error ? humanize(error.message) : undefined };
}
export async function setWarehouseActif(id: string, actif: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('warehouses').update({ actif }).eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function fetchTarifs(): Promise<TarifFret[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('tarifs_fret')
    .select('id, mode, type_marchandise, unite, prix, devise, actif').order('mode').order('type_marchandise');
  if (error) { warn('chargement des tarifs', error); return []; }
  return (data as Row[]).map((r) => ({
    id: String(r.id), mode: r.mode as FretMode, typeMarchandise: String(r.type_marchandise),
    unite: r.unite as TarifFret['unite'], prix: Number(r.prix), devise: String(r.devise), actif: Boolean(r.actif),
  }));
}
export async function createTarif(t: {
  mode: FretMode; typeMarchandise: string; unite: TarifFret['unite']; prix: number; devise: string;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('tarifs_fret').insert({
    mode: t.mode, type_marchandise: t.typeMarchandise, unite: t.unite, prix: t.prix, devise: t.devise,
  });
  return { error: error ? humanize(error.message) : undefined };
}
export async function deleteTarif(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('tarifs_fret').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function fetchAnnexes(): Promise<TarifAnnexe[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('tarifs_annexes')
    .select('id, categorie, libelle, prix, devise, jours_gratuits, zone, actif').order('categorie');
  if (error) { warn('chargement des frais annexes', error); return []; }
  return (data as Row[]).map((r) => ({
    id: String(r.id), categorie: r.categorie as TarifAnnexe['categorie'], libelle: String(r.libelle),
    prix: Number(r.prix), devise: String(r.devise), joursGratuits: num(r.jours_gratuits), zone: str(r.zone), actif: Boolean(r.actif),
  }));
}
export async function createAnnexe(a: {
  categorie: TarifAnnexe['categorie']; libelle: string; prix: number; devise: string; joursGratuits?: number | null; zone?: string;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('tarifs_annexes').insert({
    categorie: a.categorie, libelle: a.libelle.trim(), prix: a.prix, devise: a.devise,
    jours_gratuits: a.joursGratuits ?? null, zone: a.zone?.trim() || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}
export async function deleteAnnexe(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('tarifs_annexes').delete().eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

/* ---------- Factures ---------- */

export type FactureStatut = 'a_payer' | 'payee' | 'annulee';
export const FACTURE_STATUT_LABEL: Record<FactureStatut, string> = {
  a_payer: 'À payer', payee: 'Payée', annulee: 'Annulée',
};
export interface Facture {
  colisCode: string; montantFret: number; montantStockage: number; montantLivraison: number;
  montantTotal: number; devise: string; statut: FactureStatut; emiseLe: string; payeeLe: string | null; note: string | null;
}

/** Toutes les factures visibles (RLS : équipe = toutes ; voyageur = les siennes), indexées par code de colis. */
export async function fetchFactures(): Promise<Record<string, Facture>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('factures')
    .select('colis_code, montant_fret, montant_stockage, montant_livraison, montant_total, devise, statut, emise_le, payee_le, note');
  if (error) { warn('chargement des factures', error); return {}; }
  const out: Record<string, Facture> = {};
  for (const r of (data as Row[])) {
    out[String(r.colis_code)] = {
      colisCode: String(r.colis_code), montantFret: Number(r.montant_fret), montantStockage: Number(r.montant_stockage),
      montantLivraison: Number(r.montant_livraison), montantTotal: Number(r.montant_total), devise: String(r.devise),
      statut: r.statut as FactureStatut, emiseLe: String(r.emise_le), payeeLe: str(r.payee_le), note: str(r.note),
    };
  }
  return out;
}

/** Émet ou met à jour la facture d'un colis (équipe). Le fret est recalculé. */
export async function emettreFacture(colisCode: string, stockage = 0, livraison = 0, devise = 'XOF'): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('emettre_facture', {
    p_colis_code: colisCode, p_stockage: stockage, p_livraison: livraison, p_devise: devise,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Marque la facture d'un colis comme payée (équipe). */
export async function marquerFacturePayee(colisCode: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('marquer_facture_payee', { p_colis_code: colisCode });
  return { error: error ? humanize(error.message) : undefined };
}

/* ---------- Mapping & utilitaires ---------- */

type Row = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

function toExpedition(r: Row): Expedition {
  return {
    code: String(r.code), mode: r.mode as FretMode, warehouseId: str(r.warehouse_id), destination: String(r.destination ?? 'Dakar'),
    containerNo: str(r.container_no), blNo: str(r.bl_no), awbNo: str(r.awb_no),
    seuilKg: num(r.seuil_kg), seuilM3: num(r.seuil_m3), statut: r.statut as ExpeditionStatut, createdAt: String(r.created_at),
  };
}
function toColis(r: Row): Colis {
  return {
    code: String(r.code), expeditionCode: str(r.expedition_code), clientNom: str(r.client_nom), clientTel: str(r.client_tel),
    codeClient: str(r.code_client), marqueColis: str(r.marque_colis), mode: r.mode as FretMode, typeMarchandise: str(r.type_marchandise),
    description: str(r.description), poidsKg: num(r.poids_kg), volumeM3: num(r.volume_m3),
    statut: r.statut as ColisStatut, recuChineLe: str(r.recu_chine_le), createdAt: String(r.created_at),
  };
}

function humanize(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return "Action non autorisée : réservé à l’équipe.";
  if (/duplicate key|already exists/i.test(msg)) return 'Ce code existe déjà. Choisissez-en un autre.';
  return msg;
}
function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}
