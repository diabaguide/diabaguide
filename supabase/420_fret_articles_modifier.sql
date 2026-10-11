-- Diaba Guide — Modification des articles détaillés
-- Adaptation additive au schéma fret Production.

create or replace function public.admin_modifier_article(
  p_id       uuid,
  p_nom      text,
  p_quantite numeric,
  p_poids_kg numeric default null
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_team() then raise exception 'Réservé à l''équipe'; end if;
  if p_nom is null or btrim(p_nom) = '' then raise exception 'Le nom de l''article est obligatoire'; end if;
  if p_quantite is null or p_quantite <= 0 then raise exception 'La quantité doit être supérieure à zéro'; end if;
  if p_poids_kg is not null and p_poids_kg < 0 then raise exception 'Le poids ne peut pas être négatif'; end if;

  update public.expedition_articles
     set nom = btrim(p_nom), quantite = p_quantite, poids_kg = p_poids_kg
   where id = p_id;
  if not found then raise exception 'Article introuvable'; end if;
end;
$$;

revoke all on function public.admin_modifier_article(uuid, text, numeric, numeric) from public, anon;
grant execute on function public.admin_modifier_article(uuid, text, numeric, numeric) to authenticated;
