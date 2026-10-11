-- ============================================================
-- Diaba Guide — Autoriser le format AVIF dans les buckets de photos
--
-- Les photos sont maintenant réencodées en AVIF (le plus léger), avec repli
-- automatique sur WebP puis JPEG. Les buckets n'autorisaient que `image/webp`
-- et `image/jpeg` : sans ce script, l'AVIF est refusé à l'envoi. L'application
-- se rabat alors sur le WebP toute seule, donc rien ne casse si ce script n'est
-- pas lancé — il permet seulement d'envoyer les photos directement en AVIF.
--
-- Ajout uniquement : `image/avif` est ajouté à la liste existante de chaque
-- bucket, sans rien retirer. Les photos déjà stockées ne sont pas touchées.
-- Les buckets absents (base neuve) sont ignorés.
--
-- Dépend de : 070_storage.sql, 090_fiche_photos.sql, 170_reviews.sql,
-- 320_member_profile.sql, 480_fret_photos_bucket.sql.
-- Idempotent.
-- ============================================================

update storage.buckets
   set allowed_mime_types = array_append(coalesce(allowed_mime_types, '{}'), 'image/avif')
 where id in ('proposal-photos', 'fiche-photos', 'review-photos', 'fret-photos', 'avatars')
   and allowed_mime_types is not null
   and not ('image/avif' = any (allowed_mime_types));
