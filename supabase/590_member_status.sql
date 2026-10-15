-- Diaba Guide — Désactiver / réactiver un membre de l'équipe (actions groupées).
-- Additif et idempotent. À exécuter dans l'éditeur SQL de Supabase.
-- Jamais concernés : soi-même, l'administrateur principal, le dernier administrateur actif.

create or replace function public.admin_set_member_status(
  p_id uuid, p_status text, p_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  v record;
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

  select id, role, is_primary_admin, status into v from public.profiles where id = p_id;
  if v.id is null then
    raise exception 'Compte introuvable.';
  end if;
  if v.role = 'traveler' then
    raise exception 'Ce compte est un voyageur : gérez-le depuis la page Voyageurs.';
  end if;
  if p_status = 'suspended' then
    if v.is_primary_admin then
      raise exception 'Administrateur principal : il ne peut pas être désactivé.';
    end if;
    if v.role = 'admin' and v.status = 'active' and (
      select count(*) from public.profiles
       where role = 'admin' and status = 'active' and deleted_at is null
    ) <= 1 then
      raise exception 'Dernier administrateur : il ne peut pas être désactivé.';
    end if;
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

revoke all on function public.admin_set_member_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_member_status(uuid, text, text) to authenticated;
