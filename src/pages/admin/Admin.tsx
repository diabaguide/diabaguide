import { useI18n } from '../../i18n';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { STATUSES, catLabel, cityName, type Cat, type City, type Provider, type Proposal, type Status } from '../../data';
import { useStore } from '../../store';
import { signOut } from '../../lib/auth';
import { FilePick, MAX_PHOTOS } from '../Contribute';
import { Button, DemoNote, Field, Icon, Logo, Photo, Section, Select, StatusBadge, StoredPhoto, Tag, TextArea } from '../../ui';

/* Toutes les propositions vues par l’équipe (hors brouillons des voyageurs).
   Pour un compte équipe, `s.proposals` contient déjà toutes les propositions
   soumises (chargées depuis Supabase via la RLS équipe). */
function useTeamAll(): Proposal[] {
  const { s } = useStore();
  return useMemo(() => s.proposals.filter((p) => p.status !== 'Brouillon'), [s.proposals]);
}
const ageHours = (p: Proposal) => {
  const m = /(\d+) sept/.exec(p.date);
  return m ? Math.max(0, (20 - Number(m[1])) * 24 + 8) : 0;
};
const ageLabel = (h: number) => (h < 24 ? `Il y a ${h} h` : `Il y a ${Math.round(h / 24)} jour${h >= 48 ? 's' : ''}`);

function dupCandidates(p: Proposal, providers: Provider[], term?: string) {
  const t = (term ?? p.name.split(' ')[0]).trim().toLowerCase();
  if (!t) return [];
  return providers.filter((x) => `${x.name} ${x.cn} ${x.tel ?? ''} ${x.wechat ?? ''}`.toLowerCase().includes(t))
    .map((x) => ({ x, why: p.tel && x.tel === p.tel ? 'Même numéro de téléphone' : 'Nom proche · même quartier ou même ville' }));
}

const COLLAPSE_KEY = 'diaba-admin-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

export function AdminLayout() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const [gq, setGq] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const isAdmin = s.user?.role === 'admin';
  const items: [string, string, Parameters<typeof Icon>[0]['name'], boolean][] = [
    ['/equipe', 'Tableau de bord', 'grid', true], ['/equipe/propositions', 'Propositions', 'inbox', false], ['/equipe/fiches', 'Fiches', 'list', false], ['/equipe/historique', 'Historique des décisions', 'history', false],
    // Administration : réservée au rôle admin.
    ...(isAdmin ? ([
      ['/equipe/suppressions', s.pendingDeletion.length ? `Suppressions (${s.pendingDeletion.length})` : 'Suppressions', 'trash', false],
      ['/equipe/membres', 'Membres', 'users', false],
      ['/equipe/villes', 'Villes', 'pin', false],
      ['/equipe/categories', 'Catégories', 'grid', false],
      ['/equipe/produits', 'Produits et services', 'list', false],
    ] as [string, string, Parameters<typeof Icon>[0]['name'], boolean][]) : []),
  ];
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* stockage indisponible */ } return !c; });
  const submitSearch = (e: FormEvent) => { e.preventDefault(); nav(`/equipe/propositions${gq.trim() ? `?q=${encodeURIComponent(gq.trim())}` : ''}`); };
  return (
    <div className={`admin${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
      <aside id="admin-menu">
        <div className="stack" style={{ gap: 8 }}><Logo height={44} /><span className="admin-tag">{tr("GUIDE · ÉQUIPE")}</span></div>
        <nav aria-label={tr("Navigation équipe")}>
          {items.map(([to, l, i, end]) => <NavLink key={to} to={to} end={end} title={tr(l)} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={i} /><span className="lbl">{tr(l)}</span></NavLink>)}
        </nav>
        <button type="button" className="collapse-btn" aria-pressed={collapsed} aria-label={tr(collapsed ? 'Agrandir le menu' : 'Réduire le menu')} title={tr(collapsed ? 'Agrandir le menu' : 'Réduire le menu')} onClick={toggle}><Icon name={collapsed ? 'chevR' : 'chevL'} size={20} /><span className="lbl">{tr("Réduire le menu")}</span></button>
        <div className="me">
          <span className="avatar">{tr((s.user?.name ?? '?').split(/[\s.]+/).map((x) => x[0]?.toUpperCase()).slice(0, 2).join(''))}</span>
          <div className="grow lbl"><div style={{ fontWeight: 600 }}>{s.user?.name}</div><div className="small" style={{ color: '#DCE6FA' }}>{tr(isAdmin ? 'Administrateur' : 'Vérification')}</div></div>
          <button type="button" className="iconbtn" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} aria-label={tr("Se déconnecter")} onClick={async () => { await signOut(); d({ t: 'logout' }); nav('/'); }}><Icon name="logout" size={20} /></button>
        </div>
      </aside>
      {open && <div className="admin-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="admin-main">
        <div className="admin-top">
          <button type="button" className="iconbtn menu-btn" aria-label={tr("Menu")} aria-expanded={open} aria-controls="admin-menu" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <form role="search" className="admin-search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <input ref={searchRef} type="search" value={gq} onChange={(e) => setGq(e.target.value)} aria-label={tr("Rechercher dans les propositions")} placeholder={tr("Rechercher dans les propositions")} />
            <kbd aria-hidden="true">/</kbd>
          </form>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

const Head = ({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) => { const { tr } = useI18n(); return ((
  <header className="admin-head"><div><h1>{tr(title)}</h1><div className="muted" style={{ marginTop: 4 }}>{tr(sub)}</div></div>{right}</header>
)); };

export function AdminDashboard() {
  const { tr } = useI18n();
  const all = useTeamAll();
  const n = (st: Status) => all.filter((p) => p.status === st).length;
  const queue = all.filter((p) => p.status === 'Soumise' || p.status === 'En vérification').sort((a, b) => ageHours(b) - ageHours(a)).slice(0, 5);
  const tiles: [Parameters<typeof Icon>[0]['name'], number, string, string][] = [
    ['send', n('Soumise'), 'Soumises', 'À prendre en charge'], ['eye', n('En vérification'), 'En vérification', 'En cours'],
    ['alert', n('Complément demandé'), 'Complément demandé', 'En attente du contributeur'], ['check', n('Publiée'), 'Publiées', 'Depuis le début du mois'],
  ];
  return (
    <>
      <Head title={tr("Tableau de bord")} sub={tr("Propositions des contributeurs à vérifier avant publication.")} right={<Button to="/equipe/propositions" icon="inbox" full={false}>{tr("Voir toutes les propositions")}</Button>} />
      <div className="admin-body">
        <div className="tiles">
          {tiles.map(([i, v, l, note]) => (
            <div key={l} className="card tile stack" style={{ gap: 6 }}><div className="row muted" style={{ fontWeight: 600 }}><Icon name={i} size={20} />{tr(l)}</div><div className="n">{tr(v)}</div><div className="small muted">{tr(note)}</div></div>
          ))}
        </div>
        <section className="stack">
          <h2 className="display" style={{ fontSize: 20 }}>{tr("Propositions à traiter en priorité")}</h2>
          <div className="table"><table>
            <thead><tr><th>{tr("Proposition")}</th><th>{tr("Catégorie et ville")}</th><th>{tr("Ancienneté")}</th><th /></tr></thead>
            <tbody>
              {queue.map((p) => {
                const h = ageHours(p);
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td>
                    <td>{tr(catLabel(p.cat))} · {tr(cityName(p.city))}</td>
                    <td>{h > 48 ? <span className="warntext"><Icon name="clock" size={16} sw={2.2} />{tr(ageLabel(h))} {tr(" · Objectif de 48 h dépassé")}</span> : <span className="row" style={{ gap: 6 }}><Icon name="clock" size={16} />{tr(ageLabel(h))}</span>}</td>
                    <td><Link className="link" to={`/equipe/propositions/${p.id}`}>{tr("Examiner")}<Icon name="chevR" size={18} sw={2.4} /></Link></td>
                  </tr>
                );
              })}
              {queue.length === 0 && <tr><td colSpan={4} className="center muted">{tr("Rien à traiter pour le moment.")}</td></tr>}
            </tbody>
          </table></div>
          <div className="small muted">{tr("L’objectif de 48 heures est indicatif.")}</div>
        </section>
        <DemoNote />
      </div>
    </>
  );
}

type SortKey = 'name' | 'cat' | 'city' | 'status' | 'date' | 'dup';
type Bulk = null | 'publish' | 'refuse' | 'complement';
const actionable = (p: Proposal) => p.status === 'Soumise' || p.status === 'En vérification';

export function AdminList() {
  const { tr, t } = useI18n();
  const all = useTeamAll();
  const { s, api } = useStore();
  const [params] = useSearchParams();
  const [city, setCity] = useState<'' | City>('');
  const [cat, setCat] = useState<'' | Cat>('');
  const [st, setSt] = useState<'' | Status>('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'date', dir: -1 });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Bulk>(null);
  const [motif, setMotif] = useState('Informations insuffisantes');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; ko: number } | null>(null);
  useEffect(() => { setQ(params.get('q') ?? ''); }, [params]);
  useEffect(() => {
    if (!bulk) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setBulk(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bulk]);
  const dups = useMemo(() => new Map(all.map((p) => [p.id, dupCandidates(p, s.providers).length > 0])), [all, s.providers]);
  const rows = useMemo(() => {
    const val = (p: Proposal): string | number => {
      switch (sort.k) {
        case 'name': return p.name.toLowerCase();
        case 'cat': return catLabel(p.cat).toLowerCase();
        case 'city': return cityName(p.city).toLowerCase();
        case 'status': return p.status;
        case 'dup': return dups.get(p.id) ? 1 : 0;
        default: return ageHours(p);
      }
    };
    return all
      .filter((p) => (!city || p.city === city) && (!cat || p.cat === cat) && (!st || p.status === st) &&
        (!q || `${p.name} ${p.cn} ${p.tel} ${p.wechat}`.toLowerCase().includes(q.toLowerCase())))
      .sort((a, b) => {
        if (sort.k === 'date' && actionable(a) !== actionable(b)) return actionable(a) ? -1 : 1;
        const x = val(a), y = val(b);
        return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
      });
  }, [all, city, cat, st, q, sort, dups]);
  const canSelect = rows.filter(actionable);
  const picked = canSelect.filter((p) => sel.has(p.id));
  const allPicked = canSelect.length > 0 && picked.length === canSelect.length;
  const blocked = picked.filter((p) => dups.get(p.id) || !p.name.trim() || !p.loc.trim());
  const filtered = !!(city || cat || st || q);
  const reset = () => { setCity(''); setCat(''); setSt(''); setQ(''); };
  const toggleSort = (k: SortKey) => setSort((c) => (c.k === k ? { k, dir: c.dir === 1 ? -1 : 1 } : { k, dir: 1 }));
  const toggleOne = (id: string) => setSel((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSel(allPicked ? new Set() : new Set(canSelect.map((p) => p.id)));
  const th = (k: SortKey, label: string) => (
    <th aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sortbtn" onClick={() => toggleSort(k)}>{tr(label)}<span className="arrow" aria-hidden="true">{sort.k === k ? (sort.dir === 1 ? '▲' : '▼') : '↕'}</span></button>
    </th>
  );
  const run = async (status: Status, note: string) => {
    setBusy(true);
    const res = await Promise.allSettled(picked.map((p) => api.decide(p.id, status, note)));
    const ko = res.filter((r) => r.status === 'rejected').length;
    setResult({ ok: res.length - ko, ko });
    setSel(new Set());
    setBulk(null);
    setBusy(false);
  };
  const n = picked.length;
  const dlgCfg = bulk && {
    publish: { title: t('Publier {0} adresse(s) ?', { 0: n }), icon: 'check' as const, ok: 'Confirmer la publication', kind: 'p' as const, disabled: blocked.length > 0,
      go: () => run('Publiée', 'Fiche créée et publiée.'),
      body: blocked.length > 0
        ? <div className="notice warn"><Icon name="alert" size={20} /><span>{t('{0} proposition(s) avec un doublon possible ou incomplète(s) ne peuvent pas être publiées en lot. Ouvrez-les une par une.', { 0: blocked.length })}</span></div>
        : <p>{tr("Ces fiches deviendront visibles par tous les utilisateurs connectés. La date de vérification sera enregistrée dans l’historique.")}</p> },
    refuse: { title: t('Refuser {0} proposition(s) ?', { 0: n }), icon: 'x' as const, ok: 'Confirmer le refus', kind: 'd' as const, disabled: false,
      go: () => run('Refusée', `Motif : ${motif}.${msg ? ' ' + msg : ''}`),
      body: <><Select id="bmotif" label={tr("Motif du refus")} req value={motif} onChange={setMotif} options={['Établissement fermé', 'Informations insuffisantes', 'Hors périmètre du guide', 'Contenu inapproprié'].map((v) => ({ v, l: v }))} />
        <TextArea id="bmsg" label={tr("Message au contributeur")} value={msg} onChange={setMsg} placeholder={tr("Expliquez brièvement la décision.")} /></> },
    complement: { title: t('Demander un complément pour {0} proposition(s)', { 0: n }), icon: 'alert' as const, ok: 'Envoyer la demande', kind: 'g' as const, disabled: !msg.trim(),
      go: () => run('Complément demandé', msg),
      body: <TextArea id="bcm" label={tr("Message au contributeur")} rows={4} value={msg} onChange={setMsg} /> },
  }[bulk];
  return (
    <>
      <Head title={tr("Propositions")} sub={tr(`${rows.length} proposition${rows.length > 1 ? 's' : ''} affichée${rows.length > 1 ? 's' : ''}. Filtrez par ville, catégorie ou statut.`)} />
      <div className="admin-body">
        <div className="filters sticky">
          <Select id="fv" label={tr("Ville")} value={city} onChange={setCity} options={[{ v: '', l: 'Toutes' }, ...s.cities.map((c) => ({ v: c.id as City, l: c.name }))]} />
          <Select id="fc" label={tr("Catégorie")} value={cat} onChange={setCat} options={[{ v: '', l: 'Toutes' }, ...s.categories.map((c) => ({ v: c.id as Cat, l: c.label }))]} />
          <Select id="fs" label={tr("Statut")} value={st} onChange={setSt} options={[{ v: '', l: 'Tous' }, ...STATUSES.filter((x) => x !== 'Brouillon').map((x) => ({ v: x, l: x }))]} />
          <div className="grow"><Field id="fq" label={tr("Recherche")} type="search" value={q} onChange={setQ} placeholder={tr("Nom, téléphone, WeChat…")} /></div>
          {filtered && <Button kind="s" icon="x" full={false} onClick={reset}>{tr("Réinitialiser")}</Button>}
        </div>
        {result && (
          <div role="status" className={`notice ${result.ko ? 'err' : 'ok'}`}><Icon name={result.ko ? 'alert' : 'check'} size={20} sw={2} />
            <span>{t('{0} proposition(s) traitée(s).', { 0: result.ok })}{result.ko ? ` ${tr("Certaines décisions n’ont pas pu être enregistrées.")}` : ''}</span></div>
        )}
        {n > 0 && (
          <div className="bulkbar" role="region" aria-label={tr("Actions groupées")}>
            <strong>{t('{0} proposition(s) sélectionnée(s)', { 0: n })}</strong>
            <span className="grow" />
            <Button kind="p" icon="check" full={false} onClick={() => { setResult(null); setBulk('publish'); }}>{tr("Publier la sélection")}</Button>
            <Button kind="g" icon="alert" full={false} onClick={() => { setResult(null); setMsg('Merci pour votre proposition. Pouvez-vous ajouter une photo du stand et la station de métro la plus proche ?'); setBulk('complement'); }}>{tr("Demander un complément")}</Button>
            <Button kind="d" icon="x" full={false} onClick={() => { setResult(null); setMsg(''); setBulk('refuse'); }}>{tr("Refuser la sélection")}</Button>
            <Button kind="s" full={false} onClick={() => setSel(new Set())}>{tr("Tout désélectionner")}</Button>
          </div>
        )}
        <div className="table dense"><table>
          <thead><tr>
            <th className="chk"><input type="checkbox" aria-label={tr("Tout sélectionner")} checked={allPicked} disabled={canSelect.length === 0} onChange={toggleAll} /></th>
            {th('name', 'Proposition')}{th('cat', 'Catégorie')}{th('city', 'Ville')}{th('status', 'Statut')}{th('date', 'Reçue le')}{th('dup', 'Doublons')}<th />
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const dup = dups.get(p.id) ?? false;
              return (
                <tr key={p.id} className={sel.has(p.id) ? 'picked' : ''}>
                  <td className="chk"><input type="checkbox" aria-label={`${tr("Sélectionner")} ${p.name}`} checked={sel.has(p.id)} disabled={!actionable(p)} onChange={() => toggleOne(p.id)} /></td>
                  <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td><td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td><td><StatusBadge status={p.status} /></td><td>{p.date}</td>
                  <td><span className="row" style={{ gap: 6, fontWeight: 600, color: dup ? '#8A4310' : 'var(--muted)' }}><Icon name={dup ? 'alert' : 'check'} size={16} sw={2.2} />{tr(dup ? 'Doublon possible' : 'Aucun doublon')}</span></td>
                  <td><Link className="link" to={`/equipe/propositions/${p.id}`}>{tr("Examiner")}<Icon name="chevR" size={18} sw={2.4} /></Link></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="center muted">{tr("Aucune proposition ne correspond aux filtres.")}</td></tr>}
          </tbody>
        </table></div>
        <DemoNote />
      </div>
      {bulk && dlgCfg && (
        <div className="overlay" onClick={() => setBulk(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={dlgCfg.title} onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name={dlgCfg.icon} size={24} /></span><h2>{dlgCfg.title}</h2></div>
            {dlgCfg.body}
            <div className="actions">
              <Button kind="s" full={false} onClick={() => setBulk(null)}>{tr("Annuler")}</Button>
              <Button kind={dlgCfg.kind} full={false} disabled={dlgCfg.disabled || busy} onClick={dlgCfg.go}>{tr(dlgCfg.ok)}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type Dlg = null | 'publish' | 'refuse' | 'complement' | 'attach';

export function AdminVerify() {
  const { tr } = useI18n();
  const { id } = useParams();
  const all = useTeamAll();
  const { s, api } = useStore();
  const nav = useNavigate();
  const src = all.find((p) => p.id === id);
  const [p, setP] = useState<Proposal | null>(src ?? null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [dupQ, setDupQ] = useState(src ? src.name.split(' ')[0] : '');
  const [motif, setMotif] = useState('Informations insuffisantes');
  const [msg, setMsg] = useState('Merci pour votre proposition. Pouvez-vous ajouter une photo du stand et la station de métro la plus proche ?');
  const [target, setTarget] = useState<string>('');
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  if (!src || !p) return <Navigate to="/equipe/propositions" replace />;
  const set = (patch: Partial<Proposal>) => { setP({ ...p, ...patch }); setSaved(false); };
  const cands = dupCandidates(p, s.providers, dupQ);
  const decide = (status: Status, note: string) => { void api.decide(p.id, status, note); nav('/equipe/historique'); };
  const ready = !!p.name.trim() && !!p.loc.trim();

  const dialog = () => {
    if (!dlg) return null;
    const cfg = {
      publish: { title: 'Publier cette adresse ?', icon: 'check' as const, ok: 'Confirmer la publication', kind: 'p' as const, go: () => decide('Publiée', 'Fiche créée et publiée.'),
        body: <p>{tr("La fiche ")}<strong>{p.name}</strong> {tr(" deviendra visible par tous les utilisateurs connectés. La date de vérification sera enregistrée dans l’historique.")}</p>, disabled: !ready },
      refuse: { title: 'Refuser cette proposition ?', icon: 'x' as const, ok: 'Confirmer le refus', kind: 'd' as const, go: () => decide('Refusée', `Motif : ${motif}.${msg ? ' ' + msg : ''}`),
        body: <><Select id="motif" label={tr("Motif du refus")} req value={motif} onChange={setMotif} options={['Établissement fermé', 'Informations insuffisantes', 'Hors périmètre du guide', 'Contenu inapproprié'].map((v) => ({ v, l: v }))} />
          <TextArea id="mm" label={tr("Message au contributeur")} value={msg} onChange={setMsg} placeholder={tr("Expliquez brièvement la décision.")} /></>, disabled: false },
      complement: { title: 'Demander un complément', icon: 'alert' as const, ok: 'Envoyer la demande', kind: 'g' as const, go: () => decide('Complément demandé', msg),
        body: <TextArea id="cm" label={tr("Message au contributeur")} rows={4} value={msg} onChange={setMsg} />, disabled: !msg.trim() },
      attach: { title: 'Rattacher à une fiche existante ?', icon: 'link' as const, ok: 'Confirmer le rattachement', kind: 'p' as const,
        go: () => decide('Rattachée à une adresse existante', `Rattachée à « ${s.providers.find((x) => x.id === target)?.name} ».`),
        body: <>
          <p>{tr("Cette proposition sera fusionnée avec la fiche choisie. Les informations manquantes seront ajoutées à cette fiche.")}</p>
          <Select id="tgt" label={tr("Fiche existante")} req value={target} onChange={setTarget} options={[{ v: '', l: 'Choisir une fiche…' }, ...(cands.length ? cands : s.providers.map((x) => ({ x, why: '' }))).map(({ x }) => ({ v: x.id, l: `${x.name} (${cityName(x.city)})` }))]} />
        </>, disabled: !target },
    }[dlg];
    return (
      <div className="overlay" onClick={() => setDlg(null)}>
        <div className="dialog" role="dialog" aria-modal="true" aria-label={tr(cfg.title)} onClick={(e) => e.stopPropagation()}>
          <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name={cfg.icon} size={24} /></span><h2>{tr(cfg.title)}</h2></div>
          {tr(cfg.body)}
          <div className="actions">
            <Button kind="s" full={false} onClick={() => setDlg(null)}>{tr("Annuler")}</Button>
            <Button kind={cfg.kind} full={false} disabled={cfg.disabled} onClick={cfg.go}>{tr(cfg.ok)}</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head title={tr(p.name)} sub={tr(`${p.cn} · ${catLabel(p.cat)} · ${cityName(p.city)} · reçue le ${src.date}`)}
        right={<div className="row"><StatusBadge status={src.status} big /><Button to="/equipe/propositions" kind="s" icon="chevL" full={false}>{tr("Retour à la liste")}</Button></div>} />
      <div className="admin-body">
        <div className="split">
          <div className="stack" style={{ gap: 20 }}>
            <Section title={tr("Informations proposées")} icon="edit">
              <div className="form2">
                <Select id="c" label={tr("Catégorie")} req value={p.cat} onChange={(v) => set({ cat: v })} options={s.categories.map((c) => ({ v: c.id as Cat, l: c.label }))} />
                <Select id="v" label={tr("Ville")} req value={p.city} onChange={(v) => set({ city: v })} options={s.cities.map((c) => ({ v: c.id as City, l: c.name }))} />
                <Field id="n" label={tr("Nom commercial")} req value={p.name} onChange={(v) => set({ name: v })} />
                <Field id="ncn" label={tr("Nom en chinois")} value={p.cn} onChange={(v) => set({ cn: v })} />
                <Field id="q" label={tr("Localisation indiquée")} req value={p.loc} onChange={(v) => set({ loc: v })} />
                <Field id="acn" label={tr("Adresse en chinois")} value={p.addrCn} onChange={(v) => set({ addrCn: v })} />
                <Field id="t" label={tr("Téléphone")} type="tel" value={p.tel} onChange={(v) => set({ tel: v })} />
                <Field id="w" label={tr("Identifiant WeChat")} value={p.wechat} onChange={(v) => set({ wechat: v })} />
              </div>
              <TextArea id="p" label={tr("Produits ou services")} value={p.products} onChange={(v) => set({ products: v })} />
              <div className="form2"><Field id="moq" label={tr("Minimum de commande")} value={p.moq} onChange={(v) => set({ moq: v })} placeholder={tr("Non renseigné par le contributeur")} /><Field id="metro" label={tr("Station de métro proche")} value="" placeholder={tr("À compléter par l’équipe")} /></div>
            </Section>
            <Section title={tr("Photos du lieu")} icon="camera">
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {Array.from({ length: p.photos }).map((_, i) => <StoredPhoto key={i} path={p.photoPaths[i]} label={tr(`Photo ${i + 1}`)} h={130} round={12} />)}
                {p.photos < MAX_PHOTOS && <FilePick label="Prendre une photo" onPick={(_, path) => set({ photos: p.photos + 1, photoPaths: path ? [...p.photoPaths, path] : p.photoPaths })} />}
              </div>
            </Section>
          </div>
          <div className="stack" style={{ gap: 20 }}>
            <Section title={tr("Doublons possibles")} icon="search">
              <Field id="dq" label={tr("Rechercher une fiche existante")} type="search" value={dupQ} onChange={setDupQ} />
              {cands.length === 0 && <div className="small muted">{tr("Aucune fiche existante ne correspond.")}</div>}
              {cands.map(({ x, why }) => (
                <div key={x.id} className="card stack" style={{ gap: 6, padding: 14 }}>
                  <div style={{ fontWeight: 700 }}>{x.name}</div><div className="small muted zh">{x.cn}</div>
                  <div><Tag tone="warn" icon="alert">{tr(why)}</Tag></div>
                  <Button kind="s" icon="link" onClick={() => { setTarget(x.id); setDlg('attach'); }}>{tr("Rattacher à cette fiche")}</Button>
                </div>
              ))}
            </Section>
            <Section title={tr("Décision")} icon="shield">
              <div className="small muted">{tr("Chaque publication ou refus demande une confirmation.")}</div>
              {saveErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(saveErr)}</span></div>}
              {saved && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr("Modifications enregistrées.")}</span></div>}
              <Button kind="s" icon="edit" onClick={async () => { setSaveErr(null); const err = await api.edit(p); if (err) setSaveErr(err); else setSaved(true); }}>{tr("Enregistrer les modifications")}</Button>
              <Button kind="s" icon="alert" onClick={() => setDlg('complement')}>{tr("Demander un complément")}</Button>
              <Button kind="s" icon="link" onClick={() => setDlg('attach')}>{tr("Rattacher à une fiche existante")}</Button>
              <Button icon="check" onClick={() => setDlg('publish')}>{tr("Publier")}</Button>
              <Button kind="d" icon="x" onClick={() => setDlg('refuse')}>{tr("Refuser avec un motif")}</Button>
            </Section>
          </div>
        </div>
        <DemoNote />
      </div>
      {tr(dialog())}
    </>
  );
}

export function AdminHistory() {
  const { tr } = useI18n();
  const { s } = useStore();
  return (
    <>
      <Head title={tr("Historique des décisions")} sub={tr("Toutes les décisions, avec la date de dernière vérification de chaque fiche.")} />
      <div className="admin-body">
        <div className="table"><table>
          <thead><tr><th>{tr("Date de la décision")}</th><th>{tr("Fiche")}</th><th>{tr("Décision")}</th><th>{tr("Commentaire ou motif")}</th><th>{tr("Par")}</th><th>{tr("Dernière vérification")}</th></tr></thead>
          <tbody>
            {s.decisions.map((x, i) => (
              <tr key={i}><td>{x.date}</td><td><strong>{tr(x.proposalName)}</strong><div className="small muted zh">{x.cn}</div></td><td><StatusBadge status={x.decision} /></td><td>{x.note}</td><td>{tr(x.by)}</td><td>{tr(x.lastCheck)}</td></tr>
            ))}
          </tbody>
        </table></div>
        <DemoNote />
      </div>
    </>
  );
}
