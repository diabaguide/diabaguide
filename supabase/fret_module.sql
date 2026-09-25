-- ============================================================
-- Diaba Guide — Module Fret (Chine → Sénégal)
-- Schéma issu du cadrage v1 (réponses du PDG, 25 sept. 2026).
--
-- Historique du schéma du nouveau module. La base de production a déjà été
-- migrée ; ne pas relancer ce fichier ni les anciens scripts fret sans revue
-- de l'état réel des tables et des droits.
-- Dépend de : auth.sql, admin_roles.sql (fonctions is_team() / is_admin()).
--
-- Remplace l'ancien modèle fret_tracking.sql / fret_lot2b.sql.
--
-- Modèle à trois niveaux (validé par Mbaye) :
--   expédition (un conteneur ou un vol)
--     └── colis (le carton physique d'un client ; rattaché à une expédition)
--   Un client peut avoir des colis dans plusieurs expéditions.
-- ============================================================

-- ---------- Types ----------

-- Mode de transport d'une expédition.
do $$ begin
  create type fret_mode as enum
    ('maritime_groupage', 'maritime_complet', 'aerien_fret', 'aerien_express');
exception when duplicate_object then null; end $$;

-- Usage d'un entrepôt en Chine (Mbaye a deux adresses distinctes).
do $$ begin
  create type entrepot_usage as enum ('fret_express', 'cargo');
exception when duplicate_object then null; end $$;

-- Statut d'une expédition.
do $$ begin
  create type expedition_statut as enum
    ('ouverte', 'cloturee', 'partie', 'arrivee', 'livree', 'annulee');
exception when duplicate_object then null; end $$;

-- Statut d'un colis.
do $$ begin
  create type colis_statut as enum
    ('annonce', 'recu_chine', 'affecte', 'en_transit', 'arrive_dakar',
     'dispo_retrait', 'en_livraison', 'remis', 'probleme');
exception when duplicate_object then null; end $$;

-- Type d'étape de suivi (ordre logique du parcours).
do $$ begin
  create type etape_type as enum
    ('annonce', 'recu_chine', 'regroupe', 'depart', 'en_transit',
     'arrive_dakar', 'chez_diaba', 'dispo_retrait', 'en_livraison', 'remis');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Table : warehouses — entrepôts / adresses de collecte en Chine
-- Modifiables par l'équipe (Mbaye veut pouvoir changer les adresses).
-- ============================================================
create table if not exists public.warehouses (
  id          text primary key,               -- ex. 'gz_fret', 'gz_cargo'
  nom         text not null,
  usage       entrepot_usage not null,        -- fret/express ou cargo
  addr_cn     text,                            -- adresse en chinois (à montrer au fournisseur)
  addr_fr     text,
  ville       text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Table : expeditions — un conteneur ou un vol groupé
-- Le départ se déclenche à un seuil de poids/volume (pas de date fixe).
-- ============================================================
create table if not exists public.expeditions (
  code            text primary key,            -- code de lot, identifiant unique
  mode            fret_mode not null,
  warehouse_id    text references public.warehouses(id) on delete set null,
  destination     text not null default 'Dakar',
  -- Références transporteur (pour ShipsGo, phase 2) :
  container_no    text,                         -- numéro de conteneur
  bl_no           text,                         -- numéro de connaissement (B/L)
  awb_no          text,                         -- lettre de transport aérien (aérien)
  -- Seuils de chargement (aide au dispatching / décision de départ) :
  seuil_kg        numeric(12,2),
  seuil_m3        numeric(12,3),
  statut          expedition_statut not null default 'ouverte',
  cloturee_le     timestamptz,
  partie_le       timestamptz,
  arrivee_le      timestamptz,
  note_interne    text,                         -- réservé équipe (voir vues publiques)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_expeditions_statut on public.expeditions(statut);

-- ============================================================
-- Table : colis — le carton physique d'un client
-- Rattaché à une expédition (nullable tant qu'il n'est pas affecté).
-- ============================================================
create table if not exists public.colis (
  code            text primary key,            -- ex. 'DBA-2026-000123'
  expedition_code text references public.expeditions(code) on delete set null,
  -- Identité client = compte voyageur ; l'ancienne nullabilité sert uniquement
  -- aux deux colis historiques, le déclencheur de fret_clients.sql impose
  -- un profil voyageur à toute nouvelle réception.
  profile_id      uuid references auth.users(id) on delete set null,
  client_nom      text,
  client_tel      text,
  code_client     text,                         -- code interne Diaba (dispatching)
  marque_colis    text,                         -- shipping mark
  mode            fret_mode not null,
  description     text,
  poids_kg        numeric(12,2),
  volume_m3       numeric(12,3),
  photos          integer not null default 0,
  statut          colis_statut not null default 'annonce',
  recu_chine_le   timestamptz,
  note_interne    text,                         -- réservé équipe
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_colis_expedition on public.colis(expedition_code);
create index if not exists idx_colis_profile    on public.colis(profile_id);
create index if not exists idx_colis_tel         on public.colis(client_tel);

-- ============================================================
-- Table : colis_etapes — le suivi, étape par étape, d'un colis
-- visible_client sépare ce que le client voit de l'interne.
-- ============================================================
create table if not exists public.colis_etapes (
  id              uuid primary key default gen_random_uuid(),
  colis_code      text not null references public.colis(code) on delete cascade,
  type            etape_type not null,
  au              timestamptz not null default now(),
  visible_client  boolean not null default false,
  note_interne    text,                         -- réservé équipe
  par             text,                          -- qui a saisi l'étape
  created_at      timestamptz not null default now()
);
create index if not exists idx_etapes_colis on public.colis_etapes(colis_code, au);

-- ============================================================
-- Vue : v_expedition_totaux — total cumulé par expédition
-- Réponse au besoin « connaissance du total par l'admin » : décider
-- quand charger selon le poids/volume atteint face au seuil.
-- ============================================================
create or replace view public.v_expedition_totaux with (security_invoker = true) as
  select
    e.code,
    e.mode,
    e.statut,
    e.seuil_kg,
    e.seuil_m3,
    count(c.code)                              as nb_colis,
    coalesce(sum(c.poids_kg), 0)               as total_kg,
    coalesce(sum(c.volume_m3), 0)              as total_m3,
    case when e.seuil_kg is not null and e.seuil_kg > 0
         then round(100 * coalesce(sum(c.poids_kg),0) / e.seuil_kg, 1) end as pct_kg,
    case when e.seuil_m3 is not null and e.seuil_m3 > 0
         then round(100 * coalesce(sum(c.volume_m3),0) / e.seuil_m3, 1) end as pct_m3
  from public.expeditions e
  left join public.colis c on c.expedition_code = e.code
  where public.is_team()
  group by e.code, e.mode, e.statut, e.seuil_kg, e.seuil_m3;

-- ============================================================
-- Sécurité (RLS)
-- Principe : l'équipe (is_team) gère tout ; le client ne lit que
-- ses propres colis et leurs étapes marquées visibles. Les notes
-- internes vivent dans des colonnes que le client ne lit jamais
-- (voir la fonction de suivi ci-dessous, qui ne les renvoie pas).
-- ============================================================
alter table public.warehouses    enable row level security;
alter table public.expeditions   enable row level security;
alter table public.colis         enable row level security;
alter table public.colis_etapes  enable row level security;

-- warehouses : lecture par tout compte connecté (adresse à montrer au
-- fournisseur) ; écriture réservée à l'équipe.
drop policy if exists "warehouses_read" on public.warehouses;
create policy "warehouses_read" on public.warehouses
  for select using (auth.uid() is not null);
drop policy if exists "warehouses_team_write" on public.warehouses;
create policy "warehouses_team_write" on public.warehouses
  for all using (public.is_team()) with check (public.is_team());

-- expeditions : réservé à l'équipe (le client passe par ses colis).
drop policy if exists "expeditions_team_all" on public.expeditions;
create policy "expeditions_team_all" on public.expeditions
  for all using (public.is_team()) with check (public.is_team());

-- colis : l'équipe voit tout ; le client voit les siens (par compte).
drop policy if exists "colis_team_all" on public.colis;
create policy "colis_team_all" on public.colis
  for all using (public.is_team()) with check (public.is_team());
drop policy if exists "colis_owner_read" on public.colis;
create policy "colis_owner_read" on public.colis
  for select using (profile_id = auth.uid());
-- Le voyageur peut annoncer SON colis : profil = lui, non affecté, statut 'annonce'.
drop policy if exists "colis_owner_insert" on public.colis;
create policy "colis_owner_insert" on public.colis
  for insert with check (
    profile_id = auth.uid() and expedition_code is null and statut = 'annonce'
  );

-- colis_etapes : l'équipe voit tout ; le client voit les étapes
-- visibles de ses propres colis.
drop policy if exists "etapes_team_all" on public.colis_etapes;
create policy "etapes_team_all" on public.colis_etapes
  for all using (public.is_team()) with check (public.is_team());
drop policy if exists "etapes_owner_read" on public.colis_etapes;
create policy "etapes_owner_read" on public.colis_etapes
  for select using (
    visible_client = true
    and exists (
      select 1 from public.colis c
      where c.code = colis_etapes.colis_code
        and c.profile_id = auth.uid()
    )
  );

-- ============================================================
-- Suivi public par code de lot (module 31) — OPTIONNEL
-- Mbaye l'a jugé « pas nécessaire » pour la v1. Laissé en commentaire :
-- décommenter pour permettre à un destinataire sans compte de suivre
-- un colis en connaissant seulement son code (le code = secret partagé).
-- Ne renvoie ni nom, ni téléphone, ni note interne, ni prix.
-- ============================================================
-- create or replace function public.suivi_lot(p_code text)
-- returns table (type etape_type, au timestamptz)
-- language sql stable security definer set search_path = public as $$
--   select e.type, e.au
--   from public.colis_etapes e
--   where e.colis_code = p_code and e.visible_client = true
--   order by e.au;
-- $$;
-- grant execute on function public.suivi_lot(text) to anon, authenticated;

-- ============================================================
-- Reste à caler avec Mbaye avant la mise en production :
--   • tarif de stockage par jour (après 7 jours gratuits) ;
--   • barème du calculateur de frais (m³ vs kg + stockage + livraison),
--     à stocker dans une table de tarifs administrable (non incluse ici).
-- ============================================================
