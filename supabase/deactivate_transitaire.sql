-- ============================================================
-- Diaba Guide — Retrait du module « Transitaires »
-- Désactive la catégorie et son catalogue produits/services plutôt que de
-- les supprimer : les fiches existantes (ex. Sino-Dakar Cargo) restent
-- consultables, mais la catégorie disparaît des filtres, de l'accueil et
-- de l'assistant de contribution (voir src/data.ts : STATIC_CATEGORIES).
-- À exécuter après taxonomies.sql. Idempotent.
-- ============================================================

update public.categories set active = false where id = 'transitaire';

update public.product_tags set active = false where category_id = 'transitaire';
