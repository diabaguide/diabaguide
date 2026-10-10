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
  main: await readFile(new URL('../src/main.tsx', import.meta.url), 'utf8'),
  seal: await readFile(new URL('../src/sceau.css', import.meta.url), 'utf8'),
  vite: await readFile(new URL('../vite.config.ts', import.meta.url), 'utf8'),
  adminExpeditions: await readFile(new URL('../src/pages/admin/Expeditions.tsx', import.meta.url), 'utf8'),
  importMigration: await readFile(new URL('../supabase/fret_import_expeditions.sql', import.meta.url), 'utf8').catch(() => ''),
};

const [catalog] = await Promise.all([
  readFile(new URL('../src/i18n/messages.json', import.meta.url), 'utf8').then(JSON.parse),
]);
const translatedTravelerCopy = ['Mes achats', 'Actions rapides', 'Que voulez-vous faire ?', 'Trouver une adresse', 'Préparer mes achats', 'Suivre un envoi', 'Près de moi', 'Votre guide du voyageur', 'Trouvez les bonnes adresses, simplement.', 'Progression des achats', 'Progression du lot', 'Suivre une expédition', 'Suivez votre lot', 'Entrez le code communiqué par Diaba pour consulter les dernières étapes visibles.', 'Code de l’expédition', 'Rechercher', 'Recherche…', 'Aucun lot public ne correspond à ce code. Vérifiez les caractères saisis.', 'Résumé', 'Étapes visibles', 'Dates clés', 'Aucune étape publique n’a encore été enregistrée.', 'Expédier cette liste', 'Liste d’achats liée', 'Ajoutez au moins un produit avant de préparer l’envoi.', 'Attendez le chargement de la liste d’achats.', 'Importer des lots en cours', 'Chargez un fichier CSV, TSV ou collez son contenu. Les codes déjà présents seront ignorés sans modifier les lots existants.', 'Télécharger le modèle CSV', 'Fichier CSV ou TSV', 'Contenu à importer', 'Erreurs à corriger', 'Ligne', 'autre(s) erreur(s)', 'expédition(s) prête(s) à importer', 'autre(s) expédition(s)', 'Importer les expéditions', 'Import…', 'Corrigez le fichier avant de lancer l’import.', 'Un import est limité à 200 expéditions.', 'Le fichier dépasse la limite de 2 Mo.', 'Carte de suivi du lot', 'Suivre le lot en ligne', 'Imprimer la carte', 'Destination'];
const navBlock = files.ui.slice(files.ui.indexOf('const NAV:'), files.ui.indexOf('export function BottomNav'));

const checks = [
  ['navigation principale limitée à cinq destinations', () => (navBlock.match(/\n  \{ to: /g) ?? []).length === 5],
  ['navigation contient Mes achats', () => navBlock.includes("to: '/liste-achats', label: 'Mes achats'")],
  ['navigation contient Profil', () => navBlock.includes("to: '/profil', label: 'Profil'")],
  ['accueil contient les actions prioritaires', () => ['Trouver une adresse', 'Préparer mes achats', 'Suivre un envoi', 'Près de moi'].every((v) => files.home.includes(v))],
  ['navigation accessible au clavier', () => files.styles.includes('.bottomnav a:focus-visible')],
  ['mise en page des petits écrans', () => files.styles.includes('@media (max-width: 390px)')],
  ['cachet du hero replacé hors du texte descriptif sur mobile', () => {
    const mobile = files.seal.match(/@media\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const seal = mobile.match(/\.sceau\s+\.hero\s*>\s*\.seal-lg\s*\{([^}]*)\}/)?.[1] ?? '';
    return /position:\s*relative/.test(seal) && /inset:\s*auto/.test(seal) && /align-self:\s*flex-end/.test(seal);
  }],
  ['cachet du hero replacé hors du texte descriptif sur desktop', () => {
    const desktop = files.seal.match(/@media\s*\(min-width:\s*601px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    const seal = desktop.match(/\.sceau\s+\.hero\s*>\s*\.seal-lg\s*\{([^}]*)\}/)?.[1] ?? '';
    return /position:\s*relative/.test(seal) && /inset:\s*auto/.test(seal) && /align-self:\s*flex-end/.test(seal);
  }],
  ['recherche persistante sur mobile', () => files.styles.includes('.search-head { position: sticky;')],
  ['application des filtres accessible sur mobile', () => files.search.includes('className="filter-apply"') && files.styles.includes('.filter-apply { position: sticky;')],
  ['libellé ville unique dans les filtres mobiles', () => files.search.includes('wide && <h2 style={{ fontSize: 17 }}>{tr("Ville")}</h2>')],
  ['contact accessible depuis les résultats', () => files.search.includes('className="rcard-contact"') && files.search.includes('/contact')],
  ['actions principales visibles avant les avis sur une fiche', () => files.fiche.includes('className="stack" style={{ order: 2 }}') && files.fiche.includes('title={tr("Avis des voyageurs")}') && files.styles.includes('.fiche-side { display: contents;')],
  ['progression des achats visible dans une liste', () => files.shopping.includes('className="shopping-progress"') && files.shopping.includes('aria-label={tr("Progression des achats")}') && files.styles.includes('.shopping-progress')],
  ['partage du suivi public accessible', () => files.suivi.includes('className="tracking-share card') && files.suivi.includes('navigator.share') && files.suivi.includes('Copier le lien')],
  ['envois prioritaires avant les formulaires fret', () => files.fret.includes('mes-envois-main') && files.fret.includes('freight-tracking') && files.fret.includes('freight-estimate') && files.styles.includes('.mes-envois-main .freight-public-tracking { order: 1;')],
  ['progression visible sur les lots suivis', () => files.fret.includes('className="lot-progress') && files.fret.includes('aria-valuenow={progression}') && files.styles.includes('.lot-progress')],
  ['prochaine étape visible sur les lots suivis', () => files.fret.includes('lot-next-step') && files.fret.includes('prochaineEtapeType') && files.fret.includes('Prochaine étape')],
  ['accès public direct depuis un colis', () => files.fret.includes('c.expeditionCode') && files.fret.includes('`/suivi/${encodeURIComponent(c.expeditionCode)}`')],
  ['suivi détaillé des colis accessible', () => files.fret.includes('aria-expanded={open}') && files.fret.includes('aria-controls={detailId}') && files.fret.includes('id={detailId}')],
  ['suivi public multilingue', () => files.suivi.includes('title={tr("Suivre une expédition")}') && files.suivi.includes('{tr("Suivez votre lot")}') && files.suivi.includes('label={tr("Code de l’expédition")}')],
  ['aide de saisie du code de suivi', () => files.suivi.includes('tracking-code-help') && files.suivi.includes('Le code figure sur l’étiquette du lot') && files.suivi.includes('Le code a la forme DIA-2026-0001.')],
  ['dates des étapes protégées du décalage horaire', () => files.fret.includes('formatEtapeDate') && !files.fret.includes('new Date(derniereEtape.au).toLocaleDateString') && !files.fret.includes('new Date(e.au).toLocaleDateString')],
  ['accès public au suivi depuis Mes envois', () => files.fret.includes('freight-public-tracking') && files.fret.includes('to="/suivi"') && files.fret.includes('Suivre un envoi')],
  ['routes métier conservées', () => ['/accueil', '/recherche', '/mes-envois', '/liste-achats', '/profil'].every((v) => files.app.includes(`path="${v}"`))],
  ['pages voyageur chargées par route', () => ['pages/Home', 'pages/Search', 'pages/Fiche', 'pages/Shopping', 'pages/Fret', 'pages/Suivi'].every((v) => files.app.includes(`import('./${v}')`))],
  ['chunks fournisseurs configurés explicitement', () => files.vite.includes('manualChunks') && files.vite.includes("vendor-react") && files.vite.includes("vendor-supabase")],
  ['récupération PWA gardée même sans sessionStorage', () => files.main.includes("vite:preloadError") && files.main.includes('history.replaceState') && files.main.includes('guardPersisted') && files.main.indexOf('event.preventDefault()') > files.main.indexOf('if (!guardPersisted) return') && files.main.includes('location.reload()')],
  ['liste d’achats transférée vers l’annonce fret', () => files.shopping.includes('Expédier cette liste') && files.shopping.includes('/mes-envois?liste=') && files.fret.includes('useSearchParams') && files.fret.includes('fetchList') && files.fret.includes('shoppingListId')],
  ['annonce bloquée pendant le chargement de la liste', () => files.fret.includes('linkLoading') && files.fret.includes('setLinkedList(null)') && files.fret.includes('shoppingListId && !linkedList')],
  ['erreur de liaison isolée des erreurs d’annonce', () => files.fret.includes('linkErr') && files.fret.includes('setLinkErr(null)')],
  ['import des expéditions en cours sécurisé et prévisualisé', () => files.adminExpeditions.includes('parseExpeditionImport') && files.adminExpeditions.includes('Importer des lots en cours') && files.adminExpeditions.includes('importExpeditions') && files.importMigration.includes('security definer') && files.importMigration.includes('is_fret()') && files.importMigration.includes("revoke all on function public.importer_expeditions(jsonb) from public")],
  ['fichiers d’import surdimensionnés rejetés avant lecture', () => files.adminExpeditions.includes('file.size > 2_000_000') && files.adminExpeditions.indexOf('file.size > 2_000_000') < files.adminExpeditions.indexOf('file.text()')],
  ['carte imprimable du lot limitée aux données publiques', () => files.suivi.includes('tracking-print-card') && files.suivi.includes('print-only') && files.suivi.includes('no-print') && files.suivi.includes('window.print()') && files.suivi.includes('suivi.code') && files.suivi.includes('publicUrl')],
  ['nouveaux libellés traduits', () => translatedTravelerCopy.every((key) => catalog[key]?.en && catalog[key]?.zh && catalog[key]?.ar)],
];

const failed = checks.filter(([, test]) => !test());
for (const [label] of checks) console.log(`${failed.some(([name]) => name === label) ? 'FAIL' : 'PASS'} ${label}`);
if (failed.length) process.exit(1);
console.log(`\n${checks.length} contrôles UI voyageur validés.`);
