import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { Button, Icon } from '../ui';
import type { IconName } from '../icons';
import { LANGS } from './Access';

/* Visite guidée du premier lancement : la langue d'abord, puis trois écrans qui disent à quoi sert
   l'application. Elle s'affiche une seule fois (les personnes qui ont déjà utilisé l'application ne
   la voient pas) et se rouvre depuis le profil (« Revoir la présentation »). */

const ETAPES: { icon: IconName; titre: string; texte: string }[] = [
  { icon: 'search', titre: 'Trouvez les bonnes adresses', texte: 'Marchés, hôtels et restaurants à Guangzhou et Shenzhen, vérifiés par l’équipe. Montrez l’adresse en chinois à votre chauffeur, ou appelez le lieu en un geste.' },
  { icon: 'list', titre: 'Préparez vos achats', texte: 'Créez une liste de produits, ajoutez les lieux à visiter et partagez-la par WhatsApp.' },
  { icon: 'box', titre: 'Suivez vos envois', texte: 'Annoncez vos colis, suivez-les de la Chine jusqu’à Dakar, et créez votre carte d’expédition à coller sur vos marchandises.' },
];
/** Écran de la langue + les écrans de présentation. */
const TOTAL = ETAPES.length + 1;

export function PremiereVisite() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const [i, setI] = useState(0);
  const suivant = useRef<HTMLButtonElement>(null);
  const fin = () => d({ t: 'tour', v: true });

  useEffect(() => { suivant.current?.focus(); }, [i]);
  useEffect(() => {
    if (s.tourDone) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') d({ t: 'tour', v: true }); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [s.tourDone, d]);

  if (s.tourDone) return null;
  const etape = i > 0 ? ETAPES[i - 1] : null;
  const dernier = i === TOTAL - 1;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label={tr("Bienvenue sur Diaba Guide")}>
      <div className="tour-card">
        <div className="tour-dots" role="img" aria-label={`${i + 1} / ${TOTAL}`}>
          {Array.from({ length: TOTAL }).map((_, n) => <span key={n} className={n === i ? 'on' : n < i ? 'fait' : ''} />)}
        </div>

        {!etape ? (
          <div className="stack" style={{ gap: 14 }}>
            <span className="tour-ico"><Icon name="globe" size={34} /></span>
            <h2 className="display">Bienvenue · Welcome · 欢迎 · مرحبًا</h2>
            <p>{tr("Choisissez votre langue. Vous pourrez la changer à tout moment dans le profil.")}</p>
            <div className="tour-langs" role="group" aria-label={tr("Langue")}>
              {LANGS.map((x) => (
                <button key={x.v} type="button" className={s.lang === x.v ? 'on' : ''} aria-pressed={s.lang === x.v}
                  lang={x.v === 'zh' ? 'zh-Hans' : x.v} onClick={() => d({ t: 'lang', v: x.v })}>
                  <span aria-hidden="true">{x.flag}</span> {x.l}{s.lang === x.v && <Icon name="check" size={18} sw={2.6} />}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            <span className="tour-ico"><Icon name={etape.icon} size={34} /></span>
            <h2 className="display">{tr(etape.titre)}</h2>
            <p>{tr(etape.texte)}</p>
          </div>
        )}

        <div className="tour-actions">
          {i > 0
            ? <Button kind="t" full={false} onClick={() => setI(i - 1)}>{tr("Précédent")}</Button>
            : <Button kind="t" full={false} onClick={fin}>{tr("Passer")}</Button>}
          <span style={{ flex: 1 }} />
          {i > 0 && !dernier && <Button kind="t" full={false} onClick={fin}>{tr("Passer")}</Button>}
          <button ref={suivant} type="button" className="btn btn-p" onClick={() => (dernier ? fin() : setI(i + 1))}>
            <span>{tr(dernier ? 'Commencer' : 'Suivant')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
