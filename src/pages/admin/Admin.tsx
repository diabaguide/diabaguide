import { useI18n } from '../../i18n';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { STATUSES, catLabel, cityName, type Cat, type City, type Provider, type Proposal, type Status } from '../../data';
import { useStore } from '../../store';
import { signOut } from '../../lib/auth';
import { Button, DemoNote, Field, Icon, Logo, Photo, Section, Select, StatusBadge, Tag, TextArea } from '../../ui';

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

export function AdminLayout() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const nav = useNavigate();
  const isAdmin = s.user?.role === 'admin';
  const items: [string, string, Parameters<typeof Icon>[0]['name'], boolean][] = [
    ['/equipe', 'Tableau de bord', 'grid', true], ['/equipe/propositions', 'Propositions', 'inbox', false], ['/equipe/historique', 'Historique des décisions', 'history', false],
    // Administration : réservée au rôle admin.
    ...(isAdmin ? ([
      ['/equipe/membres', 'Membres', 'users', false],
      ['/equipe/villes', 'Villes', 'pin', false],
      ['/equipe/categories', 'Catégories', 'grid', false],
      ['/equipe/produits', 'Produits et services', 'list', false],
    ] as [string, string, Parameters<typeof Icon>[0]['name'], boolean][]) : []),
  ];
  return (
    <div className="admin">
      <aside>
        <div className="stack" style={{ gap: 8 }}><Logo height={44} /><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--gold-fill)', paddingLeft: 4 }}>{tr("GUIDE · ÉQUIPE")}</span></div>
        <nav aria-label={tr("Navigation équipe")}>
          {items.map(([to, l, i, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={i} />{tr(l)}</NavLink>)}
        </nav>
        <div className="me">
          <span className="avatar">{tr((s.user?.name ?? '?').split(/[\s.]+/).map((x) => x[0]?.toUpperCase()).slice(0, 2).join(''))}</span>
          <div className="grow"><div style={{ fontWeight: 600 }}>{s.user?.name}</div><div className="small" style={{ color: '#DCE6FA' }}>{tr(isAdmin ? 'Administrateur' : 'Vérification')}</div></div>
          <button type="button" className="iconbtn" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} aria-label={tr("Se déconnecter")} onClick={async () => { await signOut(); d({ t: 'logout' }); nav('/'); }}><Icon name="logout" size={20} /></button>
        </div>
      </aside>
      <div className="admin-main"><Outlet /></div>
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

export function AdminList() {
  const { tr } = useI18n();
  const all = useTeamAll();
  const { s } = useStore();
  const [city, setCity] = useState<'' | City>('');
  const [cat, setCat] = useState<'' | Cat>('');
  const [st, setSt] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const rows = all.filter((p) => (!city || p.city === city) && (!cat || p.cat === cat) && (!st || p.status === st) &&
    (!q || `${p.name} ${p.cn} ${p.tel} ${p.wechat}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <Head title={tr("Propositions")} sub={tr(`${rows.length} proposition${rows.length > 1 ? 's' : ''} affichée${rows.length > 1 ? 's' : ''}. Filtrez par ville, catégorie ou statut.`)} />
      <div className="admin-body">
        <div className="filters">
          <Select id="fv" label={tr("Ville")} value={city} onChange={setCity} options={[{ v: '', l: 'Toutes' }, ...s.cities.map((c) => ({ v: c.id as City, l: c.name }))]} />
          <Select id="fc" label={tr("Catégorie")} value={cat} onChange={setCat} options={[{ v: '', l: 'Toutes' }, ...s.categories.map((c) => ({ v: c.id as Cat, l: c.label }))]} />
          <Select id="fs" label={tr("Statut")} value={st} onChange={setSt} options={[{ v: '', l: 'Tous' }, ...STATUSES.filter((x) => x !== 'Brouillon').map((x) => ({ v: x, l: x }))]} />
          <div className="grow"><Field id="fq" label={tr("Recherche")} type="search" value={q} onChange={setQ} placeholder={tr("Nom, téléphone, WeChat…")} /></div>
        </div>
        <div className="table"><table>
          <thead><tr><th>{tr("Proposition")}</th><th>{tr("Catégorie")}</th><th>{tr("Ville")}</th><th>{tr("Statut")}</th><th>{tr("Reçue le")}</th><th>{tr("Doublons")}</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const dup = dupCandidates(p, s.providers).length > 0;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td><td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td><td><StatusBadge status={p.status} /></td><td>{p.date}</td>
                  <td><span className="row" style={{ gap: 6, fontWeight: 600, color: dup ? '#8A4310' : 'var(--muted)' }}><Icon name={dup ? 'alert' : 'check'} size={16} sw={2.2} />{tr(dup ? 'Doublon possible' : 'Aucun doublon')}</span></td>
                  <td><Link className="link" to={`/equipe/propositions/${p.id}`}>{tr("Examiner")}<Icon name="chevR" size={18} sw={2.4} /></Link></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="center muted">{tr("Aucune proposition ne correspond aux filtres.")}</td></tr>}
          </tbody>
        </table></div>
        <DemoNote />
      </div>
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
            <Section title={tr("Photos et carte de visite")} icon="camera">
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {Array.from({ length: p.photos }).map((_, i) => <Photo key={i} label={tr(`Photo ${i + 1}`)} h={130} round={12} />)}
                {p.cardFront ? <Photo label={tr("Carte : recto")} h={130} round={12} /> : <div className="upload" style={{ cursor: 'default', minHeight: 130 }}>{tr("Recto non fourni")}</div>}
                {p.cardBack ? <Photo label={tr("Carte : verso")} h={130} round={12} /> : <div className="upload" style={{ cursor: 'default', minHeight: 130, fontWeight: 400 }}>{tr("Verso non fourni")}</div>}
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
              {saved && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr("Modifications enregistrées.")}</span></div>}
              <Button kind="s" icon="edit" onClick={() => setSaved(true)}>{tr("Enregistrer les modifications")}</Button>
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
