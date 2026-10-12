import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Icon, Screen, TopBar } from '../ui';
import { fetchAnnonce, fetchAnnonces, fetchContactEquipe, lienContactEquipe, type Annonce } from '../lib/annonces';
import { photoUrl } from '../lib/photos';

/** Lien d'action : seulement http(s), jamais javascript: ni autre schéma. */
export const lienSur = (url: string | null | undefined) => (url && /^https?:\/\//i.test(url.trim()) ? url.trim() : null);

/** 2026-09-24 → 24/09/2026 */
const dateCourte = (d: string) => d.split('-').reverse().join('/');

/** Image d'une annonce, au format bandeau 16:9. Sans image : un décor aux couleurs de la marque. */
export function AnnonceImage({ path, alt = '', eager = false }: { path: string | null; alt?: string; eager?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    if (!path) return;
    if (/^(data:|https?:)/i.test(path)) { setUrl(path); return; }
    void photoUrl(path, undefined, 'annonces-photos').then((u) => { if (live) setUrl(u); });
    return () => { live = false; };
  }, [path]);
  return (
    <div className="annonce-img" aria-hidden={alt ? undefined : true}>
      {url
        ? <img src={url} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
        : <span className="annonce-img-deco"><Icon name="send" size={44} /></span>}
    </div>
  );
}

/** L'annonce du tableau de bord : avec une image, l'image est la carte (elle porte déjà son titre et son bouton) ;
    sans image, une carte de texte aux couleurs de la marque. Toute la carte est cliquable. */
function AnnonceCarte({ a }: { a: Annonce }) {
  const { tr } = useI18n();
  const nom = `${tr(a.titre)} — ${tr("Voir l’annonce")}`;
  if (a.imagePath) {
    return (
      <Link to={`/annonces/${a.id}`} className="annonce-banniere" aria-label={nom}>
        <AnnonceImage path={a.imagePath} alt={a.titre} eager />
      </Link>
    );
  }
  return (
    <Link to={`/annonces/${a.id}`} className="annonce-card" aria-label={nom}>
      <div className="annonce-body">
        <h3 className="display">{tr(a.titre)}</h3>
        <p>{tr(a.texte)}</p>
        <span className="annonce-cta">{tr("Voir l’annonce")}<Icon name="chevR" size={18} sw={2.4} /></span>
      </div>
    </Link>
  );
}

/* Annonce de service rédigée par l'équipe (console : /equipe/annonces). Une seule est montrée : la plus
   récemment modifiée parmi celles que la base rend (actives et dans leur période). La section disparaît
   d'elle-même quand il n'y a rien à montrer, et l'échec d'un chargement ne casse pas l'accueil. */
export function AnnoncesDiaba() {
  const { tr } = useI18n();
  const [annonce, setAnnonce] = useState<Annonce | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAnnonces().then((liste) => { if (alive) setAnnonce(liste[0] ?? null); });
    return () => { alive = false; };
  }, []);
  if (!annonce) return null;
  return (
    <section className="annonce-section" aria-label={tr("Annonce de Diaba Guide")}>
      <AnnonceCarte a={annonce} />
    </section>
  );
}

/** Page d'une annonce : image, description complète, lien d'action et contact de l'équipe. */
export function AnnonceDetail() {
  const { tr } = useI18n();
  const { id } = useParams();
  const { s } = useStore();
  const [annonce, setAnnonce] = useState<Annonce | null | undefined>(undefined);
  const [contact, setContact] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setAnnonce(undefined);
    void Promise.all([id ? fetchAnnonce(id) : Promise.resolve(null), fetchContactEquipe()]).then(([a, c]) => {
      if (!live) return;
      setAnnonce(a); setContact(c);
    });
    return () => { live = false; };
  }, [id]);
  const admin = s.user?.role === 'admin';

  return (
    <Screen>
      <TopBar title={tr("Annonce")} back="/accueil" />
      <div className="main annonce-detail" style={{ gap: 16 }}>
        {annonce === undefined && <p className="muted" role="status">{tr("Chargement…")}</p>}
        {annonce === null && (
          <div role="status" className="notice">
            <Icon name="info" size={20} />
            <span>{tr("Cette annonce n’est plus disponible.")} <Link className="link" to="/accueil">{tr("Retour à l’accueil")}</Link></span>
          </div>
        )}
        {annonce && (
          <>
            <AnnonceImage path={annonce.imagePath} alt={annonce.titre} eager />
            <div className="stack" style={{ gap: 10 }}>
              <h2 className="display" style={{ fontSize: 26, margin: 0 }}>{tr(annonce.titre)}</h2>
              {annonce.finLe && <div className="small muted"><Icon name="clock" size={16} /> {tr("Valable jusqu’au")} {dateCourte(annonce.finLe)}</div>}
              <p style={{ fontSize: 17, margin: 0, whiteSpace: 'pre-line' }}>{tr(annonce.texte)}</p>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              {contact
                ? <Button href={lienContactEquipe(contact, annonce.titre)} icon="chat">{tr("Contacter l’équipe Diaba Guide")}</Button>
                : (
                  <div role="status" className="notice warn">
                    <Icon name="info" size={20} />
                    <span>{tr("Le contact de l’équipe n’est pas encore renseigné.")}{admin && <> <Link className="link" to="/equipe/annonces">{tr("Le saisir dans la console")}</Link></>}</span>
                  </div>
                )}
              {lienSur(annonce.lienUrl) && <Button kind="s" href={lienSur(annonce.lienUrl) as string} icon="link">{tr(annonce.lienLibelle || 'En savoir plus')}</Button>}
              <p className="small muted" style={{ margin: 0 }}>{tr("Pour en savoir plus, écrivez à l’équipe : le message est déjà prêt dans WhatsApp.")}</p>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
