-- ============================================================
-- Photos illustratives pour les 11 nouvelles fiches Guangzhou/Shenzhen
-- (voir supabase/insert_gz_sz_providers.sql)
-- ============================================================
-- À exécuter dans Supabase → SQL Editor (écriture réservée à
-- service_role ; la clé anon ne peut pas écrire dans providers).
--
-- ⚠️ Contrairement aux fiches de démonstration (supabase/demo_photos.sql),
-- ce sont de VRAIS marchés. Faute de photo réelle du lieu, ces images
-- (Lorem Picsum, génériques) ne montrent PAS le marché en question : elles
-- comblent juste l'absence de visuel en attendant une vraie photo. À
-- remplacer dès que possible par l'équipe via /equipe/fiches (modification
-- d'une fiche → section Photos), qui écrasera ces placeholders.

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-baima-clothing-1/640/480',
  'https://picsum.photos/seed/diaba-gz-baima-clothing-2/640/480'
] where id = 'gz-baima-clothing';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-shahe-clothing-1/640/480',
  'https://picsum.photos/seed/diaba-gz-shahe-clothing-2/640/480'
] where id = 'gz-shahe-clothing';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-shisanhang-clothing-1/640/480',
  'https://picsum.photos/seed/diaba-gz-shisanhang-clothing-2/640/480'
] where id = 'gz-shisanhang-clothing';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-liwan-toys-1/640/480',
  'https://picsum.photos/seed/diaba-gz-liwan-toys-2/640/480'
] where id = 'gz-liwan-toys';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-sanyuanli-leather-1/640/480',
  'https://picsum.photos/seed/diaba-gz-sanyuanli-leather-2/640/480'
] where id = 'gz-sanyuanli-leather';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-gz-beauty-exchange-center-1/640/480',
  'https://picsum.photos/seed/diaba-gz-beauty-exchange-center-2/640/480'
] where id = 'gz-beauty-exchange-center';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sz-hq-mart-1/640/480',
  'https://picsum.photos/seed/diaba-sz-hq-mart-2/640/480'
] where id = 'sz-hq-mart';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sz-seg-electronics-1/640/480',
  'https://picsum.photos/seed/diaba-sz-seg-electronics-2/640/480'
] where id = 'sz-seg-electronics';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sz-yuanwang-digital-1/640/480',
  'https://picsum.photos/seed/diaba-sz-yuanwang-digital-2/640/480'
] where id = 'sz-yuanwang-digital';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sz-mingtong-digital-1/640/480',
  'https://picsum.photos/seed/diaba-sz-mingtong-digital-2/640/480'
] where id = 'sz-mingtong-digital';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sz-huaqiangbei-women-world-1/640/480',
  'https://picsum.photos/seed/diaba-sz-huaqiangbei-women-world-2/640/480'
] where id = 'sz-huaqiangbei-women-world';
