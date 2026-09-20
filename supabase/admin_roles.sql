-- ============================================================
-- Diaba Guide — Lot 1 : rôle administrateur & membres d'équipe
-- À exécuter après auth.sql. Idempotent.
--
-- Corrige au passage une FAILLE : le rôle « équipe » était accordé à
-- tout e-mail contenant « equipe » (n'importe qui pouvait s'auto-promouvoir).
-- Le rôle vient désormais uniquement d'une invitation ou d'un admin.
-- ============================================================

-- ---------- 1. Rôle « admin » ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('traveler', 'team', 'admin'));

-- ---------- 2. Invitations (pas de clé service_role côté front) ----------
create table if not exists public.team_invitations (
  email       text primary key,
  role        text not null default 'team' check (role in ('team', 'admin')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
alter table public.team_invitations enable row level security;

-- ---------- 3. Helpers de rôle ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Un admin a aussi tous les droits « équipe ».
create or replace function public.is_team()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('team', 'admin'));
$$;

-- ---------- 4. Inscription : le rôle vient d'une invitation ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare invited_role text;
begin
  select role into invited_role from public.team_invitations
   where lower(email) = lower(new.email) and accepted_at is null;

  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(invited_role, 'traveler')   -- plus aucune règle basée sur l'e-mail
  )
  on conflict (id) do nothing;

  if invited_role is not null then
    update public.team_invitations set accepted_at = now()
     where lower(email) = lower(new.email);
  end if;
  return new;
end; $$;

-- ---------- 5. Garde-fous sur les changements de rôle ----------
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- Contexte service / SQL Editor (auth.uid() nul) : autorisé.
    if auth.uid() is null then return new; end if;

    if not public.is_admin() then
      raise exception 'Seul un administrateur peut modifier un rôle.';
    end if;
    if old.id = auth.uid() then
      raise exception 'Vous ne pouvez pas modifier votre propre rôle.';
    end if;
    if old.role = 'admin' and new.role <> 'admin'
       and (select count(*) from public.profiles where role = 'admin') <= 1 then
      raise exception 'Impossible de retirer le dernier administrateur.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_profile_role_change on public.profiles;
create trigger on_profile_role_change
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ---------- 6. RLS ----------
-- Un admin lit et modifie tous les profils (le trigger ci-dessus borne les rôles).
drop policy if exists "profiles_admin_read" on public.profiles;
create policy "profiles_admin_read" on public.profiles
  for select using (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update using (public.is_admin()) with check (true);

-- Invitations : réservées aux admins.
drop policy if exists "invitations_admin_all" on public.team_invitations;
create policy "invitations_admin_all" on public.team_invitations
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------- 7. Premier administrateur ----------
-- Si le compte existe déjà, il est promu ; sinon l'invitation s'appliquera
-- automatiquement à sa première inscription.
insert into public.team_invitations (email, role) values ('etiennesamake@gmail.com', 'admin')
on conflict (email) do update set role = 'admin', accepted_at = null;

update public.profiles set role = 'admin'
 where lower(email) = lower('etiennesamake@gmail.com');
