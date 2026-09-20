import { supabase } from './supabase';
import type { Role } from './auth';

export interface Member { id: string; name: string | null; email: string; role: Role; createdAt: string }
export interface Invitation { email: string; role: Exclude<Role, 'traveler'>; createdAt: string }

export const ROLE_LABEL: Record<Role, string> = {
  traveler: 'Voyageur',
  team: 'Équipe',
  admin: 'Administrateur',
};

/** Tous les comptes (RLS : réservé aux administrateurs). */
export async function fetchMembers(): Promise<Member[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles').select('id, name, email, role, created_at').order('created_at', { ascending: true });
  if (error) { warn('chargement des comptes', error); return []; }
  return (data as { id: string; name: string | null; email: string; role: Role; created_at: string }[])
    .map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at }));
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
