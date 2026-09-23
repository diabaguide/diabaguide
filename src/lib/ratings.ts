import { supabase } from './supabase';

/* Avis des voyageurs : une note, un commentaire, jusqu'à trois photos, un
   compteur « utile » et une modération par l'équipe. Un avis masqué ne compte
   plus dans la moyenne de la fiche (voir supabase/reviews.sql). */

export type Review = {
  providerId: string;
  userId: string;
  author: string;
  stars: number;
  comment: string;
  photos: string[];
  helpful: number;
  /** Vrai pour l'avis du voyageur connecté. */
  mine: boolean;
  /** Vrai s'il a déjà marqué cet avis comme utile. */
  voted: boolean;
  date: string;
  status: 'published' | 'hidden';
};

type Row = {
  provider_id: string; user_id: string; stars: number; comment: string | null; photos: string[] | null;
  helpful_count: number | null; author_name: string | null; created_at: string; status: string;
};

type ProvRef = { name: string | null; city: string | null; cat: string | null };

// PostgREST renvoie un objet pour une relation « vers un », un tableau quand il
// ne peut pas trancher : on accepte les deux.
type ModRow = Row & { providers: ProvRef | ProvRef[] | null };

const prov = (v: ModRow['providers']): ProvRef | null => (Array.isArray(v) ? (v[0] ?? null) : v);

const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const toReview = (r: Row, meId: string | undefined, votes: Set<string>): Review => ({
  providerId: r.provider_id,
  userId: r.user_id,
  author: r.author_name?.trim() || 'Voyageur',
  stars: r.stars,
  comment: r.comment ?? '',
  photos: r.photos ?? [],
  helpful: r.helpful_count ?? 0,
  mine: !!meId && r.user_id === meId,
  voted: votes.has(r.user_id),
  date: jour(r.created_at),
  status: r.status === 'hidden' ? 'hidden' : 'published',
});

const sel = 'provider_id, user_id, stars, comment, photos, helpful_count, author_name, created_at, status';
const humanize = (msg?: string) => {
  if (!msg) return 'L’enregistrement de l’avis a échoué. Réessayez.';
  if (/row-level security|permission denied/i.test(msg)) return 'Connectez-vous pour donner votre avis.';
  return msg;
};

/** Les avis publiés d'une fiche, le sien en tête, plus ses votes « utile ». */
export async function fetchReviews(providerId: string, meId?: string): Promise<Review[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('ratings')
    .select(sel).eq('provider_id', providerId)
    .order('helpful_count', { ascending: false }).order('created_at', { ascending: false });
  if (error || !data) return [];
  let votes = new Set<string>();
  if (meId) {
    const { data: v } = await supabase.from('review_helpful')
      .select('review_user').eq('provider_id', providerId);
    votes = new Set(((v ?? []) as { review_user: string }[]).map((x) => x.review_user));
  }
  return (data as Row[]).map((r) => toReview(r, meId, votes))
    .sort((a, b) => (a.mine === b.mine ? 0 : a.mine ? -1 : 1));
}

/** L'avis du voyageur connecté, s'il en a déjà écrit un. */
export async function fetchMyReview(providerId: string): Promise<Review | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('ratings').select(sel)
    .eq('provider_id', providerId).maybeSingle();
  if (error || !data) return null;
  return toReview(data as Row, (data as Row).user_id, new Set());
}

/** Note du voyageur connecté pour une fiche (inchangé depuis ratings.sql). */
export async function fetchMyRating(providerId: string): Promise<number | null> {
  const r = await fetchMyReview(providerId);
  return r ? r.stars : null;
}

export type ReviewDraft = { stars: number; comment: string; photos: string[] };

/** Publie ou met à jour l'avis du voyageur connecté. Un avis modifié repasse en
 *  publication : l'équipe le modérera de nouveau si nécessaire. */
export async function saveReview(providerId: string, draft: ReviewDraft, authorName?: string | null): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n’est pas configuré.' };
  if (draft.stars < 1 || draft.stars > 5) return { error: 'Choisissez une note de 1 à 5 étoiles.' };
  const photos = draft.photos.slice(0, 3);
  const { error } = await supabase.from('ratings').upsert({
    provider_id: providerId,
    stars: draft.stars,
    comment: draft.comment.trim().slice(0, 1000) || null,
    photos,
    status: 'published',
    author_name: (authorName ?? '').trim().slice(0, 80) || 'Voyageur',
  }, { onConflict: 'provider_id,user_id' });
  return { error: error ? humanize(error.message) : undefined };
}

/** Note seule : conservé pour les appelants existants. */
export async function rateProvider(providerId: string, stars: number): Promise<{ error?: string }> {
  return saveReview(providerId, { stars, comment: '', photos: [] });
}

/** Marque un avis comme utile (une seule fois, jamais le sien). */
export async function markHelpful(providerId: string, reviewUserId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n’est pas configuré.' };
  const { error } = await supabase.from('review_helpful')
    .insert({ provider_id: providerId, review_user: reviewUserId });
  return { error: error ? humanize(error.message) : undefined };
}

/* ---------------------------------------------------------------- */
/* Modération — équipe et administration                             */
/* ---------------------------------------------------------------- */

export type PendingReview = Review & { providerName: string; cat: string | null; city: string | null };

/** Tous les avis, publiés comme masqués, pour la page de modération. */
export async function fetchReviewsForModeration(): Promise<PendingReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('ratings')
    .select(`${sel}, providers(name, city, cat)`).order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as unknown as ModRow[]).map((r) => {
    const p = prov(r.providers);
    return {
      ...toReview(r, undefined, new Set()),
      providerName: p?.name ?? r.provider_id,
      cat: p?.cat ?? null,
      city: p?.city ?? null,
    };
  });
}

/** Masque ou republie un avis (réservé à l'administration). */
export async function setReviewStatus(providerId: string, userId: string, status: 'published' | 'hidden', note?: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n’est pas configuré.' };
  const { error } = await supabase.rpc('admin_set_review_status', {
    p_provider: providerId, p_user: userId, p_status: status, p_note: note ?? null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Supprime définitivement un avis (réservé à l'administration). */
export async function deleteReviewAsAdmin(providerId: string, userId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase n’est pas configuré.' };
  const { error } = await supabase.rpc('admin_delete_review', { p_provider: providerId, p_user: userId });
  return { error: error ? humanize(error.message) : undefined };
}