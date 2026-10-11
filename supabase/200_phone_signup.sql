-- ============================================================
-- Diaba Guide — Inscription sans adresse e-mail
--
-- Le téléphone devient l'identifiant du compte : à l'inscription on ne demande
-- plus que le nom, le numéro et un mot de passe. L'adresse e-mail reste
-- possible mais facultative (elle sert alors à récupérer un mot de passe
-- oublié).
--
-- Supabase exige une adresse pour créer un compte : les comptes sans e-mail
-- reçoivent une adresse interne, fabriquée à partir du numéro
-- (`p782254040@diabaguide.local`). Elle n'est jamais montrée au voyageur, ne
-- sert à aucun envoi, et permet de retrouver le compte à partir du numéro.
--
-- La règle de normalisation ci-dessous est le miroir exact de
-- `src/lib/phone.ts` : « +221 78 225 40 40 », « 00221782254040 » et
-- « 78 225 40 40 » doivent désigner le même compte. Toute modification d'un
-- côté doit être répercutée de l'autre (vérifié par les tests croisés).
-- ============================================================

-- 1. Normalisation ----------------------------------------------------------

create or replace function public.phone_key(p_phone text)
returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if left(d, 5) = '00221' then d := substr(d, 6); end if;
  if left(d, 3) = '221' and length(d) > 9 then d := substr(d, 4); end if;
  return d;
end $$;

comment on function public.phone_key(text) is
  'Chiffres utiles d''un numéro, sans indicatif sénégalais. Miroir de phoneKey() dans src/lib/phone.ts.';

/** Numéro à afficher : « +221 78 225 40 40 » pour un numéro sénégalais. */
create or replace function public.phone_display(p_phone text)
returns text language plpgsql immutable as $$
declare
  k text := public.phone_key(p_phone);
begin
  if length(k) = 9 then
    return '+221 ' || substr(k, 1, 2) || ' ' || substr(k, 3, 3) || ' ' || substr(k, 6, 2) || ' ' || substr(k, 8, 2);
  end if;
  if length(k) >= 6 then return '+' || k; end if;
  return btrim(coalesce(p_phone, ''));
end $$;

/** Adresse interne d'un compte sans e-mail (jamais envoyée, jamais montrée). */
create or replace function public.email_for_phone(p_phone text)
returns text language sql immutable as $$
  select case when length(k) >= 6 then 'p' || k || '@diabaguide.local' else null end
    from (select public.phone_key(p_phone) as k) t
$$;

-- 2. Numéro unique par compte ----------------------------------------------

alter table public.profiles add column if not exists phone_key text;

/* Clé de rappel, tenue à jour automatiquement : les numéros déjà enregistrés
   sont normalisés au passage (aucune donnée perdue, aucun compte touché). */
create or replace function public.profiles_phone_key()
returns trigger language plpgsql as $$
begin
  new.phone_key := nullif(public.phone_key(new.phone), '');
  return new;
end $$;

drop trigger if exists profiles_phone_key on public.profiles;
create trigger profiles_phone_key
  before insert or update of phone on public.profiles
  for each row execute function public.profiles_phone_key();

/* Index simple, et non contrainte unique : deux comptes historiques partagent
   déjà un numéro (un essai et le vrai titulaire). Une contrainte unique
   refuserait la migration. Les nouveaux doublons sont empêchés à
   l'inscription, et l'application prévient avant même de créer le compte. */
create index if not exists profiles_phone_key_idx on public.profiles (phone_key);

-- 3. Le numéro est-il libre ? ----------------------------------------------

/* Appelée avant l'inscription pour afficher un message clair plutôt qu'une
   erreur technique. Ne renvoie qu'un booléen : aucune donnée personnelle ne
   peut être lue par ce chemin. */
create or replace function public.phone_available(p_phone text)
returns boolean language sql stable security definer set search_path = public as $$
  select length(public.phone_key(p_phone)) >= 6
     and not exists (select 1 from public.profiles where phone_key = public.phone_key(p_phone))
$$;

revoke all on function public.phone_available(text) from public;
grant execute on function public.phone_available(text) to anon, authenticated;
grant execute on function public.phone_key(text) to anon, authenticated;
grant execute on function public.phone_display(text) to anon, authenticated;

-- 4. Déclencheur d'inscription ---------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  invited_role text;
  v_tel text := coalesce(nullif(btrim(new.raw_user_meta_data->>'phone'), ''), '');
  v_key text;
begin
  /* Compte sans e-mail : le numéro est déduit de l'adresse interne
     (« p782254040@diabaguide.local »), l'application n'ayant transmis que lui. */
  if v_tel = '' and new.email like 'p%@diabaguide.local' then
    v_tel := public.phone_display(split_part(new.email, '@', 1));
  end if;
  v_key := public.phone_key(v_tel);

  /* Un numéro = un compte, comme sur WhatsApp. La vérification est aussi faite
     côté application ; ici elle garantit qu'aucun contournement ne passe. */
  if v_key <> '' and exists (select 1 from public.profiles where phone_key = v_key) then
    raise exception 'Ce numéro de téléphone est déjà associé à un compte.'
      using errcode = 'unique_violation';
  end if;

  select role into invited_role from public.team_invitations
   where lower(email) = lower(new.email) and accepted_at is null;

  insert into public.profiles (id, name, phone, email, role)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data->>'name'), ''),
             case when v_key <> '' then public.phone_display(v_tel) else split_part(new.email, '@', 1) end),
    nullif(btrim(v_tel), ''),
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

-- Rattrapage : les numéros déjà enregistrés reçoivent leur clé de rappel.
update public.profiles set phone = phone where phone is not null and phone_key is null;