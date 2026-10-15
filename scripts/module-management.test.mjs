import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const base = new URL('..', import.meta.url);
const read = (path) => readFile(new URL(path, base), 'utf8');
const [app, modules, migration, ui, home, account, fiche, fret, adminPage, adminNav, search, shoppingPage, messagesText] = await Promise.all([
  read('src/App.tsx'), read('src/lib/modules.tsx'), read('supabase/540_module_management.sql'),
  read('src/ui.tsx'), read('src/pages/Home.tsx'), read('src/pages/Account.tsx'),
  read('src/pages/Fiche.tsx'), read('src/pages/Fret.tsx'), read('src/pages/admin/Modules.tsx'),
  read('src/pages/admin/Admin.tsx'), read('src/pages/Search.tsx'), read('src/pages/Shopping.tsx'),
  read('src/i18n/messages.json'),
]);
const messages = JSON.parse(messagesText);

test('la gestion des modules est réservée à l’administrateur principal', () => {
  assert.match(app, /path="\/equipe\/modules"/);
  assert.match(app, /RequireAuth need="primary-admin"/);
  assert.match(adminNav, /isPrimaryAdmin \?[\s\S]*?\/equipe\/modules/);
});

test('la recherche des lieux reste le cœur obligatoire et les modules optionnels ont des états réversibles', () => {
  assert.match(modules, /CORE_SEARCH_ALWAYS_ON = true/);
  assert.match(modules, /shopping: false/);
  assert.match(migration, /\('shopping', false\)/);
  for (const key of ['shopping', 'shipments', 'contributions', 'announcements']) {
    assert.match(modules, new RegExp(`key: '${key}'`));
    assert.match(migration, new RegExp(`'${key}'`));
  }
  assert.match(app, /path="\/recherche" element={<Search \/>}/);
  assert.doesNotMatch(migration, /core_search/);
});

test('les changements de réglage sont autorisés en base uniquement à l’administrateur principal', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /for select to anon, authenticated using \(true\)/);
  assert.match(migration, /security definer[\s\S]*?is_primary_admin = true/);
  assert.match(migration, /revoke all on function public\.set_module_enabled/);
  assert.match(migration, /grant execute on function public\.set_module_enabled\(text, boolean\) to authenticated/);
  assert.doesNotMatch(migration, /create policy[^;]*(?:for update|for all)/i);
  assert.doesNotMatch(migration, /drop table|delete from public\./i);
});

test('les modules désactivés disparaissent des accès et les routes directes sont protégées', () => {
  for (const key of ['shopping', 'shipments', 'contributions', 'announcements']) {
    assert.match(app, new RegExp(`ModuleGate module="${key}"`));
  }
  assert.match(ui, /NAV\.filter\(\(n\) => !n\.module \|\| settings\[n\.module\]\)/);
  assert.match(home, /settings\.announcements &&/);
  assert.match(home, /settings\.contributions &&/);
  assert.match(account, /settings\.shopping &&/);
  assert.match(account, /settings\.contributions &&/);
  assert.match(fiche, /settings\.shopping && <Suspense/);
  assert.match(fiche, /lazy\(\(\) => import\('\.\/Shopping'\)/);
  assert.match(fiche, /settings\.contributions && <Link/);
  assert.doesNotMatch(fret, /searchParams\.get\('liste'\)/);
  assert.doesNotMatch(fret, /import\('\.\.\/lib\/shopping'\)/);
  assert.match(search, /settings\.contributions && <Button/);
  assert.doesNotMatch(shoppingPage, /settings\.shipments/);
  assert.match(app, /ModuleGate module="contributions"[\s\S]*?path="\/adresses\/:id\/signaler"/);
  assert.match(adminPage, /role="switch"/);
});

test('une activation n’est annoncée qu’après relecture du réglage en base', () => {
  assert.match(modules, /set_module_enabled/);
  assert.match(modules, /select\('enabled'\)[\s\S]*?maybeSingle\(\)/);
  assert.match(modules, /data\?\.enabled !== enabled/);
});

test('les nouveaux libellés du gestionnaire sont traduits dans toutes les langues supportées', () => {
  const keys = [
    'Gestion des modules',
    'Activez ou mettez en pause les services complémentaires, sans supprimer leurs données.',
    'Recherche de lieux',
    'Marchés, hôtels et restaurants : le cœur de Diaba Guide reste toujours actif et ne peut pas être désactivé.',
    'Toujours actif',
    'Modules complémentaires',
    'Ce module est temporairement indisponible. Vos données sont conservées.',
    'Mes Achats',
    'Créer et gérer ses listes d’achats.',
    'Mes Envois',
    'Annoncer des colis et consulter leur suivi.',
    'Contributions',
    'Proposer une adresse ou signaler une correction.',
    'Annonces de Diaba',
    'Afficher les annonces de service sur l’accueil.',
    'Actif',
    'En pause',
    'Activer',
    'Désactiver',
    'Module désactivé. Vos données sont conservées.',
    'Module activé.',
    'Seul l’administrateur principal peut gérer les modules.',
    'Le réglage n’a pas pu être enregistré. Réessayez.',
    'Le réglage n’a pas pu être confirmé. Réessayez.',
    'Configuration indisponible sans connexion à la base de données.',
    'Retour au tableau de bord',
    'Marchés, hôtels et restaurants : trouvez les bonnes adresses et leurs services.',
  ];
  for (const key of keys) {
    assert.ok(messages[key], `traduction manquante : ${key}`);
    for (const locale of ['en', 'zh', 'ar']) {
      assert.equal(typeof messages[key][locale], 'string', `${key} (${locale})`);
      assert.ok(messages[key][locale].trim(), `${key} (${locale}) est vide`);
    }
  }
});
