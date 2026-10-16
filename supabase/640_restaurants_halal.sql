-- ============================================================
-- Diaba Guide — Restaurants halal (déclaration éditoriale validée)
--
-- L'équipe confirme que TOUS les restaurants actuellement sur la plateforme
-- servent une cuisine halal. Cette migration met à jour uniquement les fiches
-- dont cat = 'resto' : elle conserve leur description et ajoute exactement
-- « Cuisine halal. Halal. » une seule fois. Elle confirme aussi le champ
-- historique halal = Oui.
--
-- Si la migration 620 est présente, halal_status est mis à confirmed.
-- Sinon ce champ est simplement ignoré : la migration reste exécutable.
--
-- RETOUR ARRIÈRE (rollback) : rétablir depuis une sauvegarde éditoriale les
-- descriptions et statuts précédents. Il n'y a pas de rollback automatique,
-- car les descriptions antérieures ne doivent pas être devinées.
-- ============================================================

do $$
begin
  update public.providers
  set
    description = case
      when coalesce(description, '') ilike '%Cuisine halal. Halal.%' then description
      else concat_ws(E'\n\n', nullif(btrim(description), ''), 'Cuisine halal. Halal.')
    end,
    halal = 'Oui'
  where cat = 'resto';

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'providers' and column_name = 'halal_status'
  ) then
    execute 'update public.providers set halal_status = ''confirmed'' where cat = ''resto''';
  end if;
end $$;

notify pgrst, 'reload schema';
