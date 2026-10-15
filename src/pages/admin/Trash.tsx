import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Button, Icon } from '../../ui';
import { logBulk, runBulk, toggleAll, toggleOne, type BulkResult } from '../../lib/bulk';
import { purgeProviders, restoreProviders } from '../../lib/providers';
import { fetchMembers, purgeAccounts, restoreAccounts, ROLE_LABEL, trashDaysLeft, TRASH_DAYS, type Member } from '../../lib/members';
import { BulkBar, BulkReport } from './BulkBar';

/** Corbeille des comptes : restauration ou suppression définitive. Purge automatique après 30 jours. */
export function Trash() {
  const { tr, t } = useI18n();
  const { s, api } = useStore();
  const [items, setItems] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<BulkResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'accounts' | 'fiches'>('accounts');

  const reload = useCallback(async () => {
    const all = await fetchMembers();
    setItems(all.filter((m) => m.deletedAt).sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? '')));
    setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const fiches = s.trashedProviders;
  const ids = tab === 'accounts' ? items.map((m) => m.id) : fiches.map((p) => p.id);
  const names = Object.fromEntries([...items.map((m) => [m.id, m.name ?? m.email]), ...fiches.map((p) => [p.id, p.name])]);
  const switchTab = (next: 'accounts' | 'fiches') => { setTab(next); setSelected(new Set()); setReport([]); };

  const restore = async () => {
    setBusy(true);
    const result = await runBulk([...selected], tab === 'accounts' ? restoreAccounts : restoreProviders);
    setBusy(false); setReport(result); setSelected(new Set());
    await logBulk(tab === 'accounts' ? 'accounts.restore' : 'fiches.restore', tab === 'accounts' ? 'account' : 'fiche', result);
    await reload(); await api.reloadProviders();
  };
  const purge = async () => {
    const list = [...selected];
    if (!window.confirm(t('Supprimer définitivement {0} élément(s) ? Cette action est irréversible.', { 0: list.length }))) return;
    setBusy(true);
    const result = tab === 'accounts'
      ? await runBulk(list, purgeAccounts, { skip: (id) => (id === s.user?.id ? 'Vous-même' : null) })
      : await runBulk(list, (id) => purgeProviders(id, fiches.find((p) => p.id === id)?.photoPaths ?? []));
    setBusy(false); setReport(result); setSelected(new Set());
    await logBulk(tab === 'accounts' ? 'accounts.purge' : 'fiches.purge', tab === 'accounts' ? 'account' : 'fiche', result);
    await reload(); await api.reloadProviders();
  };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Corbeille")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{t('Les comptes sont conservés {0} jours, puis supprimés définitivement.', { 0: TRASH_DAYS })}</div>
        </div>
      </header>
      <div className="admin-body" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 8 }}>
          <Button kind={tab === 'accounts' ? 'p' : 's'} full={false} onClick={() => switchTab('accounts')}>{t('Comptes ({0})', { 0: items.length })}</Button>
          <Button kind={tab === 'fiches' ? 'p' : 's'} full={false} onClick={() => switchTab('fiches')}>{t('Fiches ({0})', { 0: fiches.length })}</Button>
        </div>
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tab === 'accounts' ? t('{0} compte(s) à la corbeille', { 0: items.length }) : t('{0} fiche(s) à la corbeille', { 0: fiches.length })}</h2>
          <BulkReport report={report} names={names} />
          {tab === 'fiches' ? (fiches.length === 0 ? <p className="muted">{tr("La corbeille est vide.")}</p> : (
            <div className="stack" style={{ gap: 8 }}>
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={ids.length > 0 && ids.every((id) => selected.has(id))} onChange={() => setSelected(toggleAll(selected, ids))} />
                {tr("Tout sélectionner")}
              </label>
              {fiches.map((p) => (
                <label key={p.id} className="card row" style={{ gap: 10, padding: 12, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 22, height: 22, flex: 'none' }} checked={selected.has(p.id)} onChange={() => setSelected(toggleOne(selected, p.id))} />
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}><strong>{p.name}</strong><span className="small muted">{p.cn}</span></span>
                  <span className="small"><Icon name="info" size={14} /> {t('{0} jour(s) restant(s)', { 0: trashDaysLeft(p.deletedAt!) })}</span>
                </label>
              ))}
            </div>
          )) : loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : items.length === 0 ? <p className="muted">{tr("La corbeille est vide.")}</p> : (
            <div className="stack" style={{ gap: 8 }}>
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={ids.length > 0 && ids.every((id) => selected.has(id))} onChange={() => setSelected(toggleAll(selected, ids))} />
                {tr("Tout sélectionner")}
              </label>
              {items.map((m) => (
                <label key={m.id} className="card row" style={{ gap: 10, padding: 12, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 22, height: 22, flex: 'none' }} checked={selected.has(m.id)} onChange={() => setSelected(toggleOne(selected, m.id))} />
                  <span className="stack" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                    <strong>{m.name ?? m.email}</strong>
                    <span className="small muted">{m.email} · {tr(ROLE_LABEL[m.role])}</span>
                  </span>
                  <span className="small"><Icon name="info" size={14} /> {t('{0} jour(s) restant(s)', { 0: trashDaysLeft(m.deletedAt!) })}</span>
                </label>
              ))}
            </div>
          )}
        </section>
        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <Button kind="s" icon="refresh" full={false} disabled={busy} onClick={() => void restore()}>{tr("Restaurer")}</Button>
          <Button kind="d" icon="trash" full={false} disabled={busy} onClick={() => void purge()}>{tr("Supprimer maintenant")}</Button>
        </BulkBar>
      </div>
    </>
  );
}
