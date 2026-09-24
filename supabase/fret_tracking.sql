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