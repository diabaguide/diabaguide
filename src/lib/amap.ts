/* Lecture d'une position envoyée depuis Amap (高德地图) ou saisie en coordonnées.

   Amap (comme toutes les cartes en Chine) utilise le système GCJ-02, décalé de plusieurs centaines
   de mètres du GPS (WGS84). L'application stocke du WGS84 (celui du GPS et d'OpenStreetMap) :
   les coordonnées lues dans un lien Amap sont donc converties. */

export interface Coordonnees { lat: number; lng: number }

export type PositionLue =
  /** Coordonnées trouvées (déjà en WGS84). `lien` : le lien Amap d'origine, s'il y en avait un. */
  | { type: 'coordonnees'; lat: number; lng: number; source: 'amap' | 'saisie'; lien?: string }
  /** Lien Amap raccourci (surl.amap.com…) : il ne contient pas les coordonnées, l'équipe l'ouvrira. */
  | { type: 'lien'; lien: string };

const A = 6378245.0;
const EE = 0.00669342162296594323;

export const enChine = (lat: number, lng: number) => lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271;

const transformLat = (x: number, y: number) => {
  let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
  r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
  return r;
};
const transformLng = (x: number, y: number) => {
  let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
  r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
  r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
  return r;
};

/** WGS84 → GCJ-02 (ce que voit Amap). Hors de Chine : inchangé. */
export function wgs84ToGcj02({ lat, lng }: Coordonnees): Coordonnees {
  if (!enChine(lat, lng)) return { lat, lng };
  let dLat = transformLat(lng - 105, lat - 35);
  let dLng = transformLng(lng - 105, lat - 35);
  const rad = (lat / 180) * Math.PI;
  let magic = Math.sin(rad);
  magic = 1 - EE * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((A * (1 - EE)) / (magic * sq)) * Math.PI);
  dLng = (dLng * 180) / ((A / sq) * Math.cos(rad) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}

/** GCJ-02 (Amap) → WGS84 (GPS), par approximations successives : erreur très inférieure au mètre. */
export function gcj02ToWgs84(g: Coordonnees): Coordonnees {
  if (!enChine(g.lat, g.lng)) return g;
  let guess = { ...g };
  for (let i = 0; i < 8; i++) {
    const back = wgs84ToGcj02(guess);
    guess = { lat: guess.lat - (back.lat - g.lat), lng: guess.lng - (back.lng - g.lng) };
  }
  return guess;
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const num = (s: string | undefined) => (s !== undefined && /^-?\d+(\.\d+)?$/.test(s.trim()) ? Number(s) : NaN);
const valide = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** Deux nombres dans un ordre incertain : en Chine la latitude (18 à 54) est toujours plus petite que la longitude (73 à 135). */
function orienter(a: number, b: number): Coordonnees | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (enChine(a, b)) return { lat: a, lng: b };
  if (enChine(b, a)) return { lat: b, lng: a };
  return valide(a, b) ? { lat: a, lng: b } : null;
}

const HOTES_AMAP = /(^|\.)(amap\.com|gaode\.com|autonavi\.com)$/i;
const RACCOURCIS = /^(surl|c|m|wb|a)\.amap\.com$|^surl\.gd\.cn$/i;
const LNG_LAT = ['position', 'lnglat', 'location', 'to', 'dest', 'destination', 'center', 'poi'];

function depuisUrl(url: URL): PositionLue | null {
  const hote = url.hostname.toLowerCase();
  const amap = HOTES_AMAP.test(hote) || hote === 'surl.gd.cn';
  const q = url.searchParams;
  const get = (k: string) => [...q.entries()].find(([n]) => n.toLowerCase() === k)?.[1];
  const wgs = (get('coordinate') ?? '').toLowerCase() === 'wgs84';
  let c: Coordonnees | null = null;

  for (const k of LNG_LAT) {
    const v = get(k);
    if (!v) continue;
    const [x, y] = v.split(',');
    if (valide(num(y), num(x))) { c = { lat: num(y), lng: num(x) }; break; }
  }
  if (!c) {
    const lat = num(get('lat') ?? get('latitude')), lng = num(get('lon') ?? get('lng') ?? get('longitude'));
    if (valide(lat, lng)) c = { lat, lng };
  }
  if (!c) {
    const v = get('q') ?? get('ll');
    const m = v?.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
    if (m) c = orienter(Number(m[1]), Number(m[2]));
  }
  if (c) {
    const final = amap && !wgs ? gcj02ToWgs84(c) : c;
    return { type: 'coordonnees', lat: r6(final.lat), lng: r6(final.lng), source: amap ? 'amap' : 'saisie', lien: amap ? url.toString() : undefined };
  }
  if (amap && RACCOURCIS.test(hote)) return { type: 'lien', lien: url.toString() };
  return null;
}

/**
 * Lit ce que le voyageur colle : un lien Amap (long ou « marker »), tout le message de partage
 * d'Amap (le lien y est entouré de texte), ou deux nombres « latitude, longitude ».
 * Renvoie null si rien d'exploitable n'est reconnu.
 */
export function lirePosition(texte: string): PositionLue | null {
  const t = texte.trim();
  if (!t) return null;
  const liens = t.match(/https?:\/\/[^\s"'<>，。）)]+/gi) ?? [];
  let court: PositionLue | null = null;
  for (const brut of liens) {
    let url: URL;
    try { url = new URL(brut); } catch { continue; }
    const r = depuisUrl(url);
    if (r?.type === 'coordonnees') return r;
    if (r?.type === 'lien') court ??= r;
  }
  if (court) return court;
  const m = t.match(/(-?\d{1,3}(?:\.\d+)?)\s*[,;/ ]\s*(-?\d{1,3}(?:\.\d+)?)/);
  if (m && /^[\s\d.,;/+-]+$/.test(t.replace(/[°NESWnesw]/g, ''))) {
    const c = orienter(Number(m[1]), Number(m[2]));
    if (c) return { type: 'coordonnees', lat: r6(c.lat), lng: r6(c.lng), source: 'saisie' };
  }
  return null;
}

/** Lien Amap (ouvre l'application si elle est installée) sur un point en WGS84. */
export const lienAmap = ({ lat, lng }: Coordonnees, nom = '') =>
  `https://uri.amap.com/marker?position=${lng.toFixed(6)},${lat.toFixed(6)}${nom ? `&name=${encodeURIComponent(nom)}` : ''}&coordinate=wgs84&callnative=1`;
