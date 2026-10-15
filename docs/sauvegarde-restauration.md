# Sauvegarde et restauration de Diaba Guide

Ce document dit **quoi sauvegarder, comment, et comment reconstruire** si quelque chose est perdu.
Il vaut mieux le lire avant d'en avoir besoin.

## 1. Ce qui compte, et où ça se trouve

| Quoi | Où | Sauvegardé par |
|---|---|---|
| Le code de l'application | GitHub (dépôt `diabaguide`) | GitHub lui-même ; chaque modification est une version |
| La structure de la base (scripts SQL numérotés) | `supabase/*.sql` dans GitHub | Idem ; permet de reconstruire les tables et les règles |
| Les **données** : comptes, fiches, propositions, expéditions, colis, factures, annonces | Base Supabase | Voir §2 et §3 |
| Les **photos** : fiches, profils, photos de fret, annonces | Stockage Supabase (Storage) | Voir §4 (non incluses dans la sauvegarde de la base) |
| Les **secrets** : clé ShipsGo, clés Supabase, accès Vercel | Nulle part dans le code, par sécurité | Vous : à noter dans un gestionnaire de mots de passe |

> Le code est en sécurité grâce à GitHub. Ce qui ne se reconstruit pas, ce sont **les données et les photos** : c'est là qu'il faut agir.

## 2. À vérifier maintenant dans Supabase (5 minutes)

1. Tableau de bord Supabase, projet Diaba Guide, **Database**, puis **Backups**.
2. Notez ce que votre offre propose : des sauvegardes automatiques (combien de jours conservées ?), ou aucune.
3. Si votre offre ne propose **aucune** sauvegarde automatique, ou seulement quelques jours : faites la sauvegarde manuelle du §3 **chaque semaine**, et avant toute modification risquée de la base (un nouveau script SQL important).

Même quand des sauvegardes automatiques existent, gardez une copie à vous : cela protège aussi d'une suppression de projet ou d'un compte inaccessible.

## 3. Sauvegarde manuelle de la base

Le script `scripts/sauvegarde-base.ps1` crée deux fichiers vérifiés dans le dossier `sauvegardes/` (ignoré par git, jamais publié) :

- `…-public.dump` : toutes les données et la structure de l'application, **avec les règles d'accès** (qui protègent les données des voyageurs) ;
- `…-comptes.dump` : les comptes des utilisateurs.

Il ne modifie rien dans la base : il la lit seulement.

**Prérequis** : Docker Desktop démarré (rien d'autre à installer).

**Adresse de connexion** : tableau de bord Supabase, bouton **Connect**, rubrique **Session pooler**, puis remplacez `[YOUR-PASSWORD]` par le mot de passe de la base (réinitialisable dans Database, Settings). Le script la demande en saisie masquée : elle n'est jamais écrite ni affichée.

Depuis la racine du projet, dans PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/sauvegarde-base.ps1
```

Le script s'arrête avec un message clair si l'adresse est fausse, si la sauvegarde est vide, ou si elle ne se relit pas. Il garde les 8 dernières de chaque type.

**Ensuite, copiez les deux fichiers hors de l'ordinateur** (disque externe, stockage en ligne privé). Ils contiennent les données des voyageurs : ne les partagez pas, ne les envoyez pas par messagerie.

## 4. Les photos

Les photos (fiches, profils, fret, annonces) sont dans le stockage Supabase, **pas** dans la sauvegarde de la base. Deux façons de les protéger :

- **À la main**, de temps en temps : tableau de bord, **Storage**, ouvrir chaque bucket (`fiche-photos`, `fret-photos`, `avatars`, `proposal-photos`, `review-photos`, `annonces-photos`) et télécharger le contenu.
- **Par script** : un script de sauvegarde des photos peut être ajouté (il demandera la clé de service de la même manière que le script de ré-encodage des photos de fiches). À demander quand le nombre de photos le justifie.

Les originaux des photos de fiches se retrouvent aussi sur les téléphones de l'équipe qui les a prises.

## 5. Restaurer

**Règle d'or : on ne restaure jamais par-dessus la production sans avoir répété l'opération.**

La restauration se fait dans un **nouveau projet Supabase** (ou un projet de test), puis on bascule l'application vers lui seulement quand il est vérifié.

1. Créez un nouveau projet Supabase vide.
2. Lancez le script SQL de structure s'il manque quelque chose d'ordre technique (les scripts de `supabase/`, dans l'ordre de `supabase/README.md`). Pas nécessaire si la restauration du fichier `public` suffit ; en cas de doute, demandez-moi.
3. Restaurez la base de l'application :

   ```powershell
   docker run --rm -v "${PWD}\sauvegardes:/out" postgres:18-alpine pg_restore --clean --if-exists --no-owner -d "ADRESSE_DU_NOUVEAU_PROJET" /out/diaba-guide-AAAA-MM-JJ_HHMM-public.dump
   ```

4. Restaurez les comptes (les mots de passe sont conservés : seules leurs empreintes chiffrées sont sauvegardées) :

   ```powershell
   docker run --rm -v "${PWD}\sauvegardes:/out" postgres:18-alpine pg_restore --data-only --no-owner -d "ADRESSE_DU_NOUVEAU_PROJET" /out/diaba-guide-AAAA-MM-JJ_HHMM-comptes.dump
   ```

5. Remettez les photos dans leurs buckets (§4), recréez les secrets (clé ShipsGo, etc.) et pointez Vercel vers le nouveau projet (variables `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`).
6. Vérifiez : connexion avec un compte connu, une fiche, une expédition, une photo.

### Ce qui a été testé

La sauvegarde puis la restauration ont été essayées **sur une base de test locale** : les données, les règles d'accès par colonne, la sécurité par ligne et les comptes reviennent à l'identique. Elles n'ont **pas** été jouées sur un vrai projet Supabase.

**À faire une fois, au calme** : un exercice complet de restauration dans un projet Supabase de test (étapes 1 à 6). Les déclencheurs de Supabase sur la table des comptes peuvent demander un ajustement (par exemple restaurer les comptes avant la base, ou suspendre le déclencheur de création de profil) : mieux vaut le découvrir pendant un exercice que pendant une panne. Demandez-moi de le préparer avec vous.

## 6. Calendrier conseillé

| Fréquence | Action |
|---|---|
| Chaque semaine | `scripts/sauvegarde-base.ps1`, puis copie hors de l'ordinateur |
| Avant chaque script SQL important | Même chose |
| Chaque mois | Télécharger les photos (§4) |
| Une fois | Exercice de restauration dans un projet de test |
| Quand quelqu'un rejoint ou quitte l'équipe | Vérifier qui a accès à Supabase, Vercel et GitHub |
