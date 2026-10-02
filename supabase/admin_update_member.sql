-- Modifier le nom et le téléphone de n'importe quel compte (voyageur, équipe,
-- administrateur), depuis la page « Membres ». Réservé aux administrateurs.
-- Le rôle n'est pas touché ici : il garde ses propres garde-fous
-- (dernier administrateur, etc.). L'unicité du numéro reste assurée par le
-- déclencheur profiles_phone_key (supabase/phone_signup.sql).
create or replace function public.admin_update_member(
  p_id uuid, p_name text, p_phone text
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.';
  end if;
  if not exists (select 1 from public.profiles where id = p_id) then
    raise exception 'Compte introuvable.';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'Le nom doit contenir au moins 2 caractères.';
  end if;
  if v_phone is not null
     and length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 then
    raise exception 'Numéro de téléphone invalide.';
  end if;

  update public.profiles
     set name = trim(p_name), phone = v_phone
   where id = p_id;
end; $$;

revoke all on function public.admin_update_member(uuid, text, text) from public, anon;
grant execute on function public.admin_update_member(uuid, text, text) to authenticated;
