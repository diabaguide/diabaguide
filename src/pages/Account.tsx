import { useI18n } from '../i18n';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { catLabel, type Provider } from '../data';
import { useOnline, useStore, type LocPref, type Theme } from '../store';
import { changeMyPassword, isTeamRole, signOut, updateMyProfile } from '../lib/auth';
import { Avatar, AvatarPicker, Button, DemoNote, Field, Icon, RadioCard, Screen, StoredPhoto, Tag, TopBar } from '../ui';
import { LangSwitch } from './Access';
import { PHONE } from '../lib/phone';
import { removePhoto } from '../lib/photos';

export function Favorites() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const online = useOnline();
  const [onlyOff, setOnlyOff] = useState(false);
  const favs = s.favorites.map((id) => s.providers.find((p) => p.id === id)).filter(Boolean) as Provider[];
  const shown = favs.filter((p) => (onlyOff || !online ? !!s.downloads[p.id] : true));
  const nOff = favs.filter((p) => s.downloads[p.id]).length;

  if (favs.length === 0) {
    return (
      <Screen>
        <TopBar title={tr("Favoris")} />
        <div className="main">
          <div className="center-screen">
            <span className="bigcheck" style={{ width: 88, height: 88, background: 'var(--info-bg)', border: 0, color: 'var(--primary)' }}><Icon name="heart" size={44} sw={1.6} /></span>
            <div className="display" style={{ fontSize: 26 }}>{tr("Aucun favori pour le moment")}</div>
            <div className="muted">{tr("Touchez « Ajouter aux favoris » sur une fiche pour la retrouver ici. Vous pouvez aussi la télécharger pour la consulter sans connexion.")}</div>
          </div>
          <Button to="/recherche" icon="compass">{tr("Explorer les adresses")}</Button>
        </div>
      </Screen>
    );
  }
  return (
    <Screen>
      <TopBar title={tr("Favoris")} />
      <div className="main" style={{ gap: 14 }}>
        {!online && (
          <div role="status" className="notice warn"><Icon name="wifioff" size={22} /><div><strong>{tr("Vous êtes hors connexion")}</strong><div className="small">{tr("Seules les informations téléchargées sont disponibles. La recherche et la carte reviendront avec le réseau.")}</div></div></div>
        )}
        <div className="row small muted"><Icon name="refresh" size={16} />{tr("Dernière synchronisation : ")}{tr(s.lastSync)}</div>
        <div className="seg" role="group" aria-label={tr("Filtre")}>
          <button type="button" className={!onlyOff && online ? 'on' : ''} onClick={() => setOnlyOff(false)} disabled={!online}>{tr(!onlyOff && online && '✓ ')}{tr("Tous (")}{tr(favs.length)})</button>
          <button type="button" className={onlyOff || !online ? 'on' : ''} onClick={() => setOnlyOff(true)}>{tr((onlyOff || !online) && '✓ ')}{tr("Disponibles hors connexion (")}{tr(nOff)})</button>
        </div>
        {shown.map((p) => {
          const date = s.downloads[p.id];
          const locked = !online && !date;
          return (
            <div key={p.id} className="card stack" style={{ padding: 12, gap: 10, opacity: locked ? 0.62 : 1 }}>
              <Link to={`/adresses/${p.id}`} className="row" style={{ textDecoration: 'none', color: 'inherit', alignItems: 'flex-start', gap: 12 }}>
                <StoredPhoto bucket="fiche-photos" path={p.photoPaths?.[0]} label={tr("Photo")} h={80} w={80} round={12} />
                <div className="stack" style={{ gap: 2 }}><span style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>{p.name}</span><span className="small muted zh">{p.cn}</span><span className="small">{tr(catLabel(p.cat))} · {tr(p.district)}</span></div>
              </Link>
              <div className="row wrap">
                <Tag tone="fav" icon="heart">{tr("Favori")}</Tag>
                {date ? <Tag tone="ok" icon="download">{tr("Disponible hors connexion depuis le ")}{tr(date)}</Tag> : locked && <Tag tone="muted" icon="lock">{tr("Non disponible hors connexion")}</Tag>}
              </div>
              {online && (date
                ? <Button kind="s" icon="trash" onClick={() => d({ t: 'dl', id: p.id })}>{tr("Retirer du hors connexion")}</Button>
                : <Button icon="download" onClick={() => d({ t: 'dl', id: p.id })}>{tr("Rendre disponible hors connexion")}</Button>)}
              {!online && date && <Button to={`/adresses/${p.id}`}>{tr("Consulter la fiche")}</Button>}
            </div>
          );
        })}
        <DemoNote />
      </div>
    </Screen>
  );
}

export function Profile() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const nav = useNavigate();
  const initials = (s.user?.name ?? '?').split(/[\s.]+/).map((x) => x[0]?.toUpperCase()).slice(0, 2).join('');
  const prefs: { v: LocPref; l: string; sub?: string }[] = [
    { v: 'ask', l: 'Demander à chaque recherche', sub: 'Recommandé' },
    { v: 'while', l: 'Autoriser pendant l’utilisation' },
    { v: 'never', l: 'Ne pas utiliser ma position', sub: 'Choix manuel du quartier' },
  ];
  const themes: { v: Theme; l: string; sub?: string; icon: 'auto' | 'sun' | 'moon' }[] = [
    { v: 'system', l: 'Comme mon appareil', sub: 'Recommandé', icon: 'auto' },
    { v: 'light', l: 'Clair', icon: 'sun' },
    { v: 'dark', l: 'Sombre', icon: 'moon' },
  ];
  return (
    <Screen>
      <TopBar title={tr("Profil")} />
      <div className="main" style={{ gap: 20 }}>
        <div className="card row" style={{ padding: 16, gap: 14 }}>
          {s.user?.avatarPath
            ? <Avatar path={s.user.avatarPath} name={s.user.name} size={56} />
            : <span className="avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 20 }}>{tr(initials)}</span>}
          <div className="grow"><div style={{ fontWeight: 700, fontSize: 18 }}>{s.user?.name}</div><div className="small muted">{s.user?.email || s.user?.phone}</div></div>
        </div>
        <Button kind="s" icon="edit" to="/profil/modifier">{tr("Modifier mon profil")}</Button>
        <section className="stack"><h2 className="row" style={{ fontSize: 17 }}><Icon name="globe" size={20} />{tr("Langue")}</h2><LangSwitch />
          
        </section>
        <section className="card" style={{ padding: 0 }}>
          <Link className="listrow" to="/liste-achats"><Icon name="list" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Ma liste d'achats")}</div><div className="small muted">{tr("Produits à acheter, à partager ou à imprimer")}</div></div><Icon name="chevR" size={20} /></Link>
          <Link className="listrow" to="/favoris"><Icon name="heart" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Favoris")}</div><div className="small muted">{tr("Adresses enregistrées pour les retrouver rapidement")}</div></div><Icon name="chevR" size={20} /></Link>
          <Link className="listrow" to="/profil/telechargements"><Icon name="download" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Fiches téléchargées")}</div><div className="small muted">{tr(Object.keys(s.downloads).length)} {tr(" fiche(s) disponibles hors connexion")}</div></div><Icon name="chevR" size={20} /></Link>
          <Link className="listrow" to="/contributions"><Icon name="pen" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Mes contributions")}</div><div className="small muted">{tr(s.proposals.filter((p) => p.status === 'Complément demandé').length)} {tr(" complément demandé")}</div></div><Icon name="chevR" size={20} /></Link>
          {isTeamRole(s.user?.role) && <Link className="listrow" to="/equipe"><Icon name="shield" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Espace équipe Diaba")}</div></div><Icon name="chevR" size={20} /></Link>}
        </section>
        <section className="stack"><h2 className="row" style={{ fontSize: 17 }}><Icon name="sun" size={20} />{tr("Apparence")}</h2>
          {themes.map((x) => <RadioCard key={x.v} name="theme" icon={x.icon} label={tr(x.l)} sub={tr(x.sub)} checked={s.theme === x.v} onChange={() => d({ t: 'theme', v: x.v })} />)}
        </section>
        <section className="stack"><h2 className="row" style={{ fontSize: 17 }}><Icon name="pin" size={20} />{tr("Préférences de localisation")}</h2>
          {prefs.map((x) => <RadioCard key={x.v} name="loc" label={tr(x.l)} sub={tr(x.sub)} checked={s.locPref === x.v} onChange={() => d({ t: 'locPref', v: x.v })} />)}
        </section>
        <Button kind="s" icon="logout" onClick={async () => { await signOut(); d({ t: 'logout' }); nav('/'); }}>{tr("Se déconnecter")}</Button>
        <div className="small muted center">{tr("Diaba Guide · version de démonstration")}</div>
      </div>
    </Screen>
  );
}

/** Modification de son propre profil : nom, téléphone et mot de passe. */
export function EditProfile() {
  const { tr } = useI18n();
  return (
    <Screen>
      <TopBar title={tr("Modifier mon profil")} back="/profil" />
      <div className="main" style={{ gap: 20 }}><ProfileForms /></div>
    </Screen>
  );
}

/** Formulaires du profil, partagés entre l'espace voyageur et l'espace fret. */
export function ProfileForms() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const u = s.user;
  const [name, setName] = useState(u?.name ?? '');
  const [phone, setPhone] = useState(u?.phone ?? '');
  const [avatar, setAvatar] = useState<string | null>(u?.avatarPath ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(false);

  if (!u) return null;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(null);
    if (name.trim().length < 2) { setErr('Le nom doit contenir au moins 2 caractères.'); return; }
    if (phone.trim() && !PHONE.test(phone.trim())) { setErr('Saisissez un numéro de téléphone valide.'); return; }
    setBusy(true);
    const before = u?.avatarPath ?? null;
    const changed = avatar !== before;
    const res = await updateMyProfile(name, phone, changed ? (avatar ? { path: avatar } : { remove: true }) : {});
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    d({ t: 'login', user: { ...u, name: name.trim(), phone: phone.trim(), avatarPath: avatar } });
    // Ancien fichier remplacé ou retiré : on le supprime du stockage.
    if (changed) await removePhoto(before, 'avatars');
    setOk('Profil enregistré.');
  };

  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    setPwErr(null); setPwOk(false);
    if (!cur) { setPwErr('Saisissez votre mot de passe actuel.'); return; }
    if (pw.length < 8) { setPwErr('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (pw !== pw2) { setPwErr('Les deux mots de passe ne correspondent pas.'); return; }
    setPwBusy(true);
    const res = await changeMyPassword(cur, pw);
    setPwBusy(false);
    if (res.error) { setPwErr(res.error); return; }
    setCur(''); setPw(''); setPw2(''); setPwOk(true);
  };

  return (
    <>
        <form className="stack" onSubmit={save} noValidate>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Mes informations")}</h2>
          {err && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(err)}</span></div>}
          {ok && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr(ok)}</span></div>}
          <AvatarPicker path={avatar} name={name || u.email} onChange={setAvatar} onError={setErr} />
          <Field id="me-name" label={tr("Nom complet")} value={name} onChange={setName} req />
          <Field id="me-phone" label={tr("Numéro de téléphone")} type="tel" value={phone} onChange={setPhone}
            hint={tr("Avec l’indicatif du pays, par exemple +221 77 123 45 67.")} />
          <Button type="submit" icon="check" disabled={busy}>{tr(busy ? 'Enregistrement…' : 'Enregistrer')}</Button>
        </form>

        <form className="stack" onSubmit={savePw} noValidate>
          <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Mot de passe")}</h2>
          {pwErr && <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(pwErr)}</span></div>}
          {pwOk && <div role="status" className="notice ok"><Icon name="check" size={20} sw={2.2} /><span>{tr("Mot de passe modifié.")}</span></div>}
          <Field id="me-cur" label={tr("Mot de passe actuel")} type="password" value={cur} onChange={setCur} req />
          <Field id="me-pw" label={tr("Nouveau mot de passe")} type="password" value={pw} onChange={setPw} req hint={tr("Au moins 8 caractères.")} />
          <Field id="me-pw2" label={tr("Confirmer le nouveau mot de passe")} type="password" value={pw2} onChange={setPw2} req />
          <Button type="submit" icon="lock" kind="s" disabled={pwBusy}>{tr(pwBusy ? 'Enregistrement…' : 'Changer le mot de passe')}</Button>
        </form>
    </>
  );
}

export function Downloads() {
  const { tr } = useI18n();
  const { s, d } = useStore();
  const ids = Object.keys(s.downloads);
  return (
    <Screen>
      <TopBar title={tr("Fiches téléchargées")} back="/profil" />
      <div className="main" style={{ gap: 14 }}>
        <div className="notice"><Icon name="info" size={22} /><div style={{ fontSize: 15 }}>{tr("Ces fiches restent consultables sans connexion. Certaines informations peuvent avoir changé depuis le téléchargement.")}</div></div>
        <div className="row small muted"><Icon name="refresh" size={16} />{tr("Dernière synchronisation : ")}{tr(s.lastSync)}</div>
        {ids.length > 0 && <Button icon="refresh" onClick={() => d({ t: 'syncAll' })}>{tr("Tout mettre à jour")}</Button>}
        {ids.length === 0 && <div className="card center">{tr("Aucune fiche téléchargée. ")}<Link className="link" to="/favoris">{tr("Voir mes favoris")}</Link></div>}
        {ids.map((id) => {
          const p = s.providers.find((x) => x.id === id);
          if (!p) return null;
          return (
            <div key={id} className="card stack" style={{ gap: 10 }}>
              <div><div style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div><div className="small muted zh">{p.cn}</div></div>
              <div className="row small muted"><Icon name="clock" size={16} />{tr("Disponible hors connexion depuis le ")}{tr(s.downloads[id])}</div>
              <div className="grid2">
                <Button kind="s" icon="refresh" onClick={() => { d({ t: 'dl', id }); d({ t: 'dl', id }); }}>{tr("Mettre à jour")}</Button>
                <Button kind="s" icon="trash" onClick={() => d({ t: 'dl', id })}>{tr("Supprimer")}</Button>
              </div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}
