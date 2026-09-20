import { allDistricts } from './data';

/* Position de l’utilisateur : gardée pour la session seulement (jamais persistée).
   Demandée uniquement quand l’utilisateur active la recherche à proximité. */
export interface Pos { lat: number; lng: number; label: string }
const K = 'diaba-pos';

export const getPos = (): Pos | null => {
  try { return JSON.parse(sessionStorage.getItem(K) || 'null'); } catch { return null; }
};
export const setPos = (p: Pos | null) => {
  try { p ? sessionStorage.setItem(K, JSON.stringify(p)) : sessionStorage.removeItem(K); } catch { /* ignore */ }
};

export function requestPosition(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (r) => resolve({ lat: r.coords.latitude, lng: r.coords.longitude, label: 'Ma position' }),
      (e) => reject(e),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}

export function districtPos(name: string): Pos | null {
  const d = allDistricts().find((x) => x.name === name);
  return d ? { lat: d.lat, lng: d.lng, label: d.name } : null;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (k: number) => `${k.toFixed(1).replace('.', ',')} km`;
