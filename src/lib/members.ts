import { supabase } from './supabase';
import type { AccountStatus, Role } from './auth';

export interface Member {
  id: string; name: string | null; phone: string | null; email: string; role: Role; createdAt: string;
  /** État du compte (gestion par les administrateurs, voir supabase/admin_travelers.sql). */
  status: AccountStatus;
  suspendedAt: string | null;
  suspendedReason: string | null;
}
export interface Invitation { email: string; role: Exclude<Role, 'traveler'>; createdAt: string }
export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Actif',
  suspended: 'Désactivé',
};

export const ROLE_LABEL: Record<Role, string> = {
  traveler: 'Voyageur',
  team: 'Équipe',
  admin: 'Administrateur',
};

/** Tous les comptes (RLS : réservé aux administrateurs). */
export async function fetchMembers(): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles').select('id, name, phone, email, role, status, suspended_at, suspended_reason, created_at').order('created_at', { ascending: true });
  if (error) { warn('chargement des comptes', error); return []; }
  return (data as {
    id: string; name: string | null; phone: string | null; email: string; role: Role;
    status: AccountStatus | null; suspended_at: string | null; suspended_reason: string | null; created_at: string;
  }[]).map((r) => ({
    id: r.id, name: r.name, phone: r.phone, email: r.email, role: r.role, createdAt: r.created_at,
    status: r.status ?? 'active', suspendedAt: r.suspended_at, suspendedReason: r.suspended_reason,
  }));
}

/* ------------------------------------------------------------------ */
/* Gestion des comptes voyageurs (réservée aux administrateurs).       */
/* Les garde-fous sont en base : supabase/admin_travelers.sql.         */
/* ------------------------------------------------------------------ */

/** Modifie le nom et le téléphone d'un compte voyageur. */
export async function updateTraveler(id: string, name: string, phone: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_update_traveler', { p_id: id, p_name: name, p_phone: phone });
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

/** Supprime définitivement un compte voyageur (action irréversible). */
export async function deleteTraveler(id: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('admin_delete_traveler', { p_id: id });
  return { error: error ? humanize(error.message) : undefined };
}

/* ------------------------------------------------------------------ */
/* Photos du voyageur (supabase/storage_cleanup.sql)                   */
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
    .from('team_invitations').select('email, role, created_at').is('accepted_at', null).order('created_at', { ascending: true });
  if (error) { warn('chargement des invitations', error); return []; }
  return (data as { email: string; role: Exclude<Role, 'traveler'>; created_at: string }[])
    .map((r) => ({ email: r.email, role: r.role, createdAt: r.created_at }));
}

/**
 * Ajoute un membre : promeut le compte s'il existe déjà, sinon crée une
 * invitation appliquée automatiquement à sa première inscription.
 * (Aucune clé service_role n'est nécessaire — elle ne doit jamais être
 * embarquée dans le front.)
 */
export async function inviteMember(
  email: string, role: Exclude<Role, 'traveler'>,
): Promise<{ outcome: 'promoted' | 'invited'; error?: string }> {
  if (!supabase) return { outcome: 'invited', error: 'Supabase non configuré.' };
  const clean = email.trim().toLowerCase();

  const { data: existing } = await supabase.from('profiles').select('id').ilike('email', clean).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', (existing as { id: string }).id);
    return { outcome: 'promoted', error: error ? humanize(error.message) : undefined };
  }

  const { data: me } = await supabase.auth.getUser();
  const { error } = await supabase.from('team_invitations')
    .upsert({ email: clean, role, invited_by: me.user?.id ?? null, accepted_at: null }, { onConflict: 'email' });
  return { outcome: 'invited', error: error ? humanize(error.message) : undefined };
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
  if (/row-level security|permission denied/i.test(msg)) return "Action non autorisée : vous n'êtes pas administrateur.";
  return msg;
}

function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}
