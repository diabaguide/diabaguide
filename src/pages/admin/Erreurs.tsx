import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button, Icon, Tag } from '../../ui';
import { fetchErreurs, journalInstalle, marquerErreur, purgerErreurs, type ErreurJournal } from '../../lib/erreursJournal';

/* Erreurs inattendues de l'application, notées par l'application elle-même (supabase/550_journal_erreurs.sql).
   Une ligne par erreur différente, avec le nombre de fois où elle s'est produite. Une erreur marquée résolue qui
   revient est rouverte toute seule. Administration seulement. */

const quand = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Filtre = 'a_traiter' | 'resolues' | 'toutes';

export function AdminErreurs() {
  const { tr, t } = useI18n();
  const [erreurs, setErreurs] = useState<ErreurJournal[]>([]);
  const [charge, setCharge] = useState(false);
  const [installe, setInstalle] = useState(true);
  const [filtre, setFiltre] = useState<Filtre>('a_traiter');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const recharger = useCallback(async () => {
    const ok = await journalInstalle();
    setInstalle(ok);
    setErreurs(ok ? await fetchErreurs() : []);
    setCharge(true);
  }, []);
  useEffect(() => { void recharger(); }, [recharger]);

  const aTraiter = useMemo(() => erreurs.filter((e) => !e.resolue), [erreurs]);
  const liste = useMemo(() => erreurs.filter((e) => filtre === 'toutes' || (filtre === 'resolues' ? e.resolue : !e.resolue)), [erreurs, filtre]);

  const basculer = async (e: ErreurJournal) => {
    setMsg(null); setErr(null);
    const r = await marquerErreur(e.id, !e.resolue);
    if (r) { setErr(r); return; }
    await recharger();
  };
  const purger = async () => {
    setMsg(null); setErr(null);
    const r = await purgerErreurs(30);
    if (r.error) { setErr(r.error); return; }
    setMsg(t('{0} erreur(s) résolue(s) supprimée(s).', { 0: r.supprimees ?? 0 }));
    await recharger();
  };

  return (
    <>
      <header className="admin-head"><div>
        <h1>{tr("Erreurs de l’application")}</h1>
        <div className="muted" style={{ marginTop: 4 }}>{tr("Les plantages inattendus constatés chez les voyageurs, sans attendre qu’ils écrivent.")}</div>
      </div></header>
      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {msg && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(msg)}</span></div>}

        {charge && !installe && (
          <div role="status" className="notice"><Icon name="info" size={20} /><span>{tr("Le journal des erreurs n’est pas encore installé : lancez supabase/550_journal_erreurs.sql dans Supabase.")}</span></div>
        )}

        {installe && (
          <section className="card stack" style={{ gap: 12 }}>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button kind={filtre === 'a_traiter' ? 'p' : 's'} full={false} onClick={() => setFiltre('a_traiter')}>{t('À traiter ({0})', { 0: aTraiter.length })}</Button>
              <Button kind={filtre === 'resolues' ? 'p' : 's'} full={false} onClick={() => setFiltre('resolues')}>{tr("Résolues")}</Button>
              <Button kind={filtre === 'toutes' ? 'p' : 's'} full={false} onClick={() => setFiltre('toutes')}>{tr("Toutes")}</Button>
              <Button kind="s" full={false} icon="refresh" onClick={() => void recharger()}>{tr("Rafraîchir")}</Button>
              <Button kind="s" full={false} icon="trash" onClick={() => void purger()}>{tr("Supprimer les résolues de plus de 30 jours")}</Button>
            </div>
            {!charge ? <p className="muted" role="status">{tr("Chargement…")}</p>
              : liste.length === 0 ? (
                <div className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(filtre === 'a_traiter' ? 'Aucune erreur à traiter. Tout va bien.' : 'Aucune erreur dans cette liste.')}</span></div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {liste.map((e) => (
                    <article key={e.id} className="card stack" style={{ gap: 8 }}>
                      <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <strong style={{ wordBreak: 'break-word' }}>{e.message}</strong>
                        <Tag tone={e.resolue ? 'ok' : 'warn'} icon={e.resolue ? 'check' : 'alert'}>{tr(e.resolue ? 'Résolue' : 'À traiter')}</Tag>
                      </div>
                      <div className="small muted">
                        {t('{0} fois', { 0: e.occurrences })} · {tr("dernière :")} {quand(e.derniereFois)} · {tr("page :")} <code>{e.page || '—'}</code>
                      </div>
                      {e.appareil && <div className="small muted" style={{ wordBreak: 'break-word' }}>{e.appareil}</div>}
                      {e.detail && <details><summary className="small">{tr("Détail technique")}</summary><pre className="small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '6px 0 0' }}>{e.detail}</pre></details>}
                      <div><Button kind="s" full={false} icon={e.resolue ? 'refresh' : 'check'} onClick={() => void basculer(e)}>{tr(e.resolue ? 'Rouvrir' : 'Marquer comme résolue')}</Button></div>
                    </article>
                  ))}
                </div>
              )}
          </section>
        )}
      </div>
    </>
  );
}
