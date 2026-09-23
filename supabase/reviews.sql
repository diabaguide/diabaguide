-- ============================================================
-- Diaba Guide — Avis des voyageurs enrichis
--
-- La note par étoiles existait (ratings.sql) : elle devient un véritable
-- avis — commentaire, photos, compteur « utile », et modération par
-- l'équipe. Un avis masqué ne compte plus dans la moyenne de la fiche.
--
-- À exécuter après ratings.sql et storage.sql (nécessite is_team(),
-- is_admin() et la table providers). Idempotent.
-- ============================================================

-- ------------------------------------------------------------
-- L'avis enrichi
-- ------------------------------------------------------------
alter table public.ratings add column if not exists comment text;
alter table public.ratings add column if not exists photos text[] not null default '{}';
alter table public.ratings add column if not exists status text not null default 'published';
alter table public.ratings add column if not exists helpful_count integer not null default 0;
alter table public.ratings add column if not exists author_name text;
alter table public.ratings add column if not exists moderated_by uuid;
alter table public.ratings add column if not exists moderated_at timestamptz;
alter table public.ratings add column if not exists moderation_note text;

-- Le nom affiché est recopié au moment de l'avis : les avis publics n'ont pas
-- besoin d'ouvrir la table profiles.
update public.ratings r set author_name = p.name
  from public.profiles p where p.id = r.user_id and r.author_name is null;
alter table public.ratings alter column author_name set default 'Voyageur';

alter table public.ratings drop constraint if exists ratings_status_check;
alter table public.ratings add constraint ratings_status_check
  check (status in ('published', 'hidden'));

alter table public.ratings drop constraint if exists ratings_comment_len;
alter table public.ratings add constraint ratings_comment_len
  check (comment is null or length(comment) <= 1000);

alter table public.ratings drop constraint if exists ratings_photos_max;
alter table public.ratings add constraint ratings_photos_max
  check (array_length(photos, 1) is null or array_length(photos, 1) <= 3);

-- ------------------------------------------------------------
-- « Utile » : un vote par voyageur et par avis, jamais pour son propre avis
-- ------------------------------------------------------------
create table if not exists public.review_helpful (
  provider_id text not null references public.providers(id) on delete cascade,
  review_user uuid not null,
  voter_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (provider_id, review_user, voter_id)
);
alter table public.review_helpful enable row level security;

-- Les votes suivent l'avis qu'ils notent : supprimer un avis supprime ses votes.
delete from public.review_helpful h
 where not exists (select 1 from public.ratings r
                    where r.provider_id = h.provider_id and r.user_id = h.review_user);

alter table public.review_helpful drop constraint if exists review_helpful_review_user_fkey;
alter table public.review_helpful drop constraint if exists review_helpful_review_fkey;
alter table public.review_helpful
  add constraint review_helpful_review_fkey
  foreign key (provider_id, review_user)
  references public.ratings (provider_id, user_id) on delete cascade;

drop policy if exists "review_helpful_own_rw" on public.review_helpful;
create policy "review_helpful_own_rw" on public.review_helpful
  for all to authenticated
  using (auth.uid() = voter_id)
  with check (auth.uid() = voter_id and auth.uid() <> review_user);

drop policy if exists "review_helpful_staff_read" on public.review_helpful;
create policy "review_helpful_staff_read" on public.review_helpful
  for select to authenticated using (public.is_team());

-- Le compteur affiché sur l'avis suit les votes.
create or replace function public.refresh_review_helpful()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text; ruser uuid;
begin
  pid := coalesce(new.provider_id, old.provider_id);
  ruser := coalesce(new.review_user, old.review_user);
  update public.ratings set helpful_count =
    (select count(*) from public.review_helpful
      where provider_id = pid and review_user = ruser)
   where provider_id = pid and user_id = ruser;
  return null;
end; $$;

drop trigger if exists on_review_helpful_change on public.review_helpful;
create trigger on_review_helpful_change
  after insert or delete on public.review_helpful
  for each row execute function public.refresh_review_helpful();

-- ------------------------------------------------------------
-- Lecture : les avis publiés sont visibles par tous les voyageurs connectés.
-- L'auteur voit toujours le sien (même masqué), l'équipe voit tout.
-- ------------------------------------------------------------
drop policy if exists "ratings_published_read" on public.ratings;
create policy "ratings_published_read" on public.ratings
  for select to authenticated
  using (status = 'published' or auth.uid() = user_id);

drop policy if exists "ratings_staff_read" on public.ratings;
create policy "ratings_staff_read" on public.ratings
  for select to authenticated using (public.is_team());

-- ------------------------------------------------------------
-- La moyenne ne compte que les avis publiés
-- ------------------------------------------------------------
create or replace function public.refresh_provider_rating()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  pid := coalesce(new.provider_id, old.provider_id);
  update public.providers set
    rating_avg = (select round(avg(stars)::numeric, 2) from public.ratings
                   where provider_id = pid and status = 'published'),
    rating_count = (select count(*) from public.ratings
                     where provider_id = pid and status = 'published')
  where id = pid;
  return null;
end; $$;

-- ------------------------------------------------------------
-- Modération, réservée à l'administration
-- ------------------------------------------------------------
create or replace function public.admin_set_review_status(
  p_provider text, p_user uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Seule l’administration peut modérer un avis.'
      using errcode = '42501';
  end if;
  if p_status not in ('published', 'hidden') then
    raise exception 'Statut d’avis inconnu : %', p_status;
  end if;
  update public.ratings
     set status = p_status,
         moderated_by = auth.uid(),
         moderated_at = now(),
         moderation_note = nullif(btrim(coalesce(p_note, '')), '')
   where provider_id = p_provider and user_id = p_user;
  if not found then
    raise exception 'Avis introuvable.';
  end if;
end; $$;

create or replace function public.admin_delete_review(p_provider text, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Seule l’administration peut supprimer un avis.'
      using errcode = '42501';
  end if;
  delete from public.ratings where provider_id = p_provider and user_id = p_user;
  if not found then
    raise exception 'Avis introuvable.';
  end if;
end; $$;

revoke all on function public.admin_set_review_status(text, uuid, text, text) from public, anon;
revoke all on function public.admin_delete_review(text, uuid) from public, anon;
grant execute on function public.admin_set_review_status(text, uuid, text, text) to authenticated;
grant execute on function public.admin_delete_review(text, uuid) to authenticated;

-- ------------------------------------------------------------
-- Photos des avis : bucket privé, chemin <user_id>/<uuid>.<ext>.
-- Les photos accompagnent des avis publiés : tout voyageur connecté peut les
-- afficher, seul l'auteur peut déposer dans son dossier.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('review-photos', 'review-photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "review_photos_insert_own" on storage.objects;
create policy "review_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "review_photos_select_all" on storage.objects;
create policy "review_photos_select_all" on storage.objects
  for select to authenticated using (bucket_id = 'review-photos');

drop policy if exists "review_photos_delete_own" on storage.objects;
create policy "review_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);