-- Diaba Guide — Date d'arrivée prévisionnelle des expéditions
-- Migration additive : ne modifie ni le statut ni les étapes existantes.

alter table public.expeditions
  add column if not exists arrivee_prevue date;

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
           'arrivee_prevue', e.arrivee_prevue,
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
