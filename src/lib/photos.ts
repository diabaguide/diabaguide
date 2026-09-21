import { supabase } from './supabase';

const BUCKET = 'proposal-photos';

/**
 * Envoie une photo (déjà compressée) dans le bucket privé.
 * Chemin : <user_id>/<uuid>.<ext> — le dossier utilisateur est exigé par les règles d'accès.
 * Sans Supabase (mode démonstration), ne fait rien et réussit.
 */
export async function uploadPhoto(blob: Blob): Promise<{ path?: string; error?: string }> {
  if (!supabase) return {};
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: 'Connectez-vous pour envoyer une photo.' };
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type });
  if (error) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[Diaba Guide] Échec : envoi de la photo.', error);
    }
    return { error: 'L’envoi de la photo a échoué. Réessayez.' };
  }
  return { path };
}

/** URL temporaire pour afficher une photo privée (1 h par défaut). */
export async function photoUrl(path: string, seconds = 3600): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds);
  return error ? null : data.signedUrl;
}
