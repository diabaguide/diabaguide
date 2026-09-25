import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Sécurité : interdire un build de production sans Supabase configuré.
  // Sans Supabase, l'app utilise une authentification fictive (mode démo)
  // où n'importe quelle adresse e-mail donne accès — inacceptable en prod.
  // Vercel injecte les variables dans process.env ; en local, Vite les lit
  // depuis .env. La compilation exige les deux valeurs dans les deux cas.
  if (mode === 'production') {
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
      throw new Error(
        '[Diaba Guide] ERREUR DE SÉCURITÉ : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ' +
        'sont obligatoires en production. Configurez ces variables dans Vercel → Settings → ' +
        'Environment Variables avant de déployer.',
      );
    }
  }

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo.png'],
        manifest: {
          name: 'Diaba Guide',
          short_name: 'Diaba Guide',
          description: 'Votre guide pour le sourcing en Chine',
          theme_color: '#153E9F',
          icons: [
            {
              src: 'logo.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'logo.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}']
        }
      })
    ]
  };
});

