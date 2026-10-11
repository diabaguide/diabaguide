/**
 * Optimisation d'une image avant envoi : redimensionnée (côté long limité) puis
 * réencodée dans le format le plus léger que le navigateur sait produire —
 * AVIF d'abord (le plus compact), sinon WebP, sinon JPEG. Pensé pour que les
 * fiches se chargent vite, surtout sur mobile et sur réseau lent.
 *
 * Une photo de téléphone de 3 à 8 Mo tombe en général à quelques dizaines de Ko.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Formats de sortie, du plus léger au plus compatible. */
const FORMATS = ['image/avif', 'image/webp', 'image/jpeg'] as const;
export type ImageType = (typeof FORMATS)[number];

/* Détection (une seule fois par format) de ce que le navigateur sait encoder :
   un test sur un canvas de 1 px. Évite d'encoder pour rien une grande image en
   PNG quand le format demandé (AVIF, souvent) n'est pas géré. */
const CAN_ENCODE = new Map<string, Promise<boolean>>();
function canEncode(type: ImageType): Promise<boolean> {
  let known = CAN_ENCODE.get(type);
  if (!known) {
    known = new Promise<boolean>((res) => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        c.toBlob((b) => res(!!b && b.type === type), type, 0.5);
      } catch { res(false); }
    });
    CAN_ENCODE.set(type, known);
  }
  return known;
}

export interface OptimizeOptions {
  /** Côté le plus long, en pixels (l'image n'est jamais agrandie). */
  maxSide?: number;
  /** Qualité 0–1. À qualité égale, AVIF < WebP < JPEG en poids. */
  quality?: number;
  /** Formats à tenter, dans l'ordre. Par défaut : AVIF, puis WebP, puis JPEG. */
  formats?: readonly ImageType[];
  /** Toujours réencoder, même si l'original est plus léger (pour changer de format). */
  force?: boolean;
}

/**
 * Réduit et réencode une image. Choisit automatiquement le format : le premier
 * de `formats` que le navigateur sait vraiment encoder (il renvoie du PNG quand
 * il ne sait pas). Ne renvoie jamais un fichier plus lourd que l'original quand
 * aucun redimensionnement n'a eu lieu, ni plus lourd que la limite d'envoi.
 */
export async function optimizeImage(file: Blob, { maxSide = 1280, quality = 0.72, formats = FORMATS, force = false }: OptimizeOptions = {}): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier choisi n’est pas une image.');
  // imageOrientation : EXIF appliqué, pour que les photos de téléphone ne soient pas couchées.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) { bmp.close(); throw new Error('Traitement de l’image impossible sur cet appareil.'); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const encode = (type: ImageType) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  // On garde le premier format demandé que le navigateur produit réellement
  // (toBlob renvoie du PNG, donc un type différent, quand il ne sait pas encoder).
  let out: Blob | null = null;
  for (const type of formats) {
    if (!(await canEncode(type))) continue;
    const blob = await encode(type);
    if (blob && blob.type === type) { out = blob; break; }
  }
  if (!out) out = await encode('image/jpeg');
  if (!out) throw new Error('Compression de l’image impossible.');

  // Si l'image n'a pas été réduite et que l'original est déjà plus léger, le garder
  // (sauf si on force un réencodage pour changer de format).
  if (!force && scale === 1 && out.size >= file.size && file.type !== 'image/png') out = file;
  if (out.size > MAX_UPLOAD_BYTES) throw new Error('Image trop lourde, même après compression.');
  return out;
}

/**
 * Compatibilité : ancienne signature, redirigée vers `optimizeImage`.
 * Les appels existants bénéficient ainsi d'AVIF/WebP sans changement.
 */
export function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<Blob> {
  return optimizeImage(file, { maxSide, quality });
}

/**
 * Réencode une image déjà préparée en WebP, sans la redimensionner. Sert de repli
 * quand l'AVIF est refusé à l'envoi (bucket qui ne l'autorise pas encore).
 */
export function toWebp(blob: Blob): Promise<Blob> {
  return optimizeImage(blob, { maxSide: 1_000_000, quality: 0.8, formats: ['image/webp', 'image/jpeg'], force: true });
}
