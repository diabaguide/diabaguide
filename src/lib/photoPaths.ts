/**
 * Convention de nom des vignettes de photos de fiches (bucket `fiche-photos`).
 *
 * La vignette de `<nom>.<ext>` est `<nom>-sm.webp`, rangée à côté de l'original :
 * `3f2a….jpg` → `3f2a…-sm.webp`. Elle est toujours en WebP et fait au plus 320 px.
 * Les listes (Explorer, accueil, favoris…) l'utilisent à la place de l'original
 * quand elle existe, et retombent sur l'original sinon.
 *
 * Module sans dépendance : il est testé seul (scripts/photo-paths.test.mjs). Le
 * script scripts/reencode-fiche-photos.mjs applique la même convention.
 */

/** Côté le plus long d'une vignette, en pixels. */
export const THUMB_MAX_SIDE = 320;

/** Une vignette (et non un original) ? */
export const isThumbPath = (path: string): boolean => /-sm\.webp$/i.test(path);

/** Chemin de la vignette d'une photo. Idempotent : la vignette d'une vignette est elle-même. */
export function thumbPath(path: string): string {
  if (isThumbPath(path)) return path;
  return `${path.replace(/\.[A-Za-z0-9]+$/, '')}-sm.webp`;
}
