import { I18nProvider } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './store';
import './styles.css';

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
