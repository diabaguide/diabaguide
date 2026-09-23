import { useI18n } from '../../i18n';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useStore } from '../../store';
import { Button, Field, Icon, Select, useWide } from '../../ui';
import { FIELD_BLOCKS, type Category, type CityRef, type District, type FieldBlock, type ProductTag } from '../../data';
import type { IconName } from '../../icons';
import { AdminCard, AdminSheet, SheetActions } from './mobile';
import {
  deleteDistrict, deleteTag, saveCategory, saveCity, saveDistrict, saveTag, slugify, usageCount,
} from '../../lib/taxonomies';

/* Icônes proposées pour une catégorie (doivent exister dans src/icons.ts). */
const CAT_ICONS: IconName[] = ['box', 'bed', 'utensils', 'truck', 'ship', 'plane', 'train', 'globe', 'pin', 'map', 'phone', 'camera', 'heart', 'compass', 'grid', 'list', 'shield', 'users', 'home', 'route', 'image'];

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

const Card = ({ title, children }: { title: string; children: ReactNode }) => { const { tr } = useI18n(); return ((
  <section className="card stack" style={{ gap: 14 }}>
    <h2 style={{ fontSize: 17, margin: 0 }}>{tr(title)}</h2>
    {children}
  </section>
)); };

/* ==================================================================== */
/* Villes et quartiers                                                  */
/* ==================================================================== */
export function AdminCities() {
  const { tr } = useI18n();
  const { s, api } = useStore();
  const wide = useWide();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [openDistrict, setOpenDistrict] = useState<District | null>(null);
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
      <Head title={tr("Villes")} sub={tr("Les villes et leurs quartiers alimentent la recherche et le calcul des distances.")} />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />

        <Card title={tr("Ajouter une ville")}>
          <form onSubmit={addCity} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="c-name" label={tr("Nom")} value={nf.name} onChange={(v) => setNf({ ...nf, name: v })} req placeholder={tr("Yiwu")} /></div>
            <Field id="c-cn" label={tr("Nom en chinois")} value={nf.nameCn} onChange={(v) => setNf({ ...nf, nameCn: v })} placeholder={tr("义乌")} />
            <Field id="c-lat" label={tr("Latitude")} value={nf.lat} onChange={(v) => setNf({ ...nf, lat: v })} placeholder={tr("29.30")} />
            <Field id="c-lng" label={tr("Longitude")} value={nf.lng} onChange={(v) => setNf({ ...nf, lng: v })} placeholder={tr("120.07")} />
            <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
          </form>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("L’identifiant est déduit du nom")}{nf.name && <> : <code>{tr(slugify(nf.name))}</code></>}{tr(". Une ville sans quartier reste utilisable, mais la sélection par quartier sera vide.")}</p>
        </Card>

        {s.cities.map((c) => {
          const quarters = s.districts.filter((x) => x.cityId === c.id);
          return (
            <Card key={c.id} title={tr(`${c.name}${c.nameCn ? ' · ' + c.nameCn : ''}`)}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span className="small muted">
                  <code>{tr(c.id)}</code> · {tr(quarters.length)} {tr(" quartier")}{tr(quarters.length > 1 ? 's' : '')} {tr(" · utilisée par ")}{tr(usage[c.id] ?? '…')} {tr(" fiche(s) ou proposition(s)")}{tr(!c.active && ' · désactivée')}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Button kind="s" icon="edit" full={false} onClick={() => setOpen(open === c.id ? null : c.id)}>
                    {tr(open === c.id ? 'Fermer' : 'Gérer les quartiers')}
                  </Button>
                  <Button kind="s" icon={c.active ? 'eye' : 'check'} full={false} onClick={() => toggleCity(c)}>
                    {tr(c.active ? 'Désactiver' : 'Réactiver')}
                  </Button>
                </span>
              </div>

              {open === c.id && (
                <>
                  {wide ? (
                  <div className="table dense"><table>
                    <thead><tr><th>{tr("Quartier")}</th><th>{tr("Latitude")}</th><th>{tr("Longitude")}</th><th /></tr></thead>
                    <tbody>
                      {quarters.length === 0 && <tr><td colSpan={4} className="muted">{tr("Aucun quartier.")}</td></tr>}
                      {quarters.map((q) => (
                        <tr key={q.id ?? q.name}>
                          <td><strong>{tr(q.name)}</strong></td><td>{tr(q.lat)}</td><td>{tr(q.lng)}</td>
                          <td><Button kind="s" icon="trash" full={false} onClick={() => removeDistrict(q)}>{tr("Supprimer")}</Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                  ) : quarters.length === 0 ? (
                    <p className="muted">{tr("Aucun quartier.")}</p>
                  ) : (
                    <div className="acards">
                      {quarters.map((q) => (
                        <AdminCard key={q.id ?? q.name} toneSeed={q.name} title={tr(q.name)}
                          sub={`${tr("Latitude")} ${tr(q.lat)} · ${tr("Longitude")} ${tr(q.lng)}`} onOpen={() => setOpenDistrict(q)} />
                      ))}
                    </div>
                  )}
                  <form onSubmit={(e) => addDistrict(c.id, e)} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
                    <div className="grow"><Field id={`d-n-${c.id}`} label={tr("Nom du quartier")} value={df.name} onChange={(v) => setDf({ ...df, name: v })} req /></div>
                    <Field id={`d-la-${c.id}`} label={tr("Latitude")} value={df.lat} onChange={(v) => setDf({ ...df, lat: v })} req />
                    <Field id={`d-ln-${c.id}`} label={tr("Longitude")} value={df.lng} onChange={(v) => setDf({ ...df, lng: v })} req />
                    <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
                  </form>
                </>
              )}
            </Card>
          );
        })}

        {openDistrict && (
          <AdminSheet title={tr(openDistrict.name)}
            sub={`${tr("Latitude")} ${tr(openDistrict.lat)} · ${tr("Longitude")} ${tr(openDistrict.lng)}`}
            onClose={() => setOpenDistrict(null)}>
            <p className="small muted" style={{ margin: 0 }}>
              {tr("Les quartiers alimentent la recherche par proximité et le calcul des distances.")}
            </p>
            <SheetActions>
              <Button kind="d" icon="trash" full={false}
                onClick={() => { const q = openDistrict; setOpenDistrict(null); void removeDistrict(q); }}>
                {tr("Supprimer le quartier")}
              </Button>
            </SheetActions>
          </AdminSheet>
        )}
      </div>
    </>
  );
}

/* ==================================================================== */
/* Catégories                                                           */
/* ==================================================================== */

/* Formulaire d'une catégorie : affiché dans la page sur ordinateur, dans la
   fiche plein écran sur téléphone (voir AdminCategories). */
function CategoryForm({ e, set, busy, onSave, onCancel }: {
  e: Category; set: (c: Category) => void; busy: boolean; onSave: () => void; onCancel: () => void;
}) {
  const { tr } = useI18n();
  return (
    <>
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`e-l-${e.id}`} label={tr("Nom")} value={e.label} onChange={(v) => set({ ...e, label: v })} /></div>
        <Field id={`e-cn-${e.id}`} label={tr("Nom en chinois")} value={e.labelCn ?? ''} onChange={(v) => set({ ...e, labelCn: v })} />
        <Select id={`e-i-${e.id}`} label={tr("Icône")} value={e.icon} onChange={(v) => set({ ...e, icon: v as IconName })} options={CAT_ICONS.map((i) => ({ v: i, l: i }))} />
      </div>
      <div className="filters" style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field id={`e-cta-${e.id}`} label={tr("Libellé du bouton de contact")} value={e.ctaLabel ?? ''} onChange={(v) => set({ ...e, ctaLabel: v })} /></div>
        <div className="grow"><Field id={`e-tl-${e.id}`} label={tr("Titre de la liste produits/services")} value={e.tagsLabel} onChange={(v) => set({ ...e, tagsLabel: v })} /></div>
      </div>
      <fieldset className="stack" style={{ gap: 8, border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, fontSize: 15, padding: 0 }}>{tr("Blocs affichés sur la fiche")}</legend>
        {FIELD_BLOCKS.map((b) => (
          <label key={b.id} className="check">
            <input type="checkbox" checked={e.fields.includes(b.id)}
              onChange={(ev) => set({ ...e, fields: ev.target.checked ? [...e.fields, b.id] : e.fields.filter((x) => x !== b.id) })} />
            <span>{tr(b.label)}</span>
          </label>
        ))}
        <label className="check">
          <input type="checkbox" checked={e.isFreight} onChange={(ev) => set({ ...e, isFreight: ev.target.checked })} />
          <span>{tr("Propose du fret (active le filtre aérien / maritime dans la recherche)")}</span>
        </label>
      </fieldset>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <Button full={false} onClick={onSave} disabled={busy}>{tr("Enregistrer")}</Button>
        <Button kind="s" full={false} onClick={onCancel}>{tr("Annuler")}</Button>
      </div>
    </>
  );
}

export function AdminCategories() {
  const { tr } = useI18n();
  const { s, api } = useStore();
  const wide = useWide();
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
      <Head title={tr("Catégories")} sub={tr("Chaque catégorie définit son icône, son libellé de contact et les blocs affichés sur la fiche.")} />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />

        <Card title={tr("Ajouter une catégorie")}>
          <form onSubmit={add} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
            <div className="grow"><Field id="k-label" label={tr("Nom")} value={nf.label} onChange={(v) => setNf({ ...nf, label: v })} req placeholder={tr("Pharmacies")} /></div>
            <Field id="k-cn" label={tr("Nom en chinois")} value={nf.labelCn} onChange={(v) => setNf({ ...nf, labelCn: v })} />
            <Select id="k-icon" label={tr("Icône")} value={nf.icon} onChange={(v) => setNf({ ...nf, icon: v as IconName })} options={CAT_ICONS.map((i) => ({ v: i, l: i }))} />
            <Field id="k-tags" label={tr("Titre de la liste")} value={nf.tagsLabel} onChange={(v) => setNf({ ...nf, tagsLabel: v })} />
            <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
          </form>
          <p className="small muted" style={{ margin: 0 }}>
            {tr("Identifiant déduit du nom")}{nf.label && <> : <code>{tr(slugify(nf.label))}</code></>}{tr(". « Titre de la liste » est l’intitulé affiché au-dessus des produits ou services (ex. « Services », « Spécialités »).")}</p>
        </Card>

        {s.categories.map((c) => {
          const e = edit?.id === c.id ? edit : null;
          if (!wide) {
            return (
              <AdminCard key={c.id} toneSeed={c.label}
                title={<><Icon name={c.icon} size={18} />{tr(c.label)}{c.labelCn ? ` · ${c.labelCn}` : ''}</>}
                sub={`${tr(usage[c.id] ?? '…')} ${tr("fiche(s) ou proposition(s)")}`}
                badge={!c.active ? <span className="tag tag-warn">{tr("Désactivée")}</span> : undefined}
                onOpen={() => setEdit({ ...c })} />
            );
          }
          return (
            <Card key={c.id} title={tr(`${c.label}${c.labelCn ? ' · ' + c.labelCn : ''}`)}>
              <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <span className="row small muted" style={{ gap: 8 }}>
                  <Icon name={c.icon} size={18} /><code>{tr(c.id)}</code> · {tr(usage[c.id] ?? '…')} {tr(" fiche(s) ou proposition(s)")}{tr(!c.active && ' · désactivée')}
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <Button kind="s" icon="edit" full={false} onClick={() => setEdit(e ? null : { ...c })}>{tr(e ? 'Fermer' : 'Modifier')}</Button>
                  <Button kind="s" icon={c.active ? 'eye' : 'check'} full={false} onClick={() => save({ ...c, active: !c.active })}>
                    {tr(c.active ? 'Désactiver' : 'Réactiver')}
                  </Button>
                </span>
              </div>

              {e && (
                <div className="stack" style={{ gap: 14 }}>
                  <CategoryForm e={e} set={setEdit} busy={busy} onSave={() => save(e)} onCancel={() => setEdit(null)} />
                </div>
              )}
            </Card>
          );
        })}

        {!wide && edit && (
          <AdminSheet title={tr(edit.label + (edit.labelCn ? ' · ' + edit.labelCn : ''))}
            sub={`${tr("Catégorie")} · ${tr(usage[edit.id] ?? '…')} ${tr("fiche(s) ou proposition(s)")}`}
            onClose={() => setEdit(null)}>
            <div className="stack" style={{ gap: 14 }}>
              <CategoryForm e={edit} set={setEdit} busy={busy} onSave={() => save(edit)} onCancel={() => setEdit(null)} />
              <SheetActions>
                <Button kind="s" icon={edit.active ? 'eye' : 'check'} full={false} disabled={busy}
                  onClick={() => save({ ...edit, active: !edit.active })}>
                  {tr(edit.active ? 'Désactiver la catégorie' : 'Réactiver la catégorie')}
                </Button>
              </SheetActions>
            </div>
          </AdminSheet>
        )}
      </div>
    </>
  );
}

/* ==================================================================== */
/* Catalogue produits / services                                        */
/* ==================================================================== */
export function AdminProductTags() {
  const { tr } = useI18n();
  const { s, api } = useStore();
  const wide = useWide();
  const [openTag, setOpenTag] = useState<ProductTag | null>(null);
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
      <Head title={tr("Produits et services")} sub={tr("Le catalogue proposé aux contributeurs, organisé par catégorie. Le libellé chinois est affiché aux voyageurs.")} />
      <div className="admin-body" style={{ gap: 18 }}>
        <Msg err={err} ok={ok} />
        <div className="notice"><Icon name="info" size={20} /><span>
          {tr("Préférez ")}<strong>{tr("désactiver")}</strong> {tr(" un élément plutôt que le supprimer : les fiches qui l’utilisent continueraient d’afficher son identifiant.")}</span></div>

        {s.categories.map((c) => {
          const tags = s.productTags.filter((t) => t.categoryId === c.id);
          const f = form(c.id);
          return (
            <Card key={c.id} title={tr(`${c.label} — ${c.tagsLabel}`)}>
              {wide ? (
              <div className="table dense"><table>
                <thead><tr><th>{tr("Libellé")}</th><th>{tr("中文")}</th><th>{tr("État")}</th><th>{tr("Actions")}</th></tr></thead>
                <tbody>
                  {tags.length === 0 && <tr><td colSpan={4} className="muted">{tr("Aucun élément pour cette catégorie.")}</td></tr>}
                  {tags.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{tr(t.label)}</strong><div className="small muted"><code>{tr(t.id)}</code></div></td>
                      <td className="zh">{t.labelCn ?? <span className="np">{tr("Non renseigné")}</span>}</td>
                      <td className="small muted">{tr(t.active ? 'Actif' : 'Désactivé')}</td>
                      <td>
                        <span className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <Button kind="s" full={false} onClick={() => toggle(t)}>{tr(t.active ? 'Désactiver' : 'Réactiver')}</Button>
                          <Button kind="s" icon="trash" full={false} onClick={() => remove(t)}>{tr("Supprimer")}</Button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              ) : tags.length === 0 ? (
                <p className="muted">{tr("Aucun élément pour cette catégorie.")}</p>
              ) : (
                <div className="acards">
                  {tags.map((t) => (
                    <AdminCard key={t.id} toneSeed={t.label}
                      title={tr(t.label)}
                      sub={<>{t.labelCn ?? tr("Non renseigné")} · {tr(t.active ? 'Actif' : 'Désactivé')}</>}
                      badge={!t.active ? <span className="tag tag-warn">{tr("Désactivé")}</span> : undefined}
                      onOpen={() => setOpenTag(t)} />
                  ))}
                </div>
              )}
              <form onSubmit={(e) => add(c.id, e)} className="filters" style={{ alignItems: 'flex-end' }} noValidate>
                <div className="grow"><Field id={`t-l-${c.id}`} label={tr("Libellé")} value={f.label} onChange={(v) => setNf({ ...nf, [c.id]: { ...f, label: v } })} req placeholder={tr("Chaussures en cuir")} /></div>
                <div className="grow"><Field id={`t-cn-${c.id}`} label={tr("Libellé chinois")} value={f.labelCn} onChange={(v) => setNf({ ...nf, [c.id]: { ...f, labelCn: v } })} placeholder={tr("皮鞋")} /></div>
                <Button type="submit" icon="plus" full={false} disabled={busy}>{tr("Ajouter")}</Button>
              </form>
            </Card>
          );
        })}

        {openTag && (
          <AdminSheet title={tr(openTag.label)} sub={openTag.labelCn ?? tr("Non renseigné")} onClose={() => setOpenTag(null)}>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className="small muted"><code>{tr(openTag.id)}</code></span>
              {!openTag.active && <span className="tag tag-warn">{tr("Désactivé")}</span>}
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              {tr("Préférez désactiver un élément plutôt que le supprimer : les fiches qui l’utilisent continueraient d’afficher son identifiant.")}
            </p>
            <SheetActions>
              <Button kind="s" icon={openTag.active ? 'eye' : 'check'} full={false}
                onClick={() => { const t = openTag; setOpenTag(null); void toggle(t); }}>
                {tr(openTag.active ? 'Désactiver' : 'Réactiver')}
              </Button>
              <Button kind="d" icon="trash" full={false}
                onClick={() => { const t = openTag; setOpenTag(null); void remove(t); }}>
                {tr("Supprimer du catalogue")}
              </Button>
            </SheetActions>
          </AdminSheet>
        )}
      </div>
    </>
  );
}
