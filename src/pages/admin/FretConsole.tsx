import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import { isTeamRole, signOut } from '../../lib/auth';
import { phoneKey } from '../../lib/phone';
import { Avatar, Button, Icon, Logo, useWide } from '../../ui';
import { AdminCard, AdminSheet, SheetActions, SheetDanger } from './mobile';
import { ProfileForms } from '../Account';
import {
  fetchExpeditions, fetchExpeditionTotaux, fetchTousColis, fetchFactures, fetchVoyageursFret,
  fetchTarifs, fetchAnnexes, fetchAllWarehouses, fetchTypesMarchandise,
  MODE_LABEL, EXPEDITION_STATUT_LABEL, COLIS_STATUT_LABEL, FACTURE_STATUT_LABEL,
  type Expedition, type ExpeditionTotaux, type Colis, type Facture, type VoyageurFret,
  type TarifFret, type TarifAnnexe, type WarehouseFull, type TypeMarchandise,
} from '../../lib/fret';

/* ------------------------------------------------------------------ */
/* Espace fret : réservé au livreur, ouvert aussi à l'équipe et aux    */
/* administrateurs. On n'y voit que le fret. Les droits sont appliqués */
/* en base (supabase/livreur.sql : is_fret).                           */
/* ------------------------------------------------------------------ */

const money = (n: number, d = 'XOF') => `${n.toLocaleString('fr-FR')} ${d === 'XOF' ? 'FCFA' : d}`;
const jour = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
/** Colis reçus ou annoncés mais pas encore rattachés à une expédition. */
const enAttente = (c: Colis) => !c.expeditionCode && (c.statut === 'annonce' || c.statut === 'recu_chine');

const COLLAPSE_KEY = 'diaba-fret-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; } };

export function FretLayout() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const nav = useNavigate();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const team = isTeamRole(s.user?.role);
  const items: [string, string, Parameters<typeof Icon>[0]['name'], boolean][] = [
    ['/fret', 'Tableau de bord', 'grid', true],
    ['/fret/expeditions', 'Expéditions', 'ship', false],
    ['/fret/voyageurs', 'Voyageurs', 'users', false],
    ['/fret/tarifs', 'Tarifs', 'sliders', false],
    ['/fret/profil', 'Mon profil', 'user', false],
  ];
  useEffect(() => { setOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1'); } catch { /* stockage indisponible */ } return !c; });
  return (
    <div className={`admin${collapsed ? ' collapsed' : ''}${open ? ' open' : ''}`}>
      <aside id="fret-menu">
        <div className="stack" style={{ gap: 8 }}><Logo height={44} /><span className="admin-tag">{tr("GUIDE · FRET")}</span></div>
        <nav aria-label={tr("Navigation fret")}>
          {items.map(([to, l, i, end]) => <NavLink key={to} to={to} end={end} title={tr(l)} className={({ isActive }) => (isActive ? 'active' : '')}><Icon name={i} /><span className="lbl">{tr(l)}</span></NavLink>)}
          {/* L'équipe et les administrateurs retrouvent leur console. */}
          {team && <NavLink to="/equipe" end title={tr("Console équipe")}><Icon name="shield" /><span className="lbl">{tr("Console équipe")}</span></NavLink>}
        </nav>
        <button type="button" className="collapse-btn" aria-pressed={collapsed} aria-label={tr(collapsed ? 'Agrandir le menu' : 'Réduire le menu')} title={tr(collapsed ? 'Agrandir le menu' : 'Réduire le menu')} onClick={toggle}><Icon name={collapsed ? 'chevR' : 'chevL'} size={20} /><span className="lbl">{tr("Réduire le menu")}</span></button>
        <div className="me">
          {s.user?.avatarPath
            ? <Avatar path={s.user.avatarPath} name={s.user.name} />
            : <span className="avatar">{tr((s.user?.name ?? '?').split(/[\s.]+/).map((x) => x[0]?.toUpperCase()).slice(0, 2).join(''))}</span>}
          <div className="grow lbl"><div style={{ fontWeight: 600 }}>{s.user?.name}</div><div className="small" style={{ color: '#DCE6FA' }}>{tr(s.user?.role === 'livreur' ? 'Livreur' : 'Équipe fret')}</div></div>
          <button type="button" className="iconbtn" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} aria-label={tr("Se déconnecter")} onClick={async () => { await signOut(); d({ t: 'logout' }); nav('/'); }}><Icon name="logout" size={20} /></button>
        </div>
      </aside>
      {open && <div className="admin-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div className="admin-main">
        <div className="admin-top">
          <button type="button" className="iconbtn menu-btn" aria-label={tr("Menu")} aria-expanded={open} aria-controls="fret-menu" onClick={() => setOpen(true)}><Icon name="menu" size={22} /></button>
          <strong>{tr("Espace fret")}</strong>
        </div>
        <Outlet />
      </div>
    </div>
  );
}

const Head = ({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) => {
  const { tr } = useI18n();
  return <header className="admin-head"><div><h1>{tr(title)}</h1><div className="muted" style={{ marginTop: 4 }}>{tr(sub)}</div></div>{right}</header>;
};

/* ------------------------------ Tableau de bord ------------------------------ */

export function FretDashboard() {
  const { tr } = useI18n();
  const wide = useWide();
  const nav = useNavigate();
  const [exps, setExps] = useState<Expedition[]>([]);
  const [totaux, setTotaux] = useState<Record<string, ExpeditionTotaux>>({});
  const [colis, setColis] = useState<Colis[]>([]);
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([fetchExpeditions(), fetchExpeditionTotaux(), fetchTousColis(), fetchFactures()])
      .then(([e, t, c, f]) => { setExps(e); setTotaux(t); setColis(c); setFactures(f); setLoading(false); });
  }, []);

  const n = (st: Expedition['statut']) => exps.filter((e) => e.statut === st).length;
  const attente = colis.filter(enAttente);
  const problemes = colis.filter((c) => c.statut === 'probleme');
  const impayees = Object.values(factures).filter((f) => f.statut === 'a_payer');
  const duXof = impayees.filter((f) => f.devise === 'XOF').reduce((a, f) => a + f.montantTotal, 0);
  const ouvertes = exps.filter((e) => e.statut === 'ouverte');
  const lien = (code: string) => `/fret/expeditions/${encodeURIComponent(code)}`;

  const tiles: [Parameters<typeof Icon>[0]['name'], number, string, string][] = [
    ['box', n('ouverte'), 'Expéditions ouvertes', 'En cours de remplissage'],
    ['ship', n('partie'), 'En route', 'Parties de Chine'],
    ['pin', n('arrivee'), 'Arrivées', 'À remettre aux voyageurs'],
    ['inbox', attente.length, 'Colis à affecter', 'Sans expédition'],
    ['alert', problemes.length, 'Colis en problème', 'À traiter'],
    ['send', impayees.length, 'Factures à payer', duXof ? money(duXof) : 'Aucun montant dû'],
  ];

  if (loading) return <div className="admin-body"><p className="muted" role="status">{tr("Chargement…")}</p></div>;

  return (
    <>
      <Head title="Tableau de bord fret" sub="Expéditions, colis et paiements en un coup d’œil."
        right={<Button to="/fret/expeditions" icon="ship" full={false}>{tr("Gérer les expéditions")}</Button>} />
      <div className="admin-body">
        <div className="tiles">
          {tiles.map(([i, v, l, note]) => (
            <div key={l} className="card tile stack" style={{ gap: 6 }}><div className="row muted" style={{ fontWeight: 600 }}><Icon name={i} size={20} />{tr(l)}</div><div className="n">{v}</div><div className="small muted">{tr(note)}</div></div>
          ))}
        </div>

        <section className="stack">
          <h2 className="display" style={{ fontSize: 20 }}>{tr("Remplissage des expéditions ouvertes")}</h2>
          {ouvertes.length === 0 ? <p className="muted">{tr("Aucune expédition ouverte.")}</p> : wide ? (
            <div className="table"><table>
              <thead><tr><th>{tr("Expédition")}</th><th>{tr("Mode")}</th><th>{tr("Colis")}</th><th>{tr("Remplissage")}</th></tr></thead>
              <tbody>
                {ouvertes.map((e) => {
                  const t = totaux[e.code];
                  return (
                    <tr key={e.code}>
                      <td><Link to={lien(e.code)}><strong>{e.code}</strong></Link><div className="small muted">{e.destination}</div></td>
                      <td>{tr(MODE_LABEL[e.mode])}</td>
                      <td>{t?.nbColis ?? 0}</td>
                      <td className="small">{remplissage(t, tr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : (
            <div className="acards">
              {ouvertes.map((e) => (
                <AdminCard key={e.code} toneSeed={e.code} title={e.code}
                  sub={<>{tr(MODE_LABEL[e.mode])} · {totaux[e.code]?.nbColis ?? 0} {tr("colis")} · {remplissage(totaux[e.code], tr)}</>}
                  onOpen={() => nav(lien(e.code))} />
              ))}
            </div>
          )}
        </section>

        <section className="stack">
          <h2 className="display" style={{ fontSize: 20 }}>{tr("Colis à affecter à une expédition")}</h2>
          {attente.length === 0 ? <p className="muted">{tr("Tous les colis sont affectés.")}</p> : (
            <div className="acards">
              {attente.slice(0, 8).map((c) => (
                <AdminCard key={c.code} toneSeed={c.clientNom ?? c.code} title={c.code}
                  sub={<>{c.clientNom ?? '—'} · {tr(COLIS_STATUT_LABEL[c.statut])} · {tr(MODE_LABEL[c.mode])}</>}
                  onOpen={() => nav('/fret/expeditions')} />
              ))}
            </div>
          )}
          {attente.length > 8 && <p className="small muted">{attente.length - 8} {tr("autres colis en attente.")}</p>}
        </section>

        <section className="stack">
          <h2 className="display" style={{ fontSize: 20 }}>{tr("Factures à encaisser")}</h2>
          {impayees.length === 0 ? <p className="muted">{tr("Aucune facture en attente de paiement.")}</p> : (
            <div className="acards">
              {impayees.slice(0, 8).map((f) => {
                const c = colis.find((x) => x.code === f.colisCode);
                return (
                  <AdminCard key={f.colisCode} toneSeed={c?.clientNom ?? f.colisCode} title={money(f.montantTotal, f.devise)}
                    sub={<>{f.colisCode} · {c?.clientNom ?? '—'} · {tr("émise le")} {jour(f.emiseLe)}</>}
                    onOpen={() => nav(c?.expeditionCode ? lien(c.expeditionCode) : '/fret/expeditions')} />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function remplissage(t: ExpeditionTotaux | undefined, tr: (s: string) => string) {
  if (!t) return '—';
  const parts = [
    t.pctKg != null ? tr(`${t.pctKg} % du poids (${t.totalKg} kg)`) : `${t.totalKg} kg`,
    t.pctM3 != null ? tr(`${t.pctM3} % du volume (${t.totalM3} m³)`) : `${t.totalM3} m³`,
  ];
  return parts.join(' · ');
}

/* --------------------------------- Voyageurs --------------------------------- */

export function FretVoyageurs() {
  const { tr } = useI18n();
  const wide = useWide();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<VoyageurFret[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<VoyageurFret | null>(null);

  const load = useCallback(async (term: string) => { setRows(await fetchVoyageursFret(term)); setLoading(false); }, []);
  // Recherche en base, après une courte pause de frappe.
  useEffect(() => { const t = setTimeout(() => { void load(q.trim()); }, 250); return () => clearTimeout(t); }, [q, load]);

  return (
    <>
      <Head title="Voyageurs" sub="Les voyageurs qui ont au moins un colis avec Diaba." />
      <div className="admin-body" style={{ gap: 18 }}>
        <div className="admin-search" style={{ maxWidth: 360 }}><Icon name="search" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Rechercher un voyageur")} placeholder={tr("Nom ou téléphone")} />
        </div>
        {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
          : rows.length === 0 ? <p className="muted">{tr("Aucun voyageur à afficher.")}</p> : wide ? (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Voyageur")}</th><th>{tr("Colis")}</th><th>{tr("En cours")}</th><th>{tr("Dernier colis")}</th><th /></tr></thead>
              <tbody>
                {rows.map((v) => (
                  <tr key={v.id}>
                    <td><strong>{v.name ?? '—'}</strong><div className="small muted">{v.phone ?? '—'}</div></td>
                    <td>{v.nbColis}</td>
                    <td>{v.colisEnCours}</td>
                    <td className="small">{v.dernierColis ? jour(v.dernierColis) : '—'}</td>
                    <td><Button kind="s" icon="eye" full={false} onClick={() => setOpen(v)}>{tr("Voir")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <div className="acards">
              {rows.map((v) => (
                <AdminCard key={v.id} toneSeed={v.name ?? v.id} title={v.name ?? '—'}
                  sub={<>{v.phone ?? '—'} · {v.nbColis} {tr("colis")} · {v.colisEnCours} {tr("en cours")}</>}
                  onOpen={() => setOpen(v)} />
              ))}
            </div>
          )}
        {open && <VoyageurSheet v={open} onClose={() => setOpen(null)} />}
      </div>
    </>
  );
}

function VoyageurSheet({ v, onClose }: { v: VoyageurFret; onClose: () => void }) {
  const { tr } = useI18n();
  const [colis, setColis] = useState<Colis[] | null>(null);
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  useEffect(() => {
    void Promise.all([fetchTousColis(v.id), fetchFactures()]).then(([c, f]) => { setColis(c); setFactures(f); });
  }, [v.id]);
  const tel = phoneKey(v.phone ?? '');
  return (
    <AdminSheet title={v.name ?? '—'} sub={v.phone ?? ''} onClose={onClose}>
      {tel.length >= 6 && (
        <SheetActions>
          <Button kind="s" icon="phone" full={false} href={`tel:+${tel.length === 9 ? '221' + tel : tel}`}>{tr("Appeler")}</Button>
          <Button kind="s" icon="chat" full={false} href={`https://wa.me/${tel.length === 9 ? '221' + tel : tel}`}>{tr("WhatsApp")}</Button>
        </SheetActions>
      )}
      <SheetDanger>{tr("Colis")}</SheetDanger>
      {colis === null ? <p className="muted" role="status">{tr("Chargement…")}</p>
        : colis.length === 0 ? <p className="muted">{tr("Aucun colis.")}</p> : (
          <div className="stack" style={{ gap: 10 }}>
            {colis.map((c) => {
              const f = factures[c.code];
              return (
                <div key={c.code} className="card stack" style={{ gap: 4, padding: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <strong>{c.code}</strong><span className="small">{tr(COLIS_STATUT_LABEL[c.statut])}</span>
                  </div>
                  <div className="small muted">
                    {tr(MODE_LABEL[c.mode])}
                    {c.poidsKg != null && ` · ${c.poidsKg} kg`}{c.volumeM3 != null && ` · ${c.volumeM3} m³`}
                    {c.description && ` · ${c.description}`}
                  </div>
                  <div className="small">
                    {c.expeditionCode
                      ? <Link className="link" to={`/fret/expeditions/${encodeURIComponent(c.expeditionCode)}`}>{tr("Expédition")} {c.expeditionCode}</Link>
                      : <span className="muted">{tr("Pas encore affecté")}</span>}
                    {f && <> · <strong>{money(f.montantTotal, f.devise)}</strong> {tr(FACTURE_STATUT_LABEL[f.statut])}</>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </AdminSheet>
  );
}

/* ---------------------------------- Tarifs ---------------------------------- */

/** Consultation des tarifs et entrepôts. La modification reste à l'administration. */
export function FretTarifs() {
  const { tr } = useI18n();
  const { s } = useStore();
  const [tarifs, setTarifs] = useState<TarifFret[]>([]);
  const [annexes, setAnnexes] = useState<TarifAnnexe[]>([]);
  const [entrepots, setEntrepots] = useState<WarehouseFull[]>([]);
  const [types, setTypes] = useState<TypeMarchandise[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void Promise.all([fetchTarifs(), fetchAnnexes(), fetchAllWarehouses(), fetchTypesMarchandise()])
      .then(([t, a, w, ty]) => { setTarifs(t.filter((x) => x.actif)); setAnnexes(a.filter((x) => x.actif)); setEntrepots(w.filter((x) => x.actif)); setTypes(ty); setLoading(false); });
  }, []);
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.libelle ?? code;
  const UNITE: Record<TarifFret['unite'], string> = { kg: 'le kg', m3: 'le m³', colis: 'le colis', conteneur: 'le conteneur' };

  return (
    <>
      <Head title="Tarifs" sub="Tarifs en vigueur et entrepôts, en consultation."
        right={s.user?.role === 'admin' ? <Button to="/equipe/tarifs" kind="s" icon="edit" full={false}>{tr("Modifier les tarifs")}</Button> : undefined} />
      <div className="admin-body" style={{ gap: 18 }}>
        {loading ? <p className="muted" role="status">{tr("Chargement…")}</p> : (
          <>
            <section className="card stack" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Fret")}</h2>
              {tarifs.length === 0 ? <p className="muted">{tr("Aucun tarif en vigueur.")}</p> : tarifs.map((t) => (
                <div key={t.id} className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>{tr(MODE_LABEL[t.mode])} · <span className="muted">{tr(typeLabel(t.typeMarchandise))}</span></span>
                  <strong>{money(t.prix, t.devise)} {tr(UNITE[t.unite])}</strong>
                </div>
              ))}
            </section>
            <section className="card stack" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Frais annexes")}</h2>
              {annexes.length === 0 ? <p className="muted">{tr("Aucun frais annexe.")}</p> : annexes.map((a) => (
                <div key={a.id} className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>{a.libelle}{a.zone && <span className="muted"> · {a.zone}</span>}{a.joursGratuits != null && <span className="muted"> · {a.joursGratuits} {tr("jours gratuits")}</span>}</span>
                  <strong>{money(a.prix, a.devise)}</strong>
                </div>
              ))}
            </section>
            <section className="card stack" style={{ gap: 10 }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Entrepôts")}</h2>
              {entrepots.length === 0 ? <p className="muted">{tr("Aucun entrepôt actif.")}</p> : entrepots.map((w) => (
                <div key={w.id} className="stack" style={{ gap: 2 }}>
                  <strong>{w.nom}</strong>
                  <span className="small muted">{[w.ville, w.addrFr].filter(Boolean).join(' · ')}</span>
                  {w.addrCn && <span className="small zh">{w.addrCn}</span>}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------------------------- Profil ---------------------------------- */

export function FretProfil() {
  return (
    <>
      <Head title="Mon profil" sub="Votre nom, votre numéro et votre mot de passe." />
      <div className="admin-body" style={{ gap: 20, maxWidth: 560 }}><ProfileForms /></div>
    </>
  );
}
