import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CATS, DISTRICTS, type City } from '../data';
import { districtPos, requestPosition, setPos } from '../geo';
import { useStore } from '../store';
import { Button, DemoNote, Icon, Logo, RadioCard, Screen, TopBar } from '../ui';
import { ResultCard } from './Search';

interface InstallEvent extends Event { prompt: () => Promise<void> }

export function Home() {
  const { s, d } = useStore();
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  const featured = s.providers.filter((p) => p.featured && p.city === s.city);

  return (
    <Screen>
      <header className="hero" style={{ padding: '18px 16px 22px', gap: 16, borderRadius: '0 0 26px 26px' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Logo height={30} tail="GUIDE" />
          <span className="small" style={{ color: '#DCE6FA' }}>Bonjour {s.user?.name.split(' ')[0]}</span>
        </div>
        <div className="seg" role="group" aria-label="Ville">
          {(['Guangzhou', 'Shenzhen'] as City[]).map((c) => (
            <button key={c} type="button" className={s.city === c ? 'on' : ''} aria-pressed={s.city === c} onClick={() => d({ t: 'city', v: c })}>{s.city === c && '✓ '}{c}</button>
          ))}
        </div>
        <Link to={`/recherche?ville=${s.city}`} className="searchfake" aria-label="Rechercher un produit ou un service">
          <Icon name="search" /><span>Quel produit ou service cherchez-vous ?</span>
        </Link>
      </header>
      <main className="main" style={{ gap: 22, paddingTop: 20 }}>
        {!s.installDismissed && (
          <div className="install">
            <Icon name="download" size={22} />
            <div className="grow"><div style={{ fontWeight: 700, fontSize: 15 }}>Installer Diaba Guide</div><div className="small muted">Ajoutez le site à l’écran d’accueil de votre téléphone.</div></div>
            <button type="button" className="btn btn-s" style={{ minHeight: 44, fontSize: 14, padding: '0 12px' }}
              onClick={() => (evt ? evt.prompt() : alert('Sur iPhone : Partager > Sur l’écran d’accueil. Sur Android : menu du navigateur > Installer l’application.'))}>Installer</button>
            <button type="button" className="iconbtn" style={{ border: 0, background: 'transparent', color: 'var(--muted)' }} aria-label="Fermer la proposition d’installation" onClick={() => d({ t: 'dismissInstall' })}><Icon name="x" size={20} /></button>
          </div>
        )}
        <section aria-label="Catégories">
          <h2 className="display" style={{ fontSize: 19, marginBottom: 12 }}>Que cherchez-vous ?</h2>
          <div className="cattiles">
            {CATS.map((c, i) => (
              <Link key={c.id} to={`/recherche?cat=${c.id}&ville=${s.city}`} className={`cattile ${i === 4 ? 'wide' : ''}`}>
                <span className="ico"><Icon name={c.icon} size={24} /></span>{c.label}
              </Link>
            ))}
          </div>
        </section>
        <section className="stack">
          <h2 className="display" style={{ fontSize: 19 }}>Sélection Diaba · {s.city}</h2>
          {featured.map((p) => <ResultCard key={p.id} p={p} />)}
        </section>
        <section className="card sec">
          <h2 className="display" style={{ fontSize: 19 }}><Icon name="pin" size={22} />À proximité</h2>
          <p className="muted small" style={{ fontSize: 15 }}>Votre position n’est demandée que si vous activez la recherche à proximité. Vous pouvez aussi choisir un quartier à la main.</p>
          <Button to="/localisation" icon="pin">Activer la recherche à proximité</Button>
          <Link className="link center" style={{ justifyContent: 'center' }} to="/localisation">Choisir un quartier manuellement</Link>
        </section>
        <Button to="/contributions/nouvelle/1" kind="s" icon="plus">Proposer une adresse</Button>
        <DemoNote />
      </main>
    </Screen>
  );
}

export function Locate() {
  const { s } = useStore();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [district, setDistrict] = useState(DISTRICTS[s.city][0].name);
  const allow = async () => {
    setBusy(true);
    try { setPos(await requestPosition()); nav(`/recherche?ville=${s.city}&prox=10`); }
    catch { setPos(null); nav(`/recherche?ville=${s.city}&geo=err`); }
  };
  const manual = () => { setPos(districtPos(district)); nav(`/recherche?ville=${s.city}&prox=10`); };
  return (
    <Screen>
      <TopBar title="Près de vous" back={-1} />
      <div className="main" style={{ gap: 20 }}>
        <div className="card center-screen" style={{ padding: '24px 20px', flex: 'none' }}>
          <span className="bigcheck" style={{ width: 72, height: 72, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}><Icon name="pin" size={36} /></span>
          <div className="display" style={{ fontSize: 24 }}>Trouver les adresses autour de vous</div>
          <div className="muted">Diaba Guide utilise votre position uniquement pour calculer les distances. Vous pouvez refuser : la sélection manuelle reste disponible.</div>
          <Button icon="check" onClick={allow} disabled={busy}>{busy ? 'Localisation…' : 'Autoriser la localisation'}</Button>
        </div>
        <section className="stack"><h2 className="display" style={{ fontSize: 19 }}>Ou choisissez un quartier · {s.city}</h2>
          {DISTRICTS[s.city].map((x) => <RadioCard key={x.name} name="q" label={x.name} checked={district === x.name} onChange={() => setDistrict(x.name)} />)}
        </section>
        <Button kind="s" onClick={manual}>Voir les adresses de ce quartier</Button>
      </div>
    </Screen>
  );
}
