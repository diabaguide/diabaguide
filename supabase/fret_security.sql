-- Protection des données internes du fret. Exécuter après fret_module.sql et
-- fret_tarifs.sql. Idempotent et sans suppression de données.

-- Une vue créée par postgres peut contourner la RLS des tables sources.
-- La garde explicite fonctionne aussi sur les versions antérieures à PG 15.
create or replace view public.v_expedition_totaux as
  select
    e.code, e.mode, e.statut, e.seuil_kg, e.seuil_m3,
    count(c.code) as nb_colis,
    coalesce(sum(c.poids_kg), 0) as total_kg,
    coalesce(sum(c.volume_m3), 0) as total_m3,
    case when e.seuil_kg is not null and e.seuil_kg > 0
         then round(100 * coalesce(sum(c.poids_kg), 0) / e.seuil_kg, 1) end as pct_kg,
    case when e.seuil_m3 is not null and e.seuil_m3 > 0
         then round(100 * coalesce(sum(c.volume_m3), 0) / e.seuil_m3, 1) end as pct_m3
  from public.expeditions e
  left join public.colis c on c.expedition_code = e.code
  where public.is_team()
  group by e.code, e.mode, e.statut, e.seuil_kg, e.seuil_m3;
revoke all on public.v_expedition_totaux from public, anon;
grant select on public.v_expedition_totaux to authenticated;

-- La RLS limite les lignes, pas les colonnes. Le navigateur n'a besoin ni des
-- notes internes, ni du code client interne, ni de l'auteur d'une étape.
revoke select on public.colis from public, anon, authenticated;
revoke select (note_interne, code_client) on public.colis from public, anon, authenticated;
grant select (
  code, expedition_code, profile_id, client_nom, client_tel, marque_colis,
  mode, type_marchandise, description, poids_kg, volume_m3, photos, statut,
  recu_chine_le, created_at, updated_at
) on public.colis to authenticated;

revoke select on public.colis_etapes from public, anon, authenticated;
revoke select (note_interne, par) on public.colis_etapes from public, anon, authenticated;
grant select (id, colis_code, type, au, visible_client, created_at)
  on public.colis_etapes to authenticated;
