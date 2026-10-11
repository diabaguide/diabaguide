-- Photos des fiches publiées (visibles par les voyageurs connectés, gérées par l'équipe).
-- À exécuter dans Supabase → SQL Editor. Relançable sans risque.

alter table public.providers add column if not exists photo_paths text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fiche-photos', 'fiche-photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Tout compte connecté peut afficher les photos des fiches ; l'équipe les ajoute et les retire.
drop policy if exists "fiche_photos_select" on storage.objects;
create policy "fiche_photos_select" on storage.objects
  for select to authenticated using (bucket_id = 'fiche-photos');

drop policy if exists "fiche_photos_insert_team" on storage.objects;
create policy "fiche_photos_insert_team" on storage.objects
  for insert to authenticated with check (bucket_id = 'fiche-photos' and public.is_team());

drop policy if exists "fiche_photos_delete_team" on storage.objects;
create policy "fiche_photos_delete_team" on storage.objects
  for delete to authenticated using (bucket_id = 'fiche-photos' and public.is_team());
