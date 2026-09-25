import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Field, Icon, Select } from '../../ui';
import { SortTh, compare, useSort } from './tableSort';
import {
  fetchExpeditions, fetchExpeditionTotaux, fetchColis, fetchWarehouses,
  createExpedition, createColis, affecterColis, addEtape, creerVoyageurFret,
  suggestExpeditionCode, suggestColisCode,
  fetchFactures, emettreFacture, marquerFacturePayee, rechercherClients,
  MODE_LABEL, MODE_UNITE, EXPEDITION_STATUT_LABEL, COLIS_STATUT_LABEL, ETAPE_LABEL, FACTURE_STATUT_LABEL,
  type Expedition, type ExpeditionTotaux, type Colis, type FretMode, type Warehouse, type EtapeType, type Facture, type ClientLite,
} from '../../lib/fret';

const money = (n: number, d = 'FCFA') => `${n.toLocaleString('fr-FR')} ${d === 'XOF' ? 'FCFA' : d}`;

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as FretMode[]).map((v) => ({ v, l: MODE_LABEL[v] }));
const TYPES = [
  { v: 'general', l: 'Marchandise générale' }, { v: 'textile', l: 'Textile et confection' },
  { v: 'electronique', l: 'Électronique et téléphones' }, { v: 'batterie', l: 'Batteries et produits à risque' },
  { v: 'cosmetique', l: 'Cosmétiques' }, { v: 'liquide', l: 'Liquides' }, { v: 'alimentaire', l: 'Produits alimentaires' },
];
const toNum = (s: string): number | null => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n; };

/* ============================================================
   Liste des expéditions + réception d'un colis (le dispatching)
   ============================================================ */
export function ExpeditionsList() {
  const { tr } = useI18n();
  const [exps, setExps] = useState<Expedition[]>([]);
  const [totaux, setTotaux] = useState<Record<string, ExpeditionTotaux>>({});
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [e, t, w] = await Promise.all([fetchExpeditions(), fetchExpeditionTotaux(), fetchWarehouses()]);
    setExps(e); setTotaux(t); setWarehouses(w); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const openExps = exps.filter((e) => e.statut === 'ouverte');

  // ---- Réception d'un colis ----
  const [rc, setRc] = useState({
    code: suggestColisCode(), mode: 'maritime_groupage' as FretMode, expeditionCode: '', profileId: '',
    clientNom: '', clientTel: '', codeClient: '', marque: '', type: 'general', poids: '', volume: '',
  });
  const [clientQ, setClientQ] = useState('');
  const [clientResults, setClientResults] = useState<ClientLite[]>([]);
  const [clientSel, setClientSel] = useState<ClientLite | null>(null);
  const [clientLoading, setClientLoading] = useState(true);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });
  useEffect(() => {
    let alive = true;
    setClientLoading(true);
    const timer = window.setTimeout(() => {
      rechercherClients(clientQ.trim()).then((list) => {
        if (alive) { setClientResults(list); setClientLoading(false); }
      });
    }, clientQ ? 250 : 0);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [clientQ]);
  const choisirClient = (c: ClientLite) => {
    setClientSel(c);
    setRc((r) => ({ ...r, profileId: c.id, clientNom: c.name ?? '', clientTel: c.phone ?? '' }));
  };
  const ajouterClient = async (ev: FormEvent) => {
    ev.preventDefault(); setErr(null); setOk(null);
    if (!newClient.name.trim() || !newClient.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClient.email.trim())) {
      setErr('Saisissez le nom, le téléphone et une adresse e-mail valide.'); return;
    }
    setBusy(true);
    const res = await creerVoyageurFret(newClient);
    setBusy(false);
    if (res.error || !res.traveler) { setErr(res.error ?? 'Création du compte impossible.'); return; }
    setClientResults((list) => [res.traveler!, ...list.filter((c) => c.id !== res.traveler!.id)]);
    choisirClient(res.traveler);
    setClientQ(res.traveler.name ?? ''); setShowNewClient(false);
    setNewClient({ name: '', email: '', phone: '' });
    setOk(`Compte voyageur créé pour ${res.traveler.name}. Une invitation a été envoyée par e-mail.`);
  };

  const [busy, setBusy] = useState(false);
  const recevoir = async (ev: FormEvent) => {
    ev.preventDefault(); setErr(null); setOk(null);
    if (!rc.code.trim()) { setErr('Donnez un code au colis.'); return; }
    if (!rc.profileId) { setErr('Choisissez un voyageur ou créez son compte avant d’enregistrer le colis.'); return; }
    setBusy(true);
    const res = await createColis({
      code: rc.code, mode: rc.mode, expeditionCode: rc.expeditionCode || null, profileId: rc.profileId,
      clientNom: rc.clientNom, clientTel: rc.clientTel, codeClient: rc.codeClient, marqueColis: rc.marque,
      typeMarchandise: rc.type, poidsKg: toNum(rc.poids), volumeM3: toNum(rc.volume), recuMaintenant: true,
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Colis ${rc.code} enregistré.`);
    setRc((c) => ({ ...c, code: suggestColisCode(), profileId: '', clientNom: '', clientTel: '', codeClient: '', marque: '', poids: '', volume: '' }));
    setClientSel(null);
    await reload();
  };

  // ---- Nouvelle expédition ----
  const [showNew, setShowNew] = useState(false);
  const [ne, setNe] = useState({ code: suggestExpeditionCode(), mode: 'maritime_groupage' as FretMode, warehouseId: '', seuilKg: '', seuilM3: '' });
  const creerExp = async (ev: FormEvent) => {
    ev.preventDefault(); setErr(null); setOk(null);
    setBusy(true);
    const res = await createExpedition({
      code: ne.code, mode: ne.mode, warehouseId: ne.warehouseId || null,
      seuilKg: toNum(ne.seuilKg), seuilM3: toNum(ne.seuilM3),
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Expédition ${ne.code} créée.`);
    setNe({ code: suggestExpeditionCode(), mode: 'maritime_groupage', warehouseId: '', seuilKg: '', seuilM3: '' });
    setShowNew(false);
    await reload();
  };

  const { sort, toggle } = useSort<'code' | 'statut'>({ k: 'code', dir: -1 });
  const shown = [...exps].sort((a, b) =>
    compare(sort.k === 'statut' ? a.statut : a.code, sort.k === 'statut' ? b.statut : b.code, sort.dir));

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Expéditions")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr("Suivez chaque conteneur ou vol, et rattachez les colis de vos clients.")}</div>
        </div>
        <Button icon="plus" full={false} onClick={() => setShowNew((v) => !v)}>{tr(showNew ? 'Fermer' : 'Nouvelle expédition')}</Button>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        {showNewClient && (
          <section className="card stack" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Créer un compte voyageur")}</h2>
            <p className="small muted" style={{ margin: 0 }}>{tr("Une invitation sera envoyée à son adresse e-mail. Le compte sera sélectionné pour le colis dès sa création.")}</p>
            <form onSubmit={ajouterClient} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
              <div className="grow"><Field id="nv-nom" label={tr("Nom complet")} value={newClient.name} onChange={(v) => setNewClient({ ...newClient, name: v })} req /></div>
              <div className="grow"><Field id="nv-email" label={tr("Adresse e-mail")} type="email" value={newClient.email} onChange={(v) => setNewClient({ ...newClient, email: v })} req /></div>
              <div className="grow"><Field id="nv-phone" label={tr("Téléphone")} type="tel" value={newClient.phone} onChange={(v) => setNewClient({ ...newClient, phone: v })} req /></div>
              <Button type="submit" icon="plus" full={false} disabled={busy}>{tr(busy ? 'Création…' : 'Créer et sélectionner')}</Button>
            </form>
          </section>
        )}

        {/* ---- Réception d'un colis ---- */}
        <section className="card stack" style={{ gap: 14 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Enregistrer un colis reçu")}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("À l’arrivée d’un colis à l’entrepôt en Chine : notez le client, le marquage, le poids et le volume. Vous pourrez le rattacher à une expédition tout de suite ou plus tard.")}</p>
          <form onSubmit={recevoir} className="stack" style={{ gap: 12 }} noValidate>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <div style={{ minWidth: 170 }}><Field id="rc-code" label={tr("Code du colis")} value={rc.code} onChange={(v) => setRc({ ...rc, code: v })} req /></div>
              <Select id="rc-mode" label={tr("Mode")} value={rc.mode} onChange={(v) => setRc({ ...rc, mode: v as FretMode })} options={MODE_OPTIONS} />
              <Select id="rc-exp" label={tr("Expédition")} value={rc.expeditionCode}
                onChange={(v) => setRc({ ...rc, expeditionCode: v })}
                options={[{ v: '', l: 'Non affecté pour l’instant' }, ...openExps.map((e) => ({ v: e.code, l: `${e.code} · ${MODE_LABEL[e.mode]}` }))]} />
            </div>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <div className="grow" style={{ minWidth: 240 }}>
                <Field id="rc-search-client" label={tr("Rechercher un voyageur")} type="search" value={clientQ} onChange={setClientQ} placeholder={tr("Nom ou téléphone")} />
              </div>
              <div className="grow" style={{ minWidth: 280 }}>
                <Select id="rc-client" label={tr("Client / voyageur")} value={rc.profileId}
                  onChange={(id) => {
                    const found = clientResults.find((c) => c.id === id);
                    if (found) choisirClient(found);
                    else { setClientSel(null); setRc((r) => ({ ...r, profileId: '', clientNom: '', clientTel: '' })); }
                  }} req
                  options={[{ v: '', l: clientLoading ? 'Chargement des voyageurs…' : 'Choisir un voyageur…' },
                    ...clientResults.map((c) => ({ v: c.id, l: `${c.name ?? 'Sans nom'}${c.phone ? ` · ${c.phone}` : ''}` })),
                    ...(clientSel && !clientResults.some((c) => c.id === clientSel.id)
                      ? [{ v: clientSel.id, l: `${clientSel.name ?? 'Sans nom'}${clientSel.phone ? ` · ${clientSel.phone}` : ''}` }] : [])]} />
              </div>
              <Button kind="s" icon="plus" full={false} onClick={() => setShowNewClient((v) => !v)}>{tr(showNewClient ? 'Fermer' : 'Nouveau voyageur')}</Button>
            </div>
            {clientSel && <div className="small muted">{tr("Compte sélectionné : ")}{clientSel.name}</div>}
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <div style={{ minWidth: 130 }}><Field id="rc-marque" label={tr("Marquage")} value={rc.marque} onChange={(v) => setRc({ ...rc, marque: v })} placeholder={tr("Shipping mark")} /></div>
            </div>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <Select id="rc-type" label={tr("Type de marchandise")} value={rc.type} onChange={(v) => setRc({ ...rc, type: v })} options={TYPES} />
              <div style={{ minWidth: 120 }}><Field id="rc-poids" label={tr("Poids (kg)")} value={rc.poids} onChange={(v) => setRc({ ...rc, poids: v })} placeholder="0" /></div>
              <div style={{ minWidth: 120 }}><Field id="rc-vol" label={tr("Volume (m³)")} value={rc.volume} onChange={(v) => setRc({ ...rc, volume: v })} placeholder="0" /></div>
              <Button type="submit" icon="box" full={false} disabled={busy}>{tr(busy ? 'Enregistrement…' : 'Enregistrer le colis')}</Button>
            </div>
          </form>
        </section>

        {/* ---- Nouvelle expédition ---- */}
        {showNew && (
          <section className="card stack" style={{ gap: 12 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Nouvelle expédition")}</h2>
            <form onSubmit={creerExp} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
              <div style={{ minWidth: 160 }}><Field id="ne-code" label={tr("Code de lot")} value={ne.code} onChange={(v) => setNe({ ...ne, code: v })} req /></div>
              <Select id="ne-mode" label={tr("Mode")} value={ne.mode} onChange={(v) => setNe({ ...ne, mode: v as FretMode })} options={MODE_OPTIONS} />
              <Select id="ne-wh" label={tr("Entrepôt (Chine)")} value={ne.warehouseId} onChange={(v) => setNe({ ...ne, warehouseId: v })}
                options={[{ v: '', l: '—' }, ...warehouses.map((w) => ({ v: w.id, l: w.nom }))]} />
              <div style={{ minWidth: 120 }}><Field id="ne-skg" label={tr("Seuil kg")} value={ne.seuilKg} onChange={(v) => setNe({ ...ne, seuilKg: v })} placeholder={tr("facultatif")} /></div>
              <div style={{ minWidth: 120 }}><Field id="ne-sm3" label={tr("Seuil m³")} value={ne.seuilM3} onChange={(v) => setNe({ ...ne, seuilM3: v })} placeholder={tr("facultatif")} /></div>
              <Button type="submit" icon="ship" full={false} disabled={busy}>{tr("Créer")}</Button>
            </form>
          </section>
        )}

        {/* ---- Liste des expéditions ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr(`Expéditions (${exps.length})`)}</h2>
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : exps.length === 0 ? <p className="muted">{tr("Aucune expédition. Créez-en une pour commencer à regrouper les colis.")}</p> : (
            <div className="table dense"><table>
              <thead><tr>
                <SortTh k="code" label="Code" sort={sort} onSort={toggle} />
                <th>{tr("Mode")}</th><SortTh k="statut" label="Statut" sort={sort} onSort={toggle} />
                <th>{tr("Colis")}</th><th>{tr("Remplissage")}</th>
              </tr></thead>
              <tbody>
                {shown.map((e) => {
                  const t = totaux[e.code];
                  return (
                    <tr key={e.code}>
                      <td><Link to={`/equipe/expeditions/${encodeURIComponent(e.code)}`}><strong>{e.code}</strong></Link><div className="small muted">{e.destination}</div></td>
                      <td>{tr(MODE_LABEL[e.mode])}</td>
                      <td><span className="small">{tr(EXPEDITION_STATUT_LABEL[e.statut])}</span></td>
                      <td>{t?.nbColis ?? 0}</td>
                      <td><Remplissage exp={e} tot={t} /></td>
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

/** Barre de remplissage : total atteint face au seuil, sur l'unité du mode. */
function Remplissage({ exp, tot }: { exp: Expedition; tot?: ExpeditionTotaux }) {
  const { tr } = useI18n();
  if (!tot) return <span className="np">—</span>;
  const unite = MODE_UNITE[exp.mode];
  const total = unite === 'm3' ? tot.totalM3 : tot.totalKg;
  const seuil = unite === 'm3' ? exp.seuilM3 : exp.seuilKg;
  const u = unite === 'm3' ? 'm³' : 'kg';
  if (!seuil) return <span className="small">{total.toLocaleString('fr-FR')} {u}</span>;
  const pct = Math.min(100, Math.round((total / seuil) * 100));
  const plein = pct >= 100;
  return (
    <div className="stack" style={{ gap: 4, minWidth: 140 }}>
      <div className="small" style={{ fontWeight: 600 }}>{total.toLocaleString('fr-FR')} / {seuil.toLocaleString('fr-FR')} {u} · {pct}%</div>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--chip-border, #e3e3e3)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: plein ? '#1F7A4A' : '#1F4A7A' }} />
      </div>
      {plein && <span className="small" style={{ color: '#1F7A4A', fontWeight: 600 }}><Icon name="check" size={13} sw={2.4} /> {tr("Prêt à charger")}</span>}
    </div>
  );
}

/* ============================================================
   Détail d'une expédition : totaux, colis, étapes
   ============================================================ */
const ETAPES_ORDRE: EtapeType[] = ['recu_chine', 'regroupe', 'depart', 'en_transit', 'arrive_dakar', 'chez_diaba', 'dispo_retrait', 'en_livraison', 'remis'];

export function ExpeditionDetail() {
  const { tr } = useI18n();
  const { code = '' } = useParams();
  const [exp, setExp] = useState<Expedition | null>(null);
  const [tot, setTot] = useState<ExpeditionTotaux | undefined>();
  const [colis, setColis] = useState<Colis[]>([]);
  const [libres, setLibres] = useState<Colis[]>([]);
  const [factures, setFactures] = useState<Record<string, Facture>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [exps, totaux, cs, l, f] = await Promise.all([fetchExpeditions(), fetchExpeditionTotaux(), fetchColis(code), fetchColis(), fetchFactures()]);
    setExp(exps.find((e) => e.code === code) ?? null);
    setTot(totaux[code]); setColis(cs); setLibres(l); setFactures(f); setLoading(false);
  }, [code]);

  const facturer = async (colisCode: string) => {
    setErr(null); setOk(null);
    const res = await emettreFacture(colisCode);
    if (res.error) { setErr(res.error); return; }
    setOk(`Facture émise pour ${colisCode}.`); await reload();
  };
  const payer = async (colisCode: string) => {
    setErr(null); setOk(null);
    const res = await marquerFacturePayee(colisCode);
    if (res.error) { setErr(res.error); return; }
    setOk(`Facture de ${colisCode} marquée payée.`); await reload();
  };
  useEffect(() => { void reload(); }, [reload]);

  const [aff, setAff] = useState('');
  const affecter = async () => {
    if (!aff) return; setErr(null); setOk(null);
    const res = await affecterColis(aff, code);
    if (res.error) { setErr(res.error); return; }
    setOk(`Colis ${aff} rattaché.`); setAff(''); await reload();
  };
  const etape = async (colisCode: string, type: EtapeType) => {
    setErr(null); setOk(null);
    const res = await addEtape(colisCode, type);
    if (res.error) { setErr(res.error); return; }
    setOk(`Étape « ${tr(ETAPE_LABEL[type])} » ajoutée à ${colisCode}.`); await reload();
  };

  if (loading) return <div className="admin-body"><p className="muted" role="status">{tr("Chargement…")}</p></div>;
  if (!exp) return <div className="admin-body"><p className="muted">{tr("Expédition introuvable.")} <Link to="/equipe/expeditions">{tr("Retour à la liste")}</Link></p></div>;

  const unite = MODE_UNITE[exp.mode];

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{exp.code}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr(MODE_LABEL[exp.mode])} · {exp.destination} · {tr(EXPEDITION_STATUT_LABEL[exp.statut])}</div>
        </div>
        <Button to="/equipe/expeditions" kind="s" icon="chevL" full={false}>{tr("Toutes les expéditions")}</Button>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        <section className="card stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Remplissage")}</h2>
          <div className="row" style={{ gap: 24, flexWrap: 'wrap' }}>
            <Stat label={tr("Colis")} value={String(tot?.nbColis ?? 0)} />
            <Stat label={tr("Total poids")} value={`${(tot?.totalKg ?? 0).toLocaleString('fr-FR')} kg`} />
            <Stat label={tr("Total volume")} value={`${(tot?.totalM3 ?? 0).toLocaleString('fr-FR')} m³`} />
          </div>
          <Remplissage exp={exp} tot={tot} />
          {!exp.seuilKg && !exp.seuilM3 && <p className="small muted" style={{ margin: 0 }}>{tr("Aucun seuil défini pour cette expédition. Le remplissage s’affiche sans objectif de chargement.")}</p>}
          <p className="small muted" style={{ margin: 0 }}>{tr(`Unité de facturation de ce mode : ${unite === 'm3' ? 'm³' : 'kg'}.`)}</p>
        </section>

        {/* ---- Colis de l'expédition ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr(`Colis (${colis.length})`)}</h2>
          {colis.length === 0 ? <p className="muted">{tr("Aucun colis rattaché pour l’instant.")}</p> : (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Colis")}</th><th>{tr("Client")}</th><th>{tr("Poids / Volume")}</th><th>{tr("Statut")}</th><th>{tr("Facture")}</th><th>{tr("Étape")}</th></tr></thead>
              <tbody>
                {colis.map((c) => (
                  <tr key={c.code}>
                    <td><strong>{c.code}</strong>{c.marqueColis && <div className="small muted">{c.marqueColis}</div>}</td>
                    <td>{c.clientNom ?? <span className="np">—</span>}{c.clientTel && <div className="small muted">{c.clientTel}</div>}</td>
                    <td className="small">{c.poidsKg != null ? `${c.poidsKg} kg` : '—'}{c.volumeM3 != null ? ` · ${c.volumeM3} m³` : ''}</td>
                    <td><span className="small">{tr(COLIS_STATUT_LABEL[c.statut])}</span></td>
                    <td>
                      {(() => {
                        const f = factures[c.code];
                        return f ? (
                          <div className="stack" style={{ gap: 4, minWidth: 150 }}>
                            <span className="small"><strong>{money(f.montantTotal, f.devise)}</strong> · {tr(FACTURE_STATUT_LABEL[f.statut])}</span>
                            <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                              {f.statut === 'a_payer' && <Button kind="s" full={false} onClick={() => payer(c.code)}>{tr("Marquer payé")}</Button>}
                              <Button kind="s" full={false} onClick={() => facturer(c.code)}>{tr("Refacturer")}</Button>
                            </span>
                          </div>
                        ) : <Button kind="s" icon="send" full={false} onClick={() => facturer(c.code)}>{tr("Facturer")}</Button>;
                      })()}
                    </td>
                    <td>
                      <select aria-label={tr("Ajouter une étape")} defaultValue="" onChange={(e) => { if (e.target.value) { void etape(c.code, e.target.value as EtapeType); e.target.value = ''; } }}>
                        <option value="">{tr("Ajouter une étape…")}</option>
                        {ETAPES_ORDRE.map((s) => <option key={s} value={s}>{tr(ETAPE_LABEL[s])}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        {/* ---- Rattacher un colis existant ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Rattacher un colis à cette expédition")}</h2>
          {libres.length === 0 ? <p className="small muted" style={{ margin: 0 }}>{tr("Aucun colis en attente d’affectation.")}</p> : (
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <Select id="aff" label={tr("Colis non affecté")} value={aff} onChange={setAff}
                options={[{ v: '', l: 'Choisir un colis…' }, ...libres.map((c) => ({ v: c.code, l: `${c.code}${c.clientNom ? ` · ${c.clientNom}` : ''}` }))]} />
              <Button icon="link" full={false} disabled={!aff} onClick={affecter}>{tr("Rattacher")}</Button>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stack" style={{ gap: 2 }}>
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
