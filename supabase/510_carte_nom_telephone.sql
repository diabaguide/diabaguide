-- ============================================================
-- Diaba Guide — Carte d'expédition : nom et téléphone propres à la carte
--
-- Le client peut faire imprimer sur sa carte un nom et un téléphone différents de ceux
-- de son compte (nom de l'entreprise, numéro utilisé avec le transitaire…). Ces deux
-- valeurs sont facultatives : vides, la carte reprend le nom et le téléphone du profil.
-- Le profil lui-même n'est jamais modifié.
--
-- Sûreté : comme le numéro de client et le nom court (500), ces colonnes ne sont pas
-- modifiables directement par le client (aucun droit d'écriture sur la colonne) :
-- il passe par une fonction qui vérifie son identité et nettoie les valeurs.
-- Le fret peut corriger celles d'un client.
--
-- Dépend de : 500_carte_expedition.sql
-- Idempotent.
-- ============================================================

alter table public.profiles add column if not exists card_name text;
alter table public.profiles add column if not exists card_phone text;

alter table public.profiles drop constraint if exists profiles_card_name_len;
alter table public.profiles add constraint profiles_card_name_len
  check (card_name is null or char_length(card_name) between 2 and 40);
alter table public.profiles drop constraint if exists profiles_card_phone_format;
alter table public.profiles add constraint profiles_card_phone_format
  check (card_phone is null or (char_length(card_phone) between 6 and 25 and card_phone ~ '^[0-9+()./ -]+$'));

-- Nettoyage : espaces superflus retirés ; vide → null (retour aux valeurs du profil).
create or replace function public.clean_card_text(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'), '')
$$;

create or replace function public._set_card_contact(p_profile uuid, p_name text, p_phone text)
returns table (card_name text, card_phone text)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := public.clean_card_text(p_name);
  v_phone text := public.clean_card_text(p_phone);
begin
  if v_name is not null and char_length(v_name) not between 2 and 40 then
    raise exception 'Le nom de la carte doit contenir de 2 à 40 caractères.';
  end if;
  if v_phone is not null and (char_length(v_phone) not between 6 and 25 or v_phone !~ '^[0-9+()./ -]+$') then
    raise exception 'Le téléphone de la carte ne doit contenir que des chiffres, espaces, + ( ) . / - (6 à 25 caractères).';
  end if;
  update public.profiles p set card_name = v_name, card_phone = v_phone where p.id = p_profile;
  if not found then raise exception 'Client introuvable.'; end if;
  return query select v_name, v_phone;
end; $$;

-- Soi-même.
create or replace function public.set_my_card_contact(p_name text, p_phone text)
returns table (card_name text, card_phone text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour modifier votre carte d''expédition.';
  end if;
  if public.is_suspended() then
    raise exception 'Ce compte est désactivé.';
  end if;
  return query select * from public._set_card_contact(auth.uid(), p_name, p_phone);
end; $$;

-- Le fret, pour un client.
create or replace function public.set_client_card_contact(p_profile uuid, p_name text, p_phone text)
returns table (card_name text, card_phone text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_fret() then
    raise exception 'Réservé à l''équipe fret.';
  end if;
  return query select * from public._set_card_contact(p_profile, p_name, p_phone);
end; $$;

-- Informations de la carte : `name` et `phone` sont les valeurs imprimées (celles de la
-- carte, à défaut celles du profil) ; `profile_name` / `profile_phone` donnent les valeurs
-- du profil, `card_name` / `card_phone` les valeurs propres à la carte (null si aucune).
drop function if exists public.client_shipping_info(uuid);
create function public.client_shipping_info(p_profile uuid default null)
returns table (client_no integer, entry_name text, name text, phone text,
               card_name text, card_phone text, profile_name text, profile_phone text)
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
    select p.client_no, p.entry_name,
           coalesce(p.card_name, p.name), coalesce(p.card_phone, p.phone),
           p.card_name, p.card_phone, p.name, p.phone
      from public.profiles p
     where p.id = v_id;
end; $$;

revoke all on function public.clean_card_text(text) from public, anon;
revoke all on function public._set_card_contact(uuid, text, text) from public, anon, authenticated;
revoke all on function public.set_my_card_contact(text, text) from public, anon;
revoke all on function public.set_client_card_contact(uuid, text, text) from public, anon;
revoke all on function public.client_shipping_info(uuid) from public, anon;
grant execute on function public.set_my_card_contact(text, text) to authenticated;
grant execute on function public.set_client_card_contact(uuid, text, text) to authenticated;
grant execute on function public.client_shipping_info(uuid) to authenticated;
