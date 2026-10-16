/* Capture de la position d'une fiche sur place (GPS du téléphone, WGS84).
   Refuse ce qui n'est pas une vraie position : coordonnées par défaut, hors de Chine, trop imprécises. */
import { enChine } from './amap.ts';

export const PRECISION_MAX_M = 100;
const PAR_DEFAUT: [number, number][] = [[23.13, 113.27]];

export type PositionEvaluee = { ok: true; lat: number; lng: number; precision: number } | { ok: false; raison: string };

export function evaluerPosition(p: { lat: number; lng: number; accuracy: number }): PositionEvaluee {
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return { ok: false, raison: 'Position illisible. Réessayez.' };
  if (!enChine(p.lat, p.lng)) return { ok: false, raison: 'Cette position n’est pas en Chine. Faites la capture sur place, devant l’entrée.' };
  if (PAR_DEFAUT.some(([a, b]) => Math.abs(p.lat - a) < 1e-6 && Math.abs(p.lng - b) < 1e-6)) return { ok: false, raison: 'Ce sont les coordonnées par défaut, pas une vraie position.' };
  if (!Number.isFinite(p.accuracy) || p.accuracy > PRECISION_MAX_M) return { ok: false, raison: `Position trop imprécise (${Math.round(p.accuracy)} m). Sortez à l’extérieur et réessayez.` };
  return { ok: true, lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), precision: Math.round(p.accuracy) };
}

/** Une seule lecture GPS haute précision ; rejette avec un message clair pour l'équipe. */
export function lirePositionGps(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new Error('Ce téléphone ne donne pas sa position.')); return; }
    navigator.geolocation.getCurrentPosition(
      (g) => resolve({ lat: g.coords.latitude, lng: g.coords.longitude, accuracy: g.coords.accuracy }),
      (e) => reject(new Error(e.code === 1 ? 'Localisation refusée. Autorisez-la dans les réglages du navigateur.' : 'Position introuvable. Réessayez à l’extérieur.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
