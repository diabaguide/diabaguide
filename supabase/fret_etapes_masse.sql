-- Diaba Guide — Mise à jour manuelle de plusieurs expéditions
-- La progression est vérifiée en base avant chaque ajout d'étape.

create or replace function public.ajouter_etapes_expeditions(
  p_codes text[],
  p_type etape_type
) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_cible integer;
  v_courante integer;
  v_count integer := 0;
begin
  if not public.is_fret() then raise exception 'Réservé à l''équipe fret.'; end if;
  if p_type in ('annonce', 'recu_chine') then raise exception 'Cette étape concerne un colis, pas une expédition.'; end if;

  v_cible := case p_type
    when 'regroupe' then 0 when 'depart' then 1 when 'en_transit' then 2
    when 'arrive_dakar' then 3 when 'chez_diaba' then 4 when 'dispo_retrait' then 5
    when 'en_livraison' then 6 when 'remis' then 7 else -1 end;

  if v_cible < 0 then raise exception 'Étape inconnue.'; end if;

  for v_code in select distinct trim(value) from unnest(coalesce(p_codes, '{}'::text[])) as value where trim(value) <> '' loop
    if exists (select 1 from public.expeditions where code = v_code) then
      select coalesce(max(case type
        when 'regroupe' then 0 when 'depart' then 1 when 'en_transit' then 2
        when 'arrive_dakar' then 3 when 'chez_diaba' then 4 when 'dispo_retrait' then 5
        when 'en_livraison' then 6 when 'remis' then 7 else -1 end), -1)
        into v_courante
        from public.expedition_etapes where expedition_code = v_code;

      if v_cible > v_courante then
        perform public.ajouter_etape_expedition(v_code, p_type, null, null);
        v_count := v_count + 1;
      end if;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.ajouter_etapes_expeditions(text[], etape_type) from public, anon;
grant execute on function public.ajouter_etapes_expeditions(text[], etape_type) to authenticated;
