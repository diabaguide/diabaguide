-- Vérifications en lecture seule après fret_clients.sql et fret_security.sql.
-- Exécuter dans le SQL Editor ; aucune donnée n'est modifiée.

select
  (select count(*) from public.colis) as colis_total,
  (select count(*) from public.colis where profile_id is null) as colis_anciens_sans_compte,
  (select count(*) from public.colis c
    left join public.profiles p on p.id = c.profile_id
    where c.profile_id is not null and p.role is distinct from 'traveler')
    as colis_lies_a_un_autre_role;

select
  has_function_privilege('authenticated', 'public.rechercher_clients(text)', 'EXECUTE')
    as recherche_voyageurs_autorisee,
  has_table_privilege('anon', 'public.v_expedition_totaux', 'SELECT')
    as vue_totaux_accessible_anonyme,
  has_column_privilege('authenticated', 'public.colis', 'note_interne', 'SELECT')
    as notes_colis_lisibles,
  has_column_privilege('authenticated', 'public.colis', 'code_client', 'SELECT')
    as codes_internes_lisibles,
  has_column_privilege('authenticated', 'public.colis_etapes', 'note_interne', 'SELECT')
    as notes_etapes_lisibles;

select tgname as declencheur_colis
from pg_trigger
where tgrelid = 'public.colis'::regclass
  and tgname = 'on_colis_voyageur_required'
  and not tgisinternal;
