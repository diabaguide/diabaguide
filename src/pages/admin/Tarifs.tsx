import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button, Field, Icon, Select } from '../../ui';
import {
  fetchAllWarehouses, saveWarehouse, setWarehouseActif,
  fetchTarifs, trierTarifs, createTarif, deleteTarif,
  fetchAnnexes, createAnnexe, deleteAnnexe, fetchTypesMarchandise,
  MODE_LABEL, MODE_UNITE,
  type WarehouseFull, type TarifFret, type TarifAnnexe, type TypeMarchandise, type FretMode,
} from '../../lib/fret';

const MODE_OPTIONS = (Object.keys(MODE_LABEL) as FretMode[]).map((v) => ({ v, l: MODE_LABEL[v] }));
const UNITE_OPTIONS = [{ v: 'kg', l: 'au kilo (kg)' }, { v: 'm3', l: 'au m³' }, { v: 'colis', l: 'au colis' }, { v: 'conteneur', l: 'au conteneur' }];
const DEVISES = [{ v: 'XOF', l: 'FCFA (XOF)' }, { v: 'USD', l: 'Dollar (USD)' }, { v: 'RMB', l: 'Yuan (RMB)' }, { v: 'EUR', l: 'Euro (EUR)' }];
const USAGES = [{ v: 'fret_express', l: 'Fret / express' }, { v: 'cargo', l: 'Cargo (maritime)' }];
const toNum = (s: string): number | null => { const n = parseFloat(s.replace(',', '.')); return isNaN(n) ? null : n; };

export function Tarifs() {
  const { tr } = useI18n();
  const [warehouses, setWarehouses] = useState<WarehouseFull[]>([]);
  const [tarifs, setTarifs] = useState<TarifFret[]>([]);
  const [annexes, setAnnexes] = useState<TarifAnnexe[]>([]);
  const [types, setTypes] = useState<TypeMarchandise[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const flash = (setter: (v: string | null) => void, v: string) => { setter(v); };

  const reload = useCallback(async () => {
    const [w, t, a, ty] = await Promise.all([fetchAllWarehouses(), fetchTarifs(), fetchAnnexes(), fetchTypesMarchandise()]);
    setWarehouses(w); setTarifs(t); setAnnexes(a); setTypes(ty); setLoading(false);
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  const typeLabel = (code: string) => types.find((t) => t.code === code)?.libelle ?? code;
  const typeOptions = types.length ? types.map((t) => ({ v: t.code, l: t.libelle })) : [{ v: 'general', l: 'Marchandise générale' }];

  // ---- Entrepôt ----
  const WF_VIDE = { id: '', nom: '', usage: 'fret_express', ville: '', addrFr: '', addrCn: '', tel: '', bureauNom: '', bureauTel: '', actif: true, edition: false };
  const [wf, setWf] = useState(WF_VIDE);
  // Champs de contact : proposés tant que le script 500 n'a pas été signalé comme absent.
  const contactsOk = warehouses.length === 0 || warehouses[0].contactsInstalles;
  const [busy, setBusy] = useState(false);
  const addWarehouse = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null);
    if (!wf.id.trim() || !wf.nom.trim()) { setErr('Donnez un identifiant et un nom à l’entrepôt.'); return; }
    setBusy(true);
    const res = await saveWarehouse({
      id: wf.id, nom: wf.nom, usage: wf.usage as 'fret_express' | 'cargo', ville: wf.ville, addrFr: wf.addrFr, addrCn: wf.addrCn,
      actif: wf.actif, contacts: contactsOk ? { tel: wf.tel, bureauNom: wf.bureauNom, bureauTel: wf.bureauTel } : undefined,
    });
    setBusy(false);
    if (res.error) { setErr(res.error); await reload(); return; }
    flash(setOk, `Entrepôt « ${wf.nom} » enregistré.`);
    setWf(WF_VIDE);
    await reload();
  };
  const modifierWh = (w: WarehouseFull) => {
    setErr(null); setOk(null);
    setWf({ id: w.id, nom: w.nom, usage: w.usage, ville: w.ville ?? '', addrFr: w.addrFr ?? '', addrCn: w.addrCn ?? '', tel: w.tel ?? '', bureauNom: w.bureauNom ?? '', bureauTel: w.bureauTel ?? '', actif: w.actif, edition: true });
    document.getElementById('wf-nom')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const toggleWh = async (id: string, actif: boolean) => { setErr(null); setOk(null); const r = await setWarehouseActif(id, actif); if (r.error) setErr(r.error); else await reload(); };

  // ---- Tarif ----
  const [tf, setTf] = useState({ mode: 'maritime_groupage' as FretMode, type: 'general', unite: 'm3', prix: '', devise: 'XOF' });
  const addTarif = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null);
    const prix = toNum(tf.prix);
    if (prix === null || prix <= 0) { setErr('Saisissez un prix valide.'); return; }
    setBusy(true);
    const res = await createTarif({ mode: tf.mode, typeMarchandise: tf.type, unite: tf.unite as TarifFret['unite'], prix, devise: tf.devise });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    flash(setOk, 'Tarif ajouté.'); setTf({ ...tf, prix: '' }); await reload();
  };
  const rmTarif = async (id: string) => { setErr(null); setOk(null); const r = await deleteTarif(id); if (r.error) setErr(r.error); else await reload(); };

  // ---- Frais annexe ----
  const [af, setAf] = useState({ categorie: 'stockage', libelle: '', prix: '', devise: 'XOF', jours: '', zone: '' });
  const addAnnexe = async (e: FormEvent) => {
    e.preventDefault(); setErr(null); setOk(null);
    const prix = toNum(af.prix);
    if (!af.libelle.trim() || prix === null) { setErr('Donnez un libellé et un prix.'); return; }
    setBusy(true);
    const res = await createAnnexe({ categorie: af.categorie as TarifAnnexe['categorie'], libelle: af.libelle, prix, devise: af.devise, joursGratuits: toNum(af.jours), zone: af.zone });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    flash(setOk, 'Frais ajouté.'); setAf({ ...af, libelle: '', prix: '', jours: '', zone: '' }); await reload();
  };
  const rmAnnexe = async (id: string) => { setErr(null); setOk(null); const r = await deleteAnnexe(id); if (r.error) setErr(r.error); else await reload(); };

  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Tarifs et entrepôts")}</h1>
          <div className="muted" style={{ marginTop: 4 }}>{tr("Réglez ici les prix du fret, les frais de stockage et de livraison, et les adresses d’entrepôt en Chine.")}</div>
        </div>
      </header>

      <div className="admin-body" style={{ gap: 18 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        {/* ---- Entrepôts ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Entrepôts en Chine")}</h2>
          <form onSubmit={addWarehouse} className="stack" style={{ gap: 10 }} noValidate>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <div style={{ minWidth: 130 }}><Field id="wf-id" label={tr("Identifiant")} value={wf.id} onChange={(v) => setWf({ ...wf, id: v })} placeholder="gz_fret" disabled={wf.edition} /></div>
              <div className="grow"><Field id="wf-nom" label={tr("Nom")} value={wf.nom} onChange={(v) => setWf({ ...wf, nom: v })} placeholder={tr("Entrepôt Guangzhou — fret")} /></div>
              <Select id="wf-usage" label={tr("Usage")} value={wf.usage} onChange={(v) => setWf({ ...wf, usage: v })} options={USAGES} />
            </div>
            <div className="filters" style={{ alignItems: 'flex-end' }}>
              <div style={{ minWidth: 130 }}><Field id="wf-ville" label={tr("Ville")} value={wf.ville} onChange={(v) => setWf({ ...wf, ville: v })} placeholder="Guangzhou" /></div>
              <div className="grow"><Field id="wf-adr" label={tr("Adresse (français)")} value={wf.addrFr} onChange={(v) => setWf({ ...wf, addrFr: v })} /></div>
              <div className="grow"><Field id="wf-adrcn" label={tr("Adresse (chinois)")} value={wf.addrCn} onChange={(v) => setWf({ ...wf, addrCn: v })} /></div>
              <Button type="submit" icon={wf.edition ? "check" : "plus"} full={false} disabled={busy}>{tr("Enregistrer")}</Button>
              {wf.edition && <Button type="button" kind="s" full={false} onClick={() => setWf(WF_VIDE)}>{tr("Annuler")}</Button>}
            </div>
            {contactsOk ? (
              <div className="filters" style={{ alignItems: 'flex-end' }}>
                <div className="grow"><Field id="wf-tel" label={tr("Téléphone de l’entrepôt")} value={wf.tel} onChange={(v) => setWf({ ...wf, tel: v })} placeholder="18029362363" hint={tr("Imprimé sur la carte d’expédition, sous « Warehouse phone ».")} /></div>
                <div className="grow"><Field id="wf-bnom" label={tr("Contact du bureau")} value={wf.bureauNom} onChange={(v) => setWf({ ...wf, bureauNom: v })} placeholder="Arkim" /></div>
                <div className="grow"><Field id="wf-btel" label={tr("Téléphone du bureau")} value={wf.bureauTel} onChange={(v) => setWf({ ...wf, bureauTel: v })} placeholder="15711885660" /></div>
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>{tr("Pour saisir les téléphones de l’entrepôt (carte d’expédition), lancez d’abord supabase/500_carte_expedition.sql dans Supabase.")}</p>
            )}
            <p className="small muted" style={{ margin: 0 }}>{tr("La carte d’expédition utilise le premier entrepôt actif dont le téléphone est renseigné. Son adresse et ses horaires sont imprimés dans le modèle de la carte.")}</p>
          </form>
          {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
            : warehouses.length === 0 ? <p className="small muted">{tr("Aucun entrepôt. Ajoutez vos adresses (une pour le fret/express, une pour le cargo).")}</p> : (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Nom")}</th><th>{tr("Usage")}</th><th>{tr("Ville")}</th><th>{tr("Téléphones")}</th><th>{tr("État")}</th><th /></tr></thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} style={{ opacity: w.actif ? 1 : 0.55 }}>
                    <td><strong>{w.nom}</strong><div className="small muted">{w.id}</div></td>
                    <td className="small">{tr(w.usage === 'cargo' ? 'Cargo' : 'Fret / express')}</td>
                    <td className="small">{w.ville ?? '—'}</td>
                    <td className="small">{w.contactsInstalles ? <>{w.tel ?? '—'}{(w.bureauNom || w.bureauTel) && <div className="muted">{[w.bureauNom, w.bureauTel].filter(Boolean).join(' ')}</div>}</> : '—'}</td>
                    <td className="small">{tr(w.actif ? 'Actif' : 'Inactif')}</td>
                    <td><span className="row" style={{ gap: 6, flexWrap: 'wrap' }}><Button kind="s" icon="edit" full={false} onClick={() => modifierWh(w)}>{tr("Modifier")}</Button><Button kind="s" full={false} onClick={() => toggleWh(w.id, !w.actif)}>{tr(w.actif ? 'Désactiver' : 'Réactiver')}</Button></span></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        {/* ---- Grille de tarifs ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Grille de tarifs")}</h2>
          <p className="small muted" style={{ margin: 0 }}>{tr("Un tarif par mode et type de marchandise. Le calculateur utilise le type précis, sinon « Marchandise générale ».")}</p>
          <form onSubmit={addTarif} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <Select id="tf-mode" label={tr("Mode")} value={tf.mode} onChange={(v) => setTf({ ...tf, mode: v as FretMode, unite: MODE_UNITE[v as FretMode] })} options={MODE_OPTIONS} />
            <Select id="tf-type" label={tr("Type")} value={tf.type} onChange={(v) => setTf({ ...tf, type: v })} options={typeOptions} />
            <Select id="tf-unite" label={tr("Unité")} value={tf.unite} onChange={(v) => setTf({ ...tf, unite: v })} options={UNITE_OPTIONS} />
            <div style={{ minWidth: 130 }}><Field id="tf-prix" label={tr("Prix unitaire")} value={tf.prix} onChange={(v) => setTf({ ...tf, prix: v })} placeholder="0" /></div>
            <Select id="tf-dev" label={tr("Devise")} value={tf.devise} onChange={(v) => setTf({ ...tf, devise: v })} options={DEVISES} />
            <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
          </form>
          {tarifs.length === 0 ? <p className="small muted">{tr("Aucun tarif saisi. Le calculateur restera indisponible tant qu’aucun prix n’est défini.")}</p> : (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Mode")}</th><th>{tr("Type")}</th><th>{tr("Prix")}</th><th /></tr></thead>
              <tbody>
                {trierTarifs(tarifs, types).map((t) => (
                  <tr key={t.id} style={{ opacity: t.actif ? 1 : 0.55 }}>
                    <td className="small">{tr(MODE_LABEL[t.mode])}</td>
                    <td className="small">{tr(typeLabel(t.typeMarchandise))}</td>
                    <td><strong>{t.prix.toLocaleString('fr-FR')} {t.devise}</strong> <span className="small muted">{tr(t.unite === 'm3' ? '/ m³' : t.unite === 'kg' ? '/ kg' : t.unite === 'colis' ? '/ colis' : '/ conteneur')}</span></td>
                    <td><Button kind="s" icon="trash" full={false} onClick={() => rmTarif(t.id)}>{tr("Supprimer")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>

        {/* ---- Frais annexes ---- */}
        <section className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Frais annexes")}</h2>
          <p className="small muted" style={{ margin: 0 }}>{tr("Stockage (par jour après les jours gratuits) et livraison (par zone).")}</p>
          <form onSubmit={addAnnexe} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <Select id="af-cat" label={tr("Catégorie")} value={af.categorie} onChange={(v) => setAf({ ...af, categorie: v })}
              options={[{ v: 'stockage', l: 'Stockage' }, { v: 'livraison', l: 'Livraison' }, { v: 'autre', l: 'Autre' }]} />
            <div className="grow"><Field id="af-lib" label={tr("Libellé")} value={af.libelle} onChange={(v) => setAf({ ...af, libelle: v })} placeholder={tr("Stockage Dakar")} /></div>
            <div style={{ minWidth: 110 }}><Field id="af-prix" label={tr("Prix")} value={af.prix} onChange={(v) => setAf({ ...af, prix: v })} placeholder="0" /></div>
            <Select id="af-dev" label={tr("Devise")} value={af.devise} onChange={(v) => setAf({ ...af, devise: v })} options={DEVISES} />
            {af.categorie === 'stockage'
              ? <div style={{ minWidth: 120 }}><Field id="af-jours" label={tr("Jours gratuits")} value={af.jours} onChange={(v) => setAf({ ...af, jours: v })} placeholder="7" /></div>
              : <div style={{ minWidth: 120 }}><Field id="af-zone" label={tr("Zone")} value={af.zone} onChange={(v) => setAf({ ...af, zone: v })} placeholder="Dakar" /></div>}
            <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
          </form>
          {annexes.length === 0 ? <p className="small muted">{tr("Aucun frais annexe. Ajoutez le tarif de stockage/jour et les livraisons.")}</p> : (
            <div className="table dense"><table>
              <thead><tr><th>{tr("Catégorie")}</th><th>{tr("Libellé")}</th><th>{tr("Prix")}</th><th>{tr("Détail")}</th><th /></tr></thead>
              <tbody>
                {annexes.map((a) => (
                  <tr key={a.id}>
                    <td className="small">{tr(a.categorie === 'stockage' ? 'Stockage' : a.categorie === 'livraison' ? 'Livraison' : 'Autre')}</td>
                    <td>{a.libelle}</td>
                    <td><strong>{a.prix.toLocaleString('fr-FR')} {a.devise}</strong></td>
                    <td className="small muted">{a.joursGratuits != null ? tr(`${a.joursGratuits} j gratuits`) : a.zone ?? ''}</td>
                    <td><Button kind="s" icon="trash" full={false} onClick={() => rmAnnexe(a.id)}>{tr("Supprimer")}</Button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </section>
      </div>
    </>
  );
}
