import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store';
import { Welcome, Signup, SignupDone, Login, Forgot, ResetPassword } from './pages/Access';
import { Home, Locate } from './pages/Home';
import { Search, Filters } from './pages/Search';
import { Fiche, Driver, Contact, Report } from './pages/Fiche';
import { Favorites, Profile, Downloads } from './pages/Account';
import { Wizard, Sent, Contributions, ContributionDetail } from './pages/Contribute';
import { AdminLayout, AdminDashboard, AdminList, AdminVerify, AdminHistory } from './pages/admin/Admin';

/* Compte obligatoire : toute page de contenu redirige vers la connexion.
   L’URL demandée est conservée (?next=) : lien partagé > connexion > fiche. */
function RequireAuth({ team = false }: { team?: boolean }) {
  const { s } = useStore();
  const loc = useLocation();
  // Tant que la session Supabase n'est pas vérifiée, on n'affiche ni ne redirige
  // (évite de rejeter vers /connexion un utilisateur en réalité connecté).
  if (!s.authReady) {
    return <div className="center-screen" style={{ minHeight: '60vh' }} role="status" aria-live="polite">Chargement…</div>;
  }
  if (!s.user) return <Navigate to={`/connexion?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (team && s.user.role !== 'team') return <Navigate to="/accueil" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Welcome />} />
      <Route path="/inscription" element={<Signup />} />
      <Route path="/inscription/confirmation" element={<SignupDone />} />
      <Route path="/connexion" element={<Login />} />
      <Route path="/mot-de-passe" element={<Forgot />} />
      <Route path="/reinitialiser" element={<ResetPassword />} />

      <Route element={<RequireAuth />}>
        <Route path="/accueil" element={<Home />} />
        <Route path="/localisation" element={<Locate />} />
        <Route path="/recherche" element={<Search />} />
        <Route path="/recherche/filtres" element={<Filters />} />
        <Route path="/adresses/:id" element={<Fiche />} />
        <Route path="/adresses/:id/chauffeur" element={<Driver />} />
        <Route path="/adresses/:id/contact" element={<Contact />} />
        <Route path="/adresses/:id/signaler" element={<Report />} />
        <Route path="/favoris" element={<Favorites />} />
        <Route path="/contributions" element={<Contributions />} />
        <Route path="/contributions/nouvelle/envoyee" element={<Sent />} />
        <Route path="/contributions/nouvelle/:step" element={<Wizard />} />
        <Route path="/contributions/:id" element={<ContributionDetail />} />
        <Route path="/profil" element={<Profile />} />
        <Route path="/profil/telechargements" element={<Downloads />} />
      </Route>

      <Route element={<RequireAuth team />}>
        <Route element={<AdminLayout />}>
          <Route path="/equipe" element={<AdminDashboard />} />
          <Route path="/equipe/propositions" element={<AdminList />} />
          <Route path="/equipe/propositions/:id" element={<AdminVerify />} />
          <Route path="/equipe/historique" element={<AdminHistory />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
