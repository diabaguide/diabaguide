import { useI18n } from '../i18n';
import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { catIcon, catLabel, category, cityName, tagLabel, type Provider } from '../data';
import { useProviderById, useStore } from '../store';
import { Button, DemoNote, Icon, KV, Photo, RadioCard, Screen, Section, Stars, StarInput, StoredPhoto, Tag, TopBar, Verified } from '../ui';
import { saveReport } from '../lib/reports';
import { downloadCard, renderCard, shareCard } from '../lib/card';

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
const tel = (p: Provider) => 'tel:' + (p.tel ?? '').replace(/\s/g, '');
const ctaLabel = (p: Provider) => category(p.cat)?.ctaLabel ?? 'Contacter';

function useProvider(): Provider | null {
  const { id } = useParams();
  return useProviderById(id);
}

/* Le contenu spécifique dépend du gabarit défini sur la catégorie
   (administrable) : liste produits/services puis blocs optionnels. */
function Specific({ p }: { p: Provider }) {
  const { tr } = useI18n();
  const c = category(p.cat);
  const fields = c?.fields ?? [];
  // Produits/services : ids du catalogue + éventuel texte libre historique.
  const listed = [...(p.productTags ?? []).map(tagLabel), ...(p.products ?? []), ...(p.services ?? [])];
  const has = (f: string) => fields.includes(f as never);

  return (
    <Section title={tr(c?.tagsLabel ?? 'Détails')} icon={catIcon(p.cat)}>
      {listed.length
        ? <ul className="list-clean">{listed.map((x) => <li key={x}><Icon name="check" size={18} sw={2.4} />{tr(x)}</li>)}</ul>
        : <KV k={tr(c?.tagsLabel ?? 'Détails')} />}
      {has('moq') && <KV k={tr("Minimum de commande")}>{p.moq}</KV>}
      {has('cuisine') && <KV k={tr("Type de cuisine")}>{p.cuisine}</KV>}
      {has('hours') && <KV k={tr("Horaires")}>{p.hours}</KV>}
      {has('halal') && <KV k={tr("Mention halal")}>{tr(p.halal)}</KV>}
      {has('freight') && (
        <div className="row wrap">
          {p.freight?.includes('air') && <Tag tone="ok" icon="plane">{tr("Fret aérien")}</Tag>}
          {p.freight?.includes('sea') && <Tag tone="ok" icon="ship">{tr("Fret maritime")}</Tag>}
          {!p.freight?.length && <span className="np">{tr("Non renseigné")}</span>}
        </div>
      )}
      {has('goods') && <KV k={tr("Marchandises acceptées")}>{p.goods}</KV>}
      {has('senegal') && <KV k={tr("Desserte du Sénégal")}>{tr(p.senegal)}</KV>}
    </Section>
  );
}

export function Fiche() {
  const { tr } = useI18n();
  const p = useProvider();
  const { s, d, api } = useStore();
  const nav = useNavigate();
  const [msg, setMsg] = useState('');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [rating, setRating] = useState(false);
  useEffect(() => { setPhotoIdx(0); }, [p?.id]);
  useEffect(() => { if (p) void api.loadMyRating(p.id); }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <Navigate to="/recherche" replace />;
  const fav = s.favorites.includes(p.id);
  const dl = !!s.downloads[p.id];
  const photos = p.photoPaths ?? [];
  const mine = s.myRatings[p.id] ?? null;
  const rate = async (stars: number) => {
    setRating(true);
    const err = await api.rate(p.id, stars);
    setRating(false);
    if (err) setMsg(err);
  };
  const share = async () => {
    const url = `${location.origin}/adresses/${p.id}`;
    if (navigator.share) { try { await navigator.share({ title: p.name, url }); return; } catch { /* annulé */ } }
    await copy(url);
    setMsg('Lien copié. La personne qui le reçoit devra se connecter pour consulter la fiche.');
  };
  return (
    <Screen wide>
      <div className="hero-photo">
        <StoredPhoto bucket="fiche-photos" path={photos[photoIdx]} label={tr(`Photo : ${p.name}`)} h={250} round={0} />
        <div className="back"><button type="button" className="iconbtn" aria-label={tr("Retour aux résultats")} onClick={() => nav(-1)}><Icon name="chevL" size={24} sw={2.2} /></button></div>
        {photos.length > 0 && <div className="count">{photoIdx + 1} / {photos.length}</div>}
      </div>
      <main className="main fiche-main" style={{ gap: 18, paddingTop: 14 }}>
        <div className="fiche-col">
        {photos.length > 1 && (
          <div style={{ order: 0 }}>
            <div className="row photo-thumbs">
              {photos.map((path, i) => (
                <button key={path} type="button" className={`photo-thumb ${i === photoIdx ? 'on' : ''}`} aria-pressed={i === photoIdx}
                  aria-label={tr(`Photo ${i + 1}`)} onClick={() => setPhotoIdx(i)}>
                  <StoredPhoto bucket="fiche-photos" path={path} label={tr(`Photo ${i + 1}`)} h={72} w={72} round={10} />
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="stack" style={{ order: 1 }}>
        <div className="stack" style={{ gap: 8 }}>
          <div className="row wrap"><Tag icon={catIcon(p.cat)}>{tr(catLabel(p.cat))}</Tag><span className="small muted">{tr(p.district)}, {tr(cityName(p.city))}</span></div>
          <h1 className="display" style={{ fontSize: 31, lineHeight: 1.1 }}>{p.name}</h1>
          <div className="zh" style={{ fontSize: 19, fontWeight: 500 }}>{p.cn}</div>
          <div className="row wrap"><Verified /><span className="small muted">{tr("Dernière vérification : ")}{p.verified}</span></div>
          <p>{p.desc}</p>
          <DemoNote />
        </div>
        </div>
        <div style={{ order: 2 }}>
        <Section title={tr("Avis des voyageurs")} icon="star">
          {p.ratingCount ? <Stars avg={p.ratingAvg} count={p.ratingCount} size={20} /> : <span className="small muted">{tr("Aucun avis pour le moment.")}</span>}
          <div className="stack" style={{ gap: 6 }}>
            <span className="small muted">{tr(mine ? 'Votre note' : 'Donnez votre note')}</span>
            <StarInput value={mine} onChange={rate} disabled={rating} />
          </div>
        </Section>
        </div>
        <div className="stack" style={{ order: 6 }}>
        <Specific p={p} />
        </div>
        <div style={{ order: 7 }}>
        <Section title={tr("Adresse en chinois")} icon="pin">
          <div className="zhaddr" lang="zh-Hans">{p.addrCn}</div>
          <div className="small muted">{p.addrFr}</div>
          <div className="grid2">
            <Button kind="s" icon="copy" className="btn-tog" onClick={async () => setMsg((await copy(p.addrCn)) ? 'Adresse chinoise copiée.' : 'Copie impossible : sélectionnez le texte.')}>{tr("Copier l’adresse")}</Button>
            <Button to={`/adresses/${p.id}/chauffeur`} icon="truck">{tr("Montrer au chauffeur")}</Button>
          </div>
          <Button to={`/adresses/${p.id}/carte`} kind="s" icon="share">{tr("Carte de visite à partager")}</Button>
        </Section>
        </div>
        <div style={{ order: 8 }}>
        <Section title={tr("Accès")} icon="route">
          <KV k={tr("Entrée exacte")}>{p.entree}</KV>
          <KV k={tr("Repères utiles")}>{p.reperes}</KV>
          {p.metro ? <div className="notice"><Icon name="train" size={22} /><div><div className="small muted" style={{ fontWeight: 700 }}>{tr("Métro et gare")}</div>{p.metro}</div></div> : <KV k={tr("Métro et gare")} />}
        </Section>
        </div>
        </div>
        <div className="fiche-col fiche-side">
        <div style={{ order: 3 }}>
        <div className="grid2">
          <button type="button" className={`btn btn-tog ${fav ? 'on' : ''}`} aria-pressed={fav}
            onClick={() => { d({ t: 'fav', id: p.id }); setMsg(fav ? 'Retiré de vos favoris.' : 'Ajouté à vos favoris.'); }}><Icon name="heart" size={20} />{tr(fav ? 'Favori ajouté' : 'Ajouter aux favoris')}</button>
          <button type="button" className={`btn btn-tog ${dl ? 'on' : ''}`} aria-pressed={dl}
            onClick={() => { d({ t: 'dl', id: p.id }); setMsg(dl ? 'Fiche retirée de la consultation hors connexion.' : 'Cette fiche est maintenant disponible hors connexion, sans qu’aucun fichier ne soit enregistré sur l’appareil.'); }}><Icon name="download" size={20} />{tr(dl ? 'Disponible hors connexion' : 'Rendre disponible hors connexion')}</button>
          <button type="button" className="btn btn-tog" onClick={share}><Icon name="share" size={20} />{tr("Partager")}</button>
          <Link to={`/adresses/${p.id}/signaler`} className="btn btn-tog"><Icon name="edit" size={20} />{tr("Proposer une correction")}</Link>
        </div>
        </div>
        {msg && <div style={{ order: 4 }}><div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(msg)}</span></div></div>}
        <div style={{ order: 5 }}>
        <div className="stack">
          <Button to={`/adresses/${p.id}/contact`} icon={p.cat === 'hotel' || p.cat === 'resto' ? 'phone' : 'chat'}>{tr(ctaLabel(p))}</Button>
          {/* Coordonnées réelles, pas l'adresse (fictive en démonstration, donc non géolocalisable). */}
          <Button kind="s" icon="route" href={`https://www.openstreetmap.org/directions?to=${p.lat}%2C${p.lng}`}>{tr("Ouvrir l’itinéraire")}</Button>
        </div>
        </div>
        <div style={{ order: 9 }}>
        <Section title={tr("Coordonnées")} icon="chat">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <KV k={tr("Téléphone")}>{p.tel}</KV>
            {p.tel && <Button href={tel(p)} icon="phone" full={false}>{tr("Appeler")}</Button>}
          </div>
          <div style={{ height: 1, background: 'var(--line)' }} />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <KV k={tr("Identifiant WeChat")}>{p.wechat}</KV>
            {p.wechat && <Button kind="s" icon="copy" full={false} onClick={async () => setMsg((await copy(p.wechat!)) ? 'Identifiant WeChat copié.' : 'Copie impossible.')}>{tr("Copier")}</Button>}
          </div>
          {p.wechat && (
            <details className="qr"><summary><Icon name="qr" size={20} />{tr("Afficher le QR code WeChat")}</summary>
              <div className="stack" style={{ alignItems: 'center', padding: '6px 0 16px' }}><Photo label={tr("QR code WeChat")} h={160} w={160} round={12} /><span className="small muted">{tr("QR code de démonstration")}</span></div>
            </details>
          )}
        </Section>
        </div>
        <div style={{ order: 10 }}>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="link" style={{ color: 'var(--danger)' }} to={`/adresses/${p.id}/signaler`}><Icon name="flag" size={18} />{tr(" Signaler un problème")}</Link>
        </div>
        </div>
        </div>
      </main>
    </Screen>
  );
}

export function Driver() {
  const { tr } = useI18n();
  const p = useProvider();
  const [ok, setOk] = useState(false);
  if (!p) return <Navigate to="/recherche" replace />;
  return (
    <div className="phone">
      <div className="driver">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <Link to={`/adresses/${p.id}`} className="iconbtn" aria-label={tr("Retour à la fiche")}><Icon name="chevL" size={24} sw={2.2} /></Link>
          <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: 2, color: 'var(--gold-fill)' }}>{tr("DIABA GUIDE")}</span>
        </div>
        <div style={{ color: '#DCE6FA' }}>{tr("Montrez cet écran au chauffeur")}</div>
        <div><div className="lbl">{tr("NOM")}</div><div lang="zh-Hans" style={{ fontSize: 44, lineHeight: 1.25, fontWeight: 700 }}>{p.cn}</div></div>
        <div className="gold-rule" />
        <div><div className="lbl">{tr("ADRESSE")}</div><div lang="zh-Hans" style={{ fontSize: 34, lineHeight: 1.35, fontWeight: 500 }}>{p.addrCn}</div></div>
        <div style={{ color: '#DCE6FA', marginTop: 'auto' }}>{p.name} · {p.addrFr.split('(')[0].trim()}</div>
        <div className="stack">
          <Button to={`/adresses/${p.id}`} kind="g">{tr("Retour à la fiche")}</Button>
          <Button kind="s" icon="copy" onClick={async () => setOk(await copy(p.addrCn))}>{tr(ok ? 'Adresse copiée' : 'Copier l’adresse')}</Button>
        </div>
      </div>
    </div>
  );
}

export function Card() {
  const { tr } = useI18n();
  const p = useProvider();
  const [blob, setBlob] = useState<Blob | null>(null);
  const [src, setSrc] = useState('');
  const [msg, setMsg] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!p) return;
    let url = '';
    let live = true;
    renderCard(p).then((b) => { if (!live) return; url = URL.createObjectURL(b); setBlob(b); setSrc(url); }).catch(() => live && setFailed(true));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [p]);
  if (!p) return <Navigate to="/recherche" replace />;
  const share = async () => {
    if (!blob) return;
    const r = await shareCard(blob, p);
    if (r === 'unsupported') { downloadCard(blob, p); setMsg('Partage direct indisponible sur cet appareil : l’image a été enregistrée, envoyez-la depuis WhatsApp ou WeChat.'); }
    else if (r === 'shared') setMsg('');
  };
  return (
    <Screen>
      <TopBar title={tr("Carte de visite")} back={`/adresses/${p.id}`} />
      <div className="main">
        <div className="notice"><Icon name="info" size={22} /><div style={{ fontWeight: 500 }}>{tr("Envoyez cette carte par WhatsApp ou WeChat, ou montrez-la au chauffeur pour qu’il vous emmène chez le prestataire.")}</div></div>
        {failed ? <div role="alert" className="notice"><Icon name="info" size={22} /><span>{tr("La carte n’a pas pu être générée. Réessayez.")}</span></div>
          : src ? <img src={src} alt={`${p.name} · ${p.cn}`} style={{ width: '100%', borderRadius: 16, boxShadow: 'var(--shadow-md)' }} />
          : <div className="muted" role="status">{tr("Génération de la carte…")}</div>}
        {msg && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(msg)}</span></div>}
        <div className="stack">
          <Button icon="share" onClick={share} disabled={!blob}>{tr("Partager (WhatsApp, WeChat…)")}</Button>
          <Button kind="s" icon="download" onClick={() => blob && downloadCard(blob, p)} disabled={!blob}>{tr("Enregistrer l’image")}</Button>
        </div>
      </div>
    </Screen>
  );
}

export function Contact() {
  const { tr } = useI18n();
  const p = useProvider();
  const [ok, setOk] = useState(false);
  if (!p) return <Navigate to="/recherche" replace />;
  return (
    <Screen>
      <TopBar title={tr(p.cat === 'hotel' ? 'Contacter pour réserver' : ctaLabel(p))} back={`/adresses/${p.id}`} />
      <div className="main">
        <div className="card row"><Photo label={tr("Photo")} h={64} w={64} round={12} /><div><div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div><div className="small muted zh">{p.cn}</div><Verified /></div></div>
        <div className="notice"><Icon name="info" size={22} /><div style={{ fontWeight: 500 }}>{tr("Appelez ou contactez directement ce prestataire pour connaître ses disponibilités et ses conditions.")}</div></div>
        <Section title={tr("Téléphone")} icon="phone">
          {p.tel ? <><div style={{ fontSize: 22, fontWeight: 700 }}>{p.tel}</div><Button href={tel(p)} icon="phone">{tr("Appeler")}</Button></> : <KV k={tr("Téléphone")} />}
        </Section>
        <Section title={tr("WeChat")} icon="chat">
          {p.wechat ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{p.wechat}</div>
              <Button kind="s" icon="copy" onClick={async () => setOk(await copy(p.wechat!))}>{tr(ok ? 'Identifiant copié' : 'Copier l’identifiant')}</Button>
              <details className="qr"><summary><Icon name="qr" size={20} />{tr("Afficher le QR code")}</summary><div className="row" style={{ justifyContent: 'center', padding: '6px 0 16px' }}><Photo label={tr("QR code WeChat")} h={160} w={160} round={12} /></div></details>
            </>
          ) : <KV k={tr("Identifiant WeChat")} />}
        </Section>
        <div className="row small muted" style={{ alignItems: 'flex-start' }}><Icon name="lock" size={18} /><span>{tr("Diaba Guide ne gère ni réservation, ni commande, ni paiement. Tout se règle directement avec le prestataire.")}</span></div>
      </div>
    </Screen>
  );
}

export function Report() {
  const { tr } = useI18n();
  const p = useProvider();
  const nav = useNavigate();
  const [type, setType] = useState<'correction' | 'signalement'>('correction');
  const [about, setAbout] = useState('adresse');
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [apiErr, setApiErr] = useState<string | null>(null);
  if (!p) return <Navigate to="/recherche" replace />;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setApiErr(null);
    const { error } = await saveReport({
      providerId: p.id,
      providerName: p.name,
      type,
      about,
      text,
    });
    setBusy(false);
    if (error) { setApiErr(error); return; }
    setSent(true);
  };

  return (
    <Screen>
      <TopBar title={tr("Correction ou signalement")} back={`/adresses/${p.id}`} />
      <div className="main" style={{ gap: 18 }}>
        {sent ? (
          <>
            <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr("Merci. Votre retour est transmis à l'équipe Diaba.")}</span></div>
            <Button onClick={() => nav(`/adresses/${p.id}`)}>{tr("Retour à la fiche")}</Button>
          </>
        ) : (
          <>
            <p className="muted">{tr("Votre retour est transmis à l'équipe Diaba, qui le vérifie avant toute modification de la fiche.")}</p>
            {apiErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(apiErr)}</span></div>}
            <section className="stack"><h2 style={{ fontSize: 17 }}>{tr("Que souhaitez-vous faire ?")}</h2>
              <RadioCard name="type" label={tr("Proposer une correction")} sub={tr("Adresse, téléphone, produits, horaires…")} icon="edit" checked={type === 'correction'} onChange={() => setType('correction')} />
              <RadioCard name="type" label={tr("Signaler un problème")} sub={tr("Adresse fermée, contact injoignable, contenu inapproprié…")} icon="flag" checked={type === 'signalement'} onChange={() => setType('signalement')} />
            </section>
            <section className="stack"><h2 style={{ fontSize: 17 }}>{tr("Concerne")}</h2>
              {[['adresse', 'Adresse ou accès'], ['contact', 'Téléphone ou WeChat'], ['produits', 'Produits ou services'], ['autre', 'Autre']].map(([v, l]) => <RadioCard key={v} name="about" label={tr(l)} checked={about === v} onChange={() => setAbout(v)} />)}
            </section>
            <div className="field"><label htmlFor="detail">{tr("Détails")}</label><textarea id="detail" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Précisez ce qui doit être corrigé ou ce que vous avez constaté.")} /></div>
            <Button icon="send" disabled={!text.trim() || busy} onClick={send}>{tr(busy ? 'Envoi…' : 'Envoyer à Diaba')}</Button>
          </>
        )}
      </div>
    </Screen>
  );
}
