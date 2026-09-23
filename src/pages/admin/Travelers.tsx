import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import { Button, DemoNote, Icon, NotProvided } from '../../ui';
import { SortTh, compare, useSort } from './tableSort';
import type { AccountStatus } from '../../lib/auth';
import {
  STATUS_LABEL, deleteTraveler, fetchMembers, setTravelerStatus, updateTraveler,
  type Member,
} from '../../lib/members';

const shown = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Liste des comptes voyageurs, réservée aux administrateurs (RLS sur `profiles`).
    Un administrateur peut modifier (nom, téléphone), désactiver / réactiver
    ou supprimer définitivement un compte (garde-fous en base :
    supabase/admin_travelers.sql). */
export function Travelers() {
  const { tr, t } = useI18n();
  const [travelers, setTravelers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pq, setPq] = useState('');
  const [state, setState] = useState<'' | AccountStatus>('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', phone: '' });
  const [confirming, setConfirming] = useState<Member | null>(null);
  const [typed, setTyped] = useState('');
  const { sort, toggle } = useSort<'name' | 'createdAt'>({ k: 'createdAt', dir: -1 });

  const reload = useCallback(async () => {
    const m = await fetchMembers();
    setTravelers(m.filter((x) => x.role === 'traveler'));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  /** Exécute une action en base, puis recharge la liste et affiche le résultat. */
  const run = async (id: string, action: () => Promise<{ error?: string }>, done: string) => {
    setErr(null); setOk(null); setBusy(id);
    const { error } = await action();
    setBusy(null);
    if (error) { setErr(error); return; }
    setOk(done);
    setEditing(null); setConfirming(null); setTyped('');
    await reload();
  };

  const startEdit = (m: Member) => {
    setErr(null); setOk(null); setConfirming(null);
    setEditing(m.id);
    setDraft({ name: m.name ?? '', phone: m.phone ?? '' });
  };

  const rows = travelers
    .filter((m) => (!state || m.status === state)
      && (!pq || `${m.name ?? ''} ${m.email}`.toLowerCase().includes(pq.toLowerCase())))
    .sort((a, b) => compare(sort.k === 'createdAt' ? a.createdAt : (a.name ?? a.email).toLowerCase(), sort.k === 'createdAt' ? b.createdAt : (b.name ?? b.email).toLowerCase(), sort.dir));

  const suspended = travelers.filter((m) => m.status === 'suspended').length;

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
            : rows.length === 0 ? <p className="muted">{tr(pq || state ? 'Aucun voyageur ne correspond à la recherche.' : 'Aucun voyageur inscrit pour le moment.')}</p> : (
            <div className="table dense"><table>
              <thead><tr><SortTh k="name" label="Voyageur" sort={sort} onSort={toggle} /><th>{tr("Téléphone")}</th><th>{tr("Statut")}</th><SortTh k="createdAt" label="Inscrit le" sort={sort} onSort={toggle} /><th>{tr("Actions")}</th></tr></thead>
              <tbody>
                {rows.map((m) => {
                  const off = m.status === 'suspended';
                  return (
                    <tr key={m.id} style={off ? { opacity: 0.85 } : undefined}>
                      <td>
                        {editing === m.id ? (
                          <input type="text" value={draft.name} aria-label={tr("Nom du voyageur")} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                        ) : (
                          <><strong>{tr(m.name ?? '—')}</strong><div className="small muted">{m.email}</div></>
                        )}
                      </td>
                      <td>
                        {editing === m.id
                          ? <input type="tel" value={draft.phone} aria-label={tr("Téléphone du voyageur")} placeholder={tr("Non renseigné")} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                          : (m.phone ?? <NotProvided />)}
                      </td>
                      <td>
                        {/* Le statut est écrit en toutes lettres : jamais signalé par la couleur seule. */}
                        <span className={`tag tag-${off ? 'warn' : 'ok'}`}><Icon name={off ? 'lock' : 'check'} size={15} sw={2} />{tr(STATUS_LABEL[m.status])}</span>
                        {off && m.suspendedReason && <div className="small muted">{m.suspendedReason}</div>}
                      </td>
                      <td>{shown(m.createdAt)}</td>
                      <td>
                        {editing === m.id ? (
                          <div className="row-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button kind="p" icon="check" full={false} disabled={busy === m.id} onClick={() => void run(m.id, () => updateTraveler(m.id, draft.name, draft.phone), 'Compte modifié.')}>{tr("Enregistrer")}</Button>
                            <Button kind="t" icon="x" full={false} onClick={() => setEditing(null)}>{tr("Annuler")}</Button>
                          </div>
                        ) : (
                          <div className="row-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <Button kind="s" icon="edit" full={false} onClick={() => startEdit(m)}>{tr("Modifier")}</Button>
                            <Button kind="s" icon={off ? 'check' : 'lock'} full={false} disabled={busy === m.id}
                              onClick={() => void run(m.id, () => setTravelerStatus(m.id, off ? 'active' : 'suspended', off ? '' : 'Désactivé par l’équipe'), off ? 'Compte réactivé.' : 'Compte désactivé.')}>
                              {tr(off ? 'Réactiver' : 'Désactiver')}
                            </Button>
                            <Button kind="d" icon="trash" full={false} disabled={busy === m.id}
                              onClick={() => { setErr(null); setOk(null); setEditing(null); setTyped(''); setConfirming(m); }}>
                              {tr("Supprimer")}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </section>

        {confirming && (
          <section className="card stack" style={{ gap: 12, borderColor: 'var(--danger)' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Supprimer définitivement ce compte ?")}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              {tr("Le compte, ses notes et ses favoris seront supprimés. Ses contributions sont conservées, sans auteur. Cette action est irréversible.")}
            </p>
            <p style={{ margin: 0 }}><strong>{tr(confirming.name ?? '—')}</strong> <span className="small muted">{confirming.email}</span></p>
            <div className="field" style={{ maxWidth: 360 }}>
              <label htmlFor="confirm-mail">{t('Saisissez {0} pour confirmer', { 0: confirming.email })}</label>
              <input id="confirm-mail" type="email" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button kind="d" icon="trash" full={false}
                disabled={busy === confirming.id || typed.trim().toLowerCase() !== confirming.email.toLowerCase()}
                onClick={() => void run(confirming.id, () => deleteTraveler(confirming.id), 'Compte supprimé.')}>
                {tr("Supprimer définitivement")}
              </Button>
              <Button kind="t" icon="x" full={false} onClick={() => { setConfirming(null); setTyped(''); }}>{tr("Annuler")}</Button>
            </div>
          </section>
        )}

        <DemoNote />
      </div>
    </>
  );
}
