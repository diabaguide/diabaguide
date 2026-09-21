/**
 * Réduit une photo avant envoi : côté long limité à `maxSide` px, réencodée en WebP
 * (JPEG si le navigateur ne sait pas encoder le WebP). Une photo de téléphone de
 * 3 à 8 Mo tombe en général à 100–300 Ko.
 */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export async function compressImage(file: File, maxSide = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Le fichier choisi n’est pas une image.');
  // imageOrientation: EXIF appliqué, pour que les photos de téléphone ne soient pas couchées.
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Traitement de l’image impossible sur cet appareil.');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  // Si le navigateur ne gère pas le WebP, toBlob renvoie du PNG : on bascule alors sur JPEG.
  let out = await encode('image/webp');
  if (!out || out.type !== 'image/webp') out = await encode('image/jpeg');
  if (!out) throw new Error('Compression de l’image impossible.');
  // Ne jamais renvoyer plus lourd que l'original quand aucun redimensionnement n'a eu lieu.
  if (scale === 1 && out.size >= file.size) out = file;
  if (out.size > MAX_UPLOAD_BYTES) throw new Error('Image trop lourde, même après compression.');
  return out;
}
