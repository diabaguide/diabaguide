import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button, Field, Icon, Select, TextArea, useWide } from '../../ui';
import { useStore } from '../../store';
import { contient } from '../../lib/texte';
import { SortTh, compare, useSort } from './tableSort';
import { AdminCard, AdminSheet, SheetActions, SheetDanger } from './mobile';
import {
  FRET_LABEL, ORIGINES, STATUTS, STATUT_LABEL,
  ajouterEtape, creerExpedition, fetchEtapes, fetchExpeditions, fetchNotes, fetchTransitaires,
  fetchVoyageurs, majExpedition, supprimerExpedition,
  type Etape, type Expedition, type Fret, type Statut, type Voyageur,
} from '../../lib/fret';

/* ==================================================================== */
/* Console équipe du suivi de fret Chine / Sénégal                      */
/*                                                                      */
/* Un lot = un conteneur maritime ou un envoi aérien, suivi d'étape en  */
/* étape jusqu'à la remise au voyageur.                                 */
/*                                                                      */
/* Deux règles de la base, respectées ici :                             */
/*   • aucune écriture directe : tout passe par les fonctions admin_*   */
/*     (la RLS refuse un insert depuis le navigateur) ;                 */
/*   • les notes internes ne descendent jamais chez le voyageur : le    */
/*     droit de lecture de `expeditions` est accordé colonne par        */
/*     colonne, `notes` exclue — d'où `fetchNotes`.                     */
/*                                                                      */
/* L'équipe peut consulter, mais seuls les administrateurs écrivent :   */
/* l'écran masque ce que la base refuserait.                            */
/* ==================================================================== */

const jour = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** Statut écrit en toutes lettres : jamais signalé par la couleur seule. */
function StatutTag({ statut }: { statut: Statut }) {
  const { tr } = useI18n();
  const ton = statut === 'livre' ? 'ok' : statut === 'preparation' ? 'muted' : '';
  return <span className={`tag${ton ? ` tag-${ton}` : ''}`}><Icon name="truck" size={15} sw={2} />{tr(STATUT_LABEL[statut])}</span>;
}

/** Fiche d'un lot : champs modifiables, étapes posées, ajout d'étape, notes
    internes et suppression. */
function LotSheet({ lot, nomVoyageur, admin, transitaires, onClose, onSaved }: {
  lot: Expedition;
  nomVoyageur: string;
  admin: boolean;
  transitaires: { id: string; nom: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { tr, t } = useI18n();
  const [conteneur, setConteneur] = useState(lot.conteneur);
  const [poids, setPoids] = useState(lot.poids);
  const [articles, setArticles] = useState(lot.articles);
  const [providerId, setProviderId] = useState(lot.providerId ?? '');
  const [depart, setDepart] = useState(lot.departLe ?? '');
  const [arriveePrevue, setArriveePrevue] = useState(lot.arriveePrevue ?? '');
  const [arriveeLe, setArriveeLe] = useState(lot.arriveeLe ?? '');
  const [notes, setNotes] = useState<string | null>(null);
  const [etapes, setEtapes] = useState<Etape[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  /* Ajout d'étape */
  const [statut, setStatut] = useState<Statut>(lot.statut);
  const [lieu, setLieu] = useState('');
  const [note, setNote] = useState('');
  const [survenu, setSurvenu] = useState('');
  const [estime, setEstime] = useState(false);
  const [publique, setPublique] = useState(true);

  useEffect(() => {
    document.getElementById('fr-conteneur')?.focus();
  }, []);

  useEffect(() => {
    let vivant = true;
    void Promise.all([fetchNotes(lot.id), fetchEtapes(lot.id)]).then(([n, e]) => {
      if (!vivant) return;
      setNotes(n ?? '');
      setEtapes(e);
    });
    return () => { vivant = false; };
  }, [lot.id]);

  /* Seulement les statuts à partir de l'état courant : la base refuse une
     étape qui ferait reculer le lot, et le voyageur verrait son suivi
     redescendre. */
  const proposes = useMemo(() => STATUTS.slice(STATUTS.indexOf(lot.statut)), [lot.statut]);

  const maj = async () => {
    setErr(null); setBusy('save');
    const { error } = await majExpedition({
      id: lot.id, conteneur, poids, articles,
      providerId: providerId || undefined,
      departLe: depart || null, arriveePrevue: arriveePrevue || null, arriveeLe: arriveeLe || null,
      notes: notes ?? undefined,
    });
    setBusy(null);
    if (error) { setErr(error); return; }
    onSaved('Lot modifié.');
  };

  const ajouter = async () => {
    setErr(null); setBusy('etape');
    const { error } = await ajouterEtape({
      expeditionId: lot.id, statut, lieu, note, publique, estime,
      survenuLe: survenu ? new Date(`${survenu}T12:00:00`).toISOString() : null,
    });
    setBusy(null);
    if (error) { setErr(error); return; }
    onSaved(t('Étape « {0} » ajoutée.', { 0: tr(STATUT_LABEL[statut]) }));
  };

  const supprimer = async () => {
    setErr(null); setBusy('delete');
    const { error } = await supprimerExpedition(lot.id);
    setBusy(null);
    if (error) { setErr(error); return; }
    onSaved(t('Lot {0} supprimé.', { 0: lot.code }));
  };

  const options = proposes.map((s) => ({ v: s, l: tr(STATUT_LABEL[s]) }));

  return (
    <AdminSheet title={lot.code} sub={nomVoyageur ? t('{0} — {1}', { 0: nomVoyageur, 1: tr(FRET_LABEL[lot.fret]) }) : tr(FRET_LABEL[lot.fret])} onClose={onClose}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <StatutTag statut={lot.statut} />
        <span className="small muted">{lot.origine}</span>
        {lot.departLe && <span className="small muted">{t('Départ {0}', { 0: jour(lot.departLe) })}</span>}
      </div>

      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
      {!admin && <div role="status" className="notice"><Icon name="info" size={20} sw={2} /><span>{tr("Consultation seule : la modification est réservée à l’administration.")}</span></div>}

      {/* Étapes déjà posées */}
      <h3 style={{ marginBottom: 0 }}>{tr("Étapes du lot")}</h3>
      {etapes === null ? <p className="muted" role="status">{tr("Chargement…")}</p>
        : etapes.length === 0 ? <p className="muted">{tr("Aucune étape posée pour le moment.")}</p>
        : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 8 }}>
            {etapes.map((e) => (
              <li key={e.id} className="small">
                <strong>{tr(STATUT_LABEL[e.statut])}</strong>
                <span className="muted"> — {jour(e.survenuLe)}{e.lieu ? ` · ${e.lieu}` : ''}</span>
                {e.estime && <span className="tag tag-muted" style={{ marginLeft: 6 }}>{tr("Estimé")}</span>}
                {!e.publique && <span className="tag tag-warn" style={{ marginLeft: 6 }}>{tr("Interne")}</span>}
                {e.note && <div className="muted">{e.note}</div>}
              </li>
            ))}
          </ul>
        )}

      {/* Champs modifiables */}
      <Field id="fr-conteneur" label={tr(lot.fret === 'air' ? 'Numéro AWB' : 'Numéro de conteneur')}
        value={conteneur} onChange={setConteneur} placeholder="Non renseigné"
        hint={tr("Modifiable seulement : un champ vidé ici garde sa valeur précédente.")} />
      <Field id="fr-poids" label={tr("Poids")} value={poids} onChange={setPoids} placeholder="Non renseigné" />
      <TextArea id="fr-articles" label={tr("Articles transportés")} value={articles} onChange={setArticles}
        rows={2} placeholder={tr("Un article par ligne")} />
      <Select id="fr-transitaire" label={tr("Transitaire")} value={providerId} onChange={setProviderId}
        options={[{ v: '', l: tr("Aucun") }, ...transitaires.map((p) => ({ v: p.id, l: p.nom }))]} />
      <Field id="fr-depart" label={tr("Date de départ")} type="date" value={depart} onChange={setDepart} />
      <Field id="fr-prevue" label={tr("Arrivée prévue")} type="date" value={arriveePrevue} onChange={setArriveePrevue} />
      <Field id="fr-arrivee" label={tr("Arrivée réelle")} type="date" value={arriveeLe} onChange={setArriveeLe} />

      {/* Notes internes : jamais montrées au voyageur */}
      <TextArea id="fr-notes" label={tr("Notes internes (jamais visibles du voyageur)")} value={notes ?? ''}
        onChange={setNotes} rows={2} hint={tr("Visible de l’équipe seulement.")} />

      {admin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon="check" full={false} disabled={busy !== null} onClick={() => void maj()}>
            {tr(busy === 'save' ? 'Enregistrement…' : 'Enregistrer')}
          </Button>
          <Button to={`/suivi/${lot.code}`} kind="s" icon="search" full={false}>
            {tr("Voir le suivi du voyageur")}
          </Button>
        </div>
      )}

      {/* Ajout d'une étape */}
      {admin && (
        <>
          <h3 style={{ marginBottom: 0 }}>{tr("Ajouter une étape")}</h3>
          <Select id="fr-statut" label={tr("Statut")} value={statut} onChange={(v) => setStatut(v as Statut)} options={options} />
          <Field id="fr-lieu" label={tr("Lieu")} value={lieu} onChange={setLieu} placeholder="Dakar, Anvers…" />
          <Field id="fr-survenu" label={tr("Date du mouvement")} type="date" value={survenu} onChange={setSurvenu}
            hint={tr("Laissez vide pour maintenant.")} />
          <TextArea id="fr-note" label={tr("Note visible du voyageur")} value={note} onChange={setNote} rows={2} />
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={publique} onChange={(e) => setPublique(e.target.checked)} />
              {tr("Visible du voyageur")}
            </label>
            <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={estime} onChange={(e) => setEstime(e.target.checked)} />
              {tr("Date estimée")}
            </label>
          </div>
          <Button icon="truck" full={false} disabled={busy !== null} onClick={() => void ajouter()}>
            {tr(busy === 'etape' ? 'Ajout…' : "Ajouter l’étape")}
          </Button>
        </>
      )}

      {admin && (
        <SheetActions>
          {confirming ? (
            <>
              <SheetDanger>{t('Supprimer définitivement le lot {0} ?', { 0: lot.code })}</SheetDanger>
              <p className="small muted" style={{ margin: 0 }}>
                {tr("Le lot et ses étapes disparaissent, et le voyageur perd son suivi. Cette action est irréversible.")}
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button kind="d" icon="trash" full={false} disabled={busy !== null} onClick={() => void supprimer()}>
                  {tr(busy === 'delete' ? 'Suppression…' : 'Supprimer définitivement')}
                </Button>
                <Button kind="t" icon="x" full={false} disabled={busy !== null} onClick={() => setConfirming(false)}>
                  {tr("Annuler")}
                </Button>
              </div>
            </>
          ) : (
            <Button kind="d" icon="trash" full={false} onClick={() => { setErr(null); setConfirming(true); }}>
              {tr("Supprimer le lot")}
            </Button>
          )}
        </SheetActions>
      )}
    </AdminSheet>
  );
}

/** Fiche de création : quel voyageur, quel fret, d'où, pour quand. */
function NouveauLotSheet({ voyageurs, transitaires, onClose, onSaved }: {
  voyageurs: Voyageur[];
  transitaires: { id: string; nom: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { tr, t } = useI18n();
  const [userId, setUserId] = useState('');
  const [fret, setFret] = useState<Fret>('sea');
  const [origine, setOrigine] = useState(ORIGINES[0]);
  const [providerId, setProviderId] = useState('');
  const [conteneur, setConteneur] = useState('');
  const [poids, setPoids] = useState('');
  const [articles, setArticles] = useState('');
  const [depart, setDepart] = useState('');
  const [arriveePrevue, setArriveePrevue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.getElementById('nl-voyageur')?.focus();
  }, []);

  const creer = async () => {
    if (!userId) { setErr('Choisissez le voyageur à qui appartient ce lot.'); return; }
    setErr(null); setBusy(true);
    const { code, error } = await creerExpedition({
      userId, fret, origine, providerId: providerId || null, conteneur, poids, articles,
      departLe: depart || null, arriveePrevue: arriveePrevue || null, notes,
    });
    setBusy(false);
    if (error) { setErr(error); return; }
    onSaved(t('Lot {0} créé.', { 0: code ?? '' }));
  };

  return (
    <AdminSheet title={tr("Nouveau lot")} sub={tr("Un conteneur maritime ou un envoi aérien, suivi jusqu’à la remise.")} onClose={onClose}>
      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
      {voyageurs.length === 0 && (
        <div role="status" className="notice warn"><Icon name="alert" size={20} sw={2} />
          <span>{tr("Aucun compte voyageur lisible : la liste des comptes est réservée à l’administration.")}</span>
        </div>
      )}
      <Select id="nl-voyageur" label={tr("Voyageur")} value={userId} onChange={setUserId}
        options={[{ v: '', l: tr("Choisir un voyageur") }, ...voyageurs.map((v) => ({ v: v.id, l: v.email ? `${v.nom} — ${v.email}` : v.nom }))]} req />
      <Select id="nl-fret" label={tr("Type de fret")} value={fret} onChange={(v) => setFret(v as Fret)}
        options={(Object.keys(FRET_LABEL) as Fret[]).map((f) => ({ v: f, l: tr(FRET_LABEL[f]) }))} />
      <Select id="nl-origine" label={tr("Ville d’origine")} value={origine} onChange={setOrigine}
        options={ORIGINES.map((o) => ({ v: o, l: o }))} />
      <Select id="nl-transitaire" label={tr("Transitaire")} value={providerId} onChange={setProviderId}
        options={[{ v: '', l: tr("Aucun") }, ...transitaires.map((p) => ({ v: p.id, l: p.nom }))]} />
      <Field id="nl-conteneur" label={tr(fret === 'air' ? 'Numéro AWB' : 'Numéro de conteneur')} value={conteneur} onChange={setConteneur} />
      <Field id="nl-poids" label={tr("Poids")} value={poids} onChange={setPoids} />
      <TextArea id="nl-articles" label={tr("Articles transportés")} value={articles} onChange={setArticles} rows={2}
        placeholder={tr("Un article par ligne")} />
      <Field id="nl-depart" label={tr("Date de départ")} type="date" value={depart} onChange={setDepart} />
      <Field id="nl-prevue" label={tr("Arrivée prévue")} type="date" value={arriveePrevue} onChange={setArriveePrevue} />
      <TextArea id="nl-notes" label={tr("Notes internes (jamais visibles du voyageur)")} value={notes} onChange={setNotes} rows={2} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="check" full={false} disabled={busy} onClick={() => void creer()}>
          {tr(busy ? 'Création…' : 'Créer le lot')}
        </Button>
        <Button kind="t" icon="x" full={false} disabled={busy} onClick={onClose}>{tr("Annuler")}</Button>
      </div>
    </AdminSheet>
  );
}

/** Liste des lots, accessible à l'équipe. Sur téléphone, chaque lot ouvre sa
    fiche ; sur ordinateur, le tableau reste affiché et le code ouvre la même
    fiche. */
export function Expeditions() {
  const { tr, t } = useI18n();
  const wide = useWide();
  const { s } = useStore();
  const admin = s.user?.role === 'admin';

  const [lots, setLots] = useState<Expedition[]>([]);
  const [voyageurs, setVoyageurs] = useState<Voyageur[]>([]);
  const [transitaires, setTransitaires] = useState<{ id: string; nom: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pq, setPq] = useState('');
  const [etat, setEtat] = useState<'' | Statut>('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [open, setOpen] = useState<Expedition | null>(null);
  const [creation, setCreation] = useState(false);
  const { sort, toggle } = useSort<'code' | 'statut' | 'createdAt'>({ k: 'createdAt', dir: -1 });

  const reload = useCallback(async () => {
    const [l, v, p] = await Promise.all([fetchExpeditions(), fetchVoyageurs(), fetchTransitaires()]);
    setLots(l);
    setVoyageurs(v);
    setTransitaires(p.map((x) => ({ id: x.id, nom: x.nom })));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /** Nom du voyageur : la lecture des comptes est réservée à l'administration,
      le nom peut donc manquer — on ne l'invente pas. */
  const nomDe = useCallback((userId: string) => {
    const v = voyageurs.find((x) => x.id === userId);
    return v ? v.nom : '';
  }, [voyageurs]);

  const rows = lots
    .filter((l) => (!etat || l.statut === etat)
      && (contient(`${l.code} ${l.conteneur} ${l.articles} ${nomDe(l.userId)}`, pq)))
    .sort((a, b) => compare(sort.k === 'createdAt' ? a.createdAt : sort.k === 'statut' ? STATUTS.indexOf(a.statut) : a.code,
      sort.k === 'createdAt' ? b.createdAt : sort.k === 'statut' ? STATUTS.indexOf(b.statut) : b.code, sort.dir));

  const saved = (msg: string) => { setErr(null); setOk(msg); setOpen(null); setCreation(false); void reload(); };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Suivi de fret")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr("Lots de marchandises Chine → Sénégal, et leur suivi par le voyageur.")}</div>
        </div>
        {admin && (
          <Button icon="plus" full={false} onClick={() => { setOk(null); setCreation(true); }}>
            {tr("Nouveau lot")}
          </Button>
        )}
      </header>
      <div className="admin-body" style={{ gap: 18 }}>
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{t('{0} lot(s)', { 0: lots.length })}</h2>

          {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(ok)}</span></div>}
          {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}

          <div className="filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="admin-search" style={{ maxWidth: 360, flex: '1 1 220px' }}>
              <Icon name="search" size={18} />
              <input type="search" value={pq} onChange={(e) => setPq(e.target.value)}
                aria-label={tr("Rechercher un lot")} placeholder={tr("Code, conteneur, article, voyageur")} />
            </div>
            <div>
              <label className="small muted" htmlFor="fstat-lot" style={{ display: 'block', marginBottom: 4 }}>{tr("Statut")}</label>
              <select id="fstat-lot" value={etat} onChange={(e) => setEtat(e.target.value as '' | Statut)}>
                <option value="">{tr("Tous")}</option>
                {STATUTS.map((st) => <option key={st} value={st}>{tr(STATUT_LABEL[st])}</option>)}
              </select>
            </div>
          </div>

          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : rows.length === 0 ? <p className="muted">{tr(pq || etat ? 'Aucun lot ne correspond à la recherche.' : 'Aucun lot suivi pour le moment.')}</p>
            : wide ? (
              <div className="table dense"><table>
                <thead><tr>
                  <SortTh k="code" label={tr("Code")} sort={sort} onSort={toggle} />
                  <th>{tr("Voyageur")}</th>
                  <SortTh k="statut" label={tr("Statut")} sort={sort} onSort={toggle} />
                  <th>{tr("Fret")}</th>
                  <th>{tr("Arrivée prévue")}</th>
                  <th>{tr("Actions")}</th>
                </tr></thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <button type="button" className="linklike" onClick={() => setOpen(l)}><strong>{l.code}</strong></button>
                        <div className="small muted">{l.conteneur || l.origine}</div>
                      </td>
                      <td>{nomDe(l.userId) || '—'}</td>
                      <td><StatutTag statut={l.statut} /></td>
                      <td>{tr(FRET_LABEL[l.fret])}</td>
                      <td>{jour(l.arriveePrevue) || '—'}</td>
                      <td><Button kind="s" icon="edit" full={false} onClick={() => setOpen(l)}>{tr("Ouvrir la fiche")}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            ) : (
              <div className="acards">
                {rows.map((l) => (
                  <AdminCard key={l.id} toneSeed={l.code}
                    title={l.code}
                    sub={[nomDe(l.userId) || null, l.conteneur || l.origine, jour(l.arriveePrevue) ? t('Arrivée prévue {0}', { 0: jour(l.arriveePrevue) }) : null].filter(Boolean).join(' · ')}
                    badge={<StatutTag statut={l.statut} />}
                    onOpen={() => setOpen(l)} ariaLabel={t('Ouvrir la fiche du lot {0}', { 0: l.code })} />
                ))}
              </div>
            )}
        </section>

        {open && <LotSheet lot={open} nomVoyageur={nomDe(open.userId)} admin={admin}
          transitaires={transitaires} onClose={() => setOpen(null)} onSaved={saved} />}
        {creation && <NouveauLotSheet voyageurs={voyageurs} transitaires={transitaires}
          onClose={() => setCreation(false)} onSaved={saved} />}
      </div>
    </>
  );
}