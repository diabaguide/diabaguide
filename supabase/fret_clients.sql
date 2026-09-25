-- ============================================================
-- Diaba Guide — Module Fret : recherche de clients
-- Permet à l'équipe de choisir un client dans la liste des comptes voyageurs.
-- SECURITY DEFINER + garde is_team : l'équipe cherche un client sans
-- exposer toute la table profiles (lecture réservée aux admins).
--
-- À exécuter APRÈS fret_module.sql. Idempotent.
-- Les voyageurs sont les clients du fret : aucune table client séparée.
-- ============================================================

create or replace function public.rechercher_clients(p_q text default '')
returns table (id uuid, name text, phone text)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.phone
  from public.profiles p
  where public.is_team()
    and p.role = 'traveler'
    and (coalesce(p_q, '') = ''
         or p.name  ilike '%' || p_q || '%'
         or p.phone ilike '%' || p_q || '%'
         or p.email ilike '%' || p_q || '%')
  order by p.name nulls last
  limit 20;
$$;
grant execute on function public.rechercher_clients(text) to authenticated;

-- Toute nouvelle réception doit appartenir à un compte voyageur existant.
-- Les anciens colis sans profil restent modifiables pour être rapprochés.
create or replace function public.verifier_voyageur_colis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is null or not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.role = 'traveler'
  ) then
    raise exception 'Un compte voyageur est obligatoire pour ce colis.';
  end if;
  return new;
end; $$;
revoke all on function public.verifier_voyageur_colis() from public, anon, authenticated;

drop trigger if exists on_colis_voyageur_required on public.colis;
create trigger on_colis_voyageur_required
  before insert or update of profile_id on public.colis
  for each row execute function public.verifier_voyageur_colis();
