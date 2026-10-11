-- ============================================================
-- Diaba Guide — Bucket privé `fret-photos` (photos des expéditions)
--
-- Ce bucket existe déjà en production : il avait été créé par le script
-- historique historique/fret_lot2b.sql, qu'il ne faut JAMAIS rejouer. Ce
-- script reprend uniquement cette partie, pour qu'une base neuve puisse
-- l'obtenir sans passer par l'ancien modèle fret.
--
-- Sans effet sur la production : le bucket n'est créé que s'il manque, et
-- chaque règle n'est créée que si aucune règle du même nom n'existe. Rien
-- n'est modifié ni supprimé, y compris les réglages actuels du bucket.
--
-- Règles (identiques à la production) :
--   - lecture : tout utilisateur connecté ;
--   - dépôt   : équipe fret, livreur compris (is_fret, 310_livreur.sql) ;
--   - retrait : équipe seulement (is_team) — le livreur ne supprime pas.
--
-- Dépend de : 020_auth.sql (is_team), 310_livreur.sql (is_fret).
-- Idempotent.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fret-photos', 'fret-photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'fret_photos_select') then
    create policy "fret_photos_select" on storage.objects
      for select to authenticated using (bucket_id = 'fret-photos');
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'fret_photos_insert_fret') then
    create policy "fret_photos_insert_fret" on storage.objects
      for insert to authenticated with check (bucket_id = 'fret-photos' and public.is_fret());
  end if;

  if not exists (select 1 from pg_policies
                 where schemaname = 'storage' and tablename = 'objects'
                   and policyname = 'fret_photos_delete_team') then
    create policy "fret_photos_delete_team" on storage.objects
      for delete to authenticated using (bucket_id = 'fret-photos' and public.is_team());
  end if;
end $$;
