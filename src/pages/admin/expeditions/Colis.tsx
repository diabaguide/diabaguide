import { useI18n } from '../../../i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Icon, Select } from '../../../ui';
import { AdminSheet } from '../mobile';
import {
  affecterColis, createColis, creerVoyageurFret, emettreFacture, marquerFacturePayee, rechercherClients, suggestColisCode,
  MODE_LABEL, COLIS_STATUT_LABEL, FACTURE_STATUT_LABEL, caracLabel,
  type ClientLite, type Colis, type Expedition, type Facture,
} from '../../../lib/fret';
import { Link } from 'react-router-dom';
import { TYPES, money, toNum, useBase, type Notifier } from './shared';

/** Colis de l'expédition et leur facture. */
export function ColisSection({ colis, factures, peutFacturer, setErr, setOk, reload }: {
  colis: Colis[]; factures: Record<string, Facture>; peutFacturer: boolean;
} & Notifier) {
  const { tr } = useI18n();
  const base = useBase();
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

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Colis")} ({colis.length})</h2>
      {colis.length === 0 ? <p className="muted">{tr("Aucun colis dans cette expédition. Utilisez le bouton + pour en ajouter un.")}</p> : (
        <div className="table dense"><table>
          <thead><tr><th>{tr("Colis")}</th><th>{tr("Client")}</th><th>{tr("Poids / Volume")}</th><th>{tr("Statut")}</th><th>{tr("Facture")}</th></tr></thead>
          <tbody>
            {colis.map((c) => (
              <tr key={c.code}>
                <td><strong>{c.code}</strong>{c.marqueColis && <div className="small muted">{c.marqueColis}</div>}{c.caracteristiques.length > 0 && <div className="small">{c.caracteristiques.map((v) => tr(caracLabel(v))).join(' · ')}</div>}</td>
                <td>{c.clientNom ?? <span className="np">—</span>}{c.clientTel && <div className="small muted">{c.clientTel}</div>}{c.profileId && <div className="small"><Link className="link" to={`${base}/clients/${c.profileId}/carte`}>{tr("Carte d’expédition")}</Link></div>}</td>
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
                          {peutFacturer && <Button kind="s" full={false} onClick={() => facturer(c.code)}>{tr("Refacturer")}</Button>}
                        </span>
                      </div>
                    ) : peutFacturer ? <Button kind="s" icon="send" full={false} onClick={() => facturer(c.code)}>{tr("Facturer")}</Button>
                      : <span className="small muted">{tr("Pas encore facturé")}</span>;
                  })()}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}

/** Rattacher à l'expédition un colis déjà enregistré mais pas encore affecté. */
export function RattacherSection({ code, libres, setErr, setOk, reload }: { code: string; libres: Colis[] } & Notifier) {
  const { tr } = useI18n();
  const [aff, setAff] = useState('');
  const affecter = async () => {
    if (!aff) return; setErr(null); setOk(null);
    const res = await affecterColis(aff, code);
    if (res.error) { setErr(res.error); return; }
    setOk(`Colis ${aff} rattaché.`); setAff(''); await reload();
  };

  return (
    <section className="card stack" style={{ gap: 12 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Rattacher un colis à cette expédition")}</h2>
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <Select id="aff" label={tr("Colis non affecté")} value={aff} onChange={setAff}
          options={[{ v: '', l: 'Choisir un colis…' }, ...libres.map((c) => ({ v: c.code, l: `${c.code}${c.clientNom ? ` · ${c.clientNom}` : ''}` }))]} />
        <Button icon="link" full={false} disabled={!aff} onClick={affecter}>{tr("Rattacher")}</Button>
      </div>
    </section>
  );
}

/** Nouveau colis reçu à l'entrepôt, rattaché à un compte voyageur (existant ou créé ici). */
export function ColisSheet({ exp, busy, setBusy, onClose, setOk, reload }: {
  exp: Expedition; busy: boolean; setBusy: (busy: boolean) => void; onClose: () => void;
} & Omit<Notifier, 'setErr'>) {
  const { tr } = useI18n();
  const [rc, setRc] = useState({ code: suggestColisCode(), profileId: '', clientNom: '', clientTel: '', codeClient: '', marque: '', type: 'general', poids: '', volume: '' });
  const [rcErr, setRcErr] = useState<string | null>(null);
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
  const ajouterClient = async () => {
    setRcErr(null);
    if (!newClient.name.trim() || !newClient.phone.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newClient.email.trim())) {
      setRcErr('Saisissez le nom, le téléphone et une adresse e-mail valide.'); return;
    }
    setBusy(true);
    const res = await creerVoyageurFret(newClient);
    setBusy(false);
    if (res.error || !res.traveler) { setRcErr(res.error ?? 'Création du compte impossible.'); return; }
    setClientResults((list) => [res.traveler!, ...list.filter((c) => c.id !== res.traveler!.id)]);
    choisirClient(res.traveler);
    setClientQ(res.traveler.name ?? ''); setShowNewClient(false);
    setNewClient({ name: '', email: '', phone: '' });
  };
  const enregistrerColis = async (ev: FormEvent) => {
    ev.preventDefault(); setRcErr(null); setOk(null);
    if (!rc.code.trim()) { setRcErr('Donnez un code au colis.'); return; }
    if (!rc.profileId) { setRcErr('Choisissez un voyageur ou créez son compte avant d’enregistrer le colis.'); return; }
    setBusy(true);
    const res = await createColis({
      code: rc.code, mode: exp.mode, expeditionCode: exp.code, profileId: rc.profileId,
      clientNom: rc.clientNom, clientTel: rc.clientTel, codeClient: rc.codeClient, marqueColis: rc.marque,
      typeMarchandise: rc.type, poidsKg: toNum(rc.poids), volumeM3: toNum(rc.volume), recuMaintenant: true,
    });
    setBusy(false);
    if (res.error) { setRcErr(res.error); return; }
    setOk(`Colis ${rc.code} ajouté à l’expédition.`);
    onClose();
    await reload();
  };

  return (
    <AdminSheet title={tr("Nouveau colis")} sub={`${tr("Expédition")} ${exp.code} · ${tr(MODE_LABEL[exp.mode])}`} onClose={onClose}>
      <form onSubmit={enregistrerColis} className="stack" style={{ gap: 12 }} noValidate>
        {rcErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(rcErr)}</span></div>}
        <Field id="rc-code" label={tr("Code du colis")} value={rc.code} onChange={(v) => setRc({ ...rc, code: v })} req />
        <Field id="rc-search-client" label={tr("Rechercher un voyageur")} type="search" value={clientQ} onChange={setClientQ} placeholder={tr("Nom ou téléphone")} />
        <Select id="rc-client" label={tr("Client / voyageur")} value={rc.profileId} req
          onChange={(id) => {
            const found = clientResults.find((c) => c.id === id);
            if (found) choisirClient(found);
            else { setClientSel(null); setRc((r) => ({ ...r, profileId: '', clientNom: '', clientTel: '' })); }
          }}
          options={[{ v: '', l: clientLoading ? 'Chargement des voyageurs…' : 'Choisir un voyageur…' },
            ...clientResults.map((c) => ({ v: c.id, l: `${c.name ?? 'Sans nom'}${c.phone ? ` · ${c.phone}` : ''}` })),
            ...(clientSel && !clientResults.some((c) => c.id === clientSel.id)
              ? [{ v: clientSel.id, l: `${clientSel.name ?? 'Sans nom'}${clientSel.phone ? ` · ${clientSel.phone}` : ''}` }] : [])]} />
        <Button kind="s" icon="plus" full={false} onClick={() => setShowNewClient((v) => !v)}>{tr(showNewClient ? 'Fermer' : 'Nouveau voyageur')}</Button>
        {showNewClient && (
          <div className="card stack" style={{ gap: 10 }}>
            <p className="small muted" style={{ margin: 0 }}>{tr("Une invitation sera envoyée à son adresse e-mail. Le compte sera sélectionné pour le colis dès sa création.")}</p>
            <Field id="nv-nom" label={tr("Nom complet")} value={newClient.name} onChange={(v) => setNewClient({ ...newClient, name: v })} req />
            <Field id="nv-email" label={tr("Adresse e-mail")} type="email" value={newClient.email} onChange={(v) => setNewClient({ ...newClient, email: v })} req />
            <Field id="nv-phone" label={tr("Téléphone")} type="tel" value={newClient.phone} onChange={(v) => setNewClient({ ...newClient, phone: v })} req />
            <Button icon="plus" full={false} disabled={busy} onClick={() => void ajouterClient()}>{tr(busy ? 'Création…' : 'Créer et sélectionner')}</Button>
          </div>
        )}
        <Field id="rc-marque" label={tr("Marquage")} value={rc.marque} onChange={(v) => setRc({ ...rc, marque: v })} placeholder={tr("Shipping mark")} />
        <Select id="rc-type" label={tr("Type de marchandise")} value={rc.type} onChange={(v) => setRc({ ...rc, type: v })} options={TYPES} />
        <div className="filters">
          <div className="grow"><Field id="rc-poids" label={tr("Poids (kg)")} value={rc.poids} onChange={(v) => setRc({ ...rc, poids: v })} placeholder="0" /></div>
          <div className="grow"><Field id="rc-vol" label={tr("Volume (m³)")} value={rc.volume} onChange={(v) => setRc({ ...rc, volume: v })} placeholder="0" /></div>
        </div>
        <Button type="submit" icon="box" disabled={busy}>{tr(busy ? 'Enregistrement…' : 'Enregistrer le colis')}</Button>
      </form>
    </AdminSheet>
  );
}
