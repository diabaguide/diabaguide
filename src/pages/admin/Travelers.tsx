import { useI18n } from '../../i18n';
import { useEffect, useState } from 'react';
import { DemoNote, Icon, NotProvided } from '../../ui';
import { SortTh, compare, useSort } from './tableSort';
import { fetchMembers, type Member } from '../../lib/members';

const shown = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** Liste des comptes voyageurs, réservée aux administrateurs (RLS sur `profiles`). */
export function Travelers() {
  const { tr, t } = useI18n();
  const [travelers, setTravelers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [pq, setPq] = useState('');
  const { sort, toggle } = useSort<'name' | 'createdAt'>({ k: 'createdAt', dir: -1 });

  useEffect(() => {
    let alive = true;
    fetchMembers().then((m) => {
      if (!alive) return;
      setTravelers(m.filter((x) => x.role === 'traveler'));
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const rows = travelers
    .filter((m) => !pq || `${m.name ?? ''} ${m.email}`.toLowerCase().includes(pq.toLowerCase()))
    .sort((a, b) => compare(sort.k === 'createdAt' ? a.createdAt : (a.name ?? a.email).toLowerCase(), sort.k === 'createdAt' ? b.createdAt : (b.name ?? b.email).toLowerCase(), sort.dir));

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
          <div className="admin-search" style={{ maxWidth: 360 }}>
            <Icon name="search" size={18} />
            <input type="search" value={pq} onChange={(e) => setPq(e.target.value)} aria-label={tr("Rechercher un voyageur")} placeholder={tr("Rechercher par nom ou e-mail")} />
          </div>
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : rows.length === 0 ? <p className="muted">{tr(pq ? 'Aucun voyageur ne correspond à la recherche.' : 'Aucun voyageur inscrit pour le moment.')}</p> : (
            <div className="table dense"><table>
              <thead><tr><SortTh k="name" label="Voyageur" sort={sort} onSort={toggle} /><th>{tr("Téléphone")}</th><SortTh k="createdAt" label="Inscrit le" sort={sort} onSort={toggle} /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><strong>{tr(m.name ?? '—')}</strong><div className="small muted">{m.email}</div></td>
                    <td>{m.phone ?? <NotProvided />}</td>
                    <td>{shown(m.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
        <DemoNote />
      </div>
    </>
  );
}
