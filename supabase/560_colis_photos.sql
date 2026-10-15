-- Diaba Guide — Photos des colis (ajoutées par l'équipe fret).
-- Additif : aucune table existante n'est modifiée. Idempotent.
-- Les fichiers sont dans le bucket privé `fret-photos` (480_fret_photos_bucket.sql).

create table if not exists public.colis_photos (
  id uuid primary key default gen_random_uuid(),
  colis_code text not null references public.colis(code) on delete cascade,
  path text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
create index if not exists colis_photos_colis_idx on public.colis_photos (colis_code, created_at);

alter table public.colis_photos enable row level security;

drop policy if exists "colis_photos_fret_all" on public.colis_photos;
create policy "colis_photos_fret_all" on public.colis_photos
  for all to authenticated using (public.is_fret()) with check (public.is_fret());

-- Le voyageur lit uniquement les photos de SES colis.
drop policy if exists "colis_photos_owner_read" on public.colis_photos;
create policy "colis_photos_owner_read" on public.colis_photos
  for select to authenticated using (
    exists (select 1 from public.colis c
            where c.code = colis_photos.colis_code and c.profile_id = auth.uid())
  );

revoke all on public.colis_photos from anon;
grant select, insert, delete on public.colis_photos to authenticated;
