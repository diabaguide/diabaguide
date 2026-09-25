# Clients du fret = comptes voyageurs

Le formulaire de réception choisit un compte `profiles` de rôle `traveler`.
La création d'un client envoie une invitation par e-mail et crée immédiatement
ce compte ; le colis est ensuite relié par `colis.profile_id`. Le nom et le
téléphone conservés sur le colis sont des informations de réception, pas une
deuxième identité client.

## Intégration au site

Le nouveau parcours expédition → colis remplace l'ancien suivi par lot du dépôt.
La route `/equipe/expeditions` affiche le nouveau formulaire et `/mes-envois`
affiche les colis du voyageur connecté. Les anciens liens publics `/suivi` et
`/suivi/:code` renvoient vers ce parcours avec connexion. La migration de la
base de production vers le nouveau schéma a déjà eu lieu : ne pas rejouer les
scripts historiques `fret_tracking.sql` et `fret_lot2b.sql`.

## État de la base de production au 25 septembre 2026

- 9 profils voyageurs, 2 colis historiques sans `profile_id`.
- Le déclencheur `on_colis_voyageur_required` a été appliqué et vérifié : il
  impose un profil voyageur pour les nouveaux colis. Les deux anciens colis
  sont conservés.
- La vue `v_expedition_totaux` utilise déjà `security_invoker=true`, l'accès
  anonyme est refusé et les notes internes ne sont pas lisibles par l'API.
  `fret_security.sql` n'a donc pas été appliqué à cette base.
- Le SMTP personnalisé a été activé et enregistré dans Supabase le 25 septembre
  2026. La livraison d'une invitation n'a pas encore été testée.
- La fonction `creer-voyageur-fret` a été déployée le 25 septembre 2026 avec
  la vérification JWT activée. Un appel sans session a renvoyé HTTP 401
  (`Connexion requise.`), sans création de compte.
- Le build local passe. La route `/equipe/expeditions` redirige vers la
  connexion sans session. Avec une session administrateur, la recherche filtre
  les comptes voyageurs, la sélection du compte fonctionne et le formulaire
  « Nouveau voyageur » s'ouvre. Les soumissions sans voyageur ou sans les
  champs obligatoires sont refusées localement. Aucune invitation de test n'a
  été envoyée et aucun colis de test n'a été créé.
- L'intégration sur la branche distante à jour compile et charge la page équipe
  sans erreur de navigateur. L'ancien suivi public par code a été remplacé par
  le suivi du voyageur connecté.

## Activation restante

1. L'invitation renvoie vers `https://www.diabaguide.com/reinitialiser`, URL
   déjà autorisée dans Supabase Auth. `DIABA_APP_URL` peut remplacer le domaine
   pour un autre environnement. Les variables `SUPABASE_URL` et
   `SUPABASE_SERVICE_ROLE_KEY` restent exclusivement côté serveur.
2. Tester l'invitation avec une
   adresse réelle de test. Vérifier que le compte apparaît dans la liste,
   qu'un colis lié est visible dans « Mes envois » après connexion, et qu'un
   voyageur ne peut pas appeler la fonction de création.
3. Exécuter `fret_verification.sql` pour contrôler les droits et compter les
   anciens colis sans compte. Toutes les colonnes `*_lisibles` et
   `vue_totaux_accessible_anonyme` doivent valoir `false`.

Les anciens colis dont `profile_id` est vide ne sont pas modifiés. Ils doivent
être rapprochés d'un compte voyageur avant d'imposer une contrainte `NOT NULL`
en base. Ne pas ajouter cette contrainte tant que ce rapprochement n'est pas
terminé.
