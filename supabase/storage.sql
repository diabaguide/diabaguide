-- Photos envoyées par les voyageurs avec leurs propositions.
-- À exécuter dans Supabase → SQL Editor (après admin_roles.sql, qui définit is_team()).
--
-- Bucket privé : les photos ne sont pas vérifiées, elles ne doivent pas être publiques.
-- Chemin attendu : <user_id>/<uuid>.webp — le premier dossier sert aux règles d'accès.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proposal-photos', 'proposal-photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "proposal_photos_insert_own" on storage.objects;
create policy "proposal_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'proposal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "proposal_photos_select_own" on storage.objects;
create policy "proposal_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'proposal-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- L'équipe relit toutes les photos pour vérifier les propositions.
drop policy if exists "proposal_photos_select_team" on storage.objects;
create policy "proposal_photos_select_team" on storage.objects
  for select to authenticated
  using (bucket_id = 'proposal-photos' and public.is_team());

-- Chemins des fichiers dans le bucket, pour que l'équipe puisse les afficher.
alter table public.proposals add column if not exists photo_paths text[] not null default '{}';
alter table public.proposals add column if not exists card_front_path text;
alter table public.proposals add column if not exists card_back_path text;
