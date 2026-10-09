import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button, Field, Screen, Section, TopBar } from '../ui';
import {
  ETAPE_LABEL,
  EXPEDITION_STATUT_LABEL,
  MODE_LABEL,
  fetchSuiviPublic,
  type SuiviPublic,
} from '../lib/fret';

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function SuiviPublic() {
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
