-- ============================================================
-- Diaba Guide — Suivi de fret Chine / Sénégal
-- Lot 2b : le détail d'un lot (articles en lignes, CBM, photo)
--
-- À exécuter APRÈS, dans cet ordre (les préalables réellement utilisés ici) :
--   1. supabase/auth.sql            → public.is_team(), public.is_admin(), profiles
--   2. supabase/shopping_lists.sql  → public.touch_updated_at()
--   3. supabase/fret_tracking.sql   → public.expeditions, public.expedition_etapes
--
-- Idempotent : relançable sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Deux champs de plus sur le lot
--    • cbm   : nombre de mètres cubes (facultatif, jamais négatif) ;
--    • photo : chemin dans le bucket privé `fret-photos` (section 6).
-- ------------------------------------------------------------
alter table public.expeditions add column if not exists cbm   numeric;
alter table public.expeditions add column if not exists photo text;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'expeditions_cbm_check'
                    and conrelid = 'public.expeditions'::regclass) then
    alter table public.expeditions
      add constraint expeditions_cbm_check check (cbm is null or cbm >= 0);
  end if;
end $$;

-- fret_tracking.sql a retiré le droit de lire `expeditions` en bloc pour le
-- remplacer par une liste de colonnes (afin que `notes` reste à l'équipe).
-- Les colonnes ajoutées après coup n'héritent d'AUCUN droit : sans ces deux
-- lignes, ni la console ni le voyageur ne verraient le CBM ni la photo.
grant select (cbm, photo) on public.expeditions to authenticated;

-- ------------------------------------------------------------
-- 2. Les articles transportés, en lignes
--    Même modèle d'accès que `expedition_etapes` : lecture par le
--    propriétaire du lot et par l'équipe, AUCUNE politique d'écriture —
--    tout passe par les fonctions admin_* (section 3).
-- ------------------------------------------------------------
create table if not exists public.expedition_articles (
  id            uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  nom           text not null,
  quantite      numeric not null default 1 check (quantite > 0),
  poids         numeric check (poids is null or poids >= 0),
  created_at    timestamptz not null default now()
);

create index if not exists expedition_articles_idx
  on public.expedition_articles (expedition_id);

alter table public.expedition_articles enable row level security;

-- Écriture refusée au niveau du PRIVILÈGE, pas seulement de la RLS : une
-- erreur de privilège (42501) dit clairement « interdit » là où une
-- politique manquante se lirait comme un simple oubli de configuration.
revoke all on public.expedition_articles from anon, authenticated;
grant select on public.expedition_articles to authenticated;

drop policy if exists "expedition_articles_owner_read" on public.expedition_articles;
create policy "expedition_articles_owner_read" on public.expedition_articles
  for select to authenticated using (
    exists (select 1 from public.expeditions e
             where e.id = expedition_articles.expedition_id and e.user_id = auth.uid()));

drop policy if exists "expedition_articles_staff_read" on public.expedition_articles;
create policy "expedition_articles_staff_read" on public.expedition_articles
  for select to authenticated using (public.is_team());

-- ------------------------------------------------------------
-- 3. Ajouter, corriger, retirer une ligne d'article (administration)
-- ------------------------------------------------------------
create or replace function public.admin_ajouter_article(
  p_expedition_id uuid,
  p_nom           text,
  p_quantite      numeric,
  p_poids         numeric
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'Le nom de l''article est obligatoire';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro';
  end if;
  if p_poids is not null and p_poids < 0 then
    raise exception 'Le poids ne peut pas être négatif';
  end if;
  if not exists (select 1 from public.expeditions where id = p_expedition_id) then
    raise exception 'Expédition introuvable';
  end if;

  insert into public.expedition_articles (expedition_id, nom, quantite, poids)
  values (p_expedition_id, btrim(p_nom), p_quantite, p_poids)
  returning expedition_articles.id into v_id;

  return v_id;
end; $$;

revoke all on function public.admin_ajouter_article(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.admin_ajouter_article(uuid, text, numeric, numeric) to authenticated;

-- Les trois valeurs REMPLACENT celles de la ligne : la console envoie la ligne
-- entière, telle qu'elle s'affiche. Un poids nul efface donc le poids.
create or replace function public.admin_maj_article(
  p_id       uuid,
  p_nom      text,
  p_quantite numeric,
  p_poids    numeric
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_nom is null or btrim(p_nom) = '' then
    raise exception 'Le nom de l''article est obligatoire';
  end if;
  if p_quantite is null or p_quantite <= 0 then
    raise exception 'La quantité doit être supérieure à zéro';
  end if;
  if p_poids is not null and p_poids < 0 then
    raise exception 'Le poids ne peut pas être négatif';
  end if;

  update public.expedition_articles
     set nom = btrim(p_nom), quantite = p_quantite, poids = p_poids
   where id = p_id;

  if not found then
    raise exception 'Article introuvable';
  end if;
end; $$;

revoke all on function public.admin_maj_article(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.admin_maj_article(uuid, text, numeric, numeric) to authenticated;

create or replace function public.admin_supprimer_article(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;

  delete from public.expedition_articles where id = p_id;

  if not found then
    raise exception 'Article introuvable';
  end if;
end; $$;

revoke all on function public.admin_supprimer_article(uuid) from public, anon;
grant execute on function public.admin_supprimer_article(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. admin_maj_expedition accepte le CBM et la photo
--
--    ATTENTION : `create or replace function` avec une liste d'arguments
--    DIFFÉRENTE ne remplace rien — il crée une SURCHARGE, et l'ancienne
--    version resterait appelable. Il faut donc la supprimer d'abord, en
--    nommant sa liste exacte. Le test vérifie qu'il ne reste qu'UNE seule
--    fonction de ce nom dans pg_proc.
--
--    Un paramètre nul laisse la colonne inchangée (la console n'envoie que
--    ce qu'elle modifie) ; un chemin de photo VIDE (« ») la retire.
-- ------------------------------------------------------------
drop function if exists public.admin_maj_expedition(
  uuid, text, text, text, text, date, date, date, text, integer, text);

create or replace function public.admin_maj_expedition(
  p_id             uuid,
  p_conteneur      text    default null,
  p_articles       text    default null,
  p_poids          text    default null,
  p_provider_id    text    default null,
  p_depart_le      date    default null,
  p_arrivee_prevue date    default null,
  p_arrivee_le     date    default null,
  p_notes          text    default null,
  p_shipsgo_id     integer default null,
  p_shipsgo_type   text    default null,
  p_cbm            numeric default null,
  p_photo          text    default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  -- Même garde qu'à la création : seules les fiches de transitaire sont
  -- publiées par `suivi_public`.
  if p_provider_id is not null and not exists (
       select 1 from public.providers pr where pr.id = p_provider_id and pr.cat = 'transitaire') then
    raise exception 'Le prestataire % n''est pas un transitaire', p_provider_id;
  end if;

  update public.expeditions set
    conteneur      = coalesce(p_conteneur, conteneur),
    articles       = coalesce(p_articles, articles),
    poids          = coalesce(p_poids, poids),
    provider_id    = coalesce(p_provider_id, provider_id),
    depart_le      = coalesce(p_depart_le, depart_le),
    arrivee_prevue = coalesce(p_arrivee_prevue, arrivee_prevue),
    arrivee_le     = coalesce(p_arrivee_le, arrivee_le),
    notes          = coalesce(p_notes, notes),
    shipsgo_id     = coalesce(p_shipsgo_id, shipsgo_id),
    shipsgo_type   = coalesce(p_shipsgo_type, shipsgo_type),
    cbm            = coalesce(p_cbm, cbm),
    photo          = coalesce(p_photo, photo)
  where id = p_id;

  if not found then
    raise exception 'Expédition introuvable';
  end if;
end; $$;

revoke all on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text, numeric, text) from public, anon;
grant execute on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text, numeric, text) to authenticated;

-- ------------------------------------------------------------
-- 5. La photo du lot : bucket privé `fret-photos`
--    Calqué sur `fiche_photos.sql` : l'équipe dépose, lit et retire ;
--    personne d'autre n'écrit.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fret-photos', 'fret-photos', false, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "fret_photos_select" on storage.objects;
create policy "fret_photos_select" on storage.objects
  for select to authenticated using (bucket_id = 'fret-photos');

drop policy if exists "fret_photos_insert_team" on storage.objects;
create policy "fret_photos_insert_team" on storage.objects
  for insert to authenticated with check (bucket_id = 'fret-photos' and public.is_team());

drop policy if exists "fret_photos_delete_team" on storage.objects;
create policy "fret_photos_delete_team" on storage.objects
  for delete to authenticated using (bucket_id = 'fret-photos' and public.is_team());
