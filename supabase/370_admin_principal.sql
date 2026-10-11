-- ============================================================
-- Diaba Guide — Administrateur principal intouchable
-- Le compte marqué `is_primary_admin` ne peut être modifié, supprimé,
-- rétrogradé ni désactivé par aucun AUTRE compte, même administrateur.
-- Lui-même peut changer son nom, son téléphone et sa photo, mais pas son
-- rôle ni son statut. Idempotent.
--
-- Le contexte « service / SQL Editor » (auth.uid() nul) reste autorisé : c'est
-- la voie de secours du propriétaire du projet Supabase.
-- Le mot de passe se change dans auth.users, hors de portée de ces
-- déclencheurs : api/reinitialiser-mot-de-passe.js refuse ce compte.
-- ============================================================

-- ---------- 1. Marqueur (un seul compte possible) ----------
alter table public.profiles add column if not exists is_primary_admin boolean not null default false;
create unique index if not exists profiles_one_primary_admin
  on public.profiles ((true)) where is_primary_admin;

update public.profiles set is_primary_admin = true
 where lower(email) = 'etiennesamake@gmail.com' and role = 'admin';

-- ---------- 2. Modification du profil ----------
create or replace function public.guard_primary_admin_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- service / SQL Editor

  if new.is_primary_admin is distinct from old.is_primary_admin then
    raise exception 'Le statut d''administrateur principal ne peut pas être modifié.';
  end if;

  if old.is_primary_admin then
    if auth.uid() <> old.id then
      raise exception 'Ce compte est l''administrateur principal : aucun autre compte ne peut le modifier.';
    end if;
    if new.role is distinct from old.role or new.status is distinct from old.status then
      raise exception 'Le rôle et le statut de l''administrateur principal sont verrouillés.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_profile_primary_admin_update on public.profiles;
create trigger on_profile_primary_admin_update
  before update on public.profiles
  for each row execute function public.guard_primary_admin_update();

-- ---------- 3. Suppression du profil ----------
create or replace function public.guard_primary_admin_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_primary_admin and auth.uid() is not null then
    raise exception 'Le compte de l''administrateur principal ne peut pas être supprimé.';
  end if;
  return old;
end; $$;

drop trigger if exists on_profile_primary_admin_delete on public.profiles;
create trigger on_profile_primary_admin_delete
  before delete on public.profiles
  for each row execute function public.guard_primary_admin_delete();

-- ---------- 4. Invitation liée à cette adresse ----------
create or replace function public.guard_primary_admin_invitation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and exists (
    select 1 from public.profiles where is_primary_admin and lower(email) = lower(old.email)
  ) then
    raise exception 'Cette adresse est celle de l''administrateur principal : elle ne peut pas être modifiée.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end; $$;

drop trigger if exists on_invitation_primary_admin on public.team_invitations;
create trigger on_invitation_primary_admin
  before update or delete on public.team_invitations
  for each row execute function public.guard_primary_admin_invitation();
