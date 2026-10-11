import { useI18n } from '../../../i18n';
import { useState } from 'react';
import { Button, Select } from '../../../ui';
import {
  addEtapeExpedition, creerSuiviShipsGo, synchroniserShipsGo, ETAPE_LABEL,
  type EtapeExpedition, type EtapeType, type Expedition,
} from '../../../lib/fret';
import { ETAPES_ORDRE, type Notifier } from './shared';

const shipsGoErrorMessage = (status?: number, error?: string) => {
  if (status === 401) return 'Session expirée. Reconnectez-vous.';
  if (status === 403) return 'Action réservée à l’équipe.';
  if (status === 404) return 'Expédition introuvable.';
  if (status === 409) return error?.toLocaleLowerCase().includes('en cours')
    ? 'Le suivi ShipsGo est déjà activé ou en cours.'
    : 'Vérifiez les références de transport ou réessayez plus tard.';
  if (status === 400 || status === 422) return 'Vérifiez le numéro de conteneur ou d’AWB dans la fiche du lot.';
  return 'Le service de suivi est temporairement indisponible.';
};

/** Suivi ShipsGo d'une expédition (équipe). La création peut consommer un crédit. */
export function ShipsGoSection({ exp, setErr, setOk, reload }: { exp: Expedition } & Notifier) {
  const { tr, t } = useI18n();
  const [shipsGoBusy, setShipsGoBusy] = useState(false);

  const handleTrackShipsGo = async () => {
    if (!window.confirm(t('La création du suivi ShipsGo peut consommer un crédit. Continuer ?'))) return;
    setErr(null); setOk(null); setShipsGoBusy(true);
    try {
      const result = await creerSuiviShipsGo(exp.code);
      if (result.error || !result.ok) { setErr(shipsGoErrorMessage(result.httpStatus, result.error)); return; }
      setOk(result.reused ? t('Le suivi ShipsGo existant a été réutilisé.') : tr('Le suivi ShipsGo est activé.'));
      await reload();
    } finally { setShipsGoBusy(false); }
  };
  const handleSyncShipsGo = async () => {
    setErr(null); setOk(null); setShipsGoBusy(true);
    try {
      const result = await synchroniserShipsGo(exp.code);
      if (result.error || !result.ok) { setErr(shipsGoErrorMessage(result.httpStatus, result.error)); return; }
      setOk(t('Synchronisation ShipsGo terminée : {0} nouvelle(s) étape(s) ajoutée(s).', { 0: String(result.eventsAdded ?? 0) }));
      await reload();
    } finally { setShipsGoBusy(false); }
  };

  const shipsGoReferenceValid = exp.mode.startsWith('maritime')
    ? /^[A-Z]{4}\d{7}$/.test((exp.containerNo ?? '').replace(/\s+/g, '').toUpperCase())
    : /^\d{11}$/.test((exp.awbNo ?? '').replace(/[\s-]+/g, ''));
  const shipsGoActive = exp.shipsgoTrackingState === 'active' && exp.shipsgoId !== null && exp.shipsgoType !== null;

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{tr('Suivi ShipsGo')}</h2>
      {shipsGoActive ? (
        <div className="small muted">
          <p style={{ margin: 0 }}>{tr('Le suivi ShipsGo est activé.')}{exp.shipsgoStatus ? ` · ${exp.shipsgoStatus}` : ''}</p>
          {exp.shipsgoSyncedAt
            ? <p style={{ margin: '4px 0 0' }}>{tr('Dernière synchronisation')}: {new Date(exp.shipsgoSyncedAt).toLocaleString()}</p>
            : <p style={{ margin: '4px 0 0' }}>{tr('Aucune synchronisation effectuée pour l’instant.')}</p>}
        </div>
      ) : exp.shipsgoTrackingState === 'creating' ? (
        <p className="small muted" style={{ margin: 0 }}>{tr('Suivi en cours d’activation…')}</p>
      ) : <p className="small muted" style={{ margin: 0 }}>{tr('Aucune synchronisation effectuée pour l’instant.')}</p>}
      {!shipsGoActive && !shipsGoReferenceValid && (
        <p className="small muted" style={{ margin: 0 }}>{tr('Un numéro valide de conteneur ou d’AWB est requis pour activer ShipsGo.')}</p>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {shipsGoActive ? (
          <Button full={false} disabled={shipsGoBusy} onClick={() => void handleSyncShipsGo()}>
            {shipsGoBusy ? tr('Synchronisation…') : tr('Synchroniser maintenant')}
          </Button>
        ) : (
          <Button full={false} disabled={shipsGoBusy || !shipsGoReferenceValid} onClick={() => void handleTrackShipsGo()}>
            {shipsGoBusy ? tr('Suivi en cours d’activation…') : tr(exp.shipsgoTrackingState === 'error' || exp.shipsgoTrackingState === 'creating' ? 'Réessayer l’activation' : 'Activer le suivi ShipsGo')}
          </Button>
        )}
      </div>
    </section>
  );
}

/** Étapes d'une expédition : une étape ajoutée s'applique à tous ses colis, sans jamais reculer. */
export function EtapesSection({ code, etapes, busy, setBusy, setErr, setOk, reload }: {
  code: string; etapes: EtapeExpedition[]; busy: boolean; setBusy: (busy: boolean) => void;
} & Notifier) {
  const { tr } = useI18n();
  const [nouvelleEtape, setNouvelleEtape] = useState<EtapeType | ''>('');
  const ajouterEtape = async () => {
    if (!nouvelleEtape) return;
    const indexNouvelle = ETAPES_ORDRE.indexOf(nouvelleEtape);
    const dernierIndex = Math.max(-1, ...etapes.map((e) => ETAPES_ORDRE.indexOf(e.type)));
    if (indexNouvelle < 0 || indexNouvelle <= dernierIndex) {
      setErr('Une étape ne peut pas faire reculer le suivi de l’expédition.');
      return;
    }
    setErr(null); setOk(null); setBusy(true);
    const res = await addEtapeExpedition(code, nouvelleEtape);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Étape « ${tr(ETAPE_LABEL[nouvelleEtape])} » ajoutée : les colis de l’expédition avancent avec elle.`);
    setNouvelleEtape(''); await reload();
  };

  const dejaFaites = new Set(etapes.map((e) => e.type));
  const dernierIndex = Math.max(-1, ...etapes.map((e) => ETAPES_ORDRE.indexOf(e.type)));
  const etapesDisponibles = ETAPES_ORDRE.filter((t, index) => index > dernierIndex && !dejaFaites.has(t));

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Étapes de l’expédition")}</h2>
      <p className="small muted" style={{ margin: 0 }}>{tr("Une étape ajoutée ici s’applique à tous les colis de l’expédition.")}</p>
      {etapes.length === 0 ? <p className="muted">{tr("Aucune étape pour l’instant.")}</p> : (
        <ol className="stack" style={{ gap: 8, margin: 0, paddingLeft: 20 }}>
          {etapes.map((e) => (
            <li key={e.id}>
              <span style={{ fontWeight: 600 }}>{tr(ETAPE_LABEL[e.type])}</span>
              <span className="small muted"> · {new Date(e.au).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              <span className="small muted"> · {tr(e.visibleClient ? 'Visible par le voyageur' : 'Interne')}</span>
              {e.source === 'shipsgo' && <span className="small muted"> · {tr('Synchronisé par ShipsGo')}</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <Select id="nouvelle-etape" label={tr("Ajouter une étape")} value={nouvelleEtape} onChange={(v) => setNouvelleEtape(v as EtapeType | '')}
          options={[{ v: '', l: etapesDisponibles.length ? 'Choisir une étape…' : 'Suivi terminé' }, ...etapesDisponibles.map((t) => ({ v: t, l: ETAPE_LABEL[t] }))]} />
        <Button icon="plus" full={false} disabled={!nouvelleEtape || busy || !etapesDisponibles.includes(nouvelleEtape as EtapeType)} onClick={() => void ajouterEtape()}>{tr("Ajouter")}</Button>
      </div>
    </section>
  );
}
