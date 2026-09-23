import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import { Button, DemoNote, Field, Icon, NotProvided, useWide } from '../../ui';
import { SortTh, compare, useSort } from './tableSort';
import type { AccountStatus } from '../../lib/auth';
import {
  STATUS_LABEL, deleteTraveler, fetchMembers, setTravelerStatus, updateTraveler,
  type Member,
} from '../../lib/members';

const shown = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/* Pastilles d'initiales (présentation de la liste sur téléphone) : teinte déduite
   du nom, donc stable d'un affichage à l'autre. */
const AVATAR_TONES = ['#F3C6CE', '#CFC6F3', '#BFD8F5', '#BEE3D0', '#F5DFB8', '#C9D6EE'];
const initiales = (nom: string, email: string) => {
  const src = (nom || email).trim();
  const mots = src.split(/\s+/).filter(Boolean);
  const a = mots[0]?.[0] ?? '?';
  const b = mots.length > 1 ? mots[mots.length - 1][0] : (mots[0]?.[1] ?? '');
  return (a + b).toUpperCase();
};
const teinte = (s: string) => AVATAR_TONES[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % AVATAR_TONES.length];

/** Statut du compte, écrit en toutes lettres : jamais signalé par la couleur seule. */
function StatusTag({ status }: { status: AccountStatus }) {
  const { tr } = useI18n();
  const off = status === 'suspended';
  return (
    <span className={`tag tag-${off ? 'warn' : 'ok'}`}>
      <Icon name={off ? 'lock' : 'check'} size={15} sw={2} />{tr(STATUS_LABEL[status])}
    </span>
  );
}

/** Fiche du voyageur, ouverte au clic : modification, désactivation, suppression.
    Plein écran sous 1024 px (voir .trav-sheet dans styles.css). */
function TravelerSheet({ m, onClose, onSaved }: { m: Member; onClose: () => void; onSaved: (msg: string) => void }) {
  const { tr, t } = useI18n();
  const [name, setName] = useState(m.name ?? '');
  const [phone, setPhone] = useState(m.phone ?? '');
  const [typed, setTyped] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<'save' | 'status' | 'delete' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const off = m.status === 'suspended';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.getElementById('tv-name')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Exécute une action en base : la fiche se ferme et la liste se recharge. */
  const run = async (kind: 'save' | 'status' | 'delete', action: () => Promise<{ error?: string }>, done: string) => {
    setErr(null); setBusy(kind);
    const { error } = await action();
    setBusy(null);
    if (error) { setErr(error); return; }
    onSaved(done);
  };

  const save = () => {
    if (name.trim().length < 2) { setErr('Le nom doit contenir au moins 2 caractères.'); return; }
    void run('save', () => updateTraveler(m.id, name, phone), 'Compte modifié.');
  };

  return (
    <div className="overlay trav-overlay" onClick={onClose}>
      <div className="dialog trav-sheet" role="dialog" aria-modal="true" aria-label={t('Fiche de {0}', { 0: m.name ?? m.email })}
        onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 22 }}>{tr(m.name ?? '—')}</h2>
            <div className="small muted" style={{ overflowWrap: 'anywhere' }}>{m.email}</div>
          </div>
          <button type="button" className="iconbtn" aria-label={tr("Fermer")} onClick={onClose}><Icon name="x" size={22} sw={2.2} /></button>
        </div>

        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <StatusTag status={m.status} />
          <span className="small muted">{t('Inscrit le {0}', { 0: shown(m.createdAt) })}</span>
        </div>

        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}

        <Field id="tv-name" label="Nom du voyageur" value={name} onChange={setName} req />
        <Field id="tv-phone" label="Téléphone" type="tel" value={phone} onChange={setPhone}
          placeholder="Non renseigné" hint="Facultatif : espaces et indicatif acceptés." />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button icon="check" full={false} disabled={busy !== null} onClick={save}>
            {tr(busy === 'save' ? 'Enregistrement…' : 'Enregistrer')}
          </Button>
          <Button kind="s" icon={off ? 'check' : 'lock'} full={false} disabled={busy !== null}
            onClick={() => void run('status', () => setTravelerStatus(m.id, off ? 'active' : 'suspended', off ? '' : 'Désactivé par l’équipe'),
              off ? 'Compte réactivé.' : 'Compte désactivé.')}>
            {tr(off ? 'Réactiver' : 'Désactiver')}
          </Button>
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {confirming ? (
            <>
              <h3 style={{ margin: 0, fontSize: 16, color: 'var(--danger)' }}>{tr("Supprimer définitivement ce compte ?")}</h3>
              <p className="small muted" style={{ margin: 0 }}>
                {tr("Le compte, ses notes et ses favoris seront supprimés. Ses contributions sont conservées, sans auteur. Cette action est irréversible.")}
              </p>
              <Field id="tv-confirm" label={t('Saisissez {0} pour confirmer', { 0: m.email })} type="email" value={typed} onChange={setTyped} />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button kind="d" icon="trash" full={false} disabled={busy !== null || typed.trim().toLowerCase() !== m.email.toLowerCase()}
                  onClick={() => void run('delete', () => deleteTraveler(m.id), 'Compte supprimé.')}>
                  {tr(busy === 'delete' ? 'Suppression…' : 'Supprimer définitivement')}
                </Button>
                <Button kind="t" icon="x" full={false} disabled={busy !== null}
                  onClick={() => { setConfirming(false); setTyped(''); }}>{tr("Annuler")}</Button>
              </div>
            </>
          ) : (
            <Button kind="d" icon="trash" full={false} onClick={() => { setErr(null); setConfirming(true); }}>
              {tr("Supprimer le voyageur")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Liste des comptes voyageurs, réservée aux administrateurs (RLS sur `profiles`).
    Sur téléphone, chaque voyageur ouvre sa fiche d'édition ; sur ordinateur, le
    tableau reste affiché et le nom ouvre la même fiche. Garde-fous en base :
    supabase/admin_travelers.sql. */
export function Travelers() {
  const { tr, t } = useI18n();
  const wide = useWide();
  const [travelers, setTravelers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pq, setPq] = useState('');
  const [state, setState] = useState<'' | AccountStatus>('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [open, setOpen] = useState<Member | null>(null);
  const { sort, toggle } = useSort<'name' | 'createdAt'>({ k: 'createdAt', dir: -1 });

  const reload = useCallback(async () => {
    const m = await fetchMembers();
    setTravelers(m.filter((x) => x.role === 'traveler'));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const rows = travelers
    .filter((m) => (!state || m.status === state)
      && (!pq || `${m.name ?? ''} ${m.email}`.toLowerCase().includes(pq.toLowerCase())))
    .sort((a, b) => compare(sort.k === 'createdAt' ? a.createdAt : (a.name ?? a.email).toLowerCase(), sort.k === 'createdAt' ? b.createdAt : (b.name ?? b.email).toLowerCase(), sort.dir));

  const suspended = travelers.filter((m) => m.status === 'suspended').length;

  const saved = (msg: string) => { setErr(null); setOk(msg); setOpen(null); void reload(); };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Voyageurs")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr("Comptes voyageurs inscrits sur Diaba Guide.")}</div>
        </div>
      </header>
      <div className="admin-body" style={{ gap: 18 }}>
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{t('{0} voyageur(s) inscrit(s)', { 0: travelers.length })}</h2>

          {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(ok)}</span></div>}
          {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}

          <div className="filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="admin-search" style={{ maxWidth: 360, flex: '1 1 220px' }}>
              <Icon name="search" size={18} />
              <input type="search" value={pq} onChange={(e) => setPq(e.target.value)} aria-label={tr("Rechercher un voyageur")} placeholder={tr("Rechercher par nom ou e-mail")} />
            </div>
            <div>
              <label className="small muted" htmlFor="fstat" style={{ display: 'block', marginBottom: 4 }}>{tr("Statut")}</label>
              <select id="fstat" value={state} onChange={(e) => setState(e.target.value as '' | AccountStatus)}>
                <option value="">{tr("Tous")}</option>
                <option value="active">{tr("Actifs")}</option>
                <option value="suspended">{tr("Désactivés")}</option>
              </select>
            </div>
            {suspended > 0 && <div className="small muted">{t('{0} compte(s) désactivé(s)', { 0: suspended })}</div>}
          </div>

          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : rows.length === 0 ? <p className="muted">{tr(pq || state ? 'Aucun voyageur ne correspond à la recherche.' : 'Aucun voyageur inscrit pour le moment.')}</p>
            : wide ? (
            <div className="table dense"><table>
              <thead><tr><SortTh k="name" label="Voyageur" sort={sort} onSort={toggle} /><th>{tr("Téléphone")}</th><th>{tr("Statut")}</th><SortTh k="createdAt" label="Inscrit le" sort={sort} onSort={toggle} /><th>{tr("Actions")}</th></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} style={m.status === 'suspended' ? { opacity: 0.85 } : undefined}>
                    <td>
                      <button type="button" className="linklike" onClick={() => setOpen(m)}><strong>{tr(m.name ?? '—')}</strong></button>
                      <div className="small muted">{m.email}</div>
                    </td>
                    <td>{m.phone ?? <NotProvided />}</td>
                    <td><StatusTag status={m.status} />
                      {m.status === 'suspended' && m.suspendedReason && <div className="small muted">{m.suspendedReason}</div>}
                    </td>
                    <td>{shown(m.createdAt)}</td>
                    <td><Button kind="s" icon="edit" full={false} onClick={() => setOpen(m)}>{tr("Ouvrir la fiche")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <div className="trav-cards">
              {rows.map((m) => (
                <button key={m.id} type="button" className="trav-card" onClick={() => setOpen(m)}
                  aria-label={t('Ouvrir la fiche de {0}', { 0: m.name ?? m.email })}>
                  <span className="tc-av" aria-hidden="true" style={{ background: teinte(m.name ?? m.email) }}>
                    {initiales(m.name ?? '', m.email)}
                  </span>
                  <span className="tc-main">
                    <span className="tc-name">{tr(m.name ?? '—')}</span>
                    <span className="tc-phone">{m.phone ?? <NotProvided />}</span>
                  </span>
                  {m.status === 'suspended' && <StatusTag status={m.status} />}
                  <Icon name="chevR" size={22} sw={2.2} />
                </button>
              ))}
            </div>
          )}
        </section>

        {open && <TravelerSheet m={open} onClose={() => setOpen(null)} onSaved={saved} />}

        <DemoNote />
      </div>
    </>
  );
}
