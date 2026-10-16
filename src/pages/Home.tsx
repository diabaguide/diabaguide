import { useI18n } from '../i18n';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { citiesWithPublicEntries, cityName, directoryCategories, type City } from '../data';
import { districtPos, requestPosition, setPos } from '../geo';
import { useStore } from '../store';
import { useModules, type ModuleKey } from '../lib/modules';
import { Button, DemoNote, Icon, Logo, RadioCard, Screen, TopBar } from '../ui';
const AnnoncesDiaba = lazy(() => import('./Annonces').then((m) => ({ default: m.AnnoncesDiaba })));
import { PremiereVisite } from './Tour';
import { ResultCard } from './Search';

interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

/* Vrai si l'app tourne déjà installée (lancée depuis l'écran d'accueil) :
   « display-mode: standalone » sur la plupart des navigateurs, `navigator.standalone` sur iOS Safari. */
const isStandalone = () =>
  (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches)
  || (navigator as unknown as { standalone?: boolean }).standalone === true;

/* Boutons côte à côte pour un petit nombre de villes ; liste déroulante
   au-delà, pour ne jamais déborder sur mobile quand on en ajoute plusieurs. */
const CITY_BUTTONS_MAX = 4;
function CitySwitch() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const active = citiesWithPublicEntries(s.cities, s.providers);
  // Même base que la page Explorer : toutes les adresses de la ville.
  const count = (id: string) => s.providers.filter((p) => p.city === id).length;
  useEffect(() => {
    if (active.length > 0 && !active.some((c) => c.id === s.city)) d({ t: 'city', v: active[0].id });
  }, [active, s.city, d]);
  if (active.length === 0) return null;
  if (active.length > CITY_BUTTONS_MAX) {
    return (
      <label className="city-switch">
        <span className="sr">{tr("Ville")}</span>
        <Icon name="pin" size={18} />
        <select value={s.city} onChange={(e) => d({ t: 'city', v: e.target.value })}>
          {active.map((c) => <option key={c.id} value={c.id}>{c.name} ({count(c.id)})</option>)}
        </select>
      </label>
    );
  }
  return (
    <div className="seg city-seg" role="group" aria-label={tr("Ville")}>
      {active.map((c) => (
        <button key={c.id} type="button" className={s.city === c.id ? 'on' : ''} aria-pressed={s.city === c.id} onClick={() => d({ t: 'city', v: c.id })}>
          {tr(s.city === c.id && '✓ ')}{c.name}<span className="citycount">{count(c.id)}</span>
        </button>
      ))}
    </div>
  );
}

/* Trois besoins voyageurs, illustrés d'abord : l'action peut être choisie sans lire la recherche ni un long menu. */
function NeedsTiles() {
  const { tr, t } = useI18n();
  const { s } = useStore();
  const needs = [
    { cat: 'gros', label: 'Acheter en gros', cn: '批发', img: '/wholesale.svg', alt: 'Ballots et cartons' },
    { cat: 'hotel', label: 'Dormir', cn: '酒店', img: '/sleep.svg', alt: 'Lit' },
    { cat: 'resto', label: 'Manger', cn: '餐厅', img: '/eat.svg', alt: 'Assiette' },
  ];
  const other = directoryCategories(s.categories).filter((c) => c.active && !needs.some((n) => n.cat === c.id));
  return (
    <section aria-label={tr('Trois besoins principaux')}>
      <h2 className="display" style={{ fontSize: 21, marginBottom: 12 }}>{tr('Que cherchez-vous ?')}</h2>
      <div className="needtiles">
        {needs.map((n) => {
          const count = s.providers.filter((p) => p.city === s.city && p.cat === n.cat).length;
          return <Link key={n.cat} to={`/recherche?cat=${n.cat}&ville=${s.city}`} className="needtile">
            <img src={n.img} alt={tr(n.alt)} />
            <span className="needtile-copy"><strong>{tr(n.label)}</strong><small className="zh">{n.cn}</small><small>{t('{0} lieu(x)', { 0: count })}</small></span>
          </Link>;
        })}
      </div>
      {other.length > 0 && <div className="other-services">
        <span className="small muted">{tr('Autres services')}</span>
        <div className="chips">{other.map((c) => <Link key={c.id} className="chip" to={`/recherche?cat=${c.id}&ville=${s.city}`}><Icon name={c.icon} size={17} />{tr(c.label)}</Link>)}</div>
      </div>}
    </section>
  );
}

function QuickActions() {
  const { tr } = useI18n();
  const { settings } = useModules();
  const actions: { to: string; icon: Parameters<typeof Icon>[0]['name']; title: string; sub: string; module?: ModuleKey }[] = [
    { to: '/recherche', icon: 'search', title: 'Trouver une adresse', sub: 'Explorer les fournisseurs' },
    { to: '/liste-achats', icon: 'list', title: "Préparer mes achats", sub: 'Créer ou retrouver une liste', module: 'shopping' },
    { to: '/localisation', icon: 'pin', title: 'Près de moi', sub: 'Chercher dans un quartier' },
  ];
  return (
    <section aria-label={tr("Actions rapides")}>
      <h2 className="display" style={{ fontSize: 19, marginBottom: 12 }}>{tr("Que voulez-vous faire ?")}</h2>
      <div className="quick-actions">
        {actions.filter((a) => !a.module || settings[a.module]).map((a) => (
          <Link key={a.to} to={a.to} className="quick-action">
            <span className="quick-action-icon"><Icon name={a.icon} size={23} /></span>
            <span className="quick-action-copy"><strong>{tr(a.title)}</strong><small>{tr(a.sub)}</small></span>
            <Icon name="chevR" size={18} />
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Home() {
  const { tr, t } = useI18n();
  const nav = useNavigate();
  const { s, d } = useStore();
  const { settings } = useModules();
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    // Déjà installée (y compris une installation faite hors de ce bouton, ex. iOS) : ne plus proposer.
    if (isStandalone() && !s.installDismissed) d({ t: 'dismissInstall' });
    const onPromptable = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    // Émis par le navigateur juste après une installation réussie, quel que soit le déclencheur.
    const onInstalled = () => { setEvt(null); d({ t: 'dismissInstall' }); };
    window.addEventListener('beforeinstallprompt', onPromptable);
    window.addEventListener('appinstalled', onInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', onPromptable); window.removeEventListener('appinstalled', onInstalled); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Priorité aux fiches mises en avant par l'équipe ; complétée avec d'autres
  // fiches de la ville pour ne jamais paraître vide quand il y en a peu.
  const MIN_SELECTION = 4;
  const cityProviders = s.providers.filter((p) => p.city === s.city);
  const cityFeatured = cityProviders.filter((p) => p.featured);
  const selection = cityFeatured.length >= MIN_SELECTION ? cityFeatured
    : [...cityFeatured, ...cityProviders.filter((p) => !p.featured)].slice(0, MIN_SELECTION);

  return (
    <Screen className="sceau" wide>
      <PremiereVisite />
      <header className="hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Logo height={30} tail="GUIDE" />
          <span className="seal seal-sm" aria-hidden="true"><span>指</span><span>南</span></span>
        </div>
        {/* Recherche d'abord, en pastille pleine largeur ; les villes ensuite, en pastilles. */}
        <form className="searchfake" role="search" onSubmit={(e) => {
          e.preventDefault();
          const terme = new FormData(e.currentTarget).get('q');
          const n = new URLSearchParams({ ville: s.city });
          if (typeof terme === 'string' && terme.trim()) n.set('q', terme.trim());
          nav('/recherche?' + n.toString());
        }}>
          <Icon name="search" />
          <input name="q" type="search" defaultValue="" enterKeyHint="search" autoComplete="off"
            aria-label={tr("Rechercher un produit ou un service")} placeholder={tr("Un produit, un hôtel, un plat…")}
            style={{ flex: 1, minWidth: 0, minHeight: 44, border: 0, background: 'transparent', font: 'inherit', color: 'inherit', outline: 'none' }} />
        </form>
        <CitySwitch />
      </header>
      <main className="main" style={{ gap: 22, paddingTop: 20 }}>
        <div className="home-intro">
          <p className="eyebrow">{tr("Votre guide du voyageur")}</p>
          <h1 className="display">{tr("Marchés de gros, hôtels et restaurants vérifiés en Chine. Montrez l’adresse au chauffeur en un geste.")}</h1>
        </div>
        <NeedsTiles />
        {settings.announcements && <Suspense fallback={null}><AnnoncesDiaba /></Suspense>}
        <QuickActions />
        {!s.installDismissed && (
          <div className="install">
            <Icon name="download" size={22} />
            <div className="grow"><div style={{ fontWeight: 700, fontSize: 15 }}>{tr("Installer Diaba Guide")}</div><div className="small muted">{tr("Ajoutez le site à l’écran d’accueil de votre téléphone.")}</div></div>
            <button type="button" className="btn btn-s" style={{ minHeight: 44, fontSize: 14, padding: '0 12px' }}
              onClick={async () => {
                if (!evt) { alert('Sur iPhone : Partager > Sur l’écran d’accueil. Sur Android : menu du navigateur > Installer l’application.'); return; }
                await evt.prompt();
                const { outcome } = await evt.userChoice;
                setEvt(null);
                if (outcome === 'accepted') d({ t: 'dismissInstall' });
              }}>{tr("Installer")}</button>
            <button type="button" className="iconbtn" style={{ border: 0, background: 'transparent', color: 'var(--muted)' }} aria-label={tr("Fermer la proposition d’installation")} onClick={() => d({ t: 'dismissInstall' })}><Icon name="x" size={20} /></button>
          </div>
        )}
        <section className="stack cards-grid">
          <h2 className="display" style={{ fontSize: 19 }}>{tr("Sélection Diaba · ")}{tr(cityName(s.city))}</h2>
          {selection.map((p) => <ResultCard key={p.id} p={p} />)}
        </section>
        <section className="card sec">
          <h2 className="display" style={{ fontSize: 19 }}><Icon name="pin" size={22} />{tr("À proximité")}</h2>
          <p className="muted small" style={{ fontSize: 15 }}>{tr("Votre position n’est demandée que si vous activez la recherche à proximité. Vous pouvez aussi choisir un quartier à la main.")}</p>
          <Button to="/localisation" icon="pin">{tr("Activer la recherche à proximité")}</Button>
          <Link className="link center" style={{ justifyContent: 'center' }} to="/localisation">{tr("Choisir un quartier manuellement")}</Link>
        </section>
        {settings.contributions && <Button to="/contributions/nouvelle/1" kind="s" icon="plus">{tr("Proposer une adresse")}</Button>}
        <DemoNote />
      </main>
    </Screen>
  );
}

export function Locate() {
  const { tr } = useI18n();
  const { s } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const quarters = s.districts.filter((x) => x.cityId === s.city && x.active);
  const [district, setDistrict] = useState('');
  const chosen = district || quarters[0]?.name || '';
  const allow = async () => {
    setBusy(true);
    try { setPos(await requestPosition()); nav(`/recherche?ville=${s.city}&prox=10`); }
    catch { setPos(null); nav(`/recherche?ville=${s.city}&geo=err`); }
  };
  const manual = () => { setPos(districtPos(chosen)); nav(`/recherche?ville=${s.city}&prox=10`); };
  return (
    <Screen>
      <TopBar title={tr("Près de vous")} back={-1} />
      <div className="main" style={{ gap: 20 }}>
        <div className="card center-screen" style={{ padding: '24px 20px', flex: 'none' }}>
          <span className="bigcheck" style={{ width: 72, height: 72, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}><Icon name="pin" size={36} /></span>
          <div className="display" style={{ fontSize: 24 }}>{tr("Trouver les adresses autour de vous")}</div>
          <div className="muted">{tr("Diaba Guide utilise votre position uniquement pour calculer les distances. Vous pouvez refuser : la sélection manuelle reste disponible.")}</div>
          <Button icon="check" onClick={allow} disabled={busy}>{tr(busy ? 'Localisation…' : 'Autoriser la localisation')}</Button>
        </div>
        <section className="stack"><h2 className="display" style={{ fontSize: 19 }}>{tr("Ou choisissez un quartier · ")}{tr(cityName(s.city))}</h2>
          {quarters.length > 0
            ? quarters.map((x) => <RadioCard key={x.name} name="q" label={tr(x.name)} checked={chosen === x.name} onChange={() => setDistrict(x.name)} />)
            : <p className="muted">{tr("Aucun quartier n’est encore renseigné pour cette ville.")}</p>}
        </section>
        {quarters.length > 0 && <Button kind="s" onClick={manual}>{tr("Voir les adresses de ce quartier")}</Button>}
      </div>
    </Screen>
  );
}
