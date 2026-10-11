import { useI18n } from '../../../i18n';
import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Icon, Select, TextArea, useWide } from '../../../ui';
import { AdminCard, AdminSheet } from '../mobile';
import { SortTh, compare, useSort } from '../tableSort';
import { EXPEDITION_IMPORT_HEADERS, parseExpeditionImport } from '../../../lib/expeditionImport';
import {
  fetchExpeditions, fetchExpeditionTotaux, fetchExpeditionArticleCounts, fetchWarehouses,
  createExpedition, importExpeditions, addEtapesExpeditions, suggestExpeditionCode,
  MODE_LABEL, EXPEDITION_STATUT_LABEL, ETAPE_LABEL,
  type Expedition, type ExpeditionTotaux, type FretMode, type ExpeditionStatut, type Warehouse, type EtapeType,
} from '../../../lib/fret';
import { ETAPES_ORDRE, MODE_OPTIONS, Remplissage, estEnRetard, toNum, useBase } from './shared';

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
