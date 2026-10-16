import { useI18n } from '../../i18n';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { catLabel, cityName, type Cat, type City, type Freight, type Proposal, type Provider } from '../../data';
import { useStore } from '../../store';
import { contient } from '../../lib/texte';
import { fetchProviderNote, newProviderId, saveProviderNote, validateProvider } from '../../lib/providers';
import { aRever, completude, manquantsPourStatut, STATUTS, type Statut } from '../../lib/completude';
import { evaluerPosition, lirePositionGps } from '../../lib/positionSaisie';
import { etiquetteFiche, formatTelChine, lienTel } from '../../lib/contact';
import { libelleHalal, niveauPrix, statutHalal, statutOuverture, symbolesPrix } from '../../lib/filtresFiche';
import { Button, DemoNote, Field, Icon, Section, Select, StoredPhoto, TextArea, useWide } from '../../ui';
import { FilePick, MAX_PHOTOS } from '../Contribute';
import { SortTh, compare, useSort } from './tableSort';
import { BulkBar, BulkReport } from './BulkBar';
import { logBulk, runBulk, toggleAll, toggleOne, type BulkResult } from '../../lib/bulk';
import { publishProviders, setProviderCategory, trashProviders, unpublishProviders } from '../../lib/providers';
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
  const { tr, t } = useI18n();
  const { s, api } = useStore();
  const wide = useWide();
  const nav = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<BulkResult[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCat, setBulkCat] = useState('');
  const [q, setQ] = useState('');
  const [city, setCity] = useState<'' | City>('');
  const [cat, setCat] = useState<'' | Cat>('');
  const [incompletes, setIncompletes] = useState(false);
  const isAdmin = s.user?.role === 'admin';
  const { sort, toggle } = useSort<'name' | 'cat' | 'city' | 'verified'>({ k: 'name', dir: 1 });
  const match = (p: Provider) => (!city || p.city === city) && (!cat || p.cat === cat)
    && (!incompletes || completude(p).manquants.length > 0)
    && contient(`${p.name} ${p.cn} ${p.tel ?? ''} ${p.wechat ?? ''}`, q);
  const rows = useMemo(() => [...s.providers, ...s.hiddenProviders].filter(match).sort((a, b) => {
    const v = (p: Provider) => (sort.k === 'cat' ? catLabel(p.cat) : sort.k === 'city' ? cityName(p.city) : sort.k === 'verified' ? (p.verified ?? '') : p.name).toLowerCase();
    return compare(v(a), v(b), sort.dir);
  }), [s.providers, s.hiddenProviders, s.categories, s.cities, city, cat, q, sort, incompletes]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = !!(city || cat || q || incompletes);
  const pending = s.pendingDeletion.filter(match);
  const visibleIds = rows.map((p) => p.id);
  const names = Object.fromEntries([...s.providers, ...s.hiddenProviders].map((p) => [p.id, p.name]));
  const finish = async (action: string, result: BulkResult[]) => {
    setBulkBusy(false); setReport(result); setSelected(new Set());
    await logBulk(action, 'fiche', result);
    await api.reloadProviders();
  };
  const bulkPublish = async (publish: boolean) => {
    const ids = [...selected];
    if (!window.confirm(t(publish ? 'Publier {0} fiche(s) ? Elles redeviennent visibles par les voyageurs.' : 'Dépublier {0} fiche(s) ? Elles seront masquées aux voyageurs.', { 0: ids.length }))) return;
    setBulkBusy(true);
    const hidden = new Set(s.hiddenProviders.map((p) => p.id));
    await finish(publish ? 'fiches.publish' : 'fiches.unpublish', await runBulk(ids, publish ? publishProviders : unpublishProviders, {
      skip: (id) => (publish === hidden.has(id) ? null : publish ? 'Déjà publiée.' : 'Déjà dépubliée.'),
    }));
  };
  const bulkTrash = async () => {
    const ids = [...selected];
    if (!window.confirm(t('Mettre {0} fiche(s) à la corbeille ? Elles seront restaurables pendant 30 jours.', { 0: ids.length }))) return;
    setBulkBusy(true);
    await finish('fiches.trash', await runBulk(ids, trashProviders));
  };
  const bulkCategory = async () => {
    const ids = [...selected];
    if (!bulkCat) return;
    if (!window.confirm(t('Changer la catégorie de {0} fiche(s) ?', { 0: ids.length }))) return;
    setBulkBusy(true);
    await finish('fiches.category', await runBulk(ids, (id) => setProviderCategory(id, bulkCat), {
      skip: (id) => (s.providers.find((p) => p.id === id)?.cat === bulkCat ? 'Déjà dans cette catégorie.' : null),
    }));
  };
  return (
    <>
      <Head title={tr("Fiches")} sub={t(rows.length > 1 ? '{0} fiches publiées. Ajoutez, modifiez ou demandez la suppression d’une fiche.' : '{0} fiche publiée. Ajoutez, modifiez ou demandez la suppression d’une fiche.', { 0: rows.length })}
        right={<Button to="/equipe/fiches/nouvelle" icon="plus" full={false}>{tr("Nouvelle fiche")}</Button>} />
      <div className="admin-body">
        <div className="filters sticky">
          <Select id="fv" label={tr("Ville")} value={city} onChange={setCity} options={[{ v: '', l: 'Toutes' }, ...s.cities.map((c) => ({ v: c.id as City, l: c.name }))]} />
          <Select id="fc" label={tr("Catégorie")} value={cat} onChange={setCat} options={[{ v: '', l: 'Toutes' }, ...s.categories.map((c) => ({ v: c.id as Cat, l: c.label }))]} />
          <div className="grow"><Field id="fq" label={tr("Recherche")} type="search" value={q} onChange={setQ} placeholder={tr("Nom, téléphone, WeChat…")} /></div>
          <label className="check"><input type="checkbox" checked={incompletes} onChange={(e) => setIncompletes(e.target.checked)} /><span>{tr("Fiches incomplètes")}</span></label>
          {filtered && <Button kind="s" icon="x" full={false} onClick={() => { setCity(''); setCat(''); setQ(''); setIncompletes(false); }}>{tr("Réinitialiser")}</Button>}
        </div>
        {wide ? (
        <div className="table dense"><table>
          <thead><tr><th style={{ width: 36 }}><input type="checkbox" aria-label={tr("Tout sélectionner")} checked={visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))} onChange={() => setSelected(toggleAll(selected, visibleIds))} /></th><th className="thumb" />
            <SortTh k="name" label="Fiche" sort={sort} onSort={toggle} /><SortTh k="cat" label="Catégorie" sort={sort} onSort={toggle} /><SortTh k="city" label="Ville" sort={sort} onSort={toggle} /><SortTh k="verified" label="Vérifiée le" sort={sort} onSort={toggle} /><th /></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" aria-label={t('Sélectionner {0}', { 0: p.name })} checked={selected.has(p.id)} onChange={() => setSelected(toggleOne(selected, p.id))} /></td>
                <td className="thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={48} w={48} round={8} thumb /></td>
                <td><strong>{p.name}</strong>{p.featured && <Icon name="star" size={15} fill="var(--gold-fill)" sw={0} />}{p.unpublishedAt && <span className="tag tag-warn" style={{ marginLeft: 8 }}>{tr("Dépubliée")}</span>}{p.reviewStatus && p.reviewStatus !== 'published' && <span className="tag tag-warn" style={{ marginLeft: 8 }}>{tr(STATUTS.find((x) => x.id === p.reviewStatus)?.label ?? '')}</span>}<span className="small muted" style={{ marginLeft: 8 }}>{(() => { const c = completude(p); return `${c.ok}/${c.total}`; })()}{aRever(p.verified) ? ` · ${tr('À revérifier')}` : ''}</span><div className="small muted zh">{p.cn}</div></td>
                <td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td><td>{p.verified || '—'}</td>
                <td><Link className="link" to={`/equipe/fiches/${p.id}`}>{tr("Modifier")}<Icon name="chevR" size={18} sw={2.4} /></Link></td>
              </tr>
            ))}
            {pending.map((p) => (
              <tr key={p.id} style={{ opacity: 0.75 }}>
                <td /><td className="thumb" />
                <td><strong>{p.name}</strong><div className="small muted zh">{p.cn}</div></td>
                <td>{tr(catLabel(p.cat))}</td><td>{tr(cityName(p.city))}</td>
                <td colSpan={2}><span className="row" style={{ gap: 6, fontWeight: 600, color: '#8A4310' }}><Icon name="clock" size={16} sw={2.2} />{tr(isAdmin ? 'Suppression à valider' : 'Suppression demandée : en attente de l’administrateur')}</span></td>
              </tr>
            ))}
            {rows.length + pending.length === 0 && <tr><td colSpan={7} className="center muted">{tr("Aucune fiche ne correspond aux filtres.")}</td></tr>}
          </tbody>
        </table></div>
        ) : rows.length + pending.length === 0 ? (
          <p className="muted">{tr("Aucune fiche ne correspond aux filtres.")}</p>
        ) : (
          <div className="acards">
            <label className="row small" style={{ gap: 8 }}>
              <input type="checkbox" checked={visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))} onChange={() => setSelected(toggleAll(selected, visibleIds))} />
              {tr("Tout sélectionner")}
            </label>
            {rows.map((p) => (
              <div key={p.id} className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" style={{ width: 24, height: 24, flex: 'none' }} aria-label={t('Sélectionner {0}', { 0: p.name })} checked={selected.has(p.id)} onChange={() => setSelected(toggleOne(selected, p.id))} />
              <div style={{ flex: 1, minWidth: 0 }}><AdminCard toneSeed={undefined}
                title={<>{p.name}{p.featured && <Icon name="star" size={15} fill="var(--gold-fill)" sw={0} />}</>}
                badge={p.unpublishedAt ? <span className="tag tag-warn">{tr("Dépubliée")}</span> : p.reviewStatus && p.reviewStatus !== 'published' ? <span className="tag tag-warn">{tr(STATUTS.find((x) => x.id === p.reviewStatus)?.label ?? '')}</span> : undefined}
                sub={<>{tr(catLabel(p.cat))} · {tr(cityName(p.city))}{p.verified ? ` · ${tr("vérifiée le")} ${p.verified}` : ''} · {completude(p).ok}/{completude(p).total}{aRever(p.verified) ? ` · ${tr('À revérifier')}` : ''}</>}
                thumb={<span className="acard-thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={46} w={46} round={12} thumb /></span>}
                onOpen={() => nav(`/equipe/fiches/${p.id}`)} /></div>
              </div>
            ))}
            {pending.map((p) => (
              <AdminCard key={p.id}
                title={p.name}
                sub={<>{tr(catLabel(p.cat))} · {tr(cityName(p.city))}</>}
                thumb={<span className="acard-thumb"><StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={46} w={46} round={12} thumb /></span>}
                badge={<span className="tag tag-warn"><Icon name="clock" size={15} sw={2.2} />{tr(isAdmin ? 'À valider' : 'Suppression demandée')}</span>}
                onOpen={() => nav(`/equipe/fiches/${p.id}`)} />
            ))}
          </div>
        )}
        <BulkReport report={report} names={names} />
        {isAdmin && (
          <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
            <Select id="bc" label={tr("Catégorie")} value={bulkCat} onChange={setBulkCat} options={[{ v: '', l: 'Choisir…' }, ...s.categories.map((c) => ({ v: c.id, l: c.label }))]} />
            <Button kind="s" icon="check" full={false} disabled={bulkBusy} onClick={() => void bulkPublish(true)}>{tr("Publier")}</Button>
            <Button kind="s" icon="x" full={false} disabled={bulkBusy} onClick={() => void bulkPublish(false)}>{tr("Dépublier")}</Button>
            <Button kind="s" icon="check" full={false} disabled={bulkBusy || !bulkCat} onClick={() => void bulkCategory()}>{tr("Changer la catégorie")}</Button>
            <Button kind="d" icon="trash" full={false} disabled={bulkBusy} onClick={() => void bulkTrash()}>{tr("Mettre à la corbeille")}</Button>
          </BulkBar>
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
  const existing = [...s.providers, ...s.hiddenProviders].find((x) => x.id === id);
  // Ville proposée pour une nouvelle fiche : celle de l'utilisateur, sinon la
  // première active (les villes sont rangées par ordre alphabétique).
  const firstCity = s.cities.find((c) => c.active && c.id === s.city) ?? s.cities.find((c) => c.active) ?? s.cities[0];
  // Catégorie proposée : la première dans l'ordre défini en base (colonne sort),
  // et non la première par ordre alphabétique, ordre d'affichage des listes.
  const firstCat = [...s.categories].filter((c) => c.active).sort((a, b) => a.sort - b.sort)[0] ?? s.categories[0];
  // « Créer la fiche avec ces informations » depuis une proposition : les champs sont préremplis.
  const depuis = (useLocation().state as { depuis?: Proposal } | null)?.depuis;
  const [p, setP] = useState<Provider | null>(() => existing ?? (isNew ? {
    id: '', name: depuis?.name ?? '', cn: depuis?.cn ?? '', cat: depuis?.cat ?? firstCat.id, city: depuis?.city ?? firstCity.id, district: '',
    lat: depuis?.lat ?? firstCity.lat ?? 23.13, lng: depuis?.lng ?? firstCity.lng ?? 113.27, verified: today(), desc: '', addrCn: depuis?.addrCn ?? '', addrFr: depuis?.loc ?? '',
    productTags: depuis?.productTags ?? [], tel: depuis?.tel || undefined, wechat: depuis?.wechat || undefined,
    products: depuis?.products ? [depuis.products] : undefined, moq: depuis?.moq || undefined,
  } : null));
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [noteLue, setNoteLue] = useState(false);
  const [gps, setGps] = useState<{ busy: boolean; msg: string; ok?: boolean }>({ busy: false, msg: '' });
  const [apercu, setApercu] = useState(false);
  const noteId = existing?.id;
  useEffect(() => {
    if (!noteId) return;
    let vivant = true;
    void fetchProviderNote(noteId).then((n) => { if (vivant && n !== null) { setNote(n); setNoteLue(true); } });
    return () => { vivant = false; };
  }, [noteId]);
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
    // Un statut « À vérifier » ou « Publié » (choisi explicitement) exige une fiche complète ; le brouillon passe toujours.
    if (p.reviewStatus === 'review' || p.reviewStatus === 'published') {
      const manque = manquantsPourStatut(p, p.reviewStatus);
      if (manque.length) {
        setErr(`Pour le statut « ${STATUTS.find((x) => x.id === p.reviewStatus)?.label} », il manque : ${manque.join(', ')}. Choisissez « Brouillon » pour enregistrer quand même.`);
        return;
      }
    }
    setBusy(true); setErr(null);
    const idFinal = isNew ? newProviderId(p.name) : p.id;
    const e = await api.saveProvider(isNew ? { ...p, id: idFinal } : p);
    if (!e && (noteLue || note.trim())) { const en = await saveProviderNote(idFinal, note); if (en.error) { setBusy(false); setErr(`Fiche enregistrée, mais pas la note : ${en.error}`); return; } }
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
  const capturer = async () => {
    setGps({ busy: true, msg: '' });
    try {
      const r = evaluerPosition(await lirePositionGps());
      if (!r.ok) { setGps({ busy: false, msg: r.raison, ok: false }); return; }
      set({ lat: r.lat, lng: r.lng, coordsVerified: true });
      setGps({ busy: false, msg: `Position enregistrée (précision ${r.precision} m). Pensez à enregistrer la fiche.`, ok: true });
    } catch (e) { setGps({ busy: false, msg: (e as Error).message, ok: false }); }
  };
  const compl = completude(p);
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
            {(p.cat === 'hotel' || p.cat === 'resto') && (
              <div className="form2">
                <Select id="priceLevel" label={tr("Gamme de prix")} value={String(p.priceLevel ?? '')}
                  onChange={(v) => set({ priceLevel: v ? Number(v) : undefined })}
                  options={[{ v: '', l: 'Non précisé' }, { v: '1', l: '¥ · économique' }, { v: '2', l: '¥¥ · moyen' }, { v: '3', l: '¥¥¥ · élevé' }]} />
                {p.cat === 'hotel' && <Field id="priceNight" label={tr("Prix indicatif d’une nuit (¥)")} type="number" inputMode="numeric"
                  value={p.priceNight ? String(p.priceNight) : ''} onChange={(v) => set({ priceNight: v && Number(v) > 0 ? Math.round(Number(v)) : undefined })} />}
              </div>
            )}
            {p.cat === 'resto' && (
              <div className="form2">
                <Select id="halalStatus" label={tr("Statut halal")} value={p.halalStatus ?? ''}
                  onChange={(v) => set({ halalStatus: (v || undefined) as Provider['halalStatus'] })}
                  options={[{ v: '', l: 'Non précisé' }, { v: 'confirmed', l: 'Halal confirmé par Diaba' }, { v: 'unverified', l: 'Non vérifié' }, { v: 'no', l: 'Non halal' }]} />
                <Select id="cuisineType" label={tr("Type de cuisine")} value={p.cuisineType ?? ''}
                  onChange={(v) => set({ cuisineType: (v || undefined) as Provider['cuisineType'] })}
                  options={[{ v: '', l: 'Non précisé' }, { v: 'africaine', l: 'Africaine' }, { v: 'chinoise', l: 'Chinoise' }, { v: 'arabe', l: 'Arabe' }, { v: 'autre', l: 'Autre' }]} />
              </div>
            )}
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
            <Button kind="g" icon="pin" disabled={gps.busy} onClick={() => void capturer()}>{tr(gps.busy ? 'Recherche de la position…' : 'Enregistrer ma position ici')}</Button>
            <div className="small muted">{tr("À faire sur place, devant l’entrée, à l’extérieur.")}</div>
            {gps.msg && <div role={gps.ok ? 'status' : 'alert'} className={`notice ${gps.ok ? 'ok' : 'err'}`}><Icon name={gps.ok ? 'check' : 'alert'} size={20} sw={2} /><span>{tr(gps.msg)}</span></div>}
            {p.coordsVerified && <div className="small" style={{ fontWeight: 600 }}>{tr("Position vérifiée sur place.")}</div>}
            <div className="form2">
              <Field id="lat" label={tr("Latitude")} type="number" value={String(p.lat)} onChange={(v) => set({ lat: Number(v), coordsVerified: false })} />
              <Field id="lng" label={tr("Longitude")} type="number" value={String(p.lng)} onChange={(v) => set({ lng: Number(v), coordsVerified: false })} />
            </div>
            {txt('verified', 'Dernière vérification', { hint: 'Date affichée telle quelle, par exemple 21 sept. 2026.' })}
          </Section>
        </div>
        <div className="stack edit-side" style={{ gap: 20 }}>
          <Section title="Complétude" icon="list">
            <div style={{ fontWeight: 700 }}>{compl.ok} {tr("champs sur")} {compl.total}</div>
            <div role="progressbar" aria-valuemin={0} aria-valuemax={compl.total} aria-valuenow={compl.ok} style={{ height: 10, borderRadius: 6, background: 'var(--line)', overflow: 'hidden' }}>
              <div style={{ width: `${compl.total ? (compl.ok / compl.total) * 100 : 0}%`, height: '100%', background: compl.ok === compl.total ? 'var(--ok, #1a7f4b)' : 'var(--gold-fill)' }} />
            </div>
            {compl.manquants.length > 0 && <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>{compl.manquants.map((m) => <li key={m}>{tr(m)}</li>)}</ul>}
            {aRever(p.verified) && <div className="small" style={{ color: '#8A4310', fontWeight: 600 }}>{tr("À revérifier : dernière vérification il y a plus de 6 mois.")}</div>}
          </Section>
          <Section title="Statut" icon="check">
            <Select id="reviewStatus" label={tr("Statut de la fiche")} value={p.reviewStatus ?? 'published'}
              onChange={(v) => set({ reviewStatus: v as Statut })}
              options={STATUTS.filter((x) => isAdmin || x.id !== 'published' || (existing?.reviewStatus ?? 'published') === 'published').map((x) => ({ v: x.id, l: x.label }))} />
            <div className="small muted">{tr("Seul un administrateur peut publier. Une fiche en brouillon ou à vérifier reste invisible des voyageurs.")}</div>
            {isAdmin && (
              <Select id="partnerLabel" label={tr("Étiquette affichée aux voyageurs")} value={p.partnerLabel ?? ''}
                onChange={(v) => set({ partnerLabel: (v || undefined) as Provider['partnerLabel'] })}
                options={[{ v: '', l: 'Automatique' }, { v: 'service_diaba', l: 'Service Diaba' }, { v: 'partenaire', l: 'Partenaire' }]} />
            )}
          </Section>
          <Section title="Note pour l’équipe" icon="edit">
            <TextArea id="note" label={tr("Note pour l’équipe (jamais publiée)")} rows={3} value={note} onChange={(v) => { setNote(v); setSaved(false); }}
              hint={tr("Visible de l’équipe seulement, jamais des voyageurs.")} />
          </Section>
          <Section title="Aperçu" icon="eye">
            <Button kind="s" icon="eye" onClick={() => setApercu(true)}>{tr("Aperçu voyageur")}</Button>
          </Section>
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
      {apercu && (
        <div className="overlay" onClick={() => setApercu(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={tr("Aperçu voyageur")} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400, maxHeight: '85vh', overflowY: 'auto' }}>
            <Apercu p={p} />
            <div className="actions"><Button kind="s" full={false} onClick={() => setApercu(false)}>{tr("Fermer")}</Button></div>
          </div>
        </div>
      )}
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

/** Aperçu simplifié de la fiche telle qu'un voyageur la voit sur mobile (mêmes règles de masquage). */
function Apercu({ p }: { p: Provider }) {
  const { tr } = useI18n();
  const prix = niveauPrix(p);
  const ouv = statutOuverture(p.hours);
  const etiquette = etiquetteFiche(p);
  const halal = libelleHalal(statutHalal(p));
  const contact = !!(p.tel?.trim() || p.wechat?.trim());
  return (
    <div className="stack" style={{ gap: 10 }}>
      <StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={150} w={340} round={12} />
      <div className="row wrap" style={{ gap: 8 }}><span className="small muted">{tr(catLabel(p.cat))} · {p.district}</span>{etiquette && <span className="tag tag-warn">{tr(etiquette)}</span>}</div>
      <h2 style={{ fontSize: 22 }}>{p.name}</h2>
      <div className="zh" style={{ fontSize: 17 }}>{p.cn}</div>
      {(prix || ouv || p.metro) && <div className="row wrap" style={{ gap: 12, fontWeight: 600 }}>
        {prix && <span>{symbolesPrix(prix)}{p.cat === 'hotel' && p.priceNight ? ` · ${p.priceNight} ¥` : ''}</span>}
        {ouv && <span>{tr(ouv.texte)}</span>}{p.metro && <span>{p.metro}</span>}
      </div>}
      {halal && <div>{tr(halal)}</div>}
      {p.desc && <p>{p.desc}</p>}
      {p.addrCn && <div className="zhaddr" lang="zh-Hans">{p.addrCn}</div>}
      <div className="stack" style={{ gap: 8 }}>
        <span className="btn btn-g btn-full"><span>{tr("Montrer au chauffeur")}</span></span>
        {p.tel?.trim() && <a className="btn btn-p btn-full" href={lienTel(p.tel)}><span>{tr("Appeler")} · {formatTelChine(p.tel)}</span></a>}
        {!contact && <div className="small muted">{tr("Contact non disponible — montrez l’adresse au chauffeur.")}</div>}
      </div>
    </div>
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
