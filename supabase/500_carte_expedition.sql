-- ============================================================
-- Diaba Guide — Carte d'expédition (« shipping mark »)
--
-- Données dont la carte a besoin et que la base ne stockait pas encore :
--   1. un NUMÉRO DE CLIENT, attribué automatiquement à chaque compte (par ordre
--      d'inscription : les comptes existants sont numérotés d'après leur date de
--      création, puis chaque nouveau compte reçoit le suivant). Il sert de
--      « (0022) » sur la carte et de base au code-barres ;
--   2. un NOM COURT (« BTC »), choisi par le voyageur : 2 à 10 lettres ou chiffres
--      non accentués, mis en majuscules ;
--   3. pour chaque ENTREPÔT : téléphone de réception et contact du bureau (nom et
--      téléphone), modifiables dans « Tarifs et entrepôts ». L'adresse et les
--      horaires, eux, sont imprimés dans le modèle de la carte (image).
--
-- Sûreté :
--   - ajout uniquement : rien n'est supprimé, aucun compte n'est modifié en dehors
--     de la nouvelle colonne client_no ;
--   - un voyageur ne peut PAS modifier son numéro de client ni, directement, son
--     nom court : les droits d'écriture sur `profiles` sont limités aux colonnes
--     name et role (060_security_fixes.sql). Le nom court passe par une fonction
--     qui ne touche que cette colonne, sur sa propre fiche ;
--   - la lecture des informations d'un AUTRE client est réservée au fret
--     (livreur, équipe, administrateurs).
--
-- Les numéros ne sont jamais réattribués : si un compte est supprimé, son numéro
-- reste perdu (des cartes imprimées peuvent encore le porter).
--
-- Dépend de : 020_auth.sql, 100_profile_phone.sql, 150_admin_travelers.sql
-- (is_suspended), 240_fret_module.sql (warehouses), 310_livreur.sql (is_fret).
-- Idempotent.
-- ============================================================

-- ---------- 1. Numéro de client ----------
create sequence if not exists public.profiles_client_no_seq;

alter table public.profiles add column if not exists client_no integer;

-- Numérotation des comptes existants, par ordre de création. Le calcul ne dépend pas
-- de l'ordre d'évaluation de nextval() : le rang est fixé avant la mise à jour.
with a_numeroter as (
  select id,
         coalesce((select max(client_no) from public.profiles), 0)
           + row_number() over (order by created_at, id) as numero
    from public.profiles
   where client_no is null
)
update public.profiles p
   set client_no = a.numero
  from a_numeroter a
 where p.id = a.id;

-- La séquence repart après le plus grand numéro, sans jamais reculer.
select setval(
  'public.profiles_client_no_seq',
  greatest(
    coalesce((select max(client_no) from public.profiles), 0) + 1,
    (select case when is_called then last_value + 1 else last_value end from public.profiles_client_no_seq)
  ),
  false
);

alter table public.profiles alter column client_no set default nextval('public.profiles_client_no_seq');
alter table public.profiles alter column client_no set not null;
alter sequence public.profiles_client_no_seq owned by public.profiles.client_no;

alter table public.profiles drop constraint if exists profiles_client_no_range;
alter table public.profiles add constraint profiles_client_no_range check (client_no between 1 and 999999999);
create unique index if not exists profiles_client_no_key on public.profiles (client_no);

-- Les comptes créés côté serveur (clé de service) reçoivent aussi leur numéro.
grant usage, select on sequence public.profiles_client_no_seq to service_role;

-- ---------- 2. Nom court ----------
alter table public.profiles add column if not exists entry_name text;

alter table public.profiles drop constraint if exists profiles_entry_name_format;
alter table public.profiles add constraint profiles_entry_name_format
  check (entry_name is null or entry_name ~ '^[A-Z0-9]{2,10}$');

-- Met un nom court en forme : majuscules, lettres A–Z et chiffres seulement.
create or replace function public.clean_entry_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select upper(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Chacun choisit son propre nom court.
create or replace function public.set_my_entry_name(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text := public.clean_entry_name(p_name);
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour choisir votre nom court.';
  end if;
  if public.is_suspended() then
    raise exception 'Ce compte est désactivé.';
  end if;
  if length(v) < 2 or length(v) > 10 then
    raise exception 'Le nom court doit contenir de 2 à 10 lettres ou chiffres (sans accents ni espaces).';
  end if;
  update public.profiles set entry_name = v where id = auth.uid();
  return v;
end; $$;

-- Le fret peut corriger le nom court d'un client (à la réception d'un colis).
create or replace function public.set_client_entry_name(p_profile uuid, p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v text := public.clean_entry_name(p_name);
begin
  if auth.uid() is null or not public.is_fret() then
    raise exception 'Réservé à l''équipe fret.';
  end if;
  if length(v) < 2 or length(v) > 10 then
    raise exception 'Le nom court doit contenir de 2 à 10 lettres ou chiffres (sans accents ni espaces).';
  end if;
  update public.profiles set entry_name = v where id = p_profile;
  if not found then raise exception 'Client introuvable.'; end if;
  return v;
end; $$;

-- ---------- 3. Informations imprimées sur la carte ----------
-- Soi-même (sans argument), ou n'importe quel client pour le fret.
create or replace function public.client_shipping_info(p_profile uuid default null)
returns table (client_no integer, entry_name text, name text, phone text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_profile, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour afficher votre carte d''expédition.';
  end if;
  if v_id is distinct from auth.uid() and not public.is_fret() then
    raise exception 'Réservé à l''équipe fret.';
  end if;
  return query
    select p.client_no, p.entry_name, p.name, p.phone
      from public.profiles p
     where p.id = v_id;
end; $$;

revoke all on function public.clean_entry_name(text) from public, anon;
revoke all on function public.set_my_entry_name(text) from public, anon;
revoke all on function public.set_client_entry_name(uuid, text) from public, anon;
revoke all on function public.client_shipping_info(uuid) from public, anon;
grant execute on function public.set_my_entry_name(text) to authenticated;
grant execute on function public.set_client_entry_name(uuid, text) to authenticated;
grant execute on function public.client_shipping_info(uuid) to authenticated;

-- ---------- 4. Entrepôts : contacts ----------
alter table public.warehouses add column if not exists tel text;         -- téléphone de réception de l'entrepôt
alter table public.warehouses add column if not exists bureau_nom text;  -- contact du bureau (ex. « Arkim »)
alter table public.warehouses add column if not exists bureau_tel text;  -- téléphone du bureau
