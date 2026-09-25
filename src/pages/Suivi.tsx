import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useI18n } from '../i18n';
import { useStore } from '../store';
import { Button, Field, Icon, KV, Screen, TopBar } from '../ui';
import {
  CODE_LOT, FRET_LABEL, STATUTS, STATUT_LABEL, fetchSuiviPublic, normaliserCode,
  type Statut, type SuiviPublic,
} from '../lib/fret';
import { whatsappUrl } from '../lib/shopping';

/* ------------------------------------------------------------------ */
/* Suivi public d'un lot — route « /suivi » et « /suivi/:code »        */
/*                                                                    */
/* Accessible SANS compte (le client resté à Dakar n'a pas            */
/* l'application) et AVEC compte : la route vit hors des deux gardes. */
/* Le code du lot est le secret partagé : il suffit pour voir         */
/* l'avancement, et rien d'autre. La page n'affiche que ce que rend   */
/* `suivi_public` : jamais le voyageur, ses articles ni les notes.     */
/* ------------------------------------------------------------------ */

const LOCALE: Record<string, string> = { fr: 'fr-FR', en: 'en-GB', zh: 'zh-CN', ar: 'ar' };

function useJour() {
  const { lang } = useI18n();
  return (iso: string | null | undefined) => {
    if (!iso) return '';
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(LOCALE[lang] ?? 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  };
}

/** Statut écrit en toutes lettres : jamais signalé par la couleur seule. */
function StatutTag({ statut }: { statut: Statut }) {
  const { tr } = useI18n();
  const ton = statut === 'livre' ? 'ok' : statut === 'preparation' ? 'muted' : '';
  return <span className={`tag${ton ? ` tag-${ton}` : ''}`}><Icon name="truck" size={15} sw={2} />{tr(STATUT_LABEL[statut])}</span>;
}

/** Formulaire de saisie du code (seul, ou sous un résultat pour chercher un autre lot). */
function Recherche({ initial = '' }: { initial?: string }) {
  const { tr } = useI18n();
  const nav = useNavigate();
  const [code, setCode] = useState(initial);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const c = normaliserCode(code);
    if (!CODE_LOT.test(c)) { setErr('Le code a la forme DIA-2026-0001.'); return; }
    setErr(null);
    nav(`/suivi/${c}`);
  };

  return (
    <form onSubmit={submit} noValidate className="stack" style={{ gap: 12 }}>
      <Field id="suivi-code" label={tr("Code du lot")} value={code} onChange={setCode}
        placeholder="DIA-2026-0001" error={err} hint={tr("Le code figure sur l’étiquette du lot et dans le message de l’équipe Diaba.")} />
      <Button type="submit" icon="search">{tr("Suivre ce lot")}</Button>
    </form>
  );
}

function Resultat({ suivi }: { suivi: SuiviPublic }) {
  const { tr, t } = useI18n();
  const jour = useJour();
  const [copie, setCopie] = useState(false);
  const lien = `${window.location.origin}/suivi/${suivi.code}`;
  const atteint = STATUTS.indexOf(suivi.statut);

  /* Date de la dernière étape connue pour chaque statut de la frise. */
  const dateDe = (s: Statut) => {
    const e = [...suivi.etapes].reverse().find((x) => x.statut === s);
    return e ? jour(e.survenuLe) : '';
  };

  const copier = async () => {
    try { await navigator.clipboard.writeText(lien); setCopie(true); setTimeout(() => setCopie(false), 2500); }
    catch { /* presse-papiers refusé : le lien reste visible et sélectionnable */ }
  };

  const tel = suivi.transitaire?.telephone.replace(/[^\d+]/g, '') ?? '';
  const waTransitaire = tel ? `https://wa.me/${tel.replace(/^\+/, '')}?text=${encodeURIComponent(t('Bonjour, je suis le lot {0} (Diaba Guide).', { 0: suivi.code }))}` : '';

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card sec" aria-labelledby="suivi-titre">
        <div className="display" id="suivi-titre" style={{ fontSize: 26 }}>{suivi.code}</div>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
          <StatutTag statut={suivi.statut} />
          <span className="small muted">{tr(FRET_LABEL[suivi.fret])}</span>
        </div>
        <div className="stack" style={{ gap: 10, marginTop: 14 }}>
          <KV k="Trajet">{t('{0} → Dakar', { 0: suivi.origine })}</KV>
          <KV k="Départ">{jour(suivi.departLe) || undefined}</KV>
          {suivi.arriveeLe
            ? <KV k="Arrivée">{jour(suivi.arriveeLe)}</KV>
            : <KV k="Arrivée prévue">{jour(suivi.arriveePrevue) || undefined}</KV>}
        </div>
      </section>

      <section className="card sec" aria-labelledby="suivi-frise">
        <h2 id="suivi-frise"><Icon name="route" size={20} />{tr("Avancement")}</h2>
        <ol className="timeline" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {STATUTS.map((s, i) => {
            const fait = i <= atteint;
            return (
              <li key={s} className={`st ${fait ? 'on' : ''}`} aria-current={i === atteint ? 'step' : undefined}>
                <span className="dot">{fait && <Icon name="check" size={16} sw={3} />}</span>
                <div>
                  <div style={{ fontWeight: i === atteint ? 800 : fait ? 700 : 500 }}>{tr(STATUT_LABEL[s])}</div>
                  <div className="small muted">{fait ? (dateDe(s) || tr("Étape franchie")) : tr("À venir")}</div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="card sec" aria-labelledby="suivi-hist">
        <h2 id="suivi-hist"><Icon name="history" size={20} />{tr("Historique du lot")}</h2>
        {suivi.etapes.length === 0
          ? <p className="muted">{tr("Aucune étape publiée pour le moment.")}</p>
          : (
            <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0, gap: 12 }}>
              {[...suivi.etapes].reverse().map((e, i) => (
                <li key={`${e.statut}-${e.survenuLe}-${i}`}>
                  <strong>{tr(STATUT_LABEL[e.statut])}</strong>
                  {e.estime && <span className="tag tag-muted" style={{ marginInlineStart: 6 }}>{tr("Estimé")}</span>}
                  <div className="small muted">{jour(e.survenuLe)}{e.lieu ? ` · ${e.lieu}` : ''}</div>
                  {e.note && <div className="small">{e.note}</div>}
                </li>
              ))}
            </ul>
          )}
      </section>

      {suivi.transitaire && (
        <section className="card sec" aria-labelledby="suivi-transitaire">
          <h2 id="suivi-transitaire"><Icon name="ship" size={20} />{tr("Transitaire")}</h2>
          <p style={{ margin: 0, fontWeight: 700 }}>{suivi.transitaire.nom}</p>
          {tel && (
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              <Button kind="s" icon="phone" full={false} href={`tel:${tel}`}>{tr("Appeler")}</Button>
              <Button kind="g" icon="chat" full={false} href={waTransitaire}>{tr("WhatsApp")}</Button>
            </div>
          )}
        </section>
      )}

      <section className="card sec" aria-labelledby="suivi-partage">
        <h2 id="suivi-partage"><Icon name="share" size={20} />{tr("Partager le suivi")}</h2>
        <p className="small muted" style={{ marginTop: 0 }}>{tr("Toute personne qui a ce lien voit l’avancement du lot, sans compte.")}</p>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button kind="s" icon={copie ? 'check' : 'copy'} full={false} onClick={() => void copier()}>
            {tr(copie ? 'Lien copié' : 'Copier le lien')}
          </Button>
          <Button kind="g" icon="chat" full={false}
            href={whatsappUrl(t('Suivi du lot {0} : {1}', { 0: suivi.code, 1: lien }))}>{tr("Envoyer par WhatsApp")}</Button>
        </div>
      </section>

      <div className="notice" role="note">
        <Icon name="lock" size={20} />
        <span>{tr("Cette page ne montre ni le nom du voyageur, ni le détail des marchandises.")}</span>
      </div>
    </div>
  );
}

export function Suivi() {
  const { tr } = useI18n();
  const { s } = useStore();
  const { code: param } = useParams();
  const code = param ? normaliserCode(param) : '';
  const [etat, setEtat] = useState<
    { k: 'vide' } | { k: 'charge' } | { k: 'absent' } | { k: 'erreur'; msg: string } | { k: 'ok'; suivi: SuiviPublic }
  >({ k: code ? 'charge' : 'vide' });

  useEffect(() => {
    if (!code) { setEtat({ k: 'vide' }); return; }
    let vivant = true;
    setEtat({ k: 'charge' });
    fetchSuiviPublic(code).then((r) => {
      if (!vivant) return;
      if (r.error) setEtat({ k: 'erreur', msg: r.error });
      else if (!r.suivi) setEtat({ k: 'absent' });
      else setEtat({ k: 'ok', suivi: r.suivi });
    });
    return () => { vivant = false; };
  }, [code]);

  const connecte = !!s.user;

  return (
    <Screen nav={connecte}>
      <TopBar title={tr("Suivi de lot")} back={connecte ? -1 : '/'} />
      <div className="main" style={{ gap: 18 }}>
        {etat.k === 'vide' && (
          <>
            <p className="muted" style={{ margin: 0 }}>{tr("Saisissez le code du lot pour voir où en est votre marchandise entre la Chine et Dakar.")}</p>
            <Recherche />
          </>
        )}
        {etat.k === 'charge' && <p className="muted" role="status" aria-live="polite">{tr("Chargement…")}</p>}
        {etat.k === 'absent' && (
          <>
            <div role="alert" className="notice err">
              <Icon name="alert" size={20} sw={2} />
              <span>{tr("Aucun lot ne correspond à ce code. Vérifiez-le sur l’étiquette ou auprès de l’équipe Diaba.")}</span>
            </div>
            <Recherche initial={code} />
          </>
        )}
        {etat.k === 'erreur' && (
          <>
            <div role="alert" className="notice err"><Icon name="alert" size={20} sw={2} /><span>{tr(etat.msg)}</span></div>
            <Recherche initial={code} />
          </>
        )}
        {etat.k === 'ok' && <Resultat suivi={etat.suivi} />}
      </div>
    </Screen>
  );
}
