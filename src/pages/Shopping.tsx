import { useI18n } from '../i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { cityName } from '../data';
import { useStore } from '../store';
import { Button, Field, Icon, Screen, TopBar } from '../ui';
import {
  addItem, createList, deleteItem, deleteList, fetchList, fetchLists, listText, toggleItem,
  updateItem, updateList, whatsappUrl, type ShoppingItem, type ShoppingList,
} from '../lib/shopping';

const jour = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/* ==================================================================== */
/* Mes listes d'achats                                                   */
/* ==================================================================== */
export function ShoppingLists() {
  const { tr } = useI18n();
  const { s } = useStore();
  const nav = useNavigate();
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => { setLists(await fetchLists()); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setBusy(true); setErr(null);
    const res = await createList(title.trim() || `Liste du ${jour()}`, s.city);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    nav(`/liste-achats/${res.id}`);
  };

  return (
    <Screen>
      <TopBar title={tr("Ma liste d'achats")} back="/accueil" />
      <div className="main" style={{ gap: 14 }}>
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}

        <div className="card stack" style={{ gap: 12 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Nouvelle liste")}</h2>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("Composez la liste avant de partir, cochez sur place chez le fournisseur, puis partagez-la par WhatsApp ou en PDF.")}
          </p>
          <Field id="nl-title" label={tr("Nom de la liste")} value={title} onChange={setTitle} placeholder={tr("Voyage de novembre")} />
          <Button icon="plus" onClick={create} disabled={busy}>{tr(busy ? 'Création…' : 'Créer la liste')}</Button>
        </div>

        {loading ? <p className="muted" role="status">{tr("Chargement…")}</p>
          : lists.length === 0 ? (
            <div className="center-screen">
              <span className="bigcheck" style={{ width: 88, height: 88, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}>
                <Icon name="list" size={44} sw={1.6} />
              </span>
              <div className="display" style={{ fontSize: 24 }}>{tr("Aucune liste pour le moment")}</div>
              <div className="muted">{tr("Créez votre première liste, puis ajoutez-y les produits à acheter depuis une fiche ou depuis la liste.")}</div>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {lists.map((l) => (
                <Link key={l.id} className="listrow" to={`/liste-achats/${l.id}`}>
                  <Icon name="list" />
                  <div className="grow">
                    <div style={{ fontWeight: 600 }}>{l.title}</div>
                    <div className="small muted">
                      {l.count === 0 ? tr("Liste vide") : `${l.done}/${l.count} ${tr("acheté(s)")}`}
                      {l.city ? ` · ${tr(cityName(l.city as never))}` : ''}
                    </div>
                  </div>
                  <Icon name="chevR" size={20} />
                </Link>
              ))}
            </div>
          )}
        <p className="small muted">{tr("Vos listes sont privées : elles ne sont visibles que par vous (l’équipe Diaba y accède seulement en cas de support).")}</p>
      </div>
    </Screen>
  );
}

/* ==================================================================== */
/* Une liste : ajout, cochage, partage, impression                       */
/* ==================================================================== */
export function ShoppingListPage() {
  const { tr } = useI18n();
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { s } = useStore();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: '', qty: '', price: '', note: '' });
  const [editTitle, setEditTitle] = useState(false);
  const [title, setTitle] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchList(id);
    if (res.error) { setErr(res.error); setLoading(false); return; }
    setList(res.list ?? null);
    setTitle(res.list?.title ?? '');
    setItems(res.items);
    setLoading(false);
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const ficheName = useMemo(() => {
    const map = new Map(s.providers.map((p) => [p.id, p.name]));
    return (pid: string) => map.get(pid);
  }, [s.providers]);

  const already = (pid: string) => items.some((i) => i.providerId === pid && !i.done);
  const reste = items.filter((i) => !i.done).length;

  const add = async () => {
    if (!label.trim()) { setErr('Indiquez le produit à acheter.'); return; }
    setBusy(true); setErr(null);
    const res = await addItem(id, { label, qty, price });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setLabel(''); setQty(''); setPrice('');
    await load();
  };

  const saveItem = async () => {
    if (!editing) return;
    setBusy(true);
    const res = await updateItem(editing, draft);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEditing(null);
    await load();
  };

  const copier = async () => {
    if (!list) return;
    const texte = listText(list, items, ficheName);
    try {
      await navigator.clipboard.writeText(texte);
      setOk('Liste copiée : collez-la dans WhatsApp ou WeChat.');
    } catch {
      setErr('Copie impossible : sélectionnez le texte de la liste.');
    }
  };

  const renommer = async () => {
    setBusy(true);
    const res = await updateList(id, { title: title.trim() || list?.title });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEditTitle(false);
    await load();
  };

  const supprimer = async () => {
    setBusy(true);
    const res = await deleteList(id);
    setBusy(false);
    if (res.error) { setErr(res.error); setConfirmDel(false); return; }
    nav('/liste-achats');
  };

  if (loading) return <Screen><TopBar title={tr("Liste d'achats")} back="/liste-achats" /><div className="main"><p className="muted" role="status">{tr("Chargement…")}</p></div></Screen>;
  if (!list) {
    return (
      <Screen>
        <TopBar title={tr("Liste d'achats")} back="/liste-achats" />
        <div className="main">
          <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err ?? 'Cette liste est introuvable.')}</span></div>
          <Button to="/liste-achats" icon="list">{tr("Voir mes listes")}</Button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title={list.title} back="/liste-achats" />
      <div className="main" style={{ gap: 14 }}>

        <div className="no-print">
          {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
          {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr(ok)}</span></div>}

          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            <span className="small muted">
              {items.length === 0 ? tr("Liste vide") : `${reste} ${tr("à acheter")} · ${items.length - reste}/${items.length} ${tr("acheté(s)")}`}
              {list.city ? ` · ${tr(cityName(list.city as never))}` : ''}
            </span>
            <button type="button" className="linklike" onClick={() => setEditTitle(!editTitle)}>
              <strong>{tr(editTitle ? 'Annuler' : 'Renommer')}</strong>
            </button>
          </div>

          {editTitle && (
            <div className="card stack" style={{ gap: 10, marginBottom: 12 }}>
              <Field id="lt" label={tr("Nom de la liste")} value={title} onChange={setTitle} />
              <Button icon="check" full={false} onClick={renommer} disabled={busy}>{tr("Enregistrer le nom")}</Button>
            </div>
          )}

          <div className="card stack" style={{ gap: 10 }}>
            <Field id="it-label" label={tr("Produit à acheter")} value={label} onChange={setLabel} placeholder={tr("Cartons de chaussures")} />
            <div className="grid2" style={{ gap: 10 }}>
              <Field id="it-qty" label={tr("Quantité")} value={qty} onChange={setQty} placeholder={tr("2 cartons")} />
              <Field id="it-price" label={tr("Prix visé")} value={price} onChange={setPrice} placeholder={tr("18 ¥ la paire")} />
            </div>
            <Button icon="plus" onClick={add} disabled={busy}>{tr(busy ? 'Ajout…' : 'Ajouter à la liste')}</Button>
          </div>

          {items.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>{tr("Aucun produit pour le moment. Ajoutez une ligne ci-dessus, ou depuis la fiche d’un fournisseur.")}</p>
          ) : (
            <div className="stack" style={{ gap: 8, marginTop: 12 }}>
              {items.map((i) => (
                <div key={i.id} className="card" style={{ padding: 12 }}>
                  {editing === i.id ? (
                    <div className="stack" style={{ gap: 10 }}>
                      <Field id={`e-l-${i.id}`} label={tr("Produit")} value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} />
                      <div className="grid2" style={{ gap: 10 }}>
                        <Field id={`e-q-${i.id}`} label={tr("Quantité")} value={draft.qty} onChange={(v) => setDraft({ ...draft, qty: v })} />
                        <Field id={`e-p-${i.id}`} label={tr("Prix visé")} value={draft.price} onChange={(v) => setDraft({ ...draft, price: v })} />
                      </div>
                      <Field id={`e-n-${i.id}`} label={tr("Note")} value={draft.note} onChange={(v) => setDraft({ ...draft, note: v })} />
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <Button icon="check" full={false} onClick={saveItem} disabled={busy}>{tr("Enregistrer")}</Button>
                        <Button kind="s" full={false} onClick={() => setEditing(null)}>{tr("Annuler")}</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
                      <input type="checkbox" style={{ width: 22, height: 22, marginTop: 2, accentColor: 'var(--primary)' }}
                        checked={i.done} aria-label={`${tr("Acheté :")} ${i.label}`}
                        onChange={async () => { await toggleItem(i.id, !i.done); await load(); }} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, textDecoration: i.done ? 'line-through' : 'none', opacity: i.done ? 0.6 : 1 }}>{i.label}</div>
                        <div className="small muted">
                          {[i.qty, i.price, i.note].filter(Boolean).join(' · ')}
                          {i.providerId && ficheName(i.providerId) && (
                            <> · <Link className="link" to={`/adresses/${i.providerId}`}>{tr("chez")} {ficheName(i.providerId)}</Link></>
                          )}
                        </div>
                      </div>
                      <span className="row" style={{ gap: 4 }}>
                        <button type="button" className="iconbtn" aria-label={`${tr("Modifier")} ${i.label}`}
                          onClick={() => { setEditing(i.id); setDraft({ label: i.label, qty: i.qty, price: i.price, note: i.note }); }}>
                          <Icon name="edit" size={20} sw={1.9} />
                        </button>
                        <button type="button" className="iconbtn" aria-label={`${tr("Supprimer")} ${i.label}`}
                          onClick={async () => { await deleteItem(i.id); await load(); }}>
                          <Icon name="trash" size={20} sw={1.9} />
                        </button>
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="card stack" style={{ gap: 10, marginTop: 14 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>{tr("Partager la liste")}</h2>
            <p className="small muted" style={{ margin: 0 }}>{tr("Envoyez la liste à votre associé, ou gardez-la en PDF pour le voyage.")}</p>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <Button kind="g" icon="chat" full={false} href={whatsappUrl(listText(list, items, ficheName))}>{tr("WhatsApp")}</Button>
              <Button kind="s" icon="copy" full={false} onClick={copier}>{tr("Copier le texte")}</Button>
              <Button kind="s" icon="download" full={false} onClick={() => window.print()}>{tr("Imprimer ou PDF")}</Button>
            </div>
          </div>

          <div className="card stack" style={{ gap: 10 }}>
            {confirmDel ? (
              <>
                <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr("Supprimer cette liste et tous ses produits ? Cette action est irréversible.")}</span></div>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                  <Button kind="d" icon="trash" full={false} onClick={supprimer} disabled={busy}>{tr("Supprimer définitivement")}</Button>
                  <Button kind="s" full={false} onClick={() => setConfirmDel(false)}>{tr("Annuler")}</Button>
                </div>
              </>
            ) : <Button kind="d" icon="trash" full={false} onClick={() => setConfirmDel(true)}>{tr("Supprimer la liste")}</Button>}
          </div>
        </div>

        {/* Version imprimable : c'est elle qui part en PDF. */}
        <div className="print-only">
          <h1>{list.title}</h1>
          <p>{[list.city ? cityName(list.city as never) : '', jour()].filter(Boolean).join(' · ')}</p>
          <table>
            <thead><tr><th>{tr("Acheté")}</th><th>{tr("Produit")}</th><th>{tr("Quantité")}</th><th>{tr("Prix visé")}</th><th>{tr("Fournisseur")}</th></tr></thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.done ? '☑' : '☐'}</td>
                  <td className={i.done ? 'bought' : ''}>{i.label}</td>
                  <td>{i.qty}</td>
                  <td>{i.price}</td>
                  <td>{i.providerId ? ficheName(i.providerId) ?? '' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">{tr("Liste préparée sur Diaba Guide — www.diabaguide.com")}</p>
        </div>
      </div>
    </Screen>
  );
}

/* ==================================================================== */
/* Depuis une fiche : ajouter le fournisseur à une liste                 */
/* ==================================================================== */
export function AddToListButton({ providerId, providerName }: { providerId: string; providerName: string }) {
  const { tr } = useI18n();
  const { s } = useStore();
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [chosen, setChosen] = useState('');
  const [label, setLabel] = useState(providerName);
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const ouvrir = async () => {
    setOpen(true); setDone(null); setErr(null);
    const l = await fetchLists();
    setLists(l);
    setChosen(l.length > 0 ? l[0].id : 'new');
  };

  const valider = async () => {
    setBusy(true); setErr(null);
    let listId = chosen;
    if (chosen === 'new') {
      const c = await createList(`Liste du ${jour()}`, s.city);
      if (c.error || !c.id) { setBusy(false); setErr(c.error ?? 'Création impossible.'); return; }
      listId = c.id;
    }
    const res = await addItem(listId, { label, qty, price, providerId });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setDone(listId);
    setQty(''); setPrice('');
  };

  return (
    <>
      <Button kind="s" icon="list" onClick={ouvrir}>{tr("Ajouter à ma liste d'achats")}</Button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={tr("Ajouter à ma liste d'achats")} onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name="list" size={24} /></span><h2>{tr("Ajouter à ma liste d'achats")}</h2></div>
            {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
            {done ? (
              <>
                <p>{tr("Produit ajouté à votre liste, avec le fournisseur")} <strong>{providerName}</strong>.</p>
                <div className="actions">
                  <Button kind="s" full={false} onClick={() => setOpen(false)}>{tr("Fermer")}</Button>
                  <Button kind="p" icon="list" full={false} to={`/liste-achats/${done}`}>{tr("Ouvrir ma liste")}</Button>
                </div>
              </>
            ) : (
              <>
                <Field id="al-label" label={tr("Produit à acheter")} value={label} onChange={setLabel} req />
                <div className="grid2" style={{ gap: 10 }}>
                  <Field id="al-qty" label={tr("Quantité")} value={qty} onChange={setQty} placeholder={tr("2 cartons")} />
                  <Field id="al-price" label={tr("Prix visé")} value={price} onChange={setPrice} />
                </div>
                <div className="field">
                  <label htmlFor="al-list">{tr("Dans quelle liste ?")}</label>
                  <select id="al-list" value={chosen} onChange={(e) => setChosen(e.target.value)}>
                    {lists.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
                    <option value="new">{tr("Nouvelle liste")}</option>
                  </select>
                </div>
                <div className="actions">
                  <Button kind="s" full={false} onClick={() => setOpen(false)}>{tr("Annuler")}</Button>
                  <Button icon="plus" full={false} onClick={valider} disabled={busy || !label.trim()}>{tr(busy ? 'Ajout…' : 'Ajouter')}</Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
