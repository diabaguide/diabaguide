import type { Session } from '@supabase/supabase-js';
import { convivial, messageReseau } from './erreurs';
import { supabase } from './supabase';
import { identifiantEstUnNumero, isInternalEmail, phoneOf } from './phone';

/** « livreur » : membre de l'équipe limité au module fret (voir supabase/310_livreur.sql). */
export type Role = 'traveler' | 'livreur' | 'team' | 'admin';
/** État du compte : un compte désactivé par un administrateur ne peut plus se connecter. */
export type AccountStatus = 'active' | 'suspended';
/**
 * Clé de sessionStorage portant le motif d'une déconnexion forcée
 * (compte désactivé) jusqu'à l'écran de connexion.
 */
export const ACCOUNT_NOTICE_KEY = 'diaba-account-notice';
export interface AuthUser { id: string; name: string; phone: string; email: string; role: Role; status: AccountStatus; avatarPath?: string | null; isPrimaryAdmin?: boolean }
/** Un admin dispose aussi de tous les droits « équipe ». */
export const isTeamRole = (r: Role | undefined) => r === 'team' || r === 'admin';
/** Accès au module fret : le livreur, l'équipe et les administrateurs. */
export const isFretRole = (r: Role | undefined) => r === 'livreur' || isTeamRole(r);
/** Page d'arrivée après connexion, selon le rôle. */
export const homeFor = (r: Role | undefined) => (r === 'livreur' ? '/fret' : isTeamRole(r) ? '/equipe' : '/accueil');

/** Traduit les messages d'erreur Supabase courants en français. */
function translate(msg: string): string {
  const reseau = messageReseau(msg);
  if (reseau) return reseau;
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Le numéro ou le code secret n’est pas correct.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà pour cet identifiant.';
  if (m.includes('password should be at least')) return 'Le code secret doit contenir entre 3 et 6 chiffres.';
  if (m.includes('email not confirmed')) return 'Compte non confirmé. Vérifiez votre boîte de réception.';
  if (m.includes('unable to validate email') || m.includes('invalid email') || m.includes('validate email')) return 'Adresse e-mail invalide.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Trop de tentatives. Réessayez dans quelques minutes.';
  if (m.includes('database error saving new user')) return 'Ce numéro de téléphone est déjà utilisé par un compte.';
  // Message inattendu : on n'affiche jamais d'anglais technique au voyageur,
  // mais il reste dans la console pour pouvoir diagnostiquer.
  console.warn('[connexion]', msg);
  return 'La connexion a échoué. Vérifiez vos informations et réessayez.';
}

/** Récupère (ou déduit) le profil d'un utilisateur authentifié. */
async function profileFor(id: string, email: string, metaName?: string, metaPhone?: string): Promise<AuthUser> {
  // Repli volontairement au rôle le plus faible : un privilège ne doit jamais
  // être déduit de l'e-mail ni accordé parce que la lecture du profil échoue.
  let role: Role = 'traveler';
  let name = metaName ?? (isInternalEmail(email) ? phoneOf(metaPhone, email) : email.split('@')[0]);
  let phone = metaPhone ?? '';
  let status: AccountStatus = 'active';
  let avatarPath: string | null = null;
  let isPrimaryAdmin = false;
  try {
    const { data } = await supabase!.from('profiles').select('name, phone, role, status, avatar_path, is_primary_admin').eq('id', id).maybeSingle();
    if (data) {
      role = (data.role as Role) ?? role;
      name = data.name ?? name;
      phone = data.phone ?? phone;
      status = (data.status as AccountStatus) ?? status;
      avatarPath = (data.avatar_path as string | null) ?? null;
      isPrimaryAdmin = data.is_primary_admin === true;
    }
  } catch { /* profil pas encore créé (trigger) : on reste « voyageur » */ }
  // Un compte inscrit avec son seul numéro reçoit une adresse interne
  // (« p782254040@diabaguide.local ») : elle ne doit jamais être montrée. On
  // affiche le numéro, que l'on retrouve aussi sans profil lisible.
  return { id, name, phone: phoneOf(phone, email), email: isInternalEmail(email) ? '' : email, role, status, avatarPath, isPrimaryAdmin };
}

/** Utilisateur courant à partir d'une session Supabase (ou null). */
export async function userFromSession(session: Session | null): Promise<AuthUser | null> {
  if (!session?.user) return null;
  const u = session.user;
  const meta = u.user_metadata as { name?: string; phone?: string } | null;
  return profileFor(u.id, u.email ?? '', meta?.name, meta?.phone);
}

/** Le numéro est-il libre ? `null` si la vérification n'a pas pu être faite. */
export async function phoneAvailable(phone: string): Promise<boolean | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('phone_available', { p_phone: phone });
  // Vérification impossible : on laisse l'inscription se faire, la base refusant
  // de toute façon un second compte sur le même numéro.
  return error ? null : data === true;
}

type PinSession = { access_token: string; refresh_token: string; expires_in?: number };

async function authPinApi(
  payload: Record<string, unknown>, token?: string,
): Promise<{ session?: PinSession; ok?: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth-pin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({})) as PinSession & { ok?: boolean; error?: string };
    if (!response.ok) return { error: data.error ?? 'Service temporairement indisponible.' };
    if (data.access_token && data.refresh_token) return { session: data };
    return { ok: data.ok === true };
  } catch (error) {
    return { error: convivial(error instanceof Error ? error.message : String(error)) };
  }
}

async function installPinSession(session: PinSession): Promise<{ session?: Session; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return error || !data.session
    ? { error: error ? translate(error.message) : 'Connexion impossible.' }
    : { session: data.session };
}

export async function signUp(
  name: string, phone: string, email: string, password: string,
): Promise<{ user?: AuthUser; needsConfirm?: boolean; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  void email; // conservé dans la signature pour compatibilité des appels existants
  const result = await authPinApi({ action: 'signup', name, phone, pin: password });
  if (result.error || !result.session) return { error: result.error ?? 'Création de compte impossible.' };
  const installed = await installPinSession(result.session);
  if (installed.error || !installed.session) return { error: installed.error ?? 'Connexion impossible.' };
  const authUser = installed.session.user;
  return { user: await profileFor(authUser.id, authUser.email ?? '', name, phone) };
}

export async function signIn(
  identifiant: string, password: string,
): Promise<{ user?: AuthUser; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const saisie = identifiant.trim();
  const legacyEmail = identifiantEstUnNumero(saisie) ? '' : saisie.toLowerCase();
  const result = await authPinApi(legacyEmail
    ? { action: 'login', legacyEmail, legacyPassword: password }
    : { action: 'login', phone: saisie, pin: password });
  if (result.error || !result.session) return { error: result.error ?? 'Connexion impossible.' };
  const installed = await installPinSession(result.session);
  if (installed.error || !installed.session) return { error: installed.error ?? 'Connexion impossible.' };
  const authUser = installed.session.user;
  const meta = authUser.user_metadata as { name?: string; phone?: string } | null;
  const user = await profileFor(authUser.id, authUser.email ?? '', meta?.name, meta?.phone);
  // Compte désactivé par un administrateur : on ferme la session immédiatement.
  // (La base refuse de toute façon la connexion : voir supabase/150_admin_travelers.sql.)
  if (user.status === 'suspended') {
    await supabase.auth.signOut();
    return { error: 'Ce compte a été désactivé. Contactez l’équipe Diaba Guide.' };
  }
  return { user };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Révoque les sessions de tous les appareils (scope global de Supabase Auth). */
export async function signOutEverywhere(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut({ scope: 'global' });
}

export async function sendPasswordReset(identifiant: string): Promise<{ error?: string; sansEmail?: boolean }> {
  if (!supabase) return {};
  /* Un compte créé avec son seul numéro n'a pas d'adresse : aucun lien ne peut
     lui être envoyé. L'écran l'explique et indique quoi faire. */
  if (identifiantEstUnNumero(identifiant)) return { sansEmail: true };
  const { error } = await supabase.auth.resetPasswordForEmail(identifiant.trim().toLowerCase(), {
    redirectTo: window.location.origin + '/reinitialiser',
  });
  return { error: error ? translate(error.message) : undefined };
}

/** Modifie le nom et le téléphone du compte connecté (supabase/300_update_my_profile.sql). */
export async function updateMyProfile(
  name: string, phone: string, avatar: { path?: string; remove?: boolean } = {},
): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('update_my_profile', {
    p_name: name, p_phone: phone, p_avatar: avatar.path ?? null, p_remove_avatar: avatar.remove ?? false,
  });
  return { error: error ? convivial(error.message) : undefined };
}

/**
 * Change le mot de passe du compte connecté, après avoir vérifié l'ancien :
 * une session laissée ouverte sur un téléphone prêté ne suffit pas à prendre
 * le compte.
 */
export async function changeMyPassword(current: string, next: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Session expirée. Reconnectez-vous.' };
  const result = await authPinApi({ action: 'change', current, pin: next }, token);
  return { error: result.error };
}

/** Définit un nouveau mot de passe pour la session courante (récupération). */
export async function updatePassword(password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'Session expirée. Reconnectez-vous.' };
  const result = await authPinApi({ action: 'update', pin: password }, token);
  return { error: result.error };
}
