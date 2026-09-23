-- ============================================================
-- Diaba Guide — Gestion des comptes voyageurs par les administrateurs
-- Permet à un admin de : modifier (nom, téléphone), désactiver /
-- réactiver, supprimer définitivement un compte voyageur.
-- À exécuter après profile_phone.sql. Idempotent.
--
-- Aucune clé service_role n'est utilisée : tout passe par des fonctions
-- SECURITY DEFINER qui vérifient elles-mêmes le rôle de l'appelant.
-- ============================================================

-- ---------- 1. État du compte sur profiles ----------
alter table public.profiles add column if not exists status text;
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;

update public.profiles set status = 'active' where status is null;

alter table public.profiles alter column status set default 'active';
alter table public.profiles alter column status set not null;
alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'suspended'));

-- ---------- 2. Helper : le compte courant est-il désactivé ? ----------
create or replace function public.is_suspended()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'suspended' from public.profiles where id = auth.uid()), false);
$$;

-- Un compte désactivé perd l'accès à sa propre fiche. Politique RESTRICTIVE :
-- elle se cumule (ET) avec les autres, sans les remplacer.
-- Les helpers is_admin()/is_team() restent utilisables : ils sont SECURITY DEFINER.
drop policy if exists "profiles_no_suspended_self" on public.profiles;
create policy "profiles_no_suspended_self" on public.profiles
  as restrictive for all
  using (not public.is_suspended())
  with check (not public.is_suspended());

-- ---------- 3. Modifier un compte voyageur (nom, téléphone) ----------
create or replace function public.admin_update_traveler(
  p_id uuid, p_name text, p_phone text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Passez par votre profil pour modifier votre propre compte.';
  end if;

  select role into v_role from public.profiles where id = p_id;
  if v_role is null then
    raise exception 'Compte introuvable.';
  end if;
  -- Garde-fou : les comptes équipe/admin se gèrent depuis la page « Membres »,
  -- où les règles de rôle (dernier admin, etc.) s'appliquent.
  if v_role <> 'traveler' then
    raise exception 'Ce compte est un compte équipe : gérez-le depuis la page Membres.';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères.';
  end if;
  -- Les numéros sont saisis librement (espaces, indicatif) : on ne compte que
  -- les chiffres, sans imposer de format.
  if v_phone is not null
     and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;

  update public.profiles
     set name = trim(p_name), phone = v_phone
   where id = p_id;
end; $$;

revoke all on function public.admin_update_traveler(uuid, text, text) from public, anon;
grant execute on function public.admin_update_traveler(uuid, text, text) to authenticated;

-- ---------- 4. Désactiver / réactiver un compte voyageur ----------
-- Désactiver = profil marqué « suspended » ET connexion bloquée côté
-- Supabase Auth (banned_until), ce qui invalide aussi le rafraîchissement
-- du jeton en cours. Réactiver remet les deux à l'état actif.
create or replace function public.admin_set_traveler_status(
  p_id uuid, p_status text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'Statut invalide.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Vous ne pouvez pas désactiver votre propre compte.';
  end if;

  select role into v_role from public.profiles where id = p_id;
  if v_role is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'traveler' then
    raise exception 'Ce compte est un compte équipe : gérez-le depuis la page Membres.';
  end if;

  update public.profiles
     set status = p_status,
         suspended_at = case when p_status = 'suspended' then now() end,
         suspended_reason = case when p_status = 'suspended'
                                 then nullif(trim(coalesce(p_reason, '')), '') end
   where id = p_id;

  update auth.users
     set banned_until = case when p_status = 'suspended'
                             then now() + interval '100 years' end
   where id = p_id;
end; $$;

revoke all on function public.admin_set_traveler_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_traveler_status(uuid, text, text) to authenticated;

-- ---------- 5. Supprimer définitivement un compte voyageur ----------
create or replace function public.admin_delete_traveler(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if p_id = auth.uid() then
    raise exception 'Vous ne pouvez pas supprimer votre propre compte.';
  end if;

  select role into v_role from public.profiles where id = p_id;
  if v_role is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'traveler' then
    raise exception 'Ce compte est un compte équipe : gérez-le depuis la page Membres.';
  end if;

  -- proposals.user_id ne se supprime pas en cascade : on détache les
  -- contributions pour ne pas perdre l'historique (elles restent visibles
  -- par l'équipe, sans auteur).
  -- Le trigger guard_proposal_write (security_fixes.sql) réécrit toujours
  -- user_id pour empêcher un changement de propriétaire : il faut le
  -- neutraliser le temps du détachement (opération transactionnelle).
  alter table public.proposals disable trigger guard_proposal_write;
  update public.proposals set user_id = null where user_id = p_id;
  alter table public.proposals enable trigger guard_proposal_write;

  -- profiles et ratings sont nettoyés par les contraintes
  -- (on delete cascade) ; reports et team_invitations par « set null ».
  -- Les photos du dossier storage <user_id>/ sont retirées juste avant cet
  -- appel, par l'API Storage avec la session de l'administrateur
  -- (voir supabase/storage_cleanup.sql) : aucune clé service_role.
  delete from auth.users where id = p_id;
end; $$;

revoke all on function public.admin_delete_traveler(uuid) from public, anon;
grant execute on function public.admin_delete_traveler(uuid) to authenticated;
