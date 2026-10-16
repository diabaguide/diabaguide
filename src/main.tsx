import { I18nProvider } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store';
import { ModuleProvider } from './lib/modules';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/600.css';
// Polices chinoise et arabe servies par le site (Google Fonts est bloqué en Chine continentale).
// La police chinoise est découpée par plages de caractères : seuls les morceaux utilisés sont téléchargés.
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/700.css';
import '@fontsource/noto-sans-arabic/400.css';
import '@fontsource/noto-sans-arabic/700.css';
import './styles.css';
import './sceau.css';

import { registerSW } from 'virtual:pwa-register';

// Une ancienne page peut encore référencer un chunk supprimé après une mise à
// jour PWA. Vite émet cet événement avant l’échec : un unique rechargement
// récupère le nouvel index et ses nouveaux noms de fichiers, sans boucle.
const PRELOAD_RECOVERY_KEY = 'diabaPreloadRecoveryAt';
window.addEventListener('vite:preloadError', (event) => {
  let lastRecovery = Number(history.state?.[PRELOAD_RECOVERY_KEY] ?? 0);
  try { lastRecovery = Math.max(lastRecovery, Number(sessionStorage.getItem(PRELOAD_RECOVERY_KEY) ?? 0)); } catch { /* stockage indisponible */ }
  if (Date.now() - lastRecovery < 10_000) return;

  const recoveryAt = Date.now();
  let guardPersisted = false;
  try {
    history.replaceState({ ...(history.state ?? {}), [PRELOAD_RECOVERY_KEY]: recoveryAt }, '');
    guardPersisted = true;
  } catch { /* historique indisponible */ }
  try {
    sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(recoveryAt));
    guardPersisted = true;
  } catch { /* stockage indisponible */ }
  if (!guardPersisted) return;

  event.preventDefault();
  location.reload();
});

const updateSW = registerSW({
  onNeedRefresh() {
    // Demander à l'utilisateur s'il veut recharger pour la nouvelle version
    if (confirm('Une nouvelle version de Diaba Guide est disponible. Recharger ?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('L\'application est prête pour un usage hors-ligne.');
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <I18nProvider>
      <BrowserRouter>
        <ModuleProvider>
          <App />
        </ModuleProvider>
      </BrowserRouter>
      </I18nProvider>
    </StoreProvider>
  </StrictMode>,
);
