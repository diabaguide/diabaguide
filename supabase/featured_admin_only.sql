-- ============================================================
-- Diaba Guide — Mise en avant réservée aux administrateurs
-- L'équipe peut déjà modifier une fiche (providers_update_team, voir
-- security_fixes.sql), y compris featured techniquement. Ce trigger
-- interdit spécifiquement de changer featured à qui n'est pas
-- administrateur (le front-end n'affiche d'ailleurs ce bouton qu'aux
-- administrateurs, voir src/pages/admin/Fiches.tsx).
-- À exécuter après admin_roles.sql (nécessite is_admin()). Idempotent.
-- ============================================================

create or replace function public.guard_provider_featured()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.featured is distinct from old.featured then
    -- Contexte SQL Editor / service (auth.uid() nul) : autorisé.
    if auth.uid() is null then return new; end if;
    if not public.is_admin() then
      raise exception 'Seul un administrateur peut mettre en avant une fiche.';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_provider_featured_change on public.providers;
create trigger on_provider_featured_change
  before update on public.providers
  for each row execute function public.guard_provider_featured();
