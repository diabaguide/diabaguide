import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { cityName, type City } from '../data';
import { districtPos, requestPosition, setPos } from '../geo';
import { useStore } from '../store';
import { Button, DemoNote, Icon, Logo, RadioCard, Screen, TopBar } from '../ui';
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
  const active = s.cities.filter((c) => c.active);
  const count = (id: string) => s.providers.filter((p) => p.city === id).length;
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

export function Home() {
  const { tr, t } = useI18n();
  const { s, d } = useStore();
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
      <header className="hero">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Logo height={30} tail="GUIDE" />
          <span className="seal seal-sm" aria-hidden="true"><span>指</span><span>南</span></span>
        </div>
        <div className="hello display">{tr("Bonjour ")}{s.user?.name.split(' ')[0]}</div>
        <CitySwitch />
        <Link to={`/recherche?ville=${s.city}`} className="searchfake" aria-label={tr("Rechercher un produit ou un service")}>
          <Icon name="search" /><span>{tr("Quel produit ou service cherchez-vous ?")}</span>
        </Link>
      </header>
      <main className="main" style={{ gap: 22, paddingTop: 20 }}>
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
        <section aria-label={tr("Catégories")}>
          <h2 className="display" style={{ fontSize: 19, marginBottom: 12 }}>{tr("Que cherchez-vous ?")}</h2>
          <div className="cattiles">
            {s.categories.filter((c) => c.active).map((c, i, arr) => {
              const n = s.providers.filter((p) => p.cat === c.id && p.city === s.city).length;
              return (
                <Link key={c.id} to={`/recherche?cat=${c.id}&ville=${s.city}`} className={`cattile ${arr.length % 2 === 1 && i === arr.length - 1 ? 'wide' : ''}`}>
                  <span className="ico"><Icon name={c.icon} size={24} /></span>
                  <span>{tr(c.label)}</span>
                  <span className="cattile-sub">{c.labelCn && <span className="zh">{c.labelCn} · </span>}{t('{0} lieu(x)', { 0: n })}</span>
                </Link>
              );
            })}
          </div>
        </section>
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
        <Button to="/contributions/nouvelle/1" kind="s" icon="plus">{tr("Proposer une adresse")}</Button>
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
