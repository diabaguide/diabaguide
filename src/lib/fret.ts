import { supabase } from './supabase';
import { isInternalEmail } from './phone';

/* Suivi de fret Chine / Sénégal, côté équipe : un lot par conteneur ou par
   envoi aérien, et ses étapes (préparation → livré).

   Écritures : uniquement par les fonctions `admin_*` de la base (voir
   supabase/fret_tracking.sql). La RLS n'accorde AUCUNE politique d'écriture
   sur `expeditions` ni `expedition_etapes` : un `insert` direct depuis ici
   échouerait, et c'est voulu — les fonctions vérifient le rôle, recalculent
   le statut du lot et refusent de faire reculer une étape.

   Lecture : colonne par colonne, jamais `select *`. Le droit de lecture est
   accordé colonne par colonne à `authenticated` et `notes` en est EXCLUE :
   les notes internes ne descendent jamais chez le voyageur, elles passent
   par `admin_notes_expedition()`.

   Sans Supabase (mode démonstration), les lots vivent dans le navigateur :
   mêmes fonctions, mêmes types. */

export type Statut = 'preparation' | 'regroupage' | 'embarque' | 'transit' | 'douane' | 'arrive' | 'livre';
export type Fret = 'sea' | 'air';

/** Les statuts dans l'ordre du voyage : sert à n'offrir que les étapes qui
    font avancer un lot, jamais celles qui le feraient reculer. */
export const STATUTS: Statut[] = ['preparation', 'regroupage', 'embarque', 'transit', 'douane', 'arrive', 'livre'];

export const STATUT_LABEL: Record<Statut, string> = {
  preparation: 'Préparation',
  regroupage: 'Regroupage',
  embarque: 'Embarqué',
  transit: 'En mer / en vol',
  douane: 'Dédouanement Dakar',
  arrive: 'Arrivé',
  livre: 'Livré',
};

export const FRET_LABEL: Record<Fret, string> = { sea: 'Maritime (conteneur)', air: 'Aérien (AWB)' };

export const ORIGINES = ['Guangzhou', 'Shenzhen'];

export type Expedition = {
  id: string;
  code: string;
  userId: string;
  providerId: string | null;
  fret: Fret;
  origine: string;
  conteneur: string;
  articles: string;
  poids: string;
  /** Nombre de mètres cubes du lot (facultatif). */
  cbm: number | null;
  /** Chemin de la photo du lot dans le bucket privé `fret-photos` ('' si aucune). */
  photo: string;
  departLe: string | null;
  arriveePrevue: string | null;
  arriveeLe: string | null;
  statut: Statut;
  createdAt: string;
  updatedAt: string;
};

/** Un compte voyageur, pour rattacher un lot : la lecture de `profiles` est
    réservée à l'administration (RLS), donc le nom du voyageur d'un lot se
    cherche dans cette liste, il ne vient pas du lot lui-même. */
export type Voyageur = { id: string; nom: string; email: string };

export type Etape = {
  id: string;
  statut: Statut;
  lieu: string;
  note: string;
  photo: string | null;
  publique: boolean;
  survenuLe: string;
  estime: boolean;
};

export type NouveauLot = {
  userId: string;
  fret: Fret;
  origine: string;
  providerId?: string | null;
  conteneur?: string;
  articles?: string;
  poids?: string;
  cbm?: number | null;
  /** Photo déjà déposée dans `fret-photos` (l'envoi se fait avant la création). */
  photo?: string;
  departLe?: string | null;
  arriveePrevue?: string | null;
  notes?: string;
};

export type NouvelleEtape = {
  expeditionId: string;
  statut: Statut;
  lieu?: string;
  note?: string;
  publique?: boolean;
  survenuLe?: string | null;
  estime?: boolean;
};

/** Champs modifiables d'un lot. `null` = inchangé (la fonction de base ne
    peut pas vider un champ, elle ignore les valeurs nulles). */
export type ChampsLot = {
  id: string;
  conteneur?: string;
  articles?: string;
  poids?: string;
  cbm?: number | null;
  /** Un chemin VIDE retire la photo (la base ne sait pas écrire « nul »). */
  photo?: string;
  providerId?: string;
  departLe?: string | null;
  arriveePrevue?: string | null;
  arriveeLe?: string | null;
  notes?: string;
  shipsgoId?: number | null;
  shipsgoType?: string | null;
};

/** Une ligne d'article transporté : nom, quantité, poids (facultatif). */
export type Article = {
  id: string;
  expeditionId: string;
  nom: string;
  quantite: number;
  poids: number | null;
};

export type NouvelArticle = { expeditionId: string; nom: string; quantite: number; poids?: number | null };
export type ChampsArticle = { id: string; nom: string; quantite: number; poids?: number | null };

const LOCAL_KEY = 'diaba-fret';

type LocalLot = Expedition & { notes: string; etapes: Etape[]; lignes: Article[] };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

function readLocal(): LocalLot[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function writeLocal(lots: LocalLot[]) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(lots)); } catch { /* quota : on ignore */ }
}

/** Message lisible à partir d'une erreur Supabase ou d'un `raise exception`
    de la base (le texte français de la fonction est déjà clair). */
const message = (e: unknown): string => {
  const m = (e as { message?: string } | null)?.message;
  return typeof m === 'string' && m.trim() ? m.trim() : 'Action impossible. Réessayez.';
};

const statutValide = (v: unknown): Statut =>
  (STATUTS as string[]).includes(String(v)) ? (String(v) as Statut) : 'preparation';

const rowToLot = (r: Record<string, unknown>): Expedition => ({
  id: String(r.id),
  code: String(r.code ?? ''),
  userId: String(r.user_id ?? ''),
  providerId: (r.provider_id as string) ?? null,
  fret: r.fret === 'air' ? 'air' : 'sea',
  origine: String(r.origine ?? ''),
  conteneur: String(r.conteneur ?? ''),
  articles: String(r.articles ?? ''),
  poids: String(r.poids ?? ''),
  cbm: r.cbm == null ? null : Number(r.cbm),
  photo: String(r.photo ?? ''),
  departLe: (r.depart_le as string) ?? null,
  arriveePrevue: (r.arrivee_prevue as string) ?? null,
  arriveeLe: (r.arrivee_le as string) ?? null,
  statut: statutValide(r.statut),
  createdAt: String(r.created_at ?? ''),
  updatedAt: String(r.updated_at ?? ''),
});

const rowToArticle = (r: Record<string, unknown>): Article => ({
  id: String(r.id),
  expeditionId: String(r.expedition_id ?? ''),
  nom: String(r.nom ?? ''),
  quantite: Number(r.quantite ?? 1),
  poids: r.poids == null ? null : Number(r.poids),
});

const rowToEtape = (r: Record<string, unknown>): Etape => ({
  id: String(r.id),
  statut: statutValide(r.statut),
  lieu: String(r.lieu ?? ''),
  note: String(r.note ?? ''),
  photo: (r.photo as string) ?? null,
  publique: r.publique !== false,
  survenuLe: String(r.survenu_le ?? r.created_at ?? ''),
  estime: !!r.estime,
});

/** Les lots à suivre, le plus récent en tête. Colonnes nommées une à une :
    `notes` n'est pas lisible par le rôle connecté. */
export async function fetchExpeditions(): Promise<Expedition[]> {
  if (!supabase) {
    return readLocal()
      .map((l) => ({ ...l, notes: undefined, etapes: undefined }) as unknown as Expedition)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  const { data, error } = await supabase.from('expeditions')
    .select('id, code, user_id, provider_id, fret, origine, conteneur, articles, poids, cbm, photo, depart_le, arrivee_prevue, arrivee_le, statut, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToLot);
}

/** Les comptes voyageurs, pour rattacher un lot. Lecture réservée à
    l'administration (RLS sur `profiles`) : pour un membre de l'équipe sans
    droits d'administration, la liste revient vide — c'est attendu, et l'écran
    le dit. */
export async function fetchVoyageurs(): Promise<Voyageur[]> {
  if (!supabase) {
    const vus = new Map<string, Voyageur>();
    readLocal().forEach((l) => vus.set(l.userId, { id: l.userId, nom: 'Voyageur (démonstration)', email: '' }));
    return [...vus.values()];
  }
  const { data, error } = await supabase.from('profiles')
    .select('id, name, email').eq('role', 'traveler').order('name');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    nom: String(r.name ?? '—'),
    // Un compte créé avec un seul numéro porte une adresse interne : elle n'est
    // jamais montrée, même à l'équipe (voir src/lib/phone.ts).
    email: isInternalEmail(r.email as string) ? '' : String(r.email ?? ''),
  }));
}

/** Les fiches de transitaire seulement : `suivi_public` ne publie le nom et
    le téléphone que d'une fiche `cat = 'transitaire'`, et la base refuse un
    lot rattaché à une autre catégorie. */
export async function fetchTransitaires(): Promise<{ id: string; nom: string; ville: string }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('providers')
    .select('id, name, city').eq('cat', 'transitaire').order('name');
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), nom: String(r.name ?? '—'), ville: String(r.city ?? ''),
  }));
}

/* ------------------------------------------------------------------ */
/* Les articles transportés : des lignes, plus un champ de texte.      */
/* Lecture accordée au propriétaire du lot et à l'équipe ; AUCUNE      */
/* politique d'écriture — tout passe par les fonctions admin_*.        */
/* (voir supabase/fret_lot2b.sql)                                      */
/* ------------------------------------------------------------------ */

/** Les lignes d'articles d'un lot, dans leur ordre de saisie. */
export async function fetchArticles(expeditionId: string): Promise<Article[]> {
  if (!supabase) return (readLocal().find((x) => x.id === expeditionId)?.lignes ?? []);
  const { data, error } = await supabase.from('expedition_articles')
    .select('id, expedition_id, nom, quantite, poids, created_at')
    .eq('expedition_id', expeditionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToArticle);
}

export async function ajouterArticle(a: NouvelArticle): Promise<{ id?: string; error?: string }> {
  if (!supabase) {
    const lots = readLocal();
    const l = lots.find((x) => x.id === a.expeditionId);
    if (!l) return { error: 'Lot introuvable.' };
    const id = uid();
    l.lignes = [...(l.lignes ?? []),
      { id, expeditionId: a.expeditionId, nom: a.nom, quantite: a.quantite, poids: a.poids ?? null }];
    writeLocal(lots);
    return { id };
  }
  const { data, error } = await supabase.rpc('admin_ajouter_article', {
    p_expedition_id: a.expeditionId, p_nom: a.nom, p_quantite: a.quantite, p_poids: a.poids ?? null,
  });
  if (error) return { error: message(error) };
  return { id: typeof data === 'string' ? data : undefined };
}

export async function majArticle(c: ChampsArticle): Promise<{ error?: string }> {
  if (!supabase) {
    const lots = readLocal();
    for (const l of lots) {
      const ligne = (l.lignes ?? []).find((x) => x.id === c.id);
      if (ligne) {
        ligne.nom = c.nom; ligne.quantite = c.quantite; ligne.poids = c.poids ?? null;
        writeLocal(lots);
        return {};
      }
    }
    return { error: 'Article introuvable.' };
  }
  const { error } = await supabase.rpc('admin_maj_article', {
    p_id: c.id, p_nom: c.nom, p_quantite: c.quantite, p_poids: c.poids ?? null,
  });
  return error ? { error: message(error) } : {};
}

export async function supprimerArticle(id: string): Promise<{ error?: string }> {
  if (!supabase) {
    const lots = readLocal();
    for (const l of lots) {
      const reste = (l.lignes ?? []).filter((x) => x.id !== id);
      if (reste.length !== (l.lignes ?? []).length) { l.lignes = reste; writeLocal(lots); return {}; }
    }
    return { error: 'Article introuvable.' };
  }
  const { error } = await supabase.rpc('admin_supprimer_article', { p_id: id });
  return error ? { error: message(error) } : {};
}

/** Les étapes d'un lot, dans l'ordre du voyage (date du mouvement, pas date
    de saisie : un webhook arrivé en retard se replace à sa vraie date). */
export async function fetchEtapes(expeditionId: string): Promise<Etape[]> {
  if (!supabase) {
    const l = readLocal().find((x) => x.id === expeditionId);
    return (l?.etapes ?? []).slice().sort((a, b) => a.survenuLe.localeCompare(b.survenuLe));
  }
  const { data, error } = await supabase.from('expedition_etapes')
    .select('id, statut, lieu, note, photo, publique, source, ref_shipsgo, survenu_le, estime, created_at')
    .eq('expedition_id', expeditionId)
    .order('survenu_le', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToEtape);
}

/** Les notes internes du lot, pour la fiche équipe uniquement. */
export async function fetchNotes(expeditionId: string): Promise<string | null> {
  if (!supabase) return readLocal().find((x) => x.id === expeditionId)?.notes ?? null;
  const { data, error } = await supabase.rpc('admin_notes_expedition', { p_id: expeditionId });
  if (error || !data) return null;
  const ligne = (Array.isArray(data) ? data[0] : data) as { notes?: string } | undefined;
  return ligne?.notes ?? '';
}

export async function creerExpedition(lot: NouveauLot): Promise<{ id?: string; code?: string; error?: string }> {
  if (!supabase) {
    const id = uid();
    const code = `DIA-${new Date().getFullYear()}-${String(readLocal().length + 1).padStart(4, '0')}`;
    writeLocal([...readLocal(), {
      id, code, userId: lot.userId, providerId: lot.providerId ?? null, fret: lot.fret,
      origine: lot.origine, conteneur: lot.conteneur ?? '', articles: lot.articles ?? '',
      poids: lot.poids ?? '', cbm: lot.cbm ?? null, photo: lot.photo ?? '',
      departLe: lot.departLe ?? null, arriveePrevue: lot.arriveePrevue ?? null,
      arriveeLe: null, statut: 'preparation', createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(), notes: lot.notes ?? '', etapes: [], lignes: [],
    }]);
    return { id, code };
  }
  const { data, error } = await supabase.rpc('admin_creer_expedition', {
    p_user_id: lot.userId,
    p_fret: lot.fret,
    p_origine: lot.origine,
    p_provider_id: lot.providerId ?? null,
    p_conteneur: lot.conteneur ?? null,
    p_articles: lot.articles ?? null,
    p_poids: lot.poids ?? null,
    p_depart_le: lot.departLe ?? null,
    p_arrivee_prevue: lot.arriveePrevue ?? null,
    p_list_id: null,
    p_notes: lot.notes ?? null,
  });
  if (error) return { error: message(error) };
  const ligne = (Array.isArray(data) ? data[0] : data) as { id?: string; code?: string } | undefined;

  /* `admin_creer_expedition` ne connaît pas le CBM ni la photo (le lot n'a pas
     encore d'identifiant quand la console les choisit). On les pose juste
     après, avec la fonction de modification : le lot est créé en une seule
     fois du point de vue de l'utilisateur. */
  if (ligne?.id && (lot.cbm != null || lot.photo)) {
    const suite = await majExpedition({ id: ligne.id, cbm: lot.cbm ?? undefined, photo: lot.photo ?? undefined });
    if (suite.error) return { id: ligne.id, code: ligne.code };
  }
  return { id: ligne?.id, code: ligne?.code };
}

export async function ajouterEtape(e: NouvelleEtape): Promise<{ error?: string }> {
  if (!supabase) {
    const lots = readLocal();
    const l = lots.find((x) => x.id === e.expeditionId);
    if (!l) return { error: 'Lot introuvable.' };
    l.etapes.push({
      id: uid(), statut: e.statut, lieu: e.lieu ?? '', note: e.note ?? '', photo: null,
      publique: e.publique !== false, survenuLe: e.survenuLe ?? new Date().toISOString(), estime: !!e.estime,
    });
    if (STATUTS.indexOf(e.statut) > STATUTS.indexOf(l.statut)) l.statut = e.statut;
    l.updatedAt = new Date().toISOString();
    writeLocal(lots);
    return {};
  }
  const { error } = await supabase.rpc('admin_ajouter_etape', {
    p_expedition_id: e.expeditionId,
    p_statut: e.statut,
    p_lieu: e.lieu ?? null,
    p_note: e.note ?? null,
    p_photo: null,
    p_publique: e.publique !== false,
    p_source: 'equipe',
    p_ref_shipsgo: null,
    p_survenu_le: e.survenuLe ?? null,
    p_estime: !!e.estime,
  });
  return error ? { error: message(error) } : {};
}

export async function majExpedition(c: ChampsLot): Promise<{ error?: string }> {
  if (!supabase) {
    const lots = readLocal();
    const l = lots.find((x) => x.id === c.id);
    if (!l) return { error: 'Lot introuvable.' };
    if (c.conteneur !== undefined) l.conteneur = c.conteneur;
    if (c.articles !== undefined) l.articles = c.articles;
    if (c.poids !== undefined) l.poids = c.poids;
    if (c.cbm !== undefined) l.cbm = c.cbm;
    if (c.photo !== undefined) l.photo = c.photo;
    if (c.providerId !== undefined) l.providerId = c.providerId;
    if (c.departLe !== undefined) l.departLe = c.departLe;
    if (c.arriveePrevue !== undefined) l.arriveePrevue = c.arriveePrevue;
    if (c.arriveeLe !== undefined) l.arriveeLe = c.arriveeLe;
    if (c.notes !== undefined) l.notes = c.notes;
    l.updatedAt = new Date().toISOString();
    writeLocal(lots);
    return {};
  }
  const { error } = await supabase.rpc('admin_maj_expedition', {
    p_id: c.id,
    p_conteneur: c.conteneur ?? null,
    p_articles: c.articles ?? null,
    p_poids: c.poids ?? null,
    p_provider_id: c.providerId ?? null,
    p_depart_le: c.departLe ?? null,
    p_arrivee_prevue: c.arriveePrevue ?? null,
    p_arrivee_le: c.arriveeLe ?? null,
    p_notes: c.notes ?? null,
    p_shipsgo_id: c.shipsgoId ?? null,
    p_shipsgo_type: c.shipsgoType ?? null,
    p_cbm: c.cbm ?? null,
    p_photo: c.photo ?? null,
  });
  return error ? { error: message(error) } : {};
}

export async function supprimerExpedition(id: string): Promise<{ error?: string }> {
  if (!supabase) {
    writeLocal(readLocal().filter((x) => x.id !== id));
    return {};
  }
  const { error } = await supabase.rpc('admin_supprimer_expedition', { p_id: id });
  return error ? { error: message(error) } : {};
}
/* ------------------------------------------------------------------ */
/* Suivi public par code de lot (lot 3)                               */
/*                                                                    */
/* Lecture par `suivi_public(code)`, la SEULE fonction accordée à     */
/* `anon` : statut, dates, étapes publiques et transitaire (nom et    */
/* téléphone d'un professionnel de l'annuaire). Jamais le voyageur,   */
/* ses articles ni les notes internes : la page n'a rien d'autre à    */
/* afficher, et la base ne le lui donnerait pas.                      */
/* ------------------------------------------------------------------ */

/** Format d'un code de lot : DIA-AAAA-NNNN. */
export const CODE_LOT = /^DIA-\d{4}-\d{4}$/;

/** Met un code saisi à la main au bon format (« dia 2026 1 » → « DIA-2026-0001 »). */
export function normaliserCode(saisie: string): string {
  const s = saisie.trim().toUpperCase().replace(/[\s_.]+/g, '-');
  const m = s.match(/^DIA-?(\d{4})-?(\d{1,4})$/);
  return m ? `DIA-${m[1]}-${m[2].padStart(4, '0')}` : s;
}

export type EtapePublique = {
  statut: Statut;
  lieu: string;
  note: string;
  survenuLe: string;
  estime: boolean;
};

export type SuiviPublic = {
  code: string;
  fret: Fret;
  origine: string;
  statut: Statut;
  departLe: string | null;
  arriveePrevue: string | null;
  arriveeLe: string | null;
  transitaire: { nom: string; telephone: string } | null;
  etapes: EtapePublique[];
};

/** `null` : aucun lot ne porte ce code. */
export async function fetchSuiviPublic(saisie: string): Promise<{ suivi: SuiviPublic | null; error?: string }> {
  const code = normaliserCode(saisie);
  if (!CODE_LOT.test(code)) return { suivi: null };

  if (!supabase) {
    const l = readLocal().find((x) => x.code === code);
    if (!l) return { suivi: null };
    return {
      suivi: {
        code: l.code, fret: l.fret, origine: l.origine, statut: l.statut,
        departLe: l.departLe, arriveePrevue: l.arriveePrevue, arriveeLe: l.arriveeLe,
        transitaire: null,
        etapes: (l.etapes ?? []).filter((e) => e.publique)
          .map((e) => ({ statut: e.statut, lieu: e.lieu, note: e.note, survenuLe: e.survenuLe, estime: e.estime }))
          .sort((a, b) => a.survenuLe.localeCompare(b.survenuLe)),
      },
    };
  }

  const { data, error } = await supabase.rpc('suivi_public', { p_code: code });
  if (error) return { suivi: null, error: message(error) };
  if (!data) return { suivi: null };
  const r = data as Record<string, unknown>;
  const tr = r.transitaire as Record<string, unknown> | null;
  const etapes = Array.isArray(r.etapes) ? (r.etapes as Record<string, unknown>[]) : [];
  return {
    suivi: {
      code: String(r.code ?? code),
      fret: r.fret === 'air' ? 'air' : 'sea',
      origine: String(r.origine ?? ''),
      statut: statutValide(r.statut),
      departLe: (r.depart_le as string) ?? null,
      arriveePrevue: (r.arrivee_prevue as string) ?? null,
      arriveeLe: (r.arrivee_le as string) ?? null,
      transitaire: tr && tr.nom ? { nom: String(tr.nom), telephone: String(tr.telephone ?? '') } : null,
      etapes: etapes.map((e) => ({
        statut: statutValide(e.statut),
        lieu: String(e.lieu ?? ''),
        note: String(e.note ?? ''),
        survenuLe: String(e.survenu_le ?? e.date ?? ''),
        estime: e.estime === true,
      })),
    },
  };
}
