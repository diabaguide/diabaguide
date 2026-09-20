import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../../store';
import { Button, Field, Icon, Select } from '../../ui';
import { FIELD_BLOCKS, type Category, type CityRef, type District, type FieldBlock, type ProductTag } from '../../data';
import type { IconName } from '../../icons';
import {
  deleteDistrict, deleteTag, saveCategory, saveCity, saveDistrict, saveTag, slugify, usageCount,
} from '../../lib/taxonomies';

/* Icônes proposées pour une catégorie (doivent exister dans src/icons.ts). */
const CAT_ICONS: IconName[] = ['box', 'bed', 'utensils', 'truck', 'ship', 'plane', 'train', 'globe', 'pin', 'map', 'phone', 'camera', 'heart', 'compass', 'grid', 'list', 'shield', 'users', 'home', 'route', 'image'];

function Head({ title, sub }: { title: string; sub: string }) {
  return <header className="admin-head"><div><h1>{title}</h1><div className="muted" style={{ marginTop: 4 }}>{sub}</div></div></header>;
}

function Msg({ err, ok }: { err: string | null; ok: string | null }) {
  return (
    <>
      {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{err}</span></div>}
      {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{ok}</span></div>}
    </>
  );
}

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="card stack" style={{ gap: 14 }}>
    <h2 style={{ fontSize: 17, margin: 0 }}>{title}</h2>
    {children}
  </section>
);

/* ==================================================================== */
/* Villes et quartiers                                                  */
/* ==================================================================== */
export function AdminCities() {
  const { s, api } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});

  const [nf, setNf] = useState({ name: '', nameCn: '', lat: '', lng: '' });
  const [df, setDf] = useState({ name: '', lat: '', lng: '' });

  useEffect(() => {
    let alive = true;
    Promise.all(s.cities.map((c) => usageCount('city', c.id).then((n) => [c.id, n] as const)))
      .then((pairs) => { if (alive) setUsage(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [s.cities]);

  const reset = () => { setErr(null); setOk(null); };

  const addCity = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (!nf.name.trim()) { setErr('Saisissez le nom de la ville.'); return; }
    const id = slugify(nf.name);
    if (s.cities.some((c) => c.id === id)) { setErr('Cette ville existe déjà.'); return; }
    setBusy(true);
    const res = await saveCity({
      id, name: nf.name.trim(), nameCn: nf.nameCn.trim() || undefined,
      lat: nf.lat ? Number(nf.lat) : undefined, lng: nf.lng ? Number(nf.lng) : undefined,
      active: true, sort: s.cities.length + 1,
    }, true);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Ville « ${nf.name} » ajoutée. Ajoutez-lui des quartiers pour activer la recherche par proximité.`);
    setNf({ name: '', nameCn: '', lat: '', lng: '' });
    await api.reloadTaxonomies();
  };

  const toggleCity = async (c: CityRef) => {
    reset();
    const res = await saveCity({ ...c, active: !c.active }, false);
    if (res.error) { setErr(res.error); return; }
    setOk(`« ${c.name} » ${c.active ? 'désactivée' : 'réactivée'}.`);
    await api.reloadTaxonomies();
  };

  const addDistrict = async (cityId: string, e: FormEvent) => {
    e.preventDefault(); reset();
    if (!df.name.trim() || !df.lat || !df.lng) { setErr('Le quartier a besoin d’un nom, d’une latitude et d’une longitude.'); return; }
    setBusy(true);
    const res = await saveDistrict({
      cityId, name: df.name.trim(), lat: Number(df.lat), lng: Number(df.lng), active: true,
      sort: s.districts.filter((x) => x.cityId === cityId).length + 1,
    }, true);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Quartier « ${df.name} » ajouté.`);
    setDf({ name: '', lat: '', lng: '' });
    await api.reloadTaxonomies();
  };

  const removeDistrict = async (d: District) => {
    reset();
    const res = await deleteDistrict(d.id!);
    if (res.error) { setErr(res.error); return; }
    setOk(`Quartier « ${d.name} » supprimé.`);
    await api.reloadTaxonomies();
  };

  return (
    <>
      <Head title="Villes" sub="Les villes et leurs quartiers alimentent la recherche et le calcul des distances." />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />

        <Card title="Ajouter une ville">
          <form onSubmit={addCity} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="c-name" label="Nom" value={nf.name} onChange={(v) => setNf({ ...nf, name: v })} req placeholder="Yiwu" /></div>
            <Field id="c-cn" label="Nom en chinois" value={nf.nameCn} onChange={(v) => setNf({ ...nf, nameCn: v })} placeholder="义乌" />
            <Field id="c-lat" label="Latitude" value={nf.lat} onChange={(v) => setNf({ ...nf, lat: v })} placeholder="29.30" />
            <Field id="c-lng" label="Longitude" value={nf.lng} onChange={(v) => setNf({ ...nf, lng: v })} placeholder="120.07" />
            <Button type="submit" icon="plus" full={false} disabled={busy}>Ajouter</Button>
          </form>
          <p className="small muted" style={{ margin: 0 }}>
            L’identifiant est déduit du nom{nf.name && <> : <code>{slugify(nf.name)}</code></>}. Une ville sans quartier reste utilisable, mais la sélection par quartier sera vide.
          </p>
        </Card>

        {s.cities.map((c) => {
          const quarters = s.districts.filter((x) => x.cityId === c.id);
          return (
            <Card key={c.id} title={`${c.name}${c.nameCn ? ' · ' + c.nameCn : ''}`}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span className="small muted">
                  <code>{c.id}</code> · {quarters.length} quartier{quarters.length > 1 ? 's' : ''} · utilisée par {usage[c.id] ?? '…'} fiche(s) ou proposition(s)
                  {!c.active && ' · désactivée'}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Button kind="s" icon="edit" full={false} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {open === c.id ? 'Fermer' : 'Gérer les quartiers'}
                  </Button>
                  <Button kind="s" icon={c.active ? 'eye' : 'check'} full={false} onClick={() => toggleCity(c)}>
                    {c.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </span>
              </div>

              {open === c.id && (
                <>
                  <div className="table"><table>
                    <thead><tr><th>Quartier</th><th>Latitude</th><th>Longitude</th><th /></tr></thead>
                    <tbody>
                      {quarters.length === 0 && <tr><td colSpan={4} className="muted">Aucun quartier.</td></tr>}
                      {quarters.map((q) => (
                        <tr key={q.id ?? q.name}>
                          <td><strong>{q.name}</strong></td><td>{q.lat}</td><td>{q.lng}</td>
                          <td><Button kind="s" icon="trash" full={false} onClick={() => removeDistrict(q)}>Supprimer</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  <form onSubmit={(e) => addDistrict(c.id, e)} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
                    <div className="grow"><Field id={`d-n-${c.id}`} label="Nom du quartier" value={df.name} onChange={(v) => setDf({ ...df, name: v })} req /></div>
                    <Field id={`d-la-${c.id}`} label="Latitude" value={df.lat} onChange={(v) => setDf({ ...df, lat: v })} req />
                    <Field id={`d-ln-${c.id}`} label="Longitude" value={df.lng} onChange={(v) => setDf({ ...df, lng: v })} req />
                    <Button type="submit" icon="plus" full={false} disabled={busy}>Ajouter</Button>
                  </form>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ==================================================================== */
/* Catégories                                                           */
/* ==================================================================== */
export function AdminCategories() {
  const { s, api } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<Category | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [nf, setNf] = useState({ label: '', labelCn: '', icon: 'box' as IconName, tagsLabel: 'Produits proposés', ctaLabel: '' });

  useEffect(() => {
    let alive = true;
    Promise.all(s.categories.map((c) => usageCount('cat', c.id).then((n) => [c.id, n] as const)))
      .then((pairs) => { if (alive) setUsage(Object.fromEntries(pairs)); });
    return () => { alive = false; };
  }, [s.categories]);

  const reset = () => { setErr(null); setOk(null); };

  const add = async (e: FormEvent) => {
    e.preventDefault(); reset();
    if (!nf.label.trim()) { setErr('Saisissez le nom de la catégorie.'); return; }
    const id = slugify(nf.label);
    if (s.categories.some((c) => c.id === id)) { setErr('Cette catégorie existe déjà.'); return; }
    setBusy(true);
    const res = await saveCategory({
      id, label: nf.label.trim(), labelCn: nf.labelCn.trim() || undefined, icon: nf.icon,
      ctaLabel: nf.ctaLabel.trim() || `Contacter`, tagsLabel: nf.tagsLabel.trim() || 'Produits proposés',
      fields: [], isFreight: false, active: true, sort: s.categories.length + 1,
    }, true);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Catégorie « ${nf.label} » créée. Choisissez ses blocs d’information ci-dessous.`);
    setNf({ label: '', labelCn: '', icon: 'box', tagsLabel: 'Produits proposés', ctaLabel: '' });
    await api.reloadTaxonomies();
  };

  const save = async (c: Category) => {
    reset(); setBusy(true);
    const res = await saveCategory(c, false);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`Catégorie « ${c.label} » enregistrée.`);
    setEdit(null);
    await api.reloadTaxonomies();
  };

  return (
    <>
      <Head title="Catégories" sub="Chaque catégorie définit son icône, son libellé de contact et les blocs affichés sur la fiche." />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />

        <Card title="Ajouter une catégorie">
          <form onSubmit={add} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="k-label" label="Nom" value={nf.label} onChange={(v) => setNf({ ...nf, label: v })} req placeholder="Pharmacies" /></div>
            <Field id="k-cn" label="Nom en chinois" value={nf.labelCn} onChange={(v) => setNf({ ...nf, labelCn: v })} />
            <Select id="k-icon" label="Icône" value={nf.icon} onChange={(v) => setNf({ ...nf, icon: v as IconName })} options={CAT_ICONS.map((i) => ({ v: i, l: i }))} />
            <Field id="k-tags" label="Titre de la liste" value={nf.tagsLabel} onChange={(v) => setNf({ ...nf, tagsLabel: v })} />
            <Button type="submit" icon="plus" full={false} disabled={busy}>Ajouter</Button>
          </form>
          <p className="small muted" style={{ margin: 0 }}>
            Identifiant déduit du nom{nf.label && <> : <code>{slugify(nf.label)}</code></>}. « Titre de la liste » est l’intitulé affiché
            au-dessus des produits ou services (ex. « Services », « Spécialités »).
          </p>
        </Card>

        {s.categories.map((c) => {
          const e = edit?.id === c.id ? edit : null;
          return (
            <Card key={c.id} title={`${c.label}${c.labelCn ? ' · ' + c.labelCn : ''}`}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span className="row small muted" style={{ gap: 8 }}>
                  <Icon name={c.icon} size={18} /><code>{c.id}</code> · {usage[c.id] ?? '…'} fiche(s) ou proposition(s)
                  {!c.active && ' · désactivée'}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Button kind="s" icon="edit" full={false} onClick={() => setEdit(e ? null : { ...c })}>{e ? 'Fermer' : 'Modifier'}</Button>
                  <Button kind="s" icon={c.active ? 'eye' : 'check'} full={false} onClick={() => save({ ...c, active: !c.active })}>
                    {c.active ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </span>
              </div>

              {e && (
                <div className="stack" style={{ gap: 14 }}>
                  <div className="filters" style={{ alignItems: 'flex-end' }}>
                    <div className="grow"><Field id={`e-l-${c.id}`} label="Nom" value={e.label} onChange={(v) => setEdit({ ...e, label: v })} /></div>
                    <Field id={`e-cn-${c.id}`} label="Nom en chinois" value={e.labelCn ?? ''} onChange={(v) => setEdit({ ...e, labelCn: v })} />
                    <Select id={`e-i-${c.id}`} label="Icône" value={e.icon} onChange={(v) => setEdit({ ...e, icon: v as IconName })} options={CAT_ICONS.map((i) => ({ v: i, l: i }))} />
                  </div>
                  <div className="filters" style={{ alignItems: 'flex-end' }}>
                    <div className="grow"><Field id={`e-cta-${c.id}`} label="Libellé du bouton de contact" value={e.ctaLabel ?? ''} onChange={(v) => setEdit({ ...e, ctaLabel: v })} /></div>
                    <div className="grow"><Field id={`e-tl-${c.id}`} label="Titre de la liste produits/services" value={e.tagsLabel} onChange={(v) => setEdit({ ...e, tagsLabel: v })} /></div>
                  </div>
                  <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontWeight: 600, fontSize: 15, padding: 0 }}>Blocs affichés sur la fiche</legend>
                    {FIELD_BLOCKS.map((b) => (
                      <label key={b.id} className="check">
                        <input type="checkbox" checked={e.fields.includes(b.id)}
                          onChange={(ev) => setEdit({ ...e, fields: ev.target.checked ? [...e.fields, b.id] : e.fields.filter((x) => x !== b.id) })} />
                        <span>{b.label}</span>
                      </label>
                    ))}
                    <label className="check">
                      <input type="checkbox" checked={e.isFreight} onChange={(ev) => setEdit({ ...e, isFreight: ev.target.checked })} />
                      <span>Propose du fret (active le filtre aérien / maritime dans la recherche)</span>
                    </label>
                  </fieldset>
                  <div className="row" style={{ gap: 8 }}>
                    <Button full={false} onClick={() => save(e)} disabled={busy}>Enregistrer</Button>
                    <Button kind="s" full={false} onClick={() => setEdit(null)}>Annuler</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* ==================================================================== */
/* Catalogue produits / services                                        */
/* ==================================================================== */
export function AdminProductTags() {
  const { s, api } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState<Record<string, { label: string; labelCn: string }>>({});

  const reset = () => { setErr(null); setOk(null); };
  const form = (cat: string) => nf[cat] ?? { label: '', labelCn: '' };

  const add = async (categoryId: string, e: FormEvent) => {
    e.preventDefault(); reset();
    const f = form(categoryId);
    if (!f.label.trim()) { setErr('Saisissez un libellé.'); return; }
    const id = slugify(f.label);
    if (s.productTags.some((t) => t.id === id)) { setErr(`« ${f.label} » existe déjà dans le catalogue.`); return; }
    setBusy(true);
    const res = await saveTag({
      id, categoryId, label: f.label.trim(), labelCn: f.labelCn.trim() || undefined,
      active: true, sort: s.productTags.filter((t) => t.categoryId === categoryId).length + 1,
    }, true);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setOk(`« ${f.label} » ajouté.`);
    setNf({ ...nf, [categoryId]: { label: '', labelCn: '' } });
    await api.reloadTaxonomies();
  };

  const toggle = async (t: ProductTag) => {
    reset();
    const res = await saveTag({ ...t, active: !t.active }, false);
    if (res.error) { setErr(res.error); return; }
    await api.reloadTaxonomies();
  };

  const remove = async (t: ProductTag) => {
    reset();
    const res = await deleteTag(t.id);
    if (res.error) { setErr(res.error); return; }
    setOk(`« ${t.label} » supprimé du catalogue.`);
    await api.reloadTaxonomies();
  };

  return (
    <>
      <Head title="Produits et services" sub="Le catalogue proposé aux contributeurs, organisé par catégorie. Le libellé chinois est affiché aux voyageurs." />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />
        <div className="notice"><Icon name="info" size={20} /><span>
          Préférez <strong>désactiver</strong> un élément plutôt que le supprimer : les fiches qui l’utilisent
          continueraient d’afficher son identifiant.
        </span></div>

        {s.categories.map((c) => {
          const tags = s.productTags.filter((t) => t.categoryId === c.id);
          const f = form(c.id);
          return (
            <Card key={c.id} title={`${c.label} — ${c.tagsLabel}`}>
              <div className="table"><table>
                <thead><tr><th>Libellé</th><th>中文</th><th>État</th><th>Actions</th></tr></thead>
                <tbody>
                  {tags.length === 0 && <tr><td colSpan={4} className="muted">Aucun élément pour cette catégorie.</td></tr>}
                  {tags.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.label}</strong><div className="small muted"><code>{t.id}</code></div></td>
                      <td className="zh">{t.labelCn ?? <span className="np">Non renseigné</span>}</td>
                      <td className="small muted">{t.active ? 'Actif' : 'Désactivé'}</td>
                      <td>
                        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <Button kind="s" full={false} onClick={() => toggle(t)}>{t.active ? 'Désactiver' : 'Réactiver'}</Button>
                          <Button kind="s" icon="trash" full={false} onClick={() => remove(t)}>Supprimer</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <form onSubmit={(e) => add(c.id, e)} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
                <div className="grow"><Field id={`t-l-${c.id}`} label="Libellé" value={f.label} onChange={(v) => setNf({ ...nf, [c.id]: { ...f, label: v } })} req placeholder="Chaussures en cuir" /></div>
                <div className="grow"><Field id={`t-cn-${c.id}`} label="Libellé chinois" value={f.labelCn} onChange={(v) => setNf({ ...nf, [c.id]: { ...f, labelCn: v } })} placeholder="皮鞋" /></div>
                <Button type="submit" icon="plus" full={false} disabled={busy}>Ajouter</Button>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
