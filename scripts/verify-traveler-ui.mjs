import { readFile } from 'node:fs/promises';

const files = {
  ui: await readFile(new URL('../src/ui.tsx', import.meta.url), 'utf8'),
  home: await readFile(new URL('../src/pages/Home.tsx', import.meta.url), 'utf8'),
  search: await readFile(new URL('../src/pages/Search.tsx', import.meta.url), 'utf8'),
  fiche: await readFile(new URL('../src/pages/Fiche.tsx', import.meta.url), 'utf8'),
  suivi: await readFile(new URL('../src/pages/Suivi.tsx', import.meta.url), 'utf8'),
  fret: await readFile(new URL('../src/pages/Fret.tsx', import.meta.url), 'utf8'),
  shopping: await readFile(new URL('../src/pages/Shopping.tsx', import.meta.url), 'utf8'),
  styles: await readFile(new URL('../src/styles.css', import.meta.url), 'utf8'),
  app: await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
};

const [catalog] = await Promise.all([
  readFile(new URL('../src/i18n/messages.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const translatedTravelerCopy = ['Mes achats', 'Actions rapides', 'Que voulez-vous faire ?', 'Trouver une adresse', 'Préparer mes achats', 'Suivre un envoi', 'Près de moi', 'Votre guide du voyageur', 'Trouvez les bonnes adresses, simplement.', 'Progression des achats', 'Progression du lot'];
const navBlock = files.ui.slice(files.ui.indexOf('const NAV:'), files.ui.indexOf('export function BottomNav'));

const checks = [
  ['navigation principale limitée à cinq destinations', () => (navBlock.match(/\n  \{ to: /g) ?? []).length === 5],
  ['navigation contient Mes achats', () => navBlock.includes("to: '/liste-achats', label: 'Mes achats'")],
  ['navigation contient Profil', () => navBlock.includes("to: '/profil', label: 'Profil'")],
  ['accueil contient les actions prioritaires', () => ['Trouver une adresse', 'Préparer mes achats', 'Suivre un envoi', 'Près de moi'].every((v) => files.home.includes(v))],
  ['navigation accessible au clavier', () => files.styles.includes('.bottomnav a:focus-visible')],
  ['mise en page des petits écrans', () => files.styles.includes('@media (max-width: 390px)')],
  ['recherche persistante sur mobile', () => files.styles.includes('.search-head { position: sticky;')],
  ['application des filtres accessible sur mobile', () => files.search.includes('className="filter-apply"') && files.styles.includes('.filter-apply { position: sticky;')],
  ['contact accessible depuis les résultats', () => files.search.includes('className="rcard-contact"') && files.search.includes('/contact')],
  ['actions principales visibles avant les avis sur une fiche', () => files.fiche.includes('className="stack" style={{ order: 2 }}') && files.fiche.includes('title={tr("Avis des voyageurs")}') && files.styles.includes('.fiche-side { display: contents;')],
  ['progression des achats visible dans une liste', () => files.shopping.includes('className="shopping-progress"') && files.shopping.includes('aria-label={tr("Progression des achats")}') && files.styles.includes('.shopping-progress')],
  ['partage du suivi public accessible', () => files.suivi.includes('className="tracking-share card') && files.suivi.includes('navigator.share') && files.suivi.includes('Copier le lien')],
  ['envois prioritaires avant les formulaires fret', () => files.fret.includes('mes-envois-main') && files.fret.includes('freight-tracking') && files.fret.includes('freight-estimate') && files.styles.includes('.mes-envois-main .freight-public-tracking { order: 1;')],
  ['progression visible sur les lots suivis', () => files.fret.includes('className="lot-progress') && files.fret.includes('aria-valuenow={progression}') && files.styles.includes('.lot-progress')],
  ['prochaine étape visible sur les lots suivis', () => files.fret.includes('lot-next-step') && files.fret.includes('prochaineEtapeType') && files.fret.includes('Prochaine étape')],
  ['accès public au suivi depuis Mes envois', () => files.fret.includes('freight-public-tracking') && files.fret.includes('to="/suivi"') && files.fret.includes('Suivre un envoi')],
  ['routes métier conservées', () => ['/accueil', '/recherche', '/mes-envois', '/liste-achats', '/profil'].every((v) => files.app.includes(`path="${v}"`))],
  ['nouveaux libellés traduits', () => translatedTravelerCopy.every((key) => catalog[key]?.en && catalog[key]?.zh && catalog[key]?.ar)],
];

const failed = checks.filter(([, test]) => !test());
for (const [label] of checks) console.log(`${failed.some(([name]) => name === label) ? 'FAIL' : 'PASS'} ${label}`);
if (failed.length) process.exit(1);
console.log(`\n${checks.length} contrôles UI voyageur validés.`);
