-- ============================================================
-- Diaba Guide — suppression définitive des anciennes adresses fret
--
-- Les catégories « transport » et « transitaire » ne font plus partie
-- du catalogue d’adresses. Cette migration supprime uniquement les
-- fiches et propositions de ces catégories, puis les taxonomies liées.
--
-- Sécurité : à exécuter seulement après le contrôle des références
-- métier. En production, le contrôle préalable du 2026-10-16 a trouvé :
--   - 0 note, avis, signalement ou article d’achat lié ;
--   - 0 expédition liée (le schéma fret courant n’a pas provider_id) ;
--   - 0 photo de proposition ;
--   - 13 photos de fiches supprimées séparément du bucket fiche-photos.
-- Les suppressions ci-dessous sont idempotentes une fois les catégories
-- retirées. Les contraintes de clés étrangères empêchent toute suppression
-- si une relation non prévue existe.
-- ============================================================

begin;

-- Les fiches d’adresses qui ne font plus partie du produit.
delete from public.providers
where cat in ('transport', 'transitaire');

-- Les propositions correspondantes ne doivent plus réintroduire ces fiches.
delete from public.proposals
where cat in ('transport', 'transitaire');

-- product_tags est supprimé en cascade par sa clé étrangère category_id.
delete from public.categories
where id in ('transport', 'transitaire');

commit;
