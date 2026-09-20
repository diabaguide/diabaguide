import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CATS, catIcon, catLabel, isFreight, type Cat, type City, type Freight, type Provider } from '../data';
import { distanceKm, fmtKm, getPos } from '../geo';
import { useOnline, useStore } from '../store';
import { Button, Chip, DemoNote, Field, Icon, Photo, Screen } from '../ui';

export function ResultCard({ p, meta }: { p: Provider; meta?: string }) {
  return (
    <Link to={`/adresses/${p.id}`} className="rcard">
      <Photo label="Photo" h={104} w={104} round={12} />
      <div className="stack grow" style={{ gap: 3 }}>
        <span className="name">{p.name}</span>
        <span className="small muted zh">{p.cn}</span>
        <span className="small row" style={{ gap: 6 }}><Icon name={catIcon(p.cat)} size={16} sw={2} />{catLabel(p.cat)} · {p.district}</span>
        <span className="meta">{meta ?? `Vérifiée le ${p.verified}`}</span>
      </div>
    </Link>
  );
}

/* Paramètres de recherche dans l’URL : la requête est conservée en revenant d’une fiche. */
export function useQuery() {
  const [sp, setSp] = useSearchParams();
  const { s } = useStore();
  const q = {
    q: sp.get('q') ?? '',
    city: (sp.get('ville') as City) || s.city,
    cat: (sp.get('cat') as Cat | null) || null,
    fret: (sp.get('fret') as Freight | 'both' | null) || null,
    prox: sp.get('prox') || null, // rayon en km, ou « 0 » = toute la ville
    view: sp.get('view') === 'carte' ? 'carte' : 'liste',
    geo: sp.get('geo'),
  };
  return { q, sp, setSp };
}

function filterProviders(q: ReturnType<typeof useQuery>['q'], providers: Provider[]) {
  const pos = getPos();
  const term = q.q.trim().toLowerCase();
  let list = providers.filter((p) => p.city === q.city).map((p) => ({ p, km: pos ? distanceKm(pos, p) : null }));
  if (q.cat) list = list.filter((x) => x.p.cat === q.cat);
  if (term) {
    list = list.filter(({ p }) =>
      [p.name, p.cn, p.district, p.desc, ...(p.products ?? []), ...(p.services ?? []), p.cuisine ?? '', p.goods ?? ''].join(' ').toLowerCase().includes(term));
  }
  if (q.fret && q.fret !== 'both') list = list.filter((x) => x.p.freight?.includes(q.fret as Freight));
  if (q.prox && Number(q.prox) > 0) list = list.filter((x) => x.km === null || x.km <= Number(q.prox));
  if (pos) list.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  return list;
}

export function Search() {
  const { q, sp, setSp } = useQuery();
  const { s } = useStore();
  const nav = useNavigate();
  const online = useOnline();
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(0);
  const key = sp.toString();
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 350); return () => clearTimeout(t); }, [key]);
  const list = useMemo(() => filterProviders(q, s.providers), [key, s.providers]);
  const nFilters = [q.cat, q.fret, q.prox].filter(Boolean).length;
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };

  const body = () => {
    if (!online) {
      return (
        <div className="card center-screen" style={{ padding: 24 }}>
          <span className="bigcheck" style={{ width: 56, height: 56, background: 'var(--danger-bg)', border: 0, color: 'var(--danger)' }}><Icon name="wifioff" size={28} /></span>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Connexion impossible</div>
          <div className="muted">Vérifiez votre connexion internet, puis réessayez. Vos fiches téléchargées restent consultables.</div>
          <Button icon="refresh" onClick={() => location.reload()}>Réessayer</Button>
          <Button to="/favoris" kind="s" icon="download">Voir mes fiches hors connexion</Button>
        </div>
      );
    }
    if (loading) {
      return (
        <div role="status" className="stack">
          <div className="row" style={{ fontWeight: 600 }}><Icon name="refresh" size={20} />Recherche en cours…</div>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton card"><i style={{ width: 72, height: 72 }} /><div className="stack grow" style={{ paddingTop: 6, gap: 8 }}><i style={{ height: 14, width: '70%' }} /><i style={{ height: 12, width: '45%' }} /><i style={{ height: 12, width: '60%' }} /></div></div>)}
        </div>
      );
    }
    return (
      <>
        {q.geo === 'err' && (
          <div role="alert" className="notice warn"><Icon name="alert" size={22} /><div><strong>Position indisponible</strong><div className="small">Les distances ne sont pas affichées. <Link className="link" to="/localisation">Choisir un quartier</Link></div></div></div>
        )}
        <div role="status" className="small muted">{list.length} adresse{list.length > 1 ? 's' : ''}{q.q ? ` pour « ${q.q} »` : ''} · {q.city}</div>
        {list.length === 0 ? (
          <div className="card center-screen" style={{ padding: 24 }}>
            <span className="bigcheck" style={{ width: 56, height: 56, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}><Icon name="search" size={28} /></span>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Aucune adresse{q.q ? ` pour « ${q.q} »` : ''}</div>
            <div className="muted">Essayez un autre mot, changez de ville ou retirez un filtre.</div>
            <Button kind="s" onClick={() => nav('/recherche/filtres?' + key)}>Modifier la recherche</Button>
            <Button to="/contributions/nouvelle/1" icon="plus">Proposer une adresse</Button>
          </div>
        ) : q.view === 'carte' ? (
          <MapView list={list} sel={sel} setSel={setSel} />
        ) : (
          list.map(({ p, km }) => <ResultCard key={p.id} p={p} meta={`${km !== null ? fmtKm(km) + ' · ' : ''}Vérifiée le ${p.verified}`} />)
        )}
        {q.view === 'carte' && list.length > 0 && <Button kind="t" icon="list" onClick={() => set('view', null)}>Afficher les résultats en liste</Button>}
        <DemoNote />
      </>
    );
  };

  return (
    <Screen>
      <header className="stack" style={{ padding: '16px 16px 8px' }}>
        <div className="row">
          <button type="button" className="iconbtn" aria-label="Retour à l’accueil" onClick={() => nav('/accueil')}><Icon name="chevL" size={24} sw={2.2} /></button>
          <label htmlFor="q" className="sr">Recherche</label>
          <input id="q" type="search" className="grow" value={q.q} placeholder="Quel produit ou service cherchez-vous ?" onChange={(e) => set('q', e.target.value || null)}
            style={{ minHeight: 48, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--primary)', font: 'inherit', fontSize: 16 }} />
        </div>
        <div className="seg" role="group" aria-label="Affichage">
          <button type="button" className={q.view === 'liste' ? 'on' : ''} onClick={() => set('view', null)}><Icon name="list" size={18} />Liste</button>
          <button type="button" className={q.view === 'carte' ? 'on' : ''} onClick={() => set('view', 'carte')}><Icon name="map" size={18} />Carte</button>
        </div>
        <div className="chips" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Chip on icon="sliders" to={'/recherche/filtres?' + key}>Filtres{nFilters ? ` · ${nFilters}` : ''}</Chip>
          <Chip>{q.city}</Chip>
          {q.cat && <Chip>{catLabel(q.cat)}</Chip>}
          {q.prox && <Chip icon="pin">{Number(q.prox) > 0 ? `< ${q.prox} km` : 'Toute la ville'}</Chip>}
        </div>
      </header>
      <main className="main">{body()}</main>
    </Screen>
  );
}

function MapView({ list, sel, setSel }: { list: { p: Provider; km: number | null }[]; sel: number; setSel: (i: number) => void }) {
  const W = 358, H = 340, pad = 40;
  const lats = list.map((x) => x.p.lat), lngs = list.map((x) => x.p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sx = (lng: number) => pad + ((lng - minLng) / Math.max(maxLng - minLng, 0.001)) * (W - 2 * pad);
  const sy = (lat: number) => H - pad - ((lat - minLat) / Math.max(maxLat - minLat, 0.001)) * (H - 2 * pad);
  const cur = list[Math.min(sel, list.length - 1)];
  return (
    <>
      {/* Carte illustrative : brancher ici le fournisseur de cartes retenu (adapté à la Chine). */}
      <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Carte illustrative des résultats">
        <path d="M-10 230 C80 190 150 280 240 230 S340 180 370 210" stroke="#BCD1F0" strokeWidth="38" fill="none" />
        <path d="M0 80 H358 M0 290 H358 M70 0 V340 M200 0 V340 M290 0 V340" stroke="#fff" strokeWidth="9" fill="none" />
        {list.map(({ p }, i) => (
          <g key={p.id} onClick={() => setSel(i)} style={{ cursor: 'pointer' }} role="button" aria-label={`${i + 1}. ${p.name}`}>
            {i === sel && <circle cx={sx(p.lng)} cy={sy(p.lat)} r="24" fill="none" stroke="#B48A2C" strokeWidth="3" />}
            <circle cx={sx(p.lng)} cy={sy(p.lat)} r="17" fill={i === sel ? '#153E9F' : '#fff'} stroke="#153E9F" strokeWidth="3" />
            <text x={sx(p.lng)} y={sy(p.lat) + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill={i === sel ? '#fff' : '#153E9F'}>{i + 1}</text>
          </g>
        ))}
        <text x="12" y={H - 10} fontSize="12" fill="#3A4760">Carte illustrative</text>
      </svg>
      <div className="row card" style={{ borderColor: 'var(--primary)', borderWidth: 1.5, padding: 12, alignItems: 'flex-start' }}>
        <Photo label="Photo" h={84} w={84} round={12} />
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="small" style={{ fontWeight: 700, color: 'var(--gold-text)' }}>Adresse {Math.min(sel, list.length - 1) + 1} sur {list.length}</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{cur.p.name}</span>
          <span className="small muted">{cur.p.district}{cur.km !== null ? ` · ${fmtKm(cur.km)}` : ''} · Vérifiée le {cur.p.verified}</span>
          <Link className="link" to={`/adresses/${cur.p.id}`}>Ouvrir la fiche</Link>
        </div>
      </div>
    </>
  );
}

/* Feuille de filtres : modifie les mêmes paramètres d’URL, puis revient aux résultats. */
export function Filters() {
  const { q, sp } = useQuery();
  const nav = useNavigate();
  const [f, setF] = useState({ q: q.q, cat: q.cat, city: q.city, prox: q.prox ?? '0', fret: q.fret ?? 'both' });
  const apply = () => {
    const n = new URLSearchParams();
    if (f.q) n.set('q', f.q);
    if (f.cat) n.set('cat', f.cat);
    n.set('ville', f.city);
    if (f.prox !== '0') n.set('prox', f.prox);
    if (f.cat && isFreight(f.cat) && f.fret !== 'both') n.set('fret', f.fret);
    if (sp.get('view')) n.set('view', sp.get('view')!);
    nav('/recherche?' + n.toString());
  };
  const radios = <T extends string>(name: string, val: T, opts: { v: T; l: string }[], on: (v: T) => void) => (
    <div className="chips">
      {opts.map((o) => (
        <label key={o.v} className={`chip ${val === o.v ? 'on' : ''}`}>
          <input type="radio" name={name} checked={val === o.v} onChange={() => on(o.v)} className="sr" />{val === o.v && <Icon name="check" size={16} sw={2.4} />}{o.l}
        </label>
      ))}
    </div>
  );
  return (
    <Screen>
      <header className="topbar">
        <button type="button" className="iconbtn" aria-label="Retour" onClick={() => nav(-1)}><Icon name="chevL" size={24} sw={2.2} /></button>
        <h1>Filtres</h1>
        <button type="button" className="link" onClick={() => nav('/recherche')}>Réinitialiser</button>
      </header>
      <div className="main" style={{ gap: 20 }}>
        <Field id="prod" label="Produit ou service" value={f.q} onChange={(v) => setF({ ...f, q: v })} />
        <section className="stack"><h2 style={{ fontSize: 17 }}>Catégorie</h2>
          {radios<string>('cat', f.cat ?? '', [{ v: '', l: 'Toutes' }, ...CATS.map((c) => ({ v: c.id as string, l: c.label }))], (v) => setF({ ...f, cat: (v || null) as Cat | null }))}
        </section>
        <section className="stack"><h2 style={{ fontSize: 17 }}>Ville</h2>
          {radios<City>('ville', f.city, [{ v: 'Guangzhou', l: 'Guangzhou' }, { v: 'Shenzhen', l: 'Shenzhen' }], (v) => setF({ ...f, city: v }))}
        </section>
        <section className="stack"><h2 style={{ fontSize: 17 }}>Proximité</h2>
          {radios('prox', f.prox, [{ v: '2', l: 'Moins de 2 km' }, { v: '5', l: 'Moins de 5 km' }, { v: '10', l: 'Moins de 10 km' }, { v: '0', l: 'Toute la ville' }], (v) => setF({ ...f, prox: v }))}
          <div className="hint">Le rayon s’applique quand la position ou un quartier est choisi.</div>
        </section>
        {f.cat && isFreight(f.cat) && (
          <section className="card sec"><h2><Icon name="ship" size={20} />Fret vers le Sénégal</h2>
            <div className="hint">Disponible pour les transporteurs et les transitaires.</div>
            {radios('fret', f.fret, [{ v: 'air', l: 'Aérien' }, { v: 'sea', l: 'Maritime' }, { v: 'both', l: 'Les deux' }], (v) => setF({ ...f, fret: v as Freight | 'both' }))}
          </section>
        )}
        <Button onClick={apply}>Afficher les résultats</Button>
      </div>
    </Screen>
  );
}
