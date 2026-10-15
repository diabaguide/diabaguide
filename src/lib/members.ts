import { supabase } from './supabase';
import { messageReseau } from './erreurs';
import type { AccountStatus, Role } from './auth';
import { isInternalEmail, phoneOf } from './phone';

export interface Member {
  id: string; name: string | null; phone: string | null; email: string; role: Role; createdAt: string;
  /** Photo de profil (bucket « avatars »). */
  avatarPath: string | null;
  /** État du compte (gestion par les administrateurs, voir supabase/150_admin_travelers.sql). */
  status: AccountStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** Administrateur principal : aucun autre compte ne peut le modifier ni le supprimer (supabase/370_admin_principal.sql). */
  primary: boolean;
  /** Date de mise à la corbeille (supabase/580_account_trash.sql), sinon null. */
  deletedAt: string | null;
}
export interface Invitation { email: string; role: Exclude<Role, 'traveler'>; createdAt: string; name: string | null; phone: string | null; avatarPath: string | null }
export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Désactivé',
};

export const ROLE_LABEL: Record<Role, string> = {
  traveler: 'Voyageur',
  livreur: 'Livreur',
  team: 'Équipe',
  admin: 'Administrateur',
};

/** Tous les comptes (RLS : réservé aux administrateurs). */
export async function fetchMembers(): Promise<Member[]> {
  if (!supabase) return [];
  type Row = {
    id: string; name: string | null; phone: string | null; email: string; role: Role;
    status: AccountStatus | null; suspended_at: string | null; suspended_reason: string | null; created_at: string; avatar_path: string | null; is_primary_admin: boolean | null;
    deleted_at?: string | null;
  };
  const colonnes = 'id, name, phone, email, role, status, suspended_at, suspended_reason, created_at, avatar_path, is_primary_admin';
  // La colonne `deleted_at` n'existe qu'après la migration 580 : sans elle, on relit sans.
  let res = await supabase.from('profiles').select(`${colonnes}, deleted_at`).order('created_at', { ascending: true });
  if (res.error) res = await supabase.from('profiles').select(colonnes).order('created_at', { ascending: true }) as typeof res;
  if (res.error) { warn('chargement des comptes', res.error); return []; }
  return (res.data as unknown as Row[]).map((r) => ({
    id: r.id, name: r.name, phone: r.phone,
    // Compte inscrit avec son seul numéro : l'adresse interne n'est jamais
    // montrée, on affiche le téléphone à la place.
    email: isInternalEmail(r.email) ? phoneOf(r.phone, r.email) : r.email,
    role: r.role, createdAt: r.created_at, avatarPath: r.avatar_path,
    status: r.status ?? 'active', suspendedAt: r.suspended_at, suspendedReason: r.suspended_reason,
    primary: r.is_primary_admin === true, deletedAt: r.deleted_at ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* Gestion des comptes voyageurs (réservée aux administrateurs).       */
/* Les garde-fous sont en base : supabase/150_admin_travelers.sql.         */
/* ------------------------------------------------------------------ */

/** Modifie le nom et le téléphone d'un compte voyageur. */
export async function updateTraveler(id: string, name: string, phone: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_update_traveler', { p_id: id, p_name: name, p_phone: phone });
  return { error: error ? humanize(error.message) : undefined };
}

/** Modifie le nom et le téléphone d'un compte, quel que soit son rôle (supabase/290_admin_update_member.sql). */
export async function updateMember(
  id: string, name: string, phone: string, avatar: { path?: string; remove?: boolean } = {},
): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_update_member', {
    p_id: id, p_name: name, p_phone: phone, p_avatar: avatar.path ?? null, p_remove_avatar: avatar.remove ?? false,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Désactive ou réactive un compte voyageur (bloque aussi la connexion). */
export async function setTravelerStatus(
  id: string, status: AccountStatus, reason = '',
): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_set_traveler_status', {
    p_id: id, p_status: status, p_reason: reason || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Désactive ou réactive un membre de l'équipe (supabase/590_member_status.sql). */
export async function setMemberStatus(
  id: string, status: AccountStatus, reason = '',
): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_set_member_status', {
    p_id: id, p_status: status, p_reason: reason || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/**
 * Réinitialise le mot de passe d'un compte, par un administrateur.
 *
 * Passe par la fonction serveur `/api/reinitialiser-mot-de-passe` : changer le
 * mot de passe de quelqu'un d'autre exige la clé privilégiée de Supabase, qui
 * ne doit jamais se trouver dans le navigateur. La fonction vérifie elle-même
 * que la personne qui demande est administratrice.
 *
 * Rend le mot de passe temporaire, à transmettre au voyageur (WhatsApp) : sans
 * adresse e-mail, aucun envoi automatique n'est possible.
 */
export async function resetPasswordFor(id: string, motDePasse?: string): Promise<{ motDePasse?: string; ok?: boolean; error?: string }> {
  if (!supabase) return { error: 'Réinitialisation indisponible en mode démonstration.' };
  const { data } = await supabase.auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) return { error: 'Session expirée. Reconnectez-vous.' };
  try {
    const r = await fetch('/api/reinitialiser-mot-de-passe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ id, motDePasse }),
    });
    const corps = (await r.json().catch(() => ({}))) as { motDePasse?: string; ok?: boolean; error?: string };
    if (!r.ok) return { error: corps.error ?? 'La réinitialisation a échoué. Réessayez.' };
    return { motDePasse: corps.motDePasse, ok: corps.ok };
  } catch {
    return { error: 'Connexion impossible. Vérifiez votre réseau et réessayez.' };
  }
}

/**
 * Crée un compte voyageur, par un administrateur, depuis la console.
 *
 * Passe par la fonction serveur `/api/creer-voyageur` : créer un compte exige
 * la clé privilégiée de Supabase, qui ne doit jamais se trouver dans le
 * navigateur. La fonction vérifie elle-même que la personne qui demande est
 * administratrice (son jeton, son rôle relu en base).
 *
 * Rend le mot de passe temporaire, à transmettre au voyageur (WhatsApp) : sans
 * adresse e-mail, aucun envoi automatique n'est possible.
 */
export async function creerVoyageur(v: {
  nom: string; telephone: string; email?: string;
}): Promise<{ id?: string; motDePasse?: string; error?: string }> {
  if (!supabase) return { error: 'Création de compte indisponible en mode démonstration.' };
  const { data } = await supabase.auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) return { error: 'Session expirée. Reconnectez-vous.' };
  try {
    const r = await fetch('/api/creer-voyageur', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
      body: JSON.stringify({ nom: v.nom, telephone: v.telephone, email: v.email ?? '' }),
    });
    const corps = (await r.json().catch(() => ({}))) as { id?: string; motDePasse?: string; error?: string };
    if (!r.ok) {
      // La fonction serveur n'existe pas en développement local : le dire
      // clairement plutôt que d'afficher un écran cassé.
      if (r.status === 404) {
        return { error: 'La création de compte n’est pas disponible ici : la fonction serveur « /api/creer-voyageur » doit être déployée.' };
      }
      return { error: corps.error ?? 'La création du compte a échoué. Réessayez.' };
    }
    return { id: corps.id, motDePasse: corps.motDePasse };
  } catch {
    return { error: 'Création impossible. Vérifiez votre réseau et réessayez.' };
  }
}

/** Supprime définitivement un compte voyageur (action irréversible). */
export async function deleteTraveler(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_delete_traveler', { p_id: id });
  return { error: error ? humanize(error.message) : undefined };
}

/* ------------------------------------------------------------------ */
/* Photos du voyageur (supabase/180_storage_cleanup.sql)                   */
/*                                                                     */
/* storage.objects ne peut pas être vidé en SQL (déclencheur           */
/* storage.protect_delete) et retirer la seule fiche laisserait le     */
/* fichier dans le stockage : on supprime par l'API Storage, avec la   */
/* session de l'administrateur — aucune clé service_role.              */
/* ------------------------------------------------------------------ */

export type BucketVoyageur = 'proposal-photos' | 'review-photos';

export interface VoyageurFile {
  bucket: BucketVoyageur;
  name: string;
  taille: number;
  /** Vrai si le fichier n'est plus référencé : il part avec le compte. */
  supprimable: boolean;
}

/** Photos déposées par un voyageur, et celles qui lui survivront. */
export async function fetchTravelerFiles(userId: string): Promise<VoyageurFile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('admin_traveler_files', { p_user: userId });
  if (error) { warn('chargement des photos du voyageur', error); return []; }
  return (data as VoyageurFile[]) ?? [];
}

/**
 * Supprime les fichiers qu'aucune donnée ne référence plus. À appeler juste
 * avant `deleteTraveler` : les avis disparaissent avec le compte, leurs photos
 * deviennent inatteignables ; les photos des contributions conservées restent.
 */
export async function purgeTravelerFiles(userId: string): Promise<{ supprimes: number; conserves: number; error?: string }> {
  if (!supabase) return { supprimes: 0, conserves: 0 };
  const files = await fetchTravelerFiles(userId);
  const parBucket = new Map<BucketVoyageur, string[]>();
  for (const f of files.filter((x) => x.supprimable)) {
    parBucket.set(f.bucket, [...(parBucket.get(f.bucket) ?? []), f.name]);
  }
  let supprimes = 0;
  for (const [bucket, paths] of parBucket) {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) {
      return { supprimes, conserves: files.length - supprimes, error: humanize(error.message) };
    }
    supprimes += paths.length;
  }
  return { supprimes, conserves: files.length - supprimes };
}


/** Invitations en attente (personne pas encore inscrite). */
export async function fetchInvitations(): Promise<Invitation[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('team_invitations').select('email, role, created_at, name, phone, avatar_path').is('accepted_at', null).order('created_at', { ascending: true });
  if (error) { warn('chargement des invitations', error); return []; }
  return (data as { email: string; role: Exclude<Role, 'traveler'>; created_at: string; name: string | null; phone: string | null; avatar_path: string | null }[])
    .map((r) => ({ email: r.email, role: r.role, createdAt: r.created_at, name: r.name, phone: r.phone, avatarPath: r.avatar_path }));
}

/**
 * Ajoute un membre : promeut le compte s'il existe déjà, sinon crée une
 * invitation appliquée automatiquement à sa première inscription.
 * Le nom, le téléphone et la photo accompagnent l'invitation : ils sont
 * appliqués au profil à la première inscription (supabase/320_member_profile.sql).
 */
export async function inviteMember(
  email: string, role: Exclude<Role, 'traveler'>,
  extra: { name?: string; phone?: string; avatarPath?: string } = {},
): Promise<{ outcome: 'promoted' | 'invited'; error?: string }> {
  if (!supabase) return { outcome: 'invited', error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('admin_add_member', {
    p_email: email.trim().toLowerCase(), p_role: role,
    p_name: extra.name ?? null, p_phone: extra.phone ?? null, p_avatar: extra.avatarPath ?? null,
  });
  return { outcome: data === 'promoted' ? 'promoted' : 'invited', error: error ? humanize(error.message) : undefined };
}

/** Change le rôle d'un compte existant (garde-fous appliqués en base). */
export async function setMemberRole(id: string, role: Role): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
  return { error: error ? humanize(error.message) : undefined };
}

export async function revokeInvitation(email: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.from('team_invitations').delete().eq('email', email);
  return { error: error ? humanize(error.message) : undefined };
}

/** Les garde-fous SQL remontent des messages déjà lisibles : on les laisse passer. */
function humanize(msg: string): string {
  const reseau = messageReseau(msg);
  if (reseau) return reseau;
  if (/row-level security|permission denied/i.test(msg)) return "Action non autorisée : vous n'êtes pas administrateur.";
  return msg;
}

function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}

async function authPinAdmin(payload: Record<string, unknown>): Promise<{ id?: string; email?: string; ok?: boolean; error?: string }> {
  if (!supabase) return { error: 'Indisponible en mode démonstration.' };
  const { data } = await supabase.auth.getSession();
  const jeton = data.session?.access_token;
  if (!jeton) return { error: 'Session expirée. Reconnectez-vous.' };
  try {
    const r = await fetch('/api/auth-pin', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` }, body: JSON.stringify(payload),
    });
    const corps = (await r.json().catch(() => ({}))) as { id?: string; email?: string; ok?: boolean; error?: string };
    return r.ok ? corps : { error: corps.error ?? 'L’opération a échoué. Réessayez.' };
  } catch {
    return { error: 'Connexion impossible. Vérifiez votre réseau et réessayez.' };
  }
}

/** Crée un compte avec son code secret, puis lui accorde le rôle voulu (garde-fous de la base). */
export async function creerMembreAvecCode(v: {
  name: string; phone: string; email: string; pin: string; role: Exclude<Role, 'traveler'>;
}): Promise<{ error?: string }> {
  const created = await authPinAdmin({ action: 'admin-create', name: v.name, phone: v.phone, email: v.email, pin: v.pin });
  if (created.error || !created.id) return { error: created.error ?? 'La création du compte a échoué.' };
  const res = await setMemberRole(created.id, v.role);
  return res.error ? { error: `Compte créé, mais le rôle n’a pas pu être appliqué : ${res.error}` } : {};
}

/** Définit le code secret d'un autre compte (administrateurs). */
export async function definirCodeSecret(id: string, pin: string): Promise<{ error?: string }> {
  const res = await authPinAdmin({ action: 'admin-set-pin', id, pin });
  return res.error ? { error: res.error } : {};
}

/* Corbeille des comptes (supabase/580_account_trash.sql) : 30 jours avant suppression définitive. */
export const TRASH_DAYS = 30;
type TrashRow = { res_id: string; res_status: 'done' | 'skipped'; res_reason: string | null };
async function trashRpc(fn: 'admin_trash_accounts' | 'admin_restore_accounts' | 'admin_purge_accounts', id: string): Promise<{ error?: string; skipped?: string }> {
  if (!supabase) return {};
  const { data, error } = await supabase.rpc(fn, { p_ids: [id] });
  if (error) return { error: humanize(error.message) };
  const row = (data as TrashRow[] | null)?.[0];
  return row?.res_status === 'skipped' ? { error: row.res_reason ?? 'Refusé.' } : {};
}
/** Met un compte à la corbeille : désactivé, masqué, restaurable 30 jours. */
export const trashAccounts = (id: string) => trashRpc('admin_trash_accounts', id);
export const restoreAccounts = (id: string) => trashRpc('admin_restore_accounts', id);
/** Suppression définitive immédiate d'un compte déjà à la corbeille. */
export const purgeAccounts = async (id: string) => {
  const files = await purgeTravelerFiles(id);
  const res = await trashRpc('admin_purge_accounts', id);
  return res.error ? res : files.error ? { error: `Compte supprimé, mais ses photos n’ont pas pu être retirées : ${files.error}` } : res;
};
/** Jours restants avant la purge automatique. */
export function trashDaysLeft(deletedAt: string, now = Date.now()): number {
  return Math.max(0, TRASH_DAYS - Math.floor((now - new Date(deletedAt).getTime()) / 86400000));
}
