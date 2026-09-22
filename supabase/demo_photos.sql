-- ============================================================
-- Photos illustratives pour les 7 fiches de démonstration
-- (mêmes URLs que le repli statique src/data.ts, pour rester cohérent)
-- ============================================================
-- À exécuter dans Supabase → SQL Editor (nécessite service_role ; la
-- clé anon ne peut pas écrire dans providers, voir schema.sql).

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-baiyun-1/640/480',
  'https://picsum.photos/seed/diaba-baiyun-2/640/480',
  'https://picsum.photos/seed/diaba-baiyun-3/640/480'
] where id = 'baiyun';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-zhongda-1/640/480',
  'https://picsum.photos/seed/diaba-zhongda-2/640/480'
] where id = 'zhongda';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-lihua-1/640/480',
  'https://picsum.photos/seed/diaba-lihua-2/640/480'
] where id = 'lihua';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-jinyuan-1/640/480',
  'https://picsum.photos/seed/diaba-jinyuan-2/640/480',
  'https://picsum.photos/seed/diaba-jinyuan-3/640/480'
] where id = 'jinyuan';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-alnour-1/640/480',
  'https://picsum.photos/seed/diaba-alnour-2/640/480'
] where id = 'alnour';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-sinodakar-1/640/480',
  'https://picsum.photos/seed/diaba-sinodakar-2/640/480'
] where id = 'sinodakar';

update public.providers set photo_paths = array[
  'https://picsum.photos/seed/diaba-huaqiang-1/640/480',
  'https://picsum.photos/seed/diaba-huaqiang-2/640/480',
  'https://picsum.photos/seed/diaba-huaqiang-3/640/480'
] where id = 'huaqiang';
