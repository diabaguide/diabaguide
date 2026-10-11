/* Envoi de la position d'un lieu : un lien Amap construit sur ses coordonnées. */
import { whatsappUrl } from './shopping';

export interface PositionLieu { name: string; cn?: string | null; addrCn?: string | null; lat: number; lng: number }

const coord = (n: number) => n.toFixed(6);

/** Lien Amap (高德地图) sur les coordonnées du lieu : ouvre l'application Amap si elle est installée,
    sinon la carte Amap dans le navigateur. Les coordonnées de l'application sont des WGS84 (GPS) :
    Amap les convertit lui-même (`coordinate=wgs84`) pour éviter le décalage de plusieurs centaines de mètres. */
export const lienPosition = (p: Pick<PositionLieu, 'lat' | 'lng' | 'name'>) =>
  `https://uri.amap.com/marker?position=${coord(p.lng)},${coord(p.lat)}&name=${encodeURIComponent(p.name)}&coordinate=wgs84&callnative=1`;

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
