import { useI18n } from '../i18n';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { catIcon, catLabel, isFreight, tagLabel, type Cat, type City, type Freight, type Provider } from '../data';
import { distanceKm, fmtKm, getPos } from '../geo';
import { useOnline, useStore } from '../store';
import { Button, Chip, DemoNote, Field, Icon, Screen, Stars, StoredPhoto, useWide } from '../ui';
import { logSearch } from '../lib/searchLogs';

/* Termes déjà signalés pendant cette visite : on n'enregistre pas deux fois la
   même recherche quand le voyageur va et vient entre les résultats. */
const DEJA_LOGGES = new Set<string>();

export function ResultCard({ p, meta }: { p: Provider; meta?: string }) {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const fav = s.favorites.includes(p.id);
  return (
    <article className="rcard">
      <Link to={`/adresses/${p.id}`} className="rcard-link" aria-label={p.name} />
      <div className="rcard-body">
        <StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={104} w={104} round={12} />
        <div className="stack grow" style={{ gap: 3 }}>
          <span className="row" style={{ justifyContent: 'space-between', gap: 6 }}>
            <span className="name">{p.name}</span>
            <button type="button" className="rcard-fav" aria-pressed={fav} aria-label={tr(fav ? 'Retirer des favoris' : 'Ajouter aux favoris')}
              onClick={(e) => { e.preventDefault(); d({ t: 'fav', id: p.id }); }}>
              <Icon name="heart" size={18} sw={fav ? 0 : 2} fill={fav ? 'currentColor' : 'none'} />
            </button>
          </span>
          <span className="small muted zh">{p.cn}</span>
          <span className="small row" style={{ gap: 6 }}><Icon name={catIcon(p.cat)} size={16} sw={2} />{tr(catLabel(p.cat))} · {tr(p.district)}</span>
          <Stars avg={p.ratingAvg} count={p.ratingCount} size={14} />
        </div>
      </div>
      <div className="rcard-foot">
        <span className="rcard-verified"><Icon name="check" size={15} sw={2.4} />{tr(meta ?? `Vérifiée le ${p.verified}`)}</span>
        <span className="rcard-more">{tr("Fiche complète")} →</span>
      </div>
    </article>
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
      [p.name, p.cn, p.district, p.desc, ...(p.products ?? []), ...(p.services ?? []),
        ...(p.productTags ?? []).map(tagLabel), p.cuisine ?? '', p.goods ?? ''].join(' ').toLowerCase().includes(term));
  }
  if (q.fret && q.fret !== 'both') list = list.filter((x) => x.p.freight?.includes(q.fret as Freight));
  if (q.prox && Number(q.prox) > 0) list = list.filter((x) => x.km === null || x.km <= Number(q.prox));
  if (pos) list.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  return list;
}

export function Search() {
  const { tr } = useI18n();
  const { q, sp, setSp } = useQuery();
  const { s } = useStore();
  const nav = useNavigate();
  const wide = useWide();
  const online = useOnline();
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(0);
  const key = sp.toString();
  useEffect(() => { setLoading(true); const t = setTimeout(() => setLoading(false), 350); return () => clearTimeout(t); }, [key]);
  const list = useMemo(() => filterProviders(q, s.providers), [key, s.providers]);

  /* Journal des recherches (supabase/search_logs.sql) : on enregistre le terme
     et le nombre d'adresses trouvées, une fois qu'il s'est stabilisé — assez
     pour qu'une recherche tapée en entier soit comptée, sans compter chaque
     lettre. Le terme voyage avec sa ville et sa catégorie : c'est ce qui permet
     à l'équipe de voir quelles fiches manquent, et où. */
  useEffect(() => {
    if (loading) return;
    const terme = q.q.trim();
    if (terme.length < 2) return;
    const cle = `${terme.toLowerCase()}|${q.city}|${q.cat ?? ''}|${list.length}`;
    if (DEJA_LOGGES.has(cle)) return;
    const t = setTimeout(() => {
      DEJA_LOGGES.add(cle);
      void logSearch(terme, q.city, q.cat, list.length);
    }, 700);
    return () => clearTimeout(t);
  }, [loading, q.q, q.city, q.cat, list.length]);
  const nFilters = [q.cat, q.fret, q.prox].filter(Boolean).length;
  const set = (k: string, v: string | null) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); };
  const patch = (o: Record<string, string | null>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(o)) { if (v) n.set(k, v); else n.delete(k); } setSp(n, { replace: true }); };

  const body = () => {
    if (!online) {
      return (
        <div className="card center-screen" style={{ padding: 24 }}>
          <span className="bigcheck" style={{ width: 56, height: 56, background: 'var(--danger-bg)', border: 0, color: 'var(--danger)' }}><Icon name="wifioff" size={28} /></span>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{tr("Connexion impossible")}</div>
          <div className="muted">{tr("Vérifiez votre connexion internet, puis réessayez. Vos fiches téléchargées restent consultables.")}</div>
          <Button icon="refresh" onClick={() => location.reload()}>{tr("Réessayer")}</Button>
          <Button to="/favoris" kind="s" icon="download">{tr("Voir mes fiches hors connexion")}</Button>
        </div>
      );
    }
    if (loading) {
      return (
        <div role="status" className="stack">
          <div className="row" style={{ fontWeight: 600 }}><Icon name="refresh" size={20} />{tr("Recherche en cours…")}</div>
          {[0, 1, 2].map((i) => <div key={i} className="skeleton card"><i style={{ width: 72, height: 72 }} /><div className="stack grow" style={{ paddingTop: 6, gap: 8 }}><i style={{ height: 14, width: '70%' }} /><i style={{ height: 12, width: '45%' }} /><i style={{ height: 12, width: '60%' }} /></div></div>)}
        </div>
      );
    }
    return (
      <>
        {q.geo === 'err' && (
          <div role="alert" className="notice warn"><Icon name="alert" size={22} /><div><strong>{tr("Position indisponible")}</strong><div className="small">{tr("Les distances ne sont pas affichées. ")}<Link className="link" to="/localisation">{tr("Choisir un quartier")}</Link></div></div></div>
        )}
        <div role="status" className="small muted">{tr(list.length)} {tr(" adresse")}{tr(list.length > 1 ? 's' : '')}{tr(q.q ? ` pour « ${q.q} »` : '')} · {tr(q.city)}</div>
        {list.length === 0 ? (
          <div className="card center-screen" style={{ padding: 24 }}>
            <span className="bigcheck" style={{ width: 56, height: 56, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}><Icon name="search" size={28} /></span>
            <div style={{ fontWeight: 700, fontSize: 18 }}>{tr("Aucune adresse")}{tr(q.q ? ` pour « ${q.q} »` : '')}</div>
            <div className="muted">{tr("Essayez un autre mot, changez de ville ou retirez un filtre.")}</div>
            <Button kind="s" onClick={() => nav('/recherche/filtres?' + key)}>{tr("Modifier la recherche")}</Button>
            <Button to="/contributions/nouvelle/1" icon="plus">{tr("Proposer une adresse")}</Button>
          </div>
        ) : q.view === 'carte' && !wide ? (
          <MapView list={list} sel={sel} setSel={setSel} />
        ) : (
          list.map(({ p, km }) => <ResultCard key={p.id} p={p} meta={`${km !== null ? fmtKm(km) + ' · ' : ''}Vérifiée le ${p.verified}`} />)
        )}
        {q.view === 'carte' && !wide && list.length > 0 && <Button kind="t" icon="list" onClick={() => set('view', null)}>{tr("Afficher les résultats en liste")}</Button>}
        <DemoNote />
      </>
    );
  };

  return (
    <Screen wide>
      <header className="stack search-head">
        <div className="row">
          <button type="button" className="iconbtn m-only" aria-label={tr("Retour à l’accueil")} onClick={() => nav('/accueil')}><Icon name="chevL" size={24} sw={2.2} /></button>
          <label htmlFor="q" className="sr">{tr("Recherche")}</label>
          <input id="q" type="search" className="grow" value={q.q} placeholder={tr("Quel produit ou service cherchez-vous ?")} onChange={(e) => set('q', e.target.value || null)}
            style={{ minHeight: 48, padding: '0 14px', borderRadius: 12, border: '1.5px solid var(--primary)', font: 'inherit', fontSize: 16 }} />
        </div>
        <div className="seg m-only" role="group" aria-label={tr("Affichage")}>
          <button type="button" className={q.view === 'liste' ? 'on' : ''} onClick={() => set('view', null)}><Icon name="list" size={18} />{tr("Liste")}</button>
          <button type="button" className={q.view === 'carte' ? 'on' : ''} onClick={() => set('view', 'carte')}><Icon name="map" size={18} />{tr("Carte")}</button>
        </div>
        <div className="chips m-only" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
          <Chip on icon="sliders" to={'/recherche/filtres?' + key}>{tr("Filtres")}{tr(nFilters ? ` · ${nFilters}` : '')}</Chip>
          <Chip>{tr(q.city)}</Chip>
          {q.cat && <Chip>{tr(catLabel(q.cat))}</Chip>}
          {q.prox && <Chip icon="pin">{tr(Number(q.prox) > 0 ? `< ${q.prox} km` : 'Toute la ville')}</Chip>}
        </div>
      </header>
      <div className="search-layout">
        <aside className="search-filters" aria-label={tr("Filtres")}><FilterPanel q={q} patch={patch} onReset={() => setSp(new URLSearchParams(), { replace: true })} /></aside>
        <main className="main">{tr(body())}</main>
        <aside className="search-map">{online && !loading && list.length > 0 && <MapView list={list} sel={sel} setSel={setSel} />}</aside>
      </div>
    </Screen>
  );
}

/* Filtres en colonne (ordinateur) : chaque choix met l'URL à jour immédiatement. */
function FilterPanel({ q, patch, onReset }: { q: ReturnType<typeof useQuery>['q']; patch: (o: Record<string, string | null>) => void; onReset: () => void }) {
  const { tr } = useI18n();
  const { s } = useStore();
  const radios = (name: string, val: string, opts: { v: string; l: string }[], on: (v: string) => void) => (
    <div className="chips">
      {opts.map((o) => (
        <label key={o.v} className={`chip ${val === o.v ? 'on' : ''}`}>
          <input type="radio" name={name} checked={val === o.v} onChange={() => on(o.v)} className="sr" />{val === o.v && <Icon name="check" size={16} sw={2.4} />}{tr(o.l)}
        </label>
      ))}
    </div>
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ fontSize: 19 }}>{tr("Filtres")}</h2>
        <button type="button" className="link" onClick={onReset}>{tr("Réinitialiser")}</button>
      </div>
      <section className="stack"><h3 style={{ fontSize: 16 }}>{tr("Catégorie")}</h3>
        {radios('pcat', q.cat ?? '', [{ v: '', l: 'Toutes' }, ...s.categories.filter((c) => c.active).map((c) => ({ v: c.id as string, l: c.label }))], (v) => patch({ cat: v || null, fret: null }))}
      </section>
      <section className="stack"><h3 style={{ fontSize: 16 }}>{tr("Ville")}</h3>
        {radios('pville', q.city, s.cities.filter((c) => c.active).map((c) => ({ v: c.id as string, l: c.name })), (v) => patch({ ville: v }))}
      </section>
      <section className="stack"><h3 style={{ fontSize: 16 }}>{tr("Proximité")}</h3>
        {radios('pprox', q.prox ?? '0', [{ v: '2', l: 'Moins de 2 km' }, { v: '5', l: 'Moins de 5 km' }, { v: '10', l: 'Moins de 10 km' }, { v: '0', l: 'Toute la ville' }], (v) => patch({ prox: v === '0' ? null : v }))}
        <div className="hint">{tr("Le rayon s’applique quand la position ou un quartier est choisi.")}</div>
      </section>
      {q.cat && isFreight(q.cat) && (
        <section className="stack"><h3 style={{ fontSize: 16 }}>{tr("Fret vers le Sénégal")}</h3>
          {radios('pfret', q.fret ?? 'both', [{ v: 'air', l: 'Aérien' }, { v: 'sea', l: 'Maritime' }, { v: 'both', l: 'Les deux' }], (v) => patch({ fret: v === 'both' ? null : v }))}
        </section>
      )}
    </div>
  );
}

function MapView({ list, sel, setSel }: { list: { p: Provider; km: number | null }[]; sel: number; setSel: (i: number) => void }) {
  const { tr } = useI18n();
  const W = 358, H = 340, pad = 40;
  const lats = list.map((x) => x.p.lat), lngs = list.map((x) => x.p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const sx = (lng: number) => pad + ((lng - minLng) / Math.max(maxLng - minLng, 0.001)) * (W - 2 * pad);
  const sy = (lat: number) => H - pad - ((lat - minLat) / Math.max(maxLat - minLat, 0.001)) * (H - 2 * pad);
  const cur = list[Math.min(sel, list.length - 1)];
  return (
    <>
      {/* Carte illustrative : brancher ici le fournisseur de cartes retenu (adapté à la Chine). */}
      <svg className="map" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tr("Carte illustrative des résultats")}>
        <path d="M-10 230 C80 190 150 280 240 230 S340 180 370 210" stroke="#BCD1F0" strokeWidth="38" fill="none" />
        <path d="M0 80 H358 M0 290 H358 M70 0 V340 M200 0 V340 M290 0 V340" stroke="#fff" strokeWidth="9" fill="none" />
        {list.map(({ p }, i) => (
          <g key={p.id} onClick={() => setSel(i)} style={{ cursor: 'pointer' }} role="button" aria-label={tr(`${i + 1}. ${p.name}`)}>
            {i === sel && <circle cx={sx(p.lng)} cy={sy(p.lat)} r="24" fill="none" stroke="#B48A2C" strokeWidth="3" />}
            <circle cx={sx(p.lng)} cy={sy(p.lat)} r="17" fill={i === sel ? '#153E9F' : '#fff'} stroke="#153E9F" strokeWidth="3" />
            <text x={sx(p.lng)} y={sy(p.lat) + 6} textAnchor="middle" fontSize="16" fontWeight="700" fill={i === sel ? '#fff' : '#153E9F'}>{tr(i + 1)}</text>
          </g>
        ))}
        <text x="12" y={H - 10} fontSize="12" fill="#3A4760">{tr("Carte illustrative")}</text>
      </svg>
      <div className="row card" style={{ borderColor: 'var(--primary)', borderWidth: 1.5, padding: 12, alignItems: 'flex-start' }}>
        <StoredPhoto bucket="fiche-photos" path={cur?.p.photoPaths?.[0]} label={tr("Photo")} h={84} w={84} round={12} />
        <div className="stack grow" style={{ gap: 2 }}>
          <span className="small" style={{ fontWeight: 700, color: 'var(--gold-text)' }}>{tr("Adresse ")}{tr(Math.min(sel, list.length - 1) + 1)} {tr(" sur ")}{tr(list.length)}</span>
          <span style={{ fontWeight: 700, fontSize: 17 }}>{tr(cur.p.name)}</span>
          <span className="small muted">{tr(cur.p.district)}{tr(cur.km !== null ? ` · ${fmtKm(cur.km)}` : '')} {tr(" · Vérifiée le ")}{tr(cur.p.verified)}</span>
          <Link className="link" to={`/adresses/${cur.p.id}`}>{tr("Ouvrir la fiche")}</Link>
        </div>
      </div>
    </>
  );
}

/* Feuille de filtres : modifie les mêmes paramètres d’URL, puis revient aux résultats. */
export function Filters() {
  const { tr } = useI18n();
  const { q, sp } = useQuery();
  const { s } = useStore();
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
          <input type="radio" name={name} checked={val === o.v} onChange={() => on(o.v)} className="sr" />{val === o.v && <Icon name="check" size={16} sw={2.4} />}{tr(o.l)}
        </label>
      ))}
    </div>
  );
  return (
    <Screen>
      <header className="topbar">
        <button type="button" className="iconbtn" aria-label={tr("Retour")} onClick={() => nav(-1)}><Icon name="chevL" size={24} sw={2.2} /></button>
        <h1>{tr("Filtres")}</h1>
        <button type="button" className="link" onClick={() => nav('/recherche')}>{tr("Réinitialiser")}</button>
      </header>
      <div className="main" style={{ gap: 20 }}>
        <Field id="prod" label={tr("Produit ou service")} value={f.q} onChange={(v) => setF({ ...f, q: v })} />
        <section className="stack"><h2 style={{ fontSize: 17 }}>{tr("Catégorie")}</h2>
          {tr(radios<string>('cat', f.cat ?? '', [{ v: '', l: 'Toutes' }, ...s.categories.filter((c) => c.active).map((c) => ({ v: c.id as string, l: c.label }))], (v) => setF({ ...f, cat: (v || null) as Cat | null })))}
        </section>
        <section className="stack"><h2 style={{ fontSize: 17 }}>{tr("Ville")}</h2>
          {tr(radios<City>('ville', f.city, s.cities.filter((c) => c.active).map((c) => ({ v: c.id, l: c.name })), (v) => setF({ ...f, city: v })))}
        </section>
        <section className="stack"><h2 style={{ fontSize: 17 }}>{tr("Proximité")}</h2>
          {tr(radios('prox', f.prox, [{ v: '2', l: 'Moins de 2 km' }, { v: '5', l: 'Moins de 5 km' }, { v: '10', l: 'Moins de 10 km' }, { v: '0', l: 'Toute la ville' }], (v) => setF({ ...f, prox: v })))}
          <div className="hint">{tr("Le rayon s’applique quand la position ou un quartier est choisi.")}</div>
        </section>
        {f.cat && isFreight(f.cat) && (
          <section className="card sec"><h2><Icon name="ship" size={20} />{tr("Fret vers le Sénégal")}</h2>
            <div className="hint">{tr("Disponible pour les transporteurs.")}</div>
            {tr(radios('fret', f.fret, [{ v: 'air', l: 'Aérien' }, { v: 'sea', l: 'Maritime' }, { v: 'both', l: 'Les deux' }], (v) => setF({ ...f, fret: v as Freight | 'both' })))}
          </section>
        )}
        <Button onClick={apply}>{tr("Afficher les résultats")}</Button>
      </div>
    </Screen>
  );
}
