import { useI18n } from '../../../i18n';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { compressImage } from '../../../lib/image';
import { photoUrl, removePhoto, uploadPhoto } from '../../../lib/photos';
import { Button, Field, Icon } from '../../../ui';
import {
  createExpeditionArticle, deleteExpeditionArticle, updateExpeditionArticle, updateExpeditionPhoto,
  type Expedition, type ExpeditionArticle,
} from '../../../lib/fret';
import { toNum, type Notifier } from './shared';

/** Photo privée du lot (bucket fret-photos), visible uniquement par l'équipe fret. */
export function PhotoSection({ exp, setErr, setOk, reload }: { exp: Expedition } & Notifier) {
  const { tr, t } = useI18n();
  const [photoSrc, setPhotoSrc] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setPhotoSrc(null);
    if (exp?.photo) void photoUrl(exp.photo, 3600, 'fret-photos').then((url) => { if (active) setPhotoSrc(url); });
    return () => { active = false; };
  }, [exp?.photo]);

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

  return (
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
  );
}

/** Articles détaillés du lot : ajout, modification, suppression. */
export function ArticlesSection({ code, articles, setErr, setOk, reload }: { code: string; articles: ExpeditionArticle[] } & Notifier) {
  const { tr, t } = useI18n();
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

  return (
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
  );
}
