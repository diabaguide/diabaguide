import { readFile } from 'node:fs/promises';

const files = {
  ui: await readFile(new URL('../src/ui.tsx', import.meta.url), 'utf8'),
  home: await readFile(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8'),
  styles: await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
};

const navBlock = files.ui.slice(files.ui.indexOf('const NAV:'), files.ui.indexOf('export function BottomNav'));

const checks = [
  ['navigation principale limitée à cinq destinations', () => (navBlock.match(/\n  \{ to: /g) ?? []).length === 5],
  ['navigation contient Mes achats', () => navBlock.includes("to: '/liste-achats', label: 'Mes achats'")],
  ['navigation contient Profil', () => navBlock.includes("to: '/profil', label: 'Profil'")],
  ['accueil contient les actions prioritaires', () => ['Trouver une adresse', 'Préparer mes achats', 'Suivre un envoi', 'Près de moi'].every((v) => files.home.includes(v))],
  ['navigation accessible au clavier', () => files.styles.includes('.bottomnav a:focus-visible')],
  ['mise en page des petits écrans', () => files.styles.includes('@media (max-width: 390px)')],
  ['routes métier conservées', () => ['/accueil', '/recherche', '/mes-envois', '/liste-achats', '/profil'].every((v) => files.app.includes(`path="${v}"`))],
];

const failed = checks.filter(([, test]) => !test());
for (const [label] of checks) console.log(`${failed.some(([name]) => name === label) ? 'FAIL' : 'PASS'} ${label}`);
if (failed.length) process.exit(1);
console.log(`\n${checks.length} contrôles UI voyageur validés.`);
