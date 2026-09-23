import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { Button, Field, Icon, StarInput, Stars, StoredPhoto, TextArea, useWide } from '../ui';
import { AdminCard, AdminSheet, SheetActions, SheetDanger } from './admin/mobile';
import { FilePick, MAX_PHOTOS } from './Contribute';
import { deleteReviewAsAdmin, fetchReviews, fetchReviewsForModeration, markHelpful, saveReview, setReviewStatus, type PendingReview, type Review } from '../lib/ratings';

/* Avis des voyageurs : note, commentaire, photos, « utile » (côté fiche) et
   modération (côté équipe). Les données vivent dans la table ratings, étendue
   par supabase/reviews.sql. */

/** Moyenne et nombre d'avis, calculés sur ce qui est affiché (donc à jour). */
function moyenne(avis: Review[]) {
  if (!avis.length) return { avg: 0, count: 0 };
  return { avg: avis.reduce((n, r) => n + r.stars, 0) / avis.length, count: avis.length };
}

function EtoilesAffichees({ n, size = 14 }: { n: number; size?: number }) {
  return <span className="row stars" style={{ gap: 2 }} aria-label={`${n} sur 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <span key={i} style={{ color: i <= n ? 'var(--gold-fill)' : 'var(--chip-border)' }}>
        <Icon name="star" size={size} sw={i <= n ? 0 : 1.8} fill={i <= n ? 'currentColor' : 'none'} />
      </span>
    ))}
  </span>;
}

/** Photos d'un avis (privées : URL signée). */
function PhotosAvis({ paths }: { paths: string[] }) {
  if (!paths.length) return null;
  return <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
    {paths.map((p, i) => <StoredPhoto key={p} path={p} label={`Photo ${i + 1}`} h={84} w={84} round={12} bucket="review-photos" />)}
  </div>;
}

/** Le bloc affiché dans la fiche d'un fournisseur. */
export function ReviewsSection({ providerId }: { providerId: string }) {
  const { tr } = useI18n();
  const { s } = useStore();
  const [avis, setAvis] = useState<Review[]>([]);
  const [stars, setStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const moi = s.user?.id;

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await fetchReviews(providerId, moi);
    setAvis(rows);
    const mien = rows.find((r) => r.mine);
    if (mien) { setStars(mien.stars); setComment(mien.comment); setPhotos(mien.photos); }
    setLoading(false);
  }, [providerId, moi]);

  useEffect(() => { void load(); }, [load]);

  const publies = useMemo(() => avis.filter((r) => r.status === 'published'), [avis]);
  const { avg, count } = useMemo(() => moyenne(publies), [publies]);
  const mien = avis.find((r) => r.mine) ?? null;

  const publier = async () => {
    if (!stars) { setErr('Choisissez une note de 1 à 5 étoiles.'); return; }
    setBusy(true); setErr(null); setOk(null);
    const { error } = await saveReview(providerId, { stars, comment, photos }, s.user?.name);
    setBusy(false);
    if (error) { setErr(error); return; }
    setOk(mien ? 'Votre avis est à jour.' : 'Merci, votre avis est publié.');
    await load();
  };

  const utile = async (r: Review) => {
    const { error } = await markHelpful(providerId, r.userId);
    if (error) { setErr(error); return; }
    await load();
  };

  return <>
    {count ? <Stars avg={avg} count={count} size={20} /> : <span className="small muted">{tr("Aucun avis pour le moment. Soyez le premier à raconter.")}</span>}

    <div className="card stack" style={{ gap: 10 }}>
      <span className="small muted" style={{ fontWeight: 700 }}>{tr(mien ? 'Votre avis' : 'Donnez votre avis')}</span>
      <StarInput value={stars} onChange={setStars} disabled={busy} />
      <TextArea id={`avis-${providerId}`} label="Ce que vous en pensez" value={comment} onChange={setComment} rows={3}
        placeholder="Prix pratiqués, qualité, accueil, minimum de commande…" hint="Votre avis est public, signé de votre nom." />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {photos.map((p, i) => <span key={p} style={{ position: 'relative' }}>
          <StoredPhoto path={p} label={`Photo ${i + 1}`} h={84} w={84} round={12} bucket="review-photos" />
          <button type="button" className="iconbtn" style={{ position: 'absolute', top: -6, right: -6 }} aria-label={tr(`Retirer la photo ${i + 1}`)}
            onClick={() => setPhotos((x) => x.filter((q) => q !== p))}><Icon name="trash" size={16} /></button>
        </span>)}
        {photos.length < MAX_PHOTOS && !busy && <FilePick label="Ajouter une photo" bucket="review-photos"
          onPick={(_, path) => { if (path) setPhotos((x) => [...x, path]); }} />}
      </div>
      {photos.length >= MAX_PHOTOS && <span className="small muted">{tr("3 photos au maximum.")}</span>}
      {err && <div className="notice danger"><Icon name="alert" size={20} /><div>{err}</div></div>}
      {ok && <div className="notice"><Icon name="check" size={20} /><div>{ok}</div></div>}
      <Button kind="p" icon="star" disabled={busy || !stars} onClick={() => void publier()}>
        {tr(busy ? 'Envoi…' : mien ? 'Mettre à jour mon avis' : 'Publier mon avis')}
      </Button>
    </div>

    {loading && <span className="small muted">{tr("Chargement des avis…")}</span>}

    {publies.filter((r) => !r.mine).map((r) => <div className="card stack" key={r.userId} style={{ gap: 8 }}>
      <div className="row" style={{ gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span className="row" style={{ gap: 8 }}>
          <Stars avg={r.stars} count={1} size={14} />
          <span style={{ fontWeight: 600 }}>{r.author}</span>
        </span>
        <span className="small muted">{r.date}</span>
      </div>
      {r.comment && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{r.comment}</p>}
      <PhotosAvis paths={r.photos} />
      <Button kind="s" icon="check" disabled={r.voted} onClick={() => void utile(r)}>
        {tr(r.voted ? `Vous avez trouvé cet avis utile (${r.helpful})` : `Utile (${r.helpful})`)}
      </Button>
    </div>)}

    {mien && <div className="notice"><Icon name={mien.status === 'hidden' ? 'alert' : 'user'} size={20} /><div>
      <div className="small muted" style={{ fontWeight: 700 }}>{tr("Votre avis")}</div>
      {mien.status === 'hidden' ? tr("Il a été masqué par l’équipe : il n’apparaît plus dans la fiche.") : tr("Il est publié et visible par les autres voyageurs.")}
    </div></div>}
  </>;
}

/* ---------------------------------------------------------------- */
/* Modération : équipe et administration                             */
/* ---------------------------------------------------------------- */

export function ReviewsAdmin() {
  const { tr } = useI18n();
  const wide = useWide();
  const [rows, setRows] = useState<PendingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<'all' | 'published' | 'hidden'>('all');
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    setRows(await fetchReviewsForModeration());
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const vues = useMemo(() => filtre === 'all' ? rows : rows.filter((r) => r.status === filtre), [rows, filtre]);
  const cle = (r: PendingReview) => `${r.providerId}|${r.userId}`;
  const ouverte = rows.find((r) => cle(r) === openRow) ?? null;

  const run = async (r: PendingReview, action: 'cache' | 'publié' | 'supprimé') => {
    setBusy(true); setErr(null);
    const { error } = action === 'supprimé'
      ? await deleteReviewAsAdmin(r.providerId, r.userId)
      : await setReviewStatus(r.providerId, r.userId, action === 'cache' ? 'hidden' : 'published', note);
    setBusy(false);
    if (error) { setErr(error); return; }
    setOpenRow(null); setNote('');
    await load();
  };

  return <>
    {err && <div className="notice danger"><Icon name="alert" size={20} /><div>{err}</div></div>}
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      {(['all', 'published', 'hidden'] as const).map((f) => <Button key={f} kind={filtre === f ? 'p' : 's'} full={false} onClick={() => setFiltre(f)}>
        {tr(f === 'all' ? 'Tous' : f === 'published' ? 'Publiés' : 'Masqués')}
      </Button>)}
      <span className="small muted" style={{ alignSelf: 'center' }}>{vues.length} avis</span>
    </div>

    {loading && <span className="small muted">{tr("Chargement des avis…")}</span>}
    {!loading && !vues.length && <div className="notice"><Icon name="star" size={20} /><div>{tr("Aucun avis à modérer pour le moment.")}</div></div>}

    {wide ? (
      <div className="table"><table>
        <thead><tr><th>{tr("Avis")}</th><th>{tr("Fiche")}</th><th>{tr("Utile")}</th><th>{tr("État")}</th><th>{tr("Date")}</th><th>{tr("Actions")}</th></tr></thead>
        <tbody>{vues.map((r) => <tr key={cle(r)}>
          <td>
            <div className="row" style={{ gap: 8 }}><EtoilesAffichees n={r.stars} /><strong>{r.author}</strong></div>
            {r.comment && <div className="small muted">{r.comment.slice(0, 90)}{r.comment.length > 90 ? '…' : ''}</div>}
            {r.photos.length ? <div className="small muted">{r.photos.length} photo(s)</div> : null}
          </td>
          <td>{r.providerName}</td>
          <td>{r.helpful}</td>
          <td><span className={`tag ${r.status === 'hidden' ? 'tag-warn' : ''}`}>{tr(r.status === 'hidden' ? 'Masqué' : 'Publié')}</span></td>
          <td className="small muted">{r.date}</td>
          <td><div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {r.status === 'hidden'
              ? <Button kind="s" full={false} onClick={() => void run(r, 'publié')}>{tr("Republier")}</Button>
              : <Button kind="s" full={false} onClick={() => void run(r, 'cache')}>{tr("Masquer")}</Button>}
            <Button kind="s" full={false} icon="trash" onClick={() => void run(r, 'supprimé')}>{tr("Supprimer")}</Button>
          </div></td>
        </tr>)}</tbody>
      </table></div>
    ) : (
      <div className="stack" style={{ gap: 10 }}>
              {vues.map((r) => <AdminCard key={cle(r)} onOpen={() => { setOpenRow(cle(r)); setNote(''); }}
                ariaLabel={`Ouvrir l’avis de ${r.author}`}
                title={r.author} sub={`${r.providerName} · ${r.date}`} toneSeed={r.author}
                badge={<span className="row" style={{ gap: 8, flexWrap: 'wrap' }}><EtoilesAffichees n={r.stars} size={12} />
                  <span className={`tag ${r.status === 'hidden' ? 'tag-warn' : ''}`}>{tr(r.status === 'hidden' ? 'Masqué' : 'Publié')}</span></span>} />
              )}
            </div>
          )}

          {ouverte && <AdminSheet title={tr("Avis de ") + ouverte.author} sub={`${ouverte.providerName} · ${ouverte.date}`} onClose={() => setOpenRow(null)}>
            <div className="stack" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                <EtoilesAffichees n={ouverte.stars} size={18} />
                <span className="small muted">{ouverte.helpful} « utile »</span>
              </div>
              {ouverte.comment ? <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ouverte.comment}</p> : <span className="small muted">{tr("Aucun commentaire.")}</span>}
              <PhotosAvis paths={ouverte.photos} />
              {ouverte.status === 'hidden' && <div className="notice"><Icon name="alert" size={20} /><div>{tr("Cet avis est masqué : il ne compte plus dans la moyenne.")}</div></div>}
              <Field id="motif-avis" label="Motif de la modération (facultatif)" value={note} onChange={setNote} hint="Visible de l’équipe seulement." />
              <SheetActions>
                {ouverte.status === 'hidden'
                  ? <Button kind="p" icon="check" disabled={busy} onClick={() => void run(ouverte, 'publié')}>{tr("Republier l’avis")}</Button>
                  : <Button kind="s" icon="eye" disabled={busy} onClick={() => void run(ouverte, 'cache')}>{tr("Masquer l’avis")}</Button>}
                <Link className="btn btn-s" to={`/fiche/${ouverte.providerId}`}><Icon name="compass" size={20} />{tr("Voir la fiche")}</Link>
                <SheetDanger>{tr("Supprimer définitivement cet avis ?")}</SheetDanger>
                <Button kind="d" icon="trash" disabled={busy} onClick={() => void run(ouverte, 'supprimé')}>
                  {tr(busy ? 'Suppression…' : 'Supprimer l’avis')}
                </Button>
              </SheetActions>
            </div>
          </AdminSheet>}
  </>;
}

/** Écran de modération, affiché dans l'espace équipe (AdminLayout). */
export function ReviewsAdminPage() {
  const { tr } = useI18n();
  return <>
    <header className="admin-head">
      <div>
        <h1>{tr("Avis des voyageurs")}</h1>
        <div className="muted" style={{ marginTop: 4 }}>{tr("Un avis masqué disparaît de la fiche et ne compte plus dans la moyenne.")}</div>
      </div>
    </header>
    <div className="admin-body" style={{ gap: 18 }}>
      <section className="card stack" style={{ gap: 12 }}>
        <ReviewsAdmin />
      </section>
    </div>
  </>;
}