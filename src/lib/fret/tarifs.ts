/* Entrepôts, types de marchandise, tarifs, frais annexes et devis. */
import { supabase } from '../supabase';
import { MODE_LABEL, type FretMode, type Warehouse } from './model';
import { humanize, num, str, warn, type Row } from './internal';


/** Entrepôts par ordre alphabétique (français, sans tenir compte de la casse ni des
    accents) : l'ordre de la base dépend de sa collation. */
const parNom = <T extends { nom: string }>(list: T[]) => [...list].sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }));

export async function fetchWarehouses(): Promise<Warehouse[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('warehouses')
    .select('id, nom, usage, actif').eq('actif', true).order('nom');
  if (error) { warn('chargement des entrepôts', error); return []; }
  return parNom((data as Warehouse[]) ?? []);
}

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

/** Entrepôt complet. `contactsInstalles` vaut false tant que supabase/500_carte_expedition.sql
    n'a pas été lancé : les champs de contact sont alors vides et ne sont pas écrits. */
export interface WarehouseFull extends Warehouse {
  addrCn: string | null; addrFr: string | null; ville: string | null;
  tel: string | null; bureauNom: string | null; bureauTel: string | null;
  contactsInstalles: boolean;
}
export interface TypeMarchandise { code: string; libelle: string }
export interface TarifFret { id: string; mode: FretMode; typeMarchandise: string; unite: 'kg' | 'm3' | 'colis' | 'conteneur'; prix: number; devise: string; actif: boolean }
export interface TarifAnnexe { id: string; categorie: 'stockage' | 'livraison' | 'autre'; libelle: string; prix: number; devise: string; joursGratuits: number | null; zone: string | null; actif: boolean }

export async function fetchTypesMarchandise(): Promise<TypeMarchandise[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('types_marchandise').select('code, libelle').eq('actif', true).order('libelle');
  if (error) { warn('chargement des types', error); return []; }
  // Même tri que les autres listes : l'ordre de la base dépend de sa collation.
  return ((data as TypeMarchandise[]) ?? []).sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr', { sensitivity: 'base' }));
}

const COLS_BASE = 'id, nom, usage, addr_cn, addr_fr, ville, actif';
const COLS_CONTACTS = ', tel, bureau_nom, bureau_tel';
const colonneAbsente = (e: { code?: string; message?: string }) => e.code === '42703' || /column .* does not exist/i.test(e.message ?? '');

/** Lit les entrepôts avec leurs contacts ; sans les colonnes de contact (script 500 pas encore
    lancé), retombe sur les colonnes d'origine pour que rien ne casse. */
async function lireEntrepots(actifsSeulement: boolean): Promise<WarehouseFull[]> {
  if (!supabase) return [];
  const lire = (cols: string) => {
    const q = supabase!.from('warehouses').select(cols);
    return (actifsSeulement ? q.eq('actif', true) : q).order('nom');
  };
  let contacts = true;
  let { data, error } = await lire(COLS_BASE + COLS_CONTACTS);
  if (error && colonneAbsente(error)) { contacts = false; ({ data, error } = await lire(COLS_BASE)); }
  if (error) { warn('chargement des entrepôts', error); return []; }
  return parNom(((data ?? []) as unknown as Row[]).map((r) => ({
    id: String(r.id), nom: String(r.nom), usage: r.usage as 'fret_express' | 'cargo',
    addrCn: str(r.addr_cn), addrFr: str(r.addr_fr), ville: str(r.ville), actif: Boolean(r.actif),
    tel: str(r.tel), bureauNom: str(r.bureau_nom), bureauTel: str(r.bureau_tel),
    contactsInstalles: contacts,
  })));
}

/** Tous les entrepôts, actifs ou non (pour l'administration). */
export const fetchAllWarehouses = (): Promise<WarehouseFull[]> => lireEntrepots(false);

/** Entrepôts actifs, avec adresses et contacts (carte d'expédition). */
export const fetchWarehousesCarte = (): Promise<WarehouseFull[]> => lireEntrepots(true);

export async function saveWarehouse(w: {
  id: string; nom: string; usage: 'fret_express' | 'cargo'; addrCn?: string; addrFr?: string; ville?: string; actif?: boolean;
  /** Contacts : écrits seulement si fournis (et si les colonnes existent, voir contactsInstalles). */
  contacts?: { tel?: string; bureauNom?: string; bureauTel?: string };
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const c = w.contacts;
  const base = {
    id: w.id.trim(), nom: w.nom.trim(), usage: w.usage,
    addr_cn: w.addrCn?.trim() || null, addr_fr: w.addrFr?.trim() || null, ville: w.ville?.trim() || null,
    actif: w.actif ?? true,
  };
  const avecContacts = c ? { ...base, tel: c.tel?.trim() || null, bureau_nom: c.bureauNom?.trim() || null, bureau_tel: c.bureauTel?.trim() || null } : base;
  let { error } = await supabase.from('warehouses').upsert(avecContacts, { onConflict: 'id' });
  if (error && c && colonneAbsente(error)) {
    // Script 500 pas encore lancé : l'entrepôt est enregistré sans ses contacts, et on le dit.
    ({ error } = await supabase.from('warehouses').upsert(base, { onConflict: 'id' }));
    if (!error) return { error: 'Entrepôt enregistré, mais pas ses contacts : lancez d’abord supabase/500_carte_expedition.sql dans Supabase.' };
  }
  return { error: error ? humanize(error.message) : undefined };
}
export async function setWarehouseActif(id: string, actif: boolean): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('warehouses').update({ actif }).eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

/** Tarifs dans l'ordre où on les lit : libellé du mode, puis libellé du type de
    marchandise, par ordre alphabétique (français, sans casse ni accents). */
export function trierTarifs(tarifs: TarifFret[], types: TypeMarchandise[]): TarifFret[] {
  const fr = (a: string, b: string) => a.localeCompare(b, 'fr', { sensitivity: 'base' });
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.libelle ?? code;
  return [...tarifs].sort((a, b) => fr(MODE_LABEL[a.mode], MODE_LABEL[b.mode]) || fr(typeLabel(a.typeMarchandise), typeLabel(b.typeMarchandise)));
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
  // Par libellé, en ordre alphabétique (français, sans casse ni accents).
  return (data as Row[]).map((r) => ({
    id: String(r.id), categorie: r.categorie as TarifAnnexe['categorie'], libelle: String(r.libelle),
    prix: Number(r.prix), devise: String(r.devise), joursGratuits: num(r.jours_gratuits), zone: str(r.zone), actif: Boolean(r.actif),
  })).sort((x, y) => x.libelle.localeCompare(y.libelle, 'fr', { sensitivity: 'base' }));
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
