import { useI18n } from '../../i18n';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { catLabel, cityName, type Cat, type City, type Freight, type Provider } from '../../data';
import { useStore } from '../../store';
import { newProviderId, validateProvider } from '../../lib/providers';
import { Button, DemoNote, Field, Icon, Section, Select, StoredPhoto, TextArea, useWide } from '../../ui';
import { FilePick, MAX_PHOTOS } from '../Contribute';
import { SortTh, compare, useSort } from './tableSort';
import { AdminCard, AdminSheet, SheetActions } from './mobile';

/* Gestion des fiches par l'équipe : ajout, modification, demande de suppression.
   La suppression définitive est validée par l'administrateur (page « Suppressions »). */

const Head = ({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) => {
  const { tr } = useI18n();
  return <header className="admin-head"><div><h1>{tr(title)}</h1><div className="muted" style={{ marginTop: 4 }}>{tr(sub)}</div></div>{right}</header>;
};

const today = () => new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const shown = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function FichesList() {
  const { tr } = useI18n();
  const { s } = useStore();
  const wide = useWide();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [city, setCity] = useState<'' | City>('');
  const [cat, setCat] = useState<'' | Cat>('');
  const isAdmin = s.user?.role === 'admin';
  const { sort, toggle } = useSort<'name' | 'cat' | 'city' | 'verified'>({ k: 'name', dir: 1 });
  const match = (p: Provider) => (!city || p.city === city) && (!cat || p.cat === cat)
    && (!q || `${p.name} ${p.cn} ${p.tel ?? ''} ${p.wechat ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const rows = useMemo(() => s.providers.filter(match).sort((a, b) => {
    const v = (p: Provider) => (sort.k === 'cat' ? catLabel(p.cat) : sort.k === 'city' ? cityName(p.city) : sort.k === 'verified' ? (p.verified ?? '') : p.name).toLowerCase();
    return compare(v(a), v(b), sort.dir);
  }), [s.providers, s.categories, s.cities, city, cat, q, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = !!(city || cat || q);
  const pending = s.pendingDeletion.filter(match);
  return (
    <>
      <Head title="Fiches" sub={`${rows.length} fiche${rows.length > 1 ? 's' : ''} publiée${rows.length > 1 ? 's' : ''}. Ajoutez, modifiez ou demandez la suppression d’une fiche.`}
        right={<Button to="/equipe/fiches/nouvelle" icon="plus" full={false}>{tr("Nouvelle fiche")}</Button>} />
      <div className="admin-body">
        <div className="filters sticky">
          <Select id="fv" label={tr("Ville")} value={city} onChange={setCity} options={[{ v: '', l: 'Toutes' }, ...s.cities.map((c) => ({ v: c.id as City, l: c.name }))]} />
          <Select id="fc" label={tr("Catégorie")} value={cat} onChange={setCat} options={[{ v: '', l: 'Toutes' }, ...s.categories.map((c) => ({ v: c.id as Cat, l: c.label }))]} />
          <div className="grow"><Field id="fq" label={tr("Recherche")} type="search" value={q} onChange={setQ} placeholder={tr("Nom, téléphone, WeChat…")} /></div>
          {filtered && <Button kind="s" icon="x" full={false} onClick={() => { setCity(''); setCat(''); setQ(''); }}>{tr("Réinitialiser")}</Button>}
        </div>
        {wide ? (
        <div className="table dense"><table>
          <thead><tr><th className="thumb" />
            <SortTh k="name" label="Fiche" sort={sort} onSort={toggle} /><SortTh k="cat" label="Catégorie" sort={sort} onSort={toggle} /><SortTh k="city" label="Ville" sort={sort} onSort={toggle} /><SortTh k="verified" label="Vérifiée le" sort={sort} onSort={toggle} /><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={48} w={48} round={8} /></td>
                <td><strong>{p.name}</strong>{p.featured && <Icon name="star" size={15} fill="var(--gold-fill)" sw={0} />}<div className="small muted zh">{p.cn}</div></td>
                <td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td><td>{p.verified || '—'}</td>
                <td><Link className="link" to={`/equipe/fiches/${p.id}`}>{tr("Modifier")}<Icon name="chevR" size={18} sw={2.4} /></Link></td>
              </tr>
            ))}
            {pending.map((p) => (
              <tr key={p.id} style={{ opacity: 0.75 }}>
                <td className="thumb" />
                <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td>
                <td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td>
                <td colSpan={2}><span className="row" style={{ gap: 6, fontWeight: 600, color: '#8A4310' }}><Icon name="clock" size={16} sw={2.2} />{tr(isAdmin ? 'Suppression à valider' : 'Suppression demandée : en attente de l’administrateur')}</span></td>
              </tr>
            ))}
            {rows.length + pending.length === 0 && <tr><td colSpan={6} className="center muted">{tr("Aucune fiche ne correspond aux filtres.")}</td></tr>}
          </tbody>
        </table></div>
        ) : rows.length + pending.length === 0 ? (
          <p className="muted">{tr("Aucune fiche ne correspond aux filtres.")}</p>
        ) : (
          <div className="acards">
            {rows.map((p) => (
              <AdminCard key={p.id} toneSeed={undefined}
                title={<>{p.name}{p.featured && <Icon name="star" size={15} fill="var(--gold-fill)" sw={0} />}</>}
                sub={<>{tr(catLabel(p.cat))} · {tr(cityName(p.city))}{p.verified ? ` · ${tr("vérifiée le")} ${p.verified}` : ''}</>}
                thumb={<span className="acard-thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={46} w={46} round={12} /></span>}
                onOpen={() => nav(`/equipe/fiches/${p.id}`)} />
            ))}
            {pending.map((p) => (
              <AdminCard key={p.id}
                title={p.name}
                sub={<>{tr(catLabel(p.cat))} · {tr(cityName(p.city))}</>}
                thumb={<span className="acard-thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={46} w={46} round={12} /></span>}
                badge={<span className="tag tag-warn"><Icon name="clock" size={15} sw={2.2} />{tr(isAdmin ? 'À valider' : 'Suppression demandée')}</span>}
                onOpen={() => nav(`/equipe/fiches/${p.id}`)} />
            ))}
          </div>
        )}
        <DemoNote />
      </div>
    </>
  );
}

type Dlg = null | 'request' | 'delete';

export function FicheEdit() {
  const { tr } = useI18n();
  const { id } = useParams();
  const { s, api } = useStore();
  const nav = useNavigate();
  const isNew = id === 'nouvelle';
  const isAdmin = s.user?.role === 'admin';
  const existing = s.providers.find((x) => x.id === id);
  const firstCity = s.cities.find((c) => c.active) ?? s.cities[0];
  const [p, setP] = useState<Provider | null>(() => existing ?? (isNew ? {
    id: '', name: '', cn: '', cat: (s.categories.find((c) => c.active) ?? s.categories[0]).id, city: firstCity.id, district: '',
    lat: firstCity.lat ?? 23.13, lng: firstCity.lng ?? 113.27, verified: today(), desc: '', addrCn: '', addrFr: '', productTags: [],
  } : null));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reason, setReason] = useState('');
  if (!p) return <Navigate to="/equipe/fiches" replace />;

  const set = (patch: Partial<Provider>) => { setP({ ...p, ...patch }); setSaved(false); };
  const cat = s.categories.find((c) => c.id === p.cat);
  const has = (f: string) => !!cat?.fields.includes(f as never);
  const vErr = validateProvider(p);
  const tags = s.productTags.filter((t) => t.categoryId === p.cat && t.active);
  const freight = (p.freight ?? []).slice().sort().join('+');

  const save = async () => {
    setTried(true);
    if (vErr) return;
    setBusy(true); setErr(null);
    const e = await api.saveProvider(isNew ? { ...p, id: newProviderId(p.name) } : p);
    setBusy(false);
    if (e) { setErr(e); return; }
    if (isNew) nav('/equipe/fiches'); else setSaved(true);
  };
  const remove = async () => {
    setBusy(true); setErr(null);
    const e = await (dlg === 'delete' ? api.removeProvider(p.id) : api.requestDeletion(p.id, reason.trim()));
    setBusy(false);
    if (e) { setErr(e); setDlg(null); return; }
    nav('/equipe/fiches');
  };
  const txt = (k: keyof Provider, label: string, extra?: { req?: boolean; hint?: string }) => (
    <Field id={k} label={tr(label)} value={(p[k] as string | undefined) ?? ''} onChange={(v) => set({ [k]: v } as Partial<Provider>)} req={extra?.req} hint={extra?.hint ? tr(extra.hint) : undefined} />
  );

  return (
    <>
      <Head title={isNew ? 'Nouvelle fiche' : p.name} sub={isNew ? 'Renseignez les informations de la nouvelle adresse.' : 'Modifier les informations de la fiche.'}
        right={<Button to="/equipe/fiches" kind="s" icon="chevL" full={false}>{tr("Retour à la liste")}</Button>} />
      <div className="admin-body edit-grid">
        <div className="stack" style={{ gap: 20 }}>
          <Section title="Informations" icon="edit">
            {tried && vErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(vErr)}</span></div>}
            <div className="form2">
              <Select id="cat" label={tr("Catégorie")} req value={p.cat} onChange={(v) => set({ cat: v as Cat, productTags: [] })} options={s.categories.filter((c) => c.active || c.id === p.cat).map((c) => ({ v: c.id as Cat, l: c.label }))} />
              <Select id="city" label={tr("Ville")} req value={p.city} onChange={(v) => set({ city: v as City })} options={s.cities.filter((c) => c.active || c.id === p.city).map((c) => ({ v: c.id as City, l: c.name }))} />
            </div>
            <div className="form2">{txt('name', 'Nom commercial', { req: true })}{txt('cn', 'Nom en chinois', { req: true })}</div>
            <div className="form2">{txt('district', 'Quartier ou district', { req: true })}{txt('metro', 'Station de métro proche')}</div>
            <div className="form2">{txt('addrCn', 'Adresse en chinois')}{txt('addrFr', 'Adresse en français')}</div>
            <div className="form2">{txt('entree', 'Entrée et accès')}{txt('reperes', 'Repères visuels')}</div>
            <div className="form2">{txt('tel', 'Téléphone')}{txt('wechat', 'Identifiant WeChat')}</div>
            <TextArea id="desc" label={tr("Description")} rows={3} value={p.desc} onChange={(v) => set({ desc: v })} />
          </Section>
          <Section title="Détails de la catégorie" icon="list">
            {has('moq') && txt('moq', 'Minimum de commande')}
            {has('hours') && txt('hours', 'Horaires')}
            {has('cuisine') && txt('cuisine', 'Cuisine')}
            {has('halal') && txt('halal', 'Halal')}
            {has('freight') && <Select id="freight" label={tr("Type de fret")} value={freight} onChange={(v) => set({ freight: (v ? v.split('+') : []) as Freight[] })}
              options={[{ v: '', l: 'Non précisé' }, { v: 'air', l: 'Aérien' }, { v: 'sea', l: 'Maritime' }, { v: 'air+sea', l: 'Aérien et maritime' }]} />}
            {has('goods') && txt('goods', 'Marchandises acceptées')}
            {has('senegal') && txt('senegal', 'Destinations en Afrique')}
            <TextArea id="prod" label={tr("Autres produits ou services (un par ligne)")} rows={3} value={(p.products ?? []).join('\n')}
              onChange={(v) => set({ products: v.split('\n').map((x) => x.trim()).filter(Boolean) })} />
            {tags.length > 0 && (
              <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
                <legend style={{ fontWeight: 600, marginBottom: 6 }}>{tr(cat?.tagsLabel ?? 'Produits et services')}</legend>
                {tags.map((t) => (
                  <label key={t.id} className="check">
                    <input type="checkbox" checked={(p.productTags ?? []).includes(t.id)}
                      onChange={(e) => set({ productTags: e.target.checked ? [...(p.productTags ?? []), t.id] : (p.productTags ?? []).filter((x) => x !== t.id) })} />
                    <span>{tr(t.label)}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </Section>
          <Section title="Photos" icon="camera">
            <div className="small muted">{tr("Jusqu’à 3 photos, visibles par les voyageurs sur la fiche.")}</div>
            <div className="grid2" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(p.photoPaths ?? []).map((path, i) => (
                <div key={path} className="stack" style={{ gap: 6 }}>
                  <StoredPhoto bucket="fiche-photos" path={path} label={tr(`Photo ${i + 1}`)} h={130} round={12} />
                  <Button kind="s" icon="trash" onClick={() => set({ photoPaths: (p.photoPaths ?? []).filter((x) => x !== path) })}>{tr("Retirer")}</Button>
                </div>
              ))}
            </div>
            {(p.photoPaths ?? []).length < MAX_PHOTOS
              ? <div className="grid2"><FilePick bucket="fiche-photos" label="Prendre une photo" onPick={(_, path) => path && set({ photoPaths: [...(p.photoPaths ?? []), path] })} /></div>
              : <div className="small muted">{tr("3 photos au maximum.")}</div>}
            <div className="small muted">{tr("Les photos sont enregistrées avec la fiche : cliquez sur Enregistrer.")}</div>
          </Section>
          <Section title="Position et vérification" icon="pin">
            <div className="form2">
              <Field id="lat" label={tr("Latitude")} type="number" value={String(p.lat)} onChange={(v) => set({ lat: Number(v) })} />
              <Field id="lng" label={tr("Longitude")} type="number" value={String(p.lng)} onChange={(v) => set({ lng: Number(v) })} />
            </div>
            {txt('verified', 'Dernière vérification', { hint: 'Date affichée telle quelle, par exemple 21 sept. 2026.' })}
          </Section>
        </div>
        <div className="stack edit-side" style={{ gap: 20 }}>
          <Section title="Actions" icon="check">
            {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
            {saved && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.4} /><span>{tr("Fiche enregistrée.")}</span></div>}
            {isAdmin && (
              <label className="check">
                <input type="checkbox" checked={!!p.featured} onChange={(e) => set({ featured: e.target.checked })} />
                <span>{tr("Mettre en avant sur la page d’accueil")}</span>
              </label>
            )}
            <Button icon="check" onClick={save} disabled={busy}>{tr(isNew ? 'Créer la fiche' : 'Enregistrer')}</Button>
            {!isNew && !isAdmin && <Button kind="d" icon="trash" onClick={() => { setReason(''); setDlg('request'); }} disabled={busy}>{tr("Demander la suppression")}</Button>}
            {!isNew && isAdmin && <Button kind="d" icon="trash" onClick={() => setDlg('delete')} disabled={busy}>{tr("Supprimer définitivement")}</Button>}
            {!isNew && !isAdmin && <div className="small muted">{tr("La suppression définitive est validée par l’administrateur. La fiche est masquée aux voyageurs dès la demande.")}</div>}
          </Section>
        </div>
      </div>
      {dlg && (
        <div className="overlay" onClick={() => setDlg(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={tr(dlg === 'delete' ? 'Supprimer cette fiche ?' : 'Demander la suppression ?')} onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name="trash" size={24} /></span><h2>{tr(dlg === 'delete' ? 'Supprimer cette fiche ?' : 'Demander la suppression ?')}</h2></div>
            {dlg === 'delete'
              ? <p>{tr("La fiche ")}<strong>{p.name}</strong> {tr(" sera supprimée définitivement. Cette action est irréversible.")}</p>
              : <>
                <p>{tr("La fiche ")}<strong>{p.name}</strong> {tr(" sera masquée aux voyageurs jusqu’à la décision de l’administrateur.")}</p>
                <TextArea id="why" label={tr("Motif de la demande")} rows={3} value={reason} onChange={setReason} placeholder={tr("Par exemple : établissement fermé.")} />
              </>}
            <div className="actions">
              <Button kind="s" full={false} onClick={() => setDlg(null)}>{tr("Annuler")}</Button>
              <Button kind="d" full={false} disabled={busy || (dlg === 'request' && !reason.trim())} onClick={remove}>{tr(dlg === 'delete' ? 'Supprimer définitivement' : 'Envoyer la demande')}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Administrateur : valide (suppression définitive) ou refuse (la fiche revient) les demandes de l'équipe. */
export function Deletions() {
  const { tr } = useI18n();
  const { s, api } = useStore();
  const wide = useWide();
  const [target, setTarget] = useState<Provider | null>(null);
  const [openRow, setOpenRow] = useState<Provider | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = s.pendingDeletion;
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setErr(null);
    const e = await fn();
    setBusy(false); setTarget(null); setOpenRow(null);
    if (e) setErr(e);
  };
  return (
    <>
      <Head title="Suppressions" sub={`${rows.length} demande${rows.length > 1 ? 's' : ''} en attente. Seul l’administrateur peut supprimer définitivement une fiche.`} />
      <div className="admin-body">
        {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
        {wide ? (
        <div className="table dense"><table>
          <thead><tr><th>{tr("Fiche")}</th><th>{tr("Demandée par")}</th><th>{tr("Motif")}</th><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div><div className="small muted">{tr(catLabel(p.cat))} · {tr(cityName(p.city))}</div></td>
                <td>{p.deletionRequestedBy ?? '—'}<div className="small muted">{shown(p.deletionRequestedAt)}</div></td>
                <td>{p.deletionReason ?? '—'}</td>
                <td><div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  <Button kind="s" full={false} disabled={busy} onClick={() => run(() => api.restoreProvider(p.id))}>{tr("Conserver la fiche")}</Button>
                  <Button kind="d" icon="trash" full={false} disabled={busy} onClick={() => setTarget(p)}>{tr("Supprimer")}</Button>
                </div></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="center muted">{tr("Aucune demande de suppression en attente.")}</td></tr>}
          </tbody>
        </table></div>
        ) : rows.length === 0 ? (
          <p className="muted">{tr("Aucune demande de suppression en attente.")}</p>
        ) : (
          <div className="acards">
            {rows.map((p) => (
              <AdminCard key={p.id} title={p.name}
                sub={<>{tr(catLabel(p.cat))} · {tr(cityName(p.city))} · {tr("demandée par")} {p.deletionRequestedBy ?? '—'}</>}
                badge={<span className="tag tag-warn"><Icon name="clock" size={15} sw={2.2} />{tr("À valider")}</span>}
                onOpen={() => setOpenRow(p)} />
            ))}
          </div>
        )}
        <DemoNote />
      </div>
      {openRow && (
        <AdminSheet title={openRow.name} sub={`${tr(catLabel(openRow.cat))} · ${tr(cityName(openRow.city))}`} onClose={() => setOpenRow(null)}>
          <div className="small muted zh">{openRow.cn}</div>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("Demandée par")} {openRow.deletionRequestedBy ?? '—'} · {shown(openRow.deletionRequestedAt)}
          </p>
          <div>
            <span className="small muted">{tr("Motif")}</span>
            <p style={{ margin: '4px 0 0' }}>{openRow.deletionReason ?? '—'}</p>
          </div>
          <SheetActions>
            <Button kind="s" icon="check" full={false} disabled={busy} onClick={() => run(() => api.restoreProvider(openRow.id))}>{tr("Conserver la fiche")}</Button>
            <Button kind="d" icon="trash" full={false} disabled={busy} onClick={() => setTarget(openRow)}>{tr("Supprimer définitivement")}</Button>
          </SheetActions>
        </AdminSheet>
      )}
      {target && (
        <div className="overlay" onClick={() => setTarget(null)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={tr("Supprimer cette fiche ?")} onClick={(e) => e.stopPropagation()}>
            <div className="row"><span className="iconbtn" style={{ border: 0, background: 'var(--info-bg)' }}><Icon name="trash" size={24} /></span><h2>{tr("Supprimer cette fiche ?")}</h2></div>
            <p>{tr("La fiche ")}<strong>{target.name}</strong> {tr(" sera supprimée définitivement. Cette action est irréversible.")}</p>
            <div className="actions">
              <Button kind="s" full={false} onClick={() => setTarget(null)}>{tr("Annuler")}</Button>
              <Button kind="d" full={false} disabled={busy} onClick={() => run(() => api.removeProvider(target.id))}>{tr("Supprimer définitivement")}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
