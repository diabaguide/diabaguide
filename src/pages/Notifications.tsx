import { useI18n } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { Button, Icon, Screen, TopBar } from '../ui';
import { marquerLues, useNotifications, type Notification } from '../lib/notifications';
import { iconeNotification, lienNotification, tempsRelatif, titreNotification } from '../lib/notificationsData';

function Temps({ iso }: { iso: string }) {
  const { tr, t } = useI18n();
  const r = tempsRelatif(iso);
  if (r.cle === 'maintenant') return <>{tr("À l’instant")}</>;
  if (r.cle === 'minutes') return <>{t('Il y a {0} min', { 0: r.n })}</>;
  if (r.cle === 'heures') return <>{t('Il y a {0} h', { 0: r.n })}</>;
  return <>{r.texte}</>;
}

function Ligne({ n, nouveau, onOpen }: { n: Notification; nouveau: boolean; onOpen: (n: Notification) => void }) {
  const { tr } = useI18n();
  return (
    <button type="button" className={`notif${nouveau ? ' nouveau' : ''}`} onClick={() => onOpen(n)}>
      <span className="notif-ico"><Icon name={iconeNotification(n.etapeType)} size={22} /></span>
      <span className="notif-txt">
        <strong>{tr(titreNotification(n.etapeType))}</strong>
        {n.colisCodes.length > 0 && <span className="small muted">{tr('Colis')} {n.colisCodes.join(', ')}</span>}
        <span className="small muted"><Temps iso={n.creeLe} /></span>
      </span>
      {nouveau && <span className="notif-point" aria-label={tr("Nouveau")} />}
      <Icon name="chevR" size={18} />
    </button>
  );
}

/** Page « Notifications » : les dernières, les nouvelles en évidence ; ouvrir une notification mène au suivi du lot. */
export function NotificationsPage() {
  const { tr } = useI18n();
  const { s } = useStore();
  const nav = useNavigate();
  const { items, installe, charge } = useNotifications(!!s.user);
  // Les notifications non lues à l'ouverture restent en évidence pendant la visite, puis sont marquées lues.
  const nouvelles = useRef<Set<string> | null>(null);
  const minuteur = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!charge || nouvelles.current) return;
    const ids = items.filter((n) => !n.lu).map((n) => n.id);
    nouvelles.current = new Set(ids);
    // Le minuteur n'est pas annulé quand la liste se rafraîchit : seulement quand on quitte la page.
    if (ids.length > 0) minuteur.current = window.setTimeout(() => { void marquerLues(ids); }, 2000);
  }, [charge, items]);
  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const ouvrir = (n: Notification) => { void marquerLues([n.id]); nav(lienNotification(n.expeditionCode)); };

  return (
    <Screen>
      <TopBar title={tr("Notifications")} back="/mes-envois" />
      <div className="main" style={{ gap: 12 }}>
        {!charge && <p className="muted" role="status">{tr("Chargement…")}</p>}
        {charge && !installe && (
          <div role="status" className="notice"><Icon name="info" size={20} /><span>{tr("Les notifications ne sont pas encore disponibles.")}</span></div>
        )}
        {charge && installe && items.length === 0 && (
          <div className="card stack" style={{ gap: 10, alignItems: 'flex-start' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>{tr("Aucune notification pour le moment")}</h2>
            <p className="small muted" style={{ margin: 0 }}>{tr("Vous serez prévenu ici à chaque étape de vos envois : en transit, arrivé à Dakar, disponible au retrait…")}</p>
            <Button to="/mes-envois" kind="s" icon="box" full={false}>{tr("Voir mes envois")}</Button>
          </div>
        )}
        {items.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            {items.map((n) => <Ligne key={n.id} n={n} nouveau={nouvelles.current ? nouvelles.current.has(n.id) : !n.lu} onOpen={ouvrir} />)}
          </div>
        )}
      </div>
    </Screen>
  );
}

/** Bloc de « Mes envois » : les trois dernières notifications non lues, ou rien. */
export function NotificationsRecentes() {
  const { tr, t } = useI18n();
  const { s } = useStore();
  const nav = useNavigate();
  const { items, nonLues } = useNotifications(!!s.user);
  const aVoir = items.filter((n) => !n.lu).slice(0, 3);
  if (aVoir.length === 0) return null;
  return (
    <section className="card stack notifs-recentes" style={{ gap: 10 }} aria-label={tr("Notifications")}>
      <div className="row" style={{ justifyContent: 'space-between', gap: 10 }}>
        <h2 style={{ fontSize: 17, margin: 0 }}><Icon name="bell" size={20} /> {t('Nouveau sur vos envois ({0})', { 0: nonLues })}</h2>
        <Link className="link small" to="/notifications">{tr("Tout voir")}</Link>
      </div>
      {aVoir.map((n) => <Ligne key={n.id} n={n} nouveau onOpen={(x) => { void marquerLues([x.id]); nav(lienNotification(x.expeditionCode)); }} />)}
    </section>
  );
}
