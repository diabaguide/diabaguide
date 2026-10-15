import { Component, type ErrorInfo, type ReactNode } from 'react';
import { signalerErreur } from './lib/erreursJournal';

/* Dernier filet de sécurité : si un écran plante, le voyageur voit une page claire avec un bouton pour
   recharger, au lieu d'une page blanche. L'erreur est signalée à l'équipe (journal des erreurs).
   Ce composant n'utilise ni le magasin ni les traductions de l'application, qui peuvent être la cause du plantage :
   les quatre langues sont écrites ici, choisies d'après la langue enregistrée sur l'appareil. */

const TEXTES: Record<string, { titre: string; texte: string; recharger: string; accueil: string }> = {
  fr: { titre: 'Une erreur est survenue', texte: 'Rechargez la page. Si le problème continue, prévenez l’équipe Diaba Guide.', recharger: 'Recharger la page', accueil: 'Retour à l’accueil' },
  en: { titre: 'Something went wrong', texte: 'Reload the page. If the problem continues, let the Diaba Guide team know.', recharger: 'Reload the page', accueil: 'Back to home' },
  zh: { titre: '出现了错误', texte: '请刷新页面。如果问题仍然存在，请告知 Diaba Guide 团队。', recharger: '刷新页面', accueil: '返回首页' },
  ar: { titre: 'حدث خطأ', texte: 'أعد تحميل الصفحة. إذا استمرت المشكلة فأبلغ فريق Diaba Guide.', recharger: 'إعادة تحميل الصفحة', accueil: 'العودة إلى الرئيسية' },
};

function langue(): string {
  try {
    const l = JSON.parse(localStorage.getItem('diaba-guide-state-v1') ?? '{}').lang;
    return l in TEXTES ? l : 'fr';
  } catch { return 'fr'; }
}

interface Etat { erreur: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, Etat> {
  state: Etat = { erreur: null };
  static getDerivedStateFromError(erreur: Error): Etat { return { erreur }; }
  componentDidCatch(erreur: Error, info: ErrorInfo) {
    signalerErreur(erreur, `écran : ${(info.componentStack ?? '').split('\n').slice(0, 3).join(' ').trim()}`);
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    const l = langue();
    const t = TEXTES[l];
    return (
      <div role="alert" dir={l === 'ar' ? 'rtl' : 'ltr'}
        style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F3F6FD', color: '#12203F', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ maxWidth: 420, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{t.titre}</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.5 }}>{t.texte}</p>
          <button type="button" onClick={() => location.reload()}
            style={{ minHeight: 52, borderRadius: 14, border: 0, background: '#153E9F', color: '#fff', fontSize: 17, fontWeight: 700, cursor: 'pointer' }}>{t.recharger}</button>
          <a href="/accueil" style={{ color: '#153E9F', fontWeight: 600 }}>{t.accueil}</a>
        </div>
      </div>
    );
  }
}
