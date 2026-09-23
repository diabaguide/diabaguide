import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '../../i18n';
import { Button, Icon, useWide } from '../../ui';
import { AdminCard, AdminSheet, SheetActions } from './mobile';
import { fetchSearchStats, type SearchStats } from '../../lib/searchLogs';

/* Ce que les voyageurs cherchent en vain : chaque terme resté sans adresse, avec
   le nombre de recherches et de voyageurs concernés. Sert à décider quelles
   fiches aller chercher sur le terrain. */

const quand = (iso: string | null) => {
  if (!iso) return '—';
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j === 1) return 'hier';
  return `il y a ${j} jours`;
};

export function SearchLogs() {
  const { tr, t } = useI18n();
  const wide = useWide();
  const [jours, setJours] = useState(30);
  const [rows, setRows] = useState<SearchStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState<SearchStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRows(await fetchSearchStats(jours));
    setLoading(false);
  }, [jours]);
  useEffect(() => { void load(); }, [load]);

  const totalSansResultat = useMemo(() => rows.reduce((n, r) => n + r.sansResultat, 0), [rows]);
  const totalRecherches = useMemo(() => rows.reduce((n, r) => n + r.recherches, 0), [rows]);
  const termes = useMemo(() => new Set(rows.map((r) => r.terme)).size, [rows]);
  const partSansResultat = totalRecherches ? Math.round((totalSansResultat / totalRecherches) * 100) : 0;

  /** Liste prête à envoyer à l'équipe sur le terrain. */
  const copier = async () => {
    const texte = [
      `Recherches sans résultat — ${jours} derniers jours`,
      ...rows.map((r) => `• ${r.terme}${r.ville ? ` (${r.ville})` : ''} — ${r.sansResultat} recherche(s), ${r.voyageurs} voyageur(s)`),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(texte);
      setMsg('Liste copiée : vous pouvez la coller dans WhatsApp.');
    } catch {
      setMsg('Copie impossible depuis ce navigateur.');
    }
  };

  return <>
    <header className="admin-head">
      <div>
        <h1>{tr("Recherches des voyageurs")}</h1>
        <div className="muted" style={{ marginTop: 4 }}>
          {tr("Ce que les voyageurs ont cherché sans rien trouver : autant de fiches qui manquent au guide.")}
        </div>
      </div>
    </header>

    <div className="admin-body" style={{ gap: 18 }}>
      <section className="card stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {[7, 30, 90].map((n) => (
            <Button key={n} kind={jours === n ? 'p' : 's'} full={false} onClick={() => setJours(n)}>
              {t('{0} jours', { 0: n })}
            </Button>
          ))}
          <Button kind="s" full={false} icon="copy" disabled={!rows.length} onClick={() => void copier()}>
            {tr("Copier la liste")}
          </Button>
          <Button kind="s" full={false} icon="refresh" onClick={() => void load()}>{tr("Rafraîchir")}</Button>
        </div>

        {msg && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(msg)}</span></div>}

        <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
          <div><div className="small muted">{tr("Termes sans résultat")}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{termes}</div></div>
          <div><div className="small muted">{tr("Recherches sans résultat")}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{totalSansResultat}</div></div>
          <div>
            <div className="small muted">{tr("Part de ces recherches qui ne trouvent rien")}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{partSansResultat} %</div>
            <div className="small muted">{t('sur {0} recherche(s) portant sur ces termes', { 0: totalRecherches })}</div>
          </div>
        </div>
      </section>

      {loading ? <p className="muted" role="status">{tr("Chargement des recherches…")}</p>
        : rows.length === 0 ? (
          <div className="notice"><Icon name="search" size={20} /><div>
            <strong>{tr("Aucune recherche sans résultat sur la période.")}</strong>
            <div className="small">{tr("Tout ce que les voyageurs ont tapé a trouvé au moins une adresse. Le journal se remplit à chaque recherche dans l'application.")}</div>
          </div></div>
        ) : wide ? (
          <div className="table dense"><table>
            <thead><tr>
              <th>{tr("Terme cherché")}</th><th>{tr("Ville")}</th><th>{tr("Sans résultat")}</th>
              <th>{tr("Recherches")}</th><th>{tr("Voyageurs")}</th><th>{tr("Dernière")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.terme}|${r.ville ?? ''}`}>
                  <td><strong>{r.terme}</strong></td>
                  <td>{r.ville ?? '—'}</td>
                  <td>{r.sansResultat}</td>
                  <td>{r.recherches}</td>
                  <td>{r.voyageurs}</td>
                  <td className="small muted">{tr(quand(r.dernierLe))}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {rows.map((r) => (
              <AdminCard key={`${r.terme}|${r.ville ?? ''}`} onOpen={() => setOpen(r)} toneSeed={r.terme}
                ariaLabel={t('Ouvrir la recherche « {0} »', { 0: r.terme })}
                title={r.terme}
                sub={`${r.ville ?? '—'} · ${t('dernière {0}', { 0: quand(r.dernierLe) })}`}
                badge={<span className="tag tag-warn">{t('{0} sans résultat', { 0: r.sansResultat })}</span>} />
            ))}
          </div>
        )}
    </div>

    {open && <AdminSheet title={open.terme} sub={open.ville ?? undefined} onClose={() => setOpen(null)}>
      <div className="stack" style={{ gap: 12 }}>
        <div className="notice warn"><Icon name="search" size={20} /><div>
          {t('{0} recherche(s) sans aucune adresse, de la part de {1} voyageur(s).', { 0: open.sansResultat, 1: open.voyageurs })}
        </div></div>
        <div className="stack" style={{ gap: 6 }}>
          <div className="small muted">{t('Sur {0} recherche(s) au total pour ce terme.', { 0: open.recherches })}</div>
          <div className="small muted">{t('Dernière recherche sans résultat : {0}.', { 0: quand(open.dernierLe) })}</div>
        </div>
        <SheetActions>
          <Button kind="s" icon="copy" onClick={() => void copier()}>{tr("Copier la liste complète")}</Button>
          <Button kind="t" icon="x" onClick={() => setOpen(null)}>{tr("Fermer")}</Button>
        </SheetActions>
      </div>
    </AdminSheet>}
  </>;
}