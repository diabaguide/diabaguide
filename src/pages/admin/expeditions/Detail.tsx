import { useI18n } from '../../../i18n';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../../store';
import { isTeamRole } from '../../../lib/auth';
import { Button, Field, Icon, Select, TextArea } from '../../../ui';
import { AdminSheet } from '../mobile';
import {
  fetchExpeditions, fetchExpeditionTotaux, fetchColis, fetchFactures, fetchEtapesExpedition, fetchExpeditionArticles,
  updateExpedition, deleteExpedition,
  MODE_LABEL, MODE_UNITE, EXPEDITION_STATUT_LABEL,
  type Expedition, type ExpeditionTotaux, type ExpeditionArticle, type EtapeExpedition, type Colis, type FretMode, type Facture,
} from '../../../lib/fret';
import { MODE_OPTIONS, Remplissage, Stat, toNum, useBase, type Notifier } from './shared';
import { EtapesSection, ShipsGoSection } from './Suivi';
import { ArticlesSection, PhotoSection } from './Lot';
import { ColisSection, ColisSheet, RattacherSection } from './Colis';

/* ============================================================
   Détail d'une expédition : remplissage, étapes (de l'expédition), colis
   ============================================================ */
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
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showColis, setShowColis] = useState(false);

  const reload = useCallback(async () => {
    const [exps, totaux, cs, l, f, et, ar] = await Promise.all([
      fetchExpeditions(), fetchExpeditionTotaux(), fetchColis(code), fetchColis(), fetchFactures(), fetchEtapesExpedition(code), fetchExpeditionArticles(code),
    ]);
    setExp(exps.find((e) => e.code === code) ?? null);
    setTot(totaux[code]); setColis(cs); setLibres(l); setFactures(f); setEtapes(et); setArticles(ar); setLoading(false);
  }, [code]);
  useEffect(() => { void reload(); }, [reload]);
  const notifier: Notifier = { setErr, setOk, reload };

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

  if (loading) return <div className="admin-body"><p className="muted" role="status">{tr("Chargement…")}</p></div>;
  if (!exp) return <div className="admin-body"><p className="muted">{tr("Expédition introuvable.")} <Link to={`${base}/expeditions`}>{tr("Retour à la liste")}</Link></p></div>;

  const unite = MODE_UNITE[exp.mode];
  const shipsGoModeSupported = exp.mode.startsWith('maritime') || exp.mode.startsWith('aerien');

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{exp.code}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr(MODE_LABEL[exp.mode])} · {exp.destination} · {tr(EXPEDITION_STATUT_LABEL[exp.statut])}</div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Button kind="s" icon="edit" full={false} onClick={() => setShowEdit(true)}>{tr("Modifier")}</Button>
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

        {peutGererShipsGo && shipsGoModeSupported && <ShipsGoSection exp={exp} {...notifier} />}
        <EtapesSection code={code} etapes={etapes} busy={busy} setBusy={setBusy} {...notifier} />
        <PhotoSection exp={exp} {...notifier} />
        <ArticlesSection code={code} articles={articles} {...notifier} />
        <ColisSection colis={colis} factures={factures} peutFacturer={peutFacturer} {...notifier} />
        {libres.length > 0 && <RattacherSection code={code} libres={libres} {...notifier} />}
      </div>

      <button type="button" className="fab" aria-label={tr("Ajouter un colis")} onClick={() => setShowColis(true)}>
        <Icon name="plus" size={28} sw={2.6} />
      </button>

      {showColis && <ColisSheet exp={exp} busy={busy} setBusy={setBusy} onClose={() => setShowColis(false)} setOk={setOk} reload={reload} />}
      {showEdit && <EditSheet exp={exp} busy={busy} setBusy={setBusy} onClose={() => setShowEdit(false)} setOk={setOk} reload={reload} />}
    </>
  );
}

/** Modification des informations du lot (mode, destination, références, seuils, note interne). */
function EditSheet({ exp, busy, setBusy, onClose, setOk, reload }: {
  exp: Expedition; busy: boolean; setBusy: (busy: boolean) => void; onClose: () => void;
} & Omit<Notifier, 'setErr'>) {
  const { tr } = useI18n();
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    mode: exp.mode as FretMode, warehouseId: exp.warehouseId ?? '', destination: exp.destination, containerNo: exp.containerNo ?? '',
    blNo: exp.blNo ?? '', awbNo: exp.awbNo ?? '', seuilKg: exp.seuilKg == null ? '' : String(exp.seuilKg), seuilM3: exp.seuilM3 == null ? '' : String(exp.seuilM3), arriveePrevue: exp.arriveePrevue ?? '', noteInterne: exp.noteInterne ?? '',
  });
  const enregistrerEdition = async (event: FormEvent) => {
    event.preventDefault();
    if (!editForm.destination.trim()) { setEditErr('La destination est obligatoire.'); return; }
    setEditErr(null); setBusy(true);
    const res = await updateExpedition({
      code: exp.code, mode: editForm.mode, warehouseId: editForm.warehouseId || null, destination: editForm.destination,
      containerNo: editForm.containerNo, blNo: editForm.blNo, awbNo: editForm.awbNo,
      seuilKg: toNum(editForm.seuilKg), seuilM3: toNum(editForm.seuilM3), arriveePrevue: editForm.arriveePrevue || null, noteInterne: editForm.noteInterne,
    });
    setBusy(false);
    if (res.error) { setEditErr(res.error); return; }
    onClose(); setOk('Lot modifié.'); await reload();
  };

  return (
    <AdminSheet title={tr("Modifier l’expédition")} sub={exp.code} onClose={onClose}>
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
  );
}
