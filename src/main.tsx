import { I18nProvider } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/gloock';
import './styles.css';
import './sceau.css';

import { registerSW } from 'virtual:pwa-register';

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
        <App />
      </BrowserRouter>
      </I18nProvider>
    </StoreProvider>
  </StrictMode>,
);
