-- ============================================================
-- Diaba Guide — Module Fret : tarifs et calcul des frais
-- Issu du cadrage v1 : prix au m³ (maritime groupage), au kilo
-- (conteneur complet, aérien), variables selon le type de marchandise.
-- Pas de minimum de facturation. Frais annexes : stockage, livraison.
--
-- À exécuter APRÈS fret_module.sql (types fret_mode, table colis).
-- Idempotent : peut être relancé sans erreur.
-- ============================================================

-- ---------- Types ----------
do $$ begin
  create type unite_tarif as enum ('kg', 'm3', 'colis', 'conteneur');
exception when duplicate_object then null; end $$;

-- ============================================================
-- Table : types_marchandise — référentiel administrable
-- (le prix change selon le type : électronique, batterie, textile…)
-- ============================================================
create table if not exists public.types_marchandise (
  code        text primary key,               -- 'general', 'batterie', 'textile'…
  libelle     text not null,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- Table : tarifs_fret — prix unitaire par mode et type de marchandise
-- ============================================================
create table if not exists public.tarifs_fret (
  id                uuid primary key default gen_random_uuid(),
  mode              fret_mode not null,
  type_marchandise  text not null default 'general' references public.types_marchandise(code),
  unite             unite_tarif not null,        -- 'kg' ou 'm3' selon le mode
  prix              numeric(12,2) not null,
  devise            text not null default 'XOF',
  actif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Un seul tarif actif par (mode, type, devise).
create unique index if not exists uniq_tarif_fret_actif
  on public.tarifs_fret (mode, type_marchandise, devise) where actif;

-- ============================================================
-- Table : tarifs_annexes — stockage (par jour) et livraison (par zone)
-- ============================================================
create table if not exists public.tarifs_annexes (
  id              uuid primary key default gen_random_uuid(),
  categorie       text not null check (categorie in ('stockage', 'livraison', 'autre')),
  libelle         text not null,
  prix            numeric(12,2) not null,
  devise          text not null default 'XOF',
  jours_gratuits  integer,                       -- stockage : ex. 7 jours offerts
  zone            text,                          -- livraison : 'Dakar', 'Régions'…
  actif           boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- Colis : ajouter le type de marchandise (le prix en dépend)
-- ============================================================
alter table public.colis
  add column if not exists type_marchandise text
  references public.types_marchandise(code) default 'general';

-- ============================================================
-- Calculateur — frais de fret pour un envoi donné
-- Cherche le tarif du type précis, sinon retombe sur 'general'.
-- SECURITY DEFINER : le client peut obtenir un devis sans lire les tarifs.
-- ============================================================
create or replace function public.calc_fret(
  p_mode    fret_mode,
  p_type    text,
  p_poids   numeric,
  p_volume  numeric,
  p_devise  text default 'XOF'
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare r record;
begin
  select unite, prix into r from public.tarifs_fret
   where mode = p_mode and devise = p_devise and actif
     and type_marchandise = coalesce(nullif(p_type, ''), 'general')
   limit 1;

  if not found then
    select unite, prix into r from public.tarifs_fret
     where mode = p_mode and devise = p_devise and actif
       and type_marchandise = 'general'
     limit 1;
  end if;

  if not found then return null; end if;   -- aucun tarif saisi : à compléter côté admin

  return case
    when r.unite = 'kg' then r.prix * coalesce(p_poids, 0)
    when r.unite = 'm3' then r.prix * coalesce(p_volume, 0)
    else r.prix
  end;
end; $$;
grant execute on function public.calc_fret(fret_mode, text, numeric, numeric, text)
  to authenticated;

-- ============================================================
-- Calculateur — frais de fret d'un colis existant
-- Le client ne peut calculer que pour ses propres colis ; l'équipe, pour tous.
-- (Le stockage et la livraison s'ajoutent à part, une fois leurs tarifs saisis.)
-- ============================================================
create or replace function public.calc_fret_colis(
  p_code    text,
  p_devise  text default 'XOF'
) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select mode, poids_kg, volume_m3, type_marchandise, profile_id
    into c
  from public.colis where code = p_code;

  if not found then return null; end if;

  -- Contrôle d'accès : équipe, ou propriétaire du colis.
  if not public.is_team() and c.profile_id is distinct from auth.uid() then
    raise exception 'Accès refusé à ce colis.';
  end if;

  return public.calc_fret(c.mode, c.type_marchandise, c.poids_kg, c.volume_m3, p_devise);
end; $$;
grant execute on function public.calc_fret_colis(text, text) to authenticated;

-- ============================================================
-- Sécurité (RLS) — les tarifs sont internes ; le client ne voit
-- que le montant calculé (via les fonctions ci-dessus), jamais la grille.
-- ============================================================
alter table public.types_marchandise enable row level security;
alter table public.tarifs_fret        enable row level security;
alter table public.tarifs_annexes     enable row level security;

-- Référentiel des types : lisible par tout compte connecté (sert aux devis).
drop policy if exists "types_marchandise_read" on public.types_marchandise;
create policy "types_marchandise_read" on public.types_marchandise
  for select using (auth.uid() is not null);
drop policy if exists "types_marchandise_admin" on public.types_marchandise;
create policy "types_marchandise_admin" on public.types_marchandise
  for all using (public.is_admin()) with check (public.is_admin());

-- Grilles de tarifs : lecture équipe, écriture admin.
drop policy if exists "tarifs_fret_team_read" on public.tarifs_fret;
create policy "tarifs_fret_team_read" on public.tarifs_fret
  for select using (public.is_team());
drop policy if exists "tarifs_fret_admin_write" on public.tarifs_fret;
create policy "tarifs_fret_admin_write" on public.tarifs_fret
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tarifs_annexes_team_read" on public.tarifs_annexes;
create policy "tarifs_annexes_team_read" on public.tarifs_annexes
  for select using (public.is_team());
drop policy if exists "tarifs_annexes_admin_write" on public.tarifs_annexes;
create policy "tarifs_annexes_admin_write" on public.tarifs_annexes
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Seed : types de marchandise courants (données de référence, pas de prix)
-- Les PRIX sont à saisir par l'admin, une fois la grille connue.
-- ============================================================
insert into public.types_marchandise (code, libelle) values
  ('general',      'Marchandise générale'),
  ('textile',      'Textile et confection'),
  ('electronique', 'Électronique et téléphones'),
  ('batterie',     'Batteries et produits à risque'),
  ('cosmetique',   'Cosmétiques'),
  ('liquide',      'Liquides'),
  ('alimentaire',  'Produits alimentaires')
on conflict (code) do nothing;

-- ============================================================
-- À COMPLÉTER avec Mbaye avant la mise en production :
--   • prix au m³ / au kilo par mode et par type (table tarifs_fret) ;
--   • tarif de stockage par jour après 7 jours gratuits, ex. :
--       insert into public.tarifs_annexes (categorie, libelle, prix, jours_gratuits)
--       values ('stockage', 'Stockage Dakar', <prix/jour>, 7);
--   • tarifs de livraison par zone (Dakar, régions).
-- ============================================================
