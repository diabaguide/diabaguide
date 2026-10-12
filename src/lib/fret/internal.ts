/* Utilitaires internes au module Fret (non ré-exportés par index.ts). */
import type { Caracteristique, Colis, ColisStatut, Expedition, ExpeditionStatut, FretMode } from './model';
import { messageReseau } from '../erreurs';


export type Row = Record<string, unknown>;
export const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
export const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function toExpedition(r: Row): Expedition {
  return {
    code: String(r.code), mode: r.mode as FretMode, warehouseId: str(r.warehouse_id), destination: String(r.destination ?? 'Dakar'),
    containerNo: str(r.container_no), blNo: str(r.bl_no), awbNo: str(r.awb_no),
    shipsgoId: num(r.shipsgo_id), shipsgoType: r.shipsgo_type === 'ocean' || r.shipsgo_type === 'air' ? r.shipsgo_type : null,
    shipsgoStatus: str(r.shipsgo_status),
    shipsgoTrackingState: r.shipsgo_tracking_state === 'creating' || r.shipsgo_tracking_state === 'active' || r.shipsgo_tracking_state === 'error' ? r.shipsgo_tracking_state : 'inactive',
    shipsgoSyncedAt: str(r.shipsgo_synced_at),
    seuilKg: num(r.seuil_kg), seuilM3: num(r.seuil_m3), arriveePrevue: str(r.arrivee_prevue), noteInterne: str(r.note_interne), photo: str(r.photo), statut: r.statut as ExpeditionStatut, createdAt: String(r.created_at),
  };
}
export function toColis(r: Row): Colis {
  return {
    code: String(r.code), expeditionCode: str(r.expedition_code), clientNom: str(r.client_nom), clientTel: str(r.client_tel),
    profileId: str(r.profile_id), codeClient: str(r.code_client), marqueColis: str(r.marque_colis), villeDepart: str(r.ville_depart), caracteristiques: Array.isArray(r.caracteristiques) ? r.caracteristiques as Caracteristique[] : [], mode: r.mode as FretMode, typeMarchandise: str(r.type_marchandise),
    description: str(r.description), poidsKg: num(r.poids_kg), volumeM3: num(r.volume_m3),
    statut: r.statut as ColisStatut, recuChineLe: str(r.recu_chine_le), createdAt: String(r.created_at),
  };
}

export function humanize(msg: string): string {
  const reseau = messageReseau(msg);
  if (reseau) return reseau;
  if (/row-level security|permission denied/i.test(msg)) return "Action non autorisée : réservé à l’équipe.";
  if (/duplicate key|already exists/i.test(msg)) return 'Ce code existe déjà. Choisissez-en un autre.';
  return msg;
}
export function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}
