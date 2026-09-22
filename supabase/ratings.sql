-- ============================================================
-- Diaba Guide — Notation des fiches par étoiles (1 à 5)
-- Chaque voyageur connecté peut noter une fiche ; une nouvelle note
-- remplace la précédente (pas de doublon). La moyenne et le nombre
-- d'avis sont recalculés automatiquement sur providers.rating_avg /
-- providers.rating_count via un trigger, pour un affichage sans
-- agrégation côté client.
-- À exécuter après security_fixes.sql (nécessite providers). Idempotent.
-- ============================================================

alter table public.providers add column if not exists rating_avg numeric(3,2);
alter table public.providers add column if not exists rating_count integer not null default 0;

create table if not exists public.ratings (
  provider_id text not null references public.providers(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stars       smallint not null check (stars between 1 and 5),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (provider_id, user_id)
);
alter table public.ratings enable row level security;

-- Chacun lit et modifie uniquement sa propre note.
drop policy if exists "ratings_own_rw" on public.ratings;
create policy "ratings_own_rw" on public.ratings
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Recalcule la moyenne et le nombre d'avis d'une fiche après chaque écriture.
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  pid := coalesce(new.provider_id, old.provider_id);
  update public.providers set
    rating_avg = (select round(avg(stars)::numeric, 2) from public.ratings where provider_id = pid),
    rating_count = (select count(*) from public.ratings where provider_id = pid)
  where id = pid;
  return null;
end; $$;

drop trigger if exists on_rating_change on public.ratings;
create trigger on_rating_change
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_provider_rating();

-- Maintient updated_at à jour quand un voyageur change sa note.
create or replace function public.touch_rating()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists on_rating_update on public.ratings;
create trigger on_rating_update
  before update on public.ratings
  for each row execute function public.touch_rating();
