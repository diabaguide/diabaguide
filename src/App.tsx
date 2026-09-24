import { useI18n } from './i18n';
import { logSessionEvent } from './lib/sessionLog';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { isTeamRole } from './lib/auth';
import { lazy, Suspense } from 'react';
import { Welcome, Signup, SignupDone, Login, Forgot, ResetPassword } from './pages/Access';
import { Home, Locate } from './pages/Home';
import { Search, Filters } from './pages/Search';
import { Fiche, Driver, Card, Contact, Report } from './pages/Fiche';
import { Favorites, Profile, Downloads } from './pages/Account';
import { Wizard, Sent, Contributions, ContributionDetail } from './pages/Contribute';
import { ShoppingLists, ShoppingListPage } from './pages/Shopping';
import { ReviewsAdminPage } from './pages/Reviews';

const AdminLayout = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AdminDashboard })));
const AdminList = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AdminList })));
const AdminVerify = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AdminVerify })));
const AdminHistory = lazy(() => import('./pages/admin/Admin').then(m => ({ default: m.AdminHistory })));
const FichesList = lazy(() => import('./pages/admin/Fiches').then(m => ({ default: m.FichesList })));
const FicheEdit = lazy(() => import('./pages/admin/Fiches').then(m => ({ default: m.FicheEdit })));
const Deletions = lazy(() => import('./pages/admin/Fiches').then(m => ({ default: m.Deletions })));
const SearchLogs = lazy(() => import('./pages/admin/SearchLogs').then(m => ({ default: m.SearchLogs })));
const Members = lazy(() => import('./pages/admin/Members').then(m => ({ default: m.Members })));
const Travelers = lazy(() => import('./pages/admin/Travelers').then(m => ({ default: m.Travelers })));
const AdminCities = lazy(() => import('./pages/admin/Taxonomies').then(m => ({ default: m.AdminCities })));
const AdminCategories = lazy(() => import('./pages/admin/Taxonomies').then(m => ({ default: m.AdminCategories })));
const AdminProductTags = lazy(() => import('./pages/admin/Taxonomies').then(m => ({ default: m.AdminProductTags })));
const AdminAnnonces = lazy(() => import('./pages/admin/Annonces').then(m => ({ default: m.AdminAnnonces })));

/* Compte obligatoire : toute page de contenu redirige vers la connexion.
   L’URL demandée est conservée (?next=) : lien partagé > connexion > fiche. */
/* Niveau d'accès requis : simple connexion, espace équipe, ou administration. */
function RequireAuth({ need = 'user' }: { need?: 'user' | 'team' | 'admin' }) {
  const { tr } = useI18n();
  const { s } = useStore();
  const loc = useLocation();
  // Tant que la session Supabase n'est pas vérifiée, on n'affiche ni ne redirige
  // (évite de rejeter vers /connexion un utilisateur en réalité connecté).
  if (!s.authReady) {
    return <div className="center-screen" style={{ minHeight: '60vh' }} role="status" aria-live="polite">{tr("Chargement…")}</div>;
  }
  if (!s.user) {
    /* Noté au journal : c'est ICI que l'on voit si un voyageur est renvoyé vers
       l'écran de connexion alors qu'il croyait rester connecté. */
    logSessionEvent('rejet_vers_connexion', loc.pathname);
    return <Navigate to={`/connexion?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  }
  if (need === 'team' && !isTeamRole(s.user.role)) return <Navigate to="/accueil" replace />;
  if (need === 'admin' && s.user.role !== 'admin') return <Navigate to="/equipe" replace />;
  return <Outlet />;
}

/* Pages publiques (accueil de présentation, connexion, inscription, mot de passe
   oublié) : un voyageur DÉJÀ CONNECTÉ n'a rien à y faire. Sans ce garde, le
   bouton « précédent » du téléphone ramenait sur l'écran de connexion alors que
   la session était intacte — d'où l'impression de devoir se reconnecter sans
   cesse. On attend d'avoir vérifié la session avant de trancher, sinon l'écran
   de connexion apparaîtrait une fraction de seconde avant la redirection. */
function GuestOnly() {
  const { tr } = useI18n();
  const { s } = useStore();
  if (!s.authReady) {
    return <div className="center-screen" style={{ minHeight: '60vh' }} role="status" aria-live="polite">{tr("Chargement…")}</div>;
  }
  if (s.user) return <Navigate to="/accueil" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="center-screen" style={{ minHeight: '60vh' }} role="status">Chargement…</div>}>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/" element={<Welcome />} />
          <Route path="/inscription" element={<Signup />} />
          <Route path="/connexion" element={<Login />} />
          <Route path="/mot-de-passe" element={<Forgot />} />
        </Route>
        <Route path="/inscription/confirmation" element={<SignupDone />} />
        {/* Réinitialisation : le lien reçu par e-mail ouvre une session de
            récupération — cette page doit rester accessible même connecté. */}
        <Route path="/reinitialiser" element={<ResetPassword />} />

        <Route element={<RequireAuth />}>
          <Route path="/accueil" element={<Home />} />
          <Route path="/localisation" element={<Locate />} />
          <Route path="/recherche" element={<Search />} />
          <Route path="/recherche/filtres" element={<Filters />} />
          <Route path="/adresses/:id" element={<Fiche />} />
          <Route path="/adresses/:id/chauffeur" element={<Driver />} />
          <Route path="/adresses/:id/carte" element={<Card />} />
          <Route path="/adresses/:id/contact" element={<Contact />} />
          <Route path="/adresses/:id/signaler" element={<Report />} />
          <Route path="/favoris" element={<Favorites />} />
          <Route path="/liste-achats" element={<ShoppingLists />} />
          <Route path="/liste-achats/:id" element={<ShoppingListPage />} />
          <Route path="/contributions" element={<Contributions />} />
          <Route path="/contributions/nouvelle/envoyee" element={<Sent />} />
          <Route path="/contributions/nouvelle/:step" element={<Wizard />} />
          <Route path="/contributions/:id" element={<ContributionDetail />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/profil/telechargements" element={<Downloads />} />
        </Route>

        <Route element={<RequireAuth need="team" />}>
          <Route element={<AdminLayout />}>
            <Route path="/equipe" element={<AdminDashboard />} />
            <Route path="/equipe/propositions" element={<AdminList />} />
            <Route path="/equipe/propositions/:id" element={<AdminVerify />} />
            <Route path="/equipe/historique" element={<AdminHistory />} />
            <Route path="/equipe/fiches" element={<FichesList />} />
            <Route path="/equipe/recherches" element={<SearchLogs />} />
            <Route path="/equipe/fiches/:id" element={<FicheEdit />} />
            {/* Annonces de services : l'équipe consulte, l'administration rédige. */}
            <Route path="/equipe/annonces" element={<AdminAnnonces />} />
            {/* Administration : réservée au rôle admin */}
            <Route element={<RequireAuth need="admin" />}>
              <Route path="/equipe/suppressions" element={<Deletions />} />
              <Route path="/equipe/membres" element={<Members />} />
              <Route path="/equipe/voyageurs" element={<Travelers />} />
              <Route path="/equipe/avis" element={<ReviewsAdminPage />} />
              <Route path="/equipe/villes" element={<AdminCities />} />
              <Route path="/equipe/categories" element={<AdminCategories />} />
              <Route path="/equipe/produits" element={<AdminProductTags />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
