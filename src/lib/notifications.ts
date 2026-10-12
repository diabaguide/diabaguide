import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from './supabase';

/* Notifications de suivi d'envoi : une par étape visible ajoutée par l'équipe à une expédition qui
   porte les colis du voyageur (supabase/540_notifications_suivi.sql). Le voyageur les lit dans
   l'application : cloche, pastille sur « Mes envois », page « Notifications ».

   L'état est partagé entre tous les écrans qui l'affichent (une seule interrogation de la base) et
   se rafraîchit à l'ouverture, au retour sur l'application et toutes les minutes tant qu'elle est ouverte.
   Sans le script SQL, ou sans Supabase, rien ne s'affiche : `installe` reste faux. */

export interface Notification {
  id: string;
  etapeType: string;
  expeditionCode: string | null;
  colisCodes: string[];
  lu: boolean;
  creeLe: string;
}

interface Etat { items: Notification[]; nonLues: number; installe: boolean; charge: boolean }

const VIDE: Etat = { items: [], nonLues: 0, installe: false, charge: false };
let etat: Etat = VIDE;
const abonnes = new Set<() => void>();
const publier = (e: Etat) => { etat = e; abonnes.forEach((f) => f()); };

interface Ligne { id: string; etape_type: string; expedition_code: string | null; colis_codes: string[] | null; lu_le: string | null; created_at: string }

const tableAbsente = (e: { code?: string; message?: string }) =>
  e.code === '42P01' || e.code === 'PGRST205' || /does not exist|could not find the table/i.test(e.message ?? '');

/** Recharge les notifications (les 50 dernières). */
export async function rafraichirNotifications(): Promise<void> {
  if (!supabase) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) { publier(VIDE); return; }
  const { data, error } = await supabase.from('notifications')
    .select('id, etape_type, expedition_code, colis_codes, lu_le, created_at')
    .order('created_at', { ascending: false }).limit(50);
  if (error) {
    // Table absente (script non lancé) : la fonction reste invisible. Autre erreur (réseau) : on garde l'état courant.
    if (tableAbsente(error)) publier({ ...VIDE, charge: true });
    return;
  }
  const items = (data as Ligne[]).map((r) => ({
    id: r.id, etapeType: r.etape_type, expeditionCode: r.expedition_code, colisCodes: r.colis_codes ?? [],
    lu: !!r.lu_le, creeLe: r.created_at,
  }));
  publier({ items, nonLues: items.filter((n) => !n.lu).length, installe: true, charge: true });
}

/** Marque des notifications comme lues (toutes, sans argument) et met l'état à jour tout de suite. */
export async function marquerLues(ids?: string[]): Promise<void> {
  if (!supabase) return;
  const cibles = new Set(ids ?? etat.items.map((n) => n.id));
  publier({
    ...etat,
    items: etat.items.map((n) => (cibles.has(n.id) ? { ...n, lu: true } : n)),
    nonLues: etat.items.filter((n) => !n.lu && !cibles.has(n.id)).length,
  });
  const { error } = await supabase.rpc('marquer_notifications_lues', ids ? { p_ids: ids } : {});
  if (error) await rafraichirNotifications();
}

let nbAbonnes = 0;
let minuteur: number | undefined;
const surRetour = () => { if (document.visibilityState === 'visible') void rafraichirNotifications(); };

function demarrer() {
  if (nbAbonnes++ > 0) return;
  void rafraichirNotifications();
  minuteur = window.setInterval(() => { if (document.visibilityState === 'visible') void rafraichirNotifications(); }, 60_000);
  document.addEventListener('visibilitychange', surRetour);
  window.addEventListener('focus', surRetour);
}
function arreter() {
  if (--nbAbonnes > 0) return;
  window.clearInterval(minuteur);
  document.removeEventListener('visibilitychange', surRetour);
  window.removeEventListener('focus', surRetour);
}

/** Les notifications du voyageur connecté, partagées entre les écrans. `actif` : faux hors connexion. */
export function useNotifications(actif = true): Etat {
  useEffect(() => {
    if (!actif || !supabase) return;
    demarrer();
    return arreter;
  }, [actif]);
  const courant = useSyncExternalStore(
    (f) => { abonnes.add(f); return () => { abonnes.delete(f); }; },
    () => etat,
  );
  return actif ? courant : VIDE;
}

/** Remise à zéro à la déconnexion : la prochaine personne ne voit rien de la précédente. */
export const oublierNotifications = () => publier(VIDE);
