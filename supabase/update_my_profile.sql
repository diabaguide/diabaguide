-- Chaque utilisateur modifie son propre nom et son propre téléphone.
-- Passer par une fonction (plutôt que par la politique profiles_update_own)
-- limite la modification à ces deux colonnes : rôle, statut et e-mail restent
-- hors de portée de l'utilisateur. Le numéro doit rester unique (un numéro =
-- un compte, voir supabase/phone_signup.sql).
create or replace function public.update_my_profile(p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_key text;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour modifier votre profil.';
  end if;
  if public.is_suspended() then
    raise exception 'Ce compte est désactivé.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères.';
  end if;
  if v_phone is not null then
    v_key := public.phone_key(v_phone);
    if length(v_key) < 6 then
      raise exception 'Numéro de téléphone invalide.';
    end if;
    if exists (select 1 from public.profiles where phone_key = v_key and id <> auth.uid()) then
      raise exception 'Ce numéro de téléphone est déjà associé à un autre compte.';
    end if;
  end if;

  update public.profiles
     set name = trim(p_name), phone = v_phone
   where id = auth.uid();
end; $$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;
