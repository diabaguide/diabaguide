import { useI18n } from '../../i18n';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../../store';
import { Button, Field, Icon, Tag, TextArea, useWide } from '../../ui';
import { AdminCard, AdminSheet, SheetActions } from './mobile';
import {
  basculerAnnonce, creerAnnonce, estVisible, fetchAnnoncesEquipe, modifierAnnonce, supprimerAnnonce,
  type Annonce, type AnnonceSaisie,
} from '../../lib/annonces';

/* ==================================================================== */
/* Annonces de services (équipe)                                        */
/*                                                                      */
/* L'équipe consulte toutes les annonces, inactives comprises. Seule    */
/* l'administration les rédige, les modifie, les active ou les          */
/* supprime : les écritures passent par les fonctions SQL admin_*       */
/* (voir supabase/annonces.sql), jamais directement par la table.       */
/* ==================================================================== */

const VIDE: AnnonceSaisie = { titre: '', texte: '', lienUrl: '', lienLibelle: '', actif: true, debutLe: '', finLe: '' };

const deAnnonce = (a: Annonce): AnnonceSaisie => ({
  titre: a.titre, texte: a.texte, lienUrl: a.lienUrl ?? '', lienLibelle: a.lienLibelle ?? '',
  actif: a.actif, debutLe: a.debutLe ?? '', finLe: a.finLe ?? '',
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

/* Formulaire d'une annonce : affiché dans la page sur ordinateur, dans la fiche
   plein écran sur téléphone (voir AdminAnnonces). `readOnly` pour l'équipe non
   administratrice : mêmes informations, sans aucune commande d'écriture.
   `prefix` distingue les identifiants de champs de deux formulaires affichés
   en même temps (création et modification). */
function AnnonceForm({ prefix, e, set, busy, readOnly, onSave, onCancel }: {
  prefix: string; e: AnnonceSaisie; set: (a: AnnonceSaisie) => void; busy: boolean;
  readOnly: boolean; onSave: () => void; onCancel: () => void;
}) {
  const { tr } = useI18n();
  return (
    <>
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`${prefix}-titre`} label={tr("Titre")} value={e.titre}
          onChange={(v) => set({ ...e, titre: v })} req placeholder={tr("Fret Chine → Sénégal, chaque semaine")} /></div>
      </div>
      <TextArea id={`${prefix}-texte`} label={tr("Texte de l’annonce")} value={e.texte} rows={4}
        onChange={(v) => set({ ...e, texte: v })} placeholder={tr("Nous regroupons vos colis à Guangzhou et Shenzhen, puis nous livrons à Dakar.")} />
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`${prefix}-url`} label={tr("Lien d’action (facultatif)")} value={e.lienUrl}
          onChange={(v) => set({ ...e, lienUrl: v })} placeholder="https://www.diabaguide.com" /></div>
        <div className="grow"><Field id={`${prefix}-libelle`} label={tr("Libellé du bouton")} value={e.lienLibelle}
          onChange={(v) => set({ ...e, lienLibelle: v })} placeholder={tr("Voir le fret")} /></div>
      </div>
      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 15, padding: 0 }}>{tr("Période d’affichage (facultative)")}</legend>
        <div className="filters" style={{ alignItems: 'flex-end' }}>
          <div className="grow"><Field id={`${prefix}-du`} label={tr("Du")} type="date" value={e.debutLe} onChange={(v) => set({ ...e, debutLe: v })} /></div>
          <div className="grow"><Field id={`${prefix}-au`} label={tr("Au")} type="date" value={e.finLe} onChange={(v) => set({ ...e, finLe: v })} /></div>
        </div>
        <label className="check">
          <input type="checkbox" checked={e.actif} onChange={(ev) => set({ ...e, actif: ev.target.checked })} />
          <span>{tr("Annonce active : visible des voyageurs pendant la période")}</span>
        </label>
      </fieldset>
      {!readOnly && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button full={false} icon="check" onClick={onSave} disabled={busy}>{tr("Enregistrer")}</Button>
          <Button kind="s" full={false} onClick={onCancel}>{tr("Annuler")}</Button>
        </div>
      )}
    </>
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
    if (res.error) { setErr(res.error); return; }
    setOk(`Annonce « ${e.titre.trim()} » créée.`);
    setNouvelle(null);
    await recharger();
  };

  const enregistrer = async (id: string, e: AnnonceSaisie, fermer?: () => void) => {
    reset();
    if (!e.titre.trim() || !e.texte.trim()) { setErr("Renseignez le titre et le texte de l’annonce."); return; }
    setBusy(true);
    const res = await modifierAnnonce(id, e);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
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

  const supprimer = async (a: Annonce) => {
    reset();
    const res = await supprimerAnnonce(a.id);
    if (res.error) { setErr(res.error); return; }
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

        {admin && (
          <Card title={tr("Rédiger une annonce")}>
            {nouvelle ? (
              <div className="stack" style={{ gap: 14 }}>
                <AnnonceForm prefix="nouvelle" e={nouvelle} set={setNouvelle} busy={busy} readOnly={false}
                  onSave={() => creer(nouvelle)} onCancel={() => { reset(); setNouvelle(null); }} />
              </div>
            ) : (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Button full={false} icon="plus" onClick={() => { reset(); setNouvelle(VIDE); }}>{tr("Nouvelle annonce")}</Button>
                <span className="small muted">{tr("Titre, texte, lien facultatif, période facultative.")}</span>
              </div>
            )}
          </Card>
        )}

        <section className="card stack" style={{ gap: 14 }}>
          <div className="row" style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Toutes les annonces")}</h2>
            <span className="small muted">{tr(`${visibles} visible(s) des voyageurs sur ${annonces.length}`)}</span>
          </div>

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
                onCancel={() => setEdit(null)} />
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
                    onCancel={() => setEdit(null)} />
                  <SheetActions>
                    <Button kind="s" icon={a.actif ? 'eye' : 'check'} full={false} disabled={busy}
                      onClick={() => { const c = a; setEdit(null); void basculer(c); }}>
                      {tr(a.actif ? 'Désactiver' : 'Activer')}
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