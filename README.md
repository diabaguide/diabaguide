# Diaba Guide

Application web progressive (PWA) pour les voyageurs d’affaires sénégalais en Chine et la gestion de leurs expéditions vers le Sénégal. Le dépôt contient l’application active — ce n’est plus la démo locale décrite dans les anciennes versions de ce fichier.

## Stack

- React 18, TypeScript, Vite 7 et React Router 7
- Supabase Auth, Postgres, Storage et fonctions serveur
- PWA avec manifeste, service worker et mise en cache des ressources
- Interfaces disponibles en français, anglais, chinois et arabe

## Développement local

Prérequis : Node.js `>=20.19.0` et npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Renseigner dans `.env.local` les variables publiques `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` depuis le projet Supabase. Ne jamais y ajouter une clé `service_role`, un jeton ShipsGo ou un autre secret. Sans configuration Supabase, le client peut utiliser certaines données statiques de repli, mais l’authentification réelle n’est pas disponible. **Le build de production refuse de se lancer si les deux variables publiques Supabase sont absentes.**

## Vérifications

```sh
npm run build                 # TypeScript, build Vite et limite de taille des chunks
npm run verify:bundle         # vérifie que chaque chunk JS reste sous 500 KiB
npm run verify:traveler-ui    # contrôles structurels de l’interface voyageur
npm run verify:shipsgo        # tests Node.js du cœur, de l’API, de l’intégrité et de l’interface ShipsGo
npm audit --audit-level=moderate
```

`verify:traveler-ui` est un contrôle structurel, pas une recette navigateur. `verify:shipsgo` utilise les tests du dépôt ; ne créez pas de suivi réel et ne consommez pas de crédit pour valider le code. La CI GitHub exécute actuellement l’installation propre et `npm run build`.

## Fonctionnalités principales

- Guide et recherche de prestataires, filtres, fiches, favoris et contenus hors connexion.
- Comptes voyageurs, profil, contributions soumises à validation par l’équipe et listes d’achats.
- Espaces équipe et administration, avec accès contrôlé selon le rôle.
- Module fret : expéditions, colis associés aux voyageurs, étapes, factures, suivi public et intégration ShipsGo côté serveur.
- Pages publiques de connexion, inscription, récupération de mot de passe et suivi d’expédition.

Les routes et gardes d’accès sont définis dans `src/App.tsx`; la session et l’état partagé sont gérés dans `src/store.tsx`. Les composants du fret se trouvent dans `src/pages/Fret.tsx` et `src/pages/admin/Expeditions.tsx`.

## Données et sécurité

Supabase est la source des comptes et des données métier en production. Le navigateur utilise uniquement `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`; les secrets de service et le jeton ShipsGo doivent rester dans les environnements serveur appropriés. Les contrôles d’accès doivent être appliqués côté base et serveur, pas uniquement dans l’interface.

Le schéma fret de référence en production utilise `expeditions` identifiées par `code`, `colis` et `expedition_etapes`. Les fichiers SQL du dépôt ne constituent pas encore une suite de migrations ordonnée et interchangeable. Avant toute intervention, vérifier le schéma réel et les consignes du fichier concerné. En particulier, ne pas rejouer les anciens scripts `supabase/fret_tracking.sql` et `supabase/fret_lot2b.sql` : ils décrivent un modèle historique incompatible avec le fret actuel. `supabase/README-fret-clients.md` précise d’autres précautions de production.

## Déploiement

La production web est déployée sur Vercel depuis la branche `main`. Les variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` doivent être configurées dans l’environnement Vercel pour le build. Les secrets utilisés par les fonctions API doivent être configurés côté serveur, jamais dans le bundle client.

Les livraisons suivent une branche dédiée, les vérifications locales, une Pull Request avec CI verte, puis la fusion dans `main` et la vérification du déploiement public.
