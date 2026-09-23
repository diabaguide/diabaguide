import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { identifiantEstUnNumero, isInternalEmail, phoneLoginId, phoneOf } from './phone';

export type Role = 'traveler' | 'team' | 'admin';
/** État du compte : un compte désactivé par un administrateur ne peut plus se connecter. */
export type AccountStatus = 'active' | 'suspended';
/**
 * Clé de sessionStorage portant le motif d'une déconnexion forcée
 * (compte désactivé) jusqu'à l'écran de connexion.
 */
export const ACCOUNT_NOTICE_KEY = 'diaba-account-notice';
export interface AuthUser { id: string; name: string; phone: string; email: string; role: Role; status: AccountStatus }
/** Un admin dispose aussi de tous les droits « équipe ». */
export const isTeamRole = (r: Role | undefined) => r === 'team' || r === 'admin';

/** Traduit les messages d'erreur Supabase courants en français. */
function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail, téléphone ou mot de passe incorrect.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'Un compte existe déjà pour cet identifiant.';
  if (m.includes('password should be at least')) return 'Le mot de passe doit contenir au moins 8 caractères.';
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
  try {
    const { data } = await supabase!.from('profiles').select('name, phone, role, status').eq('id', id).maybeSingle();
    if (data) {
      role = (data.role as Role) ?? role;
      name = data.name ?? name;
      phone = data.phone ?? phone;
      status = (data.status as AccountStatus) ?? status;
    }
  } catch { /* profil pas encore créé (trigger) : on reste « voyageur » */ }
  // Un compte inscrit avec son seul numéro reçoit une adresse interne
  // (« p782254040@diabaguide.local ») : elle ne doit jamais être montrée. On
  // affiche le numéro, que l'on retrouve aussi sans profil lisible.
  return { id, name, phone: phoneOf(phone, email), email: isInternalEmail(email) ? '' : email, role, status };
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

export async function signUp(
  name: string, phone: string, email: string, password: string,
): Promise<{ user?: AuthUser; needsConfirm?: boolean; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  /* Le téléphone suffit : sans adresse, le compte reçoit une adresse interne
     déduite du numéro (même règle qu'en base, voir src/lib/phone.ts). */
  const identifiant = email.trim() ? email.trim().toLowerCase() : phoneLoginId(phone);
  if (!identifiant) return { error: 'Saisissez un numéro de téléphone valide.' };
  if (!email.trim() && (await phoneAvailable(phone)) === false) {
    return { error: 'Un compte existe déjà pour ce numéro. Connectez-vous, ou utilisez « Mot de passe oublié ».' };
  }
  const { data, error } = await supabase.auth.signUp({ email: identifiant, password, options: { data: { name, phone } } });
  if (error) return { error: translate(error.message) };
  // Avec la confirmation par e-mail activée, Supabase ne renvoie pas d'erreur
  // pour un identifiant déjà utilisé (afin de ne pas révéler les comptes
  // existants) : `identities` est alors vide au lieu de contenir la nouvelle
  // identité créée.
  if (data.user?.identities?.length === 0) return { error: 'Un compte existe déjà pour cet identifiant.' };
  if (!data.session) return { needsConfirm: true }; // confirmation par e-mail activée
  return { user: await profileFor(data.user!.id, identifiant, name, phone) };
}

export async function signIn(
  identifiant: string, password: string,
): Promise<{ user?: AuthUser; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  /* Connexion par e-mail ou par téléphone : les comptes créés avec leur seul
     numéro n'ont pas d'adresse, et l'application ne doit pas la demander. */
  const saisie = identifiant.trim();
  const email = identifiantEstUnNumero(saisie) ? phoneLoginId(saisie) : saisie.toLowerCase();
  if (!email) return { error: 'Vérifiez votre numéro de téléphone : il manque des chiffres.' };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: translate(error.message) };
  const meta = data.user.user_metadata as { name?: string; phone?: string } | null;
  const user = await profileFor(data.user.id, email, meta?.name, meta?.phone);
  // Compte désactivé par un administrateur : on ferme la session immédiatement.
  // (La base refuse de toute façon la connexion : voir supabase/admin_travelers.sql.)
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

/** Définit un nouveau mot de passe pour la session courante (récupération). */
export async function updatePassword(password: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.auth.updateUser({ password });
  return { error: error ? translate(error.message) : undefined };
}
