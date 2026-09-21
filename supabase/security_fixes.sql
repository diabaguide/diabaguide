-- ============================================================
-- Diaba Guide — correctifs de l'audit de sécurité (2026-09-20)
--
-- À exécuter APRÈS : schema, auth, admin_roles, taxonomies, validation.
-- Supabase → SQL Editor → New query → Run.
--
-- * Tout le script est dans UNE transaction : à la moindre erreur rien
--   n'est appliqué (retour arrière automatique). Corrigez puis relancez.
-- * Idempotent : peut être relancé sans effet de bord.
-- * NON TESTÉ sur la base réelle avant livraison : à lancer de préférence
--   hors heures d'usage, puis exécuter les vérifications en fin de fichier.
--
-- Corrige :
--   §1 profiles      e-mail modifiable par l'utilisateur (prise de contrôle
--                    d'une invitation) ; e-mails normalisés en minuscules ;
--                    lecture des profils réservée aux admins
--   §2 invitations   rôle appliqué seulement si l'e-mail est CONFIRMÉ ;
--                    RPC admin_add_member (recherche exacte, plus de joker)
--   §3 proposals     un voyageur ne peut plus s'auto-attribuer un statut,
--                    un retour d'équipe ou un auteur ; quota quotidien
--   §4 decisions     journal en ajout seul, auteur forcé côté serveur
--   §5 providers     lecture réservée aux comptes connectés ; suppression
--                    réservée aux admins
--   §6 reports       table versionnée + règles RLS + quota horaire
--
-- NE CORRIGE PAS (réglages du tableau de bord, hors SQL) :
--   • Authentication → Providers → Email → activer « Confirm email »
--     (avec un SMTP) : SANS ÇA, le §2 ne protège pas encore une invitation
--     en attente contre quelqu'un qui s'inscrit avec l'adresse invitée.
--   • Authentication → Providers → Email → longueur minimale du mot de
--     passe : 8 ; Authentication → URL Configuration : n'autoriser que
--     https://diabaguide.vercel.app (+ http://localhost:5173 en dev).
--   • Supprimer / rétrograder les comptes de test (equipe.test,
--     equipe.pirate, voyageur.test).
--
-- CHANGEMENTS DE CODE À DÉPLOYER EN MÊME TEMPS :
--   1. store.tsx : recharger les fiches quand l'utilisateur change
--      (sinon, après connexion sans rechargement de page, la liste reste
--      celle de démonstration — voir §5).
--   2. lib/members.ts : appeler supabase.rpc('admin_add_member', …) au
--      lieu de chercher le profil avec ilike (voir §2).
-- ============================================================

begin;

-- ============================================================
-- §1. profiles
-- ============================================================

-- E-mails toujours en minuscules (comparaisons exactes fiables).
update public.profiles set email = lower(email) where email is distinct from lower(email);

-- L'utilisateur ne peut plus modifier son e-mail (ni id, ni created_at) :
-- seules les colonnes « name » et « role » sont modifiables par l'API.
-- (« role » reste protégé par le trigger guard_profile_role : seul un admin,
-- jamais sur lui-même, jamais le dernier admin.)
revoke insert, update, delete on table public.profiles from anon, authenticated;
grant update (name, role) on table public.profiles to authenticated;

alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles add  constraint profiles_name_len
  check (name is null or char_length(name) <= 100);

-- Un membre « équipe » n'a pas besoin de lire tous les comptes : l'écran
-- Membres est réservé aux administrateurs (policy profiles_admin_read).
drop policy if exists "profiles_team_read" on public.profiles;

-- Garde-fou de rôle (mêmes règles que admin_roles.sql) + exception pour les
-- triggers imbriqués (attribution d'une invitation à l'inscription).
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    -- SQL Editor / service, ou appel depuis un autre trigger : autorisé.
    if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;

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

-- Si l'e-mail change côté authentification, le profil suit.
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = lower(new.email) where id = new.id;
  return new;
end; $$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ============================================================
-- §2. Invitations : rôle accordé seulement à un e-mail confirmé
-- ============================================================

alter table public.team_invitations drop constraint if exists team_invitations_email_lower;
alter table public.team_invitations add  constraint team_invitations_email_lower
  check (email = lower(email));

-- Applique l'invitation en attente d'un utilisateur. Fonction INTERNE : elle
-- ne doit jamais être appelable depuis l'API (n'importe qui pourrait s'en
-- servir pour réclamer une invitation) → exécution retirée aux rôles API.
create or replace function public._apply_invitation(p_uid uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  select role into v_role from public.team_invitations
   where lower(email) = lower(p_email) and accepted_at is null;
  if v_role is null then return; end if;

  update public.profiles set role = v_role where id = p_uid;
  update public.team_invitations set accepted_at = now() where lower(email) = lower(p_email);
end; $$;

revoke all on function public._apply_invitation(uuid, text) from public, anon, authenticated;

-- Inscription : profil « voyageur » ; l'invitation n'est appliquée que si
-- l'e-mail est déjà confirmé (autoconfirm actif) ; sinon elle l'est plus tard
-- par on_auth_user_confirmed, au moment de la confirmation réelle.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 100),
    lower(new.email),
    'traveler'
  )
  on conflict (id) do nothing;

  if new.email_confirmed_at is not null then
    perform public._apply_invitation(new.id, new.email);
  end if;
  return new;
end; $$;

create or replace function public.handle_user_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._apply_invitation(new.id, new.email);
  return new;
end; $$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- Ajout d'un membre par un admin : promotion si le compte existe, sinon
-- invitation. Recherche EXACTE sur l'e-mail (l'ancien ilike traitait « _ »
-- et « % » comme des jokers et pouvait promouvoir le mauvais compte).
create or replace function public.admin_add_member(p_email text, p_role text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if p_role not in ('team', 'admin') then
    raise exception 'Rôle invalide.';
  end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Adresse e-mail invalide.';
  end if;

  select id into v_id from public.profiles where email = v_email;
  if v_id is not null then
    -- guard_profile_role s'applique (pas soi-même, pas le dernier admin).
    update public.profiles set role = p_role where id = v_id;
    return 'promoted';
  end if;

  insert into public.team_invitations (email, role, invited_by)
  values (v_email, p_role, auth.uid())
  on conflict (email) do update
    set role = excluded.role, invited_by = excluded.invited_by, accepted_at = null;
  return 'invited';
end; $$;

revoke all on function public.admin_add_member(text, text) from public, anon;
grant execute on function public.admin_add_member(text, text) to authenticated;

-- ============================================================
-- §3. proposals : intégrité du workflow
-- ============================================================

alter table public.proposals drop constraint if exists proposals_status_valid;
alter table public.proposals add  constraint proposals_status_valid check (status in (
  'Brouillon', 'Soumise', 'En vérification', 'Complément demandé',
  'Publiée', 'Rattachée à une adresse existante', 'Refusée'
));

-- Voyageur : ne fixe ni le statut de décision, ni le retour d'équipe, ni
-- l'auteur (déduit de son profil). Il ne modifie que ses brouillons et les
-- propositions pour lesquelles un complément est demandé.
-- Équipe : garde la main sur statut/retour. Personne ne change le
-- propriétaire d'une proposition (user_id).
create or replace function public.guard_proposal_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if auth.uid() is null then return new; end if;   -- SQL Editor / service

  if tg_op = 'UPDATE' then new.user_id := old.user_id; end if;
  if public.is_team() then return new; end if;

  if tg_op = 'INSERT' then
    if new.status not in ('Brouillon', 'Soumise') then
      raise exception 'Statut initial invalide.';
    end if;
    if (select count(*) from public.proposals
         where user_id = auth.uid() and created_at > now() - interval '1 day') >= 30 then
      raise exception 'Limite quotidienne de propositions atteinte. Réessayez demain.';
    end if;
    select left(coalesce(name, split_part(email, '@', 1)), 100) into v_name
      from public.profiles where id = auth.uid();
    new.author   := coalesce(v_name, '');
    new.feedback := null;
    new.user_id  := auth.uid();
  else
    if old.status not in ('Brouillon', 'Complément demandé') then
      raise exception 'Cette proposition n''est plus modifiable.';
    end if;
    if not ((old.status = 'Brouillon'          and new.status in ('Brouillon', 'Soumise'))
         or (old.status = 'Complément demandé' and new.status in ('Complément demandé', 'En vérification'))) then
      raise exception 'Changement de statut non autorisé.';
    end if;
    new.author   := old.author;
    new.feedback := old.feedback;
  end if;
  return new;
end; $$;

drop trigger if exists guard_proposal_write on public.proposals;
create trigger guard_proposal_write
  before insert or update on public.proposals
  for each row execute function public.guard_proposal_write();

-- ============================================================
-- §4. decisions : journal en ajout seul
-- ============================================================

drop policy if exists "decisions_team_all"  on public.decisions;
drop policy if exists "decisions_team_read" on public.decisions;
create policy "decisions_team_read" on public.decisions
  for select to authenticated using (public.is_team());

drop policy if exists "decisions_team_insert" on public.decisions;
create policy "decisions_team_insert" on public.decisions
  for insert to authenticated with check (public.is_team());
-- Aucune policy update/delete : une décision enregistrée ne peut plus être
-- modifiée ni effacée depuis l'API (uniquement via le SQL Editor).

-- L'auteur de la décision est celui du compte connecté, pas un texte libre.
create or replace function public.guard_decision_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  if auth.uid() is null then return new; end if;
  select left(coalesce(name, split_part(email, '@', 1)), 100) into v_name
    from public.profiles where id = auth.uid();
  new."by" := coalesce(v_name, 'Équipe');
  return new;
end; $$;

drop trigger if exists guard_decision_insert on public.decisions;
create trigger guard_decision_insert
  before insert on public.decisions
  for each row execute function public.guard_decision_insert();

-- ============================================================
-- §5. providers : compte obligatoire pour lire, admin pour supprimer
-- ============================================================

drop policy if exists "providers_read_all"           on public.providers;
drop policy if exists "providers_write_team"         on public.providers;
drop policy if exists "providers_read_authenticated" on public.providers;
drop policy if exists "providers_insert_team"        on public.providers;
drop policy if exists "providers_update_team"        on public.providers;
drop policy if exists "providers_delete_admin"       on public.providers;

create policy "providers_read_authenticated" on public.providers
  for select to authenticated using (true);
create policy "providers_insert_team" on public.providers
  for insert to authenticated with check (public.is_team());
create policy "providers_update_team" on public.providers
  for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "providers_delete_admin" on public.providers
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- §6. reports (signalements) : table versionnée + RLS
-- ============================================================

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  provider_id   text,
  provider_name text not null,
  type          text not null,
  about         text,
  text          text not null,
  user_id       uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Table déjà créée à la main : on complète ce qui manque sans rien casser.
alter table public.reports add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.reports add column if not exists created_at timestamptz not null default now();
alter table public.reports alter column user_id set default auth.uid();

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'reports'
                and column_name = 'id' and data_type = 'uuid') then
    alter table public.reports alter column id set default gen_random_uuid();
  end if;
end $$;

alter table public.reports enable row level security;

-- Repart d'un état connu : on retire toutes les policies existantes.
do $$
declare r record;
begin
  for r in select policyname from pg_policies where schemaname = 'public' and tablename = 'reports' loop
    execute format('drop policy %I on public.reports', r.policyname);
  end loop;
end $$;

-- Un utilisateur connecté signale en son nom ; il relit les siens ;
-- l'équipe lit et traite tout ; seul un admin supprime.
create policy "reports_insert_own" on public.reports
  for insert to authenticated with check (user_id = auth.uid());
create policy "reports_select" on public.reports
  for select to authenticated using (user_id = auth.uid() or public.is_team());
create policy "reports_update_team" on public.reports
  for update to authenticated using (public.is_team()) with check (public.is_team());
create policy "reports_delete_admin" on public.reports
  for delete to authenticated using (public.is_admin());

-- Quota : 10 signalements par heure et par utilisateur (anti-spam).
create or replace function public.limit_report_inserts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_team() then return new; end if;
  if (select count(*) from public.reports
       where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de signalements en peu de temps. Réessayez plus tard.';
  end if;
  return new;
end; $$;

drop trigger if exists limit_report_inserts on public.reports;
create trigger limit_report_inserts
  before insert on public.reports
  for each row execute function public.limit_report_inserts();

commit;

-- ============================================================
-- VÉRIFICATIONS (à lancer après le commit)
-- ============================================================

-- 1) Policies en place : attendu, pour chaque table, exactement les lignes
--    décrites ci-dessus (pas de policy « for all » ouverte à tous).
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('profiles', 'proposals', 'decisions', 'providers', 'reports', 'team_invitations')
 order by tablename, policyname;

-- 2) Privilèges de colonne sur profiles : attendu = name, role uniquement.
select column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'public' and table_name = 'profiles' and grantee = 'authenticated'
   and privilege_type = 'UPDATE'
 order by column_name;

-- 3) La fonction interne ne doit PAS être appelable par l'API : attendu = false.
select has_function_privilege('anon', 'public._apply_invitation(uuid, text)', 'execute') as anon_peut_executer,
       has_function_privilege('authenticated', 'public._apply_invitation(uuid, text)', 'execute') as connecte_peut_executer;
