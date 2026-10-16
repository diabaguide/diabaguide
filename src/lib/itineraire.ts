/* Itinéraire vers une fiche : applications cartographiques utilisées en Chine, avec repli sur le web.
   Les coordonnées stockées sont en WGS84 ; Amap et Baidu sont prévenus par un paramètre dédié. */

export type AppItineraire = 'amap' | 'baidu' | 'apple' | 'osm';
export const APPS_ITINERAIRE: { id: AppItineraire; label: string; cn?: string }[] = [
  { id: 'amap', label: 'Amap', cn: '高德地图' },
  { id: 'baidu', label: 'Baidu Maps', cn: '百度地图' },
  { id: 'apple', label: 'Apple Plans' },
  { id: 'osm', label: 'OpenStreetMap' },
];
export const CLE_APP_ITINERAIRE = 'diaba-itineraire-app';

export const appItineraireChoisie = (v: string | null | undefined): AppItineraire =>
  APPS_ITINERAIRE.some((a) => a.id === v) ? (v as AppItineraire) : 'amap';

export function lienItineraire(app: AppItineraire, p: { lat: number; lng: number; name: string }): string {
  const lat = p.lat.toFixed(6), lng = p.lng.toFixed(6), nom = encodeURIComponent(p.name);
  switch (app) {
    case 'amap': return `https://uri.amap.com/navigation?to=${lng},${lat},${nom}&mode=car&coordinate=wgs84&callnative=1`;
    case 'baidu': return `https://api.map.baidu.com/direction?destination=latlng:${lat},${lng}|name:${nom}&mode=driving&coord_type=wgs84&output=html&src=webapp.diabaguide`;
    case 'apple': return `https://maps.apple.com/?daddr=${lat},${lng}&q=${nom}`;
    default: return `https://www.openstreetmap.org/directions?to=${lat}%2C${lng}`;
  }
}

export function lireAppItineraire(): AppItineraire {
  try { return appItineraireChoisie(localStorage.getItem(CLE_APP_ITINERAIRE)); } catch { return 'amap'; }
}
export function memoriserAppItineraire(a: AppItineraire): void {
  try { localStorage.setItem(CLE_APP_ITINERAIRE, a); } catch { /* stockage indisponible : le choix n'est pas mémorisé */ }
}
