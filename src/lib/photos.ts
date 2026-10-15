import { supabase } from './supabase';
import { optimizeImage, toWebp } from './image';
import { THUMB_MAX_SIDE, isThumbPath, thumbPath } from './photoPaths';
import { createPhotoUrlBatcher, mapPhotoUrlBatchResults, type PhotoUrlBatchResult } from './photoUrlBatcher';

export type PhotoBucket = 'proposal-photos' | 'fiche-photos' | 'review-photos' | 'fret-photos' | 'avatars' | 'annonces-photos';

/** Buckets dont les règles d'accès exigent un dossier au nom du voyageur. */
const dossierUtilisateur: PhotoBucket[] = ['proposal-photos', 'review-photos', 'avatars'];

/**
 * Envoie une photo (déjà compressée) dans le bucket privé.
 * Chemin : <user_id>/<uuid>.<ext> — le dossier utilisateur est exigé par les règles d'accès.
 * Sans Supabase (mode démonstration), ne fait rien et réussit.
 */
export async function uploadPhoto(blob: Blob, bucket: PhotoBucket = 'proposal-photos'): Promise<{ path?: string; error?: string }> {
  if (!supabase) return {};
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Connectez-vous pour envoyer une photo.' };
  const dossier = dossierUtilisateur.includes(bucket) ? session.user.id + '/' : '';
  const envoyer = async (b: Blob) => {
    const ext = b.type === 'image/avif' ? 'avif' : b.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${dossier}${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase!.storage.from(bucket).upload(path, b, { contentType: b.type });
    return { path, error };
  };
  let { path, error } = await envoyer(blob);
  // AVIF refusé (bucket qui ne l'autorise pas encore) : repli automatique en WebP.
  if (error && blob.type === 'image/avif' && /mime|type|not supported|invalid/i.test(error.message)) {
    try { ({ path, error } = await envoyer(await toWebp(blob))); } catch { /* on garde l'erreur d'origine */ }
  }
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Diaba Guide] Échec : envoi de la photo.', error);
    }
    return { error: 'L’envoi de la photo a échoué. Réessayez.' };
  }
  // Photos de fiches : on crée aussi la vignette des listes (au mieux : si elle
  // échoue, les listes utilisent l’original).
  if (bucket === 'fiche-photos') await uploadThumb(blob, path);
  return { path };
}

/** Crée la vignette (WebP, 320 px) d'une photo de fiche. Sans effet sur l'envoi si elle échoue. */
async function uploadThumb(source: Blob, path: string): Promise<void> {
  try {
    const small = await optimizeImage(source, { maxSide: THUMB_MAX_SIDE, quality: 0.7, formats: ['image/webp'], force: true });
    // Navigateur sans encodeur WebP : pas de vignette (le nom '-sm.webp' exige du WebP).
    if (small.type !== 'image/webp') return;
    await supabase!.storage.from('fiche-photos').upload(thumbPath(path), small, { contentType: 'image/webp' });
  } catch { /* l'original sert de repli */ }
}

/**
 * Supprime un fichier du stockage, sans bruit : un échec (fichier déjà parti,
 * ou rangé hors du dossier de la personne) ne doit jamais bloquer un
 * enregistrement de profil.
 */
export async function removePhoto(path: string | null | undefined, bucket: PhotoBucket): Promise<void> {
  if (!supabase || !path) return;
  const aSupprimer = bucket === 'fiche-photos' && !isThumbPath(path) ? [path, thumbPath(path)] : [path];
  try { await supabase.storage.from(bucket).remove(aSupprimer); } catch { /* sans conséquence */ }
}

/**
 * Durée de validité des URL d'affichage, selon le bucket.
 *  - fiche-photos (annuaire) : 7 jours. L'URL est réutilisée telle quelle, donc le
 *    cache du navigateur peut vraiment resservir l'image sans la retélécharger.
 *  - tous les autres (avis, avatars, propositions, photos d'expéditions) : 1 heure,
 *    comme avant. Ces photos sont privées : on ne prolonge pas leur lien.
 */
const LONG_TTL: PhotoBucket[] = ['fiche-photos', 'annonces-photos'];
export const ttlFor = (bucket: PhotoBucket) => (LONG_TTL.includes(bucket) ? 604800 : 3600);

/* Cache des URL signées : en mémoire (instantané) pour tous les buckets ; dans le
   navigateur (localStorage) seulement pour les buckets à longue durée, afin que
   les images déjà vues s'affichent sans aller-retour réseau, même après un retour
   en arrière ou une nouvelle visite. */
type UrlEntry = { url: string; exp: number };
const MEM = new Map<string, UrlEntry>();
/* Demandes de lien en cours : deux composants qui veulent la même photo au même
   instant partagent une demande, et les chemins voisins sont signés ensemble. */
const PENDING = new Map<string, Promise<PhotoUrlBatchResult>>();
type UrlBatchRequest = (path: string) => Promise<PhotoUrlBatchResult>;
const URL_BATCHERS = new Map<string, UrlBatchRequest>();
function urlBatcher(bucket: PhotoBucket, ttl: number): UrlBatchRequest {
  const key = `${bucket}|${ttl}`;
  const cached = URL_BATCHERS.get(key);
  if (cached) return cached;
  const request = createPhotoUrlBatcher(async (paths) => {
    if (!supabase) return new Map<string, PhotoUrlBatchResult>();
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, ttl);
    if (error || !data) return new Map<string, PhotoUrlBatchResult>();
    return mapPhotoUrlBatchResults(paths, data);
  });
  URL_BATCHERS.set(key, request);
  return request;
}
const LS_KEY = 'diaba-photo-urls-v1';
const MAX_ENTRIES = 400;
let lsLoaded = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const persisted = (key: string) => LONG_TTL.some((b) => key.startsWith(b + '|'));

function loadCache(): void {
  if (lsLoaded) return;
  lsLoaded = true;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, UrlEntry>;
    const now = Date.now();
    for (const [k, v] of Object.entries(obj)) if (v && v.exp > now && persisted(k)) MEM.set(k, v);
  } catch { /* stockage indisponible : on garde le cache mémoire seul */ }
}

function saveCacheSoon(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const now = Date.now();
      let entries = [...MEM].filter(([k, v]) => persisted(k) && v.exp > now);
      // Garder les plus récemment valables si le cache grossit trop.
      if (entries.length > MAX_ENTRIES) entries = entries.sort((a, b) => b[1].exp - a[1].exp).slice(0, MAX_ENTRIES);
      localStorage.setItem(LS_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch { /* quota ou stockage indisponible : on ignore */ }
  }, 1500);
}

/** URL pour afficher une photo privée, mise en cache (voir ttlFor). */
async function photoUrlResult(path: string, seconds?: number, bucket: PhotoBucket = 'proposal-photos'): Promise<PhotoUrlBatchResult> {
  if (!supabase) return { url: null, missing: false };
  loadCache();
  const ttl = seconds ?? ttlFor(bucket);
  const key = `${bucket}|${path}`;
  const hit = MEM.get(key);
  // Réutiliser l'URL en cache tant qu'il lui reste plus d'une minute de validité.
  if (hit && hit.exp > Date.now() + 60_000) return { url: hit.url, missing: false };
  const enCours = PENDING.get(key);
  if (enCours) return enCours;
  const demande = urlBatcher(bucket, ttl)(path).then((result) => {
    if (!result.url) return { url: hit?.url ?? null, missing: result.missing };
    MEM.set(key, { url: result.url, exp: Date.now() + ttl * 1000 - 120_000 });
    if (persisted(key)) saveCacheSoon();
    return { url: result.url, missing: false };
  }).finally(() => PENDING.delete(key));
  PENDING.set(key, demande);
  return demande;
}

export async function photoUrl(path: string, seconds?: number, bucket: PhotoBucket = 'proposal-photos'): Promise<string | null> {
  return (await photoUrlResult(path, seconds, bucket)).url;
}

/* ---------- Vignettes (listes) ---------- */

/* Vignettes introuvables : on s'en souvient 1 h (mémoire + localStorage) pour ne pas
   redemander, à chaque affichage d'une liste, un lien qui échouera. Tant que le
   script de réencodage n'a pas créé les vignettes, cela évite de doubler les requêtes. */
const MISS_TTL = 3600_000;
const MISS_KEY = 'diaba-photo-miss-v1';
const MISS = new Map<string, number>();
let missLoaded = false;
let missTimer: ReturnType<typeof setTimeout> | null = null;

function loadMiss(): void {
  if (missLoaded) return;
  missLoaded = true;
  try {
    const obj = JSON.parse(localStorage.getItem(MISS_KEY) ?? '{}') as Record<string, number>;
    const now = Date.now();
    for (const [k, exp] of Object.entries(obj)) if (exp > now) MISS.set(k, exp);
  } catch { /* stockage indisponible */ }
}

/** Note qu'une photo n'a pas (encore) de vignette. */
export function markThumbMissing(path: string, bucket: PhotoBucket = 'fiche-photos'): void {
  loadMiss();
  MISS.set(`${bucket}|${path}`, Date.now() + MISS_TTL);
  if (missTimer) return;
  missTimer = setTimeout(() => {
    missTimer = null;
    try {
      const now = Date.now();
      localStorage.setItem(MISS_KEY, JSON.stringify(Object.fromEntries([...MISS].filter(([, exp]) => exp > now).slice(-500))));
    } catch { /* quota ou stockage indisponible */ }
  }, 1500);
}

/**
 * Lien de la vignette d'une photo de fiche, ou null si elle n'existe pas (l'appelant
 * utilise alors l'original). Sans Supabase, pour une URL http ou pour une vignette
 * déjà : null.
 */
export async function photoThumbUrl(path: string, bucket: PhotoBucket = 'fiche-photos'): Promise<string | null> {
  if (!supabase || /^https?:/i.test(path) || isThumbPath(path)) return null;
  loadMiss();
  const miss = MISS.get(`${bucket}|${path}`);
  if (miss && miss > Date.now()) return null;
  const result = await photoUrlResult(thumbPath(path), undefined, bucket);
  if (result.missing) markThumbMissing(path, bucket);
  return result.url;
}
