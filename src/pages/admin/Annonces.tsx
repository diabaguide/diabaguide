import { useI18n } from '../../i18n';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../../store';
import { Button, Field, Icon, Tag, TextArea, useWide } from '../../ui';
import { compressImage } from '../../lib/image';
import { removePhoto, uploadPhoto } from '../../lib/photos';
import { AnnonceImage, lienSur } from '../Annonces';
import { AdminCard, AdminSheet, SheetActions } from './mobile';
import {
  basculerAnnonce, creerAnnonce, definirContactEquipe, estVisible, fetchAnnoncesEquipe, fetchContactEquipe, modifierAnnonce, supprimerAnnonce,
  type Annonce, type AnnonceSaisie,
} from '../../lib/annonces';

/* ==================================================================== */
/* Annonces de services (équipe)                                        */
/*                                                                      */
/* L'équipe consulte toutes les annonces, inactives comprises. Seule    */
/* l'administration les rédige, les modifie, les active ou les          */
/* supprime : les écritures passent par les fonctions SQL admin_*       */
/* (voir supabase/230_annonces.sql), jamais directement par la table.       */
/* ==================================================================== */

const VIDE: AnnonceSaisie = { titre: '', texte: '', lienUrl: '', lienLibelle: '', actif: true, debutLe: '', finLe: '', imagePath: '' };

const deAnnonce = (a: Annonce): AnnonceSaisie => ({
  titre: a.titre, texte: a.texte, lienUrl: a.lienUrl ?? '', lienLibelle: a.lienLibelle ?? '',
  actif: a.actif, debutLe: a.debutLe ?? '', finLe: a.finLe ?? '', imagePath: a.imagePath ?? '',
});

/** 2026-09-24 -> 24/09/2026 (lisible, sans dépendre de la locale du navigateur). */
const dateCourte = (d: string) => d.split('-').reverse().join('/');

/** « du 24/09/2026 au 24/10/2026 », ou la seule borne connue. */
function periode(a: Annonce, tr: (s: string) => string): string {
  if (a.debutLe && a.finLe) return `${tr("du")} ${dateCourte(a.debutLe)} ${tr("au")} ${dateCourte(a.finLe)}`;
  if (a.debutLe) return `${tr("à partir du")} ${dateCourte(a.debutLe)}`;
  if (a.finLe) return `${tr("jusqu’au")} ${dateCourte(a.finLe)}`;
  return tr("sans limite de date");
}

function Head({ title, sub }: { title: string; sub: string }) {
  const { tr } = useI18n();
  return <header className="admin-head"><div><h1>{tr(title)}</h1><div className="muted" style={{ marginTop: 4 }}>{tr(sub)}</div></div></header>;
}

function Msg({ err, ok }: { err: string | null; ok: string | null }) {
  const { tr } = useI18n();
  return (
    <>
      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
      {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}
    </>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => {
  const { tr } = useI18n();
  return (
    <section className="card stack" style={{ gap: 14 }}>
      <h2 style={{ fontSize: 17, margin: 0 }}>{tr(title)}</h2>
      {children}
    </section>
  );
};

/** Ce que le voyageur verra : active et dans sa période, sinon pourquoi il ne voit rien. */
function Etat({ a }: { a: Annonce }) {
  const { tr } = useI18n();
  if (estVisible(a)) return <Tag tone="ok" icon="eye">{tr("Visible")}</Tag>;
  if (!a.actif) return <Tag tone="muted" icon="eye">{tr("Inactive")}</Tag>;
  return <Tag tone="warn" icon="clock">{tr("Hors période")}</Tag>;
}

/** Image de l'annonce : aperçu, « Choisir / Changer » et « Retirer ». L'image est réduite puis envoyée tout de suite ;
    `onChange` reçoit le nouveau chemin ('' = aucune). Sans Supabase (démonstration), elle reste dans le navigateur. */
function ImageAnnonce({ path, onChange, onUploaded, onError }: {
  path: string; onChange: (path: string) => void; onUploaded: (path: string) => void; onError: (msg: string) => void;
}) {
  const { tr } = useI18n();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const choisir = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const img = await compressImage(file, 1280, 0.82);
      const up = await uploadPhoto(img, 'annonces-photos');
      if (up.error) onError(up.error);
      else if (up.path) { onUploaded(up.path); onChange(up.path); }
      else onChange(await new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => ko(r.error); r.readAsDataURL(img); }));
    } catch (e) { onError((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <span style={{ fontWeight: 600, fontSize: 15 }}>{tr("Image (facultative)")}</span>
      <div style={{ maxWidth: 420 }}><AnnonceImage path={path || null} /></div>
      <input ref={ref} type="file" accept="image/*" className="sr" aria-label={tr("Image de l’annonce")}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void choisir(f); }} />
      <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button kind="s" icon="image" full={false} disabled={busy} onClick={() => ref.current?.click()}>
          {tr(busy ? 'Préparation de l’image…' : path ? 'Changer l’image' : 'Choisir une image')}
        </Button>
        {path && <Button kind="t" icon="x" full={false} disabled={busy} onClick={() => onChange('')}>{tr("Retirer l’image")}</Button>}
      </span>
      <span className="small muted">{tr("Format paysage conseillé (16:9). Elle s’affiche en haut de la carte et de la page de l’annonce.")}</span>
    </div>
  );
}

/* Formulaire d'une annonce : affiché dans la page sur ordinateur, dans la fiche
   plein écran sur téléphone (voir AdminAnnonces). `readOnly` pour l'équipe non
   administratrice : mêmes informations, sans aucune commande d'écriture.
   `prefix` distingue les identifiants de champs de deux formulaires affichés
   en même temps (création et modification). */
function AnnonceForm({ prefix, e, set, busy, readOnly, onSave, onCancel, onUploaded, onError }: {
  prefix: string; e: AnnonceSaisie; set: (a: AnnonceSaisie) => void; busy: boolean;
  readOnly: boolean; onSave: () => void; onCancel: () => void;
  onUploaded: (path: string) => void; onError: (msg: string) => void;
}) {
  const { tr } = useI18n();
  const lienInvalide = e.lienUrl.trim() !== '' && !lienSur(e.lienUrl);
  return (
    <>
      <Field id={`${prefix}-titre`} label={tr("Titre de l’annonce")} value={e.titre}
        onChange={(v) => set({ ...e, titre: v })} req placeholder={tr("Fret Chine → Sénégal, chaque semaine")} />
      <TextArea id={`${prefix}-texte`} label={tr("Description")} value={e.texte} rows={5}
        onChange={(v) => set({ ...e, texte: v })} placeholder={tr("Nous regroupons vos colis à Guangzhou et Shenzhen, puis nous livrons à Dakar.")} />
      <ImageAnnonce path={e.imagePath} onChange={(p) => set({ ...e, imagePath: p })} onUploaded={onUploaded} onError={onError} />
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`${prefix}-url`} label={tr("Lien (URL)")} value={e.lienUrl} type="url"
          onChange={(v) => set({ ...e, lienUrl: v })} placeholder="https://www.diabaguide.com"
          error={lienInvalide ? tr('Le lien doit commencer par https://') : null} /></div>
        <div className="grow"><Field id={`${prefix}-libelle`} label={tr("Libellé du bouton du lien (facultatif)")} value={e.lienLibelle}
          onChange={(v) => set({ ...e, lienLibelle: v })} placeholder={tr("En savoir plus")} /></div>
      </div>
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`${prefix}-du`} label={tr("Date de début de publication")} type="date" value={e.debutLe} onChange={(v) => set({ ...e, debutLe: v })} /></div>
        <div className="grow"><Field id={`${prefix}-au`} label={tr("Date de fin de publication")} type="date" value={e.finLe} onChange={(v) => set({ ...e, finLe: v })}
          error={e.debutLe && e.finLe && e.finLe < e.debutLe ? tr('La fin précède le début.') : null} /></div>
      </div>
      <label className="check">
        <input type="checkbox" checked={e.actif} onChange={(ev) => set({ ...e, actif: ev.target.checked })} />
        <span>{tr("Activer l’annonce (visible des voyageurs pendant la période)")}</span>
      </label>
      {!readOnly && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button full={false} icon="check" onClick={onSave} disabled={busy || lienInvalide}>{tr("Enregistrer")}</Button>
          <Button kind="s" full={false} onClick={onCancel}>{tr("Annuler")}</Button>
        </div>
      )}
    </>
  );
}

/** Numéro WhatsApp de l'équipe : le bouton « Contacter l'équipe Diaba Guide » des annonces y mène. */
function ContactEquipe({ setErr, setOk }: { setErr: (m: string | null) => void; setOk: (m: string | null) => void }) {
  const { tr } = useI18n();
  const [numero, setNumero] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetchContactEquipe().then((n) => { if (live) { setNumero(n ?? ''); setSaved(n ?? ''); } });
    return () => { live = false; };
  }, []);
  const enregistrer = async () => {
    setErr(null); setOk(null); setBusy(true);
    const res = await definirContactEquipe(numero);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setSaved(res.numero ?? ''); setNumero(res.numero ?? '');
    setOk(res.numero ? 'Contact de l’équipe enregistré.' : 'Contact de l’équipe retiré : le bouton de contact des annonces ne s’affiche plus.');
  };
  return (
    <Card title={tr("Contact de l’équipe")}>
      <p className="small muted" style={{ margin: 0 }}>{tr("Le bouton « Contacter l’équipe Diaba Guide » de chaque annonce ouvre WhatsApp sur ce numéro, avec un message déjà rédigé.")}</p>
      <Field id="contact-wa" label={tr("Numéro WhatsApp de l’équipe")} type="tel" value={numero} onChange={setNumero} placeholder="+221 77 123 45 67"
        hint={tr("Avec l’indicatif du pays. Laissez vide pour retirer le bouton.")} />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button full={false} icon="check" onClick={() => void enregistrer()} disabled={busy || saved === null || numero.replace(/\D/g, '') === (saved ?? '')}>{tr(busy ? 'Enregistrement…' : 'Enregistrer le contact')}</Button>
      </div>
    </Card>
  );
}

export function AdminAnnonces() {
  const { tr } = useI18n();
  const { s } = useStore();
  const wide = useWide();
  const admin = s.user?.role === 'admin';
  const [annonces, setAnnonces] = useState<Annonce[]>([]);
  const [charge, setCharge] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nouvelle, setNouvelle] = useState<AnnonceSaisie | null>(null);
  const [edit, setEdit] = useState<{ id: string; e: AnnonceSaisie } | null>(null);
  // Images envoyées pendant la saisie : celles qui ne sont pas retenues à l'enregistrement sont supprimées.
  const envoyees = useRef<Set<string>>(new Set());
  const nettoyer = (garder: string | null) => {
    for (const p of envoyees.current) if (p !== garder) void removePhoto(p, 'annonces-photos');
    envoyees.current.clear();
  };

  const recharger = useCallback(async () => {
    setAnnonces(await fetchAnnoncesEquipe());
    setCharge(true);
  }, []);

  useEffect(() => { void recharger(); }, [recharger]);

  const reset = () => { setErr(null); setOk(null); };

  const creer = async (e: AnnonceSaisie) => {
    reset();
    if (!e.titre.trim() || !e.texte.trim()) { setErr("Renseignez le titre et le texte de l’annonce."); return; }
    setBusy(true);
    const res = await creerAnnonce(e);
    setBusy(false);
    if (res.error) { setErr(res.error); if (!res.id) return; }
    nettoyer(e.imagePath || null);
    if (!res.error) setOk(`Annonce « ${e.titre.trim()} » créée.`);
    setNouvelle(null);
    await recharger();
  };

  const enregistrer = async (id: string, e: AnnonceSaisie, fermer?: () => void) => {
    reset();
    if (!e.titre.trim() || !e.texte.trim()) { setErr("Renseignez le titre et le texte de l’annonce."); return; }
    setBusy(true);
    const avant = annonces.find((x) => x.id === id)?.imagePath ?? null;
    const res = await modifierAnnonce(id, e, avant);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    nettoyer(e.imagePath || null);
    setOk(`Annonce « ${e.titre.trim()} » enregistrée.`);
    fermer?.();
    await recharger();
  };

  const basculer = async (a: Annonce) => {
    reset();
    const res = await basculerAnnonce(a);
    if (res.error) { setErr(res.error); return; }
    setOk(`Annonce « ${a.titre} » ${a.actif ? 'désactivée' : 'activée'}.`);
    await recharger();
  };

  /** Change l'annonce affichée sur le tableau de bord : celle-ci est activée, toutes les autres sont désactivées. */
  const publierSeule = async (a: Annonce) => {
    reset();
    setBusy(true);
    const autres = annonces.filter((x) => x.id !== a.id && x.actif);
    for (const x of autres) {
      const res = await basculerAnnonce(x);
      if (res.error) { setBusy(false); setErr(res.error); await recharger(); return; }
    }
    if (!a.actif) {
      const res = await basculerAnnonce(a);
      if (res.error) { setBusy(false); setErr(res.error); await recharger(); return; }
    }
    setBusy(false);
    const horsPeriode = !estVisible({ ...a, actif: true });
    if (horsPeriode) setErr(`Annonce « ${a.titre} » activée seule, mais sa période de publication est terminée ou n’a pas commencé : modifiez ses dates pour qu’elle apparaisse.`);
    else setOk(`Annonce « ${a.titre} » publiée seule sur le tableau de bord.${autres.length ? ` ${autres.length} autre(s) désactivée(s).` : ''}`);
    await recharger();
  };

  const supprimer = async (a: Annonce) => {
    reset();
    const res = await supprimerAnnonce(a.id);
    if (res.error) { setErr(res.error); return; }
    if (a.imagePath && !/^(data:|https?:)/i.test(a.imagePath)) void removePhoto(a.imagePath, 'annonces-photos');
    setOk(`Annonce « ${a.titre} » supprimée.`);
    await recharger();
  };

  const visibles = annonces.filter((a) => estVisible(a)).length;

  return (
    <>
      <Head title="Annonces" sub="Les annonces de services affichées sur le tableau de bord des voyageurs." />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />

        {!admin && (
          <div className="notice"><Icon name="info" size={20} /><span>
            {tr("La rédaction des annonces est réservée à l’administration. Vous pouvez les consulter ici, y compris celles qui ne sont pas visibles des voyageurs.")}</span></div>
        )}

        {admin && <ContactEquipe setErr={setErr} setOk={setOk} />}

        {admin && (
          <Card title={tr("Rédiger une annonce")}>
            {nouvelle ? (
              <div className="stack" style={{ gap: 14 }}>
                <AnnonceForm prefix="nouvelle" e={nouvelle} set={setNouvelle} busy={busy} readOnly={false}
                  onSave={() => creer(nouvelle)} onCancel={() => { reset(); nettoyer(null); setNouvelle(null); }}
                  onUploaded={(p) => envoyees.current.add(p)} onError={setErr} />
              </div>
            ) : (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button full={false} icon="plus" onClick={() => { reset(); setNouvelle(VIDE); }}>{tr("Nouvelle annonce")}</Button>
                <span className="small muted">{tr("Titre, description, image, lien, dates de publication.")}</span>
              </div>
            )}
          </Card>
        )}

        <section className="card stack" style={{ gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Toutes les annonces")}</h2>
            <span className="small muted">{tr(`${visibles} visible(s) des voyageurs sur ${annonces.length}`)}</span>
          </div>
          {admin && annonces.length > 1 && <p className="small muted" style={{ margin: 0 }}>{tr("Pour changer l’annonce du tableau de bord : « Publier seule » active l’annonce choisie et désactive les autres.")}</p>}

          {!charge ? (
            <p className="muted">{tr("Chargement…")}</p>
          ) : annonces.length === 0 ? (
            <p className="muted">{tr("Aucune annonce pour le moment.")}</p>
          ) : wide ? (
            <div className="table dense"><table>
              <thead><tr>
                <th>{tr("Annonce")}</th><th>{tr("Période")}</th><th>{tr("État")}</th><th>{tr("Auteur")}</th>
                {admin && <th>{tr("Actions")}</th>}
              </tr></thead>
              <tbody>
                {annonces.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{tr(a.titre)}</strong>
                      <div className="small muted">{tr(a.texte.slice(0, 90))}{a.texte.length > 90 ? '…' : ''}</div>
                      {a.lienUrl && <div className="small muted"><Icon name="link" size={14} /> {tr(a.lienLibelle ?? '')}</div>}
                    </td>
                    <td className="small muted">{periode(a, tr)}</td>
                    <td><Etat a={a} /></td>
                    <td className="small muted">{tr(a.auteur ?? '—')}</td>
                    {admin && (
                      <td>
                        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <Button kind="s" icon="edit" full={false}
                            onClick={() => setEdit(edit?.id === a.id ? null : { id: a.id, e: deAnnonce(a) })}>
                            {tr(edit?.id === a.id ? 'Fermer' : 'Modifier')}
                          </Button>
                          <Button kind="s" icon={a.actif ? 'eye' : 'check'} full={false} onClick={() => basculer(a)}>
                            {tr(a.actif ? 'Désactiver' : 'Activer')}
                          </Button>
                          {!(estVisible(a) && annonces.filter((x) => x.actif).length === 1) && (
                            <Button kind="s" icon="send" full={false} disabled={busy} onClick={() => publierSeule(a)}>{tr("Publier seule")}</Button>
                          )}
                          <Button kind="s" icon="trash" full={false} onClick={() => supprimer(a)}>{tr("Supprimer")}</Button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table></div>
          ) : (
            <div className="acards">
              {annonces.map((a) => (
                <AdminCard key={a.id} toneSeed={a.titre}
                  title={tr(a.titre)}
                  sub={`${periode(a, tr)} · ${tr(a.auteur ?? '—')}`}
                  badge={<Etat a={a} />}
                  onOpen={() => setEdit({ id: a.id, e: deAnnonce(a) })} />
              ))}
            </div>
          )}

          {/* Modification en place, sous la liste (ordinateur). */}
          {wide && admin && edit && (
            <Card title={tr("Modifier l’annonce")}>
              <AnnonceForm prefix={`edit-${edit.id}`} e={edit.e} set={(e) => setEdit({ ...edit, e })}
                busy={busy} readOnly={false}
                onSave={() => enregistrer(edit.id, edit.e, () => setEdit(null))}
                onCancel={() => { nettoyer(null); setEdit(null); }}
                onUploaded={(p) => envoyees.current.add(p)} onError={setErr} />
            </Card>
          )}
        </section>

        {/* Fiche plein écran sur téléphone. */}
        {!wide && edit && (() => {
          const a = annonces.find((x) => x.id === edit.id);
          if (!a) return null;
          return (
            <AdminSheet title={tr(a.titre)} sub={`${periode(a, tr)} · ${tr(a.auteur ?? '—')}`}
              onClose={() => setEdit(null)}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <Etat a={a} />
                {a.lienUrl && (
                  <a className="link small" href={a.lienUrl} target="_blank" rel="noreferrer">
                    <Icon name="link" size={16} /> {tr(a.lienLibelle ?? '')}
                  </a>
                )}
              </div>
              {admin ? (
                <div className="stack" style={{ gap: 14 }}>
                  <AnnonceForm prefix={`sheet-${edit.id}`} e={edit.e} set={(e) => setEdit({ ...edit, e })}
                    busy={busy} readOnly={false}
                    onSave={() => enregistrer(edit.id, edit.e, () => setEdit(null))}
                    onCancel={() => { nettoyer(null); setEdit(null); }}
                    onUploaded={(p) => envoyees.current.add(p)} onError={setErr} />
                  <SheetActions>
                    <Button kind="s" icon={a.actif ? 'eye' : 'check'} full={false} disabled={busy}
                      onClick={() => { const c = a; setEdit(null); void basculer(c); }}>
                      {tr(a.actif ? 'Désactiver' : 'Activer')}
                    </Button>
                    <Button kind="s" icon="send" full={false} disabled={busy}
                      onClick={() => { const c = a; setEdit(null); void publierSeule(c); }}>
                      {tr("Publier seule")}
                    </Button>
                    <Button kind="d" icon="trash" full={false}
                      onClick={() => { const c = a; setEdit(null); void supprimer(c); }}>
                      {tr("Supprimer l’annonce")}
                    </Button>
                  </SheetActions>
                </div>
              ) : (
                <p className="small muted" style={{ margin: 0, whiteSpace: 'pre-line' }}>{tr(a.texte)}</p>
              )}
            </AdminSheet>
          );
        })()}
      </div>
    </>
  );
}