import { useI18n } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { isTeamRole } from '../lib/auth';
import { Button, Field, Icon, Screen, TopBar } from '../ui';
import {
  fetchShippingInfo, fetchWarehousesCarte, setClientCardContact, setClientEntryName, setMyCardContact, setMyEntryName,
  type ShippingInfo, type WarehouseFull,
} from '../lib/fret';
import { cleanCardText, clientNoLabel, entryNameFromInput, isValidCardName, isValidCardPhone, isValidEntryName, printedPhone, suggestEntryName } from '../lib/carteData';
import {
  downloadShippingCard, printShippingCard, renderShippingCard, shareShippingCard, shippingCardFileName,
  type ShippingCardData,
} from '../lib/shippingCard';

/**
 * Carte d'expédition (« shipping mark ») : la carte à coller sur les marchandises
 * achetées en Chine, que l'entrepôt exige pour accepter un colis. Le voyageur choisit
 * son nom court ; son nom, son téléphone et son numéro de client viennent de son
 * compte ; le téléphone de l'entrepôt vient de la fiche entrepôt.
 */
function CarteContenu({ profileId, onName }: { profileId?: string; onName?: (name: string) => void }) {
  const { tr } = useI18n();
  const { s } = useStore();
  const equipe = isTeamRole(s.user?.role) || s.user?.role === 'livreur';
  const [info, setInfo] = useState<ShippingInfo | null>(null);
  const [warehouse, setWarehouse] = useState<WarehouseFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [notInstalled, setNotInstalled] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [entry, setEntry] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [cName, setCName] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cSaved, setCSaved] = useState({ name: '', phone: '' });
  const [cSaving, setCSaving] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [renderErr, setRenderErr] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true); setErr(null); setNotInstalled(false);
    void Promise.all([fetchShippingInfo(profileId), fetchWarehousesCarte()]).then(([res, whs]) => {
      if (!live) return;
      if (res.notInstalled) setNotInstalled(true);
      else if (res.error || !res.data) setErr(res.error ?? 'Impossible d’afficher la carte.');
      else {
        setInfo(res.data);
        setSaved(res.data.entryName);
        setEntry(res.data.entryName ?? suggestEntryName(res.data.name));
        setCName(res.data.cardName ?? ''); setCPhone(res.data.cardPhone ?? '');
        setCSaved({ name: res.data.cardName ?? '', phone: res.data.cardPhone ?? '' });
        onName?.(res.data.name);
      }
      // L'entrepôt de la carte : le premier actif dont le téléphone est renseigné.
      setWarehouse(whs.find((w) => w.tel?.trim()) ?? whs[0] ?? null);
      setLoading(false);
    });
    return () => { live = false; };
  }, [profileId, onName]);

  const valid = isValidEntryName(entry);
  const contactOk = isValidCardName(cName) && isValidCardPhone(cPhone);
  // Imprimé : ce que le client a saisi pour la carte, à défaut son profil (aperçu en direct, avant enregistrement).
  const shownName = info?.contactModifiable ? (cleanCardText(cName) || info.profileName) : info?.name ?? '';
  const shownPhone = info?.contactModifiable ? (cleanCardText(cPhone) || info.profilePhone) : info?.phone ?? null;
  const data: ShippingCardData | null = useMemo(() => (info && valid && contactOk ? {
    customerName: shownName, customerPhone: shownPhone, entryName: entry, clientNo: info.clientNo,
    warehouse: warehouse ? { tel: warehouse.tel, bureauNom: warehouse.bureauNom, bureauTel: warehouse.bureauTel } : null,
  } : null), [info, valid, contactOk, shownName, shownPhone, entry, warehouse]);

  // Aperçu : redessiné quand une valeur change (avec une courte attente pendant la frappe).
  useEffect(() => {
    if (!data) return;
    let live = true;
    const timer = window.setTimeout(() => {
      renderShippingCard(data).then((b) => {
        if (!live) return;
        const url = URL.createObjectURL(b);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setBlob(b); setPreviewUrl(url); setRenderErr(null);
      }).catch((e: Error) => { if (live) setRenderErr(e.message); });
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [data]);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const enregistrer = async () => {
    if (!valid) return;
    setSaving(true); setErr(null); setOk(null);
    const res = profileId ? await setClientEntryName(profileId, entry) : await setMyEntryName(entry);
    setSaving(false);
    if (res.notInstalled) { setNotInstalled(true); return; }
    if (res.error || !res.data) { setErr(res.error ?? 'Enregistrement impossible.'); return; }
    setSaved(res.data); setEntry(res.data);
    setOk('Nom court enregistré.');
  };

  const enregistrerContact = async () => {
    if (!contactOk) return;
    setCSaving(true); setErr(null); setOk(null);
    const res = profileId ? await setClientCardContact(profileId, cName, cPhone) : await setMyCardContact(cName, cPhone);
    setCSaving(false);
    if (res.notInstalled) { setErr('Le changement du nom et du téléphone n’est pas encore disponible.'); return; }
    if (res.error || !res.data) { setErr(res.error ?? 'Enregistrement impossible.'); return; }
    const n = res.data.cardName ?? ''; const t = res.data.cardPhone ?? '';
    setCName(n); setCPhone(t); setCSaved({ name: n, phone: t });
    setOk('Nom et téléphone de la carte enregistrés.');
  };
  const repriseProfil = () => { setCName(''); setCPhone(''); };

  const partager = async () => {
    if (!blob || !data) return;
    setErr(null); setOk(null);
    const r = await shareShippingCard(blob, data);
    if (r === 'unsupported') { downloadShippingCard(blob, data); setOk('Partage direct indisponible sur cet appareil : l’image a été enregistrée, envoyez-la depuis WhatsApp ou WeChat.'); }
  };
  const imprimer = () => {
    if (!blob) return;
    try { printShippingCard(blob); } catch { setErr('L’impression n’a pas pu démarrer : téléchargez l’image puis imprimez-la.'); }
  };

  if (loading) return <p className="muted" role="status">{tr("Chargement…")}</p>;
  if (notInstalled) {
    return (
      <div role="status" className="notice warn">
        <Icon name="info" size={22} />
        <div>
          <strong>{tr("La carte d’expédition n’est pas encore disponible.")}</strong>
          {equipe && <div className="small">{tr("Lancez supabase/500_carte_expedition.sql dans Supabase pour l’activer.")}</div>}
        </div>
      </div>
    );
  }
  if (err && !info) return <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>;
  if (!info) return null;

  const phone = printedPhone(shownPhone);
  const contactDirty = cleanCardText(cName) !== cSaved.name || cleanCardText(cPhone) !== cSaved.phone;
  const dirty = valid && entry !== saved;
  const manque = !warehouse?.tel?.trim();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.canShare === 'function';

  return (
    <div className="carte-layout">
      <div className="stack" style={{ gap: 12 }}>
        {previewUrl
          ? <img className="carte-preview" src={previewUrl} width={1040} height={1512} alt={tr("Aperçu de la carte d’expédition")} />
          : <div className="carte-preview carte-preview-vide" role="status">{tr(renderErr ?? (valid ? 'Création de la carte…' : 'Saisissez un nom court pour voir la carte.'))}</div>}
      </div>

      <div className="stack" style={{ gap: 14 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}

        <section className="card stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Ce qui est imprimé")}</h2>
          {info.contactModifiable ? (
            <>
              <Field id="card-name" label={tr("Nom du client")} value={cName} onChange={(v) => setCName(v.slice(0, 40))} placeholder={info.profileName}
                error={!isValidCardName(cName) ? tr('Entre 2 et 40 caractères.') : null}
                hint={tr('Laissez vide pour utiliser le nom du profil.')} />
              <Field id="card-phone" label={tr("Téléphone du client")} type="tel" value={cPhone} onChange={(v) => setCPhone(v.slice(0, 25))} placeholder={info.profilePhone ?? ''}
                error={!isValidCardPhone(cPhone) ? tr('Chiffres, espaces et + ( ) . / - seulement (6 à 25 caractères).') : null}
                hint={tr('Laissez vide pour utiliser le téléphone du profil.')} />
              <dl className="carte-liste">
                <div><dt>{tr("Numéro de client")}</dt><dd>{clientNoLabel(info.clientNo)}</dd></div>
              </dl>
              <Button icon="check" kind={contactDirty ? 'p' : 's'} disabled={!contactDirty || !contactOk || cSaving} onClick={() => void enregistrerContact()}>{tr(cSaving ? 'Enregistrement…' : 'Enregistrer le nom et le téléphone')}</Button>
              {(cName || cPhone) && <button type="button" className="linklike link small" onClick={repriseProfil}>{tr("Reprendre le nom et le téléphone du profil")}</button>}
            </>
          ) : (
            <>
              <dl className="carte-liste">
                <div><dt>{tr("Nom du client")}</dt><dd>{info.name.toUpperCase()}</dd></div>
                <div><dt>{tr("Téléphone du client")}</dt><dd>{phone ? `${phone} / (${clientNoLabel(info.clientNo)})` : `(${clientNoLabel(info.clientNo)})`}</dd></div>
                <div><dt>{tr("Numéro de client")}</dt><dd>{clientNoLabel(info.clientNo)}</dd></div>
              </dl>
              {!profileId && <Link className="link small" to="/profil/modifier">{tr("Modifier mon nom ou mon téléphone")}</Link>}
            </>
          )}
          {!phone && <div className="notice warn"><Icon name="alert" size={20} /><span>{tr(profileId ? 'Ce client n’a pas de numéro de téléphone pour la carte.' : 'Ajoutez un numéro de téléphone : il doit figurer sur la carte.')}</span></div>}
        </section>

        <section className="card stack" style={{ gap: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Nom court (入仓号)")}</h2>
          <Field id="entry-name" label={tr("2 à 10 lettres ou chiffres, sans accents")} value={entry}
            onChange={(v) => setEntry(entryNameFromInput(v).slice(0, 10))} placeholder="BTC"
            error={entry && !valid ? tr('Au moins 2 caractères.') : null}
            hint={saved ? undefined : tr('Proposition à partir de votre nom : modifiez-la, puis enregistrez-la pour la garder.')} />
          <Button icon="check" kind={dirty ? 'p' : 's'} disabled={!dirty || saving} onClick={() => void enregistrer()}>{tr(saving ? 'Enregistrement…' : 'Enregistrer le nom court')}</Button>
        </section>

        {manque && (
          <div role="status" className="notice warn">
            <Icon name="info" size={20} />
            <span>{tr(equipe ? 'Le téléphone de l’entrepôt n’est pas renseigné : saisissez-le dans « Tarifs et entrepôts ».' : 'Le téléphone de l’entrepôt n’est pas encore renseigné : il apparaîtra sur la carte dès que l’équipe l’aura ajouté.')}</span>
          </div>
        )}

        <section className="stack" style={{ gap: 10 }}>
          <Button icon="download" disabled={!blob} onClick={() => blob && data && downloadShippingCard(blob, data)}>{tr("Télécharger l’image")}</Button>
          {canShare && <Button icon="share" kind="s" disabled={!blob} onClick={() => void partager()}>{tr("Partager (WhatsApp, WeChat…)")}</Button>}
          <Button icon="send" kind="s" disabled={!blob} onClick={imprimer}>{tr("Imprimer")}</Button>
          {data && <p className="small muted" style={{ margin: 0 }}>{shippingCardFileName(data)}</p>}
          <p className="small muted" style={{ margin: 0 }}>{tr("Collez cette carte sur chaque colis : l’entrepôt refuse les marchandises sans ces informations.")}</p>
        </section>
      </div>
    </div>
  );
}

/** Pour le voyageur : sa propre carte. */
export function CarteVoyageur() {
  const { tr } = useI18n();
  return (
    <Screen wide>
      <TopBar title={tr("Ma carte d’expédition")} back="/mes-envois" />
      <div className="main" style={{ gap: 16 }}><CarteContenu /></div>
    </Screen>
  );
}

/** Pour la console (fret, équipe) : la carte d'un client. */
export function CarteClient() {
  const { tr } = useI18n();
  const { id } = useParams();
  const base = useLocation().pathname.startsWith('/fret') ? '/fret' : '/equipe';
  const [nom, setNom] = useState('');
  return (
    <>
      <header className="admin-head">
        <div>
          <h1>{tr("Carte d’expédition")}</h1>
          {nom && <div className="muted" style={{ marginTop: 4 }}>{nom}</div>}
        </div>
        <Button to={`${base}/expeditions`} kind="s" icon="chevL" full={false}>{tr("Toutes les expéditions")}</Button>
      </header>
      <div className="admin-body" style={{ gap: 18 }}><CarteContenu profileId={id} onName={setNom} /></div>
    </>
  );
}
