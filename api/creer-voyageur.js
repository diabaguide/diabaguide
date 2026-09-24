import { randomInt } from 'node:crypto';

/**
 * Création d'un compte voyageur depuis la console, par un administrateur.
 *
 * Pourquoi côté serveur : créer un compte exige la clé privilégiée de Supabase.
 * Cette clé ne doit jamais se trouver dans le navigateur — le voyageur pourrait
 * la lire. Elle vit donc ici, dans les variables d'environnement Vercel, et
 * n'est utilisée que par cette fonction.
 *
 * Ce qui est vérifié, dans l'ordre :
 *   1. la demande vient d'une personne connectée (jeton validé par Supabase) ;
 *   2. cette personne est bien administratrice — le rôle est relu en base avec
 *      son propre jeton, jamais cru sur parole depuis le navigateur ;
 *   3. le numéro (et l'adresse, si elle est fournie) ne sont pas déjà pris —
 *      relus en base AVANT de créer quoi que ce soit ;
 *   4. le nom est renseigné et le numéro utilisable.
 *
 * Ce que la fonction rend : l'identifiant du compte et un mot de passe
 * temporaire, à la seule personne qui a fait la demande, pour qu'elle le
 * transmette au voyageur. Aucun envoi automatique n'est fait : sans adresse
 * e-mail, il n'y a personne à qui écrire.
 *
 * Le compte est créé sans adresse e-mail si aucune n'est fournie : il reçoit
 * alors l'adresse interne déduite du numéro (`p782254040@diabaguide.local`),
 * exactement comme à l'inscription (supabase/phone_signup.sql).
 */

/** Alphabet sans caractères ambigus (pas de O/0, I/1/l) : lisible au téléphone. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Adresse interne des comptes créés sans e-mail (jamais montrée, jamais utilisée). */
const DOMAINE_INTERNE = 'diabaguide.local';

function motDePasseTemporaire() {
  const bloc = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${bloc()}-${bloc()}`;
}

/**
 * Chiffres utiles d'un numéro, sans indicatif sénégalais.
 * Miroir exact de `public.phone_key()` (supabase/phone_signup.sql) et de
 * `phoneKey()` (src/lib/phone.ts) : les trois doivent rester identiques, sinon
 * un même numéro désignerait deux comptes.
 */
function cleTelephone(brut) {
  let d = String(brut ?? '').replace(/\D/g, '');
  if (d.startsWith('00221')) d = d.slice(5);
  if (d.startsWith('221') && d.length > 9) d = d.slice(3);
  return d;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) {
    return res.status(500).json({ error: 'Création de compte indisponible : configuration serveur incomplète.' });
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

  // 3. Les informations du nouveau compte
  const corps = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
  const nom = typeof corps.nom === 'string' ? corps.nom.trim() : '';
  const telephone = typeof corps.telephone === 'string' ? corps.telephone.trim() : '';
  const email = typeof corps.email === 'string' ? corps.email.trim().toLowerCase() : '';
  if (!nom) return res.status(400).json({ error: 'Indiquez le nom du voyageur.' });
  const cle = cleTelephone(telephone);
  if (cle.length < 6) return res.status(400).json({ error: 'Indiquez un numéro de téléphone valide.' });
  if (email && !EMAIL.test(email)) return res.status(400).json({ error: 'L’adresse e-mail n’est pas valide.' });

  // 4. Le numéro ou l'adresse sont-ils déjà pris ? (relu en base avant de créer)
  const entetesService = {
    apikey: service,
    authorization: `Bearer ${service}`,
    'content-type': 'application/json',
  };
  const dejaNumero = await fetch(`${url}/rest/v1/profiles?select=id&phone_key=eq.${cle}`, { headers: entetesService });
  const lignesNumero = await dejaNumero.json();
  if (Array.isArray(lignesNumero) && lignesNumero.length) {
    return res.status(409).json({ error: 'Ce numéro est déjà associé à un compte.' });
  }
  if (email) {
    const dejaEmail = await fetch(
      `${url}/rest/v1/profiles?select=id&email=eq.${encodeURIComponent(email)}`, { headers: entetesService });
    const lignesEmail = await dejaEmail.json();
    if (Array.isArray(lignesEmail) && lignesEmail.length) {
      return res.status(409).json({ error: 'Cette adresse e-mail est déjà associée à un compte.' });
    }
  }

  // 5. Le compte (mot de passe temporaire, à transmettre par l'administrateur)
  const adresse = email || `p${cle}@${DOMAINE_INTERNE}`;
  const motDePasse = motDePasseTemporaire();
  const creation = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: entetesService,
    body: JSON.stringify({
      email: adresse, password: motDePasse, email_confirm: true, user_metadata: { name: nom },
    }),
  });
  if (!creation.ok) {
    const detail = await creation.json().catch(() => ({}));
    if (creation.status === 422 || /already|registered|exists/i.test(JSON.stringify(detail))) {
      return res.status(409).json({ error: 'Ce numéro ou cette adresse est déjà associé à un compte.' });
    }
    return res.status(500).json({ error: 'La création du compte a échoué. Réessayez.' });
  }
  const compte = await creation.json();
  if (!compte?.id) return res.status(500).json({ error: 'La création du compte a échoué. Réessayez.' });

  // 6. La fiche du voyageur : nom, téléphone, clé de rappel, rôle « voyageur ».
  //    La clé est aussi tenue à jour par un déclencheur en base ; on l'écrit
  //    ici pour que la fiche soit complète même si le déclencheur évolue.
  const fiche = await fetch(`${url}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: { ...entetesService, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      id: compte.id, name: nom, phone: telephone, phone_key: cle, email: adresse, role: 'traveler',
    }),
  });
  if (!fiche.ok) {
    return res.status(500).json({
      error: 'Le compte est créé mais sa fiche est incomplète. Reprenez-la depuis la liste des membres.',
    });
  }

  // Le mot de passe temporaire ne repart QUE vers l'administrateur qui l'a demandé.
  return res.status(200).json({ id: compte.id, motDePasse });
}
