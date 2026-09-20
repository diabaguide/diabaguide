# Diaba Guide — projet React (démo)

Site mobile installable (PWA) pour les voyageurs d'affaires sénégalais en Chine (Guangzhou, Shenzhen). Vite + React 18 + TypeScript + react-router 6.

## Démarrer
    npm install
    npm run dev      # http://localhost:5173
    npm run build    # tsc + vite build

## Comptes de démonstration
- Tout e-mail valide + mot de passe (8 caractères min.) : rôle voyageur.
- Un e-mail contenant « equipe » (ex. equipe@diaba.sn) : rôle équipe, accès à `/equipe`.

## Routes
Publiques : `/`, `/inscription`, `/inscription/confirmation`, `/connexion`, `/mot-de-passe`.
Connecté : `/accueil`, `/localisation`, `/recherche`, `/recherche/filtres`, `/adresses/:id` (+ `/chauffeur`, `/contact`, `/signaler`), `/favoris`, `/contributions` (+ `/nouvelle/:step`, `/nouvelle/envoyee`, `/:id`), `/profil`, `/profil/telechargements`.
Équipe : `/equipe`, `/equipe/propositions[/:id]`, `/equipe/historique`.
Une page protégée redirige vers `/connexion?next=…` puis revient à la page demandée.

## Règles produit respectées
Compte obligatoire · aucun paiement/réservation · validation équipe avant publication · fiches partageables uniquement après connexion · téléchargement hors connexion · « Non renseigné » plutôt que des données inventées · statuts jamais signalés par la couleur seule · géolocalisation demandée à la demande, gardée en sessionStorage uniquement.

## Ce qui est simulé (à remplacer)
- Données : `src/data.ts` (7 adresses fictives, propositions d'exemple).
- Backend : `src/store.tsx` (useReducer + localStorage `diaba-guide-state-v1`). Remplacer les actions par des appels API.
- Authentification : simulée dans `pages/Access.tsx`.
- Carte : SVG illustratif (`pages/Search.tsx`) → brancher Leaflet/MapLibre.
- Photos : espaces réservés. Langues : seul le français est traduit.
- Service worker / cache hors connexion : à ajouter (le manifest est fourni).

Design tokens : `src/styles.css` (bleu principal #153E9F).
