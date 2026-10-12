/* Notifications de suivi d'envoi : textes et dates (fonctions pures, testées). */

/** Titre d'une notification selon l'étape de l'expédition (français ; l'écran le traduit). */
export const TITRE_ETAPE: Record<string, string> = {
  regroupe: 'Votre marchandise est chargée',
  depart: 'Votre marchandise est partie',
  en_transit: 'Votre marchandise est en transit',
  arrive_dakar: 'Votre marchandise est arrivée à Dakar',
  chez_diaba: 'Votre marchandise est arrivée chez Diaba',
  dispo_retrait: 'Votre marchandise est disponible au retrait',
  en_livraison: 'Votre marchandise est en cours de livraison',
  remis: 'Votre marchandise vous a été remise',
};
export const TITRE_PAR_DEFAUT = 'Mise à jour de votre envoi';

export const titreNotification = (etapeType: string): string => TITRE_ETAPE[etapeType] ?? TITRE_PAR_DEFAUT;

/** Icône de l'étape : un point d'étape qui avance, une arrivée, une remise. */
export const iconeNotification = (etapeType: string): 'ship' | 'truck' | 'check' | 'box' =>
  etapeType === 'remis' ? 'check'
    : etapeType === 'en_livraison' || etapeType === 'dispo_retrait' ? 'truck'
      : etapeType === 'depart' || etapeType === 'en_transit' ? 'ship'
        : 'box';

export type TempsRelatif =
  | { cle: 'maintenant' }
  | { cle: 'minutes'; n: number }
  | { cle: 'heures'; n: number }
  | { cle: 'date'; texte: string };

/** « À l'instant », « Il y a 5 min », « Il y a 3 h », puis la date (jj/mm/aaaa). */
export function tempsRelatif(iso: string, maintenant: Date = new Date()): TempsRelatif {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { cle: 'date', texte: '' };
  const minutes = Math.floor((maintenant.getTime() - d.getTime()) / 60000);
  if (minutes < 1) return { cle: 'maintenant' };
  if (minutes < 60) return { cle: 'minutes', n: minutes };
  if (minutes < 60 * 24) return { cle: 'heures', n: Math.floor(minutes / 60) };
  const p = (n: number) => String(n).padStart(2, '0');
  return { cle: 'date', texte: `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}` };
}

/** Lien de la notification : le suivi public du lot, à défaut la liste des envois. */
export const lienNotification = (expeditionCode: string | null | undefined): string =>
  expeditionCode ? `/suivi/${encodeURIComponent(expeditionCode)}` : '/mes-envois';
