# Scripts SQL — ordre d'exécution

Les scripts de ce dossier s'exécutent **à la main**, un par un, dans Supabase → SQL Editor. Ils ne forment pas une suite de migrations automatiques.

## À lire avant toute exécution

- **La base de production a déjà reçu tous les scripts numérotés.** Le numéro indique l'ordre dans lequel ils ont été appliqués la première fois. Il ne veut pas dire « à rejouer ».
- **Ne jamais utiliser `supabase db push` ni `supabase db reset` sur la production.** Le dossier `supabase/migrations/` n'existe pas, volontairement : ne pas le créer en y copiant ces scripts, sinon la CLI Supabase les appliquerait tous d'un coup.
- **Avant de relancer un script, lire son en-tête.** La plupart se déclarent « idempotents » (on peut les relancer sans risque), mais pas tous.
- **Nouveau script** : prendre le numéro suivant (`520_…`, `530_…`), garder les intervalles de 10 et écrire dans l'en-tête de quoi il dépend.
- Les dossiers `donnees/`, `controles/` et `historique/` sont hors de la séquence (voir plus bas).

## Séquence (numéros = ordre d'application)

### Socle : comptes, rôles, fiches

| N° | Script | Rôle | Dépend de |
|---|---|---|---|
| 010 | `010_schema.sql` | Tables de base (prestataires, propositions…) | — |
| 020 | `020_auth.sql` | Profils, `is_team()`, `is_admin()` | 010 |
| 030 | `030_admin_roles.sql` | Rôles équipe / admin, invitations | 020 |
| 040 | `040_taxonomies.sql` | Villes, catégories, étiquettes produits | 030 |
| 050 | `050_validation.sql` | Contraintes CHECK de taille et de format | 010 |
| 060 | `060_security_fixes.sql` | Correctifs de sécurité (audit) | 010 à 050 |
| 070 | `070_storage.sql` | Buckets et règles de stockage | 030 |
| 080 | `080_fiches.sql` | Gestion des fiches par l'équipe | 060 |
| 090 | `090_fiche_photos.sql` | Photos des fiches | 070, 080 |
| 100 | `100_profile_phone.sql` | Téléphone du profil | 030 |
| 110 | `110_deactivate_transitaire.sql` | Désactive la catégorie « Transitaires » | 040 |
| 120 | `120_unique_profile_email.sql` | Unicité de l'e-mail du profil | 020 |
| 130 | `130_featured_admin_only.sql` | « À la une » réservé aux admins | 030 |
| 140 | `140_ratings.sql` | Notes par étoiles | 060 |
| 150 | `150_admin_travelers.sql` | Gestion des voyageurs par les admins | 100 |
| 160 | `160_shopping_lists.sql` | Listes d'achats, `touch_updated_at()` | 060 |
| 170 | `170_reviews.sql` | Avis | 070, 140 |
| 180 | `180_storage_cleanup.sql` | Photos supprimées avec le compte | 070, 170 |
| 190 | `190_search_logs.sql` | Journal des recherches | 060 |
| 200 | `200_phone_signup.sql` | Inscription par téléphone, `phone_key()` | 020 |
| 210 | `210_phone_login.sql` | Connexion par téléphone | 200 |
| 220 | `220_session_events.sql` | Journal de session | 020 |
| 230 | `230_annonces.sql` | Annonces | 020, 160 |

### Fret

| N° | Script | Rôle | Dépend de |
|---|---|---|---|
| 240 | `240_fret_module.sql` | Expéditions, colis, étapes : schéma de référence | 020, 030 |
| 250 | `250_fret_tarifs.sql` | Tarifs et entrepôts | 240 |
| 260 | `260_fret_factures.sql` | Factures | 240, 250 |
| 270 | `270_fret_clients.sql` | Clients = comptes voyageurs | 240 |
| 280 | `280_fret_security.sql` | Protection des données internes | 240, 250 |
| 290 | `290_admin_update_member.sql` | Modifier nom et téléphone d'un compte | 200 |
| 300 | `300_update_my_profile.sql` | Modifier son propre profil | 200 |
| 310 | `310_livreur.sql` | Rôle livreur, `is_fret()` | 030, 240 à 270, bucket `fret-photos` : 480 (*) |
| 320 | `320_member_profile.sql` | Profil complet d'un membre | 030, 200, 310 |
| 330 | `330_expedition_etapes.sql` | Étapes rattachées aux expéditions | 240, 310 |
| 340 | `340_avatar_change.sql` | Changer sa photo de profil | 290, 300, 320 |
| 350 | `350_fret_ville_depart.sql` | Ville de départ d'un colis | 240 |
| 360 | `360_fret_caracteristiques.sql` | Fragile, batterie, liquide… | 240 |
| 370 | `370_admin_principal.sql` | Administrateur principal protégé | 020, 030 |
| 380 | `380_fret_arrivee_prevue.sql` | Date d'arrivée prévisionnelle | 240 |
| 390 | `390_fret_suivi_public.sql` | Suivi public d'une expédition | 240, 330 |
| 400 | `400_fret_articles.sql` | Articles détaillés d'une expédition | 030, 240 |
| 410 | `410_fret_photo.sql` | Photo privée d'une expédition | 240, 310, bucket `fret-photos` : 480 (*) |
| 420 | `420_fret_articles_modifier.sql` | Modifier un article | 400 |
| 430 | `430_fret_etapes_masse.sql` | Mise à jour groupée des étapes | 330 |
| 440 | `440_fret_shopping_list_link.sql` | Colis ↔ liste d'achats | 160, 240 |
| 450 | `450_fret_import_expeditions.sql` | Import des expéditions en cours | 330, 380 |
| 460 | `460_fret_shipsgo_tracking.sql` | Suivi ShipsGo | 240, 330 |
| 470 | `470_fret_shipsgo_integrity.sql` | Verrouillage des données ShipsGo | 460 |
| 480 | `480_fret_photos_bucket.sql` | Bucket privé `fret-photos` et ses règles | 020, 310 |
| 490 | `490_photos_avif.sql` | Autorise le format AVIF dans les buckets de photos | 070, 090, 170, 320, 480 |
| 500 | `500_carte_expedition.sql` | Carte d’expédition : numéro de client, nom court, téléphones de l’entrepôt | 020, 100, 150, 240, 310 |
| 510 | `510_carte_nom_telephone.sql` | Carte d’expédition : nom et téléphone propres à la carte | 500 |

(*) **Le bucket `fret-photos`** a d’abord été créé par le script historique `historique/fret_lot2b.sql`. Il est maintenant créé par `480_fret_photos_bucket.sql`, sans effet sur la production où il existe déjà. Sur une base neuve, 310 et 410 peuvent s’exécuter avant 480 (une règle de stockage se crée même si le bucket manque) : il suffit de lancer 480 avant d’envoyer la première photo.

## Hors séquence

- **`donnees/`** : insertion de données, pas de structure. Déjà appliqué en production ; à ne lancer que sur une base de test ou neuve, et en connaissance de cause.
  - `seed_contributions.sql` : propositions de **démonstration**. Ne pas lancer en production.
  - `demo_photos.sql` : photos des 7 fiches de démonstration.
  - `insert_gz_sz_providers.sql` puis `photos_gz_sz_providers.sql` : les 11 fiches de marchés de Guangzhou et Shenzhen, et leurs photos d'illustration.
- **`controles/`** : vérifications en lecture seule, sans risque.
  - `fret_verification.sql` : droits et comptages du fret, après 270 et 280.
- **`historique/`** : **NE JAMAIS EXÉCUTER.** Ces scripts décrivent l'ancien modèle fret par lots, incompatible avec le schéma actuel. Ils sont conservés pour mémoire.
  - `fret_tracking.sql`, `fret_lot2b.sql`.
- **`functions/`** : fonctions Edge Supabase (déployées à part, pas par le SQL Editor).
- **`README-fret-clients.md`** : précautions propres aux clients du fret en production.
