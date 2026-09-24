-- ============================================================
-- Diaba Guide — Suivi de fret Chine / Sénégal
-- Lot 1 : schéma. À exécuter après security_fixes.sql (is_team()).
-- Idempotent : peut être relancé sans risque.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Cycle de vie d'un lot — l'ORDRE de l'enum est l'ordre du
--    cycle de vie : on compare deux statuts avec < et >,
--    sans table de rangs.
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'statut_expedition') then
    create type public.statut_expedition as enum
      ('preparation', 'regroupage', 'embarque', 'transit', 'douane', 'arrive', 'livre');
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. Les expéditions : un lot = un conteneur ou un envoi aérien
-- ------------------------------------------------------------
create table if not exists public.expeditions (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,                 -- DIA-AAAA-NNNN, dictable au téléphone
  user_id         uuid not null references auth.users(id) on delete cascade,
  provider_id     text references public.providers(id) on delete set null,
  fret            text not null check (fret in ('air', 'sea')),
  origine         text not null check (origine in ('Guangzhou', 'Shenzhen')),
  conteneur       text,                                 -- n° de conteneur ou n° AWB
  shipsgo_id      integer unique,                       -- nul tant que le suivi auto n'est pas branché
  shipsgo_type    text check (shipsgo_type in ('ocean', 'air')),
  sync_le         timestamptz,
  articles        text,
  poids           text,
  depart_le       date,
  arrivee_prevue  date,
  arrivee_le      date,
  statut          public.statut_expedition not null default 'preparation',
  list_id         uuid references public.shopping_lists(id) on delete set null,
  notes           text,                                 -- notes internes, jamais publiques
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists expeditions_user_idx  on public.expeditions (user_id, created_at desc);
create index if not exists expeditions_statut_idx on public.expeditions (statut, arrivee_prevue);

-- ------------------------------------------------------------
-- 3. Les étapes : la frise du lot
--    La clé étrangère pointe la table PARENTE : supprimer un lot
--    efface ses étapes (une clé vers auth.users seul ne le ferait pas).
-- ------------------------------------------------------------
create table if not exists public.expedition_etapes (
  id            uuid primary key default gen_random_uuid(),
  expedition_id uuid not null references public.expeditions(id) on delete cascade,
  statut        public.statut_expedition not null,
  lieu          text,
  note          text,
  photo         text,
  publique      boolean not null default true,
  source        text not null default 'equipe' check (source in ('equipe', 'shipsgo')),
  ref_shipsgo   text,
  created_at    timestamptz not null default now()
);

create index if not exists expedition_etapes_idx
  on public.expedition_etapes (expedition_id, created_at desc);

-- Un même mouvement ShipsGo ne doit produire qu'une seule étape
-- (ShipsGo réessaie jusqu'à 3 fois une livraison de webhook).
create unique index if not exists expedition_etapes_shipsgo_uniq
  on public.expedition_etapes (expedition_id, ref_shipsgo)
  where ref_shipsgo is not null;

-- ------------------------------------------------------------
-- 4. Le statut du lot = le plus avancé de ses étapes.
--    « plus avancé » s'appuie sur l'ORDRE de l'enum : max() suffit.
-- ------------------------------------------------------------
create or replace function public.refresh_expedition_statut()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_exp uuid := coalesce(new.expedition_id, old.expedition_id);
  v_statut public.statut_expedition;
begin
  select coalesce(max(statut), 'preparation') into v_statut
    from public.expedition_etapes where expedition_id = v_exp;

  update public.expeditions
     set statut = v_statut, updated_at = now()
   where id = v_exp and statut is distinct from v_statut;

  return null;
end; $$;

drop trigger if exists on_expedition_etape_change on public.expedition_etapes;
create trigger on_expedition_etape_change
  after insert or update or delete on public.expedition_etapes
  for each row execute function public.refresh_expedition_statut();

-- updated_at d'une expédition : tenu par la base, jamais par le client.
drop trigger if exists on_expedition_update on public.expeditions;
create trigger on_expedition_update
  before update on public.expeditions
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 5. Accès
--    Lecture : le voyageur propriétaire, l'équipe en support.
--    Écriture : AUCUNE politique → uniquement les fonctions admin_*
--    (security definer). Un voyageur ne peut pas écrire même chez lui.
-- ------------------------------------------------------------
alter table public.expeditions enable row level security;
alter table public.expedition_etapes enable row level security;

drop policy if exists "expeditions_owner_read" on public.expeditions;
create policy "expeditions_owner_read" on public.expeditions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "expeditions_staff_read" on public.expeditions;
create policy "expeditions_staff_read" on public.expeditions
  for select to authenticated using (public.is_team());

drop policy if exists "expedition_etapes_owner_read" on public.expedition_etapes;
create policy "expedition_etapes_owner_read" on public.expedition_etapes
  for select to authenticated using (
    exists (select 1 from public.expeditions e
             where e.id = expedition_etapes.expedition_id and e.user_id = auth.uid()));

drop policy if exists "expedition_etapes_staff_read" on public.expedition_etapes;
create policy "expedition_etapes_staff_read" on public.expedition_etapes
  for select to authenticated using (public.is_team());

-- ------------------------------------------------------------
-- 6. Création d'un lot (équipe uniquement)
--    Le code est genere en base, sous verrou, pour que deux
--    creations simultanees ne produisent pas le meme numero.
-- ------------------------------------------------------------
create or replace function public.admin_creer_expedition(
  p_user_id        uuid,
  p_fret           text,
  p_origine        text,
  p_provider_id    text    default null,
  p_conteneur      text    default null,
  p_articles       text    default null,
  p_poids          text    default null,
  p_depart_le      date    default null,
  p_arrivee_prevue date    default null,
  p_list_id        uuid    default null,
  p_notes          text    default null
) returns table (id uuid, code text)
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_id   uuid;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_fret not in ('air', 'sea') then
    raise exception 'Type de fret invalide : %', p_fret;
  end if;
  if p_origine not in ('Guangzhou', 'Shenzhen') then
    raise exception 'Ville d''origine invalide : %', p_origine;
  end if;

  -- Sérialise la génération des codes : deux appels simultanés
  -- ne peuvent pas lire le même « dernier numéro ».
  perform pg_advisory_xact_lock(hashtext('fret_code_' || to_char(now(), 'YYYY')));

  select 'DIA-' || to_char(now(), 'YYYY') || '-' ||
         lpad((coalesce(max(substring(e.code from '[0-9]{4}$')::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.expeditions e
   where e.code like 'DIA-' || to_char(now(), 'YYYY') || '-%';

  insert into public.expeditions
    (code, user_id, provider_id, fret, origine, conteneur, articles, poids,
     depart_le, arrivee_prevue, list_id, notes)
  values
    (v_code, p_user_id, p_provider_id, p_fret, p_origine, p_conteneur, p_articles, p_poids,
     p_depart_le, p_arrivee_prevue, p_list_id, p_notes)
  returning expeditions.id into v_id;

  return query select v_id, v_code;
end; $$;

revoke all on function public.admin_creer_expedition(uuid, text, text, text, text, text, text, date, date, uuid, text) from public, anon;
grant execute on function public.admin_creer_expedition(uuid, text, text, text, text, text, text, date, date, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 7. Ajout d'une étape (équipe uniquement)
--    Règle métier : une étape automatique (ShipsGo) ne fait JAMAIS
--    reculer le statut — le voyageur ne voit pas son lot redescendre.
--    Un mouvement déjà connu est ignoré (ShipsGo réessaie).
-- ------------------------------------------------------------
create or replace function public.admin_ajouter_etape(
  p_expedition_id uuid,
  p_statut        public.statut_expedition,
  p_lieu          text    default null,
  p_note          text    default null,
  p_photo         text    default null,
  p_publique      boolean default true,
  p_source        text    default 'equipe',
  p_ref_shipsgo   text    default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id     uuid;
  v_statut public.statut_expedition;
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  if p_source not in ('equipe', 'shipsgo') then
    raise exception 'Source inconnue : %', p_source;
  end if;

  select statut into v_statut from public.expeditions where id = p_expedition_id;
  if not found then
    raise exception 'Expédition introuvable';
  end if;

  -- déjà connue ? (mouvement rejoué) : rien à faire
  if p_ref_shipsgo is not null and exists (
    select 1 from public.expedition_etapes
     where expedition_id = p_expedition_id and ref_shipsgo = p_ref_shipsgo) then
    return null;
  end if;

  -- mise à jour automatique qui reculerait le statut : ignorée
  if p_source = 'shipsgo' and p_statut < v_statut then
    return null;
  end if;

  insert into public.expedition_etapes
    (expedition_id, statut, lieu, note, photo, publique, source, ref_shipsgo)
  values
    (p_expedition_id, p_statut, p_lieu, p_note, p_photo, p_publique, p_source, p_ref_shipsgo)
  returning expedition_etapes.id into v_id;

  return v_id;
end; $$;

revoke all on function public.admin_ajouter_etape(uuid, public.statut_expedition, text, text, text, boolean, text, text) from public, anon;
grant execute on function public.admin_ajouter_etape(uuid, public.statut_expedition, text, text, text, boolean, text, text) to authenticated;

-- ------------------------------------------------------------
-- 8. Mise à jour d'un lot. Un paramètre nul laisse la colonne
--    inchangée : la console n'envoie que ce qu'elle modifie.
--    Le propriétaire (user_id) n'est jamais modifiable ici.
-- ------------------------------------------------------------
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
  p_shipsgo_type   text    default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
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
    shipsgo_type   = coalesce(p_shipsgo_type, shipsgo_type)
  where id = p_id;

  if not found then
    raise exception 'Expédition introuvable';
  end if;
end; $$;

revoke all on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text) from public, anon;
grant execute on function public.admin_maj_expedition(uuid, text, text, text, text, date, date, date, text, integer, text) to authenticated;

-- ------------------------------------------------------------
-- 9. Suppression d'un lot : ses étapes partent avec lui
--    (clé étrangère vers la table parente).
-- ------------------------------------------------------------
create or replace function public.admin_supprimer_expedition(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé à l''administration';
  end if;
  delete from public.expeditions where id = p_id;
end; $$;

revoke all on function public.admin_supprimer_expedition(uuid) from public, anon;
grant execute on function public.admin_supprimer_expedition(uuid) to authenticated;