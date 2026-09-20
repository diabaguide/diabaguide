import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Sécurité : interdire un build de production sans Supabase configuré.
  // Sans Supabase, l'app utilise une authentification fictive (mode démo)
  // où n'importe quelle adresse e-mail donne accès — inacceptable en prod.
  // Note : on lit process.env directement (pas loadEnv) car Vercel injecte
  // les variables dans process.env, pas dans des fichiers .env.
  if (mode === 'production') {
    if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_ANON_KEY) {
      throw new Error(
        '[Diaba Guide] ERREUR DE SÉCURITÉ : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ' +
        'sont obligatoires en production. Configurez ces variables dans Vercel → Settings → ' +
        'Environment Variables avant de déployer.',
      );
    }
  }

  return { plugins: [react()] };
});

