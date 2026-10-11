/**
 * Modèle du module Fret : types, libellés et codes suggérés.
 * Tables : voir supabase/240_fret_module.sql et supabase/250_fret_tarifs.sql.
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
/** Caractéristiques particulières cochées à l'annonce (contrainte colis_caracteristiques_valides). */
export type Caracteristique = 'fragile' | 'batterie' | 'inflammable' | 'liquide';
export const CARACTERISTIQUES: { v: Caracteristique; l: string; emoji: string }[] = [
  { v: 'fragile', l: 'Fragile', emoji: '🍷' },
  { v: 'batterie', l: 'Batterie', emoji: '🔋' },
  { v: 'inflammable', l: 'Inflammable', emoji: '🔥' },
  { v: 'liquide', l: 'Liquide / produit chimique', emoji: '🧪' },
];
export const caracLabel = (v: Caracteristique) => CARACTERISTIQUES.find((c) => c.v === v)?.l ?? v;
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
  seuilKg: number | null; seuilM3: number | null; arriveePrevue: string | null; noteInterne: string | null; photo: string | null; statut: ExpeditionStatut; createdAt: string;
  shipsgoId: number | null; shipsgoType: 'ocean' | 'air' | null; shipsgoStatus: string | null;
  shipsgoTrackingState: 'inactive' | 'creating' | 'active' | 'error'; shipsgoSyncedAt: string | null;
}
export interface ExpeditionArticle {
  id: string; expeditionCode: string; nom: string; quantite: number; poidsKg: number | null; createdAt: string;
}
export interface ExpeditionTotaux {
  code: string; mode: FretMode; statut: ExpeditionStatut; seuilKg: number | null; seuilM3: number | null;
  nbColis: number; totalKg: number; totalM3: number; pctKg: number | null; pctM3: number | null;
}
export interface SuiviPublicEtape { type: EtapeType; au: string }
export interface SuiviPublic {
  code: string; mode: FretMode; destination: string; statut: ExpeditionStatut;
  arriveePrevue: string | null; clotureeLe: string | null; partieLe: string | null; arriveeLe: string | null;
  etapes: SuiviPublicEtape[];
}
export interface Colis {
  code: string; expeditionCode: string | null; clientNom: string | null; clientTel: string | null;
  codeClient: string | null; marqueColis: string | null; villeDepart: string | null; caracteristiques: Caracteristique[]; mode: FretMode; typeMarchandise: string | null;
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
