-- ============================================================
-- Diaba Guide — Suivi public d'une expédition (modèle fret actuel)
-- Lot 1 adapté : ne remplace pas le schéma fret en production.
--
-- Dépend de : fret_module.sql + expedition_etapes.sql.
-- La seule donnée ouverte aux anonymes est le résumé public d'un lot
-- identifié par son code. Aucun nom de client, téléphone, colis ou note
-- interne n'est renvoyé.
-- ============================================================

create or replace function public.suivi_expedition_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'code', e.code,
           'mode', e.mode,
           'destination', e.destination,
           'statut', e.statut,
           'cloturee_le', e.cloturee_le,
           'partie_le', e.partie_le,
           'arrivee_le', e.arrivee_le,
           'etapes', coalesce((
             select jsonb_agg(
                      jsonb_build_object(
                        'type', ee.type,
                        'au', ee.au
                      )
                      order by ee.au, ee.created_at, ee.id
                    )
               from public.expedition_etapes ee
              where ee.expedition_code = e.code
                and ee.visible_client = true
           ), '[]'::jsonb)
         )
    from public.expeditions e
   where e.code = upper(btrim(p_code));
$$;

revoke all on function public.suivi_expedition_public(text) from public;
grant execute on function public.suivi_expedition_public(text) to anon, authenticated;
