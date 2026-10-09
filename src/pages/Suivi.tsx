import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Field, Screen, Section, TopBar } from '../ui';
import { useI18n } from '../i18n';
import {
  ETAPE_LABEL,
  EXPEDITION_STATUT_LABEL,
  MODE_LABEL,
  fetchSuiviPublic,
  type SuiviPublic,
  type EtapeType,
} from '../lib/fret';

const ETAPES_PUBLIQUES: EtapeType[] = ['annonce', 'en_transit', 'arrive_dakar', 'dispo_retrait', 'en_livraison', 'remis'];

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function SuiviPublic() {
  const { tr } = useI18n();
  const { code: routeCode } = useParams<{ code?: string }>();
  const [code, setCode] = useState(routeCode ?? '');
  const [suivi, setSuivi] = useState<SuiviPublic | null>(null);
  const [loading, setLoading] = useState(Boolean(routeCode));
  const [searched, setSearched] = useState(Boolean(routeCode));

  const rechercher = async (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setLoading(true);
    setSearched(true);
    setSuivi(await fetchSuiviPublic(normalized));
    setLoading(false);
  };

  useEffect(() => {
    if (routeCode) void rechercher(routeCode);
  }, [routeCode]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void rechercher(code);
  };

  const prochaineEtape = suivi
    ? ETAPES_PUBLIQUES.find((type, index) => index > Math.max(-1, ...suivi.etapes.map((etape) => ETAPES_PUBLIQUES.indexOf(etape.type))))
    : null;
  const etapesParType = new Map(suivi?.etapes.map((etape) => [etape.type, etape]) ?? []);

  return (
    <Screen nav={false}>
      <TopBar title="Suivre une expédition" back={-1} />
      <main className="page stack">
        <section className="hero compact">
          <span className="eyebrow">Diaba Guide · Fret</span>
          <h2>Suivez votre lot</h2>
          <p>Entrez le code communiqué par Diaba pour consulter les dernières étapes visibles.</p>
        </section>

        <form className="card stack" onSubmit={submit}>
          <Field
            id="code-expedition"
            label="Code de l'expédition"
            value={code}
            onChange={setCode}
            placeholder="Ex. EXP-2026-AB12"
            req
          />
          <Button type="submit" disabled={loading || !code.trim()}>
            {loading ? 'Recherche…' : 'Rechercher'}
          </Button>
        </form>

        {searched && !loading && !suivi && (
          <div className="notice warn" role="alert">
            Aucun lot public ne correspond à ce code. Vérifiez les caractères saisis.
          </div>
        )}

        {suivi && (
          <div className="stack">
            <Section title="Résumé" icon="box">
              <div className="kv"><span>Code</span><strong>{suivi.code}</strong></div>
              <div className="kv"><span>Transport</span><span>{MODE_LABEL[suivi.mode] ?? suivi.mode}</span></div>
              <div className="kv"><span>Destination</span><span>{suivi.destination}</span></div>
              <div className="kv"><span>Statut</span><strong>{EXPEDITION_STATUT_LABEL[suivi.statut] ?? suivi.statut}</strong></div>
            </Section>

            <Section title="Frise du suivi" icon="route">
              {prochaineEtape && (
                <div className="notice info" style={{ marginBottom: 12 }}>
                  <strong>{tr("Prochaine étape")} :</strong>&nbsp;{tr(ETAPE_LABEL[prochaineEtape])}
                </div>
              )}
              <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 0 }}>
                {ETAPES_PUBLIQUES.map((type, index) => {
                  const etape = etapesParType.get(type);
                  const dernierIndex = Math.max(-1, ...suivi.etapes.map((item) => ETAPES_PUBLIQUES.indexOf(item.type)));
                  const actuelle = index === dernierIndex;
                  const franchie = Boolean(etape);
                  return (
                    <li key={type} aria-current={actuelle ? 'step' : undefined} style={{ display: 'flex', gap: 10, minHeight: 52 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span aria-hidden="true" style={{ width: 12, height: 12, borderRadius: '50%', marginTop: 4, background: franchie ? 'var(--accent)' : 'var(--border)', boxShadow: actuelle ? '0 0 0 4px color-mix(in srgb, var(--accent) 20%, transparent)' : undefined }} />
                        {index < ETAPES_PUBLIQUES.length - 1 && <span aria-hidden="true" style={{ width: 2, flex: 1, background: franchie ? 'var(--accent)' : 'var(--border)', opacity: franchie ? 0.65 : 0.45 }} />}
                      </div>
                      <div style={{ paddingBottom: 12 }}>
                        <strong>{tr(ETAPE_LABEL[type])}</strong>
                        <div className="small muted">
                          {etape ? formatDate(etape.au) : actuelle ? tr("En cours") : tr("À venir")}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Section>

            <Section title="Étapes visibles" icon="route">
              {suivi.etapes.length === 0 ? (
                <p className="muted">Aucune étape publique n'a encore été enregistrée.</p>
              ) : (
                <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {suivi.etapes.map((etape, index) => (
                    <li key={`${etape.type}-${etape.au}-${index}`} className="card" style={{ padding: '12px 14px' }}>
                      <strong>{ETAPE_LABEL[etape.type] ?? etape.type}</strong>
                      <div className="muted">{formatDate(etape.au) ?? etape.au}</div>
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {(suivi.partieLe || suivi.arriveeLe || suivi.clotureeLe) && (
              <Section title="Dates clés">
                {suivi.partieLe && <div className="kv"><span>Départ</span><span>{formatDate(suivi.partieLe)}</span></div>}
                {suivi.arriveeLe && <div className="kv"><span>Arrivée</span><span>{formatDate(suivi.arriveeLe)}</span></div>}
                {suivi.clotureeLe && <div className="kv"><span>Clôture</span><span>{formatDate(suivi.clotureeLe)}</span></div>}
              </Section>
            )}
          </div>
        )}
      </main>
    </Screen>
  );
}

export default SuiviPublic;
