/* Factures des colis. */
import { supabase } from '../supabase';
import { humanize, str, warn, type Row } from './internal';


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
