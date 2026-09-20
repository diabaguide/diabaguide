-- ============================================================
-- Diaba Guide — Supabase Auth + RLS par utilisateur
-- À exécuter APRÈS schema.sql, dans Supabase → SQL Editor → Run.
-- Idempotent : relançable sans erreur.
-- ============================================================

-- ---------- Table : profiles (1 ligne par compte auth) ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  role       text not null default 'traveler' check (role in ('traveler', 'team')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Chaque utilisateur lit et modifie sa propre fiche.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------- Helper : l'utilisateur courant est-il « équipe » ? ----------
-- SECURITY DEFINER => contourne la RLS de profiles (pas de récursion).
create or replace function public.is_team()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'team'
  );
$$;

-- L'équipe peut lire toutes les fiches profils (permissive → OR avec la précédente).
drop policy if exists "profiles_team_read" on public.profiles;
create policy "profiles_team_read" on public.profiles
  for select using (public.is_team());

-- ---------- Trigger : créer le profil à l'inscription ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    -- Comportement démo conservé : un e-mail contenant « equipe » => rôle équipe.
    case when new.email ilike '%equipe%' then 'team' else 'traveler' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Resserrement des RLS (remplace les politiques ouvertes de démo)
-- ============================================================

-- providers : lecture publique conservée ; écriture réservée à l'équipe.
drop policy if exists "providers_write_team" on public.providers;
create policy "providers_write_team" on public.providers
  for all using (public.is_team()) with check (public.is_team());

-- proposals : rattachées à leur auteur.
alter table public.proposals
  add column if not exists user_id uuid references auth.users(id) default auth.uid();

drop policy if exists "proposals_demo_all" on public.proposals;

-- L'auteur a tous les droits sur ses propres propositions.
drop policy if exists "proposals_author_rw" on public.proposals;
create policy "proposals_author_rw" on public.proposals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- L'équipe lit toutes les propositions et peut les mettre à jour (traitement).
drop policy if exists "proposals_team_read" on public.proposals;
create policy "proposals_team_read" on public.proposals
  for select using (public.is_team());

drop policy if exists "proposals_team_update" on public.proposals;
create policy "proposals_team_update" on public.proposals
  for update using (public.is_team()) with check (true);

-- decisions : journal réservé à l'équipe.
drop policy if exists "decisions_demo_all" on public.decisions;
drop policy if exists "decisions_team_all" on public.decisions;
create policy "decisions_team_all" on public.decisions
  for all using (public.is_team()) with check (public.is_team());
