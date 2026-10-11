/* Envoi de la position d'un lieu : un lien de carte construit sur ses coordonnées,
   que n'importe quelle application de cartes (Google Maps, Apple Plans, Amap…) ouvre. */
import { whatsappUrl } from './shopping';

export interface PositionLieu { name: string; cn?: string | null; addrCn?: string | null; lat: number; lng: number }

const coord = (n: number) => n.toFixed(6);

/** Lien de carte sur les coordonnées du lieu (ouvre l'application de cartes du téléphone). */
export const lienPosition = (p: Pick<PositionLieu, 'lat' | 'lng' | 'name'>) =>
  `https://www.google.com/maps/search/?api=1&query=${coord(p.lat)}%2C${coord(p.lng)}`;

/** Texte du message : nom, adresse en chinois (pour le chauffeur) et lien de carte. */
export const messagePosition = (p: PositionLieu) =>
  [p.cn ? `${p.name} · ${p.cn}` : p.name, p.addrCn, lienPosition(p)].filter(Boolean).join('\n');

export const positionValide = (p: { lat: number; lng: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);

export type EnvoiPosition = 'partage' | 'copie' | 'echec';

/** Partage via la feuille de partage du téléphone ; à défaut, copie le message. */
export async function envoyerPosition(p: PositionLieu): Promise<EnvoiPosition> {
  const text = messagePosition(p);
  if (typeof navigator.share === 'function') {
    try { await navigator.share({ title: p.name, text }); return 'partage'; } catch (e) { if ((e as Error).name === 'AbortError') return 'partage'; }
  }
  try { await navigator.clipboard.writeText(text); return 'copie'; } catch { return 'echec'; }
}

export const whatsappPositionUrl = (p: PositionLieu) => whatsappUrl(messagePosition(p));
