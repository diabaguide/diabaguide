import { useI18n } from '../i18n';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Field, Icon, Logo, Screen, Select, TextArea, TopBar } from '../ui';
import {
  devisFret, annoncerColis, fetchMesColis, fetchEtapesColis, fetchFactures, fetchColisByCode,
  MODE_LABEL, COLIS_STATUT_LABEL, ETAPE_LABEL, FACTURE_STATUT_LABEL,
  type FretMode, type Colis, type EtapeVue, type Facture,
} from '../lib/fret';

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as FretMode[]).map((v) => ({ v, l: MODE_LABEL[v] }));
const TYPES = [
  { v: 'general', l: 'Marchandise générale' }, { v: 'textile', l: 'Textile et confection' },
  { v: 'electronique', l: 'Électronique et téléphones' }, { v: 'batterie', l: 'Batteries et produits à risque' },
  { v: 'cosmetique', l: 'Cosmétiques' }, { v: 'liquide', l: 'Liquides' }, { v: 'alimentaire', l: 'Produits alimentaires' },
];
const toNum = (s: string): number | null => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n; };
const money = (n: number, d = 'XOF') => `${n.toLocaleString('fr-FR')} ${d === 'XOF' ? 'FCFA' : d}`;

export function MesEnvois() {
  const { tr } = useI18n();
  const [colis, setColis] = useState<Colis[]>([]);
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [cs, f] = await Promise.all([fetchMesColis(), fetchFactures()]);
    setColis(cs); setFactures(f); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  // ---- Devis rapide ----
  const [dv, setDv] = useState({ mode: 'maritime_groupage' as FretMode, type: 'general', poids: '', volume: '' });
  const [devis, setDevis] = useState<number | null | 'none'>('none');
  const [calcBusy, setCalcBusy] = useState(false);
  const calcDevis = async (e: FormEvent) => {
    e.preventDefault(); setCalcBusy(true);
    const m = await devisFret(dv.mode, dv.type, toNum(dv.poids), toNum(dv.volume));
    setCalcBusy(false); setDevis(m);
  };

  // ---- Annoncer un colis ----
  const [an, setAn] = useState({ mode: 'maritime_groupage' as FretMode, type: 'general', description: '', marque: '', poids: '', volume: '' });
  const [busy, setBusy] = useState(false);
  const annoncer = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null); setBusy(true);
    const res = await annoncerColis({
      mode: an.mode, typeMarchandise: an.type, description: an.description, marqueColis: an.marque,
      poidsKg: toNum(an.poids), volumeM3: toNum(an.volume),
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Colis annoncé (${res.code}). L’équipe Diaba le confirmera à la réception en Chine.`);
    setAn({ mode: 'maritime_groupage', type: 'general', description: '', marque: '', poids: '', volume: '' });
    await reload();
  };

  return (
    <Screen>
      <TopBar title={tr("Mes envois")} />
      <div className="main" style={{ gap: 16 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        {/* ---- Devis rapide ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Estimer le prix")}</h2>
          <p className="small muted" style={{ margin: 0 }}>{tr("Une estimation indicative. Le prix définitif est confirmé par Diaba après pesée et mesure.")}</p>
          <form onSubmit={calcDevis} className="stack" style={{ gap: 10 }} noValidate>
            <Select id="dv-mode" label={tr("Mode d’envoi")} value={dv.mode} onChange={(v) => setDv({ ...dv, mode: v as FretMode })} options={MODE_OPTIONS} />
            <Select id="dv-type" label={tr("Type de marchandise")} value={dv.type} onChange={(v) => setDv({ ...dv, type: v })} options={TYPES} />
            <div className="row" style={{ gap: 10 }}>
              <div className="grow"><Field id="dv-poids" label={tr("Poids (kg)")} value={dv.poids} onChange={(v) => setDv({ ...dv, poids: v })} placeholder="0" /></div>
              <div className="grow"><Field id="dv-vol" label={tr("Volume (m³)")} value={dv.volume} onChange={(v) => setDv({ ...dv, volume: v })} placeholder="0" /></div>
            </div>
            <Button type="submit" icon="refresh" disabled={calcBusy}>{tr(calcBusy ? 'Calcul…' : 'Estimer')}</Button>
          </form>
          {devis !== 'none' && (
            devis === null
              ? <div className="notice warn"><Icon name="info" size={20} /><span>{tr("Tarif pas encore disponible pour ce choix. Contactez Diaba sur WhatsApp pour un devis.")}</span></div>
              : <div className="card" style={{ background: 'var(--info-bg)', textAlign: 'center', padding: 14 }}>
                  <div className="small muted">{tr("Estimation")}</div>
                  <div style={{ fontSize: 26, fontWeight: 800 }}>{money(devis)}</div>
                </div>
          )}
        </section>

        {/* ---- Annoncer un colis ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Annoncer un colis")}</h2>
          <p className="small muted" style={{ margin: 0 }}>{tr("Prévenez Diaba d’un colis en route vers l’entrepôt en Chine. Vous pourrez ensuite suivre son avancement ici.")}</p>
          <form onSubmit={annoncer} className="stack" style={{ gap: 10 }} noValidate>
            <Select id="an-mode" label={tr("Mode d’envoi")} value={an.mode} onChange={(v) => setAn({ ...an, mode: v as FretMode })} options={MODE_OPTIONS} />
            <Select id="an-type" label={tr("Type de marchandise")} value={an.type} onChange={(v) => setAn({ ...an, type: v })} options={TYPES} />
            <Field id="an-marque" label={tr("Marquage / fournisseur")} value={an.marque} onChange={(v) => setAn({ ...an, marque: v })} placeholder={tr("Nom du fournisseur ou marquage")} />
            <TextArea id="an-desc" label={tr("Description")} value={an.description} onChange={(v) => setAn({ ...an, description: v })} rows={2} placeholder={tr("Ce que contient le colis")} />
            <div className="row" style={{ gap: 10 }}>
              <div className="grow"><Field id="an-poids" label={tr("Poids estimé (kg)")} value={an.poids} onChange={(v) => setAn({ ...an, poids: v })} placeholder="0" /></div>
              <div className="grow"><Field id="an-vol" label={tr("Volume estimé (m³)")} value={an.volume} onChange={(v) => setAn({ ...an, volume: v })} placeholder="0" /></div>
            </div>
            <Button type="submit" icon="box" disabled={busy}>{tr(busy ? 'Envoi…' : 'Annoncer le colis')}</Button>
          </form>
        </section>

        {/* ---- Mes colis ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr(`Mes colis (${colis.length})`)}</h2>
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : colis.length === 0 ? <p className="muted">{tr("Aucun colis pour l’instant. Annoncez votre premier colis ci-dessus.")}</p>
            : colis.map((c) => <ColisCard key={c.code} c={c} facture={factures[c.code]} />)}
        </section>
      </div>
    </Screen>
  );
}

function ColisCard({ c, facture }: { c: Colis; facture?: Facture }) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [etapes, setEtapes] = useState<EtapeVue[] | null>(null);
  const voir = async () => {
    setOpen((v) => !v);
    if (etapes === null) setEtapes(await fetchEtapesColis(c.code));
  };
  return (
    <div className="card stack" style={{ padding: 12, gap: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div className="stack" style={{ gap: 2 }}>
          <strong>{c.code}</strong>
          <span className="small muted">{tr(MODE_LABEL[c.mode])}{c.marqueColis ? ` · ${c.marqueColis}` : ''}</span>
        </div>
        <span className="tag tag-info">{tr(COLIS_STATUT_LABEL[c.statut])}</span>
      </div>
      <div className="small muted">
        {c.poidsKg != null ? `${c.poidsKg} kg` : '—'}{c.volumeM3 != null ? ` · ${c.volumeM3} m³` : ''}
      </div>
      {facture && (
        <div className="card" style={{ background: 'var(--info-bg)', padding: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <div className="stack" style={{ gap: 2 }}>
              <span className="small muted">{tr(facture.statut === 'payee' ? 'Payé' : 'Montant à payer')}</span>
              <span style={{ fontSize: 20, fontWeight: 800 }}>{money(facture.montantTotal, facture.devise)}</span>
            </div>
            <span className={`tag ${facture.statut === 'payee' ? 'tag-ok' : 'tag-warn'}`}>{tr(FACTURE_STATUT_LABEL[facture.statut])}</span>
          </div>
          {(facture.montantStockage > 0 || facture.montantLivraison > 0) && (
            <div className="small muted" style={{ marginTop: 4 }}>
              {tr("Fret")} {money(facture.montantFret, facture.devise)}
              {facture.montantStockage > 0 ? ` · ${tr("stockage")} ${money(facture.montantStockage, facture.devise)}` : ''}
              {facture.montantLivraison > 0 ? ` · ${tr("livraison")} ${money(facture.montantLivraison, facture.devise)}` : ''}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <Button kind="s" icon="download" full={false} to={`/facture/${c.code}`}>{tr("Voir la facture")}</Button>
          </div>
        </div>
      )}
      <Button kind="s" icon="route" full={false} onClick={voir}>{tr(open ? 'Masquer le suivi' : 'Voir le suivi')}</Button>
      {open && (
        etapes === null ? <p className="small muted" role="status">{tr("Chargement…")}</p>
          : etapes.length === 0 ? <p className="small muted">{tr("Pas encore d’étape visible. Vous serez informé dès que le colis avance.")}</p>
          : <ol className="stack" style={{ gap: 6, margin: 0, paddingLeft: 18 }}>
              {etapes.map((e, i) => (
                <li key={i}>
                  <span style={{ fontWeight: 600 }}>{tr(ETAPE_LABEL[e.type])}</span>
                  <span className="small muted"> · {new Date(e.au).toLocaleDateString('fr-FR')}</span>
                </li>
              ))}
            </ol>
      )}
    </div>
  );
}

/* ============================================================
   Facture imprimable (voyageur ou équipe) — /facture/:code
   Impression via le navigateur (« Enregistrer en PDF »).
   ============================================================ */
export function FactureView() {
  const { tr } = useI18n();
  const nav = useNavigate();
  const { code = '' } = useParams();
  const [facture, setFacture] = useState<Facture | null | undefined>(undefined);
  const [colis, setColis] = useState<Colis | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const [fs, c] = await Promise.all([fetchFactures(), fetchColisByCode(code)]);
      if (!live) return;
      setFacture(fs[code] ?? null); setColis(c);
    })();
    return () => { live = false; };
  }, [code]);

  if (facture === undefined) return <div className="center-screen" role="status" style={{ minHeight: '60vh' }}>{tr("Chargement…")}</div>;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: 20 }}>
      <style>{`@media print { .no-print { display: none !important } body { background: #fff } }`}</style>
      <div className="no-print row" style={{ justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        <Button kind="s" icon="chevL" full={false} onClick={() => nav(-1)}>{tr("Retour")}</Button>
        {facture && <Button icon="download" full={false} onClick={() => window.print()}>{tr("Imprimer / PDF")}</Button>}
      </div>

      {!facture ? (
        <div className="card"><p className="muted">{tr("Aucune facture pour ce colis pour l’instant.")}</p></div>
      ) : (
        <div className="card stack" style={{ gap: 16, padding: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
            <Logo height={38} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{tr("Facture")}</div>
              <div className="small muted">{tr("Colis")} {code}</div>
              <div className="small muted">{new Date(facture.emiseLe).toLocaleDateString('fr-FR')}</div>
            </div>
          </div>

          {colis && (
            <div className="small">
              <div><strong>{colis.clientNom ?? tr("Client")}</strong></div>
              {colis.clientTel && <div className="muted">{colis.clientTel}</div>}
              <div className="muted">{tr(MODE_LABEL[colis.mode])}{colis.marqueColis ? ` · ${colis.marqueColis}` : ''}</div>
              <div className="muted">{colis.poidsKg != null ? `${colis.poidsKg} kg` : ''}{colis.volumeM3 != null ? ` · ${colis.volumeM3} m³` : ''}</div>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <Line label={tr("Fret")} value={money(facture.montantFret, facture.devise)} />
              {facture.montantStockage > 0 && <Line label={tr("Stockage")} value={money(facture.montantStockage, facture.devise)} />}
              {facture.montantLivraison > 0 && <Line label={tr("Livraison")} value={money(facture.montantLivraison, facture.devise)} />}
            </tbody>
            <tfoot>
              <tr>
                <td style={{ padding: '10px 0', fontWeight: 800, borderTop: '2px solid var(--chip-border, #ddd)' }}>{tr("Total")}</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, fontSize: 20, borderTop: '2px solid var(--chip-border, #ddd)' }}>{money(facture.montantTotal, facture.devise)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <span className={`tag ${facture.statut === 'payee' ? 'tag-ok' : 'tag-warn'}`}>{tr(FACTURE_STATUT_LABEL[facture.statut])}</span>
            {facture.statut === 'payee' && facture.payeeLe && <span className="small muted">{tr("Payée le")} {new Date(facture.payeeLe).toLocaleDateString('fr-FR')}</span>}
          </div>
          {facture.statut !== 'payee' && <p className="small muted" style={{ margin: 0 }}>{tr("Le règlement se fait auprès de Diaba (espèces, Wave, Orange Money). La marchandise est remise après paiement.")}</p>}
          {facture.note && <p className="small">{facture.note}</p>}
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <tr><td style={{ padding: '6px 0' }}>{label}</td><td style={{ padding: '6px 0', textAlign: 'right' }}>{value}</td></tr>;
}
