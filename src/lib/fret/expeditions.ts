/* Expéditions (lots) : lecture, écriture, articles détaillés, photo, étapes. */
import { supabase } from '../supabase';
import type { ExpeditionImportRow } from '../expeditionImport';
import type { EtapeType, Expedition, ExpeditionArticle, ExpeditionStatut, ExpeditionTotaux, FretMode, SuiviPublic } from './model';
import { humanize, num, str, toExpedition, warn, type Row } from './internal';


export async function fetchExpeditions(): Promise<Expedition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('expeditions')
    .select('code, mode, warehouse_id, destination, container_no, bl_no, awb_no, seuil_kg, seuil_m3, arrivee_prevue, note_interne, photo, statut, created_at, shipsgo_id, shipsgo_type, shipsgo_status, shipsgo_tracking_state, shipsgo_synced_at')
    .order('created_at', { ascending: false });
  if (error) { warn('chargement des expéditions', error); return []; }
  return (data as Row[]).map(toExpedition);
}

/** Suivi public : la RPC ne renvoie ni identité, ni téléphone, ni contenu de colis. */
export async function fetchSuiviPublic(code: string): Promise<SuiviPublic | null> {
  if (!supabase || !code.trim()) return null;
  const { data, error } = await supabase.rpc('suivi_expedition_public', { p_code: code.trim() });
  if (error) { warn('chargement du suivi public', error); return null; }
  if (!data) return null;
  const r = data as Row;
  return {
    code: String(r.code), mode: r.mode as FretMode, destination: String(r.destination ?? ''), statut: r.statut as ExpeditionStatut,
    arriveePrevue: str(r.arrivee_prevue), clotureeLe: str(r.cloturee_le), partieLe: str(r.partie_le), arriveeLe: str(r.arrivee_le),
    etapes: Array.isArray(r.etapes) ? (r.etapes as Row[]).map((e) => ({ type: e.type as EtapeType, au: String(e.au) })) : [],
  };
}

export async function fetchExpeditionTotaux(): Promise<Record<string, ExpeditionTotaux>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('v_expedition_totaux')
    .select('code, mode, statut, seuil_kg, seuil_m3, nb_colis, total_kg, total_m3, pct_kg, pct_m3');
  if (error) { warn('chargement des totaux', error); return {}; }
  const out: Record<string, ExpeditionTotaux> = {};
  for (const r of (data as Row[])) {
    out[String(r.code)] = {
      code: String(r.code), mode: r.mode as FretMode, statut: r.statut as ExpeditionStatut, seuilKg: num(r.seuil_kg), seuilM3: num(r.seuil_m3),
      nbColis: Number(r.nb_colis ?? 0), totalKg: Number(r.total_kg ?? 0), totalM3: Number(r.total_m3 ?? 0),
      pctKg: num(r.pct_kg), pctM3: num(r.pct_m3),
    };
  }
  return out;
}

export async function fetchExpeditionArticles(code: string): Promise<ExpeditionArticle[]> {
  if (!supabase || !code) return [];
  const { data, error } = await supabase.from('expedition_articles')
    .select('id, expedition_code, nom, quantite, poids_kg, created_at')
    .eq('expedition_code', code).order('created_at');
  if (error) { warn('chargement des articles du lot', error); return []; }
  return ((data ?? []) as Row[]).map((r) => ({
    id: String(r.id), expeditionCode: String(r.expedition_code), nom: String(r.nom),
    quantite: Number(r.quantite ?? 0), poidsKg: num(r.poids_kg), createdAt: String(r.created_at),
  }));
}

export async function fetchExpeditionArticleCounts(): Promise<Record<string, number>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('expedition_articles').select('expedition_code');
  if (error) { warn('chargement des compteurs d’articles', error); return {}; }
  return ((data ?? []) as Row[]).reduce<Record<string, number>>((counts, row) => {
    const code = String(row.expedition_code);
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
}

export async function updateExpeditionPhoto(code: string, photo: string | null): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.rpc('admin_maj_expedition_photo', { p_code: code, p_photo: photo });
  return { error: error ? humanize(error.message) : undefined };
}

export async function createExpeditionArticle(input: {
  expeditionCode: string; nom: string; quantite: number; poidsKg?: number | null;
}): Promise<{ id?: string; error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { data, error } = await supabase.rpc('admin_ajouter_article', {
    p_expedition_code: input.expeditionCode, p_nom: input.nom.trim(), p_quantite: input.quantite, p_poids_kg: input.poidsKg ?? null,
  });
  return { id: data ? String(data) : undefined, error: error ? humanize(error.message) : undefined };
}

export async function updateExpeditionArticle(input: {
  id: string; nom: string; quantite: number; poidsKg?: number | null;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.rpc('admin_modifier_article', {
    p_id: input.id, p_nom: input.nom.trim(), p_quantite: input.quantite, p_poids_kg: input.poidsKg ?? null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

export async function deleteExpeditionArticle(id: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.rpc('admin_supprimer_article', { p_id: id });
  return { error: error ? humanize(error.message) : undefined };
}

export async function createExpedition(e: {
  code: string; mode: FretMode; warehouseId?: string | null; destination?: string;
  seuilKg?: number | null; seuilM3?: number | null; arriveePrevue?: string | null; noteInterne?: string | null;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('expeditions').insert({
    code: e.code.trim(), mode: e.mode, warehouse_id: e.warehouseId ?? null,
    destination: e.destination?.trim() || 'Dakar', seuil_kg: e.seuilKg ?? null, seuil_m3: e.seuilM3 ?? null, arrivee_prevue: e.arriveePrevue || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}

export async function importExpeditions(rows: ExpeditionImportRow[]): Promise<{ imported: number; skipped: number; error?: string }> {
  if (!supabase) return { imported: 0, skipped: 0, error: 'Supabase non configuré.' };
  const payload: Array<Omit<ExpeditionImportRow, 'line'>> = rows.map(({ line: _line, ...row }) => row);
  const { data, error } = await supabase.rpc('importer_expeditions', { p_rows: payload });
  if (error) return { imported: 0, skipped: 0, error: humanize(error.message) };
  const result = Array.isArray(data) ? data[0] as { imported?: number; skipped?: number } | undefined : undefined;
  return { imported: Number(result?.imported ?? 0), skipped: Number(result?.skipped ?? 0) };
}

export async function updateExpedition(e: {
  code: string; mode: FretMode; warehouseId?: string | null; destination: string;
  containerNo?: string | null; blNo?: string | null; awbNo?: string | null;
  seuilKg?: number | null; seuilM3?: number | null; arriveePrevue?: string | null; noteInterne?: string | null;
}): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('expeditions').update({
    mode: e.mode, warehouse_id: e.warehouseId ?? null, destination: e.destination.trim() || 'Dakar',
    container_no: e.containerNo?.trim() || null, bl_no: e.blNo?.trim() || null, awb_no: e.awbNo?.trim() || null,
    seuil_kg: e.seuilKg ?? null, seuil_m3: e.seuilM3 ?? null, arrivee_prevue: e.arriveePrevue || null, note_interne: e.noteInterne?.trim() || null, updated_at: new Date().toISOString(),
  }).eq('code', e.code);
  return { error: error ? humanize(error.message) : undefined };
}

export async function deleteExpedition(code: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase non configuré.' };
  const { error } = await supabase.from('expeditions').delete().eq('code', code);
  return { error: error ? humanize(error.message) : undefined };
}

/** Étapes d'une expédition, de la plus ancienne à la plus récente. */
export interface EtapeExpedition { id: string; type: EtapeType; au: string; visibleClient: boolean; noteInterne: string | null; par: string | null; source: 'equipe' | 'shipsgo' }
export async function fetchEtapesExpedition(expeditionCode: string): Promise<EtapeExpedition[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('expedition_etapes')
    .select('id, type, au, visible_client, note_interne, par, source').eq('expedition_code', expeditionCode).order('au', { ascending: true });
  if (error) { warn('chargement des étapes de l’expédition', error); return []; }
  return (data as Row[]).map((r) => ({
    id: String(r.id), type: r.type as EtapeType, au: String(r.au),
    visibleClient: Boolean(r.visible_client), noteInterne: str(r.note_interne), par: str(r.par),
    source: r.source === 'shipsgo' ? 'shipsgo' : 'equipe',
  }));
}

/**
 * Ajoute une étape à une expédition : tous ses colis avancent avec elle
 * (supabase/330_expedition_etapes.sql). Visibilité voyageur : défaut selon l'étape.
 */
export async function addEtapesExpeditions(codes: string[], type: EtapeType): Promise<{ count: number; error?: string }> {
  if (!supabase) return { count: 0 };
  const { data, error } = await supabase.rpc('ajouter_etapes_expeditions', { p_codes: codes, p_type: type });
  return { count: Number(data ?? 0), error: error ? humanize(error.message) : undefined };
}

export async function addEtapeExpedition(expeditionCode: string, type: EtapeType, visibleClient?: boolean, note?: string): Promise<{ error?: string }> {
  if (!supabase) return {};
  const { error } = await supabase.rpc('ajouter_etape_expedition', {
    p_code: expeditionCode, p_type: type, p_visible: visibleClient ?? null, p_note: note?.trim() || null,
  });
  return { error: error ? humanize(error.message) : undefined };
}
