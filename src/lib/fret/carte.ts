/* Carte d'expédition : numéro de client, nom court et informations imprimées.
   Fonctions de la base : supabase/500_carte_expedition.sql. */
import { supabase } from '../supabase';
import { humanize, str, warn, type Row } from './internal';

export interface ShippingInfo {
  /** Numéro de client, attribué automatiquement. */
  clientNo: number;
  /** Nom court choisi (« BTC »), ou null s'il n'en a pas encore. */
  entryName: string | null;
  /** Nom et téléphone imprimés : ceux de la carte, à défaut ceux du profil. */
  name: string;
  phone: string | null;
  /** Valeurs propres à la carte (null = reprend le profil). */
  cardName: string | null;
  cardPhone: string | null;
  profileName: string;
  profilePhone: string | null;
  /** false tant que le script SQL 510 n'a pas été lancé : le nom et le téléphone ne sont alors pas modifiables ici. */
  contactModifiable: boolean;
}

/** Résultat d'un appel : `notInstalled` si le script SQL 500 n'a pas encore été lancé. */
export interface CarteResult<T> { data?: T; error?: string; notInstalled?: boolean }

const fonctionAbsente = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(e.message ?? '');

/** Informations de la carte : les siennes (sans argument), ou celles d'un client (fret). */
export async function fetchShippingInfo(profileId?: string): Promise<CarteResult<ShippingInfo>> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('client_shipping_info', profileId ? { p_profile: profileId } : {});
  if (error) {
    if (fonctionAbsente(error)) return { notInstalled: true };
    warn('chargement de la carte d’expédition', error);
    return { error: humanize(error.message) };
  }
  const r = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  if (!r) return { error: 'Client introuvable.' };
  const contactModifiable = 'card_name' in r;
  return {
    data: {
      clientNo: Number(r.client_no), entryName: str(r.entry_name), name: String(r.name ?? ''), phone: str(r.phone),
      cardName: str(r.card_name), cardPhone: str(r.card_phone),
      profileName: String(contactModifiable ? r.profile_name ?? '' : r.name ?? ''), profilePhone: str(contactModifiable ? r.profile_phone : r.phone),
      contactModifiable,
    },
  };
}

/** Enregistre son propre nom court ; renvoie le nom tel que la base l'a retenu. */
export async function setMyEntryName(name: string): Promise<CarteResult<string>> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('set_my_entry_name', { p_name: name });
  if (error) return fonctionAbsente(error) ? { notInstalled: true } : { error: humanize(error.message) };
  return { data: String(data) };
}

/** Corrige le nom court d'un client (fret). */
export async function setClientEntryName(profileId: string, name: string): Promise<CarteResult<string>> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('set_client_entry_name', { p_profile: profileId, p_name: name });
  if (error) return fonctionAbsente(error) ? { notInstalled: true } : { error: humanize(error.message) };
  return { data: String(data) };
}

export interface CardContact { cardName: string | null; cardPhone: string | null }

const contactResult = (data: unknown, error: { code?: string; message: string } | null): CarteResult<CardContact> => {
  if (error) return fonctionAbsente(error) ? { notInstalled: true } : { error: humanize(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as Row | undefined;
  return { data: { cardName: str(r?.card_name), cardPhone: str(r?.card_phone) } };
};

/** Enregistre le nom et le téléphone imprimés sur sa carte (vide = reprendre le profil). Script 510. */
export async function setMyCardContact(name: string, phone: string): Promise<CarteResult<CardContact>> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('set_my_card_contact', { p_name: name, p_phone: phone });
  return contactResult(data, error);
}

/** Même chose pour un client (fret). */
export async function setClientCardContact(profileId: string, name: string, phone: string): Promise<CarteResult<CardContact>> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('set_client_card_contact', { p_profile: profileId, p_name: name, p_phone: phone });
  return contactResult(data, error);
}
