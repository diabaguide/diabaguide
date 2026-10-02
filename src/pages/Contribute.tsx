import { useI18n } from '../i18n';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { catLabel, cityName, type Cat, type City, type Proposal, type Status } from '../data';
import { emptyProposal, useStore } from '../store';
import { compressImage } from '../lib/image';
import { uploadPhoto, type PhotoBucket } from '../lib/photos';
import { Button, DemoNote, Field, Icon, RadioCard, Screen, Section, StatusBadge, StoredPhoto, TextArea, TopBar, Select } from '../ui';

/* Obligatoires : catégorie, nom, localisation, et au moins une photo OU un contact (téléphone / WeChat)
   pour que l'équipe puisse retrouver le prestataire. */
const required = (p: Proposal) => ({
  name: p.name.trim() ? null : 'Saisissez le nom du prestataire.',
  loc: p.loc.trim() ? null : 'Indiquez au moins un quartier, un marché ou un repère.',
  proof: p.photos > 0 || p.tel.trim() || p.wechat.trim() ? null : 'Ajoutez une photo, ou un téléphone ou un identifiant WeChat.',
});

export const MAX_PHOTOS = 3;

/* Deux façons d'ajouter une photo : prendre le lieu en photo, ou choisir dans la galerie.
   La photo est compressée puis envoyée ; `onPick` reçoit l'image allégée et son chemin. */
export function FilePick({ label, onPick, done, bucket }: { label: string; onPick: (img: Blob, path?: string) => void; done?: boolean; bucket?: PhotoBucket }) {
  const { tr } = useI18n();
  const camRef = useRef<HTMLInputElement>(null);
  const galRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const change = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const img = await compressImage(file);
      const up = await uploadPhoto(img, bucket);
      if (up.error) setErr(up.error); else onPick(img, up.path);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="sr" aria-label={tr("Prendre une photo")} onChange={(e) => change(e.target)} />
      <input ref={galRef} type="file" accept="image/*" className="sr" aria-label={tr("Choisir dans la galerie")} onChange={(e) => change(e.target)} />
      <button type="button" className="upload" disabled={busy} onClick={() => camRef.current?.click()}>
        <Icon name={done ? 'check' : 'camera'} size={26} />{tr(busy ? 'Préparation de la photo…' : label)}
      </button>
      <button type="button" className="upload" disabled={busy} onClick={() => galRef.current?.click()}>
        <Icon name="image" size={26} />{tr("Choisir dans la galerie")}
      </button>
      {err && <div role="alert" className="error"><Icon name="alert" size={16} sw={2} /><span>{tr(err)}</span></div>}
    </>
  );
}

export function Wizard() {
  const { tr } = useI18n();
  const { s, d, api } = useStore();
  const nav = useNavigate();
  const p = s.draft ?? emptyProposal();
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Proposal>) => d({ t: 'draft', p: { ...p, ...patch } });
  const errs = required(p);
  const saveDraft = async () => { setBusy(true); await api.saveDraft(p); nav('/contributions'); };
  const submit = async () => {
    if (errs.name || errs.loc || errs.proof) { setTried(true); return; }
    setBusy(true); await api.submit(p); nav('/contributions/nouvelle/envoyee');
  };

  return (
    <Screen>
      <TopBar title={tr("Proposer une adresse")} back={-1} />
      <div className="main" style={{ gap: 16, paddingTop: 14 }}>
        <div className="small muted">{tr("Quelques infos suffisent : l’équipe Diaba complète le reste. ")}<span className="req">*</span> {tr(" = obligatoire.")}</div>
        <section className="stack"><h2 style={{ fontSize: 16 }}>{tr("Catégorie ")}<span className="req" aria-hidden="true">*</span></h2>
          {s.categories.filter((c) => c.active).map((c) => <RadioCard key={c.id} name="cat" label={tr(c.label)} icon={c.icon} checked={p.cat === c.id} onChange={() => set({ cat: c.id as Cat })} />)}
        </section>
        <Field id="nom" label={tr("Nom du prestataire")} value={p.name} onChange={(v) => set({ name: v })} req hint={tr("Tel qu’écrit sur l’enseigne ou la carte, en chinois ou en lettres latines.")} error={tr(tried ? errs.name : null)} />
        <Select id="ville" label={tr("Ville")} value={p.city} onChange={(v) => set({ city: v as City })} options={s.cities.filter((c) => c.active).map((c) => ({ v: c.id, l: c.name }))} />
        <Field id="loc" label={tr("Où se trouve-t-il ?")} value={p.loc} onChange={(v) => set({ loc: v })} req hint={tr("Quartier, marché, rue ou repère : ce que vous savez.")} error={tr(tried ? errs.loc : null)} />
        <section className="stack"><h2 style={{ fontSize: 16 }}>{tr("Photo de la devanture ou de la carte de visite ")}<span className="req" aria-hidden="true">*</span></h2>
          <div className="small muted">{tr("Une photo suffit, on s’occupe du reste : nom en chinois, adresse, téléphone, WeChat.")}</div>
          <div className="grid2">
            {Array.from({ length: Math.min(p.photos, MAX_PHOTOS) }).map((_, i) => <StoredPhoto key={i} path={p.photoPaths[i]} label={tr(`Photo ${i + 1}`)} h={100} round={12} />)}
            {p.photos < MAX_PHOTOS ? <FilePick label="Prendre une photo" onPick={(_, path) => set({ photos: p.photos + 1, photoPaths: path ? [...p.photoPaths, path] : p.photoPaths })} /> : <div className="small muted">{tr("3 photos au maximum.")}</div>}
          </div>
        </section>
        <section className="stack"><h2 style={{ fontSize: 16 }}>{tr("Si vous les avez")}</h2>
          <div className="small muted">{tr("Sans photo, indiquez au moins un téléphone ou un identifiant WeChat.")}</div>
          <Field id="tel" label={tr("Téléphone")} type="tel" value={p.tel} onChange={(v) => set({ tel: v })} />
          <Field id="wx" label={tr("Identifiant WeChat")} value={p.wechat} onChange={(v) => set({ wechat: v })} />
          <Field id="prod" label={tr("Ce qu’ils vendent")} value={p.products} placeholder={tr("Par exemple : coques de téléphone, câbles")} onChange={(v) => set({ products: v })} />
        </section>
        {tried && errs.proof && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(errs.proof)}</span></div>}
        <div className="notice"><Icon name="info" size={20} /><span>{tr("Votre proposition sera examinée par l’équipe Diaba avant publication.")}</span></div>
        <div className="stack" style={{ marginTop: 6 }}>
          <Button icon="send" onClick={submit} disabled={busy}>{tr(busy ? 'Envoi…' : 'Envoyer à Diaba')}</Button>
          <Button kind="t" onClick={saveDraft} disabled={busy}>{tr("Enregistrer le brouillon")}</Button>
        </div>
      </div>
    </Screen>
  );
}

export function Sent() {
  const { tr } = useI18n();
  return (
    <Screen>
      <div className="main" style={{ padding: '40px 20px 24px' }}>
        <div className="center-screen">
          <span className="bigcheck"><Icon name="send" size={44} sw={2.2} /></span>
          <h1 className="display" style={{ fontSize: 30 }}>{tr("Proposition envoyée")}</h1>
          <p style={{ fontSize: 17 }}>{tr("Votre proposition sera examinée par l’équipe Diaba avant publication.")}</p>
          <div className="card row small muted" style={{ alignItems: 'flex-start', textAlign: 'start' }}><Icon name="clock" size={20} /><span>{tr("Objectif de traitement : sous 48 heures, à titre indicatif. Vous pourrez suivre l’avancement dans « Contributions ».")}</span></div>
        </div>
        <Button to="/contributions">{tr("Suivre mes contributions")}</Button>
        <Button to="/accueil" kind="s">{tr("Retour à l’accueil")}</Button>
      </div>
    </Screen>
  );
}

export function Contributions() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const nav = useNavigate();
  return (
    <Screen>
      <TopBar title={tr("Mes contributions")} />
      <div className="main" style={{ gap: 12 }}>
        <Button icon="plus" onClick={() => { d({ t: 'draft', p: null }); nav('/contributions/nouvelle/1'); }}>{tr("Proposer une adresse")}</Button>
        {s.proposals.map((p) => {
          const draft = p.status === 'Brouillon';
          const act = draft ? 'Reprendre le brouillon' : p.feedback ? 'Lire le retour' : 'Voir le suivi';
          const inner = (
            <>
              <div><div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div><div className="small muted"><span className="zh">{p.cn}</span> · {tr(cityName(p.city))}</div></div>
              <div><StatusBadge status={p.status} /></div>
              <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{p.date}</span><span className="row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 700 }}>{tr(act)}<Icon name="chevR" size={18} sw={2.4} /></span></div>
            </>
          );
          return draft ? (
            <button key={p.id} type="button" className="card stack" style={{ gap: 8, textAlign: 'start', font: 'inherit', cursor: 'pointer' }}
              onClick={() => { d({ t: 'draft', p }); nav('/contributions/nouvelle/1'); }}>{inner}</button>
          ) : (
            <Link key={p.id} to={`/contributions/${p.id}`} className="card stack" style={{ gap: 8, textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
          );
        })}
        <DemoNote />
      </div>
    </Screen>
  );
}

const STEPS: Status[] = ['Soumise', 'En vérification'];
export function ContributionDetail() {
  const { tr } = useI18n();
  const { id } = useParams();
  const { s, d, api } = useStore();
  const p = s.proposals.find((x) => x.id === id);
  const [tel, setTel] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(false);
  const [newPaths, setNewPaths] = useState<string[]>([]);
  if (!p) return <Navigate to="/contributions" replace />;
  const decided: Status[] = ['Publiée', 'Rattachée à une adresse existante', 'Refusée', 'Complément demandé'];
  const reached = p.status === 'Soumise' ? 1 : p.status === 'En vérification' ? 2 : 3;
  const tl = [...STEPS, decided.includes(p.status) ? p.status : 'Décision'];
  return (
    <Screen>
      <TopBar title={tr("Suivi de la proposition")} back="/contributions" />
      <div className="main">
        <div className="stack" style={{ gap: 8 }}>
          <h2 className="display" style={{ fontSize: 28 }}>{p.name}</h2>
          <div className="muted"><span className="zh">{p.cn}</span> · {tr(catLabel(p.cat))} · {tr(cityName(p.city))}</div>
          <div><StatusBadge status={p.status} big /></div>
        </div>
        <Section title={tr("Avancement")}>
          <div className="timeline">
            {tl.map((t, i) => (
              <div key={t} className={`st ${i < reached ? 'on' : ''}`}>
                <span className="dot">{i < reached && <Icon name="check" size={16} sw={3} />}</span>
                <div><div style={{ fontWeight: i < reached ? 700 : 500 }}>{tr(t)}</div><div className="small muted">{tr(i < reached ? p.date : 'À venir')}</div></div>
              </div>
            ))}
          </div>
        </Section>
        {p.status === 'Soumise' && <div className="notice"><Icon name="clock" size={20} /><span>{tr("Nous avons bien reçu votre proposition. Objectif de traitement : sous 48 heures, à titre indicatif.")}</span></div>}
        {p.status === 'En vérification' && <div className="notice"><Icon name="eye" size={20} /><span>{tr("L’équipe vérifie actuellement les informations. Nous vous écrirons ici si un complément est nécessaire.")}</span></div>}
        {p.feedback && <Section title={tr("Retour de l’équipe Diaba")} icon="chat"><p>{p.feedback}</p></Section>}
        {p.status === 'Complément demandé' && (
          <Section title={tr("Compléter les informations")} icon="edit">
            <Field id="tel2" label={tr("Téléphone")} type="tel" value={tel} onChange={setTel} placeholder={tr("+86 …")} />
            {p.photos + newPaths.length < MAX_PHOTOS && <FilePick label={photo ? 'Photo ajoutée' : 'Prendre une photo de la devanture'} done={photo} onPick={(_, path) => { setPhoto(true); if (path) setNewPaths((x) => [...x, path]); }} />}
            <TextArea id="note" label={tr("Message pour l’équipe (facultatif)")} value={note} onChange={setNote} />
            <Button icon="send" onClick={() => api.complement(p.id, { tel: tel || p.tel, photos: p.photos + newPaths.length + (photo && !newPaths.length ? 1 : 0), photoPaths: [...p.photoPaths, ...newPaths] })}>{tr("Envoyer le complément")}</Button>
          </Section>
        )}
        {p.status === 'Publiée' && <Button to="/adresses/baiyun" icon="eye">{tr("Voir la fiche publiée")}</Button>}
        {p.status === 'Rattachée à une adresse existante' && <Button to="/adresses/baiyun" icon="link">{tr("Voir la fiche existante")}</Button>}
        {p.status === 'Refusée' && <Button to="/contributions/nouvelle/1" icon="plus" onClick={() => d({ t: 'draft', p: null })}>{tr("Proposer une autre adresse")}</Button>}
      </div>
    </Screen>
  );
}
