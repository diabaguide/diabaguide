import { supabase } from '../../lib/supabase';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button, Field, Icon, Select, StoredPhoto, TextArea, useWide } from '../../ui';
import { useStore } from '../../store';
import { cityName } from '../../data';
import { contient } from '../../lib/texte';
import { creerVoyageur } from '../../lib/members';
import { creerTransitaire } from '../../lib/providers';
import { FilePick } from '../Contribute';
import { SortTh, compare, useSort } from './tableSort';
import { AdminCard, AdminSheet, SheetActions, SheetDanger } from './mobile';
import {
  FRET_LABEL, ORIGINES, STATUTS, STATUT_LABEL,
  ajouterArticle, ajouterEtape, creerExpedition, fetchArticles, fetchEtapes, fetchExpeditions,
  fetchNotes, fetchTransitaires, fetchVoyageurs, majArticle, majExpedition,
  supprimerArticle, supprimerExpedition,
  type Article, type Etape, type Expedition, type Fret, type Statut, type Voyageur,
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

/** Nombre saisi à la main (« 12,5 » ou « 12.5 ») : `null` si le champ est vide. */
const nombre = (v: string): number | null => {
  const s = v.trim().replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Une ligne d'article en cours de saisie (pas encore enregistrée en base). */
type Ligne = { id?: string; nom: string; quantite: string; poids: string };

const enLigne = (a: Article): Ligne => ({
  id: a.id, nom: a.nom, quantite: String(a.quantite), poids: a.poids == null ? '' : String(a.poids),
});

/**
 * Les articles transportés, en lignes : nom, quantité, poids. On ajoute, on
 * corrige et on retire une ligne ; le poids total se calcule en clair sur ce
 * qui est affiché (les lignes sans poids ne comptent pas, et on le dit).
 *
 * Le parent garde la liste et décide de ce qui part en base : à la création du
 * lot les lignes ne peuvent pas encore être enregistrées (le lot n'a pas
 * d'identifiant), dans la fiche elles le sont ligne par ligne.
 */
function LignesArticles(p: {
  lignes: Ligne[];
  admin: boolean;
  busy: boolean;
  onPatch: (i: number, patch: Partial<Ligne>) => void;
  onSupprimer: (i: number) => void;
  onEnregistrer?: (i: number) => void;
  onAjouter: (l: Ligne) => Promise<boolean>;
}) {
  const { tr, t } = useI18n();
  const [brouillon, setBrouillon] = useState<Ligne>({ nom: '', quantite: '1', poids: '' });
  const [ajout, setAjout] = useState(false);

  const total = p.lignes.reduce((s, l) => {
    const q = nombre(l.quantite);
    const w = nombre(l.poids);
    return s + (q != null && w != null ? q * w : 0);
  }, 0);
  const sansPoids = p.lignes.some((l) => nombre(l.poids) == null);

  const ajouter = async () => {
    setAjout(true);
    const fait = await p.onAjouter(brouillon);
    setAjout(false);
    if (fait) setBrouillon({ nom: '', quantite: '1', poids: '' });
  };

  const champ = (v: string, aria: string, largeur: string, maj: (x: string) => void, type = 'text') => (
    <div className="field" style={{ flex: largeur }}>
      <input type={type} value={v} aria-label={tr(aria)} placeholder={tr(aria)}
        min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined}
        disabled={!p.admin} onChange={(e) => maj(e.target.value)} />
    </div>
  );

  return (
    <>
      <h3 style={{ marginBottom: 0 }}>{tr("Articles transportés")}</h3>
      {p.lignes.length === 0
        ? <p className="muted">{tr("Aucune ligne d’article pour le moment.")}</p>
        : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 10 }}>
            {p.lignes.map((l, i) => (
              <li key={l.id ?? `ligne-${i}`} className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {champ(l.nom, "Nom de l’article", '2 1 160px', (x) => p.onPatch(i, { nom: x }))}
                {champ(l.quantite, "Quantité", '1 1 80px', (x) => p.onPatch(i, { quantite: x }), 'number')}
                {champ(l.poids, "Poids (kg)", '1 1 90px', (x) => p.onPatch(i, { poids: x }), 'number')}
                {p.admin && (
                  <div className="row" style={{ gap: 6 }}>
                    {p.onEnregistrer && (
                      <Button kind="s" icon="check" full={false} disabled={p.busy}
                        onClick={() => p.onEnregistrer?.(i)}>{tr("Enregistrer")}</Button>
                    )}
                    <Button kind="t" icon="trash" full={false} disabled={p.busy}
                      onClick={() => p.onSupprimer(i)}>{tr("Supprimer")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="tag tag-muted">{t('Poids total : {0} kg', { 0: total })}</span>
        {sansPoids && <span className="small muted">{tr("Les lignes sans poids ne comptent pas dans le total.")}</span>}
      </div>

      {p.admin && (
        <>
          <h4 style={{ marginBottom: 0, fontSize: 15 }}>{tr("Ajouter une ligne")}</h4>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            {champ(brouillon.nom, "Nom de l’article", '2 1 160px', (x) => setBrouillon({ ...brouillon, nom: x }))}
            {champ(brouillon.quantite, "Quantité", '1 1 80px', (x) => setBrouillon({ ...brouillon, quantite: x }), 'number')}
            {champ(brouillon.poids, "Poids (kg)", '1 1 90px', (x) => setBrouillon({ ...brouillon, poids: x }), 'number')}
            <Button icon="plus" full={false} disabled={p.busy || ajout} onClick={() => void ajouter()}>
              {tr(ajout ? 'Ajout…' : 'Ajouter')}
            </Button>
          </div>
        </>
      )}
    </>
  );
}

/** La photo du lot : prise ou choix, compression, envoi dans `fret-photos`. */

function PhotoLot({ expeditionId, photoInitiale, admin, onNotee }: {
  expeditionId: string;
  photoInitiale: string;
  admin: boolean;
  onNotee: (msg: string) => void;
}) {
  const { tr } = useI18n();
  const [photos, setPhotos] = useState([photoInitiale, '', '']);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    if (!supabase) {
      setErr('Connectez la base pour modifier les photos.');
      return;
    }
    void supabase.from('expeditions')
      .select('photo, photo2, photo3')
      .eq('id', expeditionId).single()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setErr('Chargement des photos impossible.');
          return;
        }
        setPhotos([data.photo ?? '', data.photo2 ?? '', data.photo3 ?? '']);
        setLoading(false);
      });
    return () => { alive = false; };
  }, [expeditionId]);

  const enregistrer = async (index: number, chemin: string) => {
    if (!supabase) return;
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.rpc('admin_photo_expedition', {
        p_id: expeditionId,
        p_position: index + 1,
        p_chemin: chemin,
      });
      if (error) throw error;
      setPhotos((old) => old.map((v, i) => i === index ? chemin : v));
      onNotee(chemin ? 'Photo du lot enregistrée.' : 'Photo du lot retirée.');
    } catch {
      setErr('Enregistrement impossible. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="stack">
      <h3 style={{ marginBottom: 0 }}>{tr("Photo du lot")} (3 max.)</h3>
      {err && <div role="alert" className="notice err">{tr(err)}</div>}
      {photos.map((photo, i) => (
        <fieldset key={i} disabled={loading ? true : busy}
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          className="stack">
          <legend>{tr("Photo du lot")} {i + 1}/3</legend>
          <StoredPhoto bucket="fret-photos" path={photo ? photo : undefined}
            label={tr("Photo du lot") + ' ' + (i + 1)} h={140} round={12} />
          {admin && !loading && (
            <>
              <FilePick label={tr("Photo du lot") + ' ' + (i + 1)}
                done={!!photo} bucket="fret-photos"
                onPick={(_img, chemin) => {
                  if (chemin) void enregistrer(i, chemin);
                }} />
              {photo && (
                <Button kind="t" icon="trash" disabled={busy}
                  onClick={() => void enregistrer(i, '')}>
                  {tr("Retirer la photo")}
                </Button>
              )}
            </>
          )}
        </fieldset>
      ))}
    </section>
  );
}

/** Création d'un compte voyageur manquant, depuis la fiche de création du lot. */
function NouveauVoyageur({ onCree, onFermer }: {
  onCree: (v: Voyageur) => void;
  onFermer: () => void;
}) {
  const { tr } = useI18n();
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [mdp, setMdp] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  const creer = async () => {
    setErr(null);
    if (!nom.trim()) { setErr('Indiquez le nom du voyageur.'); return; }
    setBusy(true);
    const r = await creerVoyageur({ nom, telephone, email });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setMdp(r.motDePasse ?? null);
    if (r.id) onCree({ id: r.id, nom: nom.trim(), email: email.trim() });
  };

  return (
    <>
      <h3 style={{ marginBottom: 0 }}>{tr("Ajouter un voyageur")}</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {tr("Crée un compte au nom du voyageur. Le mot de passe temporaire s’affiche ici : à vous de le lui transmettre.")}
      </p>
      <Field id="nv-nom" label={tr("Nom")} value={nom} onChange={setNom} req />
      <Field id="nv-tel" label={tr("Téléphone")} value={telephone} onChange={setTelephone} req
        hint={tr("Numéro utilisé pour se connecter.")} />
      <Field id="nv-email" label={tr("Adresse e-mail (facultatif)")} value={email} onChange={setEmail}
        hint={tr("Sert seulement à récupérer un mot de passe oublié.")} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="plus" full={false} disabled={busy} onClick={() => void creer()}>
          {tr(busy ? 'Création…' : 'Créer le compte')}
        </Button>
        <Button kind="t" icon="x" full={false} disabled={busy} onClick={onFermer}>{tr("Fermer")}</Button>
      </div>

      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}

      {mdp && (
        <div role="status" className="notice ok">
          <Icon name="check" size={20} sw={2} />
          <div>
            <strong>{tr("Mot de passe temporaire")}</strong>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 20, letterSpacing: 1, margin: '4px 0' }}>{mdp}</div>
            <div className="small">{tr("Notez-le maintenant : il ne sera plus affiché.")}</div>
            <div className="small">
              {tr("Transmettez-le au voyageur : il devra le changer après sa première connexion.")}
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <Button kind="s" icon="copy" full={false} onClick={() => {
                void navigator.clipboard?.writeText(mdp).then(() => setCopie(true)).catch(() => setCopie(false));
              }}>{tr(copie ? 'Copié' : 'Copier')}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Création d'une fiche de transitaire manquante, en trois champs. */
function NouveauTransitaire({ onCree, onFermer }: {
  onCree: (t: { id: string; nom: string }) => void;
  onFermer: () => void;
}) {
  const { tr } = useI18n();
  const { s } = useStore();
  const villes = s.cities.filter((c) => c.active);
  const [nom, setNom] = useState('');
  const [ville, setVille] = useState(villes[0]?.id ?? '');
  const [tel, setTel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const creer = async () => {
    setErr(null);
    if (!nom.trim()) { setErr('Saisissez le nom du transitaire.'); return; }
    const c = villes.find((x) => x.id === ville);
    setBusy(true);
    const r = await creerTransitaire({ nom, city: ville, lat: c?.lat ?? 0, lng: c?.lng ?? 0, tel });
    setBusy(false);
    if (r.error || !r.id) { setErr(r.error ?? 'La création de la fiche a échoué. Réessayez.'); return; }
    onCree({ id: r.id, nom: nom.trim() });
    onFermer();
  };

  return (
    <>
      <h3 style={{ marginBottom: 0 }}>{tr("Ajouter un transitaire")}</h3>
      <p className="small muted" style={{ margin: 0 }}>
        {tr("Crée une fiche de transitaire. Le nom en chinois reste à compléter plus tard, depuis la fiche complète.")}
      </p>
      <Field id="nt-nom" label={tr("Nom")} value={nom} onChange={setNom} req />
      <Select id="nt-ville" label={tr("Ville")} value={ville} onChange={setVille}
        options={villes.map((c) => ({ v: c.id, l: tr(cityName(c.id)) }))} req />
      <Field id="nt-tel" label={tr("Téléphone (facultatif)")} value={tel} onChange={setTel} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Button icon="plus" full={false} disabled={busy} onClick={() => void creer()}>
          {tr(busy ? 'Création…' : 'Créer la fiche')}
        </Button>
        <Button kind="t" icon="x" full={false} disabled={busy} onClick={onFermer}>{tr("Annuler")}</Button>
      </div>

      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
    </>
  );
}

/** Fiche d'un lot : champs modifiables, étapes posées, ajout d'étape, notes
    internes et suppression. */
function LotSheet({ lot, nomVoyageur, admin, transitaires, onClose, onSaved, onNotee, onTransitaireCree }: {
  lot: Expedition;
  nomVoyageur: string;
  admin: boolean;
  transitaires: { id: string; nom: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  /** Signale un changement SANS fermer la fiche (photo, lignes d'articles). */
  onNotee: (msg: string) => void;
  onTransitaireCree: (t: { id: string; nom: string }) => void;
}) {
  const { tr, t } = useI18n();
  const [conteneur, setConteneur] = useState(lot.conteneur);
  const [poids, setPoids] = useState(lot.poids);
  const [cbm, setCbm] = useState(lot.cbm == null ? '' : String(lot.cbm));
  const [providerId, setProviderId] = useState(lot.providerId ?? '');
  const [depart, setDepart] = useState(lot.departLe ?? '');
  const [arriveePrevue, setArriveePrevue] = useState(lot.arriveePrevue ?? '');
  const [arriveeLe, setArriveeLe] = useState(lot.arriveeLe ?? '');
  const [notes, setNotes] = useState<string | null>(null);
  const [etapes, setEtapes] = useState<Etape[] | null>(null);
  const [lignes, setLignes] = useState<Ligne[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [nouveauTransitaire, setNouveauTransitaire] = useState(false);

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
    void Promise.all([fetchNotes(lot.id), fetchEtapes(lot.id), fetchArticles(lot.id)]).then(([n, e, a]) => {
      if (!vivant) return;
      setNotes(n ?? '');
      setEtapes(e);
      setLignes(a.map(enLigne));
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
      id: lot.id, conteneur, poids,
      cbm: cbm.trim() === '' ? undefined : nombre(cbm),
      providerId: providerId || undefined,
      departLe: depart || null, arriveePrevue: arriveePrevue || null, arriveeLe: arriveeLe || null,
      notes: notes ?? undefined,
    });
    setBusy(null);
    if (error) { setErr(error); return; }
    onSaved('Lot modifié.');
  };

  /* --- les lignes d'articles : chacune part en base séparément --- */

  const patchLigne = (i: number, patch: Partial<Ligne>) =>
    setLignes((ls) => (ls ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const enregistrerLigne = async (i: number) => {
    const l = (lignes ?? [])[i];
    if (!l?.id) return;
    setErr(null); setBusy('ligne');
    const { error } = await majArticle({
      id: l.id, nom: l.nom, quantite: nombre(l.quantite) ?? 0, poids: nombre(l.poids),
    });
    setBusy(null);
    if (error) { setErr(error); return; }
    onNotee('Ligne d’article enregistrée.');
  };

  const supprimerLigne = async (i: number) => {
    const l = (lignes ?? [])[i];
    if (!l) return;
    setErr(null);
    if (!l.id) { setLignes((ls) => (ls ?? []).filter((_x, j) => j !== i)); return; }
    setBusy('ligne');
    const { error } = await supprimerArticle(l.id);
    setBusy(null);
    if (error) { setErr(error); return; }
    setLignes((ls) => (ls ?? []).filter((_x, j) => j !== i));
    onNotee('Ligne d’article supprimée.');
  };

  const ajouterLigne = async (l: Ligne): Promise<boolean> => {
    if (!l.nom.trim()) { setErr('Indiquez le nom de l’article.'); return false; }
    setErr(null); setBusy('ligne');
    const { id, error } = await ajouterArticle({
      expeditionId: lot.id, nom: l.nom.trim(), quantite: nombre(l.quantite) ?? 0, poids: nombre(l.poids),
    });
    setBusy(null);
    if (error) { setErr(error); return false; }
    setLignes((ls) => [...(ls ?? []), { ...l, id, nom: l.nom.trim() }]);
    onNotee('Ligne d’article ajoutée.');
    return true;
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
      <Field id="fr-cbm" label={tr("Nombre de mètres cubes (CBM)")} type="number" value={cbm} onChange={setCbm}
        placeholder="Non renseigné" hint={tr("Nombre de mètres cubes du lot, tel qu’annoncé par le transitaire.")} />
      <Select id="fr-transitaire" label={tr("Transitaire")} value={providerId} onChange={setProviderId}
        options={[{ v: '', l: tr("Aucun") }, ...transitaires.map((p) => ({ v: p.id, l: p.nom }))]} />
      {admin && !nouveauTransitaire && (
        <Button kind="s" icon="plus" full={false} onClick={() => setNouveauTransitaire(true)}>
          {tr("Ajouter un transitaire")}
        </Button>
      )}
      {nouveauTransitaire && (
        <NouveauTransitaire
          onFermer={() => setNouveauTransitaire(false)}
          onCree={(p) => { onTransitaireCree(p); setProviderId(p.id); onNotee('Transitaire ajouté et sélectionné pour ce lot.'); }} />
      )}
      <Field id="fr-depart" label={tr("Date de départ")} type="date" value={depart} onChange={setDepart} />
      <Field id="fr-prevue" label={tr("Arrivée prévue")} type="date" value={arriveePrevue} onChange={setArriveePrevue} />
      <Field id="fr-arrivee" label={tr("Arrivée réelle")} type="date" value={arriveeLe} onChange={setArriveeLe} />

      <PhotoLot expeditionId={lot.id} photoInitiale={lot.photo} admin={admin} onNotee={onNotee} />

      {lignes === null
        ? <p className="muted" role="status">{tr("Chargement…")}</p>
        : (
          <LignesArticles lignes={lignes} admin={admin} busy={busy !== null}
            onPatch={patchLigne} onSupprimer={(i) => void supprimerLigne(i)}
            onEnregistrer={(i) => void enregistrerLigne(i)}
            onAjouter={ajouterLigne} />
        )}

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
function NouveauLotSheet({ voyageurs, transitaires, onClose, onSaved, onVoyageurCree, onTransitaireCree }: {
  voyageurs: Voyageur[];
  transitaires: { id: string; nom: string }[];
  onClose: () => void;
  onSaved: (msg: string) => void;
  onVoyageurCree: (v: Voyageur) => void;
  onTransitaireCree: (t: { id: string; nom: string }) => void;
}) {
  const { tr, t } = useI18n();
  const [userId, setUserId] = useState('');
  const [fret, setFret] = useState<Fret>('sea');
  const [origine, setOrigine] = useState(ORIGINES[0]);
  const [providerId, setProviderId] = useState('');
  const [conteneur, setConteneur] = useState('');
  const [poids, setPoids] = useState('');
  const [cbm, setCbm] = useState('');
  const [photo, setPhoto] = useState('');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [depart, setDepart] = useState('');
  const [arriveePrevue, setArriveePrevue] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [nouveauVoyageur, setNouveauVoyageur] = useState(false);
  const [nouveauTransitaire, setNouveauTransitaire] = useState(false);

  useEffect(() => {
    document.getElementById('nl-voyageur')?.focus();
  }, []);

  const creer = async () => {
    if (!userId) { setErr('Choisissez le voyageur à qui appartient ce lot.'); return; }
    if (lignes.some((l) => !l.nom.trim())) { setErr('Indiquez le nom de chaque article.'); return; }
    setErr(null); setBusy(true);
    const { id, code, error } = await creerExpedition({
      userId, fret, origine, providerId: providerId || null, conteneur, poids,
      cbm: cbm.trim() === '' ? null : nombre(cbm), photo,
      departLe: depart || null, arriveePrevue: arriveePrevue || null, notes,
    });
    setBusy(false);
    if (error || !id) { setErr(error ?? 'La création du lot a échoué. Réessayez.'); return; }

    /* Les lignes d'articles ne peuvent être écrites qu'une fois le lot créé :
       elles ont besoin de son identifiant. */
    let echec = '';
    for (const l of lignes) {
      const r = await ajouterArticle({
        expeditionId: id, nom: l.nom.trim(), quantite: nombre(l.quantite) ?? 0, poids: nombre(l.poids),
      });
      if (r.error) { echec = r.error; break; }
    }
    onSaved(echec
      ? t('Lot {0} créé, mais les lignes d’article n’ont pas pu être enregistrées : {1}', { 0: code ?? '', 1: echec })
      : t('Lot {0} créé.', { 0: code ?? '' }));
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
      {!nouveauVoyageur && (
        <Button kind="s" icon="plus" full={false} onClick={() => setNouveauVoyageur(true)}>
          {tr("Ajouter un voyageur")}
        </Button>
      )}
      {nouveauVoyageur && (
        <NouveauVoyageur onFermer={() => setNouveauVoyageur(false)}
          onCree={(v) => { onVoyageurCree(v); setUserId(v.id); }} />
      )}
      <Select id="nl-fret" label={tr("Type de fret")} value={fret} onChange={(v) => setFret(v as Fret)}
        options={(Object.keys(FRET_LABEL) as Fret[]).map((f) => ({ v: f, l: tr(FRET_LABEL[f]) }))} />
      <Select id="nl-origine" label={tr("Ville d’origine")} value={origine} onChange={setOrigine}
        options={ORIGINES.map((o) => ({ v: o, l: o }))} />
      <Select id="nl-transitaire" label={tr("Transitaire")} value={providerId} onChange={setProviderId}
        options={[{ v: '', l: tr("Aucun") }, ...transitaires.map((p) => ({ v: p.id, l: p.nom }))]} />
      {!nouveauTransitaire && (
        <Button kind="s" icon="plus" full={false} onClick={() => setNouveauTransitaire(true)}>
          {tr("Ajouter un transitaire")}
        </Button>
      )}
      {nouveauTransitaire && (
        <NouveauTransitaire onFermer={() => setNouveauTransitaire(false)}
          onCree={(p) => { onTransitaireCree(p); setProviderId(p.id); }} />
      )}
      <Field id="nl-conteneur" label={tr(fret === 'air' ? 'Numéro AWB' : 'Numéro de conteneur')} value={conteneur} onChange={setConteneur} />
      <Field id="nl-poids" label={tr("Poids")} value={poids} onChange={setPoids} />
      <Field id="nl-cbm" label={tr("Nombre de mètres cubes (CBM)")} type="number" value={cbm} onChange={setCbm} />

      <h3 style={{ marginBottom: 0 }}>{tr("Photo du lot")}</h3>
      <StoredPhoto bucket="fret-photos" path={photo || undefined} label={tr("Photo du lot")} h={140} round={12} />
      <FilePick label={tr("Photo du lot")} done={!!photo} bucket="fret-photos"
        onPick={(_img, chemin) => setPhoto(chemin ?? '')} />

      <LignesArticles lignes={lignes} admin busy={busy}
        onPatch={(i, patch) => setLignes((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))}
        onSupprimer={(i) => setLignes((ls) => ls.filter((_x, j) => j !== i))}
        onAjouter={async (l) => {
          if (!l.nom.trim()) { setErr('Indiquez le nom de l’article.'); return false; }
          setErr(null);
          setLignes((ls) => [...ls, { ...l, nom: l.nom.trim() }]);
          return true;
        }} />

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

  /** Signale un changement SANS fermer la fiche ouverte (photo, lignes d'articles). */
  const notee = (msg: string) => { setErr(null); setOk(msg); void reload(); };

  /** Le nouveau compte voyageur rejoint la liste tout de suite : le lot peut
      être créé sans recharger la page. */
  const voyageurCree = (v: Voyageur) =>
    setVoyageurs((vs) => [...vs.filter((x) => x.id !== v.id), v].sort((a, b) => a.nom.localeCompare(b.nom)));

  const transitaireCree = (p: { id: string; nom: string }) =>
    setTransitaires((ps) => [...ps.filter((x) => x.id !== p.id), p].sort((a, b) => a.nom.localeCompare(b.nom)));

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
          transitaires={transitaires} onClose={() => setOpen(null)} onSaved={saved}
          onNotee={notee} onTransitaireCree={transitaireCree} />}
        {creation && <NouveauLotSheet voyageurs={voyageurs} transitaires={transitaires}
          onClose={() => setCreation(false)} onSaved={saved}
          onVoyageurCree={voyageurCree} onTransitaireCree={transitaireCree} />}
      </div>
    </>
  );
}