import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../../store';
import { Button, Field, Icon, Select } from '../../ui';
import { SortTh, compare, useSort } from './tableSort';
import type { Role } from '../../lib/auth';
import {
  fetchInvitations, fetchMembers, inviteMember, revokeInvitation, setMemberRole,
  ROLE_LABEL, type Invitation, type Member,
} from '../../lib/members';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const RoleBadge = ({ role }: { role: Role }) => {
  const { tr } = useI18n();
  const style: Record<Role, { bg: string; fg: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
    admin: { bg: '#EAE4F5', fg: '#4B3A7A', icon: 'shield' },
    team: { bg: '#E3ECF7', fg: '#1F4A7A', icon: 'users' },
    traveler: { bg: '#E6EAF3', fg: '#2F3C57', icon: 'user' },
  };
  const st = style[role];
  return (
    <span className="row" style={{ gap: 6, background: st.bg, color: st.fg, fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 999, width: 'fit-content' }}>
      <Icon name={st.icon} size={15} sw={2.2} />{tr(ROLE_LABEL[role])}
    </span>
  );
};

export function Members() {
  const { tr } = useI18n();
  const { s } = useStore();
  const meId = s.user?.id;

  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'team' | 'admin'>('team');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [m, i] = await Promise.all([fetchMembers(), fetchInvitations()]);
    setMembers(m); setInvites(i); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const staff = members.filter((m) => m.role !== 'traveler');
  const { sort, toggle } = useSort<'name' | 'role'>({ k: 'name', dir: 1 });
  const [pq, setPq] = useState('');
  const shown = (showAll ? members : staff)
    .filter((m) => !pq || `${m.name ?? ''} ${m.email}`.toLowerCase().includes(pq.toLowerCase()))
    .sort((a, b) => compare(sort.k === 'role' ? a.role : (a.name ?? a.email).toLowerCase(), sort.k === 'role' ? b.role : (b.name ?? b.email).toLowerCase(), sort.dir));

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null);
    if (!EMAIL.test(email)) { setErr('Saisissez une adresse e-mail valide.'); return; }
    setBusy(true);
    const res = await inviteMember(email, role);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(res.outcome === 'promoted'
      ? `${email} a été ajouté comme ${ROLE_LABEL[role].toLowerCase()}.`
      : `Invitation enregistrée pour ${email}. Le rôle sera appliqué dès sa première connexion.`);
    setEmail('');
    await reload();
  };

  const change = async (id: string, next: Role) => {
    setErr(null); setOk(null); setConfirmId(null);
    const res = await setMemberRole(id, next);
    if (res.error) { setErr(res.error); return; }
    setOk(`Rôle mis à jour : ${ROLE_LABEL[next].toLowerCase()}.`);
    await reload();
  };

  const revoke = async (mail: string) => {
    setErr(null); setOk(null);
    const res = await revokeInvitation(mail);
    if (res.error) { setErr(res.error); return; }
    setOk(`Invitation annulée pour ${mail}.`);
    await reload();
  };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Membres")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>
            {tr("Gérez qui accède à l’espace équipe et à l’administration.")}</div>
        </div>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        {/* ---- Ajouter un membre ---- */}
        <section className="card stack" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Ajouter un membre")}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("Si la personne a déjà un compte, son rôle est appliqué immédiatement. Sinon, l’invitation est conservée et le rôle lui est accordé à sa première connexion.")}</p>
          <form onSubmit={invite} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="inv-mail" label={tr("Adresse e-mail")} type="email" value={email} onChange={setEmail} placeholder={tr("nom@exemple.com")} /></div>
            <Select id="inv-role" label={tr("Rôle")} value={role} onChange={(v) => setRole(v as 'team' | 'admin')}
              options={[{ v: 'team', l: 'Équipe' }, { v: 'admin', l: 'Administrateur' }]} />
            <Button type="submit" icon="plus" full={false} disabled={busy}>{tr(busy ? 'Ajout…' : 'Ajouter')}</Button>
          </form>
        </section>

        {/* ---- Invitations en attente ---- */}
        {invites.length > 0 && (
          <section className="card stack" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Invitations en attente (")}{tr(invites.length)})</h2>
            <div className="table dense"><table>
              <thead><tr><th>{tr("E-mail")}</th><th>{tr("Rôle prévu")}</th><th /></tr></thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.email}>
                    <td><strong>{i.email}</strong><div className="small muted">{tr("Pas encore inscrit")}</div></td>
                    <td><RoleBadge role={i.role} /></td>
                    <td><Button kind="s" icon="x" full={false} onClick={() => revoke(i.email)}>{tr("Annuler")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}

        {/* ---- Comptes ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>
              {tr(showAll ? `Tous les comptes (${members.length})` : `Équipe et administrateurs (${staff.length})`)}
            </h2>
            <Button kind="s" icon="users" full={false} onClick={() => setShowAll(!showAll)}>
              {tr(showAll ? 'Voir seulement le staff' : 'Voir tous les comptes')}
            </Button>
          </div>

          <div className="admin-search" style={{ maxWidth: 360 }}><Icon name="search" size={18} /><input type="search" value={pq} onChange={(e) => setPq(e.target.value)} aria-label={tr("Rechercher une personne")} placeholder={tr("Rechercher une personne")} /></div>
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : shown.length === 0 ? <p className="muted">{tr("Aucun compte à afficher.")}</p> : (
            <div className="table dense"><table>
              <thead><tr><SortTh k="name" label="Personne" sort={sort} onSort={toggle} /><SortTh k="role" label="Rôle" sort={sort} onSort={toggle} /><th>{tr("Actions")}</th></tr></thead>
              <tbody>
                {shown.map((m) => {
                  const isMe = m.id === meId;
                  return (
                    <tr key={m.id}>
                      <td>
                        <strong>{tr(m.name ?? '—')}{isMe && <span className="muted" style={{ fontWeight: 400 }}> {tr(" (vous)")}</span>}</strong>
                        <div className="small muted">{m.email}</div>
                      </td>
                      <td><RoleBadge role={m.role} /></td>
                      <td>
                        {isMe ? <span className="small muted">{tr("Votre propre rôle n’est pas modifiable")}</span>
                          : confirmId === m.id ? (
                            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                              <span className="small">{tr("Retirer l’accès ?")}</span>
                              <Button kind="d" full={false} onClick={() => change(m.id, 'traveler')}>{tr("Confirmer")}</Button>
                              <Button kind="s" full={false} onClick={() => setConfirmId(null)}>{tr("Annuler")}</Button>
                            </span>
                          ) : (
                            <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                              {m.role === 'traveler' && <Button kind="s" full={false} onClick={() => change(m.id, 'team')}>{tr("Ajouter à l’équipe")}</Button>}
                              {m.role === 'team' && <Button kind="s" icon="shield" full={false} onClick={() => change(m.id, 'admin')}>{tr("Nommer admin")}</Button>}
                              {m.role === 'admin' && <Button kind="s" full={false} onClick={() => change(m.id, 'team')}>{tr("Rétrograder en équipe")}</Button>}
                              {m.role !== 'traveler' && <Button kind="s" icon="x" full={false} onClick={() => setConfirmId(m.id)}>{tr("Retirer")}</Button>}
                            </span>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  );
}
