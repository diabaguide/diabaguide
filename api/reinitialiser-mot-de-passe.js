import { randomInt } from 'node:crypto';

/**
 * Réinitialisation du mot de passe d'un compte, par un administrateur.
 *
 * Pourquoi côté serveur : changer le mot de passe de quelqu'un d'autre exige la
 * clé privilégiée de Supabase. Cette clé ne doit jamais se trouver dans le
 * navigateur — le voyageur pourrait la lire. Elle vit donc ici, dans les
 * variables d'environnement Vercel, et n'est utilisée que par cette fonction.
 *
 * Ce qui est vérifié, dans l'ordre :
 *   1. la demande vient d'une personne connectée (jeton validé par Supabase) ;
 *   2. cette personne est bien administratrice — le rôle est relu en base avec
 *      son propre jeton, jamais cru sur parole depuis le navigateur ;
 *   3. elle ne réinitialise pas son propre compte (elle a « mot de passe
 *      oublié » pour cela).
 *
 * Ce que la fonction rend : le mot de passe temporaire, à la seule personne qui
 * a fait la demande, pour qu'elle le transmette au voyageur. Aucun envoi
 * automatique n'est fait : sans adresse e-mail, il n'y a personne à qui écrire.
 */

/** Alphabet sans caractères ambigus (pas de O/0, I/1/l) : lisible au téléphone. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function motDePasseTemporaire() {
  const bloc = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${bloc()}-${bloc()}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Réinitialisation indisponible : configuration serveur incomplète.' });
  }

  const entete = req.headers.authorization ?? '';
  const jeton = entete.startsWith('Bearer ') ? entete.slice(7) : '';
  if (!jeton) return res.status(401).json({ error: 'Connectez-vous pour effectuer cette action.' });

  // 1. Qui appelle ?
  const moi = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, authorization: `Bearer ${jeton}` } });
  if (!moi.ok) return res.status(401).json({ error: 'Session expirée. Reconnectez-vous.' });
  const appelant = await moi.json();
  if (!appelant?.id) return res.status(401).json({ error: 'Session invalide.' });

  // 2. Est-ce un administrateur ? (son propre profil, lu avec son jeton)
  const profil = await fetch(`${url}/rest/v1/profiles?select=role&id=eq.${appelant.id}`, {
    headers: { apikey: anon, authorization: `Bearer ${jeton}` },
  });
  const lignes = await profil.json();
  if (!Array.isArray(lignes) || lignes[0]?.role !== 'admin') {
    return res.status(403).json({ error: 'Action réservée aux administrateurs.' });
  }

  // 3. Quel compte ?
  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  const cible = corps.id;
  if (typeof cible !== 'string' || !cible) return res.status(400).json({ error: 'Compte non précisé.' });
  if (cible === appelant.id) {
    return res.status(400).json({ error: 'Pour votre propre compte, utilisez « Mot de passe oublié » à la connexion.' });
  }

  // 4. Le compte visé existe-t-il vraiment ? (avant de changer quoi que ce soit)
  const verif = await fetch(`${url}/auth/v1/admin/users/${cible}`, {
    headers: { apikey: service, authorization: `Bearer ${service}` },
  });
  if (!verif.ok) return res.status(404).json({ error: 'Ce compte est introuvable.' });

  // 5. Nouveau mot de passe temporaire
  const motDePasse = motDePasseTemporaire();
  const maj = await fetch(`${url}/auth/v1/admin/users/${cible}`, {
    method: 'PUT',
    headers: { apikey: service, authorization: `Bearer ${service}`, 'content-type': 'application/json' },
    body: JSON.stringify({ password: motDePasse }),
  });
  if (!maj.ok) return res.status(500).json({ error: 'La réinitialisation a échoué. Réessayez.' });

  return res.status(200).json({ motDePasse });
}