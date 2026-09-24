# Suivi de fret Chine → Sénégal — spécification

Date : 24/09/2026 — branche `spec/suivi-fret`

## Objectif

Permettre au voyageur sénégalais qui achète des marchandises en Chine (Guangzhou /
Shenzhen) et les achemine par le service de fret de Diaba Guide de **suivre son
expédition** depuis son téléphone : où en est le lot, quelle est la prochaine
étape, quand il arrive à Dakar, et qui contacter.

Le même lien de suivi doit pouvoir être **partagé** à un client final ou à un
revendeur au Sénégal, qui n'a pas de compte Diaba Guide.

## Ce qui existe déjà (à réutiliser)

- `public.providers` avec `cat = 'transitaire'`, `freight text[]` (`air` | `sea`),
  `tel`, `wechat` : les partenaires et le type de fret sont déjà modélisés.
- Listes d'achats (`src/lib/shopping.ts`, `supabase/shopping_lists.sql`) : ce que
  le voyageur compte acheter, avec fournisseur, quantité et prix visé.
- Pages voyageur `Screen` + `TopBar`, pages équipe `header.admin-head` +
  `AdminCard` / `AdminSheet`, `whatsappUrl` pour le partage.
- i18n `src/i18n/messages.json` (fr en clé ; en / zh / ar).
- Fonctions d'administration `public.admin_*` en `security definer` avec
  `is_admin()`, aucune clé `service_role` dans le front.

## Périmètre

**Dans le périmètre**

- Une expédition = **un lot** (un conteneur maritime ou un envoi aérien), suivi
  au niveau du lot, jamais article par article.
- Saisie des statuts et des étapes par l'**équipe Diaba** uniquement.
- Écrans voyageur : mes expéditions, détail d'une expédition.
- Page publique de suivi par code, sans compte, sans donnée personnelle.
- Rattachement facultatif d'une expédition à une liste d'achats.
- Import des expéditions déjà en cours au moment de la mise en service.

**Hors périmètre (v1)**

- Comptes transitaires et saisie par un partenaire extérieur (prévu plus tard,
  le modèle le permet).
- Suivi article par article, scan de code-barres.
- Intégration API d'une compagnie maritime ou aérienne.
- Notifications automatiques (voir « Notifications » ci-dessous).

## Modèle de données

Fichier `supabase/fret_tracking.sql`, idempotent (`create table if not exists`,
`drop policy if exists` avant `create policy`), exécuté à la main dans le SQL
Editor, comme les autres migrations du projet.

### `public.expeditions`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid pk default gen_random_uuid() | clé technique |
| `code` | text unique not null | code public dictable, format `DIA-AAAA-NNNN` |
| `user_id` | uuid not null → auth.users on delete cascade | voyageur propriétaire |
| `provider_id` | text → providers(id) on delete set null | transitaire désigné |
| `fret` | text not null check (fret in ('air','sea')) | type de fret |
| `origine` | text not null check (origine in ('Guangzhou','Shenzhen')) | ville de départ |
| `conteneur` | text | n° de conteneur ou n° AWB, facultatif |
| `articles` | text | description libre du lot (ce qui est dedans) |
| `poids` | text | poids ou volume, saisie libre (« 3,2 m³ ») |
| `depart_le` | date | départ réel |
| `arrivee_prevue` | date | arrivée estimée à Dakar |
| `arrivee_le` | date | arrivée réelle |
| `statut` | statut_expedition not null default 'preparation' | statut courant, dénormalisé depuis la dernière étape |
| `list_id` | uuid → shopping_lists(id) on delete set null | liste d'achats d'origine, facultatif |
| `notes` | text | notes internes, **jamais** exposées publiquement |
| `created_at` / `updated_at` | timestamptz not null default now() | `updated_at` tenu par déclencheur |

### `public.statut_expedition` (enum)

Ordre du cycle de vie, tel qu'affiché dans la frise :

1. `preparation` — préparation / achats en cours en Chine
2. `regroupage` — marchandise regroupée chez le transitaire
3. `embarque` — chargé, départ effectué
4. `transit` — en mer ou en vol
5. `douane` — dédouanement à Dakar
6. `arrive` — arrivé au port / à l'entrepôt de Dakar
7. `livre` — remis au voyageur

### `public.expedition_etapes`

| Colonne | Type | Rôle |
|---|---|---|
| `id` | uuid pk | |
| `expedition_id` | uuid not null → expeditions on delete **cascade** | le lot suivi |
| `statut` | statut_expedition not null | étape atteinte |
| `lieu` | text | « Port de Nansha », « Douane de Dakar »… |
| `note` | text | précision affichée au voyageur |
| `photo` | text | chemin Storage, facultatif |
| `publique` | boolean not null default true | si faux, l'étape n'apparaît pas sur la page publique |
| `created_at` | timestamptz not null default now() | horodatage affiché |

Contraintes à tester :

- **clé étrangère vers la table parente**, jamais vers `auth.users` seul ;
  supprimer une expédition doit effacer ses étapes (test explicite, la panne est
  invisible à la lecture).
- `statut` de l'expédition = statut de son étape la plus récente : déclencheur
  `after insert or update or delete on expedition_etapes`, ou vue dédiée. Le
  déclencheur doit être tolérant à une suppression d'étape (recalcul depuis la
  dernière restante, `preparation` par défaut).
- `updated_at` recalculé par déclencheur, pas par le client.

### Accès (RLS)

| Table | select | insert / update / delete |
|---|---|---|
| `expeditions` | `auth.uid() = user_id`, plus une politique `<table>_staff_read` pour l'équipe (`is_admin()`), comme `shopping_lists_staff_read` | aucune politique : uniquement les fonctions `admin_*` |
| `expedition_etapes` | via son expédition (propriétaire ou équipe) | idem |
| `shopping_lists` | déjà en place | inchangé |

Fonctions `security definer`, convention maison
(`if not public.is_admin() then raise exception ...` puis
`revoke all ... from public, anon` + `grant execute ... to authenticated`) :

- `public.admin_creer_expedition(user_id, fret, origine, provider_id, …)` →
  rend l'`id` et le `code` généré.
- `public.admin_ajouter_etape(expedition_id, statut, lieu, note, photo, publique)`.
- `public.admin_maj_expedition(id, …)` (dates, conteneur, poids, articles, notes).
- `public.admin_supprimer_expedition(id)`.
- `public.suivi_public(code)` — **seule** fonction accordée à `anon` : rend le
  statut, les dates publiques, le nom du transitaire (nom + téléphone, ce sont
  des professionnels de l'annuaire), et les étapes `publique = true`. **Jamais**
  le nom du voyageur, ses notes, ses articles détaillés, ni `provider_id` brut.

### Génération du code

`DIA-<année>-<n° sur 4 chiffres>`, séquence par année, sans caractères ambigus.
Généré en base (dans `admin_creer_expedition`) pour éviter deux codes égaux en
cas de créations simultanées ; contrainte unique qui échoue proprement si
nécessaire.

## Interfaces

Routes ajoutées à `src/App.tsx` :

| Route | Écran | Accès |
|---|---|---|
| `/fret` | Mes expéditions | voyageur connecté |
| `/fret/:code` | Détail d'un lot | propriétaire |
| `/suivi/:code` | Suivi public | quiconque, sans compte |
| `/equipe/expeditions` | Console équipe | admin |

- `src/lib/fret.ts` : types + appels RPC, avec **repli navigateur** quand
  Supabase est absent (même schéma que `shopping.ts`, mode démonstration) —
  sans quoi la version de démonstration casse dès l'ajout du module.
- `src/pages/Fret.tsx` : écrans voyageur (liste + détail, frise verticale).
- `src/pages/admin/Expeditions.tsx` : console équipe.
- `src/pages/Suivi.tsx` : page publique, accessible sans session (elle doit
  rester hors du garde « invité seulement », comme la page de réinitialisation).

**Base d'affichage** : les écrans voyageur et équipe suivent la règle maison —
cartes empilées, jamais de tableau (illisible sous 1024 px), badge de statut
sous le nom, feuille plein écran pour la saisie.

**Détail du lot** : frise verticale des étapes (statut, date, lieu, note,
photo), prochaine étape attendue, date d'arrivée estimée, bouton WhatsApp vers
le transitaire, bouton « Copier le lien de suivi ».

**Console équipe** : recherche par code / voyageur, filtre par statut, création
d'une expédition (choix du voyageur, du transitaire, du fret), ajout d'une étape
en un geste, mise à jour en lot (sélectionner N expéditions, appliquer un
statut), signalement des lots dont l'arrivée prévue est dépassée.

**Lien avec les listes d'achats** : depuis une liste, « Expédier cette liste »
ouvre la création d'expédition pré-remplie (articles issus de la liste,
`list_id` conservé).

## Notifications

Pas d'API WhatsApp Business : à la création d'une étape publique, proposer un
`wa.me` pré-rempli au voyageur (« Votre lot DIA-2026-0004 est embarqué »), comme
`whatsappUrl` le fait déjà pour les listes. Aucune notification automatique en
v1 : le statut se voit à l'ouverture de l'application. Un rappel automatique
(cron Hermes vers Telegram ou WhatsApp) sera décidé séparément.

## Traductions

Toute chaîne visible passe par `tr()` / `t()` **avec ses trois traductions**
(en, zh, ar) avant livraison ; une clé manquante s'affiche en français sans
erreur, c'est le défaut le plus fréquent. Une phrase = une clé, avec le nombre
en trou `{0}` ; jamais de phrase composée par morceaux.

## Lots de livraison

1. **Schéma** — `supabase/fret_tracking.sql` : tables, enum, déclencheurs,
   politiques, fonctions `admin_*` + `suivi_public`. Tests SQL en
   `begin; … rollback;` : cascade de suppression, recalcul du statut après
   suppression d'étape, refus d'écriture pour un non-admin, visite anonyme de
   `suivi_public` (ne doit rien révéler d'autre).
2. **Console équipe** — l'équipe peut créer et suivre les lots en interne.
3. **Écrans voyageur + page publique** — frise, partage du lien, WhatsApp.
4. **Finitions** — « Expédier cette liste », import des lots en cours,
   traductions, carte de visite du lot si utile.

Chaque lot passe par une branche et une PR ; `main` part en production à chaque
fusion. Le SQL est exécuté par Abdoulaye dans le SQL Editor.

## Tests attendus

- SQL : les cas ci-dessus, plus la vérification que les compteurs et valeurs
  d'origine sont inchangés après le `rollback`.
- TypeScript : `npm run build` (`tsc --noEmit && vite build`) doit passer avec
  les variables Supabase fournies.
- Comportement : un voyageur ne voit jamais l'expédition d'un autre ; un
  anonyme n'obtient par `suivi_public` qu'un statut, des dates et des étapes
  publiques ; une étape marquée `publique = false` n'apparaît pas.

## Points à trancher plus tard

- Ouverture de la saisie aux transitaires partenaires (comptes dédiés).
- Notification automatique à chaque changement de statut.
- Suivi article par article, si un client le demande explicitement.
