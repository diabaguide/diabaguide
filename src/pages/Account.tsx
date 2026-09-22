import { useI18n } from '../i18n';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { catLabel, type Provider } from '../data';
import { useOnline, useStore, type LocPref } from '../store';
import { isTeamRole, signOut } from '../lib/auth';
import { Button, DemoNote, Icon, RadioCard, Screen, StoredPhoto, Tag, TopBar } from '../ui';
import { LangSwitch } from './Access';

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
  return (
    <Screen>
      <TopBar title={tr("Profil")} />
      <div className="main" style={{ gap: 20 }}>
        <div className="card row" style={{ padding: 16, gap: 14 }}>
          <span className="avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 20 }}>{tr(initials)}</span>
          <div><div style={{ fontWeight: 700, fontSize: 18 }}>{s.user?.name}</div><div className="small muted">{s.user?.email}</div></div>
        </div>
        <section className="stack"><h2 className="row" style={{ fontSize: 17 }}><Icon name="globe" size={20} />{tr("Langue")}</h2><LangSwitch />
          
        </section>
        <section className="card" style={{ padding: 0 }}>
          <Link className="listrow" to="/profil/telechargements"><Icon name="download" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Fiches téléchargées")}</div><div className="small muted">{tr(Object.keys(s.downloads).length)} {tr(" fiche(s) disponibles hors connexion")}</div></div><Icon name="chevR" size={20} /></Link>
          <Link className="listrow" to="/contributions"><Icon name="pen" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Mes contributions")}</div><div className="small muted">{tr(s.proposals.filter((p) => p.status === 'Complément demandé').length)} {tr(" complément demandé")}</div></div><Icon name="chevR" size={20} /></Link>
          {isTeamRole(s.user?.role) && <Link className="listrow" to="/equipe"><Icon name="shield" /><div className="grow"><div style={{ fontWeight: 600 }}>{tr("Espace équipe Diaba")}</div></div><Icon name="chevR" size={20} /></Link>}
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
