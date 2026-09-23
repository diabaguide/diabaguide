import { useEffect, type ReactNode } from 'react';
import { useI18n } from '../../i18n';
import { Icon } from '../../ui';

/* ==================================================================== */
/* Listes d'administration sur téléphone                                */
/*                                                                      */
/* Les tableaux de l'administration sont rognés et non défilables sous  */
/* 1024 px (styles.css : .table { overflow: hidden }, .table.dense {    */
/* overflow: clip }) : les dernières colonnes y sont inatteignables.    */
/* Sous ce seuil, une carte cliquable par ligne remplace le tableau et  */
/* ouvre la fiche de l'élément en édition (AdminSheet).                 */
/* ==================================================================== */

/* Pastilles d'initiales : teinte déduite du texte, donc stable d'un
   affichage à l'autre. */
const AVATAR_TONES = ['#F3C6CE', '#CFC6F3', '#BFD8F5', '#BEE3D0', '#F5DFB8', '#C9D6EE'];

export const initiales = (s: string) => {
  const mots = (s || '?').trim().split(/\s+/).filter(Boolean);
  const a = mots[0]?.[0] ?? '?';
  const b = mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? '');
  return (a + b).toUpperCase();
};

export const teinte = (s: string) => AVATAR_TONES[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % AVATAR_TONES.length];

/** Carte cliquable d'une liste d'administration. Toute la carte est un
    bouton : accessible au clavier et au lecteur d'écran. */
export function AdminCard({ title, sub, thumb, badge, toneSeed, onOpen, ariaLabel }: {
  title: ReactNode;
  sub?: ReactNode;
  /** Vignette (photo) : remplace la pastille d'initiales. */
  thumb?: ReactNode;
  /** Badge affiché avant le chevron (statut, rôle, alerte). */
  badge?: ReactNode;
  /** Texte dont on déduit les initiales et la teinte de la pastille. */
  toneSeed?: string;
  onOpen: () => void;
  ariaLabel?: string;
}) {
  return (
    <button type="button" className="acard" onClick={onOpen} aria-label={ariaLabel}>
      {thumb ?? (toneSeed !== undefined && (
        <span className="acard-av" style={{ background: teinte(toneSeed) }} aria-hidden="true">{initiales(toneSeed)}</span>
      ))}
      <span className="acard-main">
        <span className="acard-name">{title}</span>
        {sub != null && <span className="acard-sub">{sub}</span>}
        {badge != null && <span className="acard-tags">{badge}</span>}
      </span>
      <Icon name="chevR" size={22} sw={2.2} />
    </button>
  );
}

/** Une carte sans fiche à ouvrir (aucune action disponible) : non cliquable. */
export function AdminCardStatic({ title, sub, thumb, toneSeed, badge }: {
  title: ReactNode; sub?: ReactNode; thumb?: ReactNode; toneSeed?: string; badge?: ReactNode;
}) {
  return (
    <div className="acard static">
      {thumb ?? (toneSeed !== undefined && (
        <span className="acard-av" style={{ background: teinte(toneSeed) }} aria-hidden="true">{initiales(toneSeed)}</span>
      ))}
      <span className="acard-main">
        <span className="acard-name">{title}</span>
        {sub != null && <span className="acard-sub">{sub}</span>}
        {badge != null && <span className="acard-tags">{badge}</span>}
      </span>
    </div>
  );
}

/** Fiche de l'élément, en superposition : fenêtre centrée sur ordinateur,
    plein écran sous 1024 px (voir .asheet dans styles.css). Fermeture par
    la croix, le clic hors de la fiche ou la touche Échap. */
export function AdminSheet({ title, sub, onClose, children }: {
  title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode;
}) {
  const { tr } = useI18n();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay aoverlay" onClick={onClose}>
      <div className="dialog asheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
            {sub != null && <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{sub}</div>}
          </div>
          <button type="button" className="iconbtn" aria-label={tr("Fermer")} onClick={onClose}>
            <Icon name="x" size={22} sw={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Bloc d'actions d'une fiche, séparé du reste par un filet. */
export const SheetActions = ({ children }: { children: ReactNode }) => <div className="aactions">{children}</div>;

/** Bandeau d'avertissement d'une fiche (suppression, action irréversible). */
export const SheetDanger = ({ children }: { children: ReactNode }) => <h3 className="a-danger">{children}</h3>;