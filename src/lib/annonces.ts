import { supabase } from './supabase';

/* Annonces de services de Diaba Guide : rédigées par l'équipe depuis la
   console (/equipe/annonces), affichées sur le tableau de bord des voyageurs
   (l'accueil). Les écritures passent uniquement par les fonctions SQL admin_*
   (security definer) : aucune clé service_role dans le front, et un voyageur ne
   peut pas publier (voir supabase/annonces.sql). Sans Supabase (mode
   démonstration), les annonces sont conservées dans le navigateur : mêmes
   fonctions, mêmes types. */

export type Annonce = {
  id: string;
  titre: string;
  texte: string;
  /** URL du bouton, ou null quand l'annonce n'a pas de lien d'action. */
  lienUrl: string | null;
  /** Libellé du bouton (« Voir le fret »), toujours avec l'URL. */
  lienLibelle: string | null;
  actif: boolean;
  /** Date de début facultative : avant elle, l'annonce reste invisible. */
  debutLe: string | null;
  /** Date de fin facultative : après elle, l'annonce redevient invisible. */
  finLe: string | null;
  /** Nom de l'auteur, figé à la rédaction. */
  auteur: string | null;
  updatedAt: string;
};

/** Ce que la console saisit : des champs de formulaire, jamais vides par null. */
export type AnnonceSaisie = {
  titre: string;
  texte: string;
  lienUrl: string;
  lienLibelle: string;
  actif: boolean;
  debutLe: string;
  finLe: string;
};

const LOCAL_KEY = 'diaba-annonces';

type AnnonceRow = {
  id: string; titre: string; texte: string;
  lien_url: string | null; lien_libelle: string | null;
  actif: boolean; debut_le: string | null; fin_le: string | null;
  auteur: string | null; updated_at: string;
};

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const rowToAnnonce = (r: AnnonceRow): Annonce => ({
  id: String(r.id), titre: String(r.titre ?? ''), texte: String(r.texte ?? ''),
  lienUrl: r.lien_url ?? null, lienLibelle: r.lien_libelle ?? null,
  actif: !!r.actif, debutLe: r.debut_le ?? null, finLe: r.fin_le ?? null,
  auteur: r.auteur ?? null, updatedAt: String(r.updated_at ?? ''),
});

/* ---------------- Mode démonstration ---------------- */

function readLocal(): Annonce[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeLocal(annonces: Annonce[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(annonces)); } catch { /* quota : on ignore */ }
}

/** Vrai le jour où l'annonce est visible d'un voyageur : active et dans sa période. */
export function estVisible(a: Annonce, aujourdhui = new Date().toISOString().slice(0, 10)): boolean {
  if (!a.actif) return false;
  if (a.debutLe && a.debutLe > aujourdhui) return false;
  if (a.finLe && a.finLe < aujourdhui) return false;
  return true;
}

const parDate = (a: Annonce, b: Annonce) => (b.updatedAt || '').localeCompare(a.updatedAt || '');

/* ---------------- Lecture ---------------- */

const COLONNES = 'id, titre, texte, lien_url, lien_libelle, actif, debut_le, fin_le, auteur, updated_at';

async function charger(): Promise<Annonce[]> {
  const { data, error } = await supabase!
    .from('annonces').select(COLONNES).order('updated_at', { ascending: false });
  if (error || !data) { warn('chargement des annonces', error); return []; }
  return (data as AnnonceRow[]).map(rowToAnnonce).sort(parDate);
}

/** Les annonces visibles du voyageur connecté — la RLS ne rend ni les annonces
    inactives, ni celles hors période. L'accueil s'en sert pour sa section. */
export async function fetchAnnonces(): Promise<Annonce[]> {
  if (!supabase) return readLocal().filter((a) => estVisible(a)).sort(parDate);
  return charger();
}

/** Toutes les annonces, inactives comprises : réservé à l'équipe (RLS). La
    console s'en sert pour sa liste. */
export async function fetchAnnoncesEquipe(): Promise<Annonce[]> {
  if (!supabase) return readLocal().sort(parDate);
  return charger();
}

/* ---------------- Écriture (administrateurs) ---------------- */

export async function creerAnnonce(a: AnnonceSaisie): Promise<{ id?: string; error?: string }> {
  if (!supabase) {
    const annonce: Annonce = {
      id: uid(), titre: a.titre.trim(), texte: a.texte.trim(),
      lienUrl: a.lienUrl.trim() || null,
      lienLibelle: a.lienUrl.trim() ? (a.lienLibelle.trim() || 'En savoir plus') : null,
      actif: a.actif, debutLe: a.debutLe || null, finLe: a.finLe || null,
      auteur: 'Équipe (démonstration)', updatedAt: new Date().toISOString(),
    };
    writeLocal([annonce, ...readLocal()]);
    return { id: annonce.id };
  }
  const { data, error } = await supabase.rpc('admin_creer_annonce', {
    p_titre: a.titre.trim(), p_texte: a.texte.trim(),
    p_lien_url: a.lienUrl.trim() || null, p_lien_libelle: a.lienLibelle.trim() || null,
    p_actif: a.actif, p_debut_le: a.debutLe || null, p_fin_le: a.finLe || null,
  });
  if (error) return { error: humanize(error.message) };
  return { id: data ? String(data) : undefined };
}

/** Enregistre l'annonce telle que la console la présente : les deux dates et le
    lien sont remplacés tels quels (vides = retirés). */
export async function modifierAnnonce(id: string, a: AnnonceSaisie): Promise<{ error?: string }> {
  if (!supabase) {
    const annonces = readLocal();
    const i = annonces.findIndex((x) => x.id === id);
    if (i >= 0) {
      const lien = a.lienUrl.trim();
      annonces[i] = {
        ...annonces[i], titre: a.titre.trim(), texte: a.texte.trim(),
        lienUrl: lien || null, lienLibelle: lien ? (a.lienLibelle.trim() || 'En savoir plus') : null,
        actif: a.actif, debutLe: a.debutLe || null, finLe: a.finLe || null,
        updatedAt: new Date().toISOString(),
      };
      writeLocal(annonces);
    }
    return {};
  }
  const { error } = await supabase.rpc('admin_maj_annonce', {
    p_id: id,
    p_titre: a.titre.trim(), p_texte: a.texte.trim(),
    p_lien_url: a.lienUrl.trim(), p_lien_libelle: a.lienLibelle.trim(),
    p_actif: a.actif, p_debut_le: a.debutLe || null, p_fin_le: a.finLe || null,
    p_remplacer_lien: true, p_remplacer_periode: true,
  });
  return { error: error ? humanize(error.message) : undefined };
}

/** Bascule active / inactive, sans toucher au reste. */
export async function basculerAnnonce(a: Annonce): Promise<{ error?: string }> {
  if (!supabase) {
    const annonces = readLocal();
    const i = annonces.findIndex((x) => x.id === a.id);
    if (i >= 0) { annonces[i] = { ...annonces[i], actif: !a.actif, updatedAt: new Date().toISOString() }; writeLocal(annonces); }
    return {};
  }
  const { error } = await supabase.rpc('admin_maj_annonce', { p_id: a.id, p_actif: !a.actif });
  return { error: error ? humanize(error.message) : undefined };
}

export async function supprimerAnnonce(id: string): Promise<{ error?: string }> {
  if (!supabase) { writeLocal(readLocal().filter((x) => x.id !== id)); return {}; }
  const { error } = await supabase.rpc('admin_supprimer_annonce', { p_id: id });
  return { error: error ? humanize(error.message) : undefined };
}

/* ---------------- Messages ---------------- */

/* Erreur avalée côté écran : si la table n'existe pas encore (migration non
   exécutée), l'accueil et la console s'affichent normalement, simplement sans
   annonces. Le message ci-dessous n'apparaît qu'après une tentative d'écriture. */
function humanize(msg: string): string {
  if (/row-level security|permission denied/i.test(msg)) return 'Action réservée aux administrateurs.';
  if (/could not find the function|does not exist|schema cache/i.test(msg)) {
    return 'Les annonces ne sont pas encore installées : exécutez supabase/annonces.sql dans Supabase.';
  }
  return msg;
}

function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}