import { supabase } from './supabase';
import { toWebp } from './image';

export type PhotoBucket = 'proposal-photos' | 'fiche-photos' | 'review-photos' | 'fret-photos' | 'avatars';

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
  return { path };
}

/**
 * Supprime un fichier du stockage, sans bruit : un échec (fichier déjà parti,
 * ou rangé hors du dossier de la personne) ne doit jamais bloquer un
 * enregistrement de profil.
 */
export async function removePhoto(path: string | null | undefined, bucket: PhotoBucket): Promise<void> {
  if (!supabase || !path) return;
  try { await supabase.storage.from(bucket).remove([path]); } catch { /* sans conséquence */ }
}

/**
 * Durée de validité des URL d'affichage, selon le bucket.
 *  - fiche-photos (annuaire) : 7 jours. L'URL est réutilisée telle quelle, donc le
 *    cache du navigateur peut vraiment resservir l'image sans la retélécharger.
 *  - tous les autres (avis, avatars, propositions, photos d'expéditions) : 1 heure,
 *    comme avant. Ces photos sont privées : on ne prolonge pas leur lien.
 */
const LONG_TTL: PhotoBucket[] = ['fiche-photos'];
export const ttlFor = (bucket: PhotoBucket) => (LONG_TTL.includes(bucket) ? 604800 : 3600);

/* Cache des URL signées : en mémoire (instantané) pour tous les buckets ; dans le
   navigateur (localStorage) seulement pour les buckets à longue durée, afin que
   les images déjà vues s'affichent sans aller-retour réseau, même après un retour
   en arrière ou une nouvelle visite. */
type UrlEntry = { url: string; exp: number };
const MEM = new Map<string, UrlEntry>();
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
export async function photoUrl(path: string, seconds?: number, bucket: PhotoBucket = 'proposal-photos'): Promise<string | null> {
  if (!supabase) return null;
  loadCache();
  const ttl = seconds ?? ttlFor(bucket);
  const key = `${bucket}|${path}`;
  const hit = MEM.get(key);
  // Réutiliser l'URL en cache tant qu'il lui reste plus d'une minute de validité.
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl);
  if (error || !data) return hit?.url ?? null;
  MEM.set(key, { url: data.signedUrl, exp: Date.now() + ttl * 1000 - 120_000 });
  if (persisted(key)) saveCacheSoon();
  return data.signedUrl;
}
