import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../store';
import { isTeamRole } from '../../lib/auth';
import { compressImage } from '../../lib/image';
import { photoUrl, removePhoto, uploadPhoto } from '../../lib/photos';
import { Button, Field, Icon, Select, TextArea, useWide } from '../../ui';
import { AdminCard, AdminSheet } from './mobile';
import { SortTh, compare, useSort } from './tableSort';
import { EXPEDITION_IMPORT_HEADERS, parseExpeditionImport } from '../../lib/expeditionImport';
import type { ExpeditionImportRow } from '../../lib/expeditionImport';
import {
  fetchExpeditions, fetchExpeditionTotaux, fetchExpeditionArticleCounts, fetchColis, fetchWarehouses,
  createExpedition, importExpeditions, updateExpedition, updateExpeditionPhoto, deleteExpedition, createExpeditionArticle, updateExpeditionArticle, deleteExpeditionArticle, fetchExpeditionArticles, createColis, affecterColis, addEtapesExpeditions, addEtapeExpedition, fetchEtapesExpedition, creerVoyageurFret,
  suggestExpeditionCode, suggestColisCode,
  fetchFactures, emettreFacture, marquerFacturePayee, rechercherClients, creerSuiviShipsGo, synchroniserShipsGo,
  MODE_LABEL, MODE_UNITE, EXPEDITION_STATUT_LABEL, COLIS_STATUT_LABEL, ETAPE_LABEL, FACTURE_STATUT_LABEL, caracLabel,
  type Expedition, type ExpeditionTotaux, type ExpeditionArticle, type EtapeExpedition, type Colis, type FretMode, type ExpeditionStatut, type Warehouse, type EtapeType, type Facture, type ClientLite,
} from '../../lib/fret';

const shipsGoErrorMessage = (status?: number, error?: string) => {
  if (status === 401) return 'Session expirée. Reconnectez-vous.';
  if (status === 403) return 'Action réservée à l’équipe.';
  if (status === 404) return 'Expédition introuvable.';
  if (status === 409) return error?.toLocaleLowerCase().includes('en cours')
    ? 'Le suivi ShipsGo est déjà activé ou en cours.'
    : 'Vérifiez les références de transport ou réessayez plus tard.';
  if (status === 400 || status === 422) return 'Vérifiez le numéro de conteneur ou d’AWB dans la fiche du lot.';
  return 'Le service de suivi est temporairement indisponible.';
};
const money = (n: number, d = 'FCFA') => `${n.toLocaleString('fr-FR')} ${d === 'XOF' ? 'FCFA' : d}`;

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as FretMode[]).map((v) => ({ v, l: MODE_LABEL[v] }));
const TYPES = [
  { v: 'general', l: 'Marchandise générale' }, { v: 'textile', l: 'Textile et confection' },
  { v: 'electronique', l: 'Électronique et téléphones' }, { v: 'batterie', l: 'Batteries et produits à risque' },
  { v: 'cosmetique', l: 'Cosmétiques' }, { v: 'liquide', l: 'Liquides' }, { v: 'alimentaire', l: 'Produits alimentaires' },
];
/** Les écrans servent dans deux espaces : la console équipe (/equipe) et
    l'espace fret (/fret). Les liens restent dans l'espace d'origine. */
const useBase = () => (useLocation().pathname.startsWith('/fret') ? '/fret' : '/equipe');

const toNum = (s: string): number | null => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n; };
const dateLocale = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const estEnRetard = (e: Expedition) => Boolean(e.arriveePrevue && e.arriveePrevue < dateLocale(new Date()) && !['livree', 'cloturee', 'annulee'].includes(e.statut));
const IMPORT_TEMPLATE = `${EXPEDITION_IMPORT_HEADERS.join(';')}\nLOT-2026-001;maritime_groupage;en_transit;Dakar;2026-12-15;MSCU1234567;BL-001;`;

/* ============================================================
   Liste des expéditions : uniquement la liste. Un clic ouvre l'expédition
   (ses colis, ses étapes) ; le bouton flottant « + » en crée une.
   ============================================================ */
export function ExpeditionsList() {
  const { tr } = useI18n();
  const base = useBase();
  const nav = useNavigate();
  const wide = useWide();
  const [exps, setExps] = useState<Expedition[]>([]);
  const [totaux, setTotaux] = useState<Record<string, ExpeditionTotaux>>({});
  const [articleCounts, setArticleCounts] = useState<Record<string, number>>({});
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState<ExpeditionStatut | ''>('');
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [bulkEtape, setBulkEtape] = useState<EtapeType | ''>('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const importPreview = parseExpeditionImport(importText);

  const reload = useCallback(async () => {
    const [e, t, a, w] = await Promise.all([fetchExpeditions(), fetchExpeditionTotaux(), fetchExpeditionArticleCounts(), fetchWarehouses()]);
    setExps(e); setTotaux(t); setArticleCounts(a); setWarehouses(w); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const [showNew, setShowNew] = useState(false);
  const [ne, setNe] = useState({ code: suggestExpeditionCode(), mode: 'maritime_groupage' as FretMode, warehouseId: '', seuilKg: '', seuilM3: '', arriveePrevue: '' });
  const [neErr, setNeErr] = useState<string | null>(null);
  const creerExp = async (ev: FormEvent) => {
    ev.preventDefault(); setNeErr(null); setOk(null);
    if (!ne.code.trim()) { setNeErr('Donnez un code à l’expédition.'); return; }
    setBusy(true);
    const res = await createExpedition({
      code: ne.code, mode: ne.mode, warehouseId: ne.warehouseId || null,
      seuilKg: toNum(ne.seuilKg), seuilM3: toNum(ne.seuilM3), arriveePrevue: ne.arriveePrevue || null,
    });
    setBusy(false);
    if (res.error) { setNeErr(res.error); return; }
    setOk(`Expédition ${ne.code} créée.`);
    setNe({ code: suggestExpeditionCode(), mode: 'maritime_groupage', warehouseId: '', seuilKg: '', seuilM3: '', arriveePrevue: '' });
    setShowNew(false);
    await reload();
  };

  const { sort, toggle } = useSort<'code' | 'statut'>({ k: 'code', dir: -1 });
  const needle = search.trim().toLocaleLowerCase('fr');
  const shown = [...exps]
    .filter((e) => {
      const haystack = [e.code, e.destination, MODE_LABEL[e.mode], EXPEDITION_STATUT_LABEL[e.statut]].join(' ').toLocaleLowerCase('fr');
      return (!needle || haystack.includes(needle)) && (!statutFilter || e.statut === statutFilter);
    })
    .sort((a, b) => compare(sort.k === 'statut' ? a.statut : a.code, sort.k === 'statut' ? b.statut : b.code, sort.dir));
  const ouvrir = (code: string) => nav(`${base}/expeditions/${encodeURIComponent(code)}`);
  const toggleSelection = (code: string) => setSelectedCodes((current) => current.includes(code) ? current.filter((v) => v !== code) : [...current, code]);
  const toggleAllShown = () => {
    const visibleCodes = shown.map((e) => e.code);
    setSelectedCodes((current) => visibleCodes.every((code) => current.includes(code)) ? current.filter((code) => !visibleCodes.includes(code)) : [...new Set([...current, ...visibleCodes])]);
  };
  const appliquerEtapeEnMasse = async () => {
    if (!bulkEtape || selectedCodes.length === 0) return;
    setBulkBusy(true); setErr(null); setOk(null);
    const res = await addEtapesExpeditions(selectedCodes, bulkEtape);
    setBulkBusy(false);
    if (res.error) { setErr(res.error); return; }
    setSelectedCodes([]); setBulkEtape('');
    setOk(res.count === selectedCodes.length ? `${res.count} expédition(s) mise(s) à jour.` : `${res.count} expédition(s) mise(s) à jour ; les autres étaient déjà à cette étape ou plus avancées.`);
    await reload();
  };
  const lireImport = async (ev: ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setImportErr(null);
    if (file.size > 2_000_000) {
      setImportText('');
      setImportErr('Le fichier dépasse la limite de 2 Mo.');
      ev.target.value = '';
      return;
    }
    setImportText(await file.text());
  };
  const telechargerModele = () => {
    const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'modele-import-expeditions.csv'; link.click();
    URL.revokeObjectURL(url);
  };
  const lancerImport = async () => {
    setImportErr(null); setOk(null);
    if (importPreview.errors.length > 0 || importPreview.rows.length === 0) {
      setImportErr('Corrigez le fichier avant de lancer l’import.');
      return;
    }
    setImportBusy(true);
    const result = await importExpeditions(importPreview.rows);
    setImportBusy(false);
    if (result.error) { setImportErr(result.error); return; }
    setOk(`${result.imported} expédition(s) importée(s) ; ${result.skipped} déjà existante(s) ignorée(s).`);
    setImportText(''); setShowImport(false);
    await reload();
  };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Expéditions")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr("Ouvrez une expédition pour voir ses colis et suivre ses étapes.")}</div>
        </div>
        <Button kind="s" full={false} icon="inbox" onClick={() => { setImportErr(null); setShowImport(true); }}>{tr("Importer des lots en cours")}</Button>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        <section className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Expéditions")} ({shown.length}/{exps.length})</h2>
            <span className="small muted">{tr("Résultats filtrés")}</span>
          </div>
          <div className="filters">
            <div className="grow"><Field id="exp-search" label={tr("Rechercher un lot")} value={search} onChange={setSearch} placeholder={tr("Code, destination ou statut")} /></div>
            <div className="grow"><Select id="exp-status-filter" label={tr("Filtrer par statut")} value={statutFilter} onChange={(v) => setStatutFilter(v as ExpeditionStatut | '')}
              options={[{ v: '', l: 'Tous les statuts' }, ...(Object.keys(EXPEDITION_STATUT_LABEL) as ExpeditionStatut[]).map((v) => ({ v, l: EXPEDITION_STATUT_LABEL[v] }))]} /></div>
          </div>
          {wide && <div className="card stack" style={{ gap: 10, background: 'var(--info-bg)' }}>
            <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <strong>{tr("Mise à jour en lot")}</strong>
              <span className="small muted">{selectedCodes.length} {tr("expédition(s) sélectionnée(s)")}</span>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="grow"><Select id="bulk-etape" label={tr("Nouvelle étape")} value={bulkEtape} onChange={(v) => setBulkEtape(v as EtapeType | '')}
                options={[{ v: '', l: '—' }, ...ETAPES_ORDRE.map((v) => ({ v, l: ETAPE_LABEL[v] }))]} /></div>
              <Button icon="check" full={false} disabled={bulkBusy || selectedCodes.length === 0 || !bulkEtape} onClick={() => void appliquerEtapeEnMasse()}>{tr(bulkBusy ? "Mise à jour…" : "Appliquer")}</Button>
              {selectedCodes.length > 0 && <Button kind="s" full={false} disabled={bulkBusy} onClick={() => setSelectedCodes([])}>{tr("Désélectionner")}</Button>}
            </div>
          </div>}
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : exps.length === 0 ? <p className="muted">{tr("Aucune expédition. Utilisez le bouton + pour en créer une.")}</p>
            : shown.length === 0 ? <p className="muted">{tr("Aucune expédition ne correspond aux filtres.")}</p>
            : wide ? (
            <div className="table dense"><table>
              <thead><tr>
                <th><input type="checkbox" aria-label={tr("Sélectionner les expéditions visibles")} checked={shown.length > 0 && shown.every((e) => selectedCodes.includes(e.code))} onChange={toggleAllShown} /></th>
                <SortTh k="code" label="Code" sort={sort} onSort={toggle} />
                <th>{tr("Mode")}</th><SortTh k="statut" label="Statut" sort={sort} onSort={toggle} />
                <th>{tr("Colis")}</th><th>{tr("Articles détaillés")}</th><th>{tr("Remplissage")}</th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const t = totaux[e.code];
                  return (
                    <tr key={e.code} className="clickable" tabIndex={0} style={{ cursor: 'pointer' }}
                      onClick={() => ouvrir(e.code)}
                      onKeyDown={(k) => { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); ouvrir(e.code); } }}>
                      <td onClick={(k) => k.stopPropagation()}><input type="checkbox" aria-label={`${tr("Sélectionner")} ${e.code}`} checked={selectedCodes.includes(e.code)} onChange={() => toggleSelection(e.code)} /></td>
                      <td><strong>{e.code}</strong><div className="small muted">{e.destination}</div>{e.arriveePrevue && <div className="small muted">{tr("Arrivée prévue")} : {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${e.arriveePrevue}T00:00:00`))}</div>}{estEnRetard(e) && <div className="small" style={{ color: '#a34a00', fontWeight: 700 }}><Icon name="alert" size={13} /> {tr("Arrivée en retard")}</div>}</td>
                      <td>{tr(MODE_LABEL[e.mode])}</td>
                      <td><span className="small">{tr(EXPEDITION_STATUT_LABEL[e.statut])}</span></td>
                      <td>{t?.nbColis ?? 0}</td>
                      <td>{articleCounts[e.code] ?? 0}</td>
                      <td><Remplissage exp={e} tot={t} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : (
            <div className="acards">
              {shown.map((e) => (
                <AdminCard key={e.code} toneSeed={e.code} title={e.code}
                  sub={`${tr(MODE_LABEL[e.mode])} · ${totaux[e.code]?.nbColis ?? 0} ${tr("colis")} · ${articleCounts[e.code] ?? 0} ${tr("articles détaillés")}${estEnRetard(e) ? ` · ${tr("En retard")}` : ''}`}
                  badge={<span className="small">{tr(EXPEDITION_STATUT_LABEL[e.statut])}</span>}
                  onOpen={() => ouvrir(e.code)} />
              ))}
            </div>
          )}
        </section>
      </div>

      <button type="button" className="fab" aria-label={tr("Nouvelle expédition")} onClick={() => { setNeErr(null); setShowNew(true); }}>
        <Icon name="plus" size={28} sw={2.6} />
      </button>

      {showNew && (
        <AdminSheet title={tr("Nouvelle expédition")} onClose={() => setShowNew(false)}>
          <form onSubmit={creerExp} className="stack" style={{ gap: 12 }} noValidate>
            {neErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(neErr)}</span></div>}
            <Field id="ne-code" label={tr("Code de lot")} value={ne.code} onChange={(v) => setNe({ ...ne, code: v })} req />
            <Select id="ne-mode" label={tr("Mode")} value={ne.mode} onChange={(v) => setNe({ ...ne, mode: v as FretMode })} options={MODE_OPTIONS} />
            <Select id="ne-wh" label={tr("Entrepôt (Chine)")} value={ne.warehouseId} onChange={(v) => setNe({ ...ne, warehouseId: v })}
              options={[{ v: '', l: '—' }, ...warehouses.map((w) => ({ v: w.id, l: w.nom }))]} />
            <Field id="ne-arrivee" label={tr("Arrivée prévue")} type="date" value={ne.arriveePrevue} onChange={(v) => setNe({ ...ne, arriveePrevue: v })} />
            <div className="filters">
              <div className="grow"><Field id="ne-skg" label={tr("Seuil kg")} value={ne.seuilKg} onChange={(v) => setNe({ ...ne, seuilKg: v })} placeholder={tr("facultatif")} /></div>
              <div className="grow"><Field id="ne-sm3" label={tr("Seuil m³")} value={ne.seuilM3} onChange={(v) => setNe({ ...ne, seuilM3: v })} placeholder={tr("facultatif")} /></div>
            </div>
            <Button type="submit" icon="ship" disabled={busy}>{tr(busy ? 'Création…' : 'Créer l’expédition')}</Button>
          </form>
        </AdminSheet>
      )}
      {showImport && (
        <AdminSheet title={tr("Importer des lots en cours")} onClose={() => setShowImport(false)}>
          <div className="stack" style={{ gap: 12 }}>
            <p className="small muted" style={{ margin: 0 }}>{tr("Chargez un fichier CSV, TSV ou collez son contenu. Les codes déjà présents seront ignorés sans modifier les lots existants.")}</p>
            <Button kind="s" full={false} icon="download" onClick={telechargerModele}>{tr("Télécharger le modèle CSV")}</Button>
            <div className="field"><label htmlFor="expedition-import-file">{tr("Fichier CSV ou TSV")}</label><input id="expedition-import-file" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={(ev) => void lireImport(ev)} /></div>
            <TextArea id="expedition-import-text" label={tr("Contenu à importer")} value={importText} onChange={(value) => { setImportErr(null); setImportText(value); }} rows={8} placeholder={IMPORT_TEMPLATE} />
            {importErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(importErr)}</span></div>}
            {importText && importPreview.errors.length > 0 && <div role="alert" className="notice err stack" style={{ gap: 4 }}><strong>{tr("Erreurs à corriger")}</strong>{importPreview.errors.slice(0, 8).map((error, index) => <span className="small" key={`${error.line}-${index}`}>{tr("Ligne")} {error.line} : {tr(error.message)}</span>)}{importPreview.errors.length > 8 && <span className="small">+ {importPreview.errors.length - 8} {tr("autre(s) erreur(s)")}</span>}</div>}
            {importPreview.errors.length === 0 && importPreview.rows.length > 0 && <div className="stack" style={{ gap: 8 }}><strong>{importPreview.rows.length} {tr("expédition(s) prête(s) à importer")}</strong><div className="table dense"><table><thead><tr><th>{tr("Code")}</th><th>{tr("Mode")}</th><th>{tr("Étape")}</th><th>{tr("Destination")}</th></tr></thead><tbody>{importPreview.rows.slice(0, 10).map((row) => <tr key={`${row.line}-${row.code}`}><td><strong>{row.code}</strong></td><td>{tr(MODE_LABEL[row.mode])}</td><td>{row.etape ? tr(ETAPE_LABEL[row.etape]) : '—'}</td><td>{row.destination}</td></tr>)}</tbody></table></div>{importPreview.rows.length > 10 && <span className="small muted">+ {importPreview.rows.length - 10} {tr("autre(s) expédition(s)")}</span>}</div>}
            <Button icon="inbox" disabled={importBusy || importPreview.rows.length === 0 || importPreview.errors.length > 0} onClick={() => void lancerImport()}>{tr(importBusy ? 'Import…' : 'Importer les expéditions')}</Button>
          </div>
        </AdminSheet>
      )}
    </>
  );
}

/** Barre de remplissage : total atteint face au seuil, sur l'unité du mode. */
function Remplissage({ exp, tot }: { exp: Expedition; tot?: ExpeditionTotaux }) {
  const { tr } = useI18n();
  if (!tot) return <span className="np">—</span>;
  const unite = MODE_UNITE[exp.mode];
  const total = unite === 'm3' ? tot.totalM3 : tot.totalKg;
  const seuil = unite === 'm3' ? exp.seuilM3 : exp.seuilKg;
  const u = unite === 'm3' ? 'm³' : 'kg';
  if (!seuil) return <span className="small">{total.toLocaleString('fr-FR')} {u}</span>;
  const pct = Math.min(100, Math.round((total / seuil) * 100));
  const plein = pct >= 100;
  return (
    <div className="stack" style={{ gap: 4, minWidth: 140 }}>
      <div className="small" style={{ fontWeight: 600 }}>{total.toLocaleString('fr-FR')} / {seuil.toLocaleString('fr-FR')} {u} · {pct}%</div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--chip-border, #e3e3e3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: plein ? '#1F7A4A' : '#1F4A7A' }} />
      </div>
      {plein && <span className="small" style={{ color: '#1F7A4A', fontWeight: 600 }}><Icon name="check" size={13} sw={2.4} /> {tr("Prêt à charger")}</span>}
    </div>
  );
}

/* ============================================================
   Détail d'une expédition : remplissage, étapes (de l'expédition), colis
   ============================================================ */
const ETAPES_ORDRE: EtapeType[] = ['regroupe', 'depart', 'en_transit', 'arrive_dakar', 'chez_diaba', 'dispo_retrait', 'en_livraison', 'remis'];

export function ExpeditionDetail() {
  const { tr, t } = useI18n();
  const base = useBase();
  const nav = useNavigate();
  const userRole = useStore().s.user?.role;
  const peutFacturer = userRole !== 'livreur';
  const peutGererShipsGo = isTeamRole(userRole);
  const { code = '' } = useParams();
  const [exp, setExp] = useState<Expedition | null>(null);
  const [tot, setTot] = useState<ExpeditionTotaux | undefined>();
  const [colis, setColis] = useState<Colis[]>([]);
  const [libres, setLibres] = useState<Colis[]>([]);
  const [etapes, setEtapes] = useState<EtapeExpedition[]>([]);
  const [articles, setArticles] = useState<ExpeditionArticle[]>([]);
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setPhotoSrc(null);
    if (exp?.photo) void photoUrl(exp.photo, 3600, 'fret-photos').then((url) => { if (active) setPhotoSrc(url); });
    return () => { active = false; };
  }, [exp?.photo]);
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shipsGoBusy, setShipsGoBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    mode: 'maritime_groupage' as FretMode, warehouseId: '', destination: '', containerNo: '', blNo: '', awbNo: '', seuilKg: '', seuilM3: '', arriveePrevue: '', noteInterne: '',
  });

  const reload = useCallback(async () => {
    const [exps, totaux, cs, l, f, et, ar] = await Promise.all([
      fetchExpeditions(), fetchExpeditionTotaux(), fetchColis(code), fetchColis(), fetchFactures(), fetchEtapesExpedition(code), fetchExpeditionArticles(code),
    ]);
    setExp(exps.find((e) => e.code === code) ?? null);
    setTot(totaux[code]); setColis(cs); setLibres(l); setFactures(f); setEtapes(et); setArticles(ar); setLoading(false);
  }, [code]);
  useEffect(() => { void reload(); }, [reload]);

  const handleTrackShipsGo = async () => {
    if (!exp || !window.confirm(t('La création du suivi ShipsGo peut consommer un crédit. Continuer ?'))) return;
    setErr(null); setOk(null); setShipsGoBusy(true);
    try {
      const result = await creerSuiviShipsGo(exp.code);
      if (result.error || !result.ok) { setErr(shipsGoErrorMessage(result.httpStatus, result.error)); return; }
      setOk(result.reused ? t('Le suivi ShipsGo existant a été réutilisé.') : tr('Le suivi ShipsGo est activé.'));
      await reload();
    } finally { setShipsGoBusy(false); }
  };
  const handleSyncShipsGo = async () => {
    if (!exp) return;
    setErr(null); setOk(null); setShipsGoBusy(true);
    try {
      const result = await synchroniserShipsGo(exp.code);
      if (result.error || !result.ok) { setErr(shipsGoErrorMessage(result.httpStatus, result.error)); return; }
      setOk(t('Synchronisation ShipsGo terminée : {0} nouvelle(s) étape(s) ajoutée(s).', { 0: String(result.eventsAdded ?? 0) }));
      await reload();
    } finally { setShipsGoBusy(false); }
  };

  const facturer = async (colisCode: string) => {
    setErr(null); setOk(null);
    const res = await emettreFacture(colisCode);
    if (res.error) { setErr(res.error); return; }
    setOk(`Facture émise pour ${colisCode}.`); await reload();
  };
  const payer = async (colisCode: string) => {
    setErr(null); setOk(null);
    const res = await marquerFacturePayee(colisCode);
    if (res.error) { setErr(res.error); return; }
    setOk(`Facture de ${colisCode} marquée payée.`); await reload();
  };
  const partagerSuivi = async () => {
    const url = `${window.location.origin}/suivi/${encodeURIComponent(code)}`;
    setErr(null); setOk(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Suivi ${code}`, url });
        setOk('Lien de suivi partagé.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setOk('Lien de suivi copié.');
      } else {
        throw new Error('Partage non disponible sur cet appareil.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setErr(error instanceof Error ? error.message : 'Partage non disponible sur cet appareil.');
    }
  };
  const ouvrirEdition = () => {
    if (!exp) return;
    setEditErr(null);
    setEditForm({
      mode: exp.mode, warehouseId: exp.warehouseId ?? '', destination: exp.destination, containerNo: exp.containerNo ?? '',
      blNo: exp.blNo ?? '', awbNo: exp.awbNo ?? '', seuilKg: exp.seuilKg == null ? '' : String(exp.seuilKg), seuilM3: exp.seuilM3 == null ? '' : String(exp.seuilM3), arriveePrevue: exp.arriveePrevue ?? '', noteInterne: exp.noteInterne ?? '',
    });
    setShowEdit(true);
  };
  const enregistrerEdition = async (event: FormEvent) => {
    event.preventDefault();
    if (!editForm.destination.trim()) { setEditErr('La destination est obligatoire.'); return; }
    setEditErr(null); setBusy(true);
    const res = await updateExpedition({
      code, mode: editForm.mode, warehouseId: editForm.warehouseId || null, destination: editForm.destination,
      containerNo: editForm.containerNo, blNo: editForm.blNo, awbNo: editForm.awbNo,
      seuilKg: toNum(editForm.seuilKg), seuilM3: toNum(editForm.seuilM3), arriveePrevue: editForm.arriveePrevue || null, noteInterne: editForm.noteInterne,
    });
    setBusy(false);
    if (res.error) { setEditErr(res.error); return; }
    setShowEdit(false); setOk('Lot modifié.'); await reload();
  };
  const supprimerExp = async () => {
    if (!exp) return;
    if ((tot?.nbColis ?? 0) > 0) {
      setErr('Impossible de supprimer une expédition qui contient encore des colis.');
      return;
    }
    if (!window.confirm(t('Supprimer définitivement le lot {0} ?', { 0: exp.code }))) return;
    setErr(null); setOk(null); setBusy(true);
    const res = await deleteExpedition(exp.code);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    nav(`${base}/expeditions`);
  };

  const [aff, setAff] = useState('');
  const affecter = async () => {
    if (!aff) return; setErr(null); setOk(null);
    const res = await affecterColis(aff, code);
    if (res.error) { setErr(res.error); return; }
    setOk(`Colis ${aff} rattaché.`); setAff(''); await reload();
  };

  // ---- Étapes de l'expédition ----
  const [nouvelleEtape, setNouvelleEtape] = useState<EtapeType | ''>('');
  const ajouterEtape = async () => {
    if (!nouvelleEtape) return;
    const indexNouvelle = ETAPES_ORDRE.indexOf(nouvelleEtape);
    const dernierIndex = Math.max(-1, ...etapes.map((e) => ETAPES_ORDRE.indexOf(e.type)));
    if (indexNouvelle < 0 || indexNouvelle <= dernierIndex) {
      setErr('Une étape ne peut pas faire reculer le suivi de l’expédition.');
      return;
    }
    setErr(null); setOk(null); setBusy(true);
    const res = await addEtapeExpedition(code, nouvelleEtape);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Étape « ${tr(ETAPE_LABEL[nouvelleEtape])} » ajoutée : les colis de l’expédition avancent avec elle.`);
    setNouvelleEtape(''); await reload();
  };

  const modifierPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !exp) return;
    setPhotoBusy(true); setErr(null); setOk(null);
    try {
      const image = await compressImage(file, 1600, 0.82);
      const upload = await uploadPhoto(image, 'fret-photos');
      if (upload.error || !upload.path) { setErr(upload.error ?? 'L’envoi de la photo a échoué.'); return; }
      const res = await updateExpeditionPhoto(exp.code, upload.path);
      if (res.error) { await removePhoto(upload.path, 'fret-photos'); setErr(res.error); return; }
      if (exp.photo) await removePhoto(exp.photo, 'fret-photos');
      setOk('Photo du lot mise à jour.'); await reload();
    } catch (error) { setErr((error as Error).message); }
    finally { setPhotoBusy(false); }
  };
  const supprimerPhoto = async () => {
    if (!exp?.photo || !window.confirm(t('Supprimer la photo du lot ?'))) return;
    setPhotoBusy(true); setErr(null); setOk(null);
    const res = await updateExpeditionPhoto(exp.code, null);
    if (res.error) { setErr(res.error); setPhotoBusy(false); return; }
    await removePhoto(exp.photo, 'fret-photos'); setOk('Photo du lot supprimée.'); await reload(); setPhotoBusy(false);
  };

  const [articleForm, setArticleForm] = useState({ nom: '', quantite: '1', poidsKg: '' });
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleErr, setArticleErr] = useState<string | null>(null);
  const [articleBusy, setArticleBusy] = useState(false);
  const modifierArticle = (article: ExpeditionArticle) => {
    setEditingArticleId(article.id);
    setArticleForm({ nom: article.nom, quantite: String(article.quantite), poidsKg: article.poidsKg == null ? '' : String(article.poidsKg) });
    setArticleErr(null);
  };
  const annulerModificationArticle = () => {
    setEditingArticleId(null); setArticleForm({ nom: '', quantite: '1', poidsKg: '' }); setArticleErr(null);
  };
  const ajouterArticle = async (event: FormEvent) => {
    event.preventDefault();
    if (!articleForm.nom.trim()) { setArticleErr('Le nom de l’article est obligatoire.'); return; }
    const quantite = toNum(articleForm.quantite);
    if (!quantite || quantite <= 0) { setArticleErr('La quantité doit être supérieure à zéro.'); return; }
    setArticleBusy(true); setArticleErr(null);
    const res = editingArticleId
      ? await updateExpeditionArticle({ id: editingArticleId, nom: articleForm.nom, quantite, poidsKg: toNum(articleForm.poidsKg) })
      : await createExpeditionArticle({ expeditionCode: code, nom: articleForm.nom, quantite, poidsKg: toNum(articleForm.poidsKg) });
    setArticleBusy(false);
    if (res.error) { setArticleErr(res.error); return; }
    const wasEditing = Boolean(editingArticleId);
    annulerModificationArticle();
    setOk(wasEditing ? 'Article modifié.' : 'Article ajouté.'); await reload();
  };
  const supprimerArticle = async (article: ExpeditionArticle) => {
    if (!window.confirm(t('Supprimer cet article ?'))) return;
    setErr(null); setOk(null); setArticleBusy(true);
    const res = await deleteExpeditionArticle(article.id);
    setArticleBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk('Article supprimé.'); await reload();
  };

  // ---- Nouveau colis dans cette expédition ----
  const [showColis, setShowColis] = useState(false);
  const [rc, setRc] = useState({ code: suggestColisCode(), profileId: '', clientNom: '', clientTel: '', codeClient: '', marque: '', type: 'general', poids: '', volume: '' });
  const [rcErr, setRcErr] = useState<string | null>(null);
  const [clientQ, setClientQ] = useState('');
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [clientSel, setClientSel] = useState<ClientLite | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });
  useEffect(() => {
    if (!showColis) return;
    let alive = true;
    setClientLoading(true);
    const timer = window.setTimeout(() => {
      rechercherClients(clientQ.trim()).then((list) => {
        if (alive) { setClientResults(list); setClientLoading(false); }
      });
    }, clientQ ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [clientQ, showColis]);
  const choisirClient = (c: ClientLite) => {
    setClientSel(c);
    setRc((r) => ({ ...r, profileId: c.id, clientNom: c.name ?? '', clientTel: c.phone ?? '' }));
  };
  const ajouterClient = async () => {
    setRcErr(null);
    if (!newClient.name.trim() || !newClient.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClient.email.trim())) {
      setRcErr('Saisissez le nom, le téléphone et une adresse e-mail valide.'); return;
    }
    setBusy(true);
    const res = await creerVoyageurFret(newClient);
    setBusy(false);
    if (res.error || !res.traveler) { setRcErr(res.error ?? 'Création du compte impossible.'); return; }
    setClientResults((list) => [res.traveler!, ...list.filter((c) => c.id !== res.traveler!.id)]);
    choisirClient(res.traveler);
    setClientQ(res.traveler.name ?? ''); setShowNewClient(false);
    setNewClient({ name: '', email: '', phone: '' });
  };
  const ouvrirColis = () => {
    setRcErr(null); setClientQ(''); setClientSel(null); setShowNewClient(false);
    setRc({ code: suggestColisCode(), profileId: '', clientNom: '', clientTel: '', codeClient: '', marque: '', type: 'general', poids: '', volume: '' });
    setShowColis(true);
  };
  const enregistrerColis = async (ev: FormEvent) => {
    ev.preventDefault(); setRcErr(null); setOk(null);
    if (!exp) return;
    if (!rc.code.trim()) { setRcErr('Donnez un code au colis.'); return; }
    if (!rc.profileId) { setRcErr('Choisissez un voyageur ou créez son compte avant d’enregistrer le colis.'); return; }
    setBusy(true);
    const res = await createColis({
      code: rc.code, mode: exp.mode, expeditionCode: exp.code, profileId: rc.profileId,
      clientNom: rc.clientNom, clientTel: rc.clientTel, codeClient: rc.codeClient, marqueColis: rc.marque,
      typeMarchandise: rc.type, poidsKg: toNum(rc.poids), volumeM3: toNum(rc.volume), recuMaintenant: true,
    });
    setBusy(false);
    if (res.error) { setRcErr(res.error); return; }
    setOk(`Colis ${rc.code} ajouté à l’expédition.`);
    setShowColis(false);
    await reload();
  };

  if (loading) return <div className="admin-body"><p className="muted" role="status">{tr("Chargement…")}</p></div>;
  if (!exp) return <div className="admin-body"><p className="muted">{tr("Expédition introuvable.")} <Link to={`${base}/expeditions`}>{tr("Retour à la liste")}</Link></p></div>;

  const unite = MODE_UNITE[exp.mode];
  const shipsGoModeSupported = exp.mode.startsWith('maritime') || exp.mode.startsWith('aerien');
  const shipsGoReferenceValid = exp.mode.startsWith('maritime')
    ? /^[A-Z]{4}\d{7}$/.test((exp.containerNo ?? '').replace(/\s+/g, '').toUpperCase())
    : /^\d{11}$/.test((exp.awbNo ?? '').replace(/[\s-]+/g, ''));
  const shipsGoActive = exp.shipsgoTrackingState === 'active' && exp.shipsgoId !== null && exp.shipsgoType !== null;
  const dejaFaites = new Set(etapes.map((e) => e.type));
  const dernierIndex = Math.max(-1, ...etapes.map((e) => ETAPES_ORDRE.indexOf(e.type)));
  const etapesDisponibles = ETAPES_ORDRE.filter((t, index) => index > dernierIndex && !dejaFaites.has(t));

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{exp.code}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr(MODE_LABEL[exp.mode])} · {exp.destination} · {tr(EXPEDITION_STATUT_LABEL[exp.statut])}</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button kind="s" icon="edit" full={false} onClick={ouvrirEdition}>{tr("Modifier")}</Button>
          <Button kind="d" icon="trash" full={false} disabled={busy || (tot?.nbColis ?? 0) > 0} onClick={() => void supprimerExp()}>{tr("Supprimer définitivement")}</Button>
          <Button kind="s" icon="share" full={false} onClick={() => void partagerSuivi()}>{tr("Partager")}</Button>
          <Button to={`${base}/expeditions`} kind="s" icon="chevL" full={false}>{tr("Toutes les expéditions")}</Button>
        </div>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        <section className="card stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Remplissage")}</h2>
          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <Stat label={tr("Colis")} value={String(tot?.nbColis ?? 0)} />
            <Stat label={tr("Total poids")} value={`${(tot?.totalKg ?? 0).toLocaleString('fr-FR')} kg`} />
            <Stat label={tr("Total volume")} value={`${(tot?.totalM3 ?? 0).toLocaleString('fr-FR')} m³`} />
          </div>
          <Remplissage exp={exp} tot={tot} />
          {!exp.seuilKg && !exp.seuilM3 && <p className="small muted" style={{ margin: 0 }}>{tr("Aucun seuil défini pour cette expédition. Le remplissage s’affiche sans objectif de chargement.")}</p>}
          <p className="small muted" style={{ margin: 0 }}>{tr(`Unité de facturation de ce mode : ${unite === 'm3' ? 'm³' : 'kg'}.`)}</p>
        </section>

        {peutGererShipsGo && shipsGoModeSupported && (
          <section className="card stack" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr('Suivi ShipsGo')}</h2>
            {shipsGoActive ? (
              <div className="small muted">
                <p style={{ margin: 0 }}>{tr('Le suivi ShipsGo est activé.')}{exp.shipsgoStatus ? ` · ${exp.shipsgoStatus}` : ''}</p>
                {exp.shipsgoSyncedAt
                  ? <p style={{ margin: '4px 0 0' }}>{tr('Dernière synchronisation')}: {new Date(exp.shipsgoSyncedAt).toLocaleString()}</p>
                  : <p style={{ margin: '4px 0 0' }}>{tr('Aucune synchronisation effectuée pour l’instant.')}</p>}
              </div>
            ) : exp.shipsgoTrackingState === 'creating' ? (
              <p className="small muted" style={{ margin: 0 }}>{tr('Suivi en cours d’activation…')}</p>
            ) : <p className="small muted" style={{ margin: 0 }}>{tr('Aucune synchronisation effectuée pour l’instant.')}</p>}
            {!shipsGoActive && !shipsGoReferenceValid && (
              <p className="small muted" style={{ margin: 0 }}>{tr('Un numéro valide de conteneur ou d’AWB est requis pour activer ShipsGo.')}</p>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {shipsGoActive ? (
                <Button full={false} disabled={shipsGoBusy} onClick={() => void handleSyncShipsGo()}>
                  {shipsGoBusy ? tr('Synchronisation…') : tr('Synchroniser maintenant')}
                </Button>
              ) : (
                <Button full={false} disabled={shipsGoBusy || !shipsGoReferenceValid} onClick={() => void handleTrackShipsGo()}>
                  {shipsGoBusy ? tr('Suivi en cours d’activation…') : tr(exp.shipsgoTrackingState === 'error' || exp.shipsgoTrackingState === 'creating' ? 'Réessayer l’activation' : 'Activer le suivi ShipsGo')}
                </Button>
              )}
            </div>
          </section>
        )}

        {/* ---- Étapes de l'expédition ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Étapes de l’expédition")}</h2>
          <p className="small muted" style={{ margin: 0 }}>{tr("Une étape ajoutée ici s’applique à tous les colis de l’expédition.")}</p>
          {etapes.length === 0 ? <p className="muted">{tr("Aucune étape pour l’instant.")}</p> : (
            <ol className="stack" style={{ gap: 8, margin: 0, paddingLeft: 20 }}>
              {etapes.map((e) => (
                <li key={e.id}>
                  <span style={{ fontWeight: 600 }}>{tr(ETAPE_LABEL[e.type])}</span>
                  <span className="small muted"> · {new Date(e.au).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="small muted"> · {tr(e.visibleClient ? 'Visible par le voyageur' : 'Interne')}</span>
                  {e.source === 'shipsgo' && <span className="small muted"> · {tr('Synchronisé par ShipsGo')}</span>}
                </li>
              ))}
            </ol>
          )}
          <div className="filters" style={{ alignItems: 'flex-end' }}>
            <Select id="nouvelle-etape" label={tr("Ajouter une étape")} value={nouvelleEtape} onChange={(v) => setNouvelleEtape(v as EtapeType | '')}
              options={[{ v: '', l: etapesDisponibles.length ? 'Choisir une étape…' : 'Suivi terminé' }, ...etapesDisponibles.map((t) => ({ v: t, l: ETAPE_LABEL[t] }))]} />
            <Button icon="plus" full={false} disabled={!nouvelleEtape || busy || !etapesDisponibles.includes(nouvelleEtape as EtapeType)} onClick={() => void ajouterEtape()}>{tr("Ajouter")}</Button>
          </div>
        </section>

        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Photo du lot")}</h2>
          {photoSrc && <img src={photoSrc} alt={tr("Photo du lot")} style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12 }} />}
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <label className="button secondary" style={{ cursor: photoBusy ? 'wait' : 'pointer' }}>
              {tr(exp?.photo ? "Remplacer la photo" : "Ajouter une photo")}
              <input type="file" accept="image/jpeg,image/webp,image/png" className="sr" disabled={photoBusy} onChange={modifierPhoto} />
            </label>
            {exp?.photo && <Button kind="d" icon="trash" full={false} disabled={photoBusy} onClick={() => void supprimerPhoto()}>{tr("Supprimer")}</Button>}
          </div>
          <p className="small muted" style={{ margin: 0 }}>{tr("Photo privée, visible uniquement par l’équipe fret.")}</p>
        </section>

        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Articles du lot")} ({articles.length})</h2>
          {articleErr && <div role="alert" className="notice err"><Icon name="alert" size={18} /><span>{tr(articleErr)}</span></div>}
          {articles.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{tr("Aucun article détaillé pour l’instant.")}</p> : (
            <div className="stack" style={{ gap: 8 }}>
              {articles.map((article) => (
                <div key={article.id} className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div><strong>{article.nom}</strong><div className="small muted">{article.quantite} · {article.poidsKg == null ? '—' : `${article.poidsKg} kg`}</div></div>
                  <span className="row" style={{ gap: 6 }}>
                    <Button kind="s" icon="edit" full={false} disabled={articleBusy} onClick={() => modifierArticle(article)}>{tr("Modifier")}</Button>
                    <Button kind="d" icon="trash" full={false} disabled={articleBusy} onClick={() => void supprimerArticle(article)} aria-label={t('Supprimer')}>{tr("Supprimer")}</Button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <form onSubmit={ajouterArticle} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="article-nom" label={tr("Nom de l’article")} value={articleForm.nom} onChange={(v) => setArticleForm({ ...articleForm, nom: v })} placeholder={tr("Ex. vêtements")}/></div>
            <div className="grow"><Field id="article-quantite" label={tr("Quantité")} value={articleForm.quantite} onChange={(v) => setArticleForm({ ...articleForm, quantite: v })} placeholder="1" /></div>
            <div className="grow"><Field id="article-poids" label={tr("Poids de l’article (kg)")} value={articleForm.poidsKg} onChange={(v) => setArticleForm({ ...articleForm, poidsKg: v })} placeholder={tr("facultatif")} /></div>
            <Button type="submit" icon={editingArticleId ? "check" : "plus"} full={false} disabled={articleBusy}>{tr(editingArticleId ? "Enregistrer" : "Ajouter")}</Button>
            {editingArticleId && <Button type="button" kind="s" full={false} disabled={articleBusy} onClick={annulerModificationArticle}>{tr("Annuler")}</Button>}
          </form>
        </section>

        {/* ---- Colis de l'expédition ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Colis")} ({colis.length})</h2>
          {colis.length === 0 ? <p className="muted">{tr("Aucun colis dans cette expédition. Utilisez le bouton + pour en ajouter un.")}</p> : (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Colis")}</th><th>{tr("Client")}</th><th>{tr("Poids / Volume")}</th><th>{tr("Statut")}</th><th>{tr("Facture")}</th></tr></thead>
              <tbody>
                {colis.map((c) => (
                  <tr key={c.code}>
                    <td><strong>{c.code}</strong>{c.marqueColis && <div className="small muted">{c.marqueColis}</div>}{c.caracteristiques.length > 0 && <div className="small">{c.caracteristiques.map((v) => tr(caracLabel(v))).join(' · ')}</div>}</td>
                    <td>{c.clientNom ?? <span className="np">—</span>}{c.clientTel && <div className="small muted">{c.clientTel}</div>}</td>
                    <td className="small">{c.poidsKg != null ? `${c.poidsKg} kg` : '—'}{c.volumeM3 != null ? ` · ${c.volumeM3} m³` : ''}</td>
                    <td><span className="small">{tr(COLIS_STATUT_LABEL[c.statut])}</span></td>
                    <td>
                      {(() => {
                        const f = factures[c.code];
                        return f ? (
                          <div className="stack" style={{ gap: 4, minWidth: 150 }}>
                            <span className="small"><strong>{money(f.montantTotal, f.devise)}</strong> · {tr(FACTURE_STATUT_LABEL[f.statut])}</span>
                            <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {f.statut === 'a_payer' && <Button kind="s" full={false} onClick={() => payer(c.code)}>{tr("Marquer payé")}</Button>}
                              {peutFacturer && <Button kind="s" full={false} onClick={() => facturer(c.code)}>{tr("Refacturer")}</Button>}
                            </span>
                          </div>
                        ) : peutFacturer ? <Button kind="s" icon="send" full={false} onClick={() => facturer(c.code)}>{tr("Facturer")}</Button>
                          : <span className="small muted">{tr("Pas encore facturé")}</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        {/* ---- Rattacher un colis déjà enregistré ---- */}
        {libres.length > 0 && (
          <section className="card stack" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Rattacher un colis à cette expédition")}</h2>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <Select id="aff" label={tr("Colis non affecté")} value={aff} onChange={setAff}
                options={[{ v: '', l: 'Choisir un colis…' }, ...libres.map((c) => ({ v: c.code, l: `${c.code}${c.clientNom ? ` · ${c.clientNom}` : ''}` }))]} />
              <Button icon="link" full={false} disabled={!aff} onClick={affecter}>{tr("Rattacher")}</Button>
            </div>
          </section>
        )}
      </div>

      <button type="button" className="fab" aria-label={tr("Ajouter un colis")} onClick={ouvrirColis}>
        <Icon name="plus" size={28} sw={2.6} />
      </button>

      {showColis && (
        <AdminSheet title={tr("Nouveau colis")} sub={`${tr("Expédition")} ${exp.code} · ${tr(MODE_LABEL[exp.mode])}`} onClose={() => setShowColis(false)}>
          <form onSubmit={enregistrerColis} className="stack" style={{ gap: 12 }} noValidate>
            {rcErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(rcErr)}</span></div>}
            <Field id="rc-code" label={tr("Code du colis")} value={rc.code} onChange={(v) => setRc({ ...rc, code: v })} req />
            <Field id="rc-search-client" label={tr("Rechercher un voyageur")} type="search" value={clientQ} onChange={setClientQ} placeholder={tr("Nom ou téléphone")} />
            <Select id="rc-client" label={tr("Client / voyageur")} value={rc.profileId} req
              onChange={(id) => {
                const found = clientResults.find((c) => c.id === id);
                if (found) choisirClient(found);
                else { setClientSel(null); setRc((r) => ({ ...r, profileId: '', clientNom: '', clientTel: '' })); }
              }}
              options={[{ v: '', l: clientLoading ? 'Chargement des voyageurs…' : 'Choisir un voyageur…' },
                ...clientResults.map((c) => ({ v: c.id, l: `${c.name ?? 'Sans nom'}${c.phone ? ` · ${c.phone}` : ''}` })),
                ...(clientSel && !clientResults.some((c) => c.id === clientSel.id)
                  ? [{ v: clientSel.id, l: `${clientSel.name ?? 'Sans nom'}${clientSel.phone ? ` · ${clientSel.phone}` : ''}` }] : [])]} />
            <Button kind="s" icon="plus" full={false} onClick={() => setShowNewClient((v) => !v)}>{tr(showNewClient ? 'Fermer' : 'Nouveau voyageur')}</Button>
            {showNewClient && (
              <div className="card stack" style={{ gap: 10 }}>
                <p className="small muted" style={{ margin: 0 }}>{tr("Une invitation sera envoyée à son adresse e-mail. Le compte sera sélectionné pour le colis dès sa création.")}</p>
                <Field id="nv-nom" label={tr("Nom complet")} value={newClient.name} onChange={(v) => setNewClient({ ...newClient, name: v })} req />
                <Field id="nv-email" label={tr("Adresse e-mail")} type="email" value={newClient.email} onChange={(v) => setNewClient({ ...newClient, email: v })} req />
                <Field id="nv-phone" label={tr("Téléphone")} type="tel" value={newClient.phone} onChange={(v) => setNewClient({ ...newClient, phone: v })} req />
                <Button icon="plus" full={false} disabled={busy} onClick={() => void ajouterClient()}>{tr(busy ? 'Création…' : 'Créer et sélectionner')}</Button>
              </div>
            )}
            <Field id="rc-marque" label={tr("Marquage")} value={rc.marque} onChange={(v) => setRc({ ...rc, marque: v })} placeholder={tr("Shipping mark")} />
            <Select id="rc-type" label={tr("Type de marchandise")} value={rc.type} onChange={(v) => setRc({ ...rc, type: v })} options={TYPES} />
            <div className="filters">
              <div className="grow"><Field id="rc-poids" label={tr("Poids (kg)")} value={rc.poids} onChange={(v) => setRc({ ...rc, poids: v })} placeholder="0" /></div>
              <div className="grow"><Field id="rc-vol" label={tr("Volume (m³)")} value={rc.volume} onChange={(v) => setRc({ ...rc, volume: v })} placeholder="0" /></div>
            </div>
            <Button type="submit" icon="box" disabled={busy}>{tr(busy ? 'Enregistrement…' : 'Enregistrer le colis')}</Button>
          </form>
        </AdminSheet>
      )}

      {showEdit && (
        <AdminSheet title={tr("Modifier l’expédition")} sub={exp.code} onClose={() => setShowEdit(false)}>
          <form onSubmit={enregistrerEdition} className="stack" style={{ gap: 12 }} noValidate>
            {editErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(editErr)}</span></div>}
            <Select id="edit-mode" label={tr("Mode")} value={editForm.mode} onChange={(v) => setEditForm({ ...editForm, mode: v as FretMode })} options={MODE_OPTIONS} />
            <Field id="edit-destination" label={tr("Destination au Sénégal")} value={editForm.destination} onChange={(v) => setEditForm({ ...editForm, destination: v })} req />
            <Field id="edit-arrivee" label={tr("Arrivée prévue")} type="date" value={editForm.arriveePrevue} onChange={(v) => setEditForm({ ...editForm, arriveePrevue: v })} />
            <TextArea id="edit-note" label={tr("Note interne (équipe uniquement)")} value={editForm.noteInterne} onChange={(v) => setEditForm({ ...editForm, noteInterne: v })} rows={3} placeholder={tr("Jamais visible du voyageur")} />
            <Field id="edit-container" label={tr("Numéro de conteneur")} value={editForm.containerNo} onChange={(v) => setEditForm({ ...editForm, containerNo: v })} placeholder={tr("facultatif")} />
            <Field id="edit-bl" label={tr("Numéro BL")} value={editForm.blNo} onChange={(v) => setEditForm({ ...editForm, blNo: v })} placeholder={tr("facultatif")} />
            <Field id="edit-awb" label={tr("Numéro AWB")} value={editForm.awbNo} onChange={(v) => setEditForm({ ...editForm, awbNo: v })} placeholder={tr("facultatif")} />
            <div className="filters">
              <div className="grow"><Field id="edit-seuil-kg" label={tr("Seuil kg")} value={editForm.seuilKg} onChange={(v) => setEditForm({ ...editForm, seuilKg: v })} placeholder={tr("facultatif")} /></div>
              <div className="grow"><Field id="edit-seuil-m3" label={tr("Seuil m³")} value={editForm.seuilM3} onChange={(v) => setEditForm({ ...editForm, seuilM3: v })} placeholder={tr("facultatif")} /></div>
            </div>
            <Button type="submit" icon="check" disabled={busy}>{tr(busy ? 'Enregistrement…' : 'Enregistrer les modifications')}</Button>
          </form>
        </AdminSheet>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
