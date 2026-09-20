import { useMemo, useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Outlet, useNavigate, useParams } from 'react-router-dom';
import { CATS, PROVIDERS, STATUSES, catLabel, type Cat, type City, type Proposal, type Status } from '../../data';
import { useStore } from '../../store';
import { Button, DemoNote, Field, Icon, Logo, Photo, Section, Select, StatusBadge, Tag, TextArea } from '../../ui';

/* Toutes les propositions vues par l’équipe (hors brouillons des voyageurs). */
function useTeamAll(): Proposal[] {
  const { s } = useStore();
  return useMemo(() => {
    const ids = new Set(s.teamQueue.map((p) => p.id));
    return [...s.teamQueue, ...s.proposals.filter((p) => p.status !== 'Brouillon' && !ids.has(p.id))];
  }, [s.teamQueue, s.proposals]);
}
const ageHours = (p: Proposal) => {
  const m = /(\d+) sept/.exec(p.date);
  return m ? Math.max(0, (20 - Number(m[1])) * 24 + 8) : 0;
};
const ageLabel = (h: number) => (h < 24 ? `Il y a ${h} h` : `Il y a ${Math.round(h / 24)} jour${h >= 48 ? 's' : ''}`);

function dupCandidates(p: Proposal, term?: string) {
  const t = (term ?? p.name.split(' ')[0]).trim().toLowerCase();
  if (!t) return [];
  return PROVIDERS.filter((x) => `${x.name} ${x.cn} ${x.tel ?? ''} ${x.wechat ?? ''}`.toLowerCase().includes(t))
    .map((x) => ({ x, why: p.tel && x.tel === p.tel ? 'Même numéro de téléphone' : 'Nom proche · même quartier ou même ville' }));
}

export function AdminLayout() {
  const { s, d } = useStore();
  const nav = useNavigate();
  const items: [string, string, Parameters<typeof Icon>[0]['name'], boolean][] = [
    ['/equipe', 'Tableau de bord', 'grid', true], ['/equipe/propositions', 'Propositions', 'inbox', false], ['/equipe/historique', 'Historique des décisions', 'history', false],
  ];
  return (
    <div className="admin">
      <aside>
        <div className="stack" style={{ gap: 8 }}><Logo height={44} /><span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: 'var(--gold-fill)', paddingLeft: 4 }}>GUIDE · ÉQUIPE</span></div>
        <nav aria-label="Navigation équipe">
          {items.map(([to, l, i, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={i} />{l}</NavLink>)}
        </nav>
        <div className="me">
          <span className="avatar">AD</span>
          <div className="grow"><div style={{ fontWeight: 600 }}>{s.user?.name}</div><div className="small" style={{ color: '#DCE6FA' }}>Vérification</div></div>
          <button type="button" className="iconbtn" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} aria-label="Se déconnecter" onClick={() => { d({ t: 'logout' }); nav('/'); }}><Icon name="logout" size={20} /></button>
        </div>
      </aside>
      <div className="admin-main"><Outlet /></div>
    </div>
  );
}

const Head = ({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) => (
  <header className="admin-head"><div><h1>{title}</h1><div className="muted" style={{ marginTop: 4 }}>{sub}</div></div>{right}</header>
);

export function AdminDashboard() {
  const all = useTeamAll();
  const n = (st: Status) => all.filter((p) => p.status === st).length;
  const queue = all.filter((p) => p.status === 'Soumise' || p.status === 'En vérification').sort((a, b) => ageHours(b) - ageHours(a)).slice(0, 5);
  const tiles: [Parameters<typeof Icon>[0]['name'], number, string, string][] = [
    ['send', n('Soumise'), 'Soumises', 'À prendre en charge'], ['eye', n('En vérification'), 'En vérification', 'En cours'],
    ['alert', n('Complément demandé'), 'Complément demandé', 'En attente du contributeur'], ['check', n('Publiée'), 'Publiées', 'Depuis le début du mois'],
  ];
  return (
    <>
      <Head title="Tableau de bord" sub="Propositions des contributeurs à vérifier avant publication." right={<Button to="/equipe/propositions" icon="inbox" full={false}>Voir toutes les propositions</Button>} />
      <div className="admin-body">
        <div className="tiles">
          {tiles.map(([i, v, l, note]) => (
            <div key={l} className="card tile stack" style={{ gap: 6 }}><div className="row muted" style={{ fontWeight: 600 }}><Icon name={i} size={20} />{l}</div><div className="n">{v}</div><div className="small muted">{note}</div></div>
          ))}
        </div>
        <section className="stack">
          <h2 className="display" style={{ fontSize: 20 }}>Propositions à traiter en priorité</h2>
          <div className="table"><table>
            <thead><tr><th>Proposition</th><th>Catégorie et ville</th><th>Ancienneté</th><th /></tr></thead>
            <tbody>
              {queue.map((p) => {
                const h = ageHours(p);
                return (
                  <tr key={p.id}>
                    <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td>
                    <td>{catLabel(p.cat)} · {p.city}</td>
                    <td>{h > 48 ? <span className="warntext"><Icon name="clock" size={16} sw={2.2} />{ageLabel(h)} · Objectif de 48 h dépassé</span> : <span className="row" style={{ gap: 6 }}><Icon name="clock" size={16} />{ageLabel(h)}</span>}</td>
                    <td><Link className="link" to={`/equipe/propositions/${p.id}`}>Examiner<Icon name="chevR" size={18} sw={2.4} /></Link></td>
                  </tr>
                );
              })}
              {queue.length === 0 && <tr><td colSpan={4} className="center muted">Rien à traiter pour le moment.</td></tr>}
            </tbody>
          </table></div>
          <div className="small muted">L’objectif de 48 heures est indicatif.</div>
        </section>
        <DemoNote />
      </div>
    </>
  );
}

export function AdminList() {
  const all = useTeamAll();
  const [city, setCity] = useState<'' | City>('');
  const [cat, setCat] = useState<'' | Cat>('');
  const [st, setSt] = useState<'' | Status>('');
  const [q, setQ] = useState('');
  const rows = all.filter((p) => (!city || p.city === city) && (!cat || p.cat === cat) && (!st || p.status === st) &&
    (!q || `${p.name} ${p.cn} ${p.tel} ${p.wechat}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <Head title="Propositions" sub={`${rows.length} proposition${rows.length > 1 ? 's' : ''} affichée${rows.length > 1 ? 's' : ''}. Filtrez par ville, catégorie ou statut.`} />
      <div className="admin-body">
        <div className="filters">
          <Select id="fv" label="Ville" value={city} onChange={setCity} options={[{ v: '', l: 'Toutes' }, { v: 'Guangzhou', l: 'Guangzhou' }, { v: 'Shenzhen', l: 'Shenzhen' }]} />
          <Select id="fc" label="Catégorie" value={cat} onChange={setCat} options={[{ v: '', l: 'Toutes' }, ...CATS.map((c) => ({ v: c.id as Cat, l: c.label }))]} />
          <Select id="fs" label="Statut" value={st} onChange={setSt} options={[{ v: '', l: 'Tous' }, ...STATUSES.filter((x) => x !== 'Brouillon').map((x) => ({ v: x, l: x }))]} />
          <div className="grow"><Field id="fq" label="Recherche" type="search" value={q} onChange={setQ} placeholder="Nom, téléphone, WeChat…" /></div>
        </div>
        <div className="table"><table>
          <thead><tr><th>Proposition</th><th>Catégorie</th><th>Ville</th><th>Statut</th><th>Reçue le</th><th>Doublons</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => {
              const dup = dupCandidates(p).length > 0;
              return (
                <tr key={p.id}>
                  <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td><td>{catLabel(p.cat)}</td><td>{p.city}</td><td><StatusBadge status={p.status} /></td><td>{p.date}</td>
                  <td><span className="row" style={{ gap: 6, fontWeight: 600, color: dup ? '#8A4310' : 'var(--muted)' }}><Icon name={dup ? 'alert' : 'check'} size={16} sw={2.2} />{dup ? 'Doublon possible' : 'Aucun doublon'}</span></td>
                  <td><Link className="link" to={`/equipe/propositions/${p.id}`}>Examiner<Icon name="chevR" size={18} sw={2.4} /></Link></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={7} className="center muted">Aucune proposition ne correspond aux filtres.</td></tr>}
          </tbody>
        </table></div>
        <DemoNote />
      </div>
    </>
  );
}

type Dlg = null | 'publish' | 'refuse' | 'complement' | 'attach';

export function AdminVerify() {
  const { id } = useParams();
  const all = useTeamAll();
  const { d } = useStore();
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
  const cands = dupCandidates(p, dupQ);
  const decide = (status: Status, note: string) => { d({ t: 'decide', id: p.id, status, note }); nav('/equipe/historique'); };
  const ready = !!p.name.trim() && !!p.loc.trim();

  const dialog = () => {
    if (!dlg) return null;
    const cfg = {
      publish: { title: 'Publier cette adresse ?', icon: 'check' as const, ok: 'Confirmer la publication', kind: 'p' as const, go: () => decide('Publiée', 'Fiche créée et publiée.'),
        body: <p>La fiche <strong>{p.name}</strong> deviendra visible par tous les utilisateurs connectés. La date de vérification sera enregistrée dans l’historique.</p>, disabled: !ready },
      refuse: { title: 'Refuser cette proposition ?', icon: 'x' as const, ok: 'Confirmer le refus', kind: 'd' as const, go: () => decide('Refusée', `Motif : ${motif}.${msg ? ' ' + msg : ''}`),
        body: <><Select id="motif" label="Motif du refus" req value={motif} onChange={setMotif} options={['Établissement fermé', 'Informations insuffisantes', 'Hors périmètre du guide', 'Contenu inapproprié'].map((v) => ({ v, l: v }))} />
          <TextArea id="mm" label="Message au contributeur" value={msg} onChange={setMsg} placeholder="Expliquez brièvement la décision." /></>, disabled: false },
      complement: { title: 'Demander un complément', icon: 'alert' as const, ok: 'Envoyer la demande', kind: 'g' as const, go: () => decide('Complément demandé', msg),
        body: <TextArea id="cm" label="Message au contributeur" rows={4} value={msg} onChange={setMsg} />, disabled: !msg.trim() },
      attach: { title: 'Rattacher à une fiche existante ?', icon: 'link' as const, ok: 'Confirmer le rattachement', kind: 'p' as const,
        go: () => decide('Rattachée à une adresse existante', `Rattachée à « ${PROVIDERS.find((x) => x.id === target)?.name} ».`),
        body: <>
          <p>Cette proposition sera fusionnée avec la fiche choisie. Les informations manquantes seront ajoutées à cette fiche.</p>
          <Select id="tgt" label="Fiche existante" req value={target} onChange={setTarget} options={[{ v: '', l: 'Choisir une fiche…' }, ...(cands.length ? cands : PROVIDERS.map((x) => ({ x, why: '' }))).map(({ x }) => ({ v: x.id, l: `${x.name} (${x.city})` }))]} />
        </>, disabled: !target },
    }[dlg];
    return (
      <div className="overlay" onClick={() => setDlg(null)}>
        <div className="dialog" role="dialog" aria-modal="true" aria-label={cfg.title} onClick={(e) => e.stopPropagation()}>
          <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name={cfg.icon} size={24} /></span><h2>{cfg.title}</h2></div>
          {cfg.body}
          <div className="actions">
            <Button kind="s" full={false} onClick={() => setDlg(null)}>Annuler</Button>
            <Button kind={cfg.kind} full={false} disabled={cfg.disabled} onClick={cfg.go}>{cfg.ok}</Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head title={p.name} sub={`${p.cn} · ${catLabel(p.cat)} · ${p.city} · reçue le ${src.date}`}
        right={<div className="row"><StatusBadge status={src.status} big /><Button to="/equipe/propositions" kind="s" icon="chevL" full={false}>Retour à la liste</Button></div>} />
      <div className="admin-body">
        <div className="split">
          <div className="stack" style={{ gap: 20 }}>
            <Section title="Informations proposées" icon="edit">
              <div className="form2">
                <Select id="c" label="Catégorie" req value={p.cat} onChange={(v) => set({ cat: v })} options={CATS.map((c) => ({ v: c.id as Cat, l: c.label }))} />
                <Select id="v" label="Ville" req value={p.city} onChange={(v) => set({ city: v })} options={[{ v: 'Guangzhou' as City, l: 'Guangzhou' }, { v: 'Shenzhen' as City, l: 'Shenzhen' }]} />
                <Field id="n" label="Nom commercial" req value={p.name} onChange={(v) => set({ name: v })} />
                <Field id="ncn" label="Nom en chinois" value={p.cn} onChange={(v) => set({ cn: v })} />
                <Field id="q" label="Localisation indiquée" req value={p.loc} onChange={(v) => set({ loc: v })} />
                <Field id="acn" label="Adresse en chinois" value={p.addrCn} onChange={(v) => set({ addrCn: v })} />
                <Field id="t" label="Téléphone" type="tel" value={p.tel} onChange={(v) => set({ tel: v })} />
                <Field id="w" label="Identifiant WeChat" value={p.wechat} onChange={(v) => set({ wechat: v })} />
              </div>
              <TextArea id="p" label="Produits ou services" value={p.products} onChange={(v) => set({ products: v })} />
              <div className="form2"><Field id="moq" label="Minimum de commande" value={p.moq} onChange={(v) => set({ moq: v })} placeholder="Non renseigné par le contributeur" /><Field id="metro" label="Station de métro proche" value="" placeholder="À compléter par l’équipe" /></div>
            </Section>
            <Section title="Photos et carte de visite" icon="camera">
              <div className="grid2" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                {Array.from({ length: p.photos }).map((_, i) => <Photo key={i} label={`Photo ${i + 1}`} h={130} round={12} />)}
                {p.cardFront ? <Photo label="Carte : recto" h={130} round={12} /> : <div className="upload" style={{ cursor: 'default', minHeight: 130 }}>Recto non fourni</div>}
                {p.cardBack ? <Photo label="Carte : verso" h={130} round={12} /> : <div className="upload" style={{ cursor: 'default', minHeight: 130, fontWeight: 400 }}>Verso non fourni</div>}
              </div>
            </Section>
          </div>
          <div className="stack" style={{ gap: 20 }}>
            <Section title="Doublons possibles" icon="search">
              <Field id="dq" label="Rechercher une fiche existante" type="search" value={dupQ} onChange={setDupQ} />
              {cands.length === 0 && <div className="small muted">Aucune fiche existante ne correspond.</div>}
              {cands.map(({ x, why }) => (
                <div key={x.id} className="card stack" style={{ gap: 6, padding: 14 }}>
                  <div style={{ fontWeight: 700 }}>{x.name}</div><div className="small muted zh">{x.cn}</div>
                  <div><Tag tone="warn" icon="alert">{why}</Tag></div>
                  <Button kind="s" icon="link" onClick={() => { setTarget(x.id); setDlg('attach'); }}>Rattacher à cette fiche</Button>
                </div>
              ))}
            </Section>
            <Section title="Décision" icon="shield">
              <div className="small muted">Chaque publication ou refus demande une confirmation.</div>
              {saved && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>Modifications enregistrées.</span></div>}
              <Button kind="s" icon="edit" onClick={() => setSaved(true)}>Enregistrer les modifications</Button>
              <Button kind="s" icon="alert" onClick={() => setDlg('complement')}>Demander un complément</Button>
              <Button kind="s" icon="link" onClick={() => setDlg('attach')}>Rattacher à une fiche existante</Button>
              <Button icon="check" onClick={() => setDlg('publish')}>Publier</Button>
              <Button kind="d" icon="x" onClick={() => setDlg('refuse')}>Refuser avec un motif</Button>
            </Section>
          </div>
        </div>
        <DemoNote />
      </div>
      {dialog()}
    </>
  );
}

export function AdminHistory() {
  const { s } = useStore();
  return (
    <>
      <Head title="Historique des décisions" sub="Toutes les décisions, avec la date de dernière vérification de chaque fiche." />
      <div className="admin-body">
        <div className="table"><table>
          <thead><tr><th>Date de la décision</th><th>Fiche</th><th>Décision</th><th>Commentaire ou motif</th><th>Par</th><th>Dernière vérification</th></tr></thead>
          <tbody>
            {s.decisions.map((x, i) => (
              <tr key={i}><td>{x.date}</td><td><strong>{x.proposalName}</strong><div className="small muted zh">{x.cn}</div></td><td><StatusBadge status={x.decision} /></td><td>{x.note}</td><td>{x.by}</td><td>{x.lastCheck}</td></tr>
            ))}
          </tbody>
        </table></div>
        <DemoNote />
      </div>
    </>
  );
}
