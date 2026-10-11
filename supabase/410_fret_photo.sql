-- Diaba Guide — Photo opérationnelle d'une expédition
-- Adaptation additive au schéma fret Production : les lots sont identifiés par code.

alter table public.expeditions add column if not exists photo text;

create or replace function public.admin_maj_expedition_photo(
  p_code text,
  p_photo text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if not public.is_fret() then raise exception 'Réservé à l''équipe fret'; end if;
  update public.expeditions
     set photo = nullif(btrim(p_photo), ''), updated_at = now()
   where code = p_code;
  if not found then raise exception 'Expédition introuvable'; end if;
end;
$$;

revoke all on function public.admin_maj_expedition_photo(text, text) from public, anon;
grant execute on function public.admin_maj_expedition_photo(text, text) to authenticated;

-- Le bucket fret-photos et ses politiques existent déjà en Production.
-- Ils restent privés : lecture authentifiée, écriture fret, suppression équipe.
