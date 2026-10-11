-- ============================================================
-- Diaba Guide — Connexion par numéro de téléphone, quel que soit le compte
--
-- Les comptes créés sans adresse se connectent avec leur numéro : l'adresse
-- interne se déduit du numéro, aucun calcul supplémentaire n'est nécessaire.
--
-- Mais un compte créé AVANT (ou avec) une adresse e-mail a un vrai
-- identifiant : c'est cette adresse. Un tel compte ne pourrait donc pas se
-- connecter avec son numéro, même après que l'équipe y a ajouté un téléphone.
-- Cette fonction comble ce trou : elle donne l'identifiant à utiliser pour un
-- numéro donné.
--
-- Ce qu'elle révèle, et ce qu'elle ne révèle pas : pour un numéro connu, elle
-- rend l'adresse de connexion du compte (nécessaire pour se connecter). Elle
-- ne dit rien d'autre : ni mot de passe, ni profil, ni rôle. Et pour un numéro
-- inconnu, elle rend l'identifiant interne plausible, afin que la connexion
-- échoue sur le message habituel « identifiants incorrects » au lieu de
-- révéler par un message particulier qu'aucun compte n'existe.
-- ============================================================

create or replace function public.login_for_phone(p_phone text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  k text := public.phone_key(p_phone);
  v_email text;
begin
  if length(k) < 6 then return null; end if;

  select email into v_email
    from public.profiles
   where phone_key = k
   order by created_at
   limit 1;
  if v_email is not null then return v_email; end if;

  return public.email_for_phone(k);
end $$;

comment on function public.login_for_phone(text) is
  'Identifiant de connexion associé à un numéro de téléphone (adresse réelle ou interne).';

revoke all on function public.login_for_phone(text) from public;
grant execute on function public.login_for_phone(text) to anon, authenticated;