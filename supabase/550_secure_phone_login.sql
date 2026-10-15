-- L'identifiant Auth réel d'un compte ne doit plus être exposé au navigateur.
-- La connexion téléphone/code secret passe désormais par /api/auth-pin, côté
-- serveur, avec une dérivation HMAC et une limitation d'essais non contournable.

revoke execute on function public.login_for_phone(text) from anon, authenticated;

comment on function public.login_for_phone(text) is
  'Résolution interne de compatibilité. Accès navigateur révoqué : utiliser le service serveur auth-pin.';
