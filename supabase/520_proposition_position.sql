-- ============================================================
-- Diaba Guide — Position d'un lieu proposé (envoyée avec Amap ou par GPS)
--
-- Le voyageur qui propose une adresse peut joindre la position du lieu : coordonnées
-- lues dans un lien Amap (déjà converties en WGS84, comme les fiches) ou prises au GPS
-- du téléphone. L'équipe les vérifie sur la carte, puis les reprend dans la fiche.
--
-- Colonnes facultatives :
--   lat, lng        coordonnées WGS84 (les deux ensemble, ou aucune)
--   position_link   lien Amap collé par le voyageur (l'équipe peut l'ouvrir si seul un
--                   lien raccourci a été fourni, sans coordonnées lisibles)
--
-- Aucune règle de droits à changer : le voyageur modifie déjà ses brouillons, l'équipe
-- ses propositions (060 §3) ; ces colonnes suivent les mêmes règles que le reste.
--
-- Dépend de : 010_schema.sql (proposals), 060_security_fixes.sql
-- Idempotent.
-- ============================================================

alter table public.proposals add column if not exists lat double precision;
alter table public.proposals add column if not exists lng double precision;
alter table public.proposals add column if not exists position_link text;

alter table public.proposals drop constraint if exists proposals_position_range;
alter table public.proposals add constraint proposals_position_range check (
  (lat is null and lng is null)
  or (lat is not null and lng is not null
      and lat between -90 and 90 and lng between -180 and 180 and not (lat = 0 and lng = 0))
);

alter table public.proposals drop constraint if exists proposals_position_link_len;
alter table public.proposals add constraint proposals_position_link_len check (
  position_link is null or char_length(position_link) <= 500
);
