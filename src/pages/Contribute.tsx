import { useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { catLabel, cityName, type Cat, type City, type Proposal, type Status } from '../data';
import { emptyProposal, useStore } from '../store';
import { Button, DemoNote, Field, Icon, KV, Photo, RadioCard, Screen, Section, StatusBadge, TextArea, TopBar, Select } from '../ui';

const LABELS = ['Lieu', 'Contact', 'Photos', 'Envoi'];

function Stepper({ n }: { n: number }) {
  return (
    <div className="stepper">
      <div className="bars">{[1, 2, 3, 4].map((i) => <i key={i} className={i <= n ? 'on' : ''} />)}</div>
      <div className="row small" style={{ justifyContent: 'space-between' }}><strong>Étape {n} sur 4 : {LABELS[n - 1]}</strong><span className="muted">Brouillon automatique</span></div>
    </div>
  );
}

/* Seuls la catégorie, le nom et une indication de localisation sont obligatoires pour soumettre. */
const required = (p: Proposal) => ({
  name: p.name.trim() ? null : 'Saisissez le nom du prestataire.',
  loc: p.loc.trim() ? null : 'Indiquez au moins un quartier, un marché ou un repère.',
});

function FilePick({ label, onPick, done }: { label: string; onPick: () => void; done?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="sr" aria-label={label} onChange={(e) => e.target.files?.length && onPick()} />
      <button type="button" className="upload" onClick={() => ref.current?.click()}>
        <Icon name={done ? 'check' : 'camera'} size={26} />{label}
      </button>
    </>
  );
}

export function Wizard() {
  const { step } = useParams();
  const n = Math.min(4, Math.max(1, Number(step) || 1));
  const { s, d, api } = useStore();
  const nav = useNavigate();
  const p = s.draft ?? emptyProposal();
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Proposal>) => d({ t: 'draft', p: { ...p, ...patch } });
  const errs = required(p);
  const go = (to: number) => nav(`/contributions/nouvelle/${to}`);
  const next = () => {
    if (n === 1) { setTried(true); if (errs.name || errs.loc) return; }
    go(n + 1);
  };
  const saveDraft = async () => { setBusy(true); await api.saveDraft(p); nav('/contributions'); };
  const submit = async () => {
    if (errs.name || errs.loc) { setTried(true); go(1); return; }
    setBusy(true); await api.submit(p); nav('/contributions/nouvelle/envoyee');
  };
  const nextBtns: ReactNode = (
    <div className="stack" style={{ marginTop: 6 }}>
      <div className="row">
        {n > 1 && <Button kind="s" icon="chevL" full={false} onClick={() => go(n - 1)}>Retour</Button>}
        <div className="grow">{n < 4 ? <Button onClick={next}>Suivant</Button> : <Button icon="send" onClick={submit} disabled={busy}>{busy ? 'Envoi…' : 'Soumettre à Diaba'}</Button>}</div>
      </div>
      <Button kind="t" onClick={saveDraft} disabled={busy}>Enregistrer le brouillon</Button>
    </div>
  );

  return (
    <Screen>
      <TopBar title="Proposer une adresse" back={n > 1 ? `/contributions/nouvelle/${n - 1}` : -1} />
      <Stepper n={n} />
      <div className="main" style={{ gap: 16, paddingTop: 14 }}>
        {n === 1 && (
          <>
            <div className="small muted">Seuls la catégorie, le nom et une indication de localisation sont obligatoires. <span className="req">*</span> = obligatoire.</div>
            <section className="stack"><h2 style={{ fontSize: 16 }}>Catégorie <span className="req" aria-hidden="true">*</span></h2>
              {s.categories.filter((c) => c.active).map((c) => <RadioCard key={c.id} name="cat" label={c.label} icon={c.icon} checked={p.cat === c.id} onChange={() => set({ cat: c.id as Cat })} />)}
            </section>
            <Field id="nom" label="Nom du prestataire" value={p.name} onChange={(v) => set({ name: v })} req error={tried ? errs.name : null} />
            <Field id="nomcn" label="Nom en chinois (facultatif)" value={p.cn} onChange={(v) => set({ cn: v })} />
            <Select id="ville" label="Ville" value={p.city} onChange={(v) => set({ city: v as City })} options={s.cities.filter((c) => c.active).map((c) => ({ v: c.id, l: c.name }))} />
            <Field id="loc" label="Indication de localisation" value={p.loc} onChange={(v) => set({ loc: v })} req hint="Quartier, marché, rue ou repère : ce que vous savez." error={tried ? errs.loc : null} />
          </>
        )}
        {n === 2 && (
          <>
            <div className="small muted">Tous les champs de cette étape sont facultatifs. Ne renseignez que ce que vous connaissez.</div>
            <TextArea id="prod" label="Produits ou services" rows={4} value={p.products} onChange={(v) => set({ products: v })} />
            <Field id="moq" label="Minimum de commande" value={p.moq} placeholder="Par exemple : 100 pièces" onChange={(v) => set({ moq: v })} />
            <Field id="tel" label="Téléphone" type="tel" value={p.tel} onChange={(v) => set({ tel: v })} />
            <Field id="wx" label="Identifiant WeChat" value={p.wechat} onChange={(v) => set({ wechat: v })} />
            <Field id="adrcn" label="Adresse en chinois" value={p.addrCn} hint="Copiez-la depuis une carte de visite si possible." onChange={(v) => set({ addrCn: v })} />
          </>
        )}
        {n === 3 && (
          <>
            <div className="small muted">Facultatif. Des photos et la carte de visite aident l’équipe à vérifier l’adresse.</div>
            <section className="stack"><h2 style={{ fontSize: 16 }}>Photos du lieu ({p.photos})</h2>
              <div className="grid2">
                {Array.from({ length: Math.min(p.photos, 4) }).map((_, i) => <Photo key={i} label={`Photo ${i + 1}`} h={100} round={12} />)}
                <FilePick label="Ajouter une photo" onPick={() => set({ photos: p.photos + 1 })} />
              </div>
            </section>
            <section className="stack"><h2 style={{ fontSize: 16 }}>Carte de visite</h2>
              <div className="grid2">
                {p.cardFront ? <Photo label="Recto" h={112} round={12} /> : <FilePick label="Ajouter le recto" onPick={() => set({ cardFront: true })} />}
                {p.cardBack ? <Photo label="Verso" h={112} round={12} /> : <FilePick label="Ajouter le verso" onPick={() => set({ cardBack: true })} />}
              </div>
            </section>
          </>
        )}
        {n === 4 && (
          <>
            <div className="muted small" style={{ fontSize: 15 }}>Relisez votre proposition avant de l’envoyer.</div>
            <Section title="Récapitulatif">
              {[
                ['Catégorie', catLabel(p.cat), 1], ['Nom', [p.name, p.cn].filter(Boolean).join(' · '), 1],
                ['Localisation', [cityName(p.city), p.loc].filter(Boolean).join(' · '), 1], ['Produits', p.products, 2], ['Minimum de commande', p.moq, 2],
                ['Téléphone et WeChat', [p.tel, p.wechat].filter(Boolean).join(' · '), 2],
                ['Photos', `${p.photos} photo(s)${p.cardFront || p.cardBack ? ', carte de visite' : ''}`, 3],
              ].map(([k, v, to]) => (
                <div key={k as string} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <KV k={k as string}>{(v as string) || undefined}</KV>
                  <Link className="link" to={`/contributions/nouvelle/${to}`} aria-label={`Modifier ${k}`}>Modifier</Link>
                </div>
              ))}
            </Section>
            {!errs.name && !errs.loc
              ? <div className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>Les 3 champs obligatoires sont remplis.</span></div>
              : <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>Il manque des champs obligatoires (nom ou localisation).</span></div>}
            <div className="notice"><Icon name="info" size={20} /><span>Votre proposition sera examinée par l’équipe Diaba avant publication.</span></div>
          </>
        )}
        {nextBtns}
      </div>
    </Screen>
  );
}

export function Sent() {
  return (
    <Screen>
      <div className="main" style={{ padding: '40px 20px 24px' }}>
        <div className="center-screen">
          <span className="bigcheck"><Icon name="send" size={44} sw={2.2} /></span>
          <h1 className="display" style={{ fontSize: 30 }}>Proposition envoyée</h1>
          <p style={{ fontSize: 17 }}>Votre proposition sera examinée par l’équipe Diaba avant publication.</p>
          <div className="card row small muted" style={{ alignItems: 'flex-start', textAlign: 'left' }}><Icon name="clock" size={20} /><span>Objectif de traitement : sous 48 heures, à titre indicatif. Vous pourrez suivre l’avancement dans « Contributions ».</span></div>
        </div>
        <Button to="/contributions">Suivre mes contributions</Button>
        <Button to="/accueil" kind="s">Retour à l’accueil</Button>
      </div>
    </Screen>
  );
}

export function Contributions() {
  const { s, d } = useStore();
  const nav = useNavigate();
  return (
    <Screen>
      <TopBar title="Mes contributions" />
      <div className="main" style={{ gap: 12 }}>
        <Button icon="plus" onClick={() => { d({ t: 'draft', p: null }); nav('/contributions/nouvelle/1'); }}>Proposer une adresse</Button>
        {s.proposals.map((p) => {
          const draft = p.status === 'Brouillon';
          const act = draft ? 'Reprendre le brouillon' : p.feedback ? 'Lire le retour' : 'Voir le suivi';
          const inner = (
            <>
              <div><div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div><div className="small muted"><span className="zh">{p.cn}</span> · {cityName(p.city)}</div></div>
              <div><StatusBadge status={p.status} /></div>
              <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{p.date}</span><span className="row" style={{ gap: 4, color: 'var(--primary)', fontWeight: 700 }}>{act}<Icon name="chevR" size={18} sw={2.4} /></span></div>
            </>
          );
          return draft ? (
            <button key={p.id} type="button" className="card stack" style={{ gap: 8, textAlign: 'left', font: 'inherit', cursor: 'pointer' }}
              onClick={() => { d({ t: 'draft', p }); nav('/contributions/nouvelle/2'); }}>{inner}</button>
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
  const { id } = useParams();
  const { s, d, api } = useStore();
  const p = s.proposals.find((x) => x.id === id);
  const [tel, setTel] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState(false);
  if (!p) return <Navigate to="/contributions" replace />;
  const decided: Status[] = ['Publiée', 'Rattachée à une adresse existante', 'Refusée', 'Complément demandé'];
  const reached = p.status === 'Soumise' ? 1 : p.status === 'En vérification' ? 2 : 3;
  const tl = [...STEPS, decided.includes(p.status) ? p.status : 'Décision'];
  return (
    <Screen>
      <TopBar title="Suivi de la proposition" back="/contributions" />
      <div className="main">
        <div className="stack" style={{ gap: 8 }}>
          <h2 className="display" style={{ fontSize: 28 }}>{p.name}</h2>
          <div className="muted"><span className="zh">{p.cn}</span> · {catLabel(p.cat)} · {cityName(p.city)}</div>
          <div><StatusBadge status={p.status} big /></div>
        </div>
        <Section title="Avancement">
          <div className="timeline">
            {tl.map((t, i) => (
              <div key={t} className={`st ${i < reached ? 'on' : ''}`}>
                <span className="dot">{i < reached && <Icon name="check" size={16} sw={3} />}</span>
                <div><div style={{ fontWeight: i < reached ? 700 : 500 }}>{t}</div><div className="small muted">{i < reached ? p.date : 'À venir'}</div></div>
              </div>
            ))}
          </div>
        </Section>
        {p.status === 'Soumise' && <div className="notice"><Icon name="clock" size={20} /><span>Nous avons bien reçu votre proposition. Objectif de traitement : sous 48 heures, à titre indicatif.</span></div>}
        {p.status === 'En vérification' && <div className="notice"><Icon name="eye" size={20} /><span>L’équipe vérifie actuellement les informations. Nous vous écrirons ici si un complément est nécessaire.</span></div>}
        {p.feedback && <Section title="Retour de l’équipe Diaba" icon="chat"><p>{p.feedback}</p></Section>}
        {p.status === 'Complément demandé' && (
          <Section title="Compléter les informations" icon="edit">
            <Field id="tel2" label="Téléphone" type="tel" value={tel} onChange={setTel} placeholder="+86 …" />
            <button type="button" className="upload" onClick={() => setPhoto(true)}><Icon name={photo ? 'check' : 'camera'} size={26} />{photo ? 'Photo ajoutée' : 'Ajouter une photo de la devanture'}</button>
            <TextArea id="note" label="Message pour l’équipe (facultatif)" value={note} onChange={setNote} />
            <Button icon="send" onClick={() => api.complement(p.id, { tel: tel || p.tel, photos: p.photos + (photo ? 1 : 0) })}>Envoyer le complément</Button>
          </Section>
        )}
        {p.status === 'Publiée' && <Button to="/adresses/baiyun" icon="eye">Voir la fiche publiée</Button>}
        {p.status === 'Rattachée à une adresse existante' && <Button to="/adresses/baiyun" icon="link">Voir la fiche existante</Button>}
        {p.status === 'Refusée' && <Button to="/contributions/nouvelle/1" icon="plus" onClick={() => d({ t: 'draft', p: null })}>Proposer une autre adresse</Button>}
      </div>
    </Screen>
  );
}
