import { useI18n } from '../../i18n';
import type { ReactNode } from 'react';
import { summarizeBulk, type BulkResult } from '../../lib/bulk';
import { Button, Icon } from '../../ui';

/** Barre d'actions groupées : visible dès qu'au moins une ligne est cochée. */
export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  const { tr, t } = useI18n();
  if (count === 0) return null;
  return (
    <div className="bulk-bar" role="region" aria-label={tr("Actions groupées")}>
      <strong>{t('{0} sélectionné(s)', { 0: count })}</strong>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{children}</div>
      <Button kind="t" full={false} onClick={onClear}>{tr("Annuler")}</Button>
    </div>
  );
}

/** Compte rendu d'une opération groupée, avec le détail des refus. */
export function BulkReport({ report, names }: { report: BulkResult[]; names: Record<string, string> }) {
  const { tr } = useI18n();
  if (report.length === 0) return null;
  const problems = report.filter((r) => r.status !== 'done');
  return (
    <div role="status" className={`notice ${problems.length ? 'warn' : 'ok'}`}>
      <Icon name={problems.length ? 'info' : 'check'} size={20} sw={2} />
      <div>
        <strong>{summarizeBulk(report)}</strong>
        {problems.length > 0 && (
          <ul className="small" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {problems.map((r) => <li key={r.id}>{names[r.id] ?? r.id} — {tr(r.reason ?? '')}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
