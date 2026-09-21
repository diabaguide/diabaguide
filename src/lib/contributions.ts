import { supabase } from './supabase';
import type { Cat, City, Decision, Proposal, Status } from '../data';

/* ------------------------------------------------------------------ */
/* Dates affichées (chaînes en français, comme les données d'origine)  */
/* ------------------------------------------------------------------ */
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
export const frDate = (prefix: string, dt = new Date()) => `${prefix} le ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
const frDateFull = (dt = new Date()) => `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
const frDateTime = (dt = new Date()) =>
  `${frDateFull(dt)}, ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

/* ------------------------------------------------------------------ */
/* Mapping ligne Supabase (snake_case) <-> Proposal (camelCase)        */
/* ------------------------------------------------------------------ */
interface ProposalRow {
  id: string; name: string; cn: string; cat: Cat; city: City; loc: string;
  products: string; product_tags: string[] | null; moq: string; tel: string; wechat: string; addr_cn: string;
  photos: number; card_front: boolean; card_back: boolean;
  photo_paths: string[] | null; card_front_path: string | null; card_back_path: string | null;
  status: Status; date: string; feedback: string | null; author: string;
}

function rowToProposal(r: ProposalRow): Proposal {
  return {
    id: r.id, name: r.name, cn: r.cn, cat: r.cat, city: r.city, loc: r.loc,
    products: r.products, productTags: r.product_tags ?? [], moq: r.moq, tel: r.tel, wechat: r.wechat, addrCn: r.addr_cn,
    photos: r.photos, cardFront: r.card_front, cardBack: r.card_back,
    photoPaths: r.photo_paths ?? [], cardFrontPath: r.card_front_path ?? undefined, cardBackPath: r.card_back_path ?? undefined,
    status: r.status, date: r.date, feedback: r.feedback ?? undefined, author: r.author,
  };
}

/** Ligne à écrire. On omet volontairement `user_id` : la valeur par défaut
 *  (auth.uid()) le renseigne à l'insertion et il reste inchangé en update. */
function proposalToRow(p: Proposal) {
  return {
    id: p.id, name: p.name, cn: p.cn, cat: p.cat, city: p.city, loc: p.loc,
    products: p.products, product_tags: p.productTags ?? [], moq: p.moq, tel: p.tel, wechat: p.wechat, addr_cn: p.addrCn,
    photos: p.photos, card_front: p.cardFront, card_back: p.cardBack,
    photo_paths: p.photoPaths ?? [], card_front_path: p.cardFrontPath ?? null, card_back_path: p.cardBackPath ?? null,
    status: p.status, date: p.date, feedback: p.feedback ?? null, author: p.author,
  };
}

const newId = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'p' + Date.now());

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */
function validateProposal(p: Proposal): string | null {
  if (p.name.length > 100) return "Le nom ne doit pas dépasser 100 caractères.";
  if (p.cn.length > 100) return "Le nom chinois ne doit pas dépasser 100 caractères.";
  if ((p.tel || '').length > 50) return "Le numéro de téléphone ne doit pas dépasser 50 caractères.";
  if ((p.wechat || '').length > 50) return "L'identifiant WeChat ne doit pas dépasser 50 caractères.";
  if (p.loc.length > 1000) return "L'emplacement ne doit pas dépasser 1000 caractères.";
  if (p.products.length > 1000) return "La description des produits ne doit pas dépasser 1000 caractères.";
  if (p.moq.length > 1000) return "Le minimum de commande ne doit pas dépasser 1000 caractères.";
  if (p.addrCn.length > 1000) return "L'adresse complète en chinois ne doit pas dépasser 1000 caractères.";
  return null;
}

/* ------------------------------------------------------------------ */
/* Lectures                                                            */
/* ------------------------------------------------------------------ */
/** Propositions du voyageur connecté (RLS : ses propres lignes). */
export async function fetchMyProposals(): Promise<Proposal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('proposals').select('*').order('created_at', { ascending: false });
  if (error) { warn('chargement des propositions', error); return []; }
  return (data as ProposalRow[]).map(rowToProposal);
}

/** Toutes les propositions soumises (RLS : réservé à l'équipe). */
export async function fetchAllProposals(): Promise<Proposal[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('proposals').select('*').neq('status', 'Brouillon').order('created_at', { ascending: false });
  if (error) { warn('chargement de la file équipe', error); return []; }
  return (data as ProposalRow[]).map(rowToProposal);
}

export async function fetchDecisions(): Promise<Decision[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('decisions').select('*').order('created_at', { ascending: false });
  if (error) { warn('chargement des décisions', error); return []; }
  return (data as { date: string; proposal_name: string; cn: string; decision: Status; note: string; by: string; last_check: string }[])
    .map((r) => ({ date: r.date, proposalName: r.proposal_name, cn: r.cn, decision: r.decision, note: r.note, by: r.by, lastCheck: r.last_check }));
}

/* ------------------------------------------------------------------ */
/* Écritures                                                           */
/* ------------------------------------------------------------------ */
/** Enregistre (crée ou met à jour) une proposition avec un statut donné. */
export async function saveProposal(p: Proposal, status: Status, datePrefix: string, author?: string): Promise<{ data?: Proposal, error?: string }> {
  const vErr = validateProposal(p);
  if (vErr) return { error: vErr };

  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const row = proposalToRow({
    ...p,
    id: p.id && p.id !== 'draft' ? p.id : newId(),
    status,
    date: frDate(datePrefix),
    author: author ?? p.author,
  });
  const { data, error } = await supabase.from('proposals').upsert(row).select().single();
  if (error) { warn('enregistrement de la proposition', error); return { error: error.message }; }
  return { data: rowToProposal(data as ProposalRow) };
}

/** Corrections faites par l'équipe : met à jour les champs sans toucher au statut ni à l'auteur. */
export async function updateProposalFields(p: Proposal): Promise<{ error?: string }> {
  const vErr = validateProposal(p);
  if (vErr) return { error: vErr };
  if (!supabase) return { error: 'Supabase n\'est pas configuré.' };
  const { id: _id, status: _s, date: _d, feedback: _f, author: _a, ...fields } = proposalToRow(p);
  const { error } = await supabase.from('proposals').update(fields).eq('id', p.id);
  if (error) { warn('enregistrement des modifications', error); return { error: error.message }; }
  return {};
}

/** Complément envoyé par l'auteur : passe la proposition en vérification. */
export async function complementProposal(id: string, patch: Partial<Proposal>): Promise<void> {
  if (!supabase) return;
  const row: Record<string, unknown> = { status: 'En vérification' as Status, date: frDate('Complément envoyé') };
  if (patch.tel !== undefined) row.tel = patch.tel;
  if (patch.photos !== undefined) row.photos = patch.photos;
  if (patch.photoPaths !== undefined) row.photo_paths = patch.photoPaths;
  const { error } = await supabase.from('proposals').update(row).eq('id', id);
  if (error) warn('envoi du complément', error);
}

/** Décision de l'équipe : met à jour la proposition et journalise la décision. */
export async function decideProposal(target: Proposal, status: Status, note: string, by: string): Promise<void> {
  if (!supabase) return;
  const { error: e1 } = await supabase.from('proposals')
    .update({ status, feedback: note || target.feedback || null, date: frDate('Traitée') })
    .eq('id', target.id);
  if (e1) warn('mise à jour de la proposition', e1);
  const { error: e2 } = await supabase.from('decisions').insert({
    date: frDateTime(), proposal_name: target.name, cn: target.cn, decision: status,
    note: note || '—', by, last_check: status === 'Publiée' ? frDateFull() : '—',
  });
  if (e2) warn('journalisation de la décision', e2);
}

function warn(what: string, e: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(`[Diaba Guide] Échec : ${what}.`, e);
  }
}

/** Journalise un événement sur une fiche (demande, refus ou validation de suppression). */
export async function logProviderEvent(name: string, cn: string, decision: Status, note: string, by: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from('decisions').insert({
    date: frDateTime(), proposal_name: name, cn, decision, note: note || '—', by, last_check: '—',
  });
  if (error) warn('journalisation de l’événement', error);
}
