-- Import atomique des expéditions déjà en cours lors de la mise en service.
-- Les lignes existantes sont ignorées : l'import ne remplace jamais un lot suivi.

create or replace function public.importer_expeditions(p_rows jsonb)
returns table(imported integer, skipped integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_code text;
  v_mode_text text;
  v_etape_text text;
  v_arrivee_text text;
  v_inserted integer;
  v_imported integer := 0;
  v_skipped integer := 0;
begin
  if not public.is_fret() then
    raise exception 'Réservé à l’équipe fret.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Le contenu de l’import doit être une liste.';
  end if;
  if jsonb_array_length(p_rows) = 0 then
    raise exception 'Aucune expédition à importer.';
  end if;
  if jsonb_array_length(p_rows) > 200 then
    raise exception 'Un import est limité à 200 expéditions.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_code := trim(coalesce(v_row ->> 'code', ''));
    v_mode_text := trim(coalesce(v_row ->> 'mode', ''));
    v_etape_text := nullif(trim(coalesce(v_row ->> 'etape', '')), '');
    v_arrivee_text := nullif(trim(coalesce(v_row ->> 'arriveePrevue', '')), '');

    if v_code = '' then
      raise exception 'Chaque expédition doit avoir un code.';
    end if;
    if v_mode_text not in ('maritime_groupage', 'maritime_complet', 'aerien_fret', 'aerien_express') then
      raise exception 'Mode invalide pour l’expédition %.', v_code;
    end if;
    if v_etape_text is not null and v_etape_text not in (
      'regroupe', 'depart', 'en_transit', 'arrive_dakar',
      'chez_diaba', 'dispo_retrait', 'en_livraison', 'remis'
    ) then
      raise exception 'Étape invalide pour l’expédition %.', v_code;
    end if;
    if v_arrivee_text is not null and v_arrivee_text !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Date d’arrivée invalide pour l’expédition %.', v_code;
    end if;

    insert into public.expeditions (
      code, mode, destination, arrivee_prevue, container_no, bl_no, awb_no
    ) values (
      v_code,
      v_mode_text::public.fret_mode,
      coalesce(nullif(trim(coalesce(v_row ->> 'destination', '')), ''), 'Dakar'),
      v_arrivee_text::date,
      nullif(trim(coalesce(v_row ->> 'containerNo', '')), ''),
      nullif(trim(coalesce(v_row ->> 'blNo', '')), ''),
      nullif(trim(coalesce(v_row ->> 'awbNo', '')), '')
    )
    on conflict (code) do nothing;

    get diagnostics v_inserted = row_count;
    if v_inserted = 0 then
      v_skipped := v_skipped + 1;
    else
      v_imported := v_imported + 1;
      if v_etape_text is not null then
        perform public.ajouter_etape_expedition(
          v_code,
          v_etape_text::public.etape_type,
          null,
          'Import initial'
        );
        update public.expeditions
           set statut = case v_etape_text
                 when 'regroupe' then 'cloturee'::public.expedition_statut
                 when 'depart' then 'partie'::public.expedition_statut
                 when 'en_transit' then 'partie'::public.expedition_statut
                 when 'arrive_dakar' then 'arrivee'::public.expedition_statut
                 when 'chez_diaba' then 'arrivee'::public.expedition_statut
                 when 'remis' then 'livree'::public.expedition_statut
                 else statut
               end,
               updated_at = now()
         where code = v_code;
      end if;
    end if;
  end loop;

  return query select v_imported, v_skipped;
end;
$$;

revoke all on function public.importer_expeditions(jsonb) from public, anon;
grant execute on function public.importer_expeditions(jsonb) to authenticated;
